#!/bin/bash
# Installs the upscaling stack used by the `upscale` skill (Linux x86_64):
#   video2x      Video2X 6.4.0 AppImage (Real-ESRGAN / Real-CUGAN / RIFE / Anime4K, video)
#   upscayl-bin  Upscayl's CLI engine + Upscayl's models (stills)
#   gfpgan       GFPGAN v1.4 face restoration (Python venv, CPU or GPU PyTorch)
# Everything goes in ~/.local/share/upscalers, wrappers in ~/.local/bin.
# Idempotent: re-running skips what is already installed.
# Usage: setup.sh [all|video2x|upscayl|gfpgan]   (default: all)
set -euo pipefail

ROOT="${UPSCALERS_HOME:-$HOME/.local/share/upscalers}"
case "$ROOT" in /|"$HOME"|"") echo "refusing unsafe install dir: $ROOT"; exit 1;; esac
BIN="$HOME/.local/bin"
mkdir -p "$ROOT" "$BIN"
WHAT="${1:-all}"

VIDEO2X_VER=6.4.0
UPSCAYL_BIN_VER=20251207-174704
UPSCAYL_MODELS_COMMIT=a00d55fee90e0f9435d5eaa86e76700df8199af8
GFPGAN_COMMIT=7552a7791caad982045a7bbe5634bbf1cd5c8679

say() { echo "[upscale-setup] $*"; }

ensure_vulkan() {
  # No GPU driver? Install Mesa's CPU Vulkan (lavapipe) so the ncnn tools still run (slowly).
  if ! ls /usr/share/vulkan/icd.d/*.json >/dev/null 2>&1; then
    if command -v apt-get >/dev/null && [ "$(id -u)" = 0 ]; then
      say "no Vulkan driver found; installing mesa-vulkan-drivers (CPU fallback)"
      apt-get update -qq >/dev/null 2>&1 || true
      DEBIAN_FRONTEND=noninteractive apt-get install -y -qq mesa-vulkan-drivers libgomp1 >/dev/null
    else
      say "WARNING: no Vulkan driver found; install your GPU's Vulkan driver"
    fi
  fi
}

install_video2x() {
  [ -x "$ROOT/video2x/AppRun" ] && { say "video2x already installed"; return; }
  say "downloading Video2X $VIDEO2X_VER"
  local tmp; tmp=$(mktemp -d)
  curl -fsSL -o "$tmp/v2x.AppImage" \
    "https://github.com/k4yt3x/video2x/releases/download/$VIDEO2X_VER/Video2X-x86_64.AppImage"
  chmod +x "$tmp/v2x.AppImage"
  (cd "$tmp" && ./v2x.AppImage --appimage-extract >/dev/null)
  rm -rf -- "${ROOT:?}/video2x" && mv "$tmp/squashfs-root" "$ROOT/video2x" && rm -rf "$tmp"
  # Video2X looks for models/ relative to the working directory, so run it from its data dir.
  cat > "$BIN/video2x" <<EOF
#!/bin/bash
# Absolute-ise -i/-o paths, then run Video2X from its data dir (where models/ lives).
args=(); prev=""
for a in "\$@"; do
  if [[ "\$prev" == "-i" || "\$prev" == "--input" || "\$prev" == "-o" || "\$prev" == "--output" ]] && [[ "\$a" != /* ]]; then
    a="\$PWD/\$a"
  fi
  args+=("\$a"); prev="\$a"
done
cd "$ROOT/video2x/usr/share/video2x" && exec "$ROOT/video2x/AppRun" "\${args[@]}"
EOF
  chmod +x "$BIN/video2x"
}

install_upscayl() {
  [ -x "$ROOT/upscayl/upscayl-bin" ] && { say "upscayl-bin already installed"; return; }
  say "downloading upscayl-bin $UPSCAYL_BIN_VER and Upscayl models"
  local tmp; tmp=$(mktemp -d)
  curl -fsSL -o "$tmp/u.zip" \
    "https://github.com/upscayl/upscayl-ncnn/releases/download/$UPSCAYL_BIN_VER/upscayl-bin-$UPSCAYL_BIN_VER-linux.zip"
  python3 -I -m zipfile -e "$tmp/u.zip" "$tmp/u"
  mkdir -p "$ROOT/upscayl"
  cp "$tmp"/u/*/upscayl-bin "$ROOT/upscayl/upscayl-bin" && chmod +x "$ROOT/upscayl/upscayl-bin"
  git clone -q --filter=blob:none --no-checkout https://github.com/upscayl/upscayl.git "$tmp/src"
  git -C "$tmp/src" sparse-checkout set resources/models >/dev/null
  git -C "$tmp/src" checkout -q "$UPSCAYL_MODELS_COMMIT"
  rm -rf -- "${ROOT:?}/upscayl/models" && cp -r "$tmp/src/resources/models" "$ROOT/upscayl/models"
  rm -rf "$tmp"
  cat > "$BIN/upscayl-bin" <<EOF
#!/bin/bash
# upscayl-bin with Upscayl's models as the default model dir (-m still overrides).
case " \$* " in *" -m "*) exec "$ROOT/upscayl/upscayl-bin" "\$@";; esac
exec "$ROOT/upscayl/upscayl-bin" -m "$ROOT/upscayl/models" "\$@"
EOF
  chmod +x "$BIN/upscayl-bin"
}

install_gfpgan() {
  [ -x "$BIN/gfpgan" ] && [ -x "$ROOT/gfpgan/venv/bin/python" ] && { say "gfpgan already installed"; return; }
  command -v uv >/dev/null || { say "gfpgan needs uv (https://docs.astral.sh/uv/)"; return 1; }
  say "installing GFPGAN (PyTorch download is large)"
  mkdir -p "$ROOT/gfpgan"
  [ -d "$ROOT/gfpgan/src/.git" ] || git clone -q https://github.com/TencentARC/GFPGAN.git "$ROOT/gfpgan/src"
  git -C "$ROOT/gfpgan/src" checkout -q "$GFPGAN_COMMIT"
  uv venv -q --allow-existing --python 3.11 "$ROOT/gfpgan/venv"
  local PY="$ROOT/gfpgan/venv/bin/python"
  # CPU wheels are much smaller; fall back to PyPI's default build if that index is unreachable.
  uv pip install -q --python "$PY" --index-url https://download.pytorch.org/whl/cpu torch torchvision 2>/dev/null \
    || uv pip install -q --python "$PY" torch torchvision
  uv pip install -q --python "$PY" "numpy<2" gfpgan==1.3.8 basicsr==1.4.2 facexlib opencv-python-headless
  # basicsr 1.4.2 imports a torchvision module removed in torchvision 0.17; point it at the new one.
  local deg; deg=$("$PY" -I -c "import importlib.util as u;print(u.find_spec('basicsr').submodule_search_locations[0])")/data/degradations.py
  sed -i 's/torchvision.transforms.functional_tensor import/torchvision.transforms.functional import/' "$deg"
  mkdir -p "$ROOT/gfpgan/src/experiments/pretrained_models"
  [ -s "$ROOT/gfpgan/src/experiments/pretrained_models/GFPGANv1.4.pth" ] || curl -fsSL \
    -o "$ROOT/gfpgan/src/experiments/pretrained_models/GFPGANv1.4.pth" \
    https://github.com/TencentARC/GFPGAN/releases/download/v1.3.0/GFPGANv1.4.pth
  cat > "$BIN/gfpgan" <<EOF
#!/bin/bash
# GFPGAN inference: gfpgan -i <img-or-dir> -o <out-dir> [-v 1.4] [-s 2] [--bg_upsampler none]
args=(); prev=""
for a in "\$@"; do
  if [[ "\$prev" == "-i" || "\$prev" == "--input" || "\$prev" == "-o" || "\$prev" == "--output" ]] && [[ "\$a" != /* ]]; then
    a="\$PWD/\$a"
  fi
  args+=("\$a"); prev="\$a"
done
cd "$ROOT/gfpgan/src" && exec "$ROOT/gfpgan/venv/bin/python" -I inference_gfpgan.py "\${args[@]}"
EOF
  chmod +x "$BIN/gfpgan"
}

case "$WHAT" in
  all) ensure_vulkan; install_video2x; install_upscayl; install_gfpgan ;;
  video2x) ensure_vulkan; install_video2x ;;
  upscayl) ensure_vulkan; install_upscayl ;;
  gfpgan) install_gfpgan ;;
  *) echo "usage: $0 [all|video2x|upscayl|gfpgan]"; exit 2 ;;
esac
say "done. Tools: $(for t in video2x upscayl-bin gfpgan; do [ -x "$BIN/$t" ] && printf '%s ' "$t"; done)"
