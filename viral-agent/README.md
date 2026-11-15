# viral-agent

Finds what's going viral about a topic (`topics/*.json`: `gta6`, `ff7-revelation`, `ff-resonance`), scores it, and has Claude write a
briefing, hooks and a 5-day posting plan. `clip.mjs` cuts vertical clips from your own gameplay.

```
collect (official APIs) → score (velocity × engagement) → Claude + web search → briefing.md, plan.csv
your gameplay.mp4 → clip.mjs (loudest + busiest moments) → 1080×1920 clips with a hook caption
```

## Setup (run on your own computer; Node 22+, ffmpeg)

```bash
cd viral-agent && npm install
cp config.example.env .env   # fill in what you have; every source is optional
set -a; . ./.env; set +a
npm run nightly -- --topic ff7-revelation   # writes out/<topic>/<date>/briefing.md, plan.csv, posts.json, strategy.json
npm run clip -- ~/Videos/gta6_session.mp4 out/clips --count 6 --len 14 --hook "THIS JUST HAPPENED"
```

Run it nightly with cron (`crontab -e`):
```
15 1 * * * cd ~/coach-colin-ai-command-center/viral-agent && set -a && . ./.env && for t in gta6 ff7-revelation ff-resonance; do npm run nightly -- --topic $t; done >> cron.log 2>&1
```

## Sources

| Platform | How | Key |
|---|---|---|
| YouTube | Data API v3 search + stats | `YOUTUBE_API_KEY` (Google Cloud console, free quota) |
| Reddit | OAuth app-only (r/GTA6 top of the day + searches) | `REDDIT_CLIENT_ID`, `REDDIT_CLIENT_SECRET` |
| X | API v2 recent search | `X_BEARER_TOKEN` (paid tier with search) |
| Instagram | Graph API hashtag top media | `IG_ACCESS_TOKEN`, `IG_USER_ID` (Business/Creator account) |
| TikTok | CSV export from TikTok Creative Center into `data/tiktok/` | none |
| Everything else | Claude's web search | `ANTHROPIC_API_KEY` (or `ant auth login`) |

It uses official APIs only: no logins, cookies or scraping behind walls. The Claude step uses
`claude-opus-5-5` with server-side refusal fallback turned on (`fallbacks: "default"`).
Set `CLAUDE_MODEL` to change the model.

## Rules baked into the strategy prompt

No leaked or pre-release footage, no spoilers, and no AI-generated images of GTA 6 characters
or locations: Take-Two has sent cease-and-desists over AI GTA 6 images. Rockstar's policy allows
non-commercial fan use of footage, so check it before you monetize clips.

## Topics

Each `topics/<slug>.json` sets the search term, subreddits (`top` = daily top posts, `search` = searched for the term),
the X query, the Instagram hashtag, and the content rules Claude must follow for that franchise. Add a file to add a
topic. TikTok CSV exports go in `data/<slug>/tiktok/`.
