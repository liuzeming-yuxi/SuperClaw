'use client';

import { useState } from 'react';
import { TaskSession, Agent } from '@/lib/api';

interface SidebarProps {
  sessions: TaskSession[];
  agents: Agent[];
  selectedSession: string | null;
  onSelectSession: (id: string | null) => void;
  projectName: string;
  onBack: () => void;
}

const IconBack = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 3L5 8l5 5"/>
  </svg>
);

const IconSettings = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="2.5"/>
    <path d="M13.4 10a1.1 1.1 0 00.2 1.2l.04.04a1.33 1.33 0 11-1.88 1.88l-.04-.04a1.1 1.1 0 00-1.2-.2 1.1 1.1 0 00-.67 1.01v.12a1.33 1.33 0 11-2.67 0v-.06A1.1 1.1 0 006 12.9a1.1 1.1 0 00-1.2.2l-.04.04a1.33 1.33 0 11-1.88-1.88l.04-.04a1.1 1.1 0 00.2-1.2 1.1 1.1 0 00-1.01-.67h-.12a1.33 1.33 0 010-2.67h.06A1.1 1.1 0 003.1 6a1.1 1.1 0 00-.2-1.2l-.04-.04a1.33 1.33 0 111.88-1.88l.04.04a1.1 1.1 0 001.2.2h.05a1.1 1.1 0 00.67-1.01v-.12a1.33 1.33 0 012.67 0v.06A1.1 1.1 0 0010 3.1a1.1 1.1 0 001.2-.2l.04-.04a1.33 1.33 0 111.88 1.88l-.04.04a1.1 1.1 0 00-.2 1.2v.05a1.1 1.1 0 001.01.67h.12a1.33 1.33 0 010 2.67h-.06a1.1 1.1 0 00-1.01.67z"/>
  </svg>
);

const IconChevronDown = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 6l4 4 4-4"/>
  </svg>
);

const IconChevronRight = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 4l4 4-4 4"/>
  </svg>
);

const STATUS_COLORS: Record<string, string> = {
  running: '#f59e0b',
  pending: '#6b7280',
  aligning: '#8b5cf6',
  executing: '#f59e0b',
  reviewing: '#22c55e',
  idle: '#6b7280',
  done: '#10b981',
  completed: '#10b981',
  failed: '#ef4444',
};

export default function Sidebar({ sessions, agents, selectedSession, onSelectSession, projectName, onBack }: SidebarProps) {
  const [sessionsCollapsed, setSessionsCollapsed] = useState(false);
  const [agentsCollapsed, setAgentsCollapsed] = useState(false);

  return (
    <div style={{
      width: 240,
      minWidth: 240,
      background: 'var(--bg-secondary)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
    }}>
      {/* Header */}
      <div style={{
        padding: '14px 16px',
        borderBottom: '1px solid var(--border)',
      }}>
        <button
          onClick={onBack}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: 12,
            marginBottom: 8,
            padding: '2px 0',
            transition: 'color var(--transition-fast)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
        >
          <IconBack /> 返回项目列表
        </button>
        <h2 style={{
          fontSize: 15,
          fontWeight: 600,
          letterSpacing: '-0.01em',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>{projectName}</h2>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
        {/* Sessions section */}
        <button
          onClick={() => setSessionsCollapsed(!sessionsCollapsed)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            width: '100%',
            padding: '6px 16px',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.06em',
            textAlign: 'left',
          }}
        >
          <span style={{
            display: 'flex',
            transition: 'transform var(--transition-fast)',
            transform: sessionsCollapsed ? 'rotate(0deg)' : 'rotate(0deg)',
          }}>
            {sessionsCollapsed ? <IconChevronRight /> : <IconChevronDown />}
          </span>
          活跃会话
          <span style={{
            marginLeft: 'auto',
            background: 'var(--bg-hover)',
            padding: '0 6px',
            borderRadius: 8,
            fontSize: 10,
          }}>
            {sessions.length}
          </span>
        </button>

        {!sessionsCollapsed && (
          <div style={{ padding: '4px 0' }}>
            {sessions.length === 0 ? (
              <div style={{ padding: '10px 16px', color: 'var(--text-muted)', fontSize: 12 }}>
                暂无活跃会话
              </div>
            ) : (
              sessions.map((s) => (
                <div
                  key={s.id}
                  onClick={() => onSelectSession(selectedSession === s.id ? null : s.id)}
                  style={{
                    padding: '8px 16px',
                    cursor: 'pointer',
                    background: selectedSession === s.id ? 'var(--accent-glow)' : 'transparent',
                    borderLeft: selectedSession === s.id ? '2px solid var(--accent)' : '2px solid transparent',
                    transition: 'all var(--transition-fast)',
                    marginLeft: 0,
                  }}
                  onMouseEnter={(e) => {
                    if (selectedSession !== s.id) e.currentTarget.style.background = 'var(--bg-hover)';
                  }}
                  onMouseLeave={(e) => {
                    if (selectedSession !== s.id) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{
                      width: 7,
                      height: 7,
                      borderRadius: '50%',
                      background: STATUS_COLORS[s.status] || '#6b7280',
                      flexShrink: 0,
                      boxShadow: `0 0 6px ${STATUS_COLORS[s.status] || '#6b7280'}40`,
                    }} />
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{s.agent}</span>
                    <span style={{
                      fontSize: 10,
                      color: 'var(--text-muted)',
                      fontFamily: 'monospace',
                      marginLeft: 'auto',
                    }}>
                      #{s.id}
                    </span>
                  </div>
                  <div style={{
                    fontSize: 11,
                    color: 'var(--text-muted)',
                    marginLeft: 15,
                    marginTop: 2,
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}>
                    <span>
                      {s.status === 'running' ? '运行中' :
                       s.status === 'pending' ? '等待中' :
                       s.status === 'aligning' ? '对齐中' :
                       s.status === 'executing' ? '执行中' :
                       s.status === 'reviewing' ? '验收中' :
                       s.status === 'completed' ? '已完成' :
                       s.status === 'failed' ? '失败' :
                       s.status === 'idle' ? '空闲' :
                       s.status === 'done' ? '已完成' : s.status}
                    </span>
                    {s.task_id && (
                      <span style={{ fontFamily: 'monospace', fontSize: 10 }}>
                        任务 #{s.task_id}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {/* Separator */}
        <div style={{ height: 1, background: 'var(--border)', margin: '8px 16px' }} />

        {/* Agents section */}
        <button
          onClick={() => setAgentsCollapsed(!agentsCollapsed)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            width: '100%',
            padding: '6px 16px',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: 11,
            fontWeight: 600,
            textTransform: 'uppercase' as const,
            letterSpacing: '0.06em',
            textAlign: 'left',
          }}
        >
          <span style={{ display: 'flex' }}>
            {agentsCollapsed ? <IconChevronRight /> : <IconChevronDown />}
          </span>
          持久 Agent
          <span style={{
            marginLeft: 'auto',
            background: 'var(--bg-hover)',
            padding: '0 6px',
            borderRadius: 8,
            fontSize: 10,
          }}>
            {agents.length}
          </span>
        </button>

        {!agentsCollapsed && (
          <div style={{ padding: '4px 0' }}>
            {agents.length === 0 ? (
              <div style={{ padding: '10px 16px', color: 'var(--text-muted)', fontSize: 12 }}>
                暂无 Agent
              </div>
            ) : (
              agents.map((a) => (
                <div key={a.name} style={{
                  padding: '8px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                }}>
                  <div style={{
                    width: 28,
                    height: 28,
                    borderRadius: 'var(--radius-sm)',
                    background: a.enabled ? 'var(--info-bg)' : 'var(--bg-hover)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: a.enabled ? 'var(--info)' : 'var(--text-muted)',
                    fontSize: 12,
                    fontWeight: 600,
                    flexShrink: 0,
                  }}>
                    {a.name.charAt(0).toUpperCase()}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{a.name}</div>
                    <div style={{
                      fontSize: 11,
                      color: a.enabled ? 'var(--text-muted)' : 'var(--danger)',
                    }}>
                      {a.enabled ? a.type : '未启用'}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{
        padding: '10px 16px',
        borderTop: '1px solid var(--border)',
      }}>
        <button
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            width: '100%',
            padding: '6px 8px',
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: 12,
            borderRadius: 'var(--radius-sm)',
            transition: 'all var(--transition-fast)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--bg-hover)';
            e.currentTarget.style.color = 'var(--text-secondary)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'none';
            e.currentTarget.style.color = 'var(--text-muted)';
          }}
        >
          <IconSettings /> 设置
        </button>
      </div>
    </div>
  );
}
