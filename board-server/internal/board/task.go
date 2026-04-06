package board

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

var Phases = []string{"inbox", "aligning", "planned", "executing", "reviewing", "blocked", "done"}

type TaskFrontmatter struct {
	ID            string `yaml:"id" json:"id"`
	Slug          string `yaml:"slug" json:"slug"`
	Created       string `yaml:"created" json:"created"`
	Updated       string `yaml:"updated" json:"updated"`
	Assignee      string `yaml:"assignee" json:"assignee"`
	Priority      string `yaml:"priority" json:"priority"`
	Type          string `yaml:"type" json:"type"`
	Tier          string `yaml:"tier" json:"tier"`
	Phase         string `yaml:"phase" json:"phase"`
	BlockedReason string `yaml:"blocked_reason" json:"blocked_reason"`
	Parent        string `yaml:"parent" json:"parent"`
	SpecPath      string `yaml:"spec_path" json:"spec_path"`
	PlanPath      string `yaml:"plan_path" json:"plan_path"`
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
			if strings.HasPrefix(entry.Name(), taskID+"-") {
				return ParseTaskFile(filepath.Join(phaseDir, entry.Name()))
			}
		}
	}
	return nil, fmt.Errorf("task %s not found", taskID)
}

// MoveTask moves a task file to a new phase directory and updates frontmatter
func MoveTask(projectPath, taskID, newPhase string) error {
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

	// Read original file content
	content, err := os.ReadFile(task.FilePath)
	if err != nil {
		return err
	}

	// Update phase in content
	oldPhase := fmt.Sprintf("phase: %s", task.Phase)
	newPhaseStr := fmt.Sprintf("phase: %s", newPhase)
	newContent := strings.Replace(string(content), oldPhase, newPhaseStr, 1)

	// Write to new location
	boardDir := filepath.Join(projectPath, ".superclaw", "board")
	newDir := filepath.Join(boardDir, newPhase)
	if err := os.MkdirAll(newDir, 0755); err != nil {
		return err
	}

	newPath := filepath.Join(newDir, filepath.Base(task.FilePath))
	if err := os.WriteFile(newPath, []byte(newContent), 0644); err != nil {
		return err
	}

	// Remove old file
	return os.Remove(task.FilePath)
}
