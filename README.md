# LOOPBREAK — OODA Command Deck

A tactical, neuroscience-grounded position trainer built around John Boyd's OODA loop.
Ships with two position packs: **quarterback** and **wide receiver**.

Most QB apps are film quizzes with a stopwatch. This one takes Boyd's actual claim seriously:
the point was never *go fast*, it was **operate inside the opponent's decision cycle**, so that by
the time they act, their picture of the world is already stale.

So every rep runs **two clocks**.

| Clock | What it is |
|---|---|
| **Your loop** | Observe → Orient → Decide → Act, each phase timestamped from a real input — a sensor lock, a tap, an accelerometer-detected release. |
| **Defense loop** | How long the coverage needs to finish *its* cycle: pass off, re-leverage, and close the window it just opened. |

**Δ-LOOP = opponentLoop − yourLoop.** Positive means you acted while their picture was still old.
That single number is the app's north star, and every other metric exists to diagnose it.

What the opponent clock *is* depends on where you line up:

| Position | Δ-loop is measured against | You win by |
|---|---|---|
| **Quarterback** | the coverage finishing its rotation and closing the window | releasing before the picture you read goes stale |
| **Wide receiver** | the covering defender flipping his hips | declaring the break before he can turn and drive |

Same engine, same four phases, same scoring. Different denominator.

---

## Running it

Pure static files — no build step, no dependencies, no server logic.

```bash
# from the repo root
python3 -m http.server 8080
# then open http://localhost:8080 on the phone (same Wi-Fi: use the machine's LAN IP)
```

**Two requirements for the sensor features:**

1. **HTTPS or localhost.** iOS will not hand out motion or camera permission over plain `http://` to a
   LAN IP. Use a tunnel (`cloudflared tunnel --url http://localhost:8080`, `ngrok http 8080`) or host it
   on any static host — GitHub Pages, Netlify, Vercel all work as-is.
2. **A user gesture.** iOS 13+ requires `DeviceMotionEvent.requestPermission()` to be called from a tap.
   That is what the boot gate's **MOTION CORE** tile is for.

Add to Home Screen for the standalone, full-bleed experience. It installs as a PWA and, once the
service worker has cached it, runs offline on a practice field with no signal.

---

## The interface

Holographic tactical projection: a perspective wireframe field rendered on canvas, corner-bracketed
glass panels, chromatic scanline atmosphere, and a live loop-race dial. With the **OPTIC CORE**
mirror enabled, the front camera runs behind the hologram so the athlete is inside the display.

**The camera is a position preset, and it changes what the drill is.** A quarterback gets a raised
view from behind the pocket that holds both numbers in frame. A receiver gets *first person from his
own spot on the line*, through a wide field of view — which means the safety is genuinely off-screen
until he physically turns his head to peek him. The pre-snap scan being trained is the real one, not a habit of reading a
diagram. On the receiver's break the camera travels the route with him, so the defender slides across
his view exactly as he would over a shoulder.

Everything is drawn at runtime. There are no image assets beyond the app icon.

---

## Sensors

### Motion core — gyroscope + accelerometer

Three distinct jobs, not one gimmick:

- **Yaw / pitch pans the field.** The athlete physically turns to find a defender instead of
  scrolling to one, so the scan pattern being trained is the real one. Pre-snap scan spread is logged
  as a coverage metric.
- **Release detection.** A throwing motion has a signature — a sharp acceleration ramp, a peak, then
  a decay below 38% of peak. We timestamp the **peak**, so ACT measures the release, not the reaction
  time of a thumb. Peak magnitude gives a power proxy; rotation rate gives a spin proxy.
- **Tremor.** RMS of the high-passed accelerometer while the athlete is meant to be still. Postural
  micro-tremor rises with sympathetic arousal, which makes it a free, sensor-based pressure readout —
  reported as **POISE**.

Gravity-included fallback with a high-pass filter covers devices that do not expose linear acceleration.

### Optic core — camera

- **PULSE LAB** puts a fingertip over the rear lens and reads a **photoplethysmogram**: each systolic
  pulse pushes blood through the fingertip capillaries and drops the transmitted channel. From the
  inter-beat intervals we derive BPM, **RMSSD** (short-term vagal tone index), SDNN, and a coherence
  score. iOS Safari does not expose the torch, so ambient light through the finger is used with more gain.
- **Mirror HUD** puts the front camera behind the hologram.

> Camera-derived heart rate and HRV are estimates from a phone sensor, not clinical measurements.
> They are good enough to watch arousal climb under load and fall with a paced exhale, which is the
> entire point of the drill.

---

## The blocks

### Quarterback

| Block | Trains | The honest metric |
|---|---|---|
| **LOOP BREAK** | The full four-phase rep against a disguised defense | Δ-loop, per-phase timings, coverage ID and read accuracy |
| **ORIENT ENGINE** | Coverage pattern recognition at threshold exposure | Exposure floor (ms), retention after ≥2 intervening looks |
| **IRON HAND** | Response inhibition — the pick you *don't* throw | **SSRT** = mean go RT − mean SSD, with a staircased delay |
| **PERIPHERAL POCKET** | Useful field of view as a genuine dual task | Threshold eccentricity, dual-task hit rate, tremor |
| **TWITCH** | Release latency and motor consistency | Mean latency and, more importantly, trial-to-trial SD |
| **PULSE LAB** | Autonomic control under a stress-recovery challenge | Recovery slope in bpm/min, RMSSD, coherence |

### Wide receiver

| Block | Trains | The honest metric |
|---|---|---|
| **RELEASE** | The full four-phase rep, first person off the line | Δ-loop, separation in yards, leverage-read and conversion accuracy |
| **LEVERAGE READ** | Flash-recognition of technique and the top of the coverage | Exposure floor (ms), retention after ≥2 intervening pictures |
| **TRACK** | Coincidence-anticipation with the ball occluded in flight | Absolute, **constant** and **variable** error; occlusion reached |
| **SPLIT VISION** | Useful field of view while running the stem | Threshold eccentricity, dual-task hit rate, tremor |
| **OFF THE BALL** | Get-off burst and release consistency | Mean latency and trial-to-trial SD |
| **HOLD** | Inhibition — the flinch on a hard count, the break you abort | SSRT with a staircased stop-signal delay |
| **PULSE LAB** | Autonomic control under a stress-recovery challenge | Recovery slope in bpm/min, RMSSD, coherence |

`SPLIT VISION`, `OFF THE BALL`, `HOLD` and `PULSE LAB` are the same mechanics as their quarterback
counterparts — because the underlying capacity is the same — re-aimed at what the position actually
does. `RELEASE`, `LEVERAGE READ` and `TRACK` are receiver-specific.

### Why these, specifically — receiver

- **A receiver reads three things, not a call.** Leverage, technique, and whether the middle of the
  field is open or closed. Those collapse into five *looks*, and every option route in football is an
  explicit if-then rule mapping a look onto a conversion. That makes it measurable: there is exactly
  one correct conversion per picture, so leverage-read accuracy and conversion accuracy are timed
  separately and the leak is locatable.
- **Separation is created before the break, not during it.** `RELEASE` derives separation in yards
  directly from Δ-loop, so the number on screen is the decision speed, expressed in the unit a
  receiver actually cares about.
- **Catching is prediction, not reaction.** `TRACK` is coincidence-anticipation with the final
  portion of the flight occluded, which removes the option of reacting to the ball and forces
  extrapolation from early flight information. It reports constant error (a systematic early/late
  bias, correctable in an afternoon) separately from variable error (spread, which is what actually
  improves with reps) — those two numbers call for completely different coaching.
- **Scramble rules are free yards nobody drills.** The kill-signal slot in the receiver rep is the
  quarterback leaving the pocket: the route clock restarts and the rule changes mid-rep.

### Why these, specifically — quarterback

- **Orientation is the decisive phase.** Boyd put it at the centre of the loop because it is the only
  phase where prior experience lives. Expertise research (de Groot; Chase & Simon) shows expert
  advantage is stored as retrievable *patterns*, and recognition speed is its measurable output. So
  ORIENT ENGINE does nothing but build and test that library, with a 2-down/1-up staircase that keeps
  exposure near threshold, where perceptual learning is steepest.
- **Interleaving beats blocking.** Coverages are randomised rather than run in blocks. Contextual
  interference depresses in-session performance and improves retention and transfer. The app measures
  both, and reports **retention** separately from accuracy, because those two numbers disagree on
  purpose.
- **Disguise forces real orientation.** A defense that shows one shell and plays another means the
  read has to happen *post-snap*. Pre-snap guessing gets punished by design.
- **Interceptions are inhibition failures.** The stop-signal paradigm (Logan & Cowan) is the standard
  measure of response inhibition, and the network behind it — right inferior frontal gyrus and pre-SMA
  driving the subthalamic nucleus — responds to practice. SSD staircases toward 50% inhibition so the
  SSRT estimate stays valid.
- **Pockets close faster under arousal.** Useful field of view constricts with sympathetic activation.
  PERIPHERAL POCKET measures the constriction; PULSE LAB trains the counter-measure. What predicts
  performance under pressure is not a low resting heart rate but the *slope of the return* — which is
  why the reset block paces a physiological sigh (two inhales, one long exhale).
- **Chase the standard deviation.** Simple reaction time has a physiological floor around 180–200 ms.
  What actually improves with motor consolidation is the variability around it, so TWITCH scores SD
  as heavily as mean.

---

## Progression

- **Neural XP → ranks:** Clipboard → QB3 → QB2 → QB1 → Gunslinger → Field General → Franchise → Boyd.
- **Heat multiplier** on consecutive clean reps.
- **Variable-ratio LOOP BREAK payouts** — a bounded schedule (mean ≈ 6 successes, guaranteed floor at 13)
  so a good session is never dry and payouts stay meaningful.
- **Daily loop** — one drill plus one modifier, rotated deterministically by date, with an XP bonus.
- **Neural map** — nine brain systems, filled by the drills that actually load them, decaying on a
  4-day half-life so the map answers *what have I trained this week*, not *ever*.
- **Commendations** tied to real thresholds (sub-700 ms orient, 90% inhibition, 7-day streak).
- **Recovery guard** — an optional nudge when you are grinding past the point where reps still consolidate.
  Spacing and sleep are where the gains land; the app says so instead of farming session time.

## Data

Everything — reps, heart rate, personal records — is stored in `localStorage` on the device.
There is no account, no server, and no telemetry. Nothing leaves the phone. Clearing site data
erases the athlete file permanently, and **WIPE ATHLETE FILE** in settings does it deliberately.

---

## Position packs

The OODA engine, the sensors, the renderer, the progression and the whole UI shell are
position-agnostic. A pack (`js/engine/positions.js`) supplies exactly four things:

- **the picture** — what the hologram shows and from where (the camera preset)
- **the menus** — what each of the four phases is actually asking
- **the benchmarks** — a receiver's orient window is a fraction of a quarterback's, and scoring one
  against the other's numbers would make the grade meaningless
- **the opponent clock** — what Δ-loop is measured against

It also re-words the shared drills, because the same mechanic means something different depending on
where you line up. Adding a position is a pack plus whatever position-specific drills it needs.

Switching position swaps the drill list, the pictures and the benchmarks. XP, ranks, personal
records and the neural map carry over — the brain systems being trained are the same ones.

## Layout

```
index.html                  shell + all screen markup
css/holo.css                design system: glass, brackets, scanlines, buttons
css/screens.css             per-screen layout
js/main.js                  boot, position + sensor gate, router, session lifecycle
js/core/       state, event bus, RNG + variable-ratio scheduler, WebAudio synth, haptics
js/sensors/    motion (gyro/accel/tremor/release), camera, PPG
js/engine/     positions   the position pack registry
               playbook    QB: coverages, concepts, read rules
               wrplaybook  WR: looks, option routes, conversion rules, first-person camera
               defense, routes, ooda (the scoring engine)
js/render/     holographic field (per-position camera), loop dial, neural map
js/drills/     the blocks + shared live-drill stage
js/ui/         DOM helpers, router, and the non-live screens
sw.js          offline shell
```

All audio is synthesised in WebAudio at runtime — the crowd bed is filtered pink noise with a slow
swell, the snap is a noise burst over a pitched-down square. No audio assets ship.

## Compatibility

- **iOS Safari 13+** — full experience: motion, camera PPG, mirror HUD, PWA install.
- **Android Chrome** — full experience, plus torch support in PULSE LAB where the device exposes it.
- **Desktop browsers** — everything works except motion; the field pans by dragging and the ACT phase
  falls back to tap timing. The app labels this on the brief screen rather than pretending otherwise.
- **Haptics** — `navigator.vibrate` where supported, with a sub-audible speaker thump as the iOS fallback.
