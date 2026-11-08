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
