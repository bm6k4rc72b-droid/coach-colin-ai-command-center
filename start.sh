#!/usr/bin/env bash
# One-command launcher. Double-click it, or run ./start.sh in a terminal.
#
# No API keys are required. Without a Google Maps key the app runs on
# OpenStreetMap imagery; the globe, the interface and the no-key live layers
# (flights, satellites, earthquakes, radio, bikeshare, launches and the
# bundled infrastructure datasets) all work. Add keys later in .env to unlock
# photorealistic 3D tiles, ships, fires, traffic and voice.
set -euo pipefail
cd "$(dirname "$0")"

PORT="${PORT:-4173}"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is not installed."
  echo "Install the LTS build from https://nodejs.org, then run this again."
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "Node $(node -v) is too old — this needs Node 22 or newer."
  echo "Update from https://nodejs.org, then run this again."
  exit 1
fi

if [ ! -f .env ]; then
  echo "==> First run: creating .env from .env.example"
  cp .env.example .env
  # The example ships a placeholder string. Left as-is it is truthy, so the
  # app would try to authenticate with it and fail; blank it so the keyless
  # OpenStreetMap path is taken cleanly instead.
  sed -i.bak 's/^GOOGLE_MAPS_API_KEY=your_google_maps_api_key_here$/GOOGLE_MAPS_API_KEY=/' .env && rm -f .env.bak
fi

if [ ! -d node_modules ]; then
  echo "==> Installing dependencies (a few minutes the first time)..."
  npm install --no-audit --no-fund
fi

echo
echo "  Starting up. When it says 'ready', open this in your browser:"
echo
echo "      http://localhost:${PORT}/"
echo
echo "  Press Ctrl+C in this window to stop."
echo
exec npm run dev -- --host localhost --port "${PORT}"
