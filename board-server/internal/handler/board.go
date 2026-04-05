package handler

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/superclaw/board-server/internal/parser"
	"github.com/superclaw/board-server/internal/store"
)

// BoardHandler handles board-level API endpoints.
type BoardHandler struct {
	Store    *store.Store
	BoardDir string
}

// GetBoard returns the full board state grouped by phase.
func (h *BoardHandler) GetBoard(w http.ResponseWriter, r *http.Request) {
	board, err := h.Store.GetBoard()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(board)
}

// AgentInfo represents a persistent agent's status.
type AgentInfo struct {
	Name         string `json:"name"`
	Status       string `json:"status"`
	LastRun      string `json:"last_run"`
	NextEligible string `json:"next_eligible"`
	AgentType    string `json:"type"`
}

// GetAgents reads agent task files from .superclaw/agents/.
func (h *BoardHandler) GetAgents(w http.ResponseWriter, r *http.Request) {
	agentsDir := filepath.Join(filepath.Dir(h.BoardDir), "agents")
	entries, err := os.ReadDir(agentsDir)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]AgentInfo{})
		return
	}

	var agents []AgentInfo
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
			continue
		}
		path := filepath.Join(agentsDir, entry.Name())
		task, err := parser.ParseFile(path)
		if err != nil {
			continue
		}
		agents = append(agents, AgentInfo{
			Name:   strings.TrimSuffix(entry.Name(), ".md"),
			Status: extractField(task.Content, "status"),
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(agents)
}

func extractField(content, field string) string {
	for _, line := range strings.Split(content, "\n") {
		if strings.HasPrefix(strings.TrimSpace(line), field+":") {
			parts := strings.SplitN(line, ":", 2)
			if len(parts) == 2 {
				return strings.TrimSpace(parts[1])
			}
		}
	}
	return "unknown"
}
