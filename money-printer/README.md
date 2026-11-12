# Video Machine · MoneyPrinterTurbo for Coach Colin

[MoneyPrinterTurbo](https://github.com/harry0703/MoneyPrinterTurbo) (MIT) is a free AI short-form video machine:
topic or script in, then stock footage, narration, subtitles and music are edited into a finished TikTok / Reel / Short.
It is included here as a **git submodule** pinned to `dd09658` (`money-printer/MoneyPrinterTurbo`), with a Coach Colin
setup on top:

- **Guardrails first.** Scripts from COLIN OS are checked before anything is rendered: no dosing or injection talk,
  no cure or "FDA approved" claims, and an `#ad` disclosure on partner content. Topic-only runs give
  MoneyPrinterTurbo's script writer the same rules (`COLIN_SYSTEM_PROMPT` in `public/colin-os/js/videomachine.js`).
- **On-brand footage.** Search terms per client lane (athletes, GLP lifestyle, high-pressure jobs). Needles, pills,
  vials and hospital shots are always filtered out.
- **On-brand look.** Vertical 9:16, bold gold subtitles, a deep male voice by default.
- **Your voice.** `--voicestudio` narrates with your cloned voice from a local
  [VoiceStudio](https://github.com/debpalash/VoiceStudio).

## Set up (once, on your computer)

```bash
git submodule update --init                 # fetches MoneyPrinterTurbo (~200 MB with fonts and music)
export PEXELS_API_KEY=...                   # free: https://www.pexels.com/api/
export ANTHROPIC_API_KEY=...                # optional, for topic-only videos
./money-printer/setup.sh
./money-printer/run.sh                      # API on http://127.0.0.1:8080
```

You need Python 3.11+, preferably [uv](https://docs.astral.sh/uv/). MoneyPrinterTurbo's own docs (Docker, the
web UI, GPU) are in `money-printer/MoneyPrinterTurbo/README-en.md`.

## Make videos

```bash
# From COLIN OS: Reel team → run → "Export to Reel Studio" gives reel-props.json, or Video Machine → "Download job"
node money-printer/make-video.mjs --script reel-props.json --lane glp
node money-printer/make-video.mjs --topic "3 mistakes people make on a GLP-1" --lane glp
node money-printer/make-video.mjs --batch topics.txt --lane athlete        # one video per line
node money-printer/make-video.mjs --script reel-props.json --voicestudio  # your cloned voice
node money-printer/make-video.mjs --script reel-props.json --dry-run      # print the job only
```

Videos land in `money-printer/out/`. The COLIN OS **Video Machine** tab can also send jobs straight to the API
running on your computer (`run.sh` allows that page's origin through CORS).

**Reel Studio or Video Machine?** Reel Studio (`reel-studio/`, Remotion) makes branded talking-head-style reels on
your own photo or footage. Video Machine makes b-roll explainer videos from stock footage, in bulk.

Updating: `cd money-printer/MoneyPrinterTurbo && git fetch && git checkout <new commit>`, then commit the submodule bump.
