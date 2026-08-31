# QB Vision — Coach Colin AI Command Center

Point an iPhone at a quarterback rep and measure the pocket around him: when
pressure arrived, how fast he reacted, how much ground he covered, how long he
held the ball.

This is a working web app. It runs in iPhone Safari, uses the rear camera live
or a recorded clip, and exports every rep as CSV.

---

## Can this actually be built? An honest answer

Yes — but the overlay in a highlight reel mixes together three very different
kinds of number, and only the first two are things a phone can produce.

### 1. Genuinely measurable on-device — built here

Player detection, tracking and identity, and every timing and distance figure
derived from them. A modern iPhone runs a multi-person pose model on live video
comfortably. Once you can locate players on the field plane, pressure timing and
distance travelled are arithmetic.

| Metric | How it is produced |
| --- | --- |
| Player boxes + persistent PIDs | MoveNet MultiPose with a bounding-box tracker |
| Team split (offense/defense) | Jersey-colour clustering at each player's torso |
| Pressure onset | First defender inside 3.5 yards of the QB, in seconds from snap |
| Pressure response | Onset → the QB actually moving off the spot |
| Total movement | QB path length from snap to release, in yards |
| Time to throw | Snap → release |
| Throw distance | Release point → where the ball came down |

### 2. Estimated, and labelled as an estimate

**Expected Completion % and Expected First Down %.** These are *not* NFL Next
Gen Stats numbers. That model is trained on years of league-wide chip-tracking
data that is not public and cannot be reproduced from video.

What ships here is a transparent logistic model over the four things this app
can measure — air yards, time to throw, pressure, defender separation — with
coefficients seeded from published NFL passing splits. See
[`src/metrics/models.ts`](src/metrics/models.ts). Treat it as a reasoned prior
for comparing one rep against another, not as a claim about true probability.

It is also **trainable**. `LogisticModel.fit()` refits on your own recorded reps
once you mark the outcomes, so the numbers come to describe your quarterbacks
instead of a league average. That is the honest path to a model worth trusting,
and it is the single highest-value thing to do next with this app.

### 3. Not attempted, deliberately

- **Ball tracking.** A football at 50mph is a motion-blurred ellipse a few
  pixels across. Tracking it reliably from a sideline phone is a research
  problem, not a weekend feature. Throw distance is taken from a tap on where
  the ball came down, which is accurate to roughly a yard and takes a second.
- **Automatic snap/release detection.** Both are operator taps. Auto-detection
  from wrist-velocity spikes is feasible as a v2 assist, but a wrong snap frame
  corrupts every timing on the rep, so v1 keeps a human in the loop.
- **Jersey number OCR.** Numbers are legible only on tight shots. Players are
  identified by track ID; you label the QB by tapping him.

### On Claude Code vs Replit

Either can write this code. What actually decides the outcome is the two hard
parts, and neither is about the editor: getting pixels into field coordinates
(see below), and being honest about which numbers are measured versus modelled.
Replit is convenient for hosting a prototype with HTTPS, which the iPhone camera
requires. This repo deploys to Replit, Vercel, Netlify or anything else static.

---

## The part that makes the numbers real: calibration

Every distance here is in yards, not pixels, and that conversion is the whole
ballgame. A phone on a sideline sees the field in perspective: the same 20
pixels is **0.56 yards** near the camera and **2.14 yards** at the far hash.
(That is a measured figure from the test suite, not an illustration.) Any app
that multiplies pixels by a fixed scale is reporting fiction.

So before recording, you tap four corners of a box whose real size you know —
two yard lines, a sideline and the near hash works anywhere — and the app solves
a homography mapping the field plane to the sensor plane. Everything downstream
is measured on the field, not on the screen.

Tap the corners **clockwise from the near-left**, and set the box's real width
and depth under **Setup** first.

---

## Running it

```bash
npm install
npm run dev        # then open the printed Network URL on your phone
```

**The iPhone camera requires HTTPS** (or `localhost`). Over plain `http://` on
your LAN, Safari silently refuses `getUserMedia`. For on-device testing use a
tunnel (`cloudflared tunnel --url http://localhost:5173`, ngrok, or a Replit/
Vercel deploy) and open the https URL.

Add it to the home screen for a full-screen, chrome-free capture surface.

```bash
npm run build      # production bundle
npm run verify     # math + engine checks (no browser needed)
npm run smoke      # drives the real page in Chromium with a fake camera
```

### Using it on a rep

1. **Start camera** (or **Load clip** to review film).
2. **Calibrate field** — four taps.
3. Tap the quarterback to lock onto his track.
4. **Snap** at the snap → **Release** at the release → tap where the ball landed.
5. **Save rep**. Export the session as CSV from the Reps panel.

---

## Self-hosting the model weights

MoveNet is fetched from `tfhub.dev` by default. Practice fields have terrible
signal, and some networks block that host outright, so you can serve the weights
yourself:

```bash
# once, from a machine with access:
curl -L "https://tfhub.dev/google/tfjs-model/movenet/multipose/lightning/1?tfjs-format=file" -o public/model/model.json
# plus the .bin shards it references, into public/model/
echo 'VITE_MOVENET_MODEL_URL=/model/model.json' >> .env.local
```

---

## What I verified, and what I could not

Verified by running it:

- **`npm run verify`** — 13 geometry/model checks and 15 play-engine checks, all
  passing. The engine is driven through a scripted rep with known ground truth,
  so the numbers are checked against the right answer: pressure onset lands at
  1.60s against a scripted 1.60s, total movement at 4.88 against a true 5.00.
  It also covers a clean pocket reporting *no pressure* rather than zero, a
  team-mate standing next to the QB not counting as pressure, and a mid-play
  tracking dropout neither inflating nor losing distance.
- **`npm run smoke`** — the real page in Chromium with a fake webcam: shell,
  camera stream at 1920x1080, render loop painting the overlay, calibration
  taps solving to a homography, and recording correctly gated until the field
  is calibrated and a QB is selected.

**Not verified: live detection quality.** This build sandbox has no GPU (the
WebGL backend cannot initialise) and blocks `tfhub.dev`, so MoveNet never
actually ran on a frame here. The detection wiring is exercised, and the app
degrades correctly when the model is unavailable, but **how well it tracks 22
players on real football video is untested and is the first thing to check on a
real phone.** Expect the jersey-colour team split to be the weakest link,
particularly with white-on-white matchups or heavy shadow.

A tuning knob worth knowing about: `MOVEMENT_COMMIT_YARDS` in
[`src/metrics/playEngine.ts`](src/metrics/playEngine.ts) is set to 0.5 yards,
above the smoothed keypoint noise floor. Too low and a stationary QB accumulates
phantom yards; too high and short movements vanish. The test suite pins both
failure modes.

---

## Native iOS

The web app is the right place to start — it iterates in seconds and runs on any
phone. A native app buys higher frame rates, slow-motion capture and background
processing. See [`docs/NATIVE_IOS.md`](docs/NATIVE_IOS.md) for that path; the
metric logic in `src/metrics/` ports across essentially unchanged.
