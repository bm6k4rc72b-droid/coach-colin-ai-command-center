# Fenceline Night Watch

A self-contained, offline demo of a ranch predator-and-herd monitoring console —
built to be opened on a laptop in front of a ranch owner, with no camera, no
account, no network and no signal.

Two pages, both offline:

- **`index.html`** — the console you show a ranch owner.
- **`camera.html`** — the camera bench: a real vision pipeline running on your
  own camera, a video file, or a synthetic scene.

Open either in a browser. That is the whole install.

## The console (`index.html`)

Two scenarios, one engine:

- **Cattle · Night** — 24 head on open pasture, a coyote working down the NE
  draw. The console detects the *herd's* reaction, calls a threat bearing before
  the predator is visible to the camera, and offers a deterrent.
- **Poultry · Dawn** — 16 hens and 2 roosters in the home yard, a raptor
  overhead. The rooster's aerial alarm call is the first detection; the flock
  flushes to cover; the coop door can close from the alert.

## Why it is a simulation, and why that is fine

Every animal is an agent in a flocking model with a fear-contagion term — an
animal that perceives the predator raises its own fear, and its neighbours catch
it. Nothing is on rails: the predator is another agent, and pressing **Deter**
genuinely changes what happens next.

The telemetry is then **measured off that scene**, frame by frame, the same four
ways a real pipeline would measure it off a tracker's output:

| Signal | Computed as |
| --- | --- |
| Bunching / flush | Mean nearest-neighbour distance vs a rolling calm baseline |
| Polarisation | Magnitude of the mean unit-velocity vector |
| Heads up / alarm call | Mean head elevation across the group |
| Motion | Mean speed vs the grazing baseline |

The Herd Risk Index is a weighted sum of the four; the threat bearing is the
herd's flight vector reversed; the fence readout is the real distance from the
leading animal to the nearest wire. Change the scene and every number moves.
That is what makes the demo survive being poked at.

Two behaviours in it are worth pointing out because they are the actual product
decisions, not decoration:

- **The dwell timer.** The index has to hold above threshold for a sustained
  window before an alert fires, and there is a 25-second re-alert lockout after
  one does. False alarms, not detection, are what get a system muted.
- **Cattle bunch; chickens scatter.** The same engine runs both, with the sign
  of the dispersion signal flipped. A detector that does not know which species'
  anti-predator strategy it is watching will read a flock flush as calm.

For poultry the bearing readout deliberately reports `SCATTER — N/A` rather than
inventing a direction: a radial scatter points every way at once.

## What a real build would need

The behaviour maths above is the easy half. The rest:

- a livestock detector and multi-object tracker that holds up at distance, at
  night, in weather;
- a season of labelled footage from the actual property — thresholds do not
  transfer between pastures;
- thermal or genuinely good IR, since the hours that matter are 22:00–04:00;
- an alert path that survives with no cell service (edge inference on the post,
  LoRa for the alert itself, video syncing only when a link exists).

## Not a claim

This is a design demo. The scene is synthetic and labelled as such on screen; it
is not footage of a real ranch and must not be presented as one. The ROI
calculator contains no assumptions about system performance — it multiplies out
whatever numbers the person in the room gives you, and it will happily tell you
the deal does not clear.


---

# The camera bench (`camera.html`)

Where `index.html` simulates the scene and measures it, `camera.html` runs an
actual computer-vision pipeline on real pixels — your phone's rear camera, a
trail-cam clip you drag in, or a synthetic pasture if neither is available.

Everything runs on the device. There is no network call in the page beyond the
two font files.

## The pipeline

| Stage | Here | In production |
| --- | --- | --- |
| 01 Decode | 256-wide greyscale working buffer | Hardware decode to a GPU tensor |
| 02 Illumination | Gain-match to the background, flag global steps | Unchanged |
| 03 Background | Per-pixel running average, adaptive σ threshold | MOG2, demoted to a motion gate |
| 04 Morphology | Erode once, dilate twice | Dropped |
| 05 Detections | Connected components → boxes | **YOLO / RT-DETR on livestock** |
| 06 Filter | Area, aspect, fill; then merge near-touching boxes | Confidence + class gating |
| 07 Tracker | SORT — CV Kalman, greedy gated assignment | ByteTrack / OC-SORT + re-ID |
| 08 Behaviour | Spacing, polarisation, activity, count → risk index | Same, plus head-pose keypoints |

Stage 05 is the only one that has to be replaced to make this real. Nothing
downstream of it changes, which is why it is built at that seam.

## Three bugs worth knowing about, because they are the whole job

Each of these was found by instrumenting the running pipeline, and each is a
trap anyone building this will hit:

1. **Frame-counted lifetimes.** A tracker that deletes a track after "12 misses"
   tolerates 200 ms of occlusion at 60 fps and 400 ms at 30 — so it behaves
   differently on every device. Lifetimes, and the background time constant,
   are in *seconds*.
2. **Background scarring.** Foreground pixels must update their background model
   more slowly, or a standing animal dissolves into it. Do only that and the
   model scars: every pixel anything ever walked over stays foreground for ever,
   and the blobs merge into one growing mass. A pixel foreground for more than
   `FG_STALE_S` is absorbed outright.
3. **A baseline that eats the event.** "Normal" is a rolling average, and if it
   adapts over three seconds it absorbs the six-second incident it exists to
   detect. It adapts slowly, more slowly still in WATCH, and not at all in ALERT.

## False alarms

Six layers, in order of how cheap they are: reject at the blob (area, aspect,
fill), reject at the track (three hits and a quarter second before an ID),
reject at the frame (a global illumination step is the light, not an animal),
require a group rather than an animal, dwell then lock out, and learn from the
dismissals.

The metric to hold yourself to is **false alerts per camera per week**, target
under one, measured against recall on real incidents. Accuracy on a balanced
test set is meaningless when the base rate is one event per thousand nights.

## Platforms

The page is the browser answer for iPhone, Android and laptop — `getUserMedia`
with `facingMode: environment`, canvas processing, nothing installed. iOS needs
a tap to start and `playsinline`; both are handled. Backgrounding the tab stops
the pipeline, so browser is a demo and spot-check surface, not an overnight
watch. That is Swift/AVFoundation + Core ML, Kotlin/CameraX + TFLite, or a
Jetson or Pi-plus-Hailo on the post — in ascending order of actually belonging
on a fence line.

## Not a claim

It detects motion and tracks it. It is not a species classifier and says so on
screen — it will track you, your dog and a ceiling fan with equal enthusiasm.
A motionless animal is invisible to it, which is structural, not a tuning
problem, and is the reason stage 05 exists.
