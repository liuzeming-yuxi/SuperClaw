'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { fetchTask, fetchSessions, Task, Session } from '@/lib/api';

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const taskId = params.taskId as string;

  const [task, setTask] = useState<Task | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchTask(projectId, taskId),
      fetchSessions(projectId),
    ])
      .then(([t, s]) => {
        setTask(t);
        setSessions(s || []);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [projectId, taskId]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-muted)' }}>
        Loading...
      </div>
    );
  }

  if (!task) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-muted)' }}>
        Task not found
      </div>
    );
  }

  const taskSessions = sessions.filter((s) => s.taskId === task.id);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 24px' }}>
      {/* Back link */}
      <button
        onClick={() => router.push(`/project/${projectId}`)}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--accent)',
          fontSize: 13,
          marginBottom: 20,
          cursor: 'pointer',
        }}
      >
        ← Back to Board
      </button>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: 16 }}>#{task.id}</span>
          <span className={`tier-badge tier-${task.tier}`}>{task.tier}</span>
          <span className={`priority-badge ${task.priority}`}>{task.priority}</span>
          <span style={{
            padding: '2px 10px',
            borderRadius: 4,
            fontSize: 12,
            background: 'var(--bg-hover)',
            color: 'var(--text-secondary)',
          }}>
            {task.phase}
          </span>
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 700 }}>
          {task.title || task.slug || `Task ${task.id}`}
        </h1>
      </div>

      {/* Meta grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 12,
        marginBottom: 24,
        padding: 16,
        background: 'var(--bg-secondary)',
        borderRadius: 8,
        border: '1px solid var(--border)',
      }}>
        {[
          ['Type', task.type],
          ['Assignee', task.assignee],
          ['Created', new Date(task.created).toLocaleString()],
          ['Updated', new Date(task.updated).toLocaleString()],
        ].map(([label, value]) => (
          <div key={label}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 2 }}>{label}</div>
            <div style={{ fontSize: 13 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Body */}
      {task.body && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Details</h2>
          <pre style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: 16,
            fontSize: 13,
            whiteSpace: 'pre-wrap',
            color: 'var(--text-secondary)',
            lineHeight: 1.6,
          }}>
            {task.body}
          </pre>
        </div>
      )}

      {/* Artifacts */}
      {(task.spec_path || task.plan_path) && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Artifacts</h2>
          <div style={{ display: 'flex', gap: 12 }}>
            {task.spec_path && (
              <div style={artifactBadge}>📋 Spec: {task.spec_path}</div>
            )}
            {task.plan_path && (
              <div style={artifactBadge}>📝 Plan: {task.plan_path}</div>
            )}
          </div>
        </div>
      )}

      {/* Sessions */}
      <div>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
          Agent Sessions ({taskSessions.length})
        </h2>
        {taskSessions.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>No agent sessions attached.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {taskSessions.map((s) => (
              <div key={s.id} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 14px',
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 8,
              }}>
                <span style={{ fontSize: 16 }}>{s.icon}</span>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500 }}>#{s.id} {s.agent}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.status}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const artifactBadge: React.CSSProperties = {
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  padding: '8px 14px',
  borderRadius: 8,
  fontSize: 13,
  color: 'var(--text-secondary)',
  fontFamily: 'monospace',
};
