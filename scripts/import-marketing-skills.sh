#!/usr/bin/env bash
# Re-imports the third-party marketing / SEO / GEO skill packs into .claude/skills/.
# Both packs are MIT licensed; each imported skill keeps the pack's LICENSE next to it.
# Usage: scripts/import-marketing-skills.sh   (needs git and network access to github.com)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
NOTICE="$ROOT/.claude/skills/THIRD_PARTY_SKILLS.md"

import() { # repo  subdir-with-skills  label
  local repo="$1" sub="$2" label="$3" dir="$TMP/$(basename "$1")"
  git clone -q --depth 1 "https://github.com/$repo" "$dir"
  local sha; sha="$(git -C "$dir" rev-parse --short HEAD)"
  local n=0
  for s in "$dir/$sub"/*/; do
    [ -f "$s/SKILL.md" ] || continue
    local name; name="$(basename "$s")"
    rm -rf "$ROOT/.claude/skills/$name"
    cp -r "$s" "$ROOT/.claude/skills/$name"
    cp "$dir/LICENSE" "$ROOT/.claude/skills/$name/LICENSE.$label"
    n=$((n+1))
  done
  printf -- '- **%s**: %s skills from <https://github.com/%s> at `%s` (MIT)\n' "$label" "$n" "$repo" "$sha" >> "$NOTICE"
}

printf '# Third-party skills\n\nImported by `scripts/import-marketing-skills.sh`. Each skill folder carries its pack'"'"'s MIT `LICENSE.*` file.\nReviewed before import: Markdown instructions plus a few helper scripts that call only the services they name (SerpAPI, ScrapeCreators, SEC, GitHub, Wayback), and only with keys you set.\n\n' > "$NOTICE"
import coreyhaines31/marketingskills skills marketingskills
import onvoyage-ai/gtm-engineer-skills . gtm-engineer-skills
echo "Imported. See $NOTICE"
