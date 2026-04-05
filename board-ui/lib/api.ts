import { BoardState, Task, AgentInfo } from './types';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:9876';

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`);
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

async function patchJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`API error: ${res.status} ${res.statusText}`);
  return res.json();
}

export async function fetchBoard(): Promise<BoardState> {
  return fetchJSON('/api/board');
}

export async function fetchTasks(filters?: {
  phase?: string;
  tier?: string;
  priority?: string;
}): Promise<Task[]> {
  const params = new URLSearchParams();
  if (filters?.phase) params.set('phase', filters.phase);
  if (filters?.tier) params.set('tier', filters.tier);
  if (filters?.priority) params.set('priority', filters.priority);
  const qs = params.toString();
  return fetchJSON(`/api/tasks${qs ? '?' + qs : ''}`);
}

export async function fetchTask(id: string): Promise<Task> {
  return fetchJSON(`/api/tasks/${id}`);
}

export async function moveTask(
  id: string,
  toPhase: string
): Promise<{ status: string; from?: string; to?: string }> {
  return patchJSON(`/api/tasks/${id}/move`, { to: toPhase });
}

export async function fetchAgents(): Promise<AgentInfo[]> {
  return fetchJSON('/api/agents');
}
