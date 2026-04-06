'use client';

import { Task, moveTask, createTask } from '@/lib/api';
import TaskCard from './TaskCard';
import { useState } from 'react';

const PHASES = [
  { id: 'inbox', label: '待处理', color: '#6b7280' },
  { id: 'aligning', label: '对齐中', color: '#8b5cf6' },
  { id: 'planned', label: '已规划', color: '#3b82f6' },
  { id: 'executing', label: '执行中', color: '#f59e0b' },
  { id: 'reviewing', label: '验收中', color: '#22c55e' },
  { id: 'done', label: '已完成', color: '#10b981' },
  { id: 'blocked', label: '已阻塞', color: '#ef4444' },
];

interface KanbanBoardProps {
  projectId: string;
  tasks: Task[];
  onTaskClick: (task: Task) => void;
  onRefresh: () => void;
}

const IconPlus = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
    <path d="M8 3v10M3 8h10"/>
  </svg>
);

const IconX = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M4 4l8 8M12 4l-8 8"/>
  </svg>
);

const selectStyle: React.CSSProperties = {
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: '7px 10px',
  color: 'var(--text-secondary)',
  outline: 'none',
  fontSize: 12,
  width: '100%',
};

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: '7px 12px',
  color: 'var(--text-primary)',
  outline: 'none',
  fontSize: 13,
  width: '100%',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: 'var(--text-muted)',
  marginBottom: 4,
  display: 'block',
};

export default function KanbanBoard({ projectId, tasks, onTaskClick, onRefresh }: KanbanBoardProps) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [showNewTask, setShowNewTask] = useState(false);
  const [creating, setCreating] = useState(false);

  // Form state
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [newPriority, setNewPriority] = useState('medium');
  const [newType, setNewType] = useState('feature');
  const [newTier, setNewTier] = useState('T2');
  const [newCriteria, setNewCriteria] = useState<string[]>(['']);
  const [newVerifyCmd, setNewVerifyCmd] = useState('');
  const [newVerifyExpect, setNewVerifyExpect] = useState('');

  const resetForm = () => {
    setNewTitle('');
    setNewDescription('');
    setNewPriority('medium');
    setNewType('feature');
    setNewTier('T2');
    setNewCriteria(['']);
    setNewVerifyCmd('');
    setNewVerifyExpect('');
  };

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId);
    e.dataTransfer.effectAllowed = 'move';
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '0.5';
    }
  };

  const handleDragEnd = (e: React.DragEvent) => {
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.style.opacity = '1';
    }
  };

  const handleDrop = async (e: React.DragEvent, phase: string) => {
    e.preventDefault();
    setDragOver(null);
    const taskId = e.dataTransfer.getData('text/plain');
    if (!taskId) return;
    try {
      await moveTask(projectId, taskId, phase);
      onRefresh();
    } catch (err) {
      console.error('Failed to move task:', err);
    }
  };

  const handleCreateTask = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const criteria = newCriteria.filter((c) => c.trim() !== '');
      await createTask(projectId, {
        title: newTitle.trim(),
        description: newDescription.trim() || undefined,
        priority: newPriority,
        type: newType,
        tier: newTier,
        acceptance_criteria: criteria.length > 0 ? criteria : undefined,
        verify_command: newVerifyCmd.trim() || undefined,
        verify_expect: newVerifyExpect.trim() || undefined,
      });
      resetForm();
      setShowNewTask(false);
      onRefresh();
    } catch (err) {
      console.error('Failed to create task:', err);
    } finally {
      setCreating(false);
    }
  };

  const addCriterion = () => setNewCriteria([...newCriteria, '']);
  const removeCriterion = (idx: number) => setNewCriteria(newCriteria.filter((_, i) => i !== idx));
  const updateCriterion = (idx: number, val: string) => {
    const copy = [...newCriteria];
    copy[idx] = val;
    setNewCriteria(copy);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Toolbar */}
      <div style={{
        padding: '10px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: 'var(--bg-secondary)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>看板</span>
          <span style={{
            fontSize: 11,
            color: 'var(--text-muted)',
            background: 'var(--bg-hover)',
            padding: '1px 8px',
            borderRadius: 8,
          }}>
            {tasks.length} 个任务
          </span>
        </div>
        <button
          onClick={() => { setShowNewTask(!showNewTask); if (showNewTask) resetForm(); }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            background: showNewTask ? 'var(--bg-hover)' : 'var(--accent)',
            color: showNewTask ? 'var(--text-secondary)' : '#fff',
            border: showNewTask ? '1px solid var(--border)' : 'none',
            padding: '5px 12px',
            borderRadius: 'var(--radius-sm)',
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          <IconPlus />
          新建任务
        </button>
      </div>

      {/* New task modal */}
      {showNewTask && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          zIndex: 100, backdropFilter: 'blur(4px)',
        }}
          onClick={(e) => { if (e.target === e.currentTarget) { setShowNewTask(false); resetForm(); } }}
        >
          <div style={{
            background: 'var(--bg-secondary)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)', width: '90%', maxWidth: 600,
            maxHeight: '85vh', display: 'flex', flexDirection: 'column',
            boxShadow: 'var(--shadow-modal)', overflow: 'hidden',
          }}>
            {/* Header */}
            <div style={{
              padding: '16px 20px 12px', borderBottom: '1px solid var(--border)',
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <h3 style={{ fontSize: 15, fontWeight: 600 }}>新建任务</h3>
              <button onClick={() => { setShowNewTask(false); resetForm(); }}
                style={{ background: 'var(--bg-hover)', border: 'none', color: 'var(--text-muted)', padding: 6, borderRadius: 'var(--radius-sm)', display: 'flex' }}>
                <IconX />
              </button>
            </div>

            {/* Form */}
            <div style={{ flex: 1, overflow: 'auto', padding: '16px 20px' }}>
              {/* Title */}
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>标题 *</label>
                <input autoFocus placeholder="输入任务标题..." value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)} style={inputStyle} />
              </div>

              {/* Description */}
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>描述</label>
                <textarea placeholder="描述任务详情..." value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)} rows={3}
                  style={{ ...inputStyle, resize: 'vertical' }} />
              </div>

              {/* Row: Priority / Type / Tier */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
                <div>
                  <label style={labelStyle}>优先级</label>
                  <select value={newPriority} onChange={(e) => setNewPriority(e.target.value)} style={selectStyle}>
                    <option value="critical">紧急</option>
                    <option value="high">高</option>
                    <option value="medium">中</option>
                    <option value="low">低</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>类型</label>
                  <select value={newType} onChange={(e) => setNewType(e.target.value)} style={selectStyle}>
                    <option value="feature">功能</option>
                    <option value="bugfix">修复</option>
                    <option value="refactor">重构</option>
                    <option value="chore">杂项</option>
                    <option value="spike">调研</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>交付层级</label>
                  <select value={newTier} onChange={(e) => setNewTier(e.target.value)} style={selectStyle}>
                    <option value="T0">T0 - 生产核心</option>
                    <option value="T1">T1 - 预览功能</option>
                    <option value="T2">T2 - 内部工具</option>
                    <option value="T3">T3 - 脚本/文档</option>
                  </select>
                </div>
              </div>

              {/* Acceptance Criteria */}
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>验收标准</label>
                {newCriteria.map((c, i) => (
                  <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
                    <input placeholder={`验收标准 ${i + 1}`} value={c}
                      onChange={(e) => updateCriterion(i, e.target.value)}
                      style={{ ...inputStyle, flex: 1 }} />
                    {newCriteria.length > 1 && (
                      <button onClick={() => removeCriterion(i)}
                        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', padding: '0 6px', fontSize: 16 }}>
                        x
                      </button>
                    )}
                  </div>
                ))}
                <button onClick={addCriterion}
                  style={{
                    background: 'none', border: '1px dashed var(--border)',
                    color: 'var(--text-muted)', padding: '4px 10px',
                    borderRadius: 'var(--radius-sm)', fontSize: 11, width: '100%',
                  }}>
                  + 添加验收标准
                </button>
              </div>

              {/* Verify Command */}
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>验证命令</label>
                <input placeholder="例如: npm test -- --grep 'billing'" value={newVerifyCmd}
                  onChange={(e) => setNewVerifyCmd(e.target.value)}
                  style={{ ...inputStyle, fontFamily: 'monospace' }} />
              </div>

              {/* Verify Expected */}
              <div style={{ marginBottom: 14 }}>
                <label style={labelStyle}>预期输出</label>
                <input placeholder="例如: All tests pass, exit code 0" value={newVerifyExpect}
                  onChange={(e) => setNewVerifyExpect(e.target.value)}
                  style={{ ...inputStyle, fontFamily: 'monospace' }} />
              </div>
            </div>

            {/* Footer */}
            <div style={{
              padding: '12px 20px', borderTop: '1px solid var(--border)',
              display: 'flex', justifyContent: 'flex-end', gap: 8,
            }}>
              <button onClick={() => { setShowNewTask(false); resetForm(); }}
                style={{
                  background: 'var(--bg-hover)', border: '1px solid var(--border)',
                  color: 'var(--text-secondary)', padding: '7px 16px',
                  borderRadius: 'var(--radius-sm)', fontSize: 12,
                }}>
                取消
              </button>
              <button onClick={handleCreateTask}
                disabled={creating || !newTitle.trim()}
                style={{
                  background: 'var(--accent)', color: '#fff', border: 'none',
                  padding: '7px 16px', borderRadius: 'var(--radius-sm)',
                  fontSize: 12, fontWeight: 500,
                  opacity: creating || !newTitle.trim() ? 0.5 : 1,
                }}>
                {creating ? '创建中...' : '创建任务'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Columns */}
      <div style={{
        flex: 1,
        display: 'flex',
        gap: 0,
        overflowX: 'auto',
        padding: '14px 8px',
      }}>
        {PHASES.map((phase) => {
          const phaseTasks = tasks.filter((t) => t.phase === phase.id);
          const isOver = dragOver === phase.id;

          return (
            <div
              key={phase.id}
              onDragOver={(e) => { e.preventDefault(); setDragOver(phase.id); }}
              onDragLeave={() => setDragOver(null)}
              onDrop={(e) => handleDrop(e, phase.id)}
              style={{
                flex: 1,
                minWidth: 190,
                display: 'flex',
                flexDirection: 'column',
                margin: '0 4px',
              }}
            >
              {/* Column header */}
              <div style={{
                padding: '6px 10px',
                marginBottom: 8,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                <div style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: phase.color,
                  boxShadow: `0 0 6px ${phase.color}40`,
                }} />
                <span style={{
                  fontSize: 12,
                  fontWeight: 600,
                  color: 'var(--text-secondary)',
                  letterSpacing: '0.01em',
                }}>
                  {phase.label}
                </span>
                <span style={{
                  fontSize: 10,
                  color: 'var(--text-muted)',
                  background: 'var(--bg-tertiary)',
                  padding: '0 7px',
                  borderRadius: 8,
                  fontWeight: 500,
                }}>
                  {phaseTasks.length}
                </span>
              </div>

              {/* Cards area */}
              <div style={{
                flex: 1,
                background: isOver ? 'var(--bg-hover)' : 'var(--bg-primary)',
                borderRadius: 'var(--radius-md)',
                padding: 6,
                transition: 'background var(--transition-fast)',
                minHeight: 100,
                border: isOver ? '1px dashed var(--accent)' : '1px solid transparent',
              }}>
                {phaseTasks.length === 0 && !isOver && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    height: 80,
                    color: 'var(--text-muted)',
                    fontSize: 11,
                  }}>
                    拖拽任务至此
                  </div>
                )}
                {phaseTasks.map((task) => (
                  <div
                    key={task.id}
                    onDragEnd={handleDragEnd}
                  >
                    <TaskCard
                      task={task}
                      onClick={() => onTaskClick(task)}
                      onDragStart={(e) => handleDragStart(e, task.id)}
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
