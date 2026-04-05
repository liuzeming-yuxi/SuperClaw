'use client';

import { Task } from '@/lib/types';

interface TaskCardProps {
  task: Task;
}

export default function TaskCard({ task }: TaskCardProps) {
  const tierClass = `badge badge-${task.tier?.toLowerCase() || 't2'}`;
  const priorityClass = `priority-dot priority-${task.priority || 'medium'}`;

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('taskId', task.id);
    e.dataTransfer.setData('fromPhase', task.phase);
    e.dataTransfer.effectAllowed = 'move';
  };

  return (
    <a href={`/task/${task.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
      <div
        className="task-card"
        draggable
        onDragStart={handleDragStart}
      >
        <div className="task-card-header">
          <span className="task-id">#{task.id}</span>
          <span className={tierClass}>{task.tier || 'T2'}</span>
        </div>
        <div className="task-title">{task.title}</div>
        <div className="task-meta">
          <span className={priorityClass} title={task.priority} />
          {task.type && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{task.type}</span>
          )}
          {task.assignee && <span className="assignee">{task.assignee}</span>}
        </div>
      </div>
    </a>
  );
}
