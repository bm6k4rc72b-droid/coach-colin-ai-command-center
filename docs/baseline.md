# Baseline — camera vitals and a coach that reads them against you

A web app for iPhone, Android and any laptop with a webcam. It measures resting
pulse, heart-rate variability and breathing rate from forty seconds of your
face, compares them with **your own** recent history rather than a population
chart, and writes today's training session from the difference — with the heart
rates to hold and the rule that produced them.

It runs entirely in the browser: no upload, no API key, no account, and — after
the first visit — no signal. Frames are analysed in memory and discarded.

Locally it is `/baseline/` (`http://localhost:4173/baseline/` under
`./start.sh`). The camera needs a secure context, so HTTPS or `localhost` only:
opening the files straight off disk (`file://`) will not get a camera.

> Baseline is a training tool, not a medical device. It does not diagnose
> anything, and no camera app can. Symptoms belong to a clinician.

---

## Seeing a pulse with a camera

Every heartbeat pushes blood into the capillaries under the skin, and
haemoglobin absorbs green light. A face therefore darkens and lightens by
roughly half a per cent, sixty-odd times a minute — far too small to see, and
quite large enough to measure. The app averages the skin inside the guide oval
down to one red, one green and one blue number per frame and looks for a
0.6–3 Hz oscillation in the result.

The hard part is not finding an oscillation. It is refusing to find one that
is not a pulse. Three things do that work:

**The colour mixing rejects common-mode change.** The primary method is POS —
plane-orthogonal-to-skin (Wang et al., 2017) — with CHROM (de Haan & Jeanne,
2013) as a second opinion. Both take projections of the temporally normalized
channels in which anything that scales all three together cancels *exactly*:
leaning toward a lamp, auto-exposure stepping, a cloud crossing a window. The
pulse survives because blood absorbs the three bands by different amounts.
`tests/baseline/vitals.test.mjs` asserts this directly — a fixture consisting of
nothing but a 66-per-minute intensity wobble must leave essentially no energy in
the pulse band.

POS is additive where CHROM is subtractive, which matters more than it sounds:
CHROM's weighted subtraction can cancel the pulse outright when a subject's
channel ratios line up with its weighting, so CHROM is never preferred outright.
Green alone is the last resort — it carries the strongest pulse and the
strongest artefact — and it is only reachable when both chrominance methods have
failed *and* the measured motion is low.

**The frame clock is the media clock.** Browsers do not deliver camera frames on
a metronome, and treating frame index as time is how a 62 bpm subject gets
reported at 71. Where `requestVideoFrameCallback` exists the timestamp is the
frame's own `mediaTime`, so a dropped frame becomes a gap in the record rather
than a silently stretched heartbeat; samples are then interpolated onto a
uniform 30 Hz grid before any spectral work.

**Every reading carries a signal-to-noise figure.** Energy in a narrow window
around the candidate rate and its first harmonic, against everything else in the
band. A real pulse is periodic and puts energy in both; motion is broadband and
puts energy everywhere. Below about 0 dB there is more noise in the pulse band
than pulse, and the app says *unusable* instead of printing the largest bump in
a spectrum made of noise.

## Why variability is held to a stricter standard than rate

Rate survives a mediocre scan because it only needs the dominant frequency.
RMSSD needs the position of every individual beat — and at 30 frames a second, a
peak located to the nearest frame is only known to ±17 ms, when a real RMSSD is
often 25 ms. Quantization alone would manufacture most of the variability.

So peaks are refined to sub-sample precision by fitting a parabola through each
peak and its neighbours, which drops the noise floor from about 32 ms to under
5 ms on a clean signal (`signal.test.mjs` asserts both numbers). Even then the
figure is withheld unless the scan cleared 3 dB of SNR, ran at least twenty
seconds, produced twelve usable intervals and graded above 0.55 confidence. A
dash is a better answer than a number the measurement cannot support.

The same principle governs breathing rate. It is read from respiratory sinus
arrhythmia — the heart speeds up on the inhale and slows on the exhale, so the
sequence of beat intervals is itself a breathing trace — with slow frame drift
as a fallback. Both are gated on peak prominence, because the largest bump in
the breathing band exists whether or not the subject's heart is following their
breath. A metronomic pulse gets no breathing rate at all.

## Why it refuses to score you at first

A resting pulse of 58 is unremarkable in one person and a warning in another. An
HRV of 30 ms is poor at twenty and excellent at sixty. Population norms cannot
say anything useful about a single morning, so the app collects **four** resting
scans before producing a readiness score at all, and from then on quotes every
number against your own median and your own spread.

The statistics are robust — medians and median absolute deviations, not means
and standard deviations. One scan taken after running up the stairs moves a mean
and inflates an SD enough to make the following week look normal; it barely
moves a MAD. Post-session and breathing scans are filed separately and never
enter the baseline, and scans below 0.4 confidence are excluded outright.

A day that is entirely typical scores in the middle of *Ready*, not at the edge
of *Steady* — the neutral point is 62, not 50 — because otherwise the coach
spends every ordinary Tuesday telling a well-recovered athlete to back off.

## What the coach is

A decision engine, not a chat model. Readiness, the four subjective answers, and
how many hard days you have strung together choose an intensity tier; the tier
and your goal choose a session from sixteen templates; your measured resting
rate and age set the heart-rate ceilings by the Karvonen method, which moves
with your fitness as percentage-of-maximum zones do not.

Every prescription lists the rule that produced it, and the whole thing works
in aeroplane mode. Some of the rules that matter:

- A resting rate two and a half deviations above your own normal caps the day at
  recovery and says so in plain language — *that pattern usually means illness,
  dehydration, alcohol or a very short night* — and routes anything persistent
  to a clinician. It never names a condition.
- Rate up and variability down together is flagged as accumulated fatigue.
- A third consecutive hard day is refused whatever the score says.
- An unusable scan produces no prescription from data at all. The app says it
  will not write a session off a reading it could not take, and labels the
  generic easy day it shows instead.
- Yesterday's answers about sleep are not evidence about today. A stale set is
  dropped rather than carried forward, and readiness then rests on the camera
  alone — with a line on screen saying so.

Adding an API key (Claude or any OpenAI-compatible endpoint, stored in that
browser only) lets a language model reword the same decision and answer
follow-ups. It never overrules the rules, and if the request fails the
rules-based answer — computed before the request went out — is shown instead.
Without a key, an offline responder answers the questions people actually ask:
why this session, can I push anyway, what are my zones, how accurate is this.

## Breathing, measured rather than asserted

Four paced protocols, from a six-per-minute coherent pace to a 4-in/8-out
extended exhale. What makes it worth building on a camera is that the pulse
keeps being measured throughout, so the round ends with two numbers:

- **Swing** — how far the pulse travelled between the top of the inhale and the
  bottom of the exhale. That is the size of the effect.
- **In time** — how much of the pulse's slow variation sat at the paced rate
  rather than anywhere else. That is whether the effect was yours.

A large swing that is not locked to the pacing is reported as exactly that. An
app that only draws an expanding circle is asking for trust; one that measures
the response is earning it.

## Honest limits

- **Rate is good; variability is only fair.** Treat the trend as the signal and
  any single reading as a rumour.
- **Light and stillness are the whole game.** Front-lit, indirect, no flicker,
  elbows supported. The quality gate names which one failed.
- **It measures a resting state.** Scan before getting up and moving, at roughly
  the same time each day. Anything else is a fine measurement of something else.
- **Auto-exposure fights the measurement**, since the camera brightens the image
  back as the skin darkens on a beat. Baseline asks the platform to lock
  exposure and white balance; only some Android builds allow it, and the app
  measures anyway and reports the worse signal honestly.
- **Skin tone, make-up and facial hair change how much light comes back.** The
  SNR figure on every scan is the app's report of how well it did on *you*.
- **It is not a diagnosis and cannot be one.**

## Privacy

Frames are analysed in memory and discarded. Nothing is uploaded — there is no
server to upload to. Scans, settings and any API key live in that one browser's
local storage and leave only when you export them, as CSV or JSON. Erasing
everything in Trends erases everything, including the key.

---

## Files

| Path | What it is |
| --- | --- |
| `public/baseline/index.html` | App shell, panels and sheets |
| `public/baseline/styles.css` | Dark instrument skin, safe-area aware |
| `js/signal.js` | Resampling, detrending, FIR band-pass, spectra, peaks, HRV |
| `js/vitals.js` | POS/CHROM mixing, rate, variability, breathing, quality gate |
| `js/roi.js` | Chrominance skin test, region statistics, face tracking |
| `js/baseline.js` | Robust personal baseline, readiness, anomaly flags |
| `js/coach.js` | Karvonen zones, tier rules, session library, offline answers |
| `js/breathe.js` | Paced protocols, RSA response, before/after comparison |
| `js/ledger.js` | Session history, profile, settings, CSV and JSON export |
| `js/camera.js` | `getUserMedia`, media-clock frames, exposure lock |
| `js/speech.js` | Platform speech synthesis and recognition |
| `js/llm.js` | Optional narration through a user-supplied key |
| `js/app.js` | Wiring, overlay rendering, state machine |
| `sw.js`, `manifest.webmanifest` | Offline install |

## Testing

```bash
npm run test:baseline   # 75 unit tests over the pure logic
npm run qa:baseline     # end-to-end: real Chromium, synthetic camera feed
```

The unit tests drive synthetic subjects whose true pulse rate, breathing rate
and motion are inputs, so every assertion is against a known answer rather than
against whatever the code produced last time. The negative cases carry as much
weight as the positive ones: a scan of a wall, a face that leaves the frame
half-way through, a room that is too dark, a twelve-second scan that must not
claim a variability figure.

The QA script hands Chromium a generated Y4M clip as a fake camera — a synthetic
face whose skin colour pulses at exactly 66 beats a minute, with the three
channels modulated by different amounts the way haemoglobin modulates them — and
then drives the real app: permission flow, capture loop, region finder,
estimator, baseline, prescription, ledger, trends, the offline coach and a
paced breathing round. It asserts the reported rate is 66, that the metronomic
fixture yields a low variability figure and no breathing rate at all, writes a
screenshot, and exits non-zero on any failed check.

## Deploying it

The camera API requires HTTPS (or localhost). Baseline has no backend at all, so
the repository's GitHub Pages workflow publishes a fully functional copy.

Two notes if you redeploy it yourself: GitHub restricts the `github-pages`
environment to the default branch, so a deploy has to run from `main`, and
`scripts/build-static.sh` derives the base path from the repository name, so a
fork or a rename keeps working without edits.
