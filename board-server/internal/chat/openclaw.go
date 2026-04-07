package chat

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// OpenClawBackend communicates with the OpenClaw Gateway API.
type OpenClawBackend struct {
	baseURL string // http://127.0.0.1:18789
	token   string
}

// NewOpenClawBackend creates a new OpenClaw backend.
func NewOpenClawBackend(baseURL, token string) *OpenClawBackend {
	return &OpenClawBackend{baseURL: baseURL, token: token}
}

// Stream sends messages to the OpenClaw API and streams back the response.
// onChunk is called for each delta content piece. Returns the full reply.
func (b *OpenClawBackend) Stream(ctx context.Context, sessionKey string, messages []Message, onChunk func(string)) (string, error) {
	// Build OpenAI-format messages
	type chatMsg struct {
		Role    string `json:"role"`
		Content string `json:"content"`
	}
	apiMessages := make([]chatMsg, 0, len(messages))
	for _, m := range messages {
		apiMessages = append(apiMessages, chatMsg{Role: m.Role, Content: m.Content})
	}

	body := map[string]interface{}{
		"model":    "openclaw/default",
		"messages": apiMessages,
		"stream":   true,
	}
	bodyJSON, err := json.Marshal(body)
	if err != nil {
		return "", fmt.Errorf("序列化请求失败: %w", err)
	}

	req, err := http.NewRequestWithContext(ctx, "POST", b.baseURL+"/v1/chat/completions", bytes.NewReader(bodyJSON))
	if err != nil {
		return "", fmt.Errorf("创建请求失败: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+b.token)
	if sessionKey != "" {
		req.Header.Set("x-openclaw-session-key", sessionKey)
	}

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("请求 OpenClaw 失败: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		respBody, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("OpenClaw 返回 %d: %s", resp.StatusCode, string(respBody))
	}

	// Read SSE stream
	var fullReply strings.Builder
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		if !strings.HasPrefix(line, "data: ") {
			continue
		}
		data := strings.TrimPrefix(line, "data: ")
		if data == "[DONE]" {
			break
		}

		var chunk struct {
			Choices []struct {
				Delta struct {
					Content string `json:"content"`
				} `json:"delta"`
			} `json:"choices"`
		}
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			continue
		}
		if len(chunk.Choices) > 0 && chunk.Choices[0].Delta.Content != "" {
			content := chunk.Choices[0].Delta.Content
			fullReply.WriteString(content)
			onChunk(content)
		}
	}

	return fullReply.String(), scanner.Err()
}
