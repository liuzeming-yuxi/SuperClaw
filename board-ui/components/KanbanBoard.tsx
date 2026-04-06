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

export default function KanbanBoard({ projectId, tasks, onTaskClick, onRefresh }: KanbanBoardProps) {
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [showNewTask, setShowNewTask] = useState(false);
  const [new标题, setNew标题] = useState('');

  const handleDragStart = (e: React.DragEvent, taskId: string) => {
    e.dataTransfer.setData('text/plain', taskId);
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
    if (!new标题.trim()) return;
    try {
      await createTask(projectId, { title: new标题.trim() });
      setNew标题('');
      setShowNewTask(false);
      onRefresh();
    } catch (err) {
      console.error('Failed to create task:', err);
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
        <span style={{ fontWeight: 600 }}>Board</span>
        <button
          onClick={() => setShowNewTask(!showNewTask)}
          style={{
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            padding: '5px 12px',
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          + 新建任务
        </button>
      </div>

      {/* New task inline */}
      {showNewTask && (
        <div style={{
          padding: '8px 16px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-tertiary)',
          display: 'flex',
          gap: 8,
        }}>
          <input
            autoFocus
            placeholder="Task title..."
            value={new标题}
            onChange={(e) => setNew标题(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreateTask()}
            style={{
              flex: 1,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '6px 10px',
              color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
          <button onClick={handleCreateTask} style={{
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            padding: '6px 12px',
            borderRadius: 6,
            fontSize: 12,
          }}>
            Create
          </button>
        </div>
      )}

      {/* Columns */}
      <div style={{
        flex: 1,
        display: 'flex',
        gap: 0,
        overflowX: 'auto',
        padding: '12px 8px',
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
                minWidth: 180,
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
                }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {phase.label}
                </span>
                <span style={{
                  fontSize: 11,
                  color: 'var(--text-muted)',
                  background: 'var(--bg-tertiary)',
                  padding: '0 6px',
                  borderRadius: 8,
                }}>
                  {phaseTasks.length}
                </span>
              </div>

              {/* Cards */}
              <div style={{
                flex: 1,
                background: isOver ? 'var(--bg-hover)' : 'var(--bg-secondary)',
                borderRadius: 8,
                padding: 6,
                transition: 'background 0.15s',
                minHeight: 100,
              }}>
                {phaseTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onClick={() => onTaskClick(task)}
                    onDragStart={(e) => handleDragStart(e, task.id)}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
