#!/usr/bin/env bash
# Starts the MoneyPrinterTurbo API on http://127.0.0.1:8080 and lets the COLIN OS page talk to it.
set -euo pipefail
cd "$(dirname "$0")/MoneyPrinterTurbo"
export CORS_ALLOWED_ORIGINS="${CORS_ALLOWED_ORIGINS:-https://bm6k4rc72b-droid.github.io,http://localhost:5173}"
if command -v uv >/dev/null; then exec uv run python main.py; else exec .venv/bin/python main.py; fi
