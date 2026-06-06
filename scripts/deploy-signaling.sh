#!/bin/bash
# Deploy Squawk signaling server to tvashtar VPS
# Run this ON the VPS (tvashtar.tail42e554.ts.net) or from norvell when Tailscale is active.
#
# Usage:
#   bash deploy-signaling.sh

set -e

REMOTE="tvashtar.tail42e554.ts.net"
REMOTE_DIR="/home/trevo/squawk-signaling"
PORT=8443

echo "=== Deploying Squawk Signaling Server ==="

# Create directory on remote
ssh "$REMOTE" "mkdir -p $REMOTE_DIR"

# Copy server files
scp server/signaling.js "$REMOTE:$REMOTE_DIR/"
scp server/package.json "$REMOTE:$REMOTE_DIR/"

# Install deps and start
ssh "$REMOTE" "cd $REMOTE_DIR && npm install --production && \
  echo '=== Starting signaling server on port $PORT ===' && \
  PORT=$PORT nohup node signaling.js > signaling.log 2>&1 & \
  sleep 1 && \
  echo 'Server PID:' \$(pgrep -f 'node signaling.js') && \
  echo 'Logs:' $REMOTE_DIR/signaling.log"

echo ""
echo "=== Done ==="
echo "Signaling server: wss://$REMOTE:$PORT"
echo "Check logs: ssh $REMOTE 'tail -f $REMOTE_DIR/signaling.log'"
