package chat

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// Message represents a single chat message.
type Message struct {
	ID        string    `json:"id"`
	Role      string    `json:"role"`    // "user" | "assistant" | "system"
	Content   string    `json:"content"`
	Timestamp time.Time `json:"timestamp"`
	Phase     string    `json:"phase"`
}

// Store handles message persistence using JSONL files.
type Store struct {
	baseDir string // .superclaw/chat/
}

// NewStore creates a new message store.
func NewStore(projectPath string) *Store {
	dir := filepath.Join(projectPath, ".superclaw", "chat")
	os.MkdirAll(dir, 0755)
	return &Store{baseDir: dir}
}

// filePath returns the JSONL file path for a task.
func (s *Store) filePath(taskID string) string {
	return filepath.Join(s.baseDir, taskID+".jsonl")
}

// LoadMessages reads all messages for a task from disk.
func (s *Store) LoadMessages(taskID string) ([]Message, error) {
	f, err := os.Open(s.filePath(taskID))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	defer f.Close()

	var messages []Message
	scanner := bufio.NewScanner(f)
	scanner.Buffer(make([]byte, 0, 1024*1024), 10*1024*1024)
	for scanner.Scan() {
		var msg Message
		if err := json.Unmarshal(scanner.Bytes(), &msg); err != nil {
			continue // skip malformed lines
		}
		messages = append(messages, msg)
	}
	return messages, scanner.Err()
}

// AppendMessage appends a message to the JSONL file.
func (s *Store) AppendMessage(taskID string, msg Message) error {
	f, err := os.OpenFile(s.filePath(taskID), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return fmt.Errorf("打开聊天记录失败: %w", err)
	}
	defer f.Close()

	data, err := json.Marshal(msg)
	if err != nil {
		return err
	}
	_, err = fmt.Fprintf(f, "%s\n", data)
	return err
}
