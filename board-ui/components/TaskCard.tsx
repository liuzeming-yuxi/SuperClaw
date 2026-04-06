'use client';

import { Task } from '@/lib/api';

interface TaskCardProps {
  task: Task;
  onClick: () => void;
  onDragStart: (e: React.DragEvent) => void;
}

const PRIORITY_LABELS: Record<string, string> = {
  critical: '紧急',
  high: '高',
  medium: '中',
  low: '低',
};

export default function TaskCard({ task, onClick, onDragStart }: TaskCardProps) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onClick={onClick}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        padding: '11px 13px',
        cursor: 'pointer',
        transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
        marginBottom: 8,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = 'var(--accent)';
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(99, 102, 241, 0.08)';
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = 'var(--border)';
        e.currentTarget.style.boxShadow = 'none';
      }}
    >
      {/* Top: ID + badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 7 }}>
        <span style={{
          fontSize: 10,
          color: 'var(--text-muted)',
          fontFamily: 'monospace',
          letterSpacing: '0.02em',
        }}>#{task.id}</span>
        {task.tier && (
          <span className={`tier-badge tier-${task.tier}`}>{task.tier}</span>
        )}
        {task.priority && (
          <span className={`priority-badge ${task.priority}`}>
            {PRIORITY_LABELS[task.priority] || task.priority}
          </span>
        )}
      </div>

      {/* Title */}
      <div style={{
        fontSize: 13,
        fontWeight: 500,
        marginBottom: 8,
        lineHeight: 1.45,
        display: '-webkit-box',
        WebkitLineClamp: 2,
        WebkitBoxOrient: 'vertical',
        overflow: 'hidden',
      }}>
        {task.title || task.slug || `Task ${task.id}`}
      </div>

      {/* Bottom: type + assignee */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        {task.type && (
          <span style={{
            fontSize: 10,
            color: 'var(--text-muted)',
            background: 'var(--bg-tertiary)',
            padding: '2px 7px',
            borderRadius: 4,
            fontWeight: 500,
          }}>
            {task.type}
          </span>
        )}
        {task.assignee && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}>
            <div style={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: 'var(--accent-glow)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 9,
              fontWeight: 600,
              color: 'var(--accent)',
            }}>
              {task.assignee.charAt(0).toUpperCase()}
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {task.assignee}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
