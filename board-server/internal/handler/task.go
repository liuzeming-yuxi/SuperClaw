package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/superclaw/board-server/internal/parser"
	"github.com/superclaw/board-server/internal/store"
)

// TaskHandler handles task-level API endpoints.
type TaskHandler struct {
	Store    *store.Store
	BoardDir string
}

// GetTasks lists tasks with optional filters.
func (h *TaskHandler) GetTasks(w http.ResponseWriter, r *http.Request) {
	phase := r.URL.Query().Get("phase")
	tier := r.URL.Query().Get("tier")
	priority := r.URL.Query().Get("priority")

	tasks, err := h.Store.GetTasks(phase, tier, priority)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tasks)
}

// GetTask returns a single task with full content.
func (h *TaskHandler) GetTask(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	_, filePath, err := h.Store.GetTaskByID(id)
	if err != nil {
		http.Error(w, "task not found", http.StatusNotFound)
		return
	}

	task, err := parser.ParseFile(filePath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(task)
}

// MoveRequest is the body for PATCH /api/tasks/:id/move.
type MoveRequest struct {
	To string `json:"to"`
}

// MoveTask moves a task file from one phase directory to another.
func (h *TaskHandler) MoveTask(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var req MoveRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "invalid request body", http.StatusBadRequest)
		return
	}

	validPhases := map[string]bool{
		"inbox": true, "aligning": true, "planned": true,
		"executing": true, "reviewing": true, "done": true, "blocked": true,
	}
	if !validPhases[req.To] {
		http.Error(w, "invalid target phase", http.StatusBadRequest)
		return
	}

	summary, filePath, err := h.Store.GetTaskByID(id)
	if err != nil {
		http.Error(w, "task not found", http.StatusNotFound)
		return
	}

	if summary.Phase == req.To {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "no change"})
		return
	}

	// Read file content
	content, err := os.ReadFile(filePath)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Update phase in frontmatter
	updated := updateFrontmatter(string(content), "phase", req.To)
	updated = updateFrontmatter(updated, "updated", time.Now().UTC().Format(time.RFC3339))

	// Append history entry
	historyLine := fmt.Sprintf("| %s | %s | board-ui | 移动: %s → %s |",
		time.Now().UTC().Format("2006-01-02T15:04"), req.To, summary.Phase, req.To)
	updated = appendHistory(updated, historyLine)

	// Move file
	filename := filepath.Base(filePath)
	newPath := filepath.Join(h.BoardDir, req.To, filename)

	if err := os.WriteFile(filePath, []byte(updated), 0644); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if err := os.Rename(filePath, newPath); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	// Rebuild store
	h.Store.RebuildFromDir(h.BoardDir)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "moved", "from": summary.Phase, "to": req.To})
}

func updateFrontmatter(content, key, value string) string {
	lines := strings.Split(content, "\n")
	inFM := false
	dashes := 0
	for i, line := range lines {
		if strings.TrimSpace(line) == "---" {
			dashes++
			if dashes == 1 {
				inFM = true
			} else {
				inFM = false
			}
			continue
		}
		if inFM && strings.HasPrefix(strings.TrimSpace(line), key+":") {
			lines[i] = key + ": " + value
			return strings.Join(lines, "\n")
		}
	}
	return content
}

func appendHistory(content, entry string) string {
	idx := strings.LastIndex(content, "| Time |")
	if idx < 0 {
		return content
	}
	// Find end of history table
	lines := strings.Split(content, "\n")
	lastTableLine := -1
	inHistory := false
	for i, line := range lines {
		if strings.Contains(line, "| Time |") {
			inHistory = true
		}
		if inHistory && strings.HasPrefix(strings.TrimSpace(line), "|") {
			lastTableLine = i
		}
		if inHistory && !strings.HasPrefix(strings.TrimSpace(line), "|") && strings.TrimSpace(line) != "" {
			break
		}
	}
	if lastTableLine >= 0 {
		newLines := make([]string, 0, len(lines)+1)
		newLines = append(newLines, lines[:lastTableLine+1]...)
		newLines = append(newLines, entry)
		newLines = append(newLines, lines[lastTableLine+1:]...)
		return strings.Join(newLines, "\n")
	}
	return content
}
