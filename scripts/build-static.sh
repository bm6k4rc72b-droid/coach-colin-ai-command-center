#!/usr/bin/env bash
# Build a static, server-less copy of the app for GitHub Pages.
#
# WHAT YOU GET: the globe (OpenStreetMap imagery), the full interface and the
# Command Center skin — no API keys needed.
#
# WHAT YOU DO NOT GET: every live data layer. Aircraft, ships, CCTV, traffic,
# fires and voice are served by 16 /api/* routes that live in the Vite dev
# server (see vite.config.js). A static host has no backend, so those layers
# report unavailable. For the real thing, run ./start.sh locally instead.
set -euo pipefail

REPO_NAME="${1:-coach-colin-ai-command-center}"
BASE="/${REPO_NAME}/"

echo "==> Building with base ${BASE}"
rm -rf dist
npx vite build --base="${BASE}"

# vite-plugin-cesium writes its runtime to dist/<base>/cesium, double-applying
# the base: the app then requests /<base>/cesium/... and 404s. Hoist it so the
# request path and the file path agree.
if [ -d "dist/${REPO_NAME}/cesium" ]; then
  echo "==> Hoisting Cesium runtime out of the double-nested base directory"
  mv "dist/${REPO_NAME}/cesium" dist/cesium
  rmdir "dist/${REPO_NAME}" 2>/dev/null || true
fi

# Root-absolute asset paths ("/logo.svg", "/models/jet.glb") are written by
# hand in the source and Vite leaves them alone, so they resolve against the
# domain root rather than the project subpath. Rewrite them to match the base.
echo "==> Rewriting root-absolute asset paths to ${BASE}"
ASSETS='logo mic pin location visual-presets'
while IFS= read -r -d '' f; do
  for a in $ASSETS; do
    sed -i "s#\([\"'(]\)/${a}\.svg#\1${BASE}${a}.svg#g" "$f"
  done
  sed -i "s#\([\"'(]\)/models/#\1${BASE}models/#g" "$f"
done < <(find dist -type f \( -name '*.js' -o -name '*.css' -o -name '*.html' \) -print0)

# Pages runs Jekyll by default, which silently drops files beginning with "_".
touch dist/.nojekyll

echo "==> Done. Static site in dist/ ($(du -sh dist | cut -f1))"
