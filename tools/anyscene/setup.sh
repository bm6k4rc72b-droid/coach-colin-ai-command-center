#!/bin/bash
# AnyScene (MIT, apekshik/anyscene): a Claude Code skill + Blender pipeline that turns reference images or a one-paragraph
# brief into a dressed, lit, photoreal Blender scene with camera moves. Pinned to the checked commit.
# Needs: Blender 5.0+ ($BLENDER), Node 20+, ffmpeg, uv, a GPU with 12-16 GB for Cycles, and a fal.ai key in FAL_KEY.
# COST: every prop is an image plus two image->3D models on fal, about $1.65 per prop (~$150 for a 90-prop scene),
# billed to your fal account. Its hosted builder also needs OPENROUTER_API_KEY.
# Usage: tools/anyscene/setup.sh [dir]   then open <dir> in Claude Code and say:
#   "Use SKILL.md to build a scene from the reference images in refs/<name>/. Treat them as the approved concept."
set -euo pipefail
DIR="${1:-$HOME/anyscene}"
PIN=88c1daf0b47b122359c357eb502cfc1b960609a5
[ -d "$DIR/.git" ] || git clone -q https://github.com/apekshik/anyscene "$DIR"
git -C "$DIR" fetch -q --depth 1 origin "$PIN" 2>/dev/null || true
git -C "$DIR" checkout -q "$PIN"
cd "$DIR" && npm install
[ -n "${FAL_KEY:-}" ] || echo "Note: set FAL_KEY (https://fal.ai/dashboard/keys) before generating; generation is billed."
echo "Ready. Open $DIR in Claude Code; SKILL.md is the process."
