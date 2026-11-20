#!/bin/bash
# TRELLIS.2 (MIT, Microsoft Research): one image -> detailed 3D model with PBR materials (GLB), pinned to the
# checked commit. Needs Linux and an NVIDIA GPU with 24 GB+ VRAM (tested upstream on A100/H100), CUDA Toolkit 12.4
# and conda. Its own setup.sh runs `sudo apt install libjpeg-dev` and clones its CUDA extensions (nvdiffrast,
# CuMesh, FlexGEMM, ...) at their current versions. Model weights download from Hugging Face on first run.
# Usage: tools/trellis2/setup.sh [dir]   then: cd <dir> && conda activate trellis2 && python app.py   (web UI)
set -euo pipefail
DIR="${1:-$HOME/TRELLIS.2}"
PIN=75fbf0183001ed9876c8dbb35de6b68552ee08bd
[ -d "$DIR/.git" ] || git clone -q --recursive https://github.com/microsoft/TRELLIS.2 "$DIR"
git -C "$DIR" fetch -q --depth 1 origin "$PIN" 2>/dev/null || true
git -C "$DIR" checkout -q "$PIN"
command -v nvidia-smi >/dev/null || { echo "No NVIDIA GPU found. TRELLIS.2 needs one with 24 GB+ of memory."; exit 1; }
command -v conda >/dev/null || { echo "Install Miniconda first: https://docs.conda.io/en/latest/miniconda.html"; exit 1; }
cd "$DIR" && . ./setup.sh --new-env --basic --flash-attn --nvdiffrast --nvdiffrec --cumesh --o-voxel --flexgemm
echo "Ready. Web UI: conda activate trellis2 && python app.py   Script: python example.py (edit the image path)"
