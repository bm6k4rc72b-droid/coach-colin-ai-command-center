#!/bin/bash
# Installs the command-line tools behind the project skills in .claude/skills:
#   agent-reach  (Panniantong/Agent-Reach) - read-only access to platforms an agent can't reach alone
#   skillspector (NVIDIA/skillspector)      - security scan for agent skills before installing them
# Pinned to the commits scanned with SkillSpector (see docs/AI_TOOLS.md).
# Idempotent and quiet; a failure never blocks the session.
export PATH="$HOME/.local/bin:$PATH"
command -v uv >/dev/null || exit 0

command -v agent-reach >/dev/null || uv tool install --quiet \
  "git+https://github.com/Panniantong/Agent-Reach.git@422478ae0264d2236bf7ebd1c3b11a69aaafa4a3" >/dev/null 2>&1 || true
command -v skillspector >/dev/null || uv tool install --quiet \
  "git+https://github.com/NVIDIA/skillspector.git@e48d771a26f7398b36256ceb8d8f94adce3d5c44" >/dev/null 2>&1 || true

if [ -n "$CLAUDE_ENV_FILE" ]; then
  echo "export PATH=\"$HOME/.local/bin:\$PATH\"" >> "$CLAUDE_ENV_FILE"
fi
exit 0
