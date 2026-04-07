'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { fetchTask, fetchSessions, triggerTask, fetchPipelineStatus, Task, TaskSession, PipelineTaskStatus } from '@/lib/api';
import { subscribe } from '@/lib/ws';

const PHASE_LABELS: Record<string, string> = {
  inbox: '待处理', aligning: '对齐中', planned: '已规划',
  executing: '执行中', reviewing: '验收中', done: '已完成', blocked: '已阻塞',
};

const PHASE_COLORS: Record<string, string> = {
  inbox: '#6b7280', aligning: '#8b5cf6', planned: '#3b82f6',
  executing: '#f59e0b', reviewing: '#22c55e', done: '#10b981', blocked: '#ef4444',
};

// Actions available for each phase
const PHASE_ACTIONS: Record<string, { action: string; label: string; color: string }[]> = {
  inbox: [{ action: 'start_align', label: '开始对齐', color: '#8b5cf6' }],
  aligning: [{ action: 'approve_spec', label: '确认规格', color: '#3b82f6' }],
  planned: [{ action: 'dispatch', label: '开始执行', color: '#f59e0b' }],
  executing: [{ action: 'verify', label: '触发验收', color: '#22c55e' }],
  reviewing: [
    { action: 'approve', label: '通过验收', color: '#10b981' },
    { action: 'verify', label: '重新验收', color: '#f59e0b' },
  ],
};

const IconBack = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 3L5 8l5 5"/>
  </svg>
);

const IconFile = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 1H4a1.5 1.5 0 00-1.5 1.5v11A1.5 1.5 0 004 15h8a1.5 1.5 0 001.5-1.5V5.5L9 1z"/>
    <path d="M9 1v5h4.5"/>
  </svg>
);

const IconPlay = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M4 2.5v11l9-5.5z"/>
  </svg>
);

const IconSpinner = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" style={{ animation: 'spin 1s linear infinite' }}>
    <path d="M8 1a7 7 0 106.93 6"/>
  </svg>
);

const ACTION_LABELS: Record<string, string> = {
  generating_plan: '正在生成计划...',
  executing_code: '正在执行代码...',
  verifying: '正在验收...',
};

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.id as string;
  const taskId = params.taskId as string;

  const [task, setTask] = useState<Task | null>(null);
  const [sessions, setSessions] = useState<TaskSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [triggerError, setTriggerError] = useState<string | null>(null);
  const [pipelineStatus, setPipelineStatus] = useState<PipelineTaskStatus | null>(null);

  const reload = useCallback(() => {
    Promise.all([
      fetchTask(projectId, taskId),
      fetchSessions(projectId),
    ]).then(([t, s]) => {
      setTask(t);
      setSessions(s || []);
    }).catch(console.error);

    fetchPipelineStatus(projectId).then((ps) => {
      setPipelineStatus(ps.running[taskId] || null);
    }).catch(() => {});
  }, [projectId, taskId]);

  useEffect(() => {
    reload();
    setLoading(false);
  }, [reload]);

  // Subscribe to WebSocket for real-time updates
  useEffect(() => {
    const unsub = subscribe((msg) => {
      if (msg.type === 'pipeline_phase_changed' ||
          msg.type === 'pipeline_action_started' ||
          msg.type === 'pipeline_action_completed' ||
          msg.type === 'task_moved' ||
          msg.type === 'task_updated' ||
          msg.type === 'session_created' ||
          msg.type === 'session_updated' ||
          msg.type === 'artifact_updated') {
        // Reload task data on pipeline events
        reload();
      }
    });
    return unsub;
  }, [reload]);

  const handleTrigger = async (action: string) => {
    setTriggering(true);
    setTriggerError(null);
    try {
      await triggerTask(projectId, taskId, action);
      // Reload after trigger
      setTimeout(reload, 500);
    } catch (err) {
      setTriggerError(err instanceof Error ? err.message : '操作失败');
    } finally {
      setTriggering(false);
    }
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-muted)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div className="skeleton" style={{ width: 40, height: 40, borderRadius: '50%' }} />
          <span>加载中...</span>
        </div>
      </div>
    );
  }

  if (!task) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-muted)' }}>
        任务未找到
      </div>
    );
  }

  const taskSessions = sessions.filter((s) => s.task_id === task.id);
  const actions = PHASE_ACTIONS[task.phase] || [];
  const isRunning = pipelineStatus?.status === 'running';

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '32px 24px' }}>
      {/* Spinner keyframes */}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Back link */}
      <button
        onClick={() => router.push(`/project/${projectId}`)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: 'none',
          border: 'none',
          color: 'var(--accent)',
          fontSize: 13,
          marginBottom: 20,
          cursor: 'pointer',
          padding: '4px 0',
          transition: 'color var(--transition-fast)',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--accent-hover)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--accent)'; }}
      >
        <IconBack /> 返回看板
      </button>

      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: 14 }}>#{task.id}</span>
          {task.tier && <span className={`tier-badge tier-${task.tier}`}>{task.tier}</span>}
          <span style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '2px 10px',
            borderRadius: 10,
            fontSize: 11,
            fontWeight: 500,
            background: `${PHASE_COLORS[task.phase] || '#6b7280'}18`,
            color: PHASE_COLORS[task.phase] || '#6b7280',
          }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%',
              background: PHASE_COLORS[task.phase] || '#6b7280',
            }} />
            {PHASE_LABELS[task.phase] || task.phase}
          </span>
        </div>
        <h1 style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.35 }}>
          {task.title || task.slug || `Task ${task.id}`}
        </h1>
      </div>

      {/* Pipeline Controls */}
      {(actions.length > 0 || isRunning) && (
        <div style={{
          marginBottom: 24,
          padding: '16px 20px',
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-md)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12, color: 'var(--text-secondary)' }}>
            流水线操作
          </div>

          {/* Running status */}
          {isRunning && pipelineStatus && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              background: '#f59e0b12',
              border: '1px solid #f59e0b30',
              borderRadius: 'var(--radius-sm)',
              marginBottom: 12,
              fontSize: 13,
              color: '#f59e0b',
            }}>
              <IconSpinner />
              <span>{ACTION_LABELS[pipelineStatus.action] || pipelineStatus.action}</span>
              {pipelineStatus.session_id && (
                <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
                  会话: {pipelineStatus.session_id}
                </span>
              )}
            </div>
          )}

          {/* Error display */}
          {(triggerError || (pipelineStatus?.status === 'failed' && pipelineStatus?.error)) && (
            <div style={{
              padding: '10px 14px',
              background: '#ef444412',
              border: '1px solid #ef444430',
              borderRadius: 'var(--radius-sm)',
              marginBottom: 12,
              fontSize: 12,
              color: '#ef4444',
            }}>
              {triggerError || pipelineStatus?.error}
            </div>
          )}

          {/* Completed status */}
          {pipelineStatus?.status === 'completed' && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              background: '#10b98112',
              border: '1px solid #10b98130',
              borderRadius: 'var(--radius-sm)',
              marginBottom: 12,
              fontSize: 13,
              color: '#10b981',
            }}>
              <span>&#10003;</span>
              <span>{ACTION_LABELS[pipelineStatus.action]?.replace('正在', '').replace('...', '完成') || '操作完成'}</span>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {actions.map(({ action, label, color }) => (
              <button
                key={action}
                onClick={() => handleTrigger(action)}
                disabled={triggering || isRunning}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '8px 16px',
                  background: (triggering || isRunning) ? 'var(--bg-hover)' : color,
                  color: (triggering || isRunning) ? 'var(--text-muted)' : '#fff',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: (triggering || isRunning) ? 'not-allowed' : 'pointer',
                  transition: 'opacity var(--transition-fast)',
                  opacity: (triggering || isRunning) ? 0.6 : 1,
                }}
              >
                {triggering ? <IconSpinner /> : <IconPlay />}
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Meta grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 1,
        marginBottom: 24,
        background: 'var(--border)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
      }}>
        {[
          ['类型', task.type || '-'],
          ['负责人', task.assignee || '未分配'],
          ['创建时间', task.created ? new Date(task.created).toLocaleDateString('zh-CN') : '-'],
          ['更新时间', task.updated ? new Date(task.updated).toLocaleDateString('zh-CN') : '-'],
        ].map(([label, value]) => (
          <div key={label} style={{ padding: '12px 16px', background: 'var(--bg-secondary)' }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 3, fontWeight: 500 }}>{label}</div>
            <div style={{ fontSize: 13 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Blocked reason */}
      {task.blocked_reason && (
        <div style={{
          padding: '12px 16px',
          background: 'var(--danger-bg)',
          borderRadius: 'var(--radius-md)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
          marginBottom: 24,
        }}>
          <div style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 600, marginBottom: 4 }}>阻塞原因</div>
          <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{task.blocked_reason}</div>
        </div>
      )}

      {/* Body */}
      {task.body && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>详细内容</h2>
          <pre style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: 16,
            fontSize: 13,
            whiteSpace: 'pre-wrap',
            color: 'var(--text-secondary)',
            lineHeight: 1.65,
          }}>
            {task.body}
          </pre>
        </div>
      )}

      {/* Artifacts */}
      {(task.spec_path || task.plan_path) && (
        <div style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>相关文档</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {task.spec_path && (
              <div style={artifactCard}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <IconFile />
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>规格文档</span>
                </div>
                <code style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{task.spec_path}</code>
              </div>
            )}
            {task.plan_path && (
              <div style={artifactCard}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <IconFile />
                  <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>执行计划</span>
                </div>
                <code style={{ fontSize: 12, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{task.plan_path}</code>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sessions */}
      <div>
        <h2 style={{ fontSize: 15, fontWeight: 600, marginBottom: 12 }}>
          Agent 会话 ({taskSessions.length})
        </h2>
        {taskSessions.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '32px 20px',
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
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
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
              }}>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%',
                  background: s.status === 'running' ? 'var(--warning)' : s.status === 'done' ? 'var(--success)' : s.status === 'failed' ? 'var(--danger)' : 'var(--info)',
                  flexShrink: 0,
                }} />
                <div style={{ flex: 1 }}>
                  <span style={{ fontSize: 13, fontWeight: 500 }}>{s.agent}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>#{s.id}</span>
                </div>
                <span style={{
                  fontSize: 11, padding: '2px 8px', borderRadius: 8,
                  background: 'var(--bg-hover)', color: 'var(--text-muted)',
                }}>
                  {s.status === 'running' ? '运行中' :
                   s.status === 'done' ? '已完成' :
                   s.status === 'failed' ? '失败' :
                   s.status === 'pending' ? '等待中' : s.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const artifactCard: React.CSSProperties = {
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  padding: '12px 16px',
  borderRadius: 'var(--radius-md)',
};
