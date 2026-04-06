package board

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/superclaw/board-server/internal/config"
)

type CreateTaskParams struct {
	Title              string   `json:"title"`
	Description        string   `json:"description"`
	Priority           string   `json:"priority"`
	Type               string   `json:"type"`
	Tier               string   `json:"tier"`
	AcceptanceCriteria []string `json:"acceptance_criteria"`
	VerifyCommand      string   `json:"verify_command"`
	VerifyExpect       string   `json:"verify_expect"`
}

func CreateTask(scRoot string, params CreateTaskParams) (*Task, error) {
	cfg, err := config.LoadBoardConfig(scRoot)
	if err != nil {
		return nil, err
	}

	if params.Type == "" {
		params.Type = "feature"
	}
	if params.Priority == "" {
		params.Priority = cfg.DefaultPriority
	}
	if params.Tier == "" {
		params.Tier = cfg.DefaultTier
	}
	if params.Description == "" {
		params.Description = "暂无描述。"
	}

	id := fmt.Sprintf("%03d", cfg.NextID)
	slug := makeSlug(params.Title)

	ts := time.Now().UTC().Format(time.RFC3339)

	inboxDir := filepath.Join(scRoot, "board", "inbox")
	if err := os.MkdirAll(inboxDir, 0755); err != nil {
		return nil, err
	}

	// Build acceptance criteria lines
	acLines := "- [ ] （待对齐阶段定义）"
	if len(params.AcceptanceCriteria) > 0 {
		var lines []string
		for _, ac := range params.AcceptanceCriteria {
			lines = append(lines, fmt.Sprintf("- [ ] %s", ac))
		}
		acLines = strings.Join(lines, "\n")
	}

	// Build verify section
	verifyCmd := "# （待对齐阶段定义）"
	if params.VerifyCommand != "" {
		verifyCmd = params.VerifyCommand
	}
	verifyExpect := ""
	if params.VerifyExpect != "" {
		verifyExpect = fmt.Sprintf("\n**预期输出：** %s", params.VerifyExpect)
	}

	task := &Task{
		TaskFrontmatter: TaskFrontmatter{
			ID:            id,
			Slug:          slug,
			Created:       ts,
			Updated:       ts,
			Assignee:      "human",
			Priority:      params.Priority,
			Type:          params.Type,
			Tier:          params.Tier,
			Phase:         "inbox",
			PreviousPhase: "",
			BlockedReason: "",
			Sessions:      []TaskSession{},
			Artifacts:     TaskArtifacts{},
			VerifyCommand: params.VerifyCommand,
			VerifyExpect:  params.VerifyExpect,
		},
		Title: params.Title,
		Body: fmt.Sprintf(`## 描述

%s

## 验收标准

%s

## Verify

`+"```bash"+`
%s
`+"```"+`%s

## 历史

| Time | Phase | Actor | Note |
|------|-------|-------|------|
| %s | inbox | human | 创建任务 |`, params.Description, acLines, verifyCmd, verifyExpect, ts),
	}

	filename := fmt.Sprintf("%s-%s.md", id, slug)
	task.FilePath = filepath.Join(inboxDir, filename)

	if err := RewriteTaskFile(task); err != nil {
		return nil, err
	}

	// Increment next_id
	cfg.NextID++
	if err := config.SaveBoardConfig(scRoot, cfg); err != nil {
		return nil, err
	}

	return task, nil
}

func makeSlug(title string) string {
	slug := strings.ToLower(title)
	slug = strings.ReplaceAll(slug, " ", "-")
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
	return slug
}
