'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { WSEvent } from './types';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:9876/ws';

export function useWebSocket() {
  const [lastEvent, setLastEvent] = useState<WSEvent | null>(null);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const retriesRef = useRef(0);

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        retriesRef.current = 0;
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as WSEvent;
          setLastEvent(data);
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        setConnected(false);
        // Exponential backoff reconnect
        const delay = Math.min(1000 * Math.pow(2, retriesRef.current), 30000);
        retriesRef.current++;
        setTimeout(connect, delay);
      };

      ws.onerror = () => {
        ws.close();
      };
    } catch {
      // WebSocket constructor can throw in SSR
    }
  }, []);

  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close();
    };
  }, [connect]);

  return { lastEvent, connected };
}
