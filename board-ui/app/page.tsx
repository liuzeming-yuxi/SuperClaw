'use client';

import { useEffect, useState, useCallback } from 'react';
import { BoardState } from '@/lib/types';
import { fetchBoard } from '@/lib/api';
import { useWebSocket } from '@/lib/ws';
import BoardColumn from '@/components/BoardColumn';
import AgentStatus from '@/components/AgentStatus';

const PHASES = ['inbox', 'aligning', 'planned', 'executing', 'reviewing', 'done', 'blocked'];

export default function BoardPage() {
  const [board, setBoard] = useState<BoardState | null>(null);
  const [loading, setLoading] = useState(true);
  const { lastEvent, connected } = useWebSocket();

  const loadBoard = useCallback(async () => {
    try {
      const data = await fetchBoard();
      setBoard(data);
    } catch (err) {
      console.error('Failed to load board:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBoard();
  }, [loadBoard]);

  // Reload board on WebSocket events
  useEffect(() => {
    if (lastEvent) {
      loadBoard();
    }
  }, [lastEvent, loadBoard]);

  if (loading) {
    return <div className="loading">Loading board...</div>;
  }

  return (
    <div>
      <div className="board-header">
        <h1>SuperClaw Board</h1>
        <div className="ws-status">
          <span className={`ws-dot ${connected ? 'connected' : 'disconnected'}`} />
          {connected ? 'Live' : 'Disconnected'}
        </div>
      </div>

      <div className="board-container">
        {PHASES.map((phase) => (
          <BoardColumn
            key={phase}
            phase={phase}
            tasks={board?.phases[phase] || []}
            onMoved={loadBoard}
          />
        ))}
      </div>

      <AgentStatus />
    </div>
  );
}
