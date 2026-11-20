#!/usr/bin/env bash
# Rebuilds lib/ from Mixkit (same paths as sources.json). Idempotent: existing files are kept.
# The audio is NOT committed: the Mixkit licences forbid redistributing the raw files.
set -euo pipefail
cd "$(dirname "$0")"
fail=0
while read -r path url; do
  [ -z "$path" ] && continue
  if [ -s "$path" ]; then echo "ok    $path"; continue; fi
  mkdir -p "$(dirname "$path")"
  if curl -fsSL --retry 3 -o "$path.part" "$url"; then mv "$path.part" "$path"; echo "fetch $path"
  else rm -f "$path.part"; echo "FAIL  $path  $url" >&2; fail=1; fi
done <<'LIST'
lib/sfx/typing_1.mp3 https://assets.mixkit.co/active_storage/sfx/1387/1387-preview.mp3
lib/sfx/typing_2.mp3 https://assets.mixkit.co/active_storage/sfx/1386/1386-preview.mp3
lib/sfx/tension_1.mp3 https://assets.mixkit.co/active_storage/sfx/2297/2297-preview.mp3
lib/sfx/tension_2.mp3 https://assets.mixkit.co/active_storage/sfx/648/648-preview.mp3
lib/sfx/tension_3.mp3 https://assets.mixkit.co/active_storage/sfx/2951/2951-preview.mp3
lib/sfx/tension_4.mp3 https://assets.mixkit.co/active_storage/sfx/2948/2948-preview.mp3
lib/sfx/alert_1.mp3 https://assets.mixkit.co/active_storage/sfx/1110/1110-preview.mp3
lib/sfx/alert_2.mp3 https://assets.mixkit.co/active_storage/sfx/898/898-preview.mp3
lib/sfx/riser_1.mp3 https://assets.mixkit.co/active_storage/sfx/790/790-preview.mp3
lib/sfx/riser_2.mp3 https://assets.mixkit.co/active_storage/sfx/1465/1465-preview.mp3
lib/sfx/riser_3.mp3 https://assets.mixkit.co/active_storage/sfx/1493/1493-preview.mp3
lib/sfx/impact_big_1.mp3 https://assets.mixkit.co/active_storage/sfx/780/780-preview.mp3
lib/sfx/impact_big_2.mp3 https://assets.mixkit.co/active_storage/sfx/788/788-preview.mp3
lib/sfx/impact_big_3.mp3 https://assets.mixkit.co/active_storage/sfx/563/563-preview.mp3
lib/sfx/impact_big_4.mp3 https://assets.mixkit.co/active_storage/sfx/649/649-preview.mp3
lib/sfx/sub_drop_1.mp3 https://assets.mixkit.co/active_storage/sfx/3057/3057-preview.mp3
lib/sfx/sub_drop_2.mp3 https://assets.mixkit.co/active_storage/sfx/2299/2299-preview.mp3
lib/sfx/sub_drop_3.mp3 https://assets.mixkit.co/active_storage/sfx/2296/2296-preview.mp3
lib/sfx/shimmer_1.mp3 https://assets.mixkit.co/active_storage/sfx/2586/2586-preview.mp3
lib/sfx/shimmer_2.mp3 https://assets.mixkit.co/active_storage/sfx/3083/3083-preview.mp3
lib/sfx/whoosh_fast_1.mp3 https://assets.mixkit.co/active_storage/sfx/1490/1490-preview.mp3
lib/sfx/whoosh_fast_2.mp3 https://assets.mixkit.co/active_storage/sfx/168/168-preview.mp3
lib/sfx/whoosh_fast_3.mp3 https://assets.mixkit.co/active_storage/sfx/1462/1462-preview.mp3
lib/sfx/whoosh_fast_4.mp3 https://assets.mixkit.co/active_storage/sfx/1468/1468-preview.mp3
lib/sfx/whoosh_fast_5.mp3 https://assets.mixkit.co/active_storage/sfx/166/166-preview.mp3
lib/sfx/whoosh_fast_6.mp3 https://assets.mixkit.co/active_storage/sfx/174/174-preview.mp3
lib/sfx/whoosh_fast_7.mp3 https://assets.mixkit.co/active_storage/sfx/1492/1492-preview.mp3
lib/sfx/whoosh_fast_8.mp3 https://assets.mixkit.co/active_storage/sfx/2637/2637-preview.mp3
lib/sfx/whoosh_long_1.mp3 https://assets.mixkit.co/active_storage/sfx/164/164-preview.mp3
lib/sfx/whoosh_long_2.mp3 https://assets.mixkit.co/active_storage/sfx/1489/1489-preview.mp3
lib/sfx/whoosh_long_3.mp3 https://assets.mixkit.co/active_storage/sfx/1470/1470-preview.mp3
lib/sfx/key_1.mp3 https://assets.mixkit.co/active_storage/sfx/2534/2534-preview.mp3
lib/sfx/key_2.mp3 https://assets.mixkit.co/active_storage/sfx/1363/1363-preview.mp3
lib/sfx/key_3.mp3 https://assets.mixkit.co/active_storage/sfx/1376/1376-preview.mp3
lib/sfx/click_1.mp3 https://assets.mixkit.co/active_storage/sfx/1117/1117-preview.mp3
lib/sfx/click_2.mp3 https://assets.mixkit.co/active_storage/sfx/1126/1126-preview.mp3
lib/sfx/send_1.mp3 https://assets.mixkit.co/active_storage/sfx/3005/3005-preview.mp3
lib/sfx/send_2.mp3 https://assets.mixkit.co/active_storage/sfx/1466/1466-preview.mp3
lib/sfx/pop_1.mp3 https://assets.mixkit.co/active_storage/sfx/2364/2364-preview.mp3
lib/sfx/pop_2.mp3 https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3
lib/sfx/pop_3.mp3 https://assets.mixkit.co/active_storage/sfx/2356/2356-preview.mp3
lib/sfx/card_1.mp3 https://assets.mixkit.co/active_storage/sfx/2001/2001-preview.mp3
lib/sfx/card_2.mp3 https://assets.mixkit.co/active_storage/sfx/2070/2070-preview.mp3
lib/sfx/card_3.mp3 https://assets.mixkit.co/active_storage/sfx/1530/1530-preview.mp3
lib/sfx/tick_1.mp3 https://assets.mixkit.co/active_storage/sfx/1120/1120-preview.mp3
lib/sfx/tick_2.mp3 https://assets.mixkit.co/active_storage/sfx/3124/3124-preview.mp3
lib/sfx/success_1.mp3 https://assets.mixkit.co/active_storage/sfx/3109/3109-preview.mp3
lib/sfx/success_2.mp3 https://assets.mixkit.co/active_storage/sfx/600/600-preview.mp3
lib/sfx/success_3.mp3 https://assets.mixkit.co/active_storage/sfx/2865/2865-preview.mp3
lib/music/masking_the_masters.mp3 https://assets.mixkit.co/music/552/552.mp3
lib/music/odd_beats_01.mp3 https://assets.mixkit.co/music/722/722.mp3
lib/music/xceed_thru_johann.mp3 https://assets.mixkit.co/music/556/556.mp3
LIST
if command -v sha256sum >/dev/null && [ -f checksums.sha256 ]; then sha256sum --quiet -c checksums.sha256 || fail=1; fi
exit $fail
