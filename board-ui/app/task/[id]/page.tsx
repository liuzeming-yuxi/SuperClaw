'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Task } from '@/lib/types';
import { fetchTask } from '@/lib/api';

export default function TaskDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetchTask(id)
      .then(setTask)
      .catch((err) => console.error('Failed to load task:', err))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="loading">Loading task...</div>;
  }

  if (!task) {
    return (
      <div className="task-detail">
        <a href="/" className="back-link">Back to board</a>
        <p>Task not found.</p>
      </div>
    );
  }

  return (
    <div className="task-detail">
      <a href="/" className="back-link">Back to board</a>

      <div className="task-detail-header">
        <h1>
          <span style={{ color: 'var(--text-muted)', fontSize: 18 }}>#{task.id}</span>{' '}
          {task.title}
        </h1>
      </div>

      <div className="meta-grid">
        <div className="meta-item">
          <div className="meta-label">Phase</div>
          <div>{task.phase}</div>
        </div>
        <div className="meta-item">
          <div className="meta-label">Tier</div>
          <div>
            <span className={`badge badge-${task.tier?.toLowerCase() || 't2'}`}>
              {task.tier || 'T2'}
            </span>
          </div>
        </div>
        <div className="meta-item">
          <div className="meta-label">Priority</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className={`priority-dot priority-${task.priority || 'medium'}`} />
            {task.priority || 'medium'}
          </div>
        </div>
        <div className="meta-item">
          <div className="meta-label">Type</div>
          <div>{task.type}</div>
        </div>
        <div className="meta-item">
          <div className="meta-label">Assignee</div>
          <div>{task.assignee || 'unassigned'}</div>
        </div>
        <div className="meta-item">
          <div className="meta-label">Created</div>
          <div>{task.created ? new Date(task.created).toLocaleString() : '-'}</div>
        </div>
        <div className="meta-item">
          <div className="meta-label">Updated</div>
          <div>{task.updated ? new Date(task.updated).toLocaleString() : '-'}</div>
        </div>
        {task.spec_path && (
          <div className="meta-item">
            <div className="meta-label">Spec</div>
            <div>{task.spec_path}</div>
          </div>
        )}
        {task.plan_path && (
          <div className="meta-item">
            <div className="meta-label">Plan</div>
            <div>{task.plan_path}</div>
          </div>
        )}
        {task.blocked_reason && (
          <div className="meta-item" style={{ gridColumn: '1 / -1' }}>
            <div className="meta-label">Blocked Reason</div>
            <div style={{ color: 'var(--red)' }}>{task.blocked_reason}</div>
          </div>
        )}
      </div>

      {task.content && (
        <div className="task-content">
          {task.content}
        </div>
      )}
    </div>
  );
}
