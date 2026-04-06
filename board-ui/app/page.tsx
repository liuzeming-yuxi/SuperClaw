'use client';

import { useEffect, useState } from 'react';
import { fetchProjects, createProject, Project } from '@/lib/api';
import Link from 'next/link';

export default function HomePage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ id: '', name: '', path: '', description: '' });

  useEffect(() => {
    fetchProjects()
      .then(setProjects)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const handleAdd = async () => {
    if (!form.id || !form.name || !form.path) return;
    try {
      await createProject(form);
      const updated = await fetchProjects();
      setProjects(updated);
      setShowAdd(false);
      setForm({ id: '', name: '', path: '', description: '' });
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: '48px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 4 }}>SuperClaw Projects</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Select a project to view its board</p>
        </div>
        <button
          onClick={() => setShowAdd(!showAdd)}
          style={{
            background: 'var(--accent)',
            color: '#fff',
            border: 'none',
            padding: '8px 16px',
            borderRadius: 8,
            fontWeight: 600,
          }}
        >
          + 添加项目
        </button>
      </div>

      {showAdd && (
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 12,
          padding: 20,
          marginBottom: 24,
        }}>
          <h3 style={{ marginBottom: 12 }}>New Project</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <input
              placeholder="Project ID (e.g. my-app)"
              value={form.id}
              onChange={(e) => setForm({ ...form, id: e.target.value })}
              style={inputStyle}
            />
            <input
              placeholder="Display Name"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              style={inputStyle}
            />
            <input
              placeholder="Local Path (e.g. /home/user/my-app)"
              value={form.path}
              onChange={(e) => setForm({ ...form, path: e.target.value })}
              style={{ ...inputStyle, gridColumn: '1 / -1' }}
            />
            <input
              placeholder="描述 (optional)"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              style={{ ...inputStyle, gridColumn: '1 / -1' }}
            />
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setShowAdd(false)} style={cancelBtnStyle}>取消</button>
            <button onClick={handleAdd} style={saveBtnStyle}>Save</button>
          </div>
        </div>
      )}

      {loading ? (
        <p style={{ color: 'var(--text-muted)' }}>加载中...</p>
      ) : projects.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: 64,
          background: 'var(--bg-secondary)',
          borderRadius: 12,
          border: '1px solid var(--border)',
        }}>
          <p style={{ color: 'var(--text-secondary)', fontSize: 16 }}>还没有项目. Add one to get started.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 16 }}>
          {projects.map((p) => (
            <Link key={p.id} href={`/project/${p.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 12,
                padding: 20,
                transition: 'border-color 0.2s, transform 0.2s',
                cursor: 'pointer',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--accent)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
              >
                <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>{p.name}</h2>
                <p style={{ color: 'var(--text-muted)', fontSize: 12, marginBottom: 12 }}>{p.path}</p>
                {p.description && (
                  <p style={{ color: 'var(--text-secondary)', fontSize: 13, marginBottom: 12 }}>{p.description}</p>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <span style={statBadge}>{p.task_count} 个任务</span>
                  {p.phase_counts && Object.entries(p.phase_counts).map(([phase, count]) => (
                    <span key={phase} style={{ ...statBadge, background: 'var(--bg-tertiary)' }}>
                      {phase}: {count}
                    </span>
                  ))}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-secondary)',
  border: '1px solid var(--border)',
  borderRadius: 6,
  padding: '8px 12px',
  color: 'var(--text-primary)',
  outline: 'none',
};

const cancelBtnStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid var(--border)',
  color: 'var(--text-secondary)',
  padding: '6px 14px',
  borderRadius: 6,
};

const saveBtnStyle: React.CSSProperties = {
  background: 'var(--accent)',
  border: 'none',
  color: '#fff',
  padding: '6px 14px',
  borderRadius: 6,
  fontWeight: 600,
};

const statBadge: React.CSSProperties = {
  background: 'var(--bg-hover)',
  padding: '2px 8px',
  borderRadius: 4,
  fontSize: 12,
  color: 'var(--text-secondary)',
};
