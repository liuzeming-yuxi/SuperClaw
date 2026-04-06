'use client';

import { Task } from '@/lib/api';

interface TaskCardProps {
  task: Task;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
}

export default function TaskCard({ task, onClick, onDragStart }: TaskCardProps) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: '10px 12px',
        cursor: 'pointer',
        transition: 'border-color 0.15s, transform 0.15s',
        marginBottom: 8,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--accent)';
        e.currentTarget.style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.transform = 'translateY(0)';
      }}
    >
      {/* Top row: ID + badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>#{task.id}</span>
        <span className={`tier-badge tier-${task.tier}`}>{task.tier}</span>
        <span className={`priority-badge ${task.priority}`}>{task.priority}</span>
      </div>

      {/* Title */}
      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
        {task.title || task.slug || `Task ${task.id}`}
      </div>

      {/* Bottom row: type + assignee */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{
          fontSize: 11,
          color: 'var(--text-muted)',
          background: 'var(--bg-secondary)',
          padding: '1px 6px',
          borderRadius: 3,
        }}>
          {task.type}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {task.assignee}
        </span>
      </div>
    </div>
  );
}
