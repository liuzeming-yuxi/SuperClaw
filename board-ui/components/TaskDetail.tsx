'use client';

import { Task, TaskSession, fetchArtifact, ArtifactResponse } from '@/lib/api';
import { useState, useEffect } from 'react';

interface TaskDetailProps {
  projectId: string;
  task: Task;
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

const STATUS_LABELS: Record<string, string> = {
  running: '运行中',
  pending: '等待中',
  completed: '已完成',
  failed: '失败',
  cancelled: '已取消',
  aligning: '对齐中',
  executing: '执行中',
  reviewing: '验收中',
};

const STATUS_COLORS: Record<string, string> = {
  running: '#f59e0b',
  pending: '#6b7280',
  completed: '#10b981',
  failed: '#ef4444',
  cancelled: '#6b7280',
  aligning: '#8b5cf6',
  executing: '#f59e0b',
  reviewing: '#22c55e',
};

type TabId = 'detail' | 'spec' | 'plan' | 'progress' | 'verify_report' | 'deliver_summary' | 'sessions';

const ARTIFACT_TABS: { id: TabId; label: string; artType: string }[] = [
  { id: 'spec', label: '规格', artType: 'spec' },
  { id: 'plan', label: '计划', artType: 'plan' },
  { id: 'progress', label: '进度', artType: 'progress' },
  { id: 'verify_report', label: '验收报告', artType: 'verify_report' },
  { id: 'deliver_summary', label: '交付摘要', artType: 'deliver_summary' },
];

const IconX = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M4 4l8 8M12 4l-8 8"/>
  </svg>
);

export default function TaskDetail({ projectId, task, onClose }: TaskDetailProps) {
  const [activeTab, setActiveTab] = useState<TabId>('detail');
  const [artifactData, setArtifactData] = useState<Record<string, ArtifactResponse>>({});
  const [loadingArtifact, setLoadingArtifact] = useState<string | null>(null);

  const taskSessions: TaskSession[] = task.sessions || [];

  const sessionCount = taskSessions.length;

  // Count which artifacts exist
  const arts = task.artifacts || {};
  const hasArtifact = (type: string) => {
    const map: Record<string, string> = {
      spec: arts.spec,
      plan: arts.plan,
      progress: arts.progress,
      verify_report: arts.verify_report,
      deliver_summary: arts.deliver_summary,
    };
    return !!map[type];
  };

  const tabs: { id: TabId; label: string }[] = [
    { id: 'detail', label: '详情' },
    ...ARTIFACT_TABS.map((t) => ({
      id: t.id,
      label: t.label + (hasArtifact(t.artType) ? '' : ''),
    })),
    { id: 'sessions', label: `会话 (${sessionCount})` },
  ];

  // Load artifact when tab switches
  useEffect(() => {
    const artTab = ARTIFACT_TABS.find((t) => t.id === activeTab);
    if (!artTab) return;
    if (artifactData[artTab.artType]) return;

    setLoadingArtifact(artTab.artType);
    fetchArtifact(projectId, task.id, artTab.artType)
      .then((data) => setArtifactData((prev) => ({ ...prev, [artTab.artType]: data })))
      .catch(() => setArtifactData((prev) => ({ ...prev, [artTab.artType]: { content: '', path: '', exists: false } })))
      .finally(() => setLoadingArtifact(null));
  }, [activeTab, projectId, task.id, artifactData]);

  return (
    <div
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 100, backdropFilter: 'blur(4px)',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        width: '90%', maxWidth: 780, maxHeight: '85vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: 'var(--shadow-modal)', overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: 12 }}>#{task.id}</span>
                {task.tier && <span className={`tier-badge tier-${task.tier}`}>{task.tier}</span>}
                {task.priority && (
                  <span className={`priority-badge ${task.priority}`}>
                    {PRIORITY_LABELS[task.priority] || task.priority}
                  </span>
                )}
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  padding: '2px 10px', borderRadius: 10, fontSize: 11, fontWeight: 500,
                  background: `${PHASE_COLORS[task.phase] || 'var(--text-muted)'}18`,
                  color: PHASE_COLORS[task.phase] || 'var(--text-muted)',
                }}>
                  <div style={{ width: 6, height: 6, borderRadius: '50%', background: PHASE_COLORS[task.phase] || 'var(--text-muted)' }} />
                  {PHASE_LABELS[task.phase] || task.phase}
                </span>
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.35 }}>
                {task.title || task.slug || `Task ${task.id}`}
              </h2>
            </div>
            <button onClick={onClose}
              style={{
                background: 'var(--bg-hover)', border: 'none', color: 'var(--text-muted)',
                padding: 6, borderRadius: 'var(--radius-sm)', display: 'flex',
                alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginLeft: 12,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-primary)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-muted)'; }}
            >
              <IconX />
            </button>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0, overflowX: 'auto' }}>
            {tabs.map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                style={{
                  background: 'none', border: 'none', padding: '6px 12px', fontSize: 12, whiteSpace: 'nowrap',
                  fontWeight: activeTab === tab.id ? 600 : 400,
                  color: activeTab === tab.id ? 'var(--accent)' : 'var(--text-muted)',
                  borderBottom: activeTab === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
                  transition: 'all var(--transition-fast)',
                }}>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
          {activeTab === 'detail' && <DetailTab task={task} />}
          {ARTIFACT_TABS.some((t) => t.id === activeTab) && (
            <ArtifactTab
              artType={ARTIFACT_TABS.find((t) => t.id === activeTab)!.artType}
              data={artifactData[ARTIFACT_TABS.find((t) => t.id === activeTab)!.artType]}
              loading={loadingArtifact === ARTIFACT_TABS.find((t) => t.id === activeTab)!.artType}
            />
          )}
          {activeTab === 'sessions' && <SessionsTab sessions={taskSessions} />}
        </div>
      </div>
    </div>
  );
}

function DetailTab({ task }: { task: Task }) {
  return (
    <>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1,
        marginBottom: 20, background: 'var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden',
      }}>
        {[
          { label: '类型', value: task.type || '-' },
          { label: '负责人', value: task.assignee || '未分配' },
          { label: '创建时间', value: task.created ? new Date(task.created).toLocaleDateString('zh-CN') : '-' },
        ].map((item) => (
          <div key={item.label} style={{ padding: '10px 14px', background: 'var(--bg-primary)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3, fontWeight: 500 }}>{item.label}</div>
            <div style={{ fontSize: 13 }}>{item.value}</div>
          </div>
        ))}
      </div>

      {task.blocked_reason && (
        <div style={{
          padding: '10px 14px', background: 'var(--danger-bg)',
          borderRadius: 'var(--radius-md)', border: '1px solid rgba(239, 68, 68, 0.2)', marginBottom: 20,
        }}>
          <div style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 600, marginBottom: 4 }}>阻塞原因</div>
          <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{task.blocked_reason}</div>
        </div>
      )}

      {task.body && (
        <div style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--text-secondary)' }}>内容</h3>
          <pre style={{
            background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)', padding: 14,
            fontSize: 13, whiteSpace: 'pre-wrap', color: 'var(--text-secondary)',
            lineHeight: 1.65, border: '1px solid var(--border)',
          }}>
            {task.body}
          </pre>
        </div>
      )}
    </>
  );
}

function ArtifactTab({ artType, data, loading }: { artType: string; data?: ArtifactResponse; loading: boolean }) {
  const LABELS: Record<string, string> = {
    spec: '规格文档',
    plan: '执行计划',
    progress: '进度记录',
    verify_report: '验收报告',
    deliver_summary: '交付摘要',
  };

  if (loading) {
    return <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)', fontSize: 13 }}>加载中...</div>;
  }

  if (!data || !data.exists) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 13, marginBottom: 4 }}>暂无{LABELS[artType] || '文档'}</div>
        <div style={{ fontSize: 11 }}>该文档将在对应阶段生成</div>
      </div>
    );
  }

  return (
    <div>
      {data.path && (
        <div style={{ marginBottom: 12, fontSize: 11, color: 'var(--text-muted)' }}>
          <code style={{ fontFamily: 'monospace' }}>{data.path}</code>
        </div>
      )}
      <pre style={{
        background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)', padding: 14,
        fontSize: 13, whiteSpace: 'pre-wrap', color: 'var(--text-secondary)',
        lineHeight: 1.65, border: '1px solid var(--border)',
      }}>
        {data.content}
      </pre>
    </div>
  );
}

function SessionsTab({ sessions }: { sessions: TaskSession[] }) {
  if (sessions.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
        <div style={{ fontSize: 13, marginBottom: 4 }}>暂无关联会话</div>
        <div style={{ fontSize: 11 }}>Agent 开始处理后会话将在此显示</div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {sessions.map((s) => (
        <div key={s.id} style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 14px', background: 'var(--bg-primary)',
          borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
        }}>
          <div style={{
            width: 7, height: 7, borderRadius: '50%',
            background: STATUS_COLORS[s.status] || '#6b7280', flexShrink: 0,
          }} />
          <div style={{ flex: 1 }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{s.agent}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>#{s.id}</span>
            {s.phase && (
              <span style={{ fontSize: 10, color: 'var(--text-muted)', marginLeft: 8 }}>({s.phase})</span>
            )}
          </div>
          <span style={{
            fontSize: 11, padding: '2px 8px', borderRadius: 8,
            background: `${STATUS_COLORS[s.status] || '#6b7280'}18`,
            color: STATUS_COLORS[s.status] || 'var(--text-muted)',
            fontWeight: 500,
          }}>
            {STATUS_LABELS[s.status] || s.status}
          </span>
        </div>
      ))}
    </div>
  );
}
