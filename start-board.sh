#!/bin/bash
set -e

# Kill existing
fuser -k 9876/tcp 2>/dev/null || true
fuser -k 3456/tcp 2>/dev/null || true
sleep 1

REPO=/root/.openclaw/workspace/repos/superclaw

# Start backend
cd $REPO/board-server
SUPERCLAW_ROOT=$REPO/.superclaw setsid ./server >> /tmp/superclaw-backend.log 2>&1 &
echo "Backend PID: $!"

# Start frontend
cd $REPO/board-ui
setsid npx next start -p 3456 -H 0.0.0.0 >> /tmp/superclaw-frontend.log 2>&1 &
echo "Frontend PID: $!"

sleep 3

# Verify
if curl -s --max-time 3 http://localhost:9876/api/projects > /dev/null; then
  echo "✅ Backend OK"
else
  echo "❌ Backend FAIL"
fi

if curl -s --max-time 3 -o /dev/null -w "%{http_code}" http://localhost:3456 | grep -q 200; then
  echo "✅ Frontend OK"
else
  echo "❌ Frontend FAIL"
fi
