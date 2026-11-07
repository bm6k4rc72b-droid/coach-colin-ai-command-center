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
