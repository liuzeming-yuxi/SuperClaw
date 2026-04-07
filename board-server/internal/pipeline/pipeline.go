package pipeline

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"github.com/superclaw/board-server/internal/board"
	"github.com/superclaw/board-server/internal/ws"
)

// PipelineConfig holds configuration for the pipeline engine.
type PipelineConfig struct {
	MaxConcurrent int    // max concurrent CC executions
	ACPXPath      string // path to acpx binary
	EnvFile       string // path to .env file for CC credentials
}

// TaskStatus tracks the real-time status of a pipeline-driven task.
type TaskStatus struct {
	TaskID    string `json:"task_id"`
	Phase     string `json:"phase"`
	Action    string `json:"action"`    // current action being performed
	Status    string `json:"status"`    // "idle" | "running" | "completed" | "failed"
	SessionID string `json:"session_id"`
	StartedAt string `json:"started_at"`
	Error     string `json:"error,omitempty"`
}

// Pipeline is the state machine engine that drives tasks through their lifecycle.
type Pipeline struct {
	projectPath string
	config      PipelineConfig
	hub         *ws.Hub
	executor    *Executor

	mu       sync.RWMutex
	running  map[string]*TaskStatus // taskID -> status
	sem      chan struct{}           // concurrency semaphore
}

// New creates a new Pipeline instance.
func New(projectPath string, hub *ws.Hub, config PipelineConfig) *Pipeline {
	if config.MaxConcurrent <= 0 {
		config.MaxConcurrent = 2
	}
	return &Pipeline{
		projectPath: projectPath,
		config:      config,
		hub:         hub,
		executor:    NewExecutor(config.ACPXPath, config.EnvFile),
		running:     make(map[string]*TaskStatus),
		sem:         make(chan struct{}, config.MaxConcurrent),
	}
}

// TriggerTask actively triggers a pipeline action on a task.
// This is the primary entry point — no polling, direct invocation.
func (p *Pipeline) TriggerTask(ctx context.Context, taskID string, action string) error {
	task, err := board.GetTask(p.projectPath, taskID)
	if err != nil {
		return fmt.Errorf("获取任务失败: %w", err)
	}

	switch action {
	case "start_align":
		return p.handleStartAlign(ctx, task)
	case "approve_spec":
		return p.handleApproveSpec(ctx, task)
	case "dispatch":
		return p.handleDispatch(ctx, task)
	case "verify":
		return p.handleVerify(ctx, task)
	case "approve":
		return p.handleApprove(ctx, task)
	default:
		return fmt.Errorf("未知操作: %s", action)
	}
}

// GetStatus returns the pipeline status for all running tasks.
func (p *Pipeline) GetStatus() map[string]*TaskStatus {
	p.mu.RLock()
	defer p.mu.RUnlock()
	result := make(map[string]*TaskStatus, len(p.running))
	for k, v := range p.running {
		cp := *v
		result[k] = &cp
	}
	return result
}

// GetTaskStatus returns the pipeline status for a specific task.
func (p *Pipeline) GetTaskStatus(taskID string) *TaskStatus {
	p.mu.RLock()
	defer p.mu.RUnlock()
	if s, ok := p.running[taskID]; ok {
		cp := *s
		return &cp
	}
	return nil
}

func (p *Pipeline) setStatus(taskID string, status *TaskStatus) {
	p.mu.Lock()
	defer p.mu.Unlock()
	if status == nil {
		delete(p.running, taskID)
	} else {
		p.running[taskID] = status
	}
}

func (p *Pipeline) broadcast(eventType string, data interface{}) {
	p.hub.Broadcast(ws.Message{Type: eventType, Data: data})
}

// --- Phase Handlers ---

// handleStartAlign: inbox → aligning
// Moves task to aligning phase. User should then provide spec content.
func (p *Pipeline) handleStartAlign(ctx context.Context, task *board.Task) error {
	if task.Phase != "inbox" {
		return fmt.Errorf("任务 %s 当前阶段为 %s，只有 inbox 阶段的任务可以开始对齐", task.ID, task.Phase)
	}

	if err := board.MoveTask(p.projectPath, task.ID, "aligning", "开始对齐"); err != nil {
		return fmt.Errorf("移动任务失败: %w", err)
	}

	p.broadcast("pipeline_phase_changed", map[string]string{
		"task_id": task.ID,
		"from":    "inbox",
		"to":      "aligning",
		"action":  "start_align",
	})

	log.Printf("[pipeline] 任务 %s: inbox → aligning", task.ID)
	return nil
}

// handleApproveSpec: aligning → planned
// Called after spec is written. Moves to planned and starts plan generation via CC.
func (p *Pipeline) handleApproveSpec(ctx context.Context, task *board.Task) error {
	if task.Phase != "aligning" {
		return fmt.Errorf("任务 %s 当前阶段为 %s，只有 aligning 阶段的任务可以确认规格", task.ID, task.Phase)
	}

	// Check that spec artifact exists
	_, _, exists, err := board.GetArtifact(p.projectPath, task.ID, "spec")
	if err != nil {
		return fmt.Errorf("读取规格文档失败: %w", err)
	}
	if !exists {
		return fmt.Errorf("任务 %s 尚未上传规格文档，请先通过 artifact API 上传 spec", task.ID)
	}

	if err := board.MoveTask(p.projectPath, task.ID, "planned", "规格已确认，准备生成计划"); err != nil {
		return fmt.Errorf("移动任务失败: %w", err)
	}

	p.broadcast("pipeline_phase_changed", map[string]string{
		"task_id": task.ID,
		"from":    "aligning",
		"to":      "planned",
		"action":  "approve_spec",
	})

	// Start plan generation asynchronously
	go p.generatePlan(context.Background(), task.ID)

	log.Printf("[pipeline] 任务 %s: aligning → planned, 开始生成计划", task.ID)
	return nil
}

// handleDispatch: planned → executing
// Dispatches the task to CC for execution.
func (p *Pipeline) handleDispatch(ctx context.Context, task *board.Task) error {
	if task.Phase != "planned" {
		return fmt.Errorf("任务 %s 当前阶段为 %s，只有 planned 阶段的任务可以开始执行", task.ID, task.Phase)
	}

	if err := board.MoveTask(p.projectPath, task.ID, "executing", "分配给 CC 执行"); err != nil {
		return fmt.Errorf("移动任务失败: %w", err)
	}

	p.broadcast("pipeline_phase_changed", map[string]string{
		"task_id": task.ID,
		"from":    "planned",
		"to":      "executing",
		"action":  "dispatch",
	})

	// Start CC execution asynchronously
	go p.executeTask(context.Background(), task.ID)

	log.Printf("[pipeline] 任务 %s: planned → executing", task.ID)
	return nil
}

// handleVerify: executing → reviewing
// Triggers verification on a completed execution.
func (p *Pipeline) handleVerify(ctx context.Context, task *board.Task) error {
	if task.Phase != "executing" && task.Phase != "reviewing" {
		return fmt.Errorf("任务 %s 当前阶段为 %s，只有 executing 或 reviewing 阶段的任务可以触发验收", task.ID, task.Phase)
	}

	if task.Phase == "executing" {
		if err := board.MoveTask(p.projectPath, task.ID, "reviewing", "执行完成，开始验收"); err != nil {
			return fmt.Errorf("移动任务失败: %w", err)
		}
	}

	p.broadcast("pipeline_phase_changed", map[string]string{
		"task_id": task.ID,
		"from":    task.Phase,
		"to":      "reviewing",
		"action":  "verify",
	})

	// Start verification asynchronously
	go p.verifyTask(context.Background(), task.ID)

	log.Printf("[pipeline] 任务 %s: → reviewing, 开始验收", task.ID)
	return nil
}

// handleApprove: reviewing → done
// Human approves the verification result.
func (p *Pipeline) handleApprove(ctx context.Context, task *board.Task) error {
	if task.Phase != "reviewing" {
		return fmt.Errorf("任务 %s 当前阶段为 %s，只有 reviewing 阶段的任务可以批准完成", task.ID, task.Phase)
	}

	if err := board.MoveTask(p.projectPath, task.ID, "done", "验收通过"); err != nil {
		return fmt.Errorf("移动任务失败: %w", err)
	}

	// Clean up any running status
	p.setStatus(task.ID, nil)

	p.broadcast("pipeline_phase_changed", map[string]string{
		"task_id": task.ID,
		"from":    "reviewing",
		"to":      "done",
		"action":  "approve",
	})

	log.Printf("[pipeline] 任务 %s: reviewing → done", task.ID)
	return nil
}

// --- Async Operations ---

// generatePlan runs CC to generate a plan from the spec.
func (p *Pipeline) generatePlan(ctx context.Context, taskID string) {
	status := &TaskStatus{
		TaskID:    taskID,
		Phase:     "planned",
		Action:    "generating_plan",
		Status:    "running",
		StartedAt: time.Now().UTC().Format(time.RFC3339),
	}
	p.setStatus(taskID, status)
	p.broadcast("pipeline_action_started", status)

	// Acquire semaphore
	select {
	case p.sem <- struct{}{}:
		defer func() { <-p.sem }()
	case <-ctx.Done():
		status.Status = "failed"
		status.Error = "cancelled"
		p.setStatus(taskID, status)
		return
	}

	// Read the spec
	specContent, _, exists, err := board.GetArtifact(p.projectPath, taskID, "spec")
	if err != nil || !exists {
		status.Status = "failed"
		status.Error = "无法读取规格文档"
		p.setStatus(taskID, status)
		p.broadcast("pipeline_action_completed", status)
		return
	}

	// Read task info
	task, err := board.GetTask(p.projectPath, taskID)
	if err != nil {
		status.Status = "failed"
		status.Error = fmt.Sprintf("获取任务失败: %v", err)
		p.setStatus(taskID, status)
		p.broadcast("pipeline_action_completed", status)
		return
	}

	// Create session
	session, err := board.AddSession(p.projectPath, taskID, "cc-planner", "planned")
	if err != nil {
		log.Printf("[pipeline] 创建会话失败: %v", err)
	} else {
		status.SessionID = session.ID
	}

	// Build prompt for plan generation
	prompt := fmt.Sprintf(`你是一个任务规划助手。请根据以下规格文档，生成一份详细的执行计划。

## 任务信息
- 任务ID: %s
- 标题: %s
- 类型: %s
- 层级: %s

## 规格文档
%s

## 要求
1. 列出具体的实现步骤
2. 每个步骤要明确修改哪些文件
3. 标注步骤间的依赖关系
4. 估计每个步骤的复杂度（简单/中等/复杂）
5. 标注潜在风险点

请输出 Markdown 格式的计划文档。`, task.ID, task.Title, task.Type, task.Tier, specContent)

	// Execute via CC
	result, err := p.executor.Execute(ctx, p.projectPath, prompt)
	if err != nil {
		status.Status = "failed"
		status.Error = fmt.Sprintf("CC 执行失败: %v", err)
		p.setStatus(taskID, status)
		p.broadcast("pipeline_action_completed", status)

		if session != nil {
			board.UpdateSession(p.projectPath, taskID, session.ID, "failed")
		}
		return
	}

	// Save plan artifact
	_, err = board.PutArtifact(p.projectPath, taskID, "plan", result)
	if err != nil {
		status.Status = "failed"
		status.Error = fmt.Sprintf("保存计划失败: %v", err)
		p.setStatus(taskID, status)
		p.broadcast("pipeline_action_completed", status)
		return
	}

	// Update session
	if session != nil {
		board.UpdateSession(p.projectPath, taskID, session.ID, "done")
	}

	status.Status = "completed"
	p.setStatus(taskID, status)
	p.broadcast("pipeline_action_completed", status)
	log.Printf("[pipeline] 任务 %s: 计划生成完成", taskID)
}

// executeTask runs CC to execute the task plan.
func (p *Pipeline) executeTask(ctx context.Context, taskID string) {
	status := &TaskStatus{
		TaskID:    taskID,
		Phase:     "executing",
		Action:    "executing_code",
		Status:    "running",
		StartedAt: time.Now().UTC().Format(time.RFC3339),
	}
	p.setStatus(taskID, status)
	p.broadcast("pipeline_action_started", status)

	// Acquire semaphore
	select {
	case p.sem <- struct{}{}:
		defer func() { <-p.sem }()
	case <-ctx.Done():
		status.Status = "failed"
		status.Error = "cancelled"
		p.setStatus(taskID, status)
		return
	}

	// Read spec and plan
	specContent, _, specExists, _ := board.GetArtifact(p.projectPath, taskID, "spec")
	planContent, _, planExists, _ := board.GetArtifact(p.projectPath, taskID, "plan")

	if !specExists {
		status.Status = "failed"
		status.Error = "缺少规格文档"
		p.setStatus(taskID, status)
		p.broadcast("pipeline_action_completed", status)
		return
	}

	task, err := board.GetTask(p.projectPath, taskID)
	if err != nil {
		status.Status = "failed"
		status.Error = fmt.Sprintf("获取任务失败: %v", err)
		p.setStatus(taskID, status)
		p.broadcast("pipeline_action_completed", status)
		return
	}

	// Create session
	session, err := board.AddSession(p.projectPath, taskID, "cc-executor", "executing")
	if err != nil {
		log.Printf("[pipeline] 创建会话失败: %v", err)
	} else {
		status.SessionID = session.ID
	}

	// Build execution prompt
	prompt := fmt.Sprintf(`你是一个代码执行助手。请根据以下规格文档和执行计划，完成代码实现。

## 任务信息
- 任务ID: %s
- 标题: %s
- 工作目录: %s

## 规格文档
%s

`, task.ID, task.Title, p.projectPath, specContent)

	if planExists {
		prompt += fmt.Sprintf(`## 执行计划
%s

`, planContent)
	}

	prompt += `## 要求
1. 严格按照规格文档和计划执行
2. 完成后做 L1 自检（检查代码是否满足规格要求）
3. 确保代码可以编译通过
4. 不要引入多余的变更`

	// Execute via CC
	result, err := p.executor.Execute(ctx, p.projectPath, prompt)
	if err != nil {
		status.Status = "failed"
		status.Error = fmt.Sprintf("CC 执行失败: %v", err)
		p.setStatus(taskID, status)
		p.broadcast("pipeline_action_completed", status)

		if session != nil {
			board.UpdateSession(p.projectPath, taskID, session.ID, "failed")
		}
		return
	}

	// Save progress artifact
	board.PutArtifact(p.projectPath, taskID, "progress", result)

	// Update session
	if session != nil {
		board.UpdateSession(p.projectPath, taskID, session.ID, "done")
	}

	status.Status = "completed"
	p.setStatus(taskID, status)
	p.broadcast("pipeline_action_completed", status)
	log.Printf("[pipeline] 任务 %s: 代码执行完成", taskID)
}

// verifyTask runs an independent CC session to verify the task output against spec.
func (p *Pipeline) verifyTask(ctx context.Context, taskID string) {
	status := &TaskStatus{
		TaskID:    taskID,
		Phase:     "reviewing",
		Action:    "verifying",
		Status:    "running",
		StartedAt: time.Now().UTC().Format(time.RFC3339),
	}
	p.setStatus(taskID, status)
	p.broadcast("pipeline_action_started", status)

	// Acquire semaphore
	select {
	case p.sem <- struct{}{}:
		defer func() { <-p.sem }()
	case <-ctx.Done():
		status.Status = "failed"
		status.Error = "cancelled"
		p.setStatus(taskID, status)
		return
	}

	// Read spec
	specContent, _, specExists, _ := board.GetArtifact(p.projectPath, taskID, "spec")
	if !specExists {
		status.Status = "failed"
		status.Error = "缺少规格文档，无法验收"
		p.setStatus(taskID, status)
		p.broadcast("pipeline_action_completed", status)
		return
	}

	task, err := board.GetTask(p.projectPath, taskID)
	if err != nil {
		status.Status = "failed"
		status.Error = fmt.Sprintf("获取任务失败: %v", err)
		p.setStatus(taskID, status)
		p.broadcast("pipeline_action_completed", status)
		return
	}

	// Create session
	session, err := board.AddSession(p.projectPath, taskID, "cc-verifier", "reviewing")
	if err != nil {
		log.Printf("[pipeline] 创建会话失败: %v", err)
	} else {
		status.SessionID = session.ID
	}

	// Build verification prompt
	prompt := fmt.Sprintf(`你是一个独立的代码验收审查员。你的任务是验证代码变更是否满足规格文档的要求。

## 任务信息
- 任务ID: %s
- 标题: %s
- 工作目录: %s

## 规格文档
%s

## 验收要求
1. 检查 git diff，确认所有规格要求的功能都已实现
2. 检查代码质量（无明显 bug、安全漏洞）
3. 如果有 verify 命令，执行它
4. 生成验收报告，包含：
   - 通过/未通过 的总结论
   - 逐项对照规格的检查结果
   - 发现的问题列表（如有）

请输出 Markdown 格式的验收报告。结论放在开头，使用 PASS 或 FAIL 标记。`, task.ID, task.Title, p.projectPath, specContent)

	if task.Verify != "" {
		prompt += fmt.Sprintf("\n\n## Verify 命令\n请执行: `%s`", task.Verify)
	}

	// Execute via CC (independent context)
	result, err := p.executor.Execute(ctx, p.projectPath, prompt)
	if err != nil {
		status.Status = "failed"
		status.Error = fmt.Sprintf("CC 验收失败: %v", err)
		p.setStatus(taskID, status)
		p.broadcast("pipeline_action_completed", status)

		if session != nil {
			board.UpdateSession(p.projectPath, taskID, session.ID, "failed")
		}
		return
	}

	// Save verify report
	board.PutArtifact(p.projectPath, taskID, "verify_report", result)

	// Update session
	if session != nil {
		board.UpdateSession(p.projectPath, taskID, session.ID, "done")
	}

	status.Status = "completed"
	p.setStatus(taskID, status)
	p.broadcast("pipeline_action_completed", status)
	log.Printf("[pipeline] 任务 %s: 验收完成", taskID)
}

// ProcessInbox processes all inbox tasks — moves them to aligning.
func (p *Pipeline) ProcessInbox(ctx context.Context) ([]string, error) {
	tasks, err := board.ListTasks(p.projectPath)
	if err != nil {
		return nil, err
	}

	var processed []string
	for _, t := range tasks {
		if t.Phase == "inbox" {
			if err := p.handleStartAlign(ctx, &t); err != nil {
				log.Printf("[pipeline] 处理 inbox 任务 %s 失败: %v", t.ID, err)
				continue
			}
			processed = append(processed, t.ID)
		}
	}
	return processed, nil
}
