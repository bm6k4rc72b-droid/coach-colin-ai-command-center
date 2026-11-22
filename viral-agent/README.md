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

## Creator intelligence (outliers, creators, brand deals, breakdowns, ask)

Every nightly run also:

- **Baselines** each creator: their usual views (median of their last 30 uploads, YouTube API), subscribers and
  uploads per week. Creators with 3+ posts in the batch get a baseline on any platform.
- **Breakouts**: `outlier_x` = a post's views ÷ its creator's usual views. `--outlier 5` (default) lists 5x+ posts.
- **Creators** on the topic, filterable: `--max-followers 200000`.
- **Brand deals**: sponsor and disclosure lines ("sponsored by", "thanks to X for sponsoring", "paid partnership
  with", "use code … at", #ad) → which brands work with which creators, and who they rebook.
- **Labels** the top 30 posts with Claude: hook, hook type, format, offer, proof points, topic.
- **Indexes** it all in `data/<topic>/index.jsonl`, growing every night.

```bash
npm run ask -- --topic gta6 "find creators under 200K who posted 3+ GTA 6 guides since October"
npm run ask -- --topic gta6 "what hooks are outperforming this week?"
npm run ask -- --topic gta6 "who is Razer working with, and who do they rebook?"
npm run ask -- --topic gta6 --breakdown https://youtu.be/VIDEO_ID --transcript transcript.txt
```

Limits: it sees what the official APIs return (YouTube search and channel stats, Reddit, X recent search,
Instagram hashtag top media, TikTok CSV exports). It does not watch video frames; for a frame-level breakdown, pass
a transcript. TikTok and Instagram creator baselines need 3+ of their posts in the data.
