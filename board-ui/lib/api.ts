const API_BASE = 'http://192.168.16.30:9876';

export interface Project {
  id: string;
  name: string;
  path: string;
  description: string;
  task_count: number;
  phase_counts: Record<string, number>;
}

export interface TaskArtifacts {
  spec: string;
  plan: string;
  progress: string;
  verify_report: string;
  deliver_summary: string;
}

export interface TaskSession {
  id: string;
  agent: string;
  phase: string;
  status: string;
  started: string;
  updated: string;
  task_id: string;
}

export interface Task {
  id: string;
  slug: string;
  created: string;
  updated: string;
  assignee: string;
  priority: string;
  type: string;
  tier: string;
  phase: string;
  previous_phase: string;
  blocked_reason: string;
  parent: string;
  spec_path: string;
  plan_path: string;
  sessions: TaskSession[];
  artifacts: TaskArtifacts;
  verify_command: string;
  verify_expect: string;
  title: string;
  body: string;
}

// Keep backward compat alias
export type Session = TaskSession;

export interface Agent {
  name: string;
  skill: string;
  type: string;
  enabled: boolean;
}

export interface DirEntry {
  name: string;
  path: string;
  has_git: boolean;
}

export interface BrowseResult {
  current: string;
  parent: string;
  directories: DirEntry[];
}

export interface ArtifactResponse {
  content: string;
  path: string;
  exists: boolean;
}

export async function fetchProjects(): Promise<Project[]> {
  const res = await fetch(`${API_BASE}/api/projects`);
  if (!res.ok) throw new Error('Failed to fetch projects');
  return res.json();
}

export async function createProject(project: Omit<Project, 'task_count' | 'phase_counts'>): Promise<Project> {
  const res = await fetch(`${API_BASE}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(project),
  });
  if (!res.ok) throw new Error('Failed to create project');
  return res.json();
}

export async function fetchTasks(projectId: string): Promise<Task[]> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/tasks`);
  if (!res.ok) throw new Error('Failed to fetch tasks');
  return res.json();
}

export async function fetchTask(projectId: string, taskId: string): Promise<Task> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/tasks/${taskId}`);
  if (!res.ok) throw new Error('Failed to fetch task');
  return res.json();
}

export async function moveTask(projectId: string, taskId: string, phase: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/tasks/${taskId}/move`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phase }),
  });
  if (!res.ok) throw new Error('Failed to move task');
}

export async function createTask(projectId: string, data: {
  title: string;
  description?: string;
  type?: string;
  priority?: string;
  tier?: string;
  acceptance_criteria?: string[];
  verify_command?: string;
  verify_expect?: string;
}): Promise<Task> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create task');
  return res.json();
}

export async function updateTask(projectId: string, taskId: string, updates: Record<string, unknown>): Promise<Task> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/tasks/${taskId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  if (!res.ok) throw new Error('Failed to update task');
  return res.json();
}

export async function addSession(projectId: string, taskId: string, agent: string, phase?: string): Promise<TaskSession> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/tasks/${taskId}/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ agent, phase: phase || 'executing' }),
  });
  if (!res.ok) throw new Error('Failed to add session');
  return res.json();
}

export async function updateSession(projectId: string, taskId: string, sessionId: string, status: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/tasks/${taskId}/sessions/${sessionId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!res.ok) throw new Error('Failed to update session');
}

export async function fetchSessions(projectId: string): Promise<TaskSession[]> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/sessions`);
  if (!res.ok) throw new Error('Failed to fetch sessions');
  return res.json();
}

export async function fetchArtifact(projectId: string, taskId: string, type: string): Promise<ArtifactResponse> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/tasks/${taskId}/artifacts/${type}`);
  if (!res.ok) throw new Error('Failed to fetch artifact');
  return res.json();
}

export async function putArtifact(projectId: string, taskId: string, type: string, content: string): Promise<{ path: string }> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/tasks/${taskId}/artifacts/${type}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error('Failed to save artifact');
  return res.json();
}

export async function fetchAgents(projectId: string): Promise<Agent[]> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/agents`);
  if (!res.ok) throw new Error('Failed to fetch agents');
  return res.json();
}

export async function browseFilesystem(path?: string): Promise<BrowseResult> {
  const params = path ? `?path=${encodeURIComponent(path)}` : '';
  const res = await fetch(`${API_BASE}/api/filesystem/browse${params}`);
  if (!res.ok) throw new Error('Failed to browse filesystem');
  return res.json();
}
