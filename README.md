# LOOPBREAK QB — OODA Command Deck

A tactical, neuroscience-grounded quarterback trainer built around John Boyd's OODA loop.

Most QB apps are film quizzes with a stopwatch. This one takes Boyd's actual claim seriously:
the point was never *go fast*, it was **operate inside the opponent's decision cycle**, so that by
the time they act, their picture of the world is already stale.

So every rep runs **two clocks**.

| Clock | What it is |
|---|---|
| **Your loop** | Observe → Orient → Decide → Act, each phase timestamped from a real input — a sensor lock, a tap, an accelerometer-detected release. |
| **Defense loop** | How long the coverage needs to finish *its* cycle: pass off, re-leverage, and close the window it just opened. |

**Δ-LOOP = defenseLoop − yourLoop.** Positive means you released while their picture was still old.
That single number is the app's north star, and every other metric exists to diagnose it.

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

## The six blocks

| Block | Trains | The honest metric |
|---|---|---|
| **LOOP BREAK** | The full four-phase rep against a disguised defense | Δ-loop, per-phase timings, coverage ID and read accuracy |
| **ORIENT ENGINE** | Coverage pattern recognition at threshold exposure | Exposure floor (ms), retention after ≥2 intervening looks |
| **IRON HAND** | Response inhibition — the pick you *don't* throw | **SSRT** = mean go RT − mean SSD, with a staircased delay |
| **PERIPHERAL POCKET** | Useful field of view as a genuine dual task | Threshold eccentricity, dual-task hit rate, tremor |
| **TWITCH** | Release latency and motor consistency | Mean latency and, more importantly, trial-to-trial SD |
| **PULSE LAB** | Autonomic control under a stress-recovery challenge | Recovery slope in bpm/min, RMSSD, coherence |

### Why these, specifically

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

## Layout

```
index.html                  shell + all screen markup
css/holo.css                design system: glass, brackets, scanlines, buttons
css/screens.css             per-screen layout
js/main.js                  boot, sensor gate, router, session lifecycle
js/core/       state, event bus, RNG + variable-ratio scheduler, WebAudio synth, haptics
js/sensors/    motion (gyro/accel/tremor/release), camera, PPG
js/engine/     playbook (coverages, concepts, read rules), defense generator,
               route geometry, the OODA scoring engine
js/render/     holographic field, loop dial, neural map
js/drills/     the six blocks + shared live-drill stage
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
