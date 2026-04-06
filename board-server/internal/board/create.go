package board

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/superclaw/board-server/internal/config"
)

func CreateTask(scRoot, title, taskType, priority, tier, description string) (*Task, error) {
	cfg, err := config.LoadBoardConfig(scRoot)
	if err != nil {
		return nil, err
	}

	if taskType == "" {
		taskType = "feature"
	}
	if priority == "" {
		priority = cfg.DefaultPriority
	}
	if tier == "" {
		tier = cfg.DefaultTier
	}
	if description == "" {
		description = "No description provided."
	}

	id := fmt.Sprintf("%03d", cfg.NextID)
	slug := strings.ToLower(title)
	slug = strings.ReplaceAll(slug, " ", "-")
	// Simple ASCII-safe slug
	var cleaned []byte
	for _, c := range []byte(slug) {
		if (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' {
			cleaned = append(cleaned, c)
		}
	}
	slug = string(cleaned)
	if slug == "" {
		slug = "task"
	}

	ts := time.Now().UTC().Format(time.RFC3339)

	inboxDir := filepath.Join(scRoot, "board", "inbox")
	if err := os.MkdirAll(inboxDir, 0755); err != nil {
		return nil, err
	}

	filename := fmt.Sprintf("%s-%s.md", id, slug)
	content := fmt.Sprintf(`---
id: "%s"
slug: %s
created: %s
updated: %s
assignee: human
priority: %s
type: %s
tier: %s
phase: inbox
blocked_reason: ""
parent: ""
spec_path: ""
plan_path: ""
---

# %s

## Description

%s

## Acceptance Criteria

- [ ] (to be defined during align phase)

## Verify

`+"```bash"+`
# (to be defined during align phase)
`+"```"+`

## History

| Time | Phase | Actor | Note |
|------|-------|-------|------|
| %s | inbox | human | Created |
`, id, slug, ts, ts, priority, taskType, tier, title, description, ts)

	taskPath := filepath.Join(inboxDir, filename)
	if err := os.WriteFile(taskPath, []byte(content), 0644); err != nil {
		return nil, err
	}

	// Increment next_id
	cfg.NextID++
	if err := config.SaveBoardConfig(scRoot, cfg); err != nil {
		return nil, err
	}

	return &Task{
		TaskFrontmatter: TaskFrontmatter{
			ID:       id,
			Slug:     slug,
			Created:  ts,
			Updated:  ts,
			Assignee: "human",
			Priority: priority,
			Type:     taskType,
			Tier:     tier,
			Phase:    "inbox",
		},
		Title:    title,
		FilePath: taskPath,
	}, nil
}
