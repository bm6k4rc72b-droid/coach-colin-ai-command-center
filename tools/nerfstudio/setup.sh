#!/bin/bash
# Nerfstudio (Apache-2.0): photos or video -> 3D scene (NeRF / Gaussian splatting) with a web viewer, pinned to
# the checked release commit. Training needs an NVIDIA GPU with CUDA 11.8 (12.x works with matching wheels).
# Usage: tools/nerfstudio/setup.sh [dir]
# Then:  conda activate nerfstudio
#        ns-process-data images --data my_photos/ --output-dir data/my_scene     (needs COLMAP: conda install -c conda-forge colmap)
#        ns-train splatfacto --data data/my_scene                                  (Gaussian splats; nerfacto for NeRF)
#        ns-export gaussian-splat --load-config outputs/.../config.yml --output-dir exports/
set -euo pipefail
DIR="${1:-$HOME/nerfstudio}"
PIN=50e0e3c70c775e89333256213363badbf074f29d
command -v nvidia-smi >/dev/null || { echo "No NVIDIA GPU found. Nerfstudio can install without one but cannot train usefully."; exit 1; }
command -v conda >/dev/null || { echo "Install Miniconda first: https://docs.conda.io/en/latest/miniconda.html"; exit 1; }
[ -d "$DIR/.git" ] || git clone -q https://github.com/nerfstudio-project/nerfstudio "$DIR"
git -C "$DIR" fetch -q --depth 1 origin "$PIN" 2>/dev/null || true
git -C "$DIR" checkout -q "$PIN"
eval "$(conda shell.bash hook)"
conda env list | grep -q '^nerfstudio ' || conda create -y -n nerfstudio python=3.10
conda activate nerfstudio
pip install --upgrade pip
pip install torch==2.1.2+cu118 torchvision==0.16.2+cu118 --extra-index-url https://download.pytorch.org/whl/cu118
conda install -y -c "nvidia/label/cuda-11.8.0" cuda-toolkit
pip install ninja "git+https://github.com/NVlabs/tiny-cuda-nn/#subdirectory=bindings/torch"
cd "$DIR" && pip install -e .
ns-install-cli || true
echo "Ready. conda activate nerfstudio, then ns-process-data / ns-train / ns-viewer (see the header of this script)."
