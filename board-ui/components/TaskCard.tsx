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

const miniIndicator: React.CSSProperties = {
  width: 6,
  height: 6,
  borderRadius: '50%',
  flexShrink: 0,
};

export default function TaskCard({ task, onClick, onDragStart }: TaskCardProps) {
  const sessionCount = task.sessions?.length || 0;
  const arts = task.artifacts || {};
  const artifactCount = [arts.spec, arts.plan, arts.progress, arts.verify_report, arts.deliver_summary].filter(Boolean).length;

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

      {/* Bottom: type + indicators + assignee */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
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
          {/* Session count badge */}
          {sessionCount > 0 && (
            <span style={{
              fontSize: 9,
              color: '#f59e0b',
              background: 'rgba(245,158,11,0.12)',
              padding: '1px 5px',
              borderRadius: 4,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}>
              <div style={{ ...miniIndicator, background: '#f59e0b' }} />
              {sessionCount}
            </span>
          )}
          {/* Artifact indicators */}
          {artifactCount > 0 && (
            <span style={{
              fontSize: 9,
              color: '#3b82f6',
              background: 'rgba(59,130,246,0.12)',
              padding: '1px 5px',
              borderRadius: 4,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: 3,
            }}>
              <div style={{ ...miniIndicator, background: '#3b82f6' }} />
              {artifactCount}
            </span>
          )}
        </div>
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
