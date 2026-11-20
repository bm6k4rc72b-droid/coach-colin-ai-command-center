#!/bin/bash
# ACE-Step 1.5 (MIT): local text-to-music, pinned to the scanned commit. Run on a computer with an NVIDIA GPU
# (under 4 GB VRAM for the 2B turbo model) or Apple Silicon; CPU works but is slow. Models download from
# Hugging Face on first run. Usage: tools/ace-step/setup.sh [dir]   then: cd <dir> && ./start_gradio_ui.sh
set -euo pipefail
DIR="${1:-$HOME/ACE-Step-1.5}"
[ -d "$DIR/.git" ] || git clone -q https://github.com/ace-step/ACE-Step-1.5 "$DIR"
git -C "$DIR" fetch -q --depth 1 origin ca1e85fe9430179831e6bc6be790c332190a3866 2>/dev/null || true
git -C "$DIR" checkout -q ca1e85fe9430179831e6bc6be790c332190a3866
command -v uv >/dev/null || { echo "install uv first: https://docs.astral.sh/uv/"; exit 1; }
cd "$DIR" && uv sync
echo "Ready. Web UI: ./start_gradio_ui.sh (macOS: ./start_gradio_ui_macos.sh)   API: ./start_api_server.sh"
