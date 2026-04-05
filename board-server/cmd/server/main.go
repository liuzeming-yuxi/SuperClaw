package main

import (
	"flag"
	"fmt"
	"log"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/superclaw/board-server/internal/handler"
	"github.com/superclaw/board-server/internal/store"
	"github.com/superclaw/board-server/internal/watcher"
)

func main() {
	boardDir := flag.String("board-dir", ".superclaw/board", "Path to the board directory")
	port := flag.Int("port", 9876, "Port to bind to")
	flag.Parse()

	// Initialize store
	s, err := store.New()
	if err != nil {
		log.Fatalf("init store: %v", err)
	}
	defer s.Close()

	// Rebuild cache from files
	if err := s.RebuildFromDir(*boardDir); err != nil {
		log.Printf("warning: rebuild from dir: %v", err)
	}

	// Initialize file watcher
	w, err := watcher.New(*boardDir)
	if err != nil {
		log.Printf("warning: file watcher disabled: %v", err)
	} else {
		defer w.Close()
	}

	// Initialize WebSocket hub
	hub := handler.NewHub()
	if w != nil {
		go hub.RunEventLoop(w)
		// Rebuild store on file changes
		go func() {
			for range w.Events {
				s.RebuildFromDir(*boardDir)
			}
		}()
	}

	// Handlers
	boardH := &handler.BoardHandler{Store: s, BoardDir: *boardDir}
	taskH := &handler.TaskHandler{Store: s, BoardDir: *boardDir}

	// Router
	r := chi.NewRouter()
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   []string{"http://localhost:*", "http://127.0.0.1:*"},
		AllowedMethods:   []string{"GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Content-Type"},
		AllowCredentials: true,
	}))

	r.Get("/api/board", boardH.GetBoard)
	r.Get("/api/tasks", taskH.GetTasks)
	r.Get("/api/tasks/{id}", taskH.GetTask)
	r.Patch("/api/tasks/{id}/move", taskH.MoveTask)
	r.Get("/api/agents", boardH.GetAgents)
	r.Get("/ws", hub.HandleWS)

	addr := fmt.Sprintf("localhost:%d", *port)
	log.Printf("SuperClaw Board Server listening on %s", addr)
	log.Printf("Board directory: %s", *boardDir)
	if err := http.ListenAndServe(addr, r); err != nil {
		log.Fatalf("server: %v", err)
	}
}
