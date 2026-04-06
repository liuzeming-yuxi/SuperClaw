package api

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/superclaw/board-server/internal/board"
	"github.com/superclaw/board-server/internal/config"
	"github.com/superclaw/board-server/internal/ws"
)

type Handler struct {
	SCRoot string
	Hub    *ws.Hub
}

func (h *Handler) findProject(id string) (*config.Project, error) {
	projects, err := config.LoadProjects(h.SCRoot)
	if err != nil {
		return nil, err
	}
	for _, p := range projects {
		if p.ID == id {
			return &p, nil
		}
	}
	return nil, nil
}

func writeJSON(w http.ResponseWriter, status int, v interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// GET /api/projects
func (h *Handler) ListProjects(w http.ResponseWriter, r *http.Request) {
	projects, err := config.LoadProjects(h.SCRoot)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}

	type ProjectWithStats struct {
		config.Project
		TaskCount int            `json:"task_count"`
		PhaseCounts map[string]int `json:"phase_counts"`
	}

	result := make([]ProjectWithStats, 0, len(projects))
	for _, p := range projects {
		tasks, _ := board.ListTasks(p.Path)
		phaseCounts := make(map[string]int)
		for _, t := range tasks {
			phaseCounts[t.Phase]++
		}
		result = append(result, ProjectWithStats{
			Project:     p,
			TaskCount:   len(tasks),
			PhaseCounts: phaseCounts,
		})
	}
	writeJSON(w, 200, result)
}

// POST /api/projects
func (h *Handler) CreateProject(w http.ResponseWriter, r *http.Request) {
	var p config.Project
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		writeError(w, 400, "invalid json")
		return
	}
	if p.ID == "" || p.Name == "" || p.Path == "" {
		writeError(w, 400, "id, name, and path are required")
		return
	}

	projects, err := config.LoadProjects(h.SCRoot)
	if err != nil {
		projects = []config.Project{}
	}

	for _, existing := range projects {
		if existing.ID == p.ID {
			writeError(w, 409, "project id already exists")
			return
		}
	}

	projects = append(projects, p)
	if err := config.SaveProjects(h.SCRoot, projects); err != nil {
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, 201, p)
}

// GET /api/projects/{projectId}/tasks
func (h *Handler) ListTasks(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectId")
	proj, err := h.findProject(projectID)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	if proj == nil {
		writeError(w, 404, "project not found")
		return
	}

	tasks, err := board.ListTasks(proj.Path)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, tasks)
}

// GET /api/projects/{projectId}/tasks/{taskId}
func (h *Handler) GetTask(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectId")
	taskID := chi.URLParam(r, "taskId")

	proj, err := h.findProject(projectID)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	if proj == nil {
		writeError(w, 404, "project not found")
		return
	}

	task, err := board.GetTask(proj.Path, taskID)
	if err != nil {
		writeError(w, 404, err.Error())
		return
	}
	writeJSON(w, 200, task)
}

// PATCH /api/projects/{projectId}/tasks/{taskId}/move
func (h *Handler) MoveTask(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectId")
	taskID := chi.URLParam(r, "taskId")

	proj, err := h.findProject(projectID)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	if proj == nil {
		writeError(w, 404, "project not found")
		return
	}

	var body struct {
		Phase string `json:"phase"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, 400, "invalid json")
		return
	}

	if err := board.MoveTask(proj.Path, taskID, body.Phase); err != nil {
		writeError(w, 400, err.Error())
		return
	}

	h.Hub.Broadcast(ws.Message{Type: "task_moved", Data: map[string]string{
		"task_id": taskID,
		"phase":   body.Phase,
	}})

	writeJSON(w, 200, map[string]string{"status": "ok"})
}

// POST /api/projects/{projectId}/tasks
func (h *Handler) CreateTask(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectId")
	proj, err := h.findProject(projectID)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	if proj == nil {
		writeError(w, 404, "project not found")
		return
	}

	var body struct {
		Title       string `json:"title"`
		Type        string `json:"type"`
		Priority    string `json:"priority"`
		Tier        string `json:"tier"`
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, 400, "invalid json")
		return
	}
	if body.Title == "" {
		writeError(w, 400, "title is required")
		return
	}

	scRoot := proj.Path + "/.superclaw"
	task, err := board.CreateTask(scRoot, body.Title, body.Type, body.Priority, body.Tier, body.Description)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}

	h.Hub.Broadcast(ws.Message{Type: "task_created", Data: task})
	writeJSON(w, 201, task)
}

// GET /api/projects/{projectId}/sessions
func (h *Handler) ListSessions(w http.ResponseWriter, r *http.Request) {
	// Placeholder: sessions will come from agent integration
	sessions := []map[string]interface{}{
		{
			"id":     "001",
			"agent":  "OpenClaw",
			"status": "aligning",
			"taskId": "003",
			"icon":   "🟢",
		},
		{
			"id":     "002",
			"agent":  "Claude Code",
			"status": "executing",
			"taskId": "002",
			"icon":   "🔵",
		},
	}
	writeJSON(w, 200, sessions)
}

// GET /api/projects/{projectId}/agents
func (h *Handler) ListAgents(w http.ResponseWriter, r *http.Request) {
	agents, err := config.LoadAgents(h.SCRoot)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	writeJSON(w, 200, agents)
}
