export interface Task {
  id: string;
  slug: string;
  title: string;
  phase: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  type: 'feature' | 'bugfix' | 'refactor' | 'chore' | 'spike';
  tier: 'T0' | 'T1' | 'T2' | 'T3';
  assignee: string;
  created: string;
  updated: string;
  blocked_reason: string;
  spec_path: string;
  plan_path: string;
  content?: string;
  file_path?: string;
}

export interface BoardState {
  phases: Record<string, Task[]>;
}

export interface AgentInfo {
  name: string;
  status: 'idle' | 'running' | 'error';
  last_run: string;
  next_eligible: string;
  type: string;
}

export type WSEvent =
  | { type: 'task_moved'; taskId: string; from: string; to: string }
  | { type: 'task_updated'; taskId: string; fields: Partial<Task> }
  | { type: 'task_created'; task: Task }
  | { type: 'agent_status'; agentName: string; status: string }
  | { type: 'board_reload' };
