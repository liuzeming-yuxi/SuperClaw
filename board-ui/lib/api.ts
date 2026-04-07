const API_BASE = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:9876';

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
  verify: string;
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

export async function mkdirFilesystem(path: string): Promise<{ path: string }> {
  const res = await fetch(`${API_BASE}/api/filesystem/mkdir`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) throw new Error('Failed to create directory');
  return res.json();
}

export async function renameFilesystem(oldPath: string, newName: string): Promise<{ path: string }> {
  const res = await fetch(`${API_BASE}/api/filesystem/rename`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ old_path: oldPath, new_name: newName }),
  });
  if (!res.ok) throw new Error('Failed to rename directory');
  return res.json();
}

// Chat API

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  phase: string;
}

export interface ChatSession {
  phase: string;
  backend: string;
}

export interface ChatHistoryResponse {
  messages: ChatMessage[];
  session: ChatSession;
}

export async function fetchChatHistory(projectId: string, taskId: string): Promise<ChatHistoryResponse> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/tasks/${taskId}/chat/history`);
  if (!res.ok) throw new Error('Failed to fetch chat history');
  return res.json();
}

export function sendChatMessage(
  projectId: string,
  taskId: string,
  content: string,
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: string) => void,
): AbortController {
  const controller = new AbortController();

  fetch(`${API_BASE}/api/projects/${projectId}/tasks/${taskId}/chat/send`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
    signal: controller.signal,
  }).then(async (res) => {
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'unknown error' }));
      onError(err.error || '发送失败');
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      onError('无法读取流');
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') {
          onDone();
          return;
        }
        try {
          const parsed = JSON.parse(data);
          if (parsed.content) {
            onChunk(parsed.content);
          }
          if (parsed.error) {
            onError(parsed.error);
            return;
          }
        } catch {
          // skip parse errors
        }
      }
    }
    onDone();
  }).catch((err) => {
    if (err.name !== 'AbortError') {
      onError(err.message || '网络错误');
    }
  });

  return controller;
}

export async function switchChatBackend(projectId: string, taskId: string, backend: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/projects/${projectId}/tasks/${taskId}/chat/switch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ backend }),
  });
  if (!res.ok) throw new Error('Failed to switch backend');
}
