#!/usr/bin/env bash
#
# Build QB Vision and publish it to the gh-pages branch.
#
# GitHub Pages serves this repo as a *project site*, at
# https://<user>.github.io/<repo>/ rather than at a domain root, so the build
# needs its asset URLs prefixed with the repo name. Getting that wrong is the
# usual cause of a deployed page that loads a blank screen with 404s for its
# own JavaScript.
#
# Publishing happens through a temporary git worktree so your current branch,
# working tree and staged changes are never touched.
#
# Usage:  ./scripts/deploy-pages.sh
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

REPO_NAME="$(basename -s .git "$(git config --get remote.origin.url)")"
BASE_PATH="/${REPO_NAME}/"
WORKTREE="$(mktemp -d)"

echo "==> Building with base path ${BASE_PATH}"
BASE_PATH="$BASE_PATH" npm run build

echo "==> Preparing gh-pages worktree"
# Reuse the existing branch when it is there, otherwise start it from scratch.
if git show-ref --verify --quiet refs/remotes/origin/gh-pages; then
  git worktree add --force "$WORKTREE" gh-pages 2>/dev/null \
    || git worktree add --force -b gh-pages "$WORKTREE" origin/gh-pages
else
  git worktree add --force --detach "$WORKTREE"
  git -C "$WORKTREE" checkout --orphan gh-pages
fi

# Replace the published tree wholesale so files deleted from a build do not
# linger on the live site.
find "$WORKTREE" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf {} +
cp -r dist/. "$WORKTREE/"
# Keeps Pages from running the output through Jekyll, which drops _-prefixed paths.
touch "$WORKTREE/.nojekyll"

git -C "$WORKTREE" add -A
if git -C "$WORKTREE" diff --cached --quiet; then
  echo "==> No changes to publish"
else
  git -C "$WORKTREE" commit -q -m "Deploy QB Vision ($(git rev-parse --short HEAD))"
  git -C "$WORKTREE" push -u origin gh-pages
  echo "==> Published"
fi

git worktree remove --force "$WORKTREE"
echo "==> Live shortly at https://$(git config --get remote.origin.url | sed -E 's#.*[:/]([^/]+)/[^/]+$#\1#').github.io/${REPO_NAME}/"
