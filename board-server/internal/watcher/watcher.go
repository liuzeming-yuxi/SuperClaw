package watcher

import (
	"log"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/fsnotify/fsnotify"
)

// EventType represents a board change event type.
type EventType string

const (
	TaskCreated EventType = "task_created"
	TaskUpdated EventType = "task_updated"
	TaskMoved   EventType = "task_moved"
	BoardReload EventType = "board_reload"
)

// Event represents a file system change event on the board.
type Event struct {
	Type   EventType `json:"type"`
	TaskID string    `json:"taskId,omitempty"`
	From   string    `json:"from,omitempty"`
	To     string    `json:"to,omitempty"`
}

// Watcher monitors the board directory for changes.
type Watcher struct {
	fsw      *fsnotify.Watcher
	boardDir string
	Events   chan Event
	done     chan struct{}
	mu       sync.Mutex
	pending  map[string]time.Time
}

// New creates a new file watcher on the given board directory.
func New(boardDir string) (*Watcher, error) {
	fsw, err := fsnotify.NewWatcher()
	if err != nil {
		return nil, err
	}

	w := &Watcher{
		fsw:      fsw,
		boardDir: boardDir,
		Events:   make(chan Event, 100),
		done:     make(chan struct{}),
		pending:  make(map[string]time.Time),
	}

	// Watch each phase subdirectory
	phases := []string{"inbox", "aligning", "planned", "executing", "reviewing", "done", "blocked"}
	for _, phase := range phases {
		dir := filepath.Join(boardDir, phase)
		if err := fsw.Add(dir); err != nil {
			log.Printf("watcher: skipping %s: %v", dir, err)
		}
	}

	go w.loop()
	return w, nil
}

func (w *Watcher) loop() {
	debounce := time.NewTicker(50 * time.Millisecond)
	defer debounce.Stop()

	for {
		select {
		case event, ok := <-w.fsw.Events:
			if !ok {
				return
			}
			if !strings.HasSuffix(event.Name, ".md") {
				continue
			}
			w.mu.Lock()
			w.pending[event.Name] = time.Now()
			w.mu.Unlock()

		case <-debounce.C:
			w.mu.Lock()
			if len(w.pending) == 0 {
				w.mu.Unlock()
				continue
			}
			// Process all pending events
			now := time.Now()
			for path, ts := range w.pending {
				if now.Sub(ts) < 50*time.Millisecond {
					continue // still debouncing
				}
				delete(w.pending, path)
				w.emitEvent(path)
			}
			w.mu.Unlock()

		case err, ok := <-w.fsw.Errors:
			if !ok {
				return
			}
			log.Printf("watcher error: %v", err)

		case <-w.done:
			return
		}
	}
}

func (w *Watcher) emitEvent(path string) {
	// Extract phase from directory path
	rel, err := filepath.Rel(w.boardDir, path)
	if err != nil {
		w.Events <- Event{Type: BoardReload}
		return
	}
	parts := strings.SplitN(rel, string(filepath.Separator), 2)
	if len(parts) < 2 {
		w.Events <- Event{Type: BoardReload}
		return
	}

	phase := parts[0]
	filename := parts[1]
	taskID := extractTaskID(filename)

	// Simple heuristic: emit task_updated for the phase we see
	w.Events <- Event{
		Type:   TaskUpdated,
		TaskID: taskID,
		To:     phase,
	}
}

func extractTaskID(filename string) string {
	// filename like "001-add-dark-mode.md"
	name := strings.TrimSuffix(filename, ".md")
	parts := strings.SplitN(name, "-", 2)
	if len(parts) > 0 {
		return parts[0]
	}
	return name
}

// Close stops the watcher.
func (w *Watcher) Close() error {
	close(w.done)
	return w.fsw.Close()
}
