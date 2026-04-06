'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { fetchTasks, fetchSessions, fetchAgents, fetchProjects, Task, TaskSession, Agent, Project } from '@/lib/api';
import { subscribe } from '@/lib/ws';
import Sidebar from '@/components/Sidebar';
import KanbanBoard from '@/components/KanbanBoard';
import ChatPanel from '@/components/ChatPanel';
import TaskDetail from '@/components/TaskDetail';

export default function ProjectBoardPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [sessions, setSessions] = useState<TaskSession[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [t, s, a] = await Promise.all([
        fetchTasks(projectId),
        fetchSessions(projectId),
        fetchAgents(projectId),
      ]);
      setTasks(t || []);
      setSessions(s || []);
      setAgents(a || []);
    } catch (err) {
      console.error('Failed to load data:', err);
    }
  }, [projectId]);

  useEffect(() => {
    // Load project info
    fetchProjects().then((projects) => {
      const p = projects.find((p) => p.id === projectId);
      if (p) setProject(p);
    });

    loadData().finally(() => setLoading(false));
  }, [projectId, loadData]);

  // WebSocket: refresh on board changes
  useEffect(() => {
    const unsub = subscribe((msg) => {
      if (msg.type === 'board_changed' || msg.type === 'task_moved' || msg.type === 'task_created') {
        loadData();
      }
    });
    return unsub;
  }, [loadData]);

  const selectedSessionObj = sessions.find((s) => s.id === selectedSession);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-muted)' }}>
        加载中...
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      <Sidebar
        sessions={sessions}
        agents={agents}
        selectedSession={selectedSession}
        onSelectSession={setSelectedSession}
        projectName={project?.name || projectId}
        onBack={() => router.push('/')}
      />

      <KanbanBoard
        projectId={projectId}
        tasks={tasks}
        onTaskClick={(task) => setSelectedTask(task)}
        onRefresh={loadData}
      />

      <ChatPanel
        sessionId={selectedSession}
        sessionAgent={selectedSessionObj?.agent}
      />

      {selectedTask && (
        <TaskDetail
          projectId={projectId}
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
        />
      )}
    </div>
  );
}
