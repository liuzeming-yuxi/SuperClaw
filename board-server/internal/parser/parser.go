package parser

import (
	"bufio"
	"fmt"
	"os"
	"strings"
)

// Task represents a parsed task file.
type Task struct {
	ID            string `json:"id"`
	Slug          string `json:"slug"`
	Title         string `json:"title"`
	Phase         string `json:"phase"`
	Priority      string `json:"priority"`
	Type          string `json:"type"`
	Tier          string `json:"tier"`
	Assignee      string `json:"assignee"`
	Created       string `json:"created"`
	Updated       string `json:"updated"`
	BlockedReason string `json:"blocked_reason"`
	Parent        string `json:"parent"`
	SpecPath      string `json:"spec_path"`
	PlanPath      string `json:"plan_path"`
	Content       string `json:"content,omitempty"`
	FilePath      string `json:"file_path"`
}

// ParseFile reads a task markdown file and extracts frontmatter + body.
func ParseFile(path string) (*Task, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("open %s: %w", path, err)
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	var (
		inFrontmatter bool
		frontmatter   []string
		body          []string
		dashes        int
	)

	for scanner.Scan() {
		line := scanner.Text()
		if strings.TrimSpace(line) == "---" {
			dashes++
			if dashes == 1 {
				inFrontmatter = true
				continue
			}
			if dashes == 2 {
				inFrontmatter = false
				continue
			}
		}
		if inFrontmatter {
			frontmatter = append(frontmatter, line)
		} else if dashes >= 2 {
			body = append(body, line)
		}
	}
	if err := scanner.Err(); err != nil {
		return nil, fmt.Errorf("scan %s: %w", path, err)
	}

	task := &Task{FilePath: path}
	for _, line := range frontmatter {
		key, val := parseYAMLLine(line)
		switch key {
		case "id":
			task.ID = val
		case "slug":
			task.Slug = val
		case "created":
			task.Created = val
		case "updated":
			task.Updated = val
		case "assignee":
			task.Assignee = val
		case "priority":
			task.Priority = val
		case "type":
			task.Type = val
		case "tier":
			task.Tier = val
		case "phase":
			task.Phase = val
		case "blocked_reason":
			task.BlockedReason = val
		case "parent":
			task.Parent = val
		case "spec_path":
			task.SpecPath = val
		case "plan_path":
			task.PlanPath = val
		}
	}

	task.Content = strings.TrimSpace(strings.Join(body, "\n"))

	// Extract title from first markdown heading
	for _, line := range body {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "# ") {
			task.Title = strings.TrimPrefix(trimmed, "# ")
			break
		}
	}
	if task.Title == "" {
		task.Title = task.Slug
	}

	return task, nil
}

func parseYAMLLine(line string) (string, string) {
	idx := strings.Index(line, ":")
	if idx < 0 {
		return "", ""
	}
	key := strings.TrimSpace(line[:idx])
	val := strings.TrimSpace(line[idx+1:])
	val = strings.Trim(val, `"'`)
	return key, val
}
