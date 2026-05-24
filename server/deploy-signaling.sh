#!/usr/bin/env bash
# deploy-signaling.sh — run on the tvashtar VPS to start the Squawk signaling server
set -euo pipefail

SERVER_DIR="$HOME/squawk-signaling"
LOG_FILE="$SERVER_DIR/signaling.log"

# ── Install deps if needed ──────────────────────────────────────────────
mkdir -p "$SERVER_DIR"
cd "$SERVER_DIR"

if [ ! -f package.json ]; then
  echo "[deploy] Initializing signaling server..."
  cat > package.json << 'PKG'
{
  "name": "squawk-signaling-server",
  "version": "0.0.1",
  "type": "module",
  "scripts": {
    "start": "node index.js",
    "dev": "node --watch index.js"
  },
  "dependencies": {
    "ws": "^8.18.0"
  }
}
PKG
fi

npm install --production 2>&1 | tail -3

# ── Start with systemd (recommended) or bare node ───────────────────────
if command -v systemctl &>/dev/null; then
  echo "[deploy] Setting up systemd service..."
  USER=$(whoami)
  cat > "/tmp/squawk-signaling.${USER}.service" << SERV
[Unit]
Description=Squawk WebSocket Signaling Server
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$SERVER_DIR
ExecStart=$(command -v node) $SERVER_DIR/index.js
Restart=on-failure
RestartSec=5
StandardOutput=append:$LOG_FILE
StandardError=append:$LOG_FILE
Environment=PORT=8080

[Install]
WantedBy=multi-user.target
SERV
  sudo mv "/tmp/squawk-signaling.${USER}.service" /etc/systemd/system/squawk-signaling.service
  sudo systemctl daemon-reload
  sudo systemctl enable squawk-signaling
  sudo systemctl restart squawk-signaling
  echo "[deploy] Service started. Logs: journalctl -u squawk-signaling -f"
  echo "[deploy] Status: $(sudo systemctl status squawk-signaling --no-pager | head -3)"
else
  echo "[deploy] No systemd — starting bare node..."
  nohup node "$SERVER_DIR/index.js" >> "$LOG_FILE" 2>&1 &
  echo "[deploy] PID $! — logs: tail -f $LOG_FILE"
fi

echo "[deploy] Done. Server should be reachable on port 8080."