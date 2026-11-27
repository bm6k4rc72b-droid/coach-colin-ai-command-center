# AI tools connected to this repo

Five open-source tools, each scanned with NVIDIA SkillSpector (static scan, `--no-llm`)
before being added. Pinned commits are the ones that were scanned.

| Tool | Repo | What it does | Scan | How it's connected |
|---|---|---|---|---|
| SkillSpector | [NVIDIA/skillspector](https://github.com/NVIDIA/skillspector) @ `e48d771` | Security scanner for agent skills: should this skill be installed? | SAFE (0/100) | Project skill `.claude/skills/skill-inspector` + `skillspector` CLI |
| Agent Reach | [Panniantong/Agent-Reach](https://github.com/Panniantong/Agent-Reach) @ `422478a` | Read-only access to YouTube, Reddit, X, Bilibili, Xiaohongshu, LinkedIn jobs, etc. | SAFE (0/100) | Project skill `.claude/skills/agent-reach` + `agent-reach` CLI |
| Ponytail 5 | [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail) @ `96608e0` | Claude Code plugin: shortest working solution, reuse first, cost/token band | SAFE (0/100) | Claude Code plugin (needs settings below) |
| Lemo-Opuscar | [lemomo-ai/lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar) @ `bc0992a` | 66 film styles made in code; Claude directs, draws and scores a short film | CAUTION (24/100), one false positive: `rm -rf .venv` on its own broken venv in `setup.sh` | Claude Code plugin (needs settings below) |
| FreeLLMAPI | [tashfeenahmed/freellmapi](https://github.com/tashfeenahmed/freellmapi) @ `73e3f05` | One OpenAI-compatible endpoint routing across free LLM providers | n/a (a server, not a skill) | Run it yourself, see below |

## Video stack

Scanned the same way. All four skill sets below scored "Do Not Install" (77–100) on the
static scan, but on review every HIGH finding was a false positive or expected behaviour: scripts
read their own API key from `.env` and send it only to that service (HeyGen, Kie.ai, Mapbox),
docs mention AWS credentials for cloud rendering, and style tips like "don't apologize" or
HTML comments were flagged as anti-refusal or hidden instructions. Most of each score is hundreds
of MEDIUM "unpinned `npx`" warnings, which is how these CLIs are meant to run.

| Tool | Repo | What it does | How it's connected |
|---|---|---|---|
| Remotion | [remotion-dev/claude-code-plugin](https://github.com/remotion-dev/claude-code-plugin) @ `3bece0d` | Official skills for programmatic video in React | Claude Code plugin `remotion@remotion` in `.claude/settings.json` |
| HyperFrames | [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes) @ `7b1d9cc` | Official HeyGen skills: write HTML, render video (captions, overlays, motion) | Claude Code plugin `hyperframes@hyperframes` in `.claude/settings.json` |
| Herk Edit Kit | [nateherkai/herk-edit-kit](https://github.com/nateherkai/herk-edit-kit) @ `10511e5` | 15 editing skills (`/edit-video`, `/short-form-edit`, cut silences, beat sync), built on HyperFrames | Workspace: its skills call its own `scripts/` and `style-library/`, so open Claude Code inside a clone of it |
| OpenMontage | [calesthio/OpenMontage](https://github.com/calesthio/OpenMontage) @ `d21f5d4` | Agentic video production: 12 pipelines (podcast repurpose, explainers, dubbing…) | Workspace: open Claude Code inside a clone of it (`make setup` first) |
| ViralMint | [openclaw-easy/ViralMint](https://github.com/openclaw-easy/ViralMint) @ `8f6511e` | Local clipper app: trend scouting, clipping, captions; MCP server with 69 tools | Run it on your computer (`python run.py`), open **MCP** in its sidebar, paste the `claude mcp add` line it shows (token-gated, `http://127.0.0.1:16888/mcp/`) |
| AutoShorts | [JayWebtech/autoshorts](https://github.com/JayWebtech/autoshorts) @ `5ae8dd3` | Desktop app: long video → vertical shorts with captions | Desktop app from its Releases page; no Claude Code integration |

ClipCast was not added: no credible repo by that name was found.

## Upscaling and face restoration

Connected through the project skill `.claude/skills/upscale`. Its `scripts/setup.sh` installs
all three on Linux (pinned versions, into `~/.local/share/upscalers`, wrappers in `~/.local/bin`).
It runs on demand, not at session start, because GFPGAN's PyTorch is several GB.

| Tool | Version | Command | Use it for |
|---|---|---|---|
| [Video2X](https://github.com/k4yt3x/video2x) | 6.4.0 AppImage | `video2x` | Video upscaling (Real-ESRGAN, Real-CUGAN, Anime4K) and RIFE frame interpolation |
| [Upscayl](https://github.com/upscayl/upscayl) engine | upscayl-bin 20251207-174704 + Upscayl models | `upscayl-bin` | Stills: thumbnails, posters, frames |
| [GFPGAN](https://github.com/TencentARC/GFPGAN) | v1.4 weights @ `7552a77` | `gfpgan` | Face restoration in stills (and video via frames) |

- GFPGAN is not bundled with Video2X; it's a separate install.
- The Upscayl desktop app (Mac/Windows/Linux) uses the same engine and models, if you'd rather click.
- Cloud sessions have no GPU, so setup adds Mesa's CPU Vulkan driver. Everything works, but video
  runs at under 1 frame per second there. Run full-length jobs on a GPU machine with the same commands.
- GFPGAN fix applied at install: basicsr 1.4.2 imports `torchvision.transforms.functional_tensor`,
  which newer torchvision removed; setup repoints it to `torchvision.transforms.functional`.

## Installing the CLIs

```bash
uv tool install "git+https://github.com/NVIDIA/skillspector.git@e48d771a26f7398b36256ceb8d8f94adce3d5c44"
uv tool install "git+https://github.com/Panniantong/Agent-Reach.git@422478ae0264d2236bf7ebd1c3b11a69aaafa4a3"
```

## Enabling the two plugins (needs your approval)

Add this to `.claude/settings.json`, or run the commands in Claude Code:

```json
{
  "extraKnownMarketplaces": {
    "ponytail": { "source": { "source": "github", "repo": "DietrichGebert/ponytail", "ref": "96608e078b2d5ea607c5c3b8b5a54d1c1fba6846" } },
    "lemolab":  { "source": { "source": "github", "repo": "lemomo-ai/lemo-opuscar", "ref": "bc0992ae25f63c1780dd9cfe39a020e2deda79ec" } }
  },
  "enabledPlugins": {
    "ponytail@ponytail": true,
    "lemo-opuscar@lemolab": true
  }
}
```

```
/plugin marketplace add DietrichGebert/ponytail
/plugin install ponytail@ponytail
/plugin marketplace add lemomo-ai/lemo-opuscar
/plugin install lemo-opuscar@lemolab
```

Ponytail runs small local Node hooks each session. Its optional webhook is off unless you set a URL.

## FreeLLMAPI

It is a local router: you add your own free provider keys in its dashboard, then point
OpenAI-compatible clients at `http://localhost:3001/v1` with the unified key it gives you.
Run it on your own machine (Docker one-liner or desktop app from the repo's Releases), not in
an ephemeral cloud session, since the keys live in its local database.

## Notes

- Agent Reach is read-only. Login-backed channels (X, Instagram, Xiaohongshu, LinkedIn) use your
  own cookies and may break those sites' terms; use a spare account if you enable them.
- Re-scan before updating a pin: `skillspector scan <repo-or-folder> --no-llm`.

## Image → 3D

| Tool | Repo | What it does | How it's connected |
|---|---|---|---|
| img2threejs | [img2threejs/img2threejs](https://github.com/img2threejs/img2threejs) @ `0c0c49b` | Rebuilds the object in a reference image as a procedural Three.js model, in code (no mesh files, no API keys) | Project skill `.claude/skills/img2threejs` (SKILL.md, forge, grimoire, docs, scripts; Python stdlib only). Its tests, CI files, logos and the optional GLB character pipeline were left out. Its npm installer was not used because it edits `~/.claude/settings.json`. |
| image-blaster | [neilsonnn/image-blaster](https://github.com/neilsonnn/image-blaster) @ `4acb43b` | One image → Gaussian-splat world (World Labs Marble), 3D props (Hunyuan 3D via FAL) and SFX | Workspace: clone it, open Claude Code inside it, and give it a World Labs key and a FAL key (both paid services). Its 8 skills live in its own `.claude/skills` and use its `app/` viewer. |

Scans: image-blaster's skills scored SAFE (8/100). img2threejs scored "Do Not Install" (100/100),
almost all from its own test suite (environment copies for subprocesses, a `../../etc/passwd`
path-traversal refusal test, a test that snapshots and restores `~/.claude/settings.json`) and from
its installer docs; its build code makes no network calls.

`SkylarKitchen/skills` was not added: the repo isn't public (GitHub asks for a login).

## Motion graphics stack

From the "10 GitHub repos for motion graphics in Claude Code" list. Scanned with SkillSpector
(static) on 2026-11-15 and pinned to the scanned commits.

| Repo | How it's connected | Scan |
|---|---|---|
| [lemomo-ai/lemo-opuscar](https://github.com/lemomo-ai/lemo-opuscar) | Plugin `lemo-opuscar@lemolab` (already enabled) | CAUTION 24, false positive |
| [patch-gg/pixelfx](https://github.com/patch-gg/pixelfx) @ `5294518` | Plugin `pixelfx@pixelfx`, enabled: 244 pixel-art effects plus a skill | CAUTION 29: its skill mentions a `curl … \| sh` installer for patch.gg's CLI; read it before running |
| [Vincentwei1021/video-shotcraft](https://github.com/Vincentwei1021/video-shotcraft) @ `6700db2` | Plugin `video-shotcraft@coach-colin`, enabled through this repo's own `.claude-plugin/marketplace.json` (the project ships no marketplace) | 100: findings are its optional social-publishing script (sends your own API key to the platform you post to) and CI files |
| [JohnHeibel/ClaudeAnimationBase](https://github.com/JohnHeibel/ClaudeAnimationBase) @ `0ac8bf2` | Copied to `tools/claude-animation-base/` (MIT). Open Claude Code inside that folder and ask for a scene | SAFE-ish 12, low findings only |
| [ahujasid/mcp-for-blender](https://github.com/ahujasid/mcp-for-blender) @ `8f40787` | Plugin **on** (`mcp-for-blender@mcp-for-blender: true`). In cloud sessions the startup hook installs Blender 4.0 and runs it on a virtual display with the add-on's server on :9876 (`tools/blender/blender-headless.sh`); on your computer, install the add-on and click *Start MCP Server* in Blender | 100: sends anonymous telemetry by default, so `DISABLE_TELEMETRY=true` is set in `.claude/settings.json`; its auto-updater downloads and runs code, so only run `update` deliberately |
| [yihui-dev/awesome-opus5-5-videos](https://github.com/yihui-dev/awesome-opus5-5-videos) | **Not copied in.** Browse it on GitHub | 100: 703 crowd-submitted prompts, some with hidden zero-width characters and one pointing at `~/.claude/settings.json`; not safe to load as agent instructions |
| [mrdoob/three.js](https://github.com/mrdoob/three.js) | Already a dependency of 10 labs here (fusion-lab, roadster-lab, human-atlas, …) | n/a (library) |
| [pmndrs/react-three-rapier](https://github.com/pmndrs/react-three-rapier), [pmndrs/react-postprocessing](https://github.com/pmndrs/react-postprocessing) | Not installed: they need a React + react-three-fiber project and none here uses one. Add with `npm i @react-three/fiber @react-three/rapier @react-three/postprocessing` when you start one | n/a (libraries) |
| [librosa/librosa](https://github.com/librosa/librosa) | Python audio analysis (beat detection for music-synced edits). Install where you render: `pip install librosa` | n/a (library) |

## Audio, music and beat-sync stack

From a Grok list of audio tools for video. All 18 repos exist; here's how each one landed.
Skills were scanned with SkillSpector on 2026-11-15.

**Connected to Claude Code in this repo**

| Repo | How | Scan |
|---|---|---|
| [FFmpeg](https://github.com/FFmpeg/FFmpeg), [moviepy](https://github.com/Zulko/moviepy), [auto-editor](https://github.com/WyattBlue/auto-editor), [librosa](https://github.com/librosa/librosa) | New project skill `.claude/skills/audio-mix`: `scripts/setup.sh` installs moviepy + librosa (venv), auto-editor and beatscope (uv tools); tested recipes for voice-over ducking, loudness, music beds, silence cutting and a beat-grid script | n/a (written here) |
| [chosuicide/beatscope](https://github.com/chosuicide/beatscope) @ `508d6a5` (MIT) | Skill copied to `.claude/skills/beatscope-visualizer`; CLI installed by audio-mix setup | SAFE 18 |
| [AEON-7/aeon-music-video](https://github.com/AEON-7/aeon-music-video) @ `2db8454` (MIT) | Skill copied to `.claude/skills/aeon-music-video` (SKILL.md, scripts, requirements; its self-updating `sync.sh` left out) | 81, false positives: `.env` holds only ffmpeg paths and render defaults |

**Apps to install on your computer** (not Claude add-ons): [Shotcut](https://github.com/mltframework/shotcut),
[OpenShot](https://github.com/OpenShot/openshot-qt), [proj](https://github.com/jonesphillip/proj) (browser editor),
[MediaNest](https://github.com/akash098p/MediaNest), [MixCut](https://github.com/LucaFagnoni/MixCut),
[StemSyncVideoEditor](https://github.com/vrgamegirl19/StemSyncVideoEditor).

**Covered by audio-mix instead** (small single-purpose scripts): [video-audio-tools](https://github.com/HeZhang1994/video-audio-tools),
[automerge-video-audio](https://github.com/tngaspar/automerge-video-audio), [mykeels/add-music-to-video](https://github.com/mykeels/add-music-to-video).

**Linked only**
- [cindyxu1030/add-music-to-video](https://github.com/cindyxu1030/add-music-to-video): a cookbook for Sonilo's paid music API (needs `SONILO_API_KEY`, billed per second).
- [xiaoyang111222/timeline-bgm](https://github.com/xiaoyang111222/timeline-bgm): free local BGM from a timeline, but the repo has no license, so its code can't be copied here. Clone it on your machine to use it.
- Lists: [awesome-audiovisual](https://github.com/brandonhimpfen/awesome-audiovisual), [muses](https://github.com/fiehrfly/muses) (royalty-free music libraries).

## Upscaling and cinematic color

From a Grok list of upscaling and film-look tools. All 12 repos exist.

| Repo | How it's connected |
|---|---|
| [k4yt3x/video2x](https://github.com/k4yt3x/video2x), [xinntao/Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN) | Already here: the `upscale` skill (Video2X with Real-ESRGAN, plus GFPGAN for faces) |
| [isaacrowntree/color-grade-ai](https://github.com/isaacrowntree/color-grade-ai) @ `a6eef94` (MIT) | Plugin `color-grade-ai@coach-colin` through this repo's marketplace: measures a frame and writes a .cube LUT for Resolve/Premiere, matches shots. SkillSpector flagged "always answer" in its docs as anti-refusal; it's a sentence about the user answering a question, and its scripts make no network calls |
| [louisedesadeleer/color-correct](https://github.com/louisedesadeleer/color-correct) @ `4c38e5c` | **Not copied: the repo has no license**, so its code can't be redistributed here. Scanned SAFE (20). To use it, clone it on your machine: `git clone https://github.com/louisedesadeleer/color-correct ~/.claude/skills/color-correct` |
| [JanLohse/spectral_film_lut](https://github.com/JanLohse/spectral_film_lut) (MIT) | Desktop app that makes film-stock LUTs: `pip install spectral-film-lut`, then run `spectral_film_lut` on your computer |
| [moeezalam/A24Colour](https://github.com/moeezalam/A24Colour) (MIT) | Local web app with six A24-style photo presets; run its `setup.sh` on your computer |
| [sczhou/Upscale-A-Video](https://github.com/sczhou/Upscale-A-Video) | Research model, **non-commercial license** (S-Lab), needs a big NVIDIA GPU. Not added |
| [Anishrkhadka/restore-lab](https://github.com/Anishrkhadka/restore-lab), [dtaddis/ai-remaster-pipeline](https://github.com/dtaddis/ai-remaster-pipeline), [wob25/AI-CineMaster](https://github.com/wob25/AI-CineMaster) | GPU restoration apps (Real-ESRGAN, BasicVSR++, ComfyUI). Run on a GPU machine or Colab; the `upscale` skill covers the same models here |
| [SongZihui-sudo/digitalFilm](https://github.com/SongZihui-sudo/digitalFilm) | Neural film simulation (GPL-3.0, 105 MB of models). Not added |
| [seunghyuns98/VideoColorGrading](https://github.com/seunghyuns98/VideoColorGrading) | ICCV 2025 research code, needs a GPU. Not added |

## SEO, GEO and ads: NotFair

[nowork-studio/notfair-plugin](https://github.com/nowork-studio/notfair-plugin) @ `deed043` (MIT, v0.27.25) is installed as plugin
`notfair@nowork-studio` (marketplace `nowork-studio`, pinned to the scanned commit). It adds 45 skills, run as `/notfair:<skill>`:

- **SEO and GEO (work with no account):** `seo-analysis`, `seo-page`, `keyword-research`, `content-planner`, `content-writer`,
  `meta-tags-optimizer`, `schema-markup-generator`, `geo-optimizer`, `local-seo`, `ecommerce-seo`, `image-seo`, `sitemap-audit`,
  `broken-link-checker`, `backlink-audit`, `competitor-pages`, `programmatic-seo`, `hreflang-international`, `sxo`, `seo-drift`
- **Live data and ads (need the NotFair MCP login):** `search-console`, `google-analytics`, `google-ads*`, `meta-ads*`,
  `paid-ads*` (X, LinkedIn, Reddit, TikTok, Amazon, ChatGPT), `wordpress`, `gohighlevel`

The plugin also registers the `NotFair` MCP server (`https://notfair.co/api/mcp/notfair`, sign-in through OAuth the first time a
live-data skill runs). SkillSpector `--no-llm` scored it 100/CRITICAL on six HIGH pattern hits; each was read and is a false
positive: two "don't judge results during the learning phase" ad rules, a skill finding its own reference file under
`~/.claude/plugins`, an "approve the outline first" step, a "fabricated stats = hard fail" check, and a line telling the agent to
*never* access credentials. No executable scripts, no hooks.

## Batch 8: full list check, Blender on

Everything else on this list was already installed in earlier batches (see the sections above). New this time:

| Repo | How it's connected |
|---|---|
| [styfinity/claude-marketing-department](https://github.com/styfinity/claude-marketing-department) @ `059afff` (MIT) | Plugin `marketing@styfinity-marketing`: 50 agents in 5 departments (market research, competitor intel, customer research, strategy, creative), 150 prompts, 30 skills. Run `/marketing:onboard` once to write `marketing-brief.md`; a SessionStart hook (`load-brief.js`, Node built-ins only, reads that one file) then loads it into every session. SkillSpector 58/HIGH: two "anti-refusal" hits that are a story-writing step and a "say no to the wrong customer" step, and the hook, which was read in full |
| [xinntao/Real-ESRGAN-ncnn-vulkan](https://github.com/xinntao/Real-ESRGAN-ncnn-vulkan) (MIT) | `upscale` skill: `scripts/setup.sh realesrgan` installs the official v0.2.5.0 binary and models as `realesrgan-ncnn-vulkan` (tested: 4x on CPU Vulkan) |
| [debpalash/VoiceStudio](https://github.com/debpalash/VoiceStudio) @ `6fe6f4d` | **AGPL-3.0 desktop/server app** (Python backend + Electron), so it isn't copied into this repo. Run it on your computer from its README; Reel Studio already expects it there for voice-overs |
| [ahujasid/mcp-for-blender](https://github.com/ahujasid/mcp-for-blender) | Turned on, with Blender running in cloud sessions (row above) |

`tools/blender/`: the add-on (`mcp_for_blender_addon.py`, MIT, from `8f40787`), `start_server.py` (registers it and starts the server
inside Blender) and `blender-headless.sh start|stop|status`.

## Batch 9: motion graphics, GTA clipping, game studio, music and face animation

| Repo | How it's connected |
|---|---|
| [bangtutorial/bang-motion](https://github.com/bangtutorial/bang-motion) @ `c1aa65e` (MIT, ~2.8k★) | Plugin `bang-motion@bang-motion`: openers, promos, bumpers, kinetic type and explainers as one looping `index.html` (GSAP), 10 styles, vertical supported. SkillSpector 57: only "referenced file not inspected" notes |
| [zeative/motion-educator](https://github.com/zeative/motion-educator) @ `c791446` (MIT) | Project skill `.claude/skills/motion-educator` (SKILL.md, kit, references, templates; the 170 MB of examples/docs media left out). Storyboard-first 3D explainer films rendered frame by frame. `npm ci` done; its doctor passes here (Chromium on CPU WebGL: about a second a frame for heavy 3D). Narration uses ElevenLabs (`ELEVENLABS_API_KEY`) or a supplied take; music from `kit/audio/fetch.sh` (Mixkit). Only hosts it calls: mixkit.co, api.elevenlabs.io |
| [vossashtonai/gta6-clipper](https://github.com/vossashtonai/gta6-clipper) @ `11cee2b` (MIT) | Plugin `gta6-clipper@ashtonvossai`: finds the day's biggest GTA 6 streams (YouTube search, optional Twitch API) and cuts 3 vertical clips each with facecam, hook and word captions. **Mac only** (Homebrew, whisper-cpp). SkillSpector 100 on: reading `TWITCH_CLIENT_ID/SECRET` from its own `.env` and sending them only to Twitch's token API, the official uv installer, and a background recorder. Use it on **your own streams or streamers who allow clipping**; re-uploading other people's streams risks strikes |
| [Donchitos/Claude-Code-Game-Studios](https://github.com/Donchitos/Claude-Code-Game-Studios) @ `abc0de7` (MIT, ~40k★) | Whole-project template (its own `.claude/` with 49 agents, 75 skills, hooks), so it isn't merged into this repo. `tools/game-studios/new-game.sh <folder>` starts a new game project from the pinned commit (tested: 49 agents). Its hooks only call GitHub's releases API for an update notice. Flags were templates' HTML comments and a docs line about installing Claude Code |
| [ace-step/ACE-Step-1.5](https://github.com/ace-step/ACE-Step-1.5) @ `ca1e85f` (MIT, ~15k★) | Local AI music generation. Models come from Hugging Face, which this cloud session can't reach, and it wants a GPU, so `tools/ace-step/setup.sh` installs it on your computer (`uv sync`, then `./start_gradio_ui.sh`). Free web version: acemusic.ai |
| [NVIDIA/Audio2Face-3D](https://github.com/NVIDIA/Audio2Face-3D) | Hub page for NVIDIA's audio-to-facial-animation models, SDK (MIT, C++/CUDA) and Maya/Unreal plugins. Needs an NVIDIA GPU; nothing runnable to install here. Start from its README on a GPU machine |

## Batch 10: Blender control, image → 3D, photo → 3D scenes

| Repo | How it's connected |
|---|---|
| [ahujasid/mcp-for-blender](https://github.com/ahujasid/mcp-for-blender) (formerly blender-mcp; upstream now at `a5a8acf`) | Already installed and on (Batch 8, pinned at `8f40787`). In cloud sessions `tools/blender/blender-headless.sh start` runs Blender 4.0 with the add-on's server on :9876. Not bumped to the newer commit, since its auto-updater and telemetry were reviewed at the pinned one |
| [microsoft/TRELLIS.2](https://github.com/microsoft/TRELLIS.2) @ `75fbf01` (MIT) | One image → detailed 3D model with PBR materials (GLB). Needs Linux, an NVIDIA GPU with 24 GB+ and CUDA 12.4, so it can't run in cloud sessions. `tools/trellis2/setup.sh [dir]` installs it on a GPU machine with its own `setup.sh` (which runs `sudo apt install libjpeg-dev` and clones its CUDA extensions unpinned); then `python app.py` for the web UI. Weights come from Hugging Face |
| [nerfstudio-project/nerfstudio](https://github.com/nerfstudio-project/nerfstudio) @ `50e0e3c` (Apache-2.0) | Photos or video → NeRF / Gaussian-splat scene with a web viewer. Training needs an NVIDIA GPU (CUDA 11.8). `tools/nerfstudio/setup.sh [dir]` makes a `nerfstudio` conda env (PyTorch cu118, tiny-cuda-nn, editable install); then `ns-process-data`, `ns-train splatfacto`, `ns-export` |

## Batch 11: AnyScene

| Repo | How it's connected |
|---|---|
| [apekshik/anyscene](https://github.com/apekshik/anyscene) @ `88c1daf` (MIT) | Claude skill + Blender pipeline: reference images or a brief → a dressed, lit, photoreal Blender scene with camera moves. Its `SKILL.md` uses repo-relative scripts, so it's a workspace rather than a merged skill: `tools/anyscene/setup.sh [dir]` clones the pinned commit and runs `npm install`, then open that folder in Claude Code. Needs Blender 5.0+ (cloud sessions have 4.0), a 12–16 GB GPU for Cycles, ffmpeg, uv and a **fal.ai key (`FAL_KEY`); generation is billed at about $1.65 per prop, ~$150 per scene**. Not run here |

## Batch 12: game-dev skills

| Repo | How it's connected |
|---|---|
| [gamedev-skills/awesome-gamedev-agent-skills](https://github.com/gamedev-skills/awesome-gamedev-agent-skills) @ `c6ca6c4` (Apache-2.0, ~6.5k★) | Plugin `gamedev@awesome-gamedev-agent-skills`, enabled: a router skill plus 79 game-dev skills (Godot, Unity, Unreal, Three.js, Phaser, PixiJS, Bevy, Pygame, LÖVE, Defold, Roblox, Ebitengine; disciplines like game feel, UI/UX, dialogue; genres; workflows like itch.io publishing). No hooks or MCP servers; its scripts are local project checkers. One Unity doc mentions the official `curl … \| bash` installer, which nothing runs automatically. Smaller per-engine plugins (`godot@…`, `web-engines@…` and so on) are in the same marketplace if you'd rather enable only one |

## Batch 13: Unity

| Repo | How it's connected |
|---|---|
| [CoplayDev/unity-mcp](https://github.com/CoplayDev/unity-mcp) @ `19b66ec` (MIT, ~16k★) | MCP server `unityMCP` in `.mcp.json` (enabled in `.claude/settings.json`), started by `uvx` from the pinned commit; tested here: it starts and lists 49 tools. Telemetry to coplay.dev is on by default upstream, so it is turned off with `DISABLE_TELEMETRY`. Its skill is copied to `.claude/skills/unity-mcp`. The other half is a Unity Editor package you add on your computer (git URL in `tools/unity-mcp/README.md`); cloud sessions have no Unity, so the tools only work when you run Claude Code next to an open Unity project |
| [ahujasid/mcp-for-blender](https://github.com/ahujasid/mcp-for-blender) | Already installed (Batch 8 and 10) |
| [Donchitos/Claude-Code-Game-Studios](https://github.com/Donchitos/Claude-Code-Game-Studios) | Already installed (Batch 9): `tools/game-studios/new-game.sh <folder>` |
