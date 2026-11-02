# ViralX · by Coach Colin

A neuro-cinematic studio for short-form video, styled in black glass, neon pink and chrome.
It runs on a phone. The footage never leaves the device; the only network calls are model
downloads (once), Claude (with your key) and YouTube (with your key).

## What's in it

| Tab | What it does | Engine |
| --- | --- | --- |
| Signals | Dashboard: a player, six signal cards (Attention, Emotion, Energy, Clarity, Pacing, Hook), each with an *explain* note, and a heatmap of every signal over time (tap to seek). Also: where attention dips, Shot DNA (shot size per moment and dutch-angle detection), recommended techniques, the hook breakdown and whole-post score | MediaPipe BlazeFace, Tesseract.js, Web Audio, Sobel edge-direction tilt |
| Camera Lab | 15 techniques performed live on a 3D set with real lens maths. The main view is what the lens sees; the inset shows the set from above, with the rig, frustum and 180° line. Each technique gives its emotional trigger, lens, height, fps, why it works, and how to do it on a phone. Your Tip 2 and Tip 3 masterclass cards each play in 3D | Three.js |
| Cover | Every sampled frame ranked as a cover; optional CLIP rerank | CLIP ViT-B/32 |
| Export | 9:16 auto-reframe that follows the subject, face pixelation or skeleton-only privacy, Whisper captions, hook title, progress bar | MediaPipe Pose, Whisper |
| Hooks | Template hooks, or Claude writing from this clip's signals, shot DNA and transcript | `claude-opus-5-5`, your key |
| Comments · Trends · Schedule | Comment mood, rising YouTube Shorts, 3 posts a day as `.ics` | RoBERTa, YouTube Data API |

Hands-free posting: [`tools/autopost.py`](tools/autopost.py), using the official Instagram Graph
API and TikTok Content Posting API.

## The techniques

The Invisible Master (OTS at 44" chest height, 15° off the 180° line, 75mm → 32mm) · The Impex
(24mm probe into the eye, invisible swap to an 85mm chase) · Low angle · High angle · Dutch ·
Dolly zoom · Slow push-in · Slow pull-out · Extreme close-up · Hero orbit · Crane reveal · Whip
pan · POV · Symmetry two-shot · Parallax drift.

The tests check that each move obeys the rule it teaches: the dolly zoom keeps the subject the
same size, the Impex swap keeps the framing identical, the OTS sits exactly 15° off the line at
44", and any technique marked as keeping the 180° line never crosses it.

## Honesty notes

- Signals are estimates computed from the footage (pixels, faces, cuts, sound), each with a
  stated formula. They are not brain measurements, and they cannot predict views.
- The page uses Colin's own Tip 2 and Tip 3 cards, the brain artwork and the dashboard mock-up.
  Artwork showing real actors and studio characters was left out on purpose; the 3D lab performs
  those angles with mannequins instead.

`npm run test:viralx`
