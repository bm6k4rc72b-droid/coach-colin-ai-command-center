#!/usr/bin/env bash
# Sets up MoneyPrinterTurbo (MIT, github.com/harry0703/MoneyPrinterTurbo) for Coach Colin.
#
#   export PEXELS_API_KEY=...        # free at pexels.com/api: stock footage (required)
#   export ANTHROPIC_API_KEY=...     # optional: lets MoneyPrinterTurbo write scripts from a bare topic
#   ./money-printer/setup.sh
#
# Then start the API with ./money-printer/run.sh and make videos with node money-printer/make-video.mjs.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
cd "$HERE/.."
git submodule update --init money-printer/MoneyPrinterTurbo
cd "$HERE/MoneyPrinterTurbo"

[ -f config.toml ] || cp config.example.toml config.toml
python3 - "$PEXELS_API_KEY" "${ANTHROPIC_API_KEY:-}" <<'PY'
import re, sys
pexels, anthropic = sys.argv[1], sys.argv[2]
p = 'config.toml'; s = open(p, encoding='utf-8').read()
def setv(key, val):
    global s
    s, n = re.subn(rf'(?m)^{key}\s*=.*$', f'{key} = {val}', s, count=1)
    if not n: raise SystemExit(f'config.toml has no "{key}" key; MoneyPrinterTurbo changed its config format')
if pexels: setv('pexels_api_keys', f'["{pexels}"]')
if anthropic:
    setv('llm_provider', '"anthropic"')
    setv('anthropic_api_key', f'"{anthropic}"')
    setv('anthropic_model_name', '"claude-opus-5-5"')
open(p, 'w', encoding='utf-8').write(s)
print('config.toml ready (keys stay on this machine; config.toml is git-ignored upstream).')
PY

if command -v uv >/dev/null; then uv sync; else python3 -m venv .venv && .venv/bin/pip install -r requirements.txt; fi
echo
echo "Done. Start the API:   ./money-printer/run.sh"
echo "Or the web UI:         (cd money-printer/MoneyPrinterTurbo && sh webui.sh)"
