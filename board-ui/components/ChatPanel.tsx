'use client';

import { useState } from 'react';

interface ChatPanelProps {
  sessionId: string | null;
  sessionAgent?: string;
}

export default function ChatPanel({ sessionId, sessionAgent }: ChatPanelProps) {
  const [input, setInput] = useState('');

  return (
    <div style={{
      width: 300,
      minWidth: 300,
      background: 'var(--bg-secondary)',
      borderLeft: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
    }}>
      {/* Header */}
      <div style={{
        padding: '12px 14px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <div style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: sessionId ? 'var(--success)' : 'var(--accent)',
        }} />
        <span style={{ fontSize: 13, fontWeight: 600 }}>
          {sessionId ? `Session #${sessionId} — ${sessionAgent || 'Agent'}` : 'OpenClaw Channel'}
        </span>
      </div>

      {/* Messages area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 14 }}>
        {/* Placeholder */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          textAlign: 'center',
          color: 'var(--text-muted)',
          gap: 12,
        }}>
          <div style={{ fontSize: 32 }}>💬</div>
          <div style={{ fontSize: 13 }}>
            {sessionId
              ? 'Session conversation will appear here.'
              : 'OpenClaw integration coming soon.'}
          </div>
          <div style={{ fontSize: 11 }}>
            Use Feishu for now.
          </div>
        </div>
      </div>

      {/* Input */}
      <div style={{
        padding: '10px 14px',
        borderTop: '1px solid var(--border)',
      }}>
        <div style={{
          display: 'flex',
          gap: 8,
        }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={sessionId ? 'Message this session...' : 'Message OpenClaw...'}
            style={{
              flex: 1,
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 6,
              padding: '8px 10px',
              color: 'var(--text-primary)',
              outline: 'none',
              fontSize: 13,
            }}
            disabled
          />
          <button
            disabled
            style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
              padding: '8px 12px',
              borderRadius: 6,
              fontSize: 13,
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
