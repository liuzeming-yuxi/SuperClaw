const API_BASE = 'http://192.168.16.30:9876';

export interface Project {
  id: string;
  name: string;
  path: string;
  description: string;
  task_count: number;
  phase_counts: Record<string, number>;
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
  blocked_reason: string;
  parent: string;
  spec_path: string;
  plan_path: string;
  title: string;
  body: string;
}

export interface Session {
  id: string;
  agent: string;
  status: string;
  taskId: string;
  icon: string;
}

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
  type?: string;
  priority?: string;
  tier?: string;
  description?: string;
}): Promise<Task> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/tasks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error('Failed to create task');
  return res.json();
}

export async function fetchSessions(projectId: string): Promise<Session[]> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/sessions`);
  if (!res.ok) throw new Error('Failed to fetch sessions');
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
