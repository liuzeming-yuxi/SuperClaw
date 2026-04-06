'use client';

import { Task, Session } from '@/lib/api';
import { useState } from 'react';

interface TaskDetailProps {
  task: Task;
  sessions: Session[];
  onClose: () => void;
}

const PHASE_LABELS: Record<string, string> = {
  inbox: '待处理',
  aligning: '对齐中',
  planned: '已规划',
  executing: '执行中',
  reviewing: '验收中',
  done: '已完成',
  blocked: '已阻塞',
};

const PHASE_COLORS: Record<string, string> = {
  inbox: '#6b7280',
  aligning: '#8b5cf6',
  planned: '#3b82f6',
  executing: '#f59e0b',
  reviewing: '#22c55e',
  done: '#10b981',
  blocked: '#ef4444',
};

const PRIORITY_LABELS: Record<string, string> = {
  critical: '紧急',
  high: '高',
  medium: '中',
  low: '低',
};

const IconX = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M4 4l8 8M12 4l-8 8"/>
  </svg>
);

const IconFile = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 1H4a1.5 1.5 0 00-1.5 1.5v11A1.5 1.5 0 004 15h8a1.5 1.5 0 001.5-1.5V5.5L9 1z"/>
    <path d="M9 1v5h4.5"/>
  </svg>
);

export default function TaskDetail({ task, sessions, onClose }: TaskDetailProps) {
  const [activeTab, setActiveTab] = useState<'detail' | 'spec' | 'sessions'>('detail');
  const taskSessions = sessions.filter((s) => s.taskId === task.id);

  const tabs = [
    { id: 'detail' as const, label: '详情' },
    { id: 'spec' as const, label: '规格/计划' },
    { id: 'sessions' as const, label: `会话 (${taskSessions.length})` },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        width: '90%',
        maxWidth: 720,
        maxHeight: '85vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'var(--shadow-modal)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '18px 24px 14px',
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{
                  fontFamily: 'monospace',
                  color: 'var(--text-muted)',
                  fontSize: 12,
                }}>#{task.id}</span>
                {task.tier && (
                  <span className={`tier-badge tier-${task.tier}`}>{task.tier}</span>
                )}
                {task.priority && (
                  <span className={`priority-badge ${task.priority}`}>
                    {PRIORITY_LABELS[task.priority] || task.priority}
                  </span>
                )}
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 5,
                  padding: '2px 10px',
                  borderRadius: 10,
                  fontSize: 11,
                  fontWeight: 500,
                  background: `${PHASE_COLORS[task.phase] || 'var(--text-muted)'}18`,
                  color: PHASE_COLORS[task.phase] || 'var(--text-muted)',
                }}>
                  <div style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: PHASE_COLORS[task.phase] || 'var(--text-muted)',
                  }} />
                  {PHASE_LABELS[task.phase] || task.phase}
                </span>
              </div>
              <h2 style={{
                fontSize: 18,
                fontWeight: 600,
                letterSpacing: '-0.01em',
                lineHeight: 1.35,
              }}>
                {task.title || task.slug || `Task ${task.id}`}
              </h2>
            </div>
            <button
              onClick={onClose}
              style={{
                background: 'var(--bg-hover)',
                border: 'none',
                color: 'var(--text-muted)',
                padding: 6,
                borderRadius: 'var(--radius-sm)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
                marginLeft: 12,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
            >
              <IconX />
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0 }}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '6px 14px',
                  fontSize: 13,
                  fontWeight: activeTab === tab.id ? 600 : 400,
                  color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-muted)',
                  borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
                  transition: 'all var(--transition-fast)',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          {activeTab === 'detail' && (
            <>
              {/* Meta grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(3, 1fr)',
                gap: 1,
                marginBottom: 20,
                background: 'var(--border)',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
              }}>
                {[
                  { label: '类型', value: task.type || '-' },
                  { label: '负责人', value: task.assignee || '未分配' },
                  { label: '创建时间', value: task.created ? new Date(task.created).toLocaleDateString('zh-CN') : '-' },
                ].map((item) => (
                  <div key={item.label} style={{
                    padding: '10px 14px',
                    background: 'var(--bg-primary)',
                  }}>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3, fontWeight: 500 }}>{item.label}</div>
                    <div style={{ fontSize: 13 }}>{item.value}</div>
                  </div>
                ))}
              </div>

              {/* Blocked reason */}
              {task.blocked_reason && (
                <div style={{
                  padding: '10px 14px',
                  background: 'var(--danger-bg)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid rgba(239, 68, 68, 0.2)',
                  marginBottom: 20,
                }}>
                  <div style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 600, marginBottom: 4 }}>阻塞原因</div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{task.blocked_reason}</div>
                </div>
              )}

              {/* Body */}
              {task.body && (
                <div style={{ marginBottom: 20 }}>
                  <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--text-secondary)' }}>内容</h3>
                  <pre style={{
                    background: 'var(--bg-primary)',
                    borderRadius: 'var(--radius-md)',
                    padding: 14,
                    fontSize: 13,
                    whiteSpace: 'pre-wrap',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.65,
                    border: '1px solid var(--border)',
                  }}>
                    {task.body}
                  </pre>
                </div>
              )}
            </>
          )}

          {activeTab === 'spec' && (
            <div>
              {(task.spec_path || task.plan_path) ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {task.spec_path && (
                    <div style={artifactCard}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <IconFile />
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>规格文档</span>
                      </div>
                      <code style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                        {task.spec_path}
                      </code>
                    </div>
                  )}
                  {task.plan_path && (
                    <div style={artifactCard}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <IconFile />
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>执行计划</span>
                      </div>
                      <code style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                        {task.plan_path}
                      </code>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{
                  textAlign: 'center',
                  padding: '40px 20px',
                  color: 'var(--text-muted)',
                }}>
                  <div style={{ fontSize: 13, marginBottom: 4 }}>暂无规格或计划文档</div>
                  <div style={{ fontSize: 11 }}>任务规格和计划将在对齐阶段生成</div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'sessions' && (
            <div>
              {taskSessions.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '40px 20px',
                  color: 'var(--text-muted)',
                }}>
                  <div style={{ fontSize: 13, marginBottom: 4 }}>暂无关联会话</div>
                  <div style={{ fontSize: 11 }}>Agent 开始处理后会话将在此显示</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {taskSessions.map((s) => (
                    <div key={s.id} style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 10,
                      padding: '10px 14px',
                      background: 'var(--bg-primary)',
                      borderRadius: 'var(--radius-md)',
                      border: '1px solid var(--border)',
                    }}>
                      <div style={{
                        width: 7,
                        height: 7,
                        borderRadius: '50%',
                        background: s.status === 'executing' ? 'var(--warning)' : s.status === 'done' ? 'var(--success)' : 'var(--info)',
                        flexShrink: 0,
                      }} />
                      <div style={{ flex: 1 }}>
                        <span style={{ fontSize: 13, fontWeight: 500 }}>{s.agent}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>#{s.id}</span>
                      </div>
                      <span style={{
                        fontSize: 11,
                        padding: '2px 8px',
                        borderRadius: 8,
                        background: 'var(--bg-hover)',
                        color: 'var(--text-muted)',
                      }}>
                        {s.status === 'aligning' ? '对齐中' :
                         s.status === 'executing' ? '执行中' :
                         s.status === 'reviewing' ? '验收中' :
                         s.status === 'done' ? '已完成' : s.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const artifactCard: React.CSSProperties = {
  background: 'var(--bg-primary)',
  padding: '12px 16px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border)',
};
