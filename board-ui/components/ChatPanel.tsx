'use client';

import { useState } from 'react';

interface ChatPanelProps {
  sessionId: string | null;
  sessionAgent?: string;
}

const IconSend = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2L7 9M14 2l-4.5 12L7 9 2 7.5 14 2z"/>
  </svg>
);

const IconMessage = () => (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
  </svg>
);

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
        padding: '12px 16px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}>
        <div style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: sessionId ? 'var(--success)' : 'var(--accent)',
          boxShadow: sessionId ? '0 0 6px var(--success)' : '0 0 6px var(--accent)',
          flexShrink: 0,
        }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {sessionId ? `${sessionAgent || 'Agent'} 会话` : 'OpenClaw 频道'}
          </div>
          {sessionId && (
            <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>会话 #{sessionId}</div>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          textAlign: 'center',
          color: 'var(--text-muted)',
          gap: 14,
        }}>
          <div style={{
            width: 48,
            height: 48,
            borderRadius: 'var(--radius-lg)',
            background: 'var(--bg-hover)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <IconMessage />
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 4 }}>
              {sessionId ? '会话消息将在此显示' : 'OpenClaw 集成即将上线'}
            </div>
            <div style={{ fontSize: 11 }}>
              目前请使用飞书进行沟通
            </div>
          </div>
        </div>
      </div>

      {/* Input */}
      <div style={{
        padding: '10px 16px',
        borderTop: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={sessionId ? '发送消息...' : '发送消息至 OpenClaw...'}
            style={{
              flex: 1,
              background: 'var(--bg-primary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '9px 12px',
              color: 'var(--text-primary)',
              outline: 'none',
              fontSize: 13,
              transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
            }}
            disabled
          />
          <button
            disabled
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
              padding: '9px 12px',
              borderRadius: 'var(--radius-sm)',
            }}
          >
            <IconSend />
          </button>
        </div>
      </div>
    </div>
  );
}
