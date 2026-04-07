package pipeline

import (
	"bufio"
	"bytes"
	"context"
	"fmt"
	"log"
	"os"
	"os/exec"
	"strings"
	"time"
)

// Executor wraps acpx invocation for Claude Code execution.
type Executor struct {
	acpxPath string
	envFile  string
}

// NewExecutor creates a new CC executor.
func NewExecutor(acpxPath, envFile string) *Executor {
	if acpxPath == "" {
		acpxPath = "/root/.nvm/versions/node/v22.22.0/bin/acpx"
	}
	if envFile == "" {
		envFile = "/home/testclaude/cc-delegate/.env"
	}
	return &Executor{
		acpxPath: acpxPath,
		envFile:  envFile,
	}
}

// loadEnv reads key=value pairs from the env file.
func (e *Executor) loadEnv() (map[string]string, error) {
	env := make(map[string]string)
	f, err := os.Open(e.envFile)
	if err != nil {
		return env, fmt.Errorf("打开环境文件 %s 失败: %w", e.envFile, err)
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		parts := strings.SplitN(line, "=", 2)
		if len(parts) == 2 {
			env[parts[0]] = parts[1]
		}
	}
	return env, scanner.Err()
}

// Execute runs a CC session via acpx with the given prompt.
// Returns the output text from the CC session.
func (e *Executor) Execute(ctx context.Context, workDir, prompt string) (string, error) {
	// Load environment variables
	envVars, err := e.loadEnv()
	if err != nil {
		log.Printf("[executor] 警告: 无法加载环境文件: %v", err)
	}

	// Set timeout — 10 minutes default
	timeout := 600
	execCtx, cancel := context.WithTimeout(ctx, time.Duration(timeout)*time.Second)
	defer cancel()

	cmd := exec.CommandContext(execCtx, e.acpxPath,
		"--cwd", workDir,
		"--approve-all",
		"--auth-policy", "fail",
		"--non-interactive-permissions", "fail",
		"--format", "text",
		"--timeout", fmt.Sprintf("%d", timeout),
		"claude", "exec", "-p", prompt,
	)

	// Set up environment
	cmd.Env = os.Environ()
	for k, v := range envVars {
		cmd.Env = append(cmd.Env, fmt.Sprintf("%s=%s", k, v))
	}
	// Ensure node is in PATH
	nodeBin := "/root/.nvm/versions/node/v22.22.0/bin"
	pathFound := false
	for i, env := range cmd.Env {
		if strings.HasPrefix(env, "PATH=") {
			if !strings.Contains(env, nodeBin) {
				cmd.Env[i] = env + ":" + nodeBin
			}
			pathFound = true
			break
		}
	}
	if !pathFound {
		cmd.Env = append(cmd.Env, "PATH="+nodeBin+":/usr/local/bin:/usr/bin:/bin")
	}

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	log.Printf("[executor] 启动 CC 会话: workDir=%s, promptLen=%d", workDir, len(prompt))

	if err := cmd.Run(); err != nil {
		stderrStr := stderr.String()
		// If we got some output despite the error, return it
		if stdout.Len() > 0 {
			log.Printf("[executor] CC 退出有错误但有输出, stderr: %s", truncate(stderrStr, 200))
			return stdout.String(), nil
		}
		return "", fmt.Errorf("acpx 执行失败: %w\nstderr: %s", err, truncate(stderrStr, 500))
	}

	output := stdout.String()
	log.Printf("[executor] CC 会话完成, outputLen=%d", len(output))
	return output, nil
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}
