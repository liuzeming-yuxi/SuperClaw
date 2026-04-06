package board

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

var Phases = []string{"inbox", "aligning", "planned", "executing", "reviewing", "blocked", "done"}

type TaskSession struct {
	ID      string `yaml:"id" json:"id"`
	Agent   string `yaml:"agent" json:"agent"`
	Phase   string `yaml:"phase" json:"phase"`
	Status  string `yaml:"status" json:"status"`
	Started string `yaml:"started" json:"started"`
	Updated string `yaml:"updated" json:"updated"`
	TaskID  string `yaml:"-" json:"task_id"`
}

type TaskArtifacts struct {
	Spec           string `yaml:"spec" json:"spec"`
	Plan           string `yaml:"plan" json:"plan"`
	Progress       string `yaml:"progress" json:"progress"`
	VerifyReport   string `yaml:"verify_report" json:"verify_report"`
	DeliverSummary string `yaml:"deliver_summary" json:"deliver_summary"`
}

type TaskFrontmatter struct {
	ID            string        `yaml:"id" json:"id"`
	Slug          string        `yaml:"slug" json:"slug"`
	Created       string        `yaml:"created" json:"created"`
	Updated       string        `yaml:"updated" json:"updated"`
	Assignee      string        `yaml:"assignee" json:"assignee"`
	Type          string        `yaml:"type" json:"type"`
	Tier          string        `yaml:"tier" json:"tier"`
	Phase         string        `yaml:"phase" json:"phase"`
	PreviousPhase string        `yaml:"previous_phase" json:"previous_phase"`
	BlockedReason string        `yaml:"blocked_reason" json:"blocked_reason"`
	Parent        string        `yaml:"parent" json:"parent"`
	SpecPath      string        `yaml:"spec_path" json:"spec_path"`
	PlanPath      string        `yaml:"plan_path" json:"plan_path"`
	Sessions      []TaskSession `yaml:"sessions" json:"sessions"`
	Artifacts     TaskArtifacts `yaml:"artifacts" json:"artifacts"`
	Verify        string        `yaml:"verify" json:"verify"`
}

type Task struct {
	TaskFrontmatter
	Title    string `json:"title"`
	Body     string `json:"body"`
	FilePath string `json:"-"`
}

// ParseTaskFile reads a markdown task file and extracts frontmatter + title
func ParseTaskFile(path string) (*Task, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	var (
		inFrontmatter bool
		frontLines    []string
		bodyLines     []string
		pastFront     bool
		title         string
	)

	for scanner.Scan() {
		line := scanner.Text()
		if !inFrontmatter && !pastFront && strings.TrimSpace(line) == "---" {
			inFrontmatter = true
			continue
		}
		if inFrontmatter && strings.TrimSpace(line) == "---" {
			inFrontmatter = false
			pastFront = true
			continue
		}
		if inFrontmatter {
			frontLines = append(frontLines, line)
			continue
		}
		if pastFront {
			if title == "" && strings.HasPrefix(strings.TrimSpace(line), "# ") {
				title = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(line), "# "))
				continue
			}
			bodyLines = append(bodyLines, line)
		}
	}

	var fm TaskFrontmatter
	if err := yaml.Unmarshal([]byte(strings.Join(frontLines, "\n")), &fm); err != nil {
		return nil, fmt.Errorf("parse frontmatter of %s: %w", path, err)
	}

	return &Task{
		TaskFrontmatter: fm,
		Title:           title,
		Body:            strings.TrimSpace(strings.Join(bodyLines, "\n")),
		FilePath:        path,
	}, nil
}

// ListTasks reads all tasks from a project's board directory
func ListTasks(projectPath string) ([]Task, error) {
	boardDir := filepath.Join(projectPath, ".superclaw", "board")
	var tasks []Task

	for _, phase := range Phases {
		phaseDir := filepath.Join(boardDir, phase)
		entries, err := os.ReadDir(phaseDir)
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return nil, err
		}
		for _, entry := range entries {
			if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
				continue
			}
			task, err := ParseTaskFile(filepath.Join(phaseDir, entry.Name()))
			if err != nil {
				continue // skip unparseable files
			}
			tasks = append(tasks, *task)
		}
	}

	sort.Slice(tasks, func(i, j int) bool {
		return tasks[i].ID < tasks[j].ID
	})
	return tasks, nil
}

// GetTask finds a specific task by ID
func GetTask(projectPath, taskID string) (*Task, error) {
	boardDir := filepath.Join(projectPath, ".superclaw", "board")
	for _, phase := range Phases {
		phaseDir := filepath.Join(boardDir, phase)
		entries, err := os.ReadDir(phaseDir)
		if err != nil {
			continue
		}
		for _, entry := range entries {
			if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".md") {
				continue
			}
			if strings.HasPrefix(entry.Name(), taskID+"-") || entry.Name() == taskID+".md" {
				return ParseTaskFile(filepath.Join(phaseDir, entry.Name()))
			}
		}
	}
	return nil, fmt.Errorf("task %s not found", taskID)
}

// RewriteTaskFile rewrites a task file with updated frontmatter, preserving body
func RewriteTaskFile(task *Task) error {
	fm, err := yaml.Marshal(&task.TaskFrontmatter)
	if err != nil {
		return fmt.Errorf("marshal frontmatter: %w", err)
	}

	var sb strings.Builder
	sb.WriteString("---\n")
	sb.Write(fm)
	sb.WriteString("---\n\n")
	sb.WriteString("# ")
	sb.WriteString(task.Title)
	sb.WriteString("\n\n")
	sb.WriteString(task.Body)
	sb.WriteString("\n")

	return os.WriteFile(task.FilePath, []byte(sb.String()), 0644)
}

// MoveTask moves a task file to a new phase directory, updates frontmatter, and appends history
func MoveTask(projectPath, taskID, newPhase, note string) error {
	task, err := GetTask(projectPath, taskID)
	if err != nil {
		return err
	}

	// Validate phase
	valid := false
	for _, p := range Phases {
		if p == newPhase {
			valid = true
			break
		}
	}
	if !valid {
		return fmt.Errorf("invalid phase: %s", newPhase)
	}

	if task.Phase == newPhase {
		return nil // already in target phase
	}

	oldPhase := task.Phase
	ts := time.Now().UTC().Format(time.RFC3339)

	// Update frontmatter
	task.PreviousPhase = oldPhase
	task.Phase = newPhase
	task.Updated = ts

	// Append to history in body
	if note == "" {
		note = fmt.Sprintf("移动: %s → %s", oldPhase, newPhase)
	}
	historyLine := fmt.Sprintf("| %s | %s | system | %s |", ts, newPhase, note)
	task.Body = appendHistory(task.Body, historyLine)

	// Write updated content to new location
	boardDir := filepath.Join(projectPath, ".superclaw", "board")
	newDir := filepath.Join(boardDir, newPhase)
	if err := os.MkdirAll(newDir, 0755); err != nil {
		return err
	}

	oldPath := task.FilePath
	task.FilePath = filepath.Join(newDir, filepath.Base(task.FilePath))
	if err := RewriteTaskFile(task); err != nil {
		return err
	}

	// Remove old file (only if path changed)
	if oldPath != task.FilePath {
		return os.Remove(oldPath)
	}
	return nil
}

// UpdateTaskMetadata updates specific frontmatter fields on a task
func UpdateTaskMetadata(projectPath, taskID string, updates map[string]interface{}) (*Task, error) {
	task, err := GetTask(projectPath, taskID)
	if err != nil {
		return nil, err
	}

	ts := time.Now().UTC().Format(time.RFC3339)
	task.Updated = ts

	for key, val := range updates {
		switch key {
		case "title":
			if v, ok := val.(string); ok {
				task.Title = v
			}
		case "type":
			if v, ok := val.(string); ok {
				task.Type = v
			}
		case "tier":
			if v, ok := val.(string); ok {
				task.Tier = v
			}
		case "assignee":
			if v, ok := val.(string); ok {
				task.Assignee = v
			}
		case "blocked_reason":
			if v, ok := val.(string); ok {
				task.BlockedReason = v
			}
		case "description":
			if v, ok := val.(string); ok {
				task.Body = rebuildBody(v, task.Body)
			}
		case "verify":
			if v, ok := val.(string); ok {
				task.Verify = v
			}
		}
	}

	if err := RewriteTaskFile(task); err != nil {
		return nil, err
	}
	return task, nil
}

// AddSession adds a new session to a task and returns the session
func AddSession(projectPath, taskID, agent, phase string) (*TaskSession, error) {
	task, err := GetTask(projectPath, taskID)
	if err != nil {
		return nil, err
	}

	ts := time.Now().UTC().Format(time.RFC3339)
	sessionID := fmt.Sprintf("s%s-%d", task.ID, len(task.Sessions)+1)

	session := TaskSession{
		ID:      sessionID,
		Agent:   agent,
		Phase:   phase,
		Status:  "running",
		Started: ts,
		Updated: ts,
	}

	task.Sessions = append(task.Sessions, session)
	task.Updated = ts

	historyLine := fmt.Sprintf("| %s | %s | %s | 新建会话 %s |", ts, task.Phase, agent, sessionID)
	task.Body = appendHistory(task.Body, historyLine)

	if err := RewriteTaskFile(task); err != nil {
		return nil, err
	}

	session.TaskID = task.ID
	return &session, nil
}

// UpdateSession updates a session's status in a task
func UpdateSession(projectPath, taskID, sessionID, status string) error {
	task, err := GetTask(projectPath, taskID)
	if err != nil {
		return err
	}

	ts := time.Now().UTC().Format(time.RFC3339)
	found := false
	for i := range task.Sessions {
		if task.Sessions[i].ID == sessionID {
			task.Sessions[i].Status = status
			task.Sessions[i].Updated = ts
			found = true
			break
		}
	}
	if !found {
		return fmt.Errorf("session %s not found in task %s", sessionID, taskID)
	}

	task.Updated = ts
	return RewriteTaskFile(task)
}

// GetArtifact reads an artifact file for a task
func GetArtifact(projectPath, taskID, artifactType string) (string, string, bool, error) {
	task, err := GetTask(projectPath, taskID)
	if err != nil {
		return "", "", false, err
	}

	artPath := getArtifactPath(task, artifactType)
	if artPath == "" {
		return "", "", false, nil
	}

	// Resolve relative to project path
	fullPath := artPath
	if !filepath.IsAbs(artPath) {
		fullPath = filepath.Join(projectPath, artPath)
	}

	content, err := os.ReadFile(fullPath)
	if err != nil {
		if os.IsNotExist(err) {
			return "", artPath, false, nil
		}
		return "", artPath, false, err
	}
	return string(content), artPath, true, nil
}

// PutArtifact writes an artifact file and updates the task's artifacts field
func PutArtifact(projectPath, taskID, artifactType, content string) (string, error) {
	task, err := GetTask(projectPath, taskID)
	if err != nil {
		return "", err
	}

	scRoot := filepath.Join(projectPath, ".superclaw")
	var relPath string
	switch artifactType {
	case "spec":
		relPath = fmt.Sprintf(".superclaw/specs/%s-spec.md", taskID)
	case "plan":
		relPath = fmt.Sprintf(".superclaw/plans/%s-plan.md", taskID)
	case "progress":
		relPath = fmt.Sprintf(".superclaw/progress/%s-progress.md", taskID)
	case "verify_report":
		relPath = fmt.Sprintf(".superclaw/reports/%s-verify.md", taskID)
	case "deliver_summary":
		relPath = fmt.Sprintf(".superclaw/reports/%s-deliver.md", taskID)
	default:
		return "", fmt.Errorf("unknown artifact type: %s", artifactType)
	}

	fullPath := filepath.Join(projectPath, relPath)
	dir := filepath.Dir(fullPath)
	if err := os.MkdirAll(dir, 0755); err != nil {
		return "", err
	}

	if err := os.WriteFile(fullPath, []byte(content), 0644); err != nil {
		return "", err
	}

	// Update task artifacts field
	switch artifactType {
	case "spec":
		task.Artifacts.Spec = relPath
	case "plan":
		task.Artifacts.Plan = relPath
	case "progress":
		task.Artifacts.Progress = relPath
	case "verify_report":
		task.Artifacts.VerifyReport = relPath
	case "deliver_summary":
		task.Artifacts.DeliverSummary = relPath
	}

	// Also update legacy spec_path/plan_path for compat
	if artifactType == "spec" {
		task.SpecPath = relPath
	} else if artifactType == "plan" {
		task.PlanPath = relPath
	}

	_ = scRoot
	task.Updated = time.Now().UTC().Format(time.RFC3339)
	if err := RewriteTaskFile(task); err != nil {
		return "", err
	}

	return relPath, nil
}

// ListActiveSessions scans all tasks and returns sessions with status "running" or "pending"
func ListActiveSessions(projectPath string) ([]TaskSession, error) {
	tasks, err := ListTasks(projectPath)
	if err != nil {
		return nil, err
	}

	var sessions []TaskSession
	for _, t := range tasks {
		for _, s := range t.Sessions {
			if s.Status == "running" || s.Status == "pending" {
				s.TaskID = t.ID
				sessions = append(sessions, s)
			}
		}
	}

	sort.Slice(sessions, func(i, j int) bool {
		return sessions[i].Started < sessions[j].Started
	})
	return sessions, nil
}

func getArtifactPath(task *Task, artifactType string) string {
	switch artifactType {
	case "spec":
		return task.Artifacts.Spec
	case "plan":
		return task.Artifacts.Plan
	case "progress":
		return task.Artifacts.Progress
	case "verify_report":
		return task.Artifacts.VerifyReport
	case "deliver_summary":
		return task.Artifacts.DeliverSummary
	default:
		return ""
	}
}

func appendHistory(body, line string) string {
	idx := strings.LastIndex(body, "|")
	if idx >= 0 {
		// Find end of last table row
		end := strings.Index(body[idx:], "\n")
		if end >= 0 {
			insertAt := idx + end
			return body[:insertAt] + "\n" + line + body[insertAt:]
		}
		return body + "\n" + line
	}
	// No history table found, append one
	return body + "\n\n## 历史\n\n| Time | Phase | Actor | Note |\n|------|-------|-------|------|\n" + line
}

func rebuildBody(newDescription, oldBody string) string {
	// Replace content between ## 描述 / ## Description and next ## heading
	lines := strings.Split(oldBody, "\n")
	var result []string
	inDesc := false
	descDone := false
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if !descDone && (trimmed == "## Description" || trimmed == "## 描述") {
			result = append(result, line)
			result = append(result, "")
			result = append(result, newDescription)
			result = append(result, "")
			inDesc = true
			continue
		}
		if inDesc && strings.HasPrefix(trimmed, "## ") {
			inDesc = false
			descDone = true
		}
		if !inDesc {
			result = append(result, line)
		}
	}
	return strings.Join(result, "\n")
}
