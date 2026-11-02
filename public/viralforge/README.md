# VIRALFORGE · short-form studio

By Colin Cook. A phone-first web app that takes a clip and gets it ready to post. It scores the
first three seconds, ranks cover frames, transcribes captions, reframes the clip to 9:16, hides
faces, writes hooks with Claude, scans trends, and plans three posts a day. The clip never leaves
the device. The only network calls are to model downloads (once), Claude (with your key) and
YouTube (with your key).

| Tab | What it does | Engine |
| --- | --- | --- |
| Studio | Hook score (motion, cuts, first face, on-screen text, sound onset, loudness, exposure, colour, sharpness), whole-post score, a "fix first" list, hook strip, loudness curve, palette | MediaPipe BlazeFace, Tesseract.js, Web Audio, k-means |
| Cover | Every sampled frame ranked as a cover; optional CLIP rerank | CLIP ViT-B/32 (transformers.js) |
| Export | Auto-reframe that follows the subject, face pixelation, skeleton overlay, skeleton-only privacy mode, word-by-word captions, hook title, progress bar → MP4/WebM | MediaPipe Pose, Whisper base.en, MediaRecorder |
| Hooks | 10 instant template hooks, or Claude writing 8 hooks, on-screen text, caption, hashtags and a re-edit plan from this clip's scores and transcript | `claude-opus-5-5`, your API key |
| Comments | Comment mood and what to make next | Twitter-RoBERTa sentiment (lexicon fallback) |
| Trends | Shorts from the last 7 days ranked by views/day, plus their title patterns; link to TikTok's trending-sounds chart | YouTube Data API v3, your key |
| Schedule | 3 slots a day → `.ics` with reminders | — |
| Stack | Every requested repo, checked, and what replaced the ones that do not exist | `data/stack.json` |

Hands-free posting is in [`tools/autopost.py`](tools/autopost.py), which uses the official
Instagram Graph API and TikTok Content Posting API (standard library only).

The scores are heuristics. Use them to compare your own drafts. They do not predict views.

`npm run test:viralforge` tests the scoring, captions, reframe camera, schedule and stack list.
