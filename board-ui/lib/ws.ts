const WS_URL = 'ws://192.168.16.30:9876/ws';

type MessageHandler = (msg: { type: string; data: unknown }) => void;

let socket: WebSocket | null = null;
let handlers: MessageHandler[] = [];
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function connect() {
  if (typeof window === 'undefined') return;

  socket = new WebSocket(WS_URL);

  socket.onopen = () => {
    console.log('[ws] connected');
  };

  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handlers.forEach((h) => h(msg));
    } catch {
      // ignore parse errors
    }
  };

  socket.onclose = () => {
    console.log('[ws] disconnected, reconnecting...');
    scheduleReconnect();
  };

  socket.onerror = () => {
    socket?.close();
  };
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 3000);
}

export function subscribe(handler: MessageHandler): () => void {
  handlers.push(handler);
  if (!socket || socket.readyState === WebSocket.CLOSED) {
    connect();
  }
  return () => {
    handlers = handlers.filter((h) => h !== handler);
  };
}
