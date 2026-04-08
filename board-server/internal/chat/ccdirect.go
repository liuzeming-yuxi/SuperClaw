package chat

import (
	"bufio"
	"context"
	"fmt"
	"os/exec"
	"strings"
)

// CCDirectBackend communicates with Claude Code via cc-delegate.
type CCDirectBackend struct {
	delegatePath string // /root/.openclaw/workspace/bin/cc-delegate.mjs
}

// NewCCDirectBackend creates a new CC direct backend.
func NewCCDirectBackend(delegatePath string) *CCDirectBackend {
	if delegatePath == "" {
		delegatePath = "/root/.openclaw/workspace/bin/cc-delegate.mjs"
	}
	return &CCDirectBackend{delegatePath: delegatePath}
}

// Stream sends a prompt via cc-delegate and streams stdout back.
// isNew indicates whether to use "session start" or "session continue".
func (b *CCDirectBackend) Stream(ctx context.Context, sessionName, cwd, prompt string, isNew bool, onChunk func(string)) (string, error) {
	var args []string
	if isNew {
		args = []string{b.delegatePath, "session", "start",
			"--name", sessionName,
			"--cwd", cwd,
			"--model", "opus",
			"--prompt", prompt,
		}
	} else {
		args = []string{b.delegatePath, "session", "continue",
			"--name", sessionName,
			"--cwd", cwd,
			"--prompt", prompt,
		}
	}

	cmd := exec.CommandContext(ctx, "node", args...)

	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return "", fmt.Errorf("创建 stdout pipe 失败: %w", err)
	}

	if err := cmd.Start(); err != nil {
		return "", fmt.Errorf("启动 cc-delegate 失败: %w", err)
	}

	var fullReply strings.Builder
	scanner := bufio.NewScanner(stdout)
	scanner.Buffer(make([]byte, 0, 64*1024), 1024*1024)
	for scanner.Scan() {
		line := scanner.Text()
		fullReply.WriteString(line)
		fullReply.WriteString("\n")
		onChunk(line + "\n")
	}

	if err := cmd.Wait(); err != nil {
		// If we got output, return it despite the error
		if fullReply.Len() > 0 {
			return fullReply.String(), nil
		}
		return "", fmt.Errorf("cc-delegate 执行失败: %w", err)
	}

	return fullReply.String(), nil
}
