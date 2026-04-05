'use client';

import { useEffect, useState } from 'react';
import { AgentInfo } from '@/lib/types';
import { fetchAgents } from '@/lib/api';

export default function AgentStatus() {
  const [agents, setAgents] = useState<AgentInfo[]>([]);

  useEffect(() => {
    fetchAgents()
      .then(setAgents)
      .catch(() => setAgents([]));

    const interval = setInterval(() => {
      fetchAgents()
        .then(setAgents)
        .catch(() => {});
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  if (agents.length === 0) return null;

  return (
    <div className="agent-bar">
      <span style={{ fontWeight: 600 }}>Agents:</span>
      {agents.map((agent) => (
        <div key={agent.name} className="agent-item">
          <span className={`agent-dot ${agent.status || 'idle'}`} />
          <span>{agent.name}</span>
          {agent.last_run && (
            <span style={{ color: 'var(--text-muted)', fontSize: 11 }}>
              {new Date(agent.last_run).toLocaleString()}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}
