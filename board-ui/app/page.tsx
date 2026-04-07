'use client';

import { useEffect, useState, useCallback } from 'react';
import { fetchProjects, createProject, browseFilesystem, mkdirFilesystem, renameFilesystem, Project, DirEntry } from '@/lib/api';
import Link from 'next/link';

// SVG Icons as components
const IconFolder = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 4.5c0-.83.67-1.5 1.5-1.5H6l1.5 1.5h5c.83 0 1.5.67 1.5 1.5v6c0 .83-.67 1.5-1.5 1.5h-11C2.67 13.5 2 12.83 2 12V4.5z"/>
  </svg>
);

const IconGit = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
    <path d="M15.698 7.287L8.712.302a1.03 1.03 0 00-1.457 0l-1.45 1.45 1.84 1.84a1.223 1.223 0 011.55 1.56l1.773 1.774a1.224 1.224 0 11-.733.691L8.533 5.916v4.15a1.224 1.224 0 11-1.007-.032V5.835a1.224 1.224 0 01-.664-1.606L5.052 2.42l-4.75 4.75a1.03 1.03 0 000 1.458l6.986 6.986a1.03 1.03 0 001.457 0l6.953-6.953a1.031 1.031 0 000-1.374z"/>
  </svg>
);

const IconChevronRight = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M6 4l4 4-4 4"/>
  </svg>
);

const IconPlus = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M8 3v10M3 8h10"/>
  </svg>
);

const IconX = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M4 4l8 8M12 4l-8 8"/>
  </svg>
);

const IconBack = () => (
  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 3L5 8l5 5"/>
  </svg>
);

const PHASE_COLORS: Record<string, string> = {
  inbox: '#6b7280',
  aligning: '#8b5cf6',
  planned: '#3b82f6',
  executing: '#f59e0b',
  reviewing: '#22c55e',
  done: '#10b981',
  blocked: '#ef4444',
};

const PHASE_LABELS: Record<string, string> = {
  inbox: '待处理',
  aligning: '对齐中',
  planned: '已规划',
  executing: '执行中',
  reviewing: '验收中',
  done: '已完成',
  blocked: '已阻塞',
};

// Directory Picker Component
function DirectoryPicker({
  value,
  onChange,
  onSelect,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (path: string) => void;
}) {
  const [dirs, setDirs] = useState<DirEntry[]>([]);
  const [currentPath, setCurrentPath] = useState('/root');
  const [parentPath, setParentPath] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const loadDir = useCallback(async (path: string) => {
    setLoading(true);
    try {
      const result = await browseFilesystem(path);
      setDirs(result.directories);
      setCurrentPath(result.current);
      setParentPath(result.parent);
    } catch {
      setDirs([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDir('/root');
  }, [loadDir]);

  const navigateTo = (path: string) => {
    loadDir(path);
    onChange(path);
  };

  const pathParts = currentPath.split('/').filter(Boolean);

  return (
    <div style={{
      background: 'var(--bg-primary)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-md)',
      overflow: 'hidden',
    }}>
      {/* Breadcrumb */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 2,
        padding: '8px 12px',
        borderBottom: '1px solid var(--border)',
        fontSize: 12,
        flexWrap: 'wrap',
      }}>
        <button
          onClick={() => navigateTo('/')}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--accent)',
            fontSize: 12,
            padding: '2px 4px',
            borderRadius: 3,
          }}
        >
          /
        </button>
        {pathParts.map((part, i) => {
          const fullPath = '/' + pathParts.slice(0, i + 1).join('/');
          const isLast = i === pathParts.length - 1;
          return (
            <span key={fullPath} style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
              <span style={{ color: 'var(--text-muted)' }}><IconChevronRight /></span>
              <button
                onClick={() => !isLast && navigateTo(fullPath)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: isLast ? 'var(--text-primary)' : 'var(--accent)',
                  fontSize: 12,
                  padding: '2px 4px',
                  borderRadius: 3,
                  fontWeight: isLast ? 600 : 400,
                }}
              >
                {part}
              </button>
            </span>
          );
        })}
      </div>

      {/* Directory listing */}
      <div style={{ maxHeight: 240, overflowY: 'auto' }}>
        {parentPath && (
          <button
            onClick={() => navigateTo(parentPath)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '8px 12px',
              background: 'none',
              border: 'none',
              borderBottom: '1px solid var(--border-subtle)',
              color: 'var(--text-secondary)',
              fontSize: 13,
              textAlign: 'left',
            }}
          >
            <IconBack />
            <span>上级目录</span>
          </button>
        )}
        {/* New folder button/input */}
        {showNewFolder ? (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            borderBottom: '1px solid var(--border-subtle)',
          }}>
            <span style={{ color: 'var(--accent)', display: 'flex' }}><IconFolder /></span>
            <input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && newFolderName.trim()) {
                  await mkdirFilesystem(currentPath + '/' + newFolderName.trim());
                  setShowNewFolder(false);
                  setNewFolderName('');
                  loadDir(currentPath);
                } else if (e.key === 'Escape') {
                  setShowNewFolder(false);
                  setNewFolderName('');
                }
              }}
              placeholder="文件夹名称，回车确认"
              style={{
                flex: 1,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--accent)',
                borderRadius: 'var(--radius-sm)',
                padding: '4px 8px',
                fontSize: 13,
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            />
            <button
              onClick={() => { setShowNewFolder(false); setNewFolderName(''); }}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 12, cursor: 'pointer' }}
            >取消</button>
          </div>
        ) : (
          <button
            onClick={() => setShowNewFolder(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              width: '100%',
              padding: '7px 12px',
              background: 'none',
              border: 'none',
              borderBottom: '1px solid var(--border-subtle)',
              color: 'var(--accent)',
              fontSize: 13,
              textAlign: 'left',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(99, 102, 241, 0.08)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
          >
            <span style={{ fontSize: 16, lineHeight: '16px' }}>+</span>
            <span>新建文件夹</span>
          </button>
        )}
        {loading ? (
          <div style={{ padding: '16px 12px', color: 'var(--text-muted)', fontSize: 13 }}>
            加载中...
          </div>
        ) : dirs.length === 0 ? (
          <div style={{ padding: '16px 12px', color: 'var(--text-muted)', fontSize: 13 }}>
            此目录为空
          </div>
        ) : (
          dirs.map((d) => (
            renamingPath === d.path ? (
              <div key={d.path} style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                padding: '6px 12px',
                borderBottom: '1px solid var(--border-subtle)',
              }}>
                <span style={{ color: d.has_git ? '#f97316' : 'var(--text-muted)', display: 'flex' }}>
                  {d.has_git ? <IconGit /> : <IconFolder />}
                </span>
                <input
                  autoFocus
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && renameValue.trim()) {
                      const result = await renameFilesystem(d.path, renameValue.trim());
                      setRenamingPath(null);
                      setRenameValue('');
                      loadDir(currentPath);
                      if (value === d.path) onChange(result.path);
                    } else if (e.key === 'Escape') {
                      setRenamingPath(null);
                      setRenameValue('');
                    }
                  }}
                  onBlur={() => { setRenamingPath(null); setRenameValue(''); }}
                  style={{
                    flex: 1,
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--accent)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '4px 8px',
                    fontSize: 13,
                    color: 'var(--text-primary)',
                    outline: 'none',
                  }}
                />
              </div>
            ) : (
            <div
              key={d.path}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                width: '100%',
                padding: '7px 12px',
                background: value === d.path ? 'var(--accent-glow)' : 'none',
                borderBottom: '1px solid var(--border-subtle)',
                color: 'var(--text-primary)',
                fontSize: 13,
                textAlign: 'left',
                transition: 'background var(--transition-fast)',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                if (value !== d.path) { e.currentTarget.style.background = 'rgba(99, 102, 241, 0.08)'; }
                const renBtn = e.currentTarget.querySelector('[data-rename]') as HTMLElement;
                if (renBtn) renBtn.style.opacity = '1';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = value === d.path ? 'var(--accent-glow)' : 'transparent';
                const renBtn = e.currentTarget.querySelector('[data-rename]') as HTMLElement;
                if (renBtn) renBtn.style.opacity = '0';
              }}
              onClick={() => navigateTo(d.path)}
            >
              <span style={{ color: d.has_git ? '#f97316' : 'var(--text-muted)', display: 'flex' }}>
                {d.has_git ? <IconGit /> : <IconFolder />}
              </span>
              <span style={{ flex: 1 }}>{d.name}</span>
              <button
                data-rename
                onClick={(e) => {
                  e.stopPropagation();
                  setRenamingPath(d.path);
                  setRenameValue(d.name);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: 11,
                  cursor: 'pointer',
                  opacity: 0,
                  transition: 'opacity 0.15s',
                  padding: '2px 6px',
                }}
              >重命名</button>
              {d.has_git && (
                <span style={{
                  fontSize: 10,
                  color: '#f97316',
                  background: 'rgba(249,115,22,0.1)',
                  padding: '1px 6px',
                  borderRadius: 3,
                  fontWeight: 500,
                }}>
                  Git
                </span>
              )}
              <span style={{ color: 'var(--text-muted)', display: 'flex' }}><IconChevronRight /></span>
            </div>
            )
          ))
        )}
      </div>

      {/* Selected path display */}
      <div style={{
        padding: '8px 12px',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{ fontSize: 11, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>已选:</span>
        <code style={{
          flex: 1,
          fontSize: 12,
          color: value ? 'var(--text-primary)' : 'var(--text-muted)',
          fontFamily: 'monospace',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {value || currentPath}
        </code>
        <button
          onClick={() => onSelect(value || currentPath)}
          style={{
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            padding: '4px 12px',
            borderRadius: 'var(--radius-sm)',
            fontSize: 12,
            fontWeight: 500,
          }}
        >
          确认
        </button>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ id: '', name: '', path: '', description: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchProjects()
      .then(setProjects)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = async () => {
    if (!form.id || !form.name || !form.path) return;
    setSaving(true);
    try {
      await createProject(form);
      const updated = await fetchProjects();
      setProjects(updated);
      setShowAdd(false);
      setForm({ id: '', name: '', path: '', description: '' });
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  // Auto-generate id from path
  const handlePathSelect = (path: string) => {
    const name = path.split('/').filter(Boolean).pop() || '';
    const id = name.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    setForm((f) => ({
      ...f,
      path,
      id,
      name: f.name || name,
    }));
  };

  const totalTasks = projects.reduce((sum, p) => sum + p.task_count, 0);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-primary)' }}>
      {/* Top bar */}
      <div style={{
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-secondary)',
      }}>
        <div style={{
          maxWidth: 1080,
          margin: '0 auto',
          padding: '16px 28px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <h1 style={{
              fontSize: 20,
              fontWeight: 700,
              letterSpacing: '-0.01em',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                borderRadius: 8,
                background: 'var(--accent)',
                color: '#fff',
                fontSize: 14,
                fontWeight: 700,
              }}>S</span>
              SuperClaw
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: 12, marginTop: 2, marginLeft: 38 }}>
              {projects.length} 个项目 · {totalTasks} 个任务
            </p>
          </div>
          <button
            onClick={() => setShowAdd(!showAdd)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              background: showAdd ? 'var(--bg-hover)' : 'var(--accent)',
              color: showAdd ? 'var(--text-secondary)' : '#fff',
              border: showAdd ? '1px solid var(--border)' : 'none',
              padding: '8px 16px',
              borderRadius: 'var(--radius-md)',
              fontWeight: 500,
              fontSize: 13,
            }}
          >
            {showAdd ? <><IconX /> 取消</> : <><IconPlus /> 添加项目</>}
          </button>
        </div>
      </div>

      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '24px 28px' }}>
        {/* Add project form */}
        {showAdd && (
          <div style={{
            background: 'var(--bg-secondary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-lg)',
            padding: 24,
            marginBottom: 24,
            boxShadow: 'var(--shadow-elevated)',
          }}>
            <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16 }}>添加新项目</h3>

            {/* Directory picker */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', marginBottom: 6 }}>
                项目路径
              </label>
              <DirectoryPicker
                value={form.path}
                onChange={(path) => setForm({ ...form, path })}
                onSelect={handlePathSelect}
              />
            </div>

            {/* Form fields */}
            <div style={{ marginBottom: 12 }}>
              <label style={labelStyle}>显示名称</label>
              <input
                placeholder="例: 我的项目"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                style={inputStyle}
              />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>描述（可选）</label>
              <input
                placeholder="简要描述项目用途"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setShowAdd(false)} style={cancelBtnStyle}>取消</button>
              <button
                onClick={handleAdd}
                disabled={saving || !form.id || !form.name || !form.path}
                style={{
                  ...saveBtnStyle,
                  opacity: saving || !form.id || !form.name || !form.path ? 0.5 : 1,
                }}
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        )}

        {/* Loading skeleton */}
        {loading ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {[1, 2, 3].map((i) => (
              <div key={i} className="skeleton" style={{ height: 140, borderRadius: 'var(--radius-lg)' }} />
            ))}
          </div>
        ) : projects.length === 0 ? (
          /* Empty state */
          <div style={{
            textAlign: 'center',
            padding: '80px 24px',
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-lg)',
            border: '1px dashed var(--border)',
          }}>
            <div style={{
              width: 56,
              height: 56,
              borderRadius: 'var(--radius-lg)',
              background: 'var(--bg-hover)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px',
            }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
              </svg>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: 15, fontWeight: 500, marginBottom: 6 }}>
              还没有项目
            </p>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
              点击上方「添加项目」按钮开始
            </p>
            <button
              onClick={() => setShowAdd(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: 'var(--accent)',
                color: '#fff',
                border: 'none',
                padding: '8px 20px',
                borderRadius: 'var(--radius-md)',
                fontWeight: 500,
                fontSize: 13,
              }}
            >
              <IconPlus /> 添加项目
            </button>
          </div>
        ) : (
          /* Project cards grid */
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 16 }}>
            {projects.map((p) => (
              <Link key={p.id} href={`/project/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <div
                  style={{
                    background: 'var(--bg-secondary)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-lg)',
                    padding: 20,
                    transition: 'border-color var(--transition-normal), box-shadow var(--transition-normal)',
                    cursor: 'pointer',
                    position: 'relative',
                    overflow: 'hidden',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent)';
                    e.currentTarget.style.boxShadow = '0 0 0 1px var(--accent), 0 4px 16px rgba(99, 102, 241, 0.08)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  {/* Project header */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
                    <div style={{
                      width: 36,
                      height: 36,
                      borderRadius: 'var(--radius-md)',
                      background: `linear-gradient(135deg, ${PHASE_COLORS[Object.keys(p.phase_counts || {})[0]] || 'var(--accent)'}, var(--accent))`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#fff',
                      fontSize: 15,
                      fontWeight: 700,
                      flexShrink: 0,
                    }}>
                      {p.name.charAt(0).toUpperCase()}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 2, letterSpacing: '-0.01em' }}>{p.name}</h2>
                      <p style={{
                        color: 'var(--text-muted)',
                        fontSize: 11,
                        fontFamily: 'monospace',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}>{p.path}</p>
                    </div>
                  </div>

                  {p.description && (
                    <p style={{
                      color: 'var(--text-secondary)',
                      fontSize: 13,
                      marginBottom: 14,
                      lineHeight: 1.5,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}>{p.description}</p>
                  )}

                  {/* Phase stats bar */}
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{
                      ...statBadge,
                      background: 'var(--accent-glow)',
                      color: 'var(--accent)',
                      fontWeight: 600,
                    }}>
                      {p.task_count} 个任务
                    </span>
                    {p.phase_counts && Object.entries(p.phase_counts).map(([phase, count]) => (
                      <span key={phase} style={{
                        ...statBadge,
                        borderLeft: `2px solid ${PHASE_COLORS[phase] || 'var(--text-muted)'}`,
                      }}>
                        {PHASE_LABELS[phase] || phase}: {count}
                      </span>
                    ))}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 500,
  color: 'var(--text-secondary)',
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'var(--bg-primary)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius-sm)',
  padding: '9px 12px',
  color: 'var(--text-primary)',
  outline: 'none',
  transition: 'border-color var(--transition-fast), box-shadow var(--transition-fast)',
};

const cancelBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border)',
  color: 'var(--text-secondary)',
  padding: '7px 16px',
  borderRadius: 'var(--radius-sm)',
  fontWeight: 500,
  fontSize: 13,
};

const saveBtnStyle: React.CSSProperties = {
  background: 'var(--accent)',
  border: 'none',
  color: '#fff',
  padding: '7px 20px',
  borderRadius: 'var(--radius-sm)',
  fontWeight: 600,
  fontSize: 13,
};

const statBadge: React.CSSProperties = {
  background: 'var(--bg-tertiary)',
  padding: '3px 9px',
  borderRadius: 6,
  fontSize: 11,
  color: 'var(--text-secondary)',
  fontWeight: 500,
};
