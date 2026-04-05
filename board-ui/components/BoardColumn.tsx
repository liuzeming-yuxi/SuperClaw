'use client';

import { useState } from 'react';
import { Task } from '@/lib/types';
import { moveTask } from '@/lib/api';
import TaskCard from './TaskCard';

interface BoardColumnProps {
  phase: string;
  tasks: Task[];
  onMoved: () => void;
}

const PHASE_LABELS: Record<string, string> = {
  inbox: 'Inbox',
  aligning: 'Aligning',
  planned: 'Planned',
  executing: 'Executing',
  reviewing: 'Reviewing',
  done: 'Done',
  blocked: 'Blocked',
};

export default function BoardColumn({ phase, tasks, onMoved }: BoardColumnProps) {
  const [dragOver, setDragOver] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);

    const taskId = e.dataTransfer.getData('taskId');
    const fromPhase = e.dataTransfer.getData('fromPhase');

    if (!taskId || fromPhase === phase) return;

    try {
      await moveTask(taskId, phase);
      onMoved();
    } catch (err) {
      console.error('Failed to move task:', err);
    }
  };

  return (
    <div className="column">
      <div className="column-header">
        <span>{PHASE_LABELS[phase] || phase}</span>
        <span className="column-count">{tasks.length}</span>
      </div>
      <div
        className={`column-body ${dragOver ? 'drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} />
        ))}
      </div>
    </div>
  );
}
