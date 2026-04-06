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

export default function KanbanBoard({ projectId, tasks, onTaskClick, onRefresh }: KanbanBoardProps) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [showNewTask, setShowNewTask] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newPriority, setNewPriority] = useState('medium');
  const [creating, setCreating] = useState(false);

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
      await createTask(projectId, { title: newTitle.trim(), priority: newPriority });
      setNewTitle('');
      setShowNewTask(false);
      onRefresh();
    } catch (err) {
      console.error('Failed to create task:', err);
    } finally {
      setCreating(false);
    }
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
          onClick={() => setShowNewTask(!showNewTask)}
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

      {/* New task form */}
      {showNewTask && (
        <div style={{
          padding: '12px 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-tertiary)',
          display: 'flex',
          gap: 8,
          alignItems: 'center',
        }}>
          <input
            autoFocus
            placeholder="输入任务标题..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateTask()}
            style={{
              flex: 1,
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '7px 12px',
              color: 'var(--text-primary)',
              outline: 'none',
              fontSize: 13,
              transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
            }}
          />
          <select
            value={newPriority}
            onChange={(e) => setNewPriority(e.target.value)}
            style={{
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '7px 8px',
              color: 'var(--text-secondary)',
              outline: 'none',
              fontSize: 12,
            }}
          >
            <option value="critical">紧急</option>
            <option value="high">高优先级</option>
            <option value="medium">中等</option>
            <option value="low">低优先级</option>
          </select>
          <button
            onClick={handleCreateTask}
            disabled={creating || !newTitle.trim()}
            style={{
              background: 'var(--accent)',
              color: '#fff',
              border: 'none',
              padding: '7px 14px',
              borderRadius: 'var(--radius-sm)',
              fontSize: 12,
              fontWeight: 500,
              opacity: creating || !newTitle.trim() ? 0.5 : 1,
            }}
          >
            {creating ? '创建中...' : '创建'}
          </button>
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
