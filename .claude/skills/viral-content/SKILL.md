---
name: viral-content
description: The default routine whenever Coach Colin asks to make viral content, viral videos, posts, reels, shorts, TikToks or "something that goes viral" about any topic (GTA 6, Final Fantasy, peptides/beauty, football, AI tools, the ranch, etc.). Runs creator intelligence first (what is breaking out vs each creator's usual views, the hooks and formats behind it, which creators own the niche, which brands are booking whom, a breakdown of the top posts), then makes original content with the repo's video tools, then writes captions and a posting plan. Also use for "find creators", "what hooks are working", "who is <brand> working with", "break down this post", or "find outliers in my niche".
---

# Viral content routine

Run every step, in order, unless the person says to skip one. Say in one line what each step found before moving on.

## 1. Research (creator intelligence)

Pick or create the topic file in `viral-agent/topics/<slug>.json` (copy an existing one: search term, subreddits,
X query, Instagram hashtag, `topic_regex`, and the content rules for that franchise or brand).

- **If API keys are set** (`YOUTUBE_API_KEY`, Reddit, X, Instagram; see `viral-agent/README.md`):
  `cd viral-agent && npm run nightly -- --topic <slug> [--outlier 5] [--max-followers 200000]`.
  This captures posts, scores them, gets each creator's baseline, flags **breakouts** (`outlier_x` = views ÷ the
  creator's usual views; 5x+ is a true breakout), lists **creators** on the topic, finds **brand deals and
  rebookings**, labels **hooks, formats, offers, proof and topics** with Claude, appends everything to the
  searchable index, and writes `briefing.md`, `plan.csv`, `intel.json`.
- **Questions from the index:** `npm run ask -- --topic <slug> "find creators under 200K with 3+ guides since April"`,
  `"what hooks are outperforming this week?"`, `"who is <brand> working with and who do they rebook?"`.
- **One post:** `npm run ask -- --topic <slug> --breakdown <url> [--transcript file.txt]` explains why it worked and
  gives original versions to make.
- **If no keys or the social sites are blocked here:** use web search (several queries in one turn) for this
  week's news, trends and viral posts on the topic, and the agent-reach skill for any link the person pastes. Report
  only numbers a source shows; write "not measured" otherwise.

Output of this step: the top 3–5 breakouts or trends with sources, the hooks and formats behind them, and the angle
to take. Put dates on anything time-sensitive (launches, releases, prices) and re-check them.

## 2. Make original content

Make 2–4 vertical (1080×1920) pieces built on the winning hooks and formats, using the repo's tools:

- 3D scenes and physics: Blender (`tools/blender/blender-headless.sh start`, the mcp-for-blender plugin, or a
  Blender Python script rendered with `blender -b`).
- Motion graphics and kinetic type: bang-motion, motion-educator, remotion, hyperframes, pixelfx.
- Music, beat sync and loudness: audio-mix, aeon-music-video, beatscope-visualizer (normalize to −14 LUFS).
- Clip the person's own footage: `viral-agent` `npm run clip`, video-shotcraft, lemo-opuscar.
- Upscale and grade: upscale (Real-ESRGAN, Video2X), color-grade-ai.
- AI images or video: Higgsfield (check the balance first and say the cost).

Hook in the first 1.5 seconds, captions that work on mute, a comment prompt at the end. Check frames from every
render before sending it, and send each finished file as soon as it is ready.

## 3. Captions and posting plan

For each piece: a caption, 4–6 hashtags, the platform and the local time to post, and what to pin in the comments.

## Rules (always)

- Original content only: never re-upload or re-cut other creators' videos or streams, and no fake testimonials.
- Respect each topic file's `rules` (for games: no leaked footage, no spoilers, no AI images of the publisher's
  characters; add "fan-made · not affiliated").
- No medical claims, dosing or before/after promises for peptides or GLP-1s; the beauty line only, per the site's copy.
- Never invent view counts, follower counts or sales figures; label estimates as estimates and name the source.
