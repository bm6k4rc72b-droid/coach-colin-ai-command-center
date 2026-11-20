#!/bin/bash
# Start a new game project from Claude Code Game Studios (Donchitos, MIT) pinned to the scanned commit.
# It is a whole-project template (its own .claude/ with 49 agents and hooks), so it lives in its own folder/repo,
# not inside this one. Usage: tools/game-studios/new-game.sh <folder>   then: cd <folder> && claude
set -euo pipefail
DEST="${1:?usage: new-game.sh <folder>}"
[ -e "$DEST" ] && { echo "$DEST already exists"; exit 1; }
git clone -q https://github.com/Donchitos/Claude-Code-Game-Studios "$DEST"
git -C "$DEST" checkout -q abc0de79d6ceb0b5d7aa693945849b3937afbe6a
rm -rf "$DEST/.git" && git -C "$DEST" init -q && git -C "$DEST" add -A && git -C "$DEST" commit -qm "Start from Claude Code Game Studios @abc0de7"
echo "Ready: cd $DEST && claude   (then run /start)"
