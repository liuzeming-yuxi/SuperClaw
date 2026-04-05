package store

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"sync"

	"github.com/superclaw/board-server/internal/parser"
	_ "modernc.org/sqlite"
)

// Store manages task metadata in SQLite.
type Store struct {
	db *sql.DB
	mu sync.RWMutex
}

// New creates a new in-memory SQLite store.
func New() (*Store, error) {
	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	s := &Store{db: db}
	if err := s.createTable(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Store) createTable() error {
	_, err := s.db.Exec(`CREATE TABLE IF NOT EXISTS tasks (
		id TEXT PRIMARY KEY,
		slug TEXT,
		title TEXT,
		phase TEXT,
		priority TEXT,
		type TEXT,
		tier TEXT,
		assignee TEXT,
		created TEXT,
		updated TEXT,
		blocked_reason TEXT,
		file_path TEXT
	)`)
	return err
}

// RebuildFromDir rebuilds the SQLite cache from board directory files.
func (s *Store) RebuildFromDir(boardDir string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, err := s.db.Exec("DELETE FROM tasks"); err != nil {
		return fmt.Errorf("clear tasks: %w", err)
	}

	phases := []string{"inbox", "aligning", "planned", "executing", "reviewing", "done", "blocked"}
	for _, phase := range phases {
		dir := filepath.Join(boardDir, phase)
		entries, err := os.ReadDir(dir)
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return fmt.Errorf("read dir %s: %w", dir, err)
		}
		for _, entry := range entries {
			if entry.IsDir() || filepath.Ext(entry.Name()) != ".md" {
				continue
			}
			path := filepath.Join(dir, entry.Name())
			task, err := parser.ParseFile(path)
			if err != nil {
				continue // skip unparseable files
			}
			task.Phase = phase // directory is source of truth for phase
			if err := s.upsertTask(task); err != nil {
				continue
			}
		}
	}
	return nil
}

func (s *Store) upsertTask(t *parser.Task) error {
	_, err := s.db.Exec(`INSERT OR REPLACE INTO tasks
		(id, slug, title, phase, priority, type, tier, assignee, created, updated, blocked_reason, file_path)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		t.ID, t.Slug, t.Title, t.Phase, t.Priority, t.Type, t.Tier, t.Assignee,
		t.Created, t.Updated, t.BlockedReason, t.FilePath)
	return err
}

// BoardState represents the full board grouped by phase.
type BoardState struct {
	Phases map[string][]TaskSummary `json:"phases"`
}

// TaskSummary is a compact task representation for board view.
type TaskSummary struct {
	ID       string `json:"id"`
	Slug     string `json:"slug"`
	Title    string `json:"title"`
	Phase    string `json:"phase"`
	Priority string `json:"priority"`
	Type     string `json:"type"`
	Tier     string `json:"tier"`
	Assignee string `json:"assignee"`
	Updated  string `json:"updated"`
}

// GetBoard returns all tasks grouped by phase.
func (s *Store) GetBoard() (*BoardState, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	rows, err := s.db.Query("SELECT id, slug, title, phase, priority, type, tier, assignee, updated FROM tasks ORDER BY id")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	board := &BoardState{
		Phases: map[string][]TaskSummary{
			"inbox": {}, "aligning": {}, "planned": {}, "executing": {},
			"reviewing": {}, "done": {}, "blocked": {},
		},
	}
	for rows.Next() {
		var t TaskSummary
		if err := rows.Scan(&t.ID, &t.Slug, &t.Title, &t.Phase, &t.Priority, &t.Type, &t.Tier, &t.Assignee, &t.Updated); err != nil {
			continue
		}
		board.Phases[t.Phase] = append(board.Phases[t.Phase], t)
	}
	return board, nil
}

// GetTasks returns tasks matching optional filters.
func (s *Store) GetTasks(phase, tier, priority string) ([]TaskSummary, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	query := "SELECT id, slug, title, phase, priority, type, tier, assignee, updated FROM tasks WHERE 1=1"
	var args []interface{}
	if phase != "" {
		query += " AND phase = ?"
		args = append(args, phase)
	}
	if tier != "" {
		query += " AND tier = ?"
		args = append(args, tier)
	}
	if priority != "" {
		query += " AND priority = ?"
		args = append(args, priority)
	}
	query += " ORDER BY id"

	rows, err := s.db.Query(query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var tasks []TaskSummary
	for rows.Next() {
		var t TaskSummary
		if err := rows.Scan(&t.ID, &t.Slug, &t.Title, &t.Phase, &t.Priority, &t.Type, &t.Tier, &t.Assignee, &t.Updated); err != nil {
			continue
		}
		tasks = append(tasks, t)
	}
	return tasks, nil
}

// GetTaskByID returns a task by ID, including its file path for content reading.
func (s *Store) GetTaskByID(id string) (*TaskSummary, string, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var t TaskSummary
	var filePath string
	err := s.db.QueryRow(
		"SELECT id, slug, title, phase, priority, type, tier, assignee, updated, file_path FROM tasks WHERE id = ?", id,
	).Scan(&t.ID, &t.Slug, &t.Title, &t.Phase, &t.Priority, &t.Type, &t.Tier, &t.Assignee, &t.Updated, &filePath)
	if err != nil {
		return nil, "", err
	}
	return &t, filePath, nil
}

// Close closes the database connection.
func (s *Store) Close() error {
	return s.db.Close()
}
