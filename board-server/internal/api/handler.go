package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"

	"github.com/go-chi/chi/v5"

	"github.com/superclaw/board-server/internal/board"
	"github.com/superclaw/board-server/internal/chat"
	"github.com/superclaw/board-server/internal/config"
	"github.com/superclaw/board-server/internal/ws"
)

type Handler struct {
	SCRoot     string
	Hub        *ws.Hub
	ChatConfig chat.Config

	chatMu   sync.Mutex
	managers map[string]*chat.Manager // projectPath -> Manager
}

// getChatManager returns or creates a chat manager for a project.
func (h *Handler) getChatManager(proj *config.Project) *chat.Manager {
	h.chatMu.Lock()
	defer h.chatMu.Unlock()
	if h.managers == nil {
		h.managers = make(map[string]*chat.Manager)
	}
	if m, ok := h.managers[proj.Path]; ok {
		return m
	}
	m := chat.NewManager(proj.Path, h.Hub, h.ChatConfig)
	h.managers[proj.Path] = m
	return m
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
		TaskCount   int            `json:"task_count"`
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

	// Initialize .superclaw directory structure in the project path
	scDir := filepath.Join(p.Path, ".superclaw")
	subDirs := []string{
		"board/inbox", "board/aligning", "board/planned", "board/executing",
		"board/reviewing", "board/done", "board/blocked",
		"config", "specs", "plans", "progress", "reports", "context",
		"agents",
	}
	for _, d := range subDirs {
		os.MkdirAll(filepath.Join(scDir, d), 0755)
	}
	// Create default board.yaml
	boardYaml := filepath.Join(scDir, "config", "board.yaml")
	if _, err := os.Stat(boardYaml); os.IsNotExist(err) {
		os.WriteFile(boardYaml, []byte("next_id: 1\ndefault_tier: T2\n"), 0644)
	}
	// Create default project-context.md
	ctxFile := filepath.Join(scDir, "context", "project-context.md")
	if _, err := os.Stat(ctxFile); os.IsNotExist(err) {
		os.WriteFile(ctxFile, []byte(fmt.Sprintf("# %s\n\n%s\n", p.Name, p.Description)), 0644)
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

	var params board.CreateTaskParams
	if err := json.NewDecoder(r.Body).Decode(&params); err != nil {
		writeError(w, 400, "invalid json")
		return
	}
	if params.Title == "" {
		writeError(w, 400, "title is required")
		return
	}

	scRoot := proj.Path + "/.superclaw"
	task, err := board.CreateTask(scRoot, params)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}

	h.Hub.Broadcast(ws.Message{Type: "task_created", Data: task})
	writeJSON(w, 201, task)
}

// PATCH /api/projects/{projectId}/tasks/{taskId}
func (h *Handler) UpdateTask(w http.ResponseWriter, r *http.Request) {
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

	var updates map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&updates); err != nil {
		writeError(w, 400, "invalid json")
		return
	}

	task, err := board.UpdateTaskMetadata(proj.Path, taskID, updates)
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}

	h.Hub.Broadcast(ws.Message{Type: "task_updated", Data: task})
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
		To    string `json:"to"`
		Note  string `json:"note"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, 400, "invalid json")
		return
	}

	// Support both "phase" and "to" field names
	targetPhase := body.Phase
	if targetPhase == "" {
		targetPhase = body.To
	}
	if targetPhase == "" {
		writeError(w, 400, "phase or to is required")
		return
	}

	if err := board.MoveTask(proj.Path, taskID, targetPhase, body.Note); err != nil {
		writeError(w, 400, err.Error())
		return
	}

	h.Hub.Broadcast(ws.Message{Type: "task_moved", Data: map[string]string{
		"task_id": taskID,
		"phase":   targetPhase,
	}})

	writeJSON(w, 200, map[string]string{"status": "ok"})
}

// POST /api/projects/{projectId}/tasks/{taskId}/sessions
func (h *Handler) AddSession(w http.ResponseWriter, r *http.Request) {
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
		Agent string `json:"agent"`
		Phase string `json:"phase"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, 400, "invalid json")
		return
	}
	if body.Agent == "" {
		writeError(w, 400, "agent is required")
		return
	}
	if body.Phase == "" {
		body.Phase = "executing"
	}

	session, err := board.AddSession(proj.Path, taskID, body.Agent, body.Phase)
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}

	h.Hub.Broadcast(ws.Message{Type: "session_created", Data: session})
	writeJSON(w, 201, session)
}

// PATCH /api/projects/{projectId}/tasks/{taskId}/sessions/{sessionId}
func (h *Handler) UpdateSession(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectId")
	taskID := chi.URLParam(r, "taskId")
	sessionID := chi.URLParam(r, "sessionId")

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
		Status string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, 400, "invalid json")
		return
	}
	if body.Status == "" {
		writeError(w, 400, "status is required")
		return
	}

	if err := board.UpdateSession(proj.Path, taskID, sessionID, body.Status); err != nil {
		writeError(w, 400, err.Error())
		return
	}

	h.Hub.Broadcast(ws.Message{Type: "session_updated", Data: map[string]string{
		"task_id":    taskID,
		"session_id": sessionID,
		"status":     body.Status,
	}})

	writeJSON(w, 200, map[string]string{"status": "ok"})
}

// GET /api/projects/{projectId}/sessions
func (h *Handler) ListSessions(w http.ResponseWriter, r *http.Request) {
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

	sessions, err := board.ListActiveSessions(proj.Path)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	if sessions == nil {
		sessions = []board.TaskSession{}
	}
	writeJSON(w, 200, sessions)
}

// GET /api/projects/{projectId}/tasks/{taskId}/artifacts/{type}
func (h *Handler) GetArtifact(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectId")
	taskID := chi.URLParam(r, "taskId")
	artType := chi.URLParam(r, "artifactType")

	proj, err := h.findProject(projectID)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	if proj == nil {
		writeError(w, 404, "project not found")
		return
	}

	content, path, exists, err := board.GetArtifact(proj.Path, taskID, artType)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}

	writeJSON(w, 200, map[string]interface{}{
		"content": content,
		"path":    path,
		"exists":  exists,
	})
}

// PUT /api/projects/{projectId}/tasks/{taskId}/artifacts/{type}
func (h *Handler) PutArtifact(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectId")
	taskID := chi.URLParam(r, "taskId")
	artType := chi.URLParam(r, "artifactType")

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
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, 400, "invalid json")
		return
	}

	path, err := board.PutArtifact(proj.Path, taskID, artType, body.Content)
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}

	h.Hub.Broadcast(ws.Message{Type: "artifact_updated", Data: map[string]string{
		"task_id": taskID,
		"type":    artType,
		"path":    path,
	}})

	writeJSON(w, 200, map[string]interface{}{
		"path":   path,
		"status": "ok",
	})
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

// POST /api/filesystem/mkdir
func (h *Handler) MkdirFilesystem(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Path string `json:"path"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, 400, "invalid request")
		return
	}
	if req.Path == "" {
		writeError(w, 400, "path is required")
		return
	}
	cleanPath := filepath.Clean(req.Path)
	if !strings.HasPrefix(cleanPath, "/") {
		writeError(w, 400, "path must be absolute")
		return
	}
	if err := os.MkdirAll(cleanPath, 0755); err != nil {
		writeError(w, 500, "cannot create directory: "+err.Error())
		return
	}
	writeJSON(w, 200, map[string]string{"path": cleanPath})
}

// POST /api/filesystem/rename
func (h *Handler) RenameFilesystem(w http.ResponseWriter, r *http.Request) {
	var req struct {
		OldPath string `json:"old_path"`
		NewName string `json:"new_name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, 400, "invalid request")
		return
	}
	if req.OldPath == "" || req.NewName == "" {
		writeError(w, 400, "old_path and new_name are required")
		return
	}
	cleanPath := filepath.Clean(req.OldPath)
	if !strings.HasPrefix(cleanPath, "/") {
		writeError(w, 400, "path must be absolute")
		return
	}
	newPath := filepath.Join(filepath.Dir(cleanPath), req.NewName)
	if err := os.Rename(cleanPath, newPath); err != nil {
		writeError(w, 500, "cannot rename: "+err.Error())
		return
	}
	writeJSON(w, 200, map[string]string{"path": newPath})
}

// GET /api/filesystem/browse?path=/root
func (h *Handler) BrowseFilesystem(w http.ResponseWriter, r *http.Request) {
	requestedPath := r.URL.Query().Get("path")
	if requestedPath == "" {
		requestedPath = "/root"
	}

	cleanPath := filepath.Clean(requestedPath)

	if !strings.HasPrefix(cleanPath, "/") {
		writeError(w, 400, "path must be absolute")
		return
	}

	info, err := os.Stat(cleanPath)
	if err != nil {
		writeError(w, 404, "path not found")
		return
	}
	if !info.IsDir() {
		writeError(w, 400, "path is not a directory")
		return
	}

	realPath, err := filepath.EvalSymlinks(cleanPath)
	if err != nil {
		writeError(w, 400, "cannot resolve path")
		return
	}

	entries, err := os.ReadDir(realPath)
	if err != nil {
		writeError(w, 500, "cannot read directory")
		return
	}

	type DirEntry struct {
		Name   string `json:"name"`
		Path   string `json:"path"`
		HasGit bool   `json:"has_git"`
	}

	dirs := make([]DirEntry, 0)
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		name := entry.Name()
		if strings.HasPrefix(name, ".") {
			continue
		}
		fullPath := filepath.Join(realPath, name)
		_, gitErr := os.Stat(filepath.Join(fullPath, ".git"))
		dirs = append(dirs, DirEntry{
			Name:   name,
			Path:   fullPath,
			HasGit: gitErr == nil,
		})
	}

	sort.Slice(dirs, func(i, j int) bool {
		if dirs[i].HasGit != dirs[j].HasGit {
			return dirs[i].HasGit
		}
		return dirs[i].Name < dirs[j].Name
	})

	parent := filepath.Dir(realPath)
	if parent == realPath {
		parent = ""
	}

	writeJSON(w, 200, map[string]interface{}{
		"current":     realPath,
		"parent":      parent,
		"directories": dirs,
	})
}

// POST /api/projects/{projectId}/tasks/{taskId}/chat/send
// Send a user message and stream back the assistant reply via SSE.
func (h *Handler) ChatSend(w http.ResponseWriter, r *http.Request) {
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
		Content string `json:"content"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, 400, "invalid json")
		return
	}
	if body.Content == "" {
		writeError(w, 400, "content is required")
		return
	}

	// Set SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")

	flusher, ok := w.(http.Flusher)
	if !ok {
		writeError(w, 500, "streaming not supported")
		return
	}

	mgr := h.getChatManager(proj)

	onChunk := func(text string) {
		data, _ := json.Marshal(map[string]string{"content": text})
		fmt.Fprintf(w, "data: %s\n\n", data)
		flusher.Flush()
	}

	_, err = mgr.SendMessage(r.Context(), taskID, body.Content, onChunk)
	if err != nil {
		errData, _ := json.Marshal(map[string]string{"error": err.Error()})
		fmt.Fprintf(w, "data: %s\n\n", errData)
		flusher.Flush()
	}

	fmt.Fprintf(w, "data: [DONE]\n\n")
	flusher.Flush()
}

// GET /api/projects/{projectId}/tasks/{taskId}/chat/history
// Get chat message history and session state.
func (h *Handler) ChatHistory(w http.ResponseWriter, r *http.Request) {
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

	mgr := h.getChatManager(proj)
	messages, err := mgr.GetHistory(taskID)
	if err != nil {
		writeError(w, 500, err.Error())
		return
	}
	if messages == nil {
		messages = []chat.Message{}
	}

	session := mgr.GetSession(taskID)
	var sessionData interface{}
	if session != nil {
		sessionData = map[string]string{
			"phase":   session.Phase,
			"backend": session.Backend,
		}
	} else {
		sessionData = map[string]string{
			"phase":   "align",
			"backend": "openclaw",
		}
	}

	writeJSON(w, 200, map[string]interface{}{
		"messages": messages,
		"session":  sessionData,
	})
}

// POST /api/projects/{projectId}/tasks/{taskId}/chat/switch
// Switch the chat backend for a task.
func (h *Handler) ChatSwitch(w http.ResponseWriter, r *http.Request) {
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
		Backend string `json:"backend"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeError(w, 400, "invalid json")
		return
	}

	mgr := h.getChatManager(proj)
	if err := mgr.SwitchBackend(taskID, body.Backend); err != nil {
		writeError(w, 400, err.Error())
		return
	}

	writeJSON(w, 200, map[string]string{"ok": "true"})
}
