'use client';

import { Session, Agent } from '@/lib/api';

interface SidebarProps {
  sessions: Session[];
  agents: Agent[];
  selectedSession: string | null;
  onSelectSession: (id: string | null) => void;
  projectName: string;
  onBack: () => void;
}

export default function Sidebar({ sessions, agents, selectedSession, onSelectSession, projectName, onBack }: SidebarProps) {
  return (
    <div style={{
      width: 220,
      minWidth: 220,
      background: 'var(--bg-secondary)',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
    }}>
      {/* Header */}
      <div style={{ padding: '16px 14px', borderBottom: '1px solid var(--border)' }}>
        <button
          onClick={onBack}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: 12,
            marginBottom: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          ← Projects
        </button>
        <h2 style={{ fontSize: 15, fontWeight: 600 }}>{projectName}</h2>
      </div>

      {/* Active Sessions */}
      <div style={{ padding: '12px 0', flex: 1, overflowY: 'auto' }}>
        <div style={{ padding: '0 14px', marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
            Active Sessions
          </span>
        </div>

        {sessions.length === 0 ? (
          <div style={{ padding: '8px 14px', color: 'var(--text-muted)', fontSize: 12 }}>
            No active sessions
          </div>
        ) : (
          sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => onSelectSession(selectedSession === s.id ? null : s.id)}
              style={{
                padding: '8px 14px',
                cursor: 'pointer',
                background: selectedSession === s.id ? 'var(--bg-hover)' : 'transparent',
                borderLeft: selectedSession === s.id ? '2px solid var(--accent)' : '2px solid transparent',
                transition: 'background 0.15s',
              }}
              onMouseEnter={(e) => {
                if (selectedSession !== s.id) e.currentTarget.style.background = 'var(--bg-tertiary)';
              }}
              onMouseLeave={(e) => {
                if (selectedSession !== s.id) e.currentTarget.style.background = 'transparent';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>{s.icon}</span>
                <span style={{ fontSize: 13, fontWeight: 500 }}>#{s.id} {s.agent}</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 22 }}>
                {s.status}
              </div>
            </div>
          ))
        )}

        {/* Separator */}
        <div style={{ borderTop: '1px solid var(--border)', margin: '12px 14px' }} />

        {/* Persistent Agents */}
        <div style={{ padding: '0 14px', marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 1 }}>
            Agents
          </span>
        </div>

        {agents.map((a) => (
          <div key={a.name} style={{ padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 12 }}>⚙️</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500 }}>{a.name}</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                {a.enabled ? a.type : 'disabled'}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{
        padding: '12px 14px',
        borderTop: '1px solid var(--border)',
        fontSize: 12,
        color: 'var(--text-muted)',
      }}>
        Settings
      </div>
    </div>
  );
}
