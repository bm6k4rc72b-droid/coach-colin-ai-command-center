#!/bin/bash
# Start Blender on a virtual display with the MCP for Blender server listening on localhost:9876.
# Usage: tools/blender/blender-headless.sh [start|stop|status]
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
LOG="${TMPDIR:-/tmp}/blender-mcp.log"; PIDF="${TMPDIR:-/tmp}/blender-mcp.pid"
up() { python3 -c "import socket,sys; s=socket.socket(); s.settimeout(1); sys.exit(s.connect_ex(('127.0.0.1',${BLENDER_PORT:-9876})))"; }
case "${1:-start}" in
  start)
    command -v blender >/dev/null || { echo "Blender is not installed (apt-get install -y blender xvfb)"; exit 1; }
    up && { echo "already running on :${BLENDER_PORT:-9876}"; exit 0; }
    DISABLE_TELEMETRY=true nohup xvfb-run -a -s "-screen 0 1920x1080x24" blender --factory-startup --python "$DIR/start_server.py" >"$LOG" 2>&1 &
    echo $! > "$PIDF"
    for _ in $(seq 60); do up && { echo "Blender MCP server up on :${BLENDER_PORT:-9876} (log $LOG)"; exit 0; }; sleep 1; done
    echo "server did not start; see $LOG"; tail -20 "$LOG"; exit 1 ;;
  stop) pkill -f "start_server.py" || true; rm -f "$PIDF"; echo stopped ;;
  status) up && echo running || echo stopped ;;
esac
