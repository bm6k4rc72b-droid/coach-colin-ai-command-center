#!/bin/bash
# Installs the audio/music toolkit used by the audio-mix, aeon-music-video and
# beatscope-visualizer skills. Idempotent. Needs uv (https://docs.astral.sh/uv/) and ffmpeg.
#   ~/.local/share/audio-mix/venv : moviepy, librosa, soundfile, scipy, numpy (for scripts)
#   auto-editor, beatscope        : CLIs in ~/.local/bin (uv tools, pinned)
set -euo pipefail
export PATH="$HOME/.local/bin:$PATH"
command -v uv >/dev/null || { echo "audio-mix: install uv first: https://docs.astral.sh/uv/"; exit 1; }
command -v ffmpeg >/dev/null || echo "audio-mix: WARNING ffmpeg not found (apt install ffmpeg / brew install ffmpeg)"

VENV="$HOME/.local/share/audio-mix/venv"
if [ ! -x "$VENV/bin/python" ]; then
  uv venv -q --python 3.12 "$VENV"
  uv pip install -q --python "$VENV/bin/python" "moviepy>=2,<3" "librosa>=0.10" "soundfile>=0.12" "scipy>=1.10" "numpy>=1.24"
fi
command -v auto-editor >/dev/null || uv tool install -q auto-editor
command -v beatscope >/dev/null || uv tool install -q \
  "git+https://github.com/chosuicide/beatscope.git@508d6a5d7059f2c38c05cad6a9a7dcb2ffd895c3"
echo "audio-mix ready: python=$VENV/bin/python, $(command -v auto-editor), $(command -v beatscope)"
