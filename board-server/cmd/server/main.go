package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/fsnotify/fsnotify"
	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/superclaw/board-server/internal/api"
	"github.com/superclaw/board-server/internal/chat"
	"github.com/superclaw/board-server/internal/ws"
)

func main() {
	// Determine .superclaw root
	scRoot := os.Getenv("SUPERCLAW_ROOT")
	if scRoot == "" {
		// Default: look relative to working directory
		cwd, _ := os.Getwd()
		scRoot = filepath.Join(cwd, ".superclaw")
	}

	log.Printf("SuperClaw board server starting, root: %s", scRoot)

	hub := ws.NewHub()
	handler := &api.Handler{
		SCRoot: scRoot,
		Hub:    hub,
		ChatConfig: chat.Config{
			OpenClawBaseURL: "http://127.0.0.1:18789",
			OpenClawToken:   "130b9e35e8c7e52b3992253f54047d4726ec60c4d23c5ab1",
			CCDelegatePath:  "/root/.openclaw/workspace/bin/cc-delegate.mjs",
		},
	}

	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://192.168.16.30:*", "http://localhost:*", "http://127.0.0.1:*"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Content-Type"},
		AllowCredentials: true,
	}))

	// API routes
	r.Get("/api/projects", handler.ListProjects)
	r.Post("/api/projects", handler.CreateProject)
	r.Get("/api/projects/{projectId}/tasks", handler.ListTasks)
	r.Post("/api/projects/{projectId}/tasks", handler.CreateTask)
	r.Get("/api/projects/{projectId}/tasks/{taskId}", handler.GetTask)
	r.Patch("/api/projects/{projectId}/tasks/{taskId}", handler.UpdateTask)
	r.Patch("/api/projects/{projectId}/tasks/{taskId}/move", handler.MoveTask)
	r.Post("/api/projects/{projectId}/tasks/{taskId}/sessions", handler.AddSession)
	r.Patch("/api/projects/{projectId}/tasks/{taskId}/sessions/{sessionId}", handler.UpdateSession)
	r.Get("/api/projects/{projectId}/tasks/{taskId}/artifacts/{artifactType}", handler.GetArtifact)
	r.Put("/api/projects/{projectId}/tasks/{taskId}/artifacts/{artifactType}", handler.PutArtifact)
	r.Get("/api/projects/{projectId}/sessions", handler.ListSessions)
	r.Get("/api/projects/{projectId}/agents", handler.ListAgents)
	r.Get("/api/filesystem/browse", handler.BrowseFilesystem)
	r.Post("/api/filesystem/mkdir", handler.MkdirFilesystem)
	r.Post("/api/filesystem/rename", handler.RenameFilesystem)

	// Chat routes
	r.Post("/api/projects/{projectId}/tasks/{taskId}/chat/send", handler.ChatSend)
	r.Get("/api/projects/{projectId}/tasks/{taskId}/chat/history", handler.ChatHistory)
	r.Post("/api/projects/{projectId}/tasks/{taskId}/chat/switch", handler.ChatSwitch)

	// WebSocket
	r.Get("/ws", hub.HandleWS)

	// Start file watcher in background
	go startWatcher(scRoot, hub)

	addr := "0.0.0.0:9876"
	log.Printf("Listening on %s", addr)
	if err := http.ListenAndServe(addr, r); err != nil {
		log.Fatal(err)
	}
}

func startWatcher(scRoot string, hub *ws.Hub) {
	boardDir := filepath.Join(scRoot, "board")
	watcher, err := fsnotify.NewWatcher()
	if err != nil {
		log.Printf("fsnotify error: %v", err)
		return
	}

	// Watch all phase directories
	phases := []string{"inbox", "aligning", "planned", "executing", "reviewing", "blocked", "done"}
	for _, phase := range phases {
		dir := filepath.Join(boardDir, phase)
		os.MkdirAll(dir, 0755)
		if err := watcher.Add(dir); err != nil {
			log.Printf("watch error for %s: %v", dir, err)
		}
	}

	log.Printf("Watching board directory: %s", boardDir)
	for {
		select {
		case event, ok := <-watcher.Events:
			if !ok {
				return
			}
			if event.Has(fsnotify.Write) || event.Has(fsnotify.Create) || event.Has(fsnotify.Remove) || event.Has(fsnotify.Rename) {
				hub.Broadcast(ws.Message{
					Type: "board_changed",
					Data: map[string]string{"file": event.Name, "op": event.Op.String()},
				})
			}
		case err, ok := <-watcher.Errors:
			if !ok {
				return
			}
			log.Printf("watcher error: %v", err)
		}
	}
}
