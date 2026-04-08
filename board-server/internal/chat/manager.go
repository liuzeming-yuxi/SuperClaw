package chat

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/superclaw/board-server/internal/ws"
)

// Session holds the state for a task's chat session.
type Session struct {
	TaskID        string `json:"task_id"`
	Backend       string `json:"backend"` // "openclaw" | "cc-direct"
	Phase         string `json:"phase"`   // "align" | "plan" | "execute" | "verify" | "deliver"
	OCSessionKey  string `json:"-"`
	CCSessionName string `json:"-"`
	isNew         bool   // whether superclaw session has been started
}

// Manager manages all chat sessions across tasks.
type Manager struct {
	projectPath string
	hub         *ws.Hub
	store       *Store

	openclawBackend *OpenClawBackend
	ccDirectBackend *CCDirectBackend

	sessions map[string]*Session // taskID -> Session
	mu       sync.RWMutex
}

// Config holds configuration for the chat manager.
type Config struct {
	OpenClawBaseURL string
	OpenClawToken   string
	SuperclawPath  string
}

// NewManager creates a new chat manager.
func NewManager(projectPath string, hub *ws.Hub, cfg Config) *Manager {
	m := &Manager{
		projectPath:     projectPath,
		hub:             hub,
		store:           NewStore(projectPath),
		openclawBackend: NewOpenClawBackend(cfg.OpenClawBaseURL, cfg.OpenClawToken),
		ccDirectBackend: NewCCDirectBackend(cfg.SuperclawPath),
		sessions:        make(map[string]*Session),
	}
	return m
}

// getOrCreateSession returns the session for a task, creating one if needed.
func (m *Manager) getOrCreateSession(taskID string) *Session {
	m.mu.Lock()
	defer m.mu.Unlock()
	if s, ok := m.sessions[taskID]; ok {
		return s
	}
	s := &Session{
		TaskID:        taskID,
		Backend:       "openclaw",
		Phase:         "align",
		OCSessionKey:  fmt.Sprintf("superclaw-%s", taskID),
		CCSessionName: fmt.Sprintf("superclaw-%s", taskID),
		isNew:         true,
	}
	m.sessions[taskID] = s
	return s
}

// GetSession returns the session for a task.
func (m *Manager) GetSession(taskID string) *Session {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.sessions[taskID]
}

// GetHistory returns message history for a task.
func (m *Manager) GetHistory(taskID string) ([]Message, error) {
	return m.store.LoadMessages(taskID)
}

// SwitchBackend switches the chat backend for a task.
func (m *Manager) SwitchBackend(taskID, backend string) error {
	if backend != "openclaw" && backend != "cc-direct" {
		return fmt.Errorf("未知后端: %s", backend)
	}
	session := m.getOrCreateSession(taskID)
	m.mu.Lock()
	session.Backend = backend
	m.mu.Unlock()
	log.Printf("[chat] 任务 %s 切换后端为 %s", taskID, backend)
	return nil
}

// SendMessage processes a user message and streams back the assistant reply.
// onChunk is called for each streaming chunk.
func (m *Manager) SendMessage(ctx context.Context, taskID, content string, onChunk func(string)) (string, error) {
	session := m.getOrCreateSession(taskID)

	// Save user message
	userMsg := Message{
		ID:        fmt.Sprintf("msg-%d", time.Now().UnixNano()),
		Role:      "user",
		Content:   content,
		Timestamp: time.Now(),
		Phase:     session.Phase,
	}
	if err := m.store.AppendMessage(taskID, userMsg); err != nil {
		return "", fmt.Errorf("保存用户消息失败: %w", err)
	}

	// Broadcast user message via WebSocket
	m.hub.Broadcast(ws.Message{Type: "chat_message", Data: map[string]interface{}{
		"task_id": taskID,
		"message": userMsg,
	}})

	// Broadcast stream start
	m.hub.Broadcast(ws.Message{Type: "chat_stream_start", Data: map[string]string{
		"task_id": taskID,
	}})

	// Call appropriate backend
	var fullReply string
	var err error

	m.mu.RLock()
	backend := session.Backend
	m.mu.RUnlock()

	switch backend {
	case "openclaw":
		messages, loadErr := m.store.LoadMessages(taskID)
		if loadErr != nil {
			messages = []Message{userMsg}
		}
		fullReply, err = m.openclawBackend.Stream(ctx, session.OCSessionKey, messages, func(chunk string) {
			onChunk(chunk)
			m.hub.Broadcast(ws.Message{Type: "chat_stream_chunk", Data: map[string]string{
				"task_id": taskID,
				"content": chunk,
			}})
		})

	case "cc-direct":
		m.mu.RLock()
		isNew := session.isNew
		m.mu.RUnlock()

		fullReply, err = m.ccDirectBackend.Stream(ctx, session.CCSessionName, m.projectPath, content, isNew, func(chunk string) {
			onChunk(chunk)
			m.hub.Broadcast(ws.Message{Type: "chat_stream_chunk", Data: map[string]string{
				"task_id": taskID,
				"content": chunk,
			}})
		})

		if isNew {
			m.mu.Lock()
			session.isNew = false
			m.mu.Unlock()
		}

	default:
		return "", fmt.Errorf("未知后端: %s", backend)
	}

	// Broadcast stream end
	m.hub.Broadcast(ws.Message{Type: "chat_stream_end", Data: map[string]string{
		"task_id": taskID,
	}})

	if err != nil {
		return "", fmt.Errorf("后端调用失败: %w", err)
	}

	// Save assistant message
	assistantMsg := Message{
		ID:        fmt.Sprintf("msg-%d", time.Now().UnixNano()),
		Role:      "assistant",
		Content:   fullReply,
		Timestamp: time.Now(),
		Phase:     session.Phase,
	}
	if err := m.store.AppendMessage(taskID, assistantMsg); err != nil {
		log.Printf("[chat] 保存助手消息失败: %v", err)
	}

	// Broadcast the complete assistant message
	m.hub.Broadcast(ws.Message{Type: "chat_message", Data: map[string]interface{}{
		"task_id": taskID,
		"message": assistantMsg,
	}})

	return fullReply, nil
}

// SetPhase updates the current phase of a task's chat session.
func (m *Manager) SetPhase(taskID, phase string) {
	session := m.getOrCreateSession(taskID)
	m.mu.Lock()
	oldPhase := session.Phase
	session.Phase = phase
	m.mu.Unlock()

	m.hub.Broadcast(ws.Message{Type: "chat_phase_changed", Data: map[string]string{
		"task_id": taskID,
		"from":    oldPhase,
		"to":      phase,
	}})

	log.Printf("[chat] 任务 %s 阶段变更: %s → %s", taskID, oldPhase, phase)
}
