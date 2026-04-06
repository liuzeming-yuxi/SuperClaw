'use client';

import { Task, Session } from '@/lib/api';

interface TaskDetailProps {
  task: Task;
  sessions: Session[];
  onClose: () => void;
}

export default function TaskDetail({ task, sessions, onClose }: TaskDetailProps) {
  const taskSessions = sessions.filter((s) => s.taskId === task.id);

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100,
    }}
    onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 12,
        width: '90%',
        maxWidth: 700,
        maxHeight: '80vh',
        overflow: 'auto',
        padding: 24,
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)' }}>#{task.id}</span>
              <span className={`tier-badge tier-${task.tier}`}>{task.tier}</span>
              <span className={`priority-badge ${task.priority}`}>{task.priority}</span>
              <span style={{
                padding: '1px 8px',
                borderRadius: 4,
                fontSize: 11,
                background: 'var(--bg-hover)',
                color: 'var(--text-secondary)',
              }}>
                {task.phase}
              </span>
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 600 }}>
              {task.title || task.slug || `Task ${task.id}`}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: 20,
              padding: '4px 8px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Meta */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          marginBottom: 20,
          padding: 12,
          background: 'var(--bg-primary)',
          borderRadius: 8,
        }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Type</div>
            <div style={{ fontSize: 13 }}>{task.type}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Assignee</div>
            <div style={{ fontSize: 13 }}>{task.assignee}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>Created</div>
            <div style={{ fontSize: 13 }}>{new Date(task.created).toLocaleDateString()}</div>
          </div>
        </div>

        {/* Body content (markdown rendered as plain text for now) */}
        {task.body && (
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>Content</h3>
            <pre style={{
              background: 'var(--bg-primary)',
              borderRadius: 8,
              padding: 12,
              fontSize: 13,
              whiteSpace: 'pre-wrap',
              color: 'var(--text-secondary)',
              lineHeight: 1.6,
            }}>
              {task.body}
            </pre>
          </div>
        )}

        {/* Spec & Plan paths */}
        {(task.spec_path || task.plan_path) && (
          <div style={{ marginBottom: 20 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>Artifacts</h3>
            <div style={{ display: 'flex', gap: 12 }}>
              {task.spec_path && (
                <div style={artifactBadge}>Spec: {task.spec_path}</div>
              )}
              {task.plan_path && (
                <div style={artifactBadge}>Plan: {task.plan_path}</div>
              )}
            </div>
          </div>
        )}

        {/* Associated sessions */}
        <div>
          <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: 'var(--text-secondary)' }}>
            Sessions ({taskSessions.length})
          </h3>
          {taskSessions.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No agent sessions attached to this task.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {taskSessions.map((s) => (
                <div key={s.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 10px',
                  background: 'var(--bg-primary)',
                  borderRadius: 6,
                }}>
                  <span>{s.icon}</span>
                  <span style={{ fontSize: 13 }}>#{s.id} {s.agent}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.status}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const artifactBadge: React.CSSProperties = {
  background: 'var(--bg-primary)',
  padding: '4px 10px',
  borderRadius: 6,
  fontSize: 12,
  color: 'var(--text-secondary)',
  fontFamily: 'monospace',
};
