# Sentry — what moved, where it went, and how fast

A security camera app for iPhone, Android and any laptop with a webcam. It
watches a piece of ground, draws the path of anything that crosses it **in
metres**, and writes up each subject from the measurements — distance walked,
speed, standing height, gait cadence, pauses, direction reversals, zone
crossings.

It runs entirely in the browser: no upload, no account, no API key, and — after
the first visit — no signal. Frames are measured and discarded. Nothing is
recorded.

**Live at <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/sentry/>.**
Open it on a phone and add it to the home screen; it launches full-screen and
keeps working offline. Locally it is `/sentry/`
(`http://localhost:4173/sentry/` under `./start.sh`).

The camera needs a secure context, so HTTPS or `localhost` only. Opening the
files straight off disk (`file://`) will not get a camera.

---

## What it does, and what it refuses to do

The brief this was built from asked for rather more than a camera can deliver.
Rather than build the parts that cannot work and let them look like they do,
each one is listed here with the reason.

| Asked for | What you get |
| --- | --- |
| Track the path of a person or animal | **Yes.** Ground paths in metres, live and as a plan view. |
| Body language | **Partly.** Posture, gait cadence, pauses, path reversals, upper-body activity — kinematics, never intent. |
| Breathing pattern | **Sometimes.** From torso motion, after ~14 s of stillness. Usually unavailable, and it says so. |
| Heart rate | **Rarely.** Needs a head at least 24 px across and ~24 s of stillness. On a perimeter camera, almost never. |
| Thermal view | **No — and the app says so.** Ironbow is a palette over ordinary brightness. Thermal needs a long-wave infrared sensor no phone has. |
| See through walls via WiFi | **Not from this app.** An adapter for real RF hardware is built in; with nothing attached it reports nothing. |
| AI summary per person | **Yes.** Written on-device from the measurements, with every figure shown. |
| Per-person profile it "locks on" to | **Track-scoped and ephemeral.** No face recognition, no identity, no cross-referencing. |

### Why through-wall WiFi sensing is not in here

The research is real — Person-in-WiFi and DensePose-from-WiFi both recovered
coarse body pose from commodity channel state information, through drywall. The
reason it is not in this app is not scepticism, it is access:

- A browser has no radio API. `navigator.wifi` does not exist in any shipping
  engine, and no permission prompt would create it.
- iOS exposes no channel state information to any app, at any privilege level.
- Android exposes scan results and per-network signal strength: one number per
  access point. Presence sensing needs per-subcarrier amplitude and phase.
- The published work runs on specific hardware — Intel 5300 or Atheros NICs with
  patched firmware, ESP32 boards in CSI mode, or an SDR.

So `js/rf.js` is an adapter instead. Point it at a WebSocket that streams

```json
{"t": 1725580000000,
 "contacts": [{"id": "a", "rangeM": 3.4, "bearingDeg": -12,
               "confidence": 0.7, "motion": 0.4, "throughWall": true}],
 "sensor": {"kind": "csi", "label": "ESP32-CSI hallway"}}
```

and its contacts are drawn on the ground plan alongside the camera's tracks —
as rings, because a sensor gives a range and a bearing, not a position. A frame
that does not parse is dropped rather than coerced: a phantom contact on a
security display is worse than an empty one, because the empty one is believed
correctly.

There is also a line worth drawing that is not technical. Sensing people through
the walls of a building you do not control is, in most jurisdictions, not
lawful, and it does not stop being surveillance because the sensor costs eight
pounds. The camera side of this app watches ground you can point a camera at.
The RF side can see into rooms. They are not the same act, and the app does not
pretend otherwise.

---

## Turning pixels into metres

Everything the app claims rests on one calibration. Without it, a track is a
squiggle across a frame and "the subject moved 340 pixels" answers nothing.

The model is a pinhole camera at a known **height** above a flat ground plane,
pitched down by a known **tilt**, with a known **field of view**. Three numbers
fix the whole projection, and unlike the eight coefficients of a homography, a
person can sanity-check them: is the camera about three metres up, tilted about
twenty degrees?

There are two ways to supply them:

**Mark a rectangle.** Tap the four corners of something on the ground whose size
you know — a patio, a parking bay, four paving slabs — and enter its width and
depth. `fitPose` searches height, tilt and field of view for the pose that
projects those four pixels onto a congruent rectangle, coarse-to-fine, three
refinement rounds. It recovers a 4.0 m / 28° / 62° camera as 3.99 / 27.8 / 61.9
in about twenty milliseconds, and reports its residual in centimetres so a bad
fit is visible rather than silent.

**Type the numbers.** Height, tilt and lens field of view, straight in.

From the pose, a pixel's world ray is intersected with the ground plane. A
subject's **standing height** comes from the head pixel's ray meeting the
vertical line rising from their ground contact — which is why the app can say
"1.75 m tall" rather than "48 pixels tall", and why a fox is not confused with a
person.

The flat-ground assumption is load-bearing. On a slope, on stairs, or for
anything not touching the ground, the metres are wrong.

---

## Deciding which pixels are not the scene

Thirty times a second, of every pixel: is this the yard, or something in it?

The background model is **sigma-delta** (Manzanera & Richefeu, 2004): the stored
background creeps toward each new frame by one level per frame, converging on
the per-pixel *median* rather than the mean. That distinction is the whole
reason to use it. A mean is dragged upward by everything that crosses, so a
subject who stands still for a minute is absorbed into the background and then
leaves a hole behind them when they move. A median ignores anything occupying a
pixel for less than half the window, and the update is two comparisons and an
add — which is what keeps this running on a phone.

A second sigma-delta estimate of the absolute difference gives a per-pixel noise
level, so the threshold adapts: foliage and compression noise in a dark corner
have to move much further than quiet tarmac before they count.

**Shadows get their own test,** because a hard shadow is a real luminance change
and no luminance threshold rejects it. A shadow scales all three channels by
roughly one factor; an object changes their ratios. This matters more than it
sounds — an unrejected shadow doubles a subject's apparent width, drags the
ground-contact point sideways, and corrupts every metre downstream.

The mask is then **opened** (erode, dilate) to clear speckle and **closed**
(dilate, erode) to fill holes, in that order: closing first would grow each noise
pixel into a blob that the opening then has to be strong enough to remove, and an
opening that strong takes the subject with it. Both passes treat outside the
frame as set, so a subject halfway through the edge of the picture — somebody
arriving, the most interesting thing on screen — is not eroded away.

Regions are labelled with two-pass union-find rather than a flood fill, because a
flood fill on a frame where half the picture changed (headlights sweeping a wall)
overflows the stack on exactly the frame you most want.

---

## Keeping one identity on one moving thing

Three failure modes shaped `tracker.js`, and each of them writes fiction rather
than merely losing data:

**Swapped identities.** Two people passing each other are briefly one blob; when
they separate, naive nearest-neighbour assignment hands each the other's history
and both paths become false. So assignment cost includes size change and an
eight-bin brightness histogram — deliberately too coarse to identify anybody,
just enough to keep a dark coat from inheriting a white shirt's track.

**Phantom distance.** A stationary subject's centroid jitters a pixel or two per
frame. Summed over a night, that is a parked car that walked a kilometre, and
every distance the app reports becomes worthless at the same moment. Three
things prevent it:

- Distance is measured from the *smoothed* foot position, not the raw detection.
  Jitter perpendicular to travel adds in quadrature — it cannot cancel — so
  summing raw steps inflates distances by a tenth or more.
- A step must clear a noise floor computed from the ground scale **at that
  track's own image row**. A subject near the horizon must move much further
  before a step is believed, because a pixel there is worth far more ground.
- A step is ignored while the silhouette is changing size. That covers a subject
  half-occluded by a parked car, and — more insidiously — one being absorbed
  into the background, whose blob erodes from the bottom so their apparent
  ground contact climbs and reads as walking away.

The result: a subject who never moves accumulates **exactly zero** metres, which
`tests/sentry/pipeline.test.mjs` asserts as an equality rather than a tolerance.

**Flicker.** A blob that vanishes for two frames behind a post is not a new
subject. Tracks are born after four consistent detections, retired after twelve
misses, and coast on their last velocity in between.

Speed is a trailing-second average rather than a frame-to-frame rate, and the
reported *peak* is the median of the last seven such windows — it must be
sustained for half a second to count. An absolute maximum over thousands of
frames finds the single worst one and reports a walker as having sprinted, and
that number is what the classifier reads to decide something was a vehicle.

---

## What the measurements support saying

Everything in `behaviour.js` is kinematics. A person pacing by a door is a person
whose path reversed direction six times — not a person who is "nervous", and not
a person who is "casing the building". The app reports the reversals.

- **Cadence** from the rise and fall of the subject's head, once per footfall,
  via the same spectral estimator the Baseline vitals app uses. It recovers a
  108-steps-a-minute fixture as 108. Head, not feet: the support foot stays
  planted while the body's centre of mass rises over it, so the head carries the
  rhythm and the foot carries the position.
- **Sinuosity** — path length over net displacement. One is a straight line.
- **Dwell** — longest continuous time inside a 1.5 m circle.
- **Reversals** — legs of the path that point back the way they came.
- **Posture** from the box aspect ratio, and a **fall pattern**: upright, then
  flat, and staying flat for three seconds. This is the one behaviour worth
  alerting on by itself, because the false alarm is somebody tying a lace and
  the miss is not.
- **Upper-body activity** — change energy in the top third relative to the
  body's own travel. High for someone gesturing or working at a lock while
  standing still; unremarkable for someone walking, whose whole silhouette moves
  together.

**Classification** is geometry, not recognition: height, aspect, solidity, speed
and gait rhythm separate person / animal / vehicle / unknown. Confidence is the
margin over the next-best answer, so two categories that both fit read as
uncertain rather than as a different answer. Without calibration there is no
height, and the app returns `unknown` with the reason rather than guessing.

---

## Zones

Zones live on the **ground plane, in metres**, not in the image. An image polygon
silently changes meaning the moment the camera is nudged, and it treats a
subject's head as being wherever it is drawn, so a tall person "enters" several
metres before their feet do.

Areas raise entry, exit and loiter events; tripwires raise directional crossings.
Every rule has hysteresis: a subject standing on a boundary would otherwise
generate an event per frame, which is both useless as a log and the fastest way
to teach an operator to ignore the app.

One subtlety worth recording, because it cost a test: a sampled position landing
*exactly* on a tripwire has no side, so comparing it with either neighbour finds
no sign change and the subject walks straight through. The watcher therefore
compares against the last position that was definitely on one side.

---

## Vitals, and why the answer is usually "no"

Remote photoplethysmography works. Blood absorbs green light, a face brightens
and darkens half a per cent per beat, and the POS/CHROM estimator shared with
Baseline recovers it reliably — given a face that fills a decent number of
pixels, holds still for the better part of a minute, and is properly lit.

A perimeter camera at ten metres delivers a head twelve pixels across, on a
subject who is walking, at night. There is no pulse in that, and no amount of
processing puts one there. So the app measures the conditions first and refuses
by default: it reports *why* a reading is unavailable far more often than it
reports a rate, and that ratio is the honest one.

Breathing is easier and survives conditions that defeat pulse — a slow 0.2–0.4 Hz
rise and fall of the torso, visible long after the face has become a smudge. It
still needs stillness.

Neither is a medical measurement, and the summary says so whenever it quotes one.

---

## The written summary

Every sentence is generated from a measurement, and every measurement is printed
next to the sentence it produced. Not "subject displaying suspicious behaviour"
but "path reversed direction four times over 47 s". An operator can disagree with
the second one.

Three rules hold throughout `dossier.js`:

1. **No claim without its evidence.** Lines whose measurement is missing or
   low-confidence are omitted rather than softened.
2. **No inference about intent, mood or character** — and no threat score, which
   is a guess about a person's mind dressed as arithmetic, and exactly the number
   people would act on.
3. **No identity.** A subject is "Track 7", scoped to the session.

A language model can restate a summary in plainer words if you paste a key, but
it never decides anything: what crosses the network is the digest — a dozen
numbers and a category label, no frame, no crop, no location. Its system prompt
forbids the vocabulary of suspicion explicitly, because a model handed movement
statistics about a person defaults to exactly that register.

---

## Privacy

- Nothing is uploaded, recorded or persisted. Frames are analysed in memory and
  discarded.
- No face recognition, no biometric template, no matching between sessions.
- Heads are obscured on screen by default. Every measurement is taken from the
  frame before that happens, so it costs nothing analytically.
- Tracks and events are forgotten after a retention window you set.
- Export writes movement measurements only — no imagery, no identity.

---

## Running the checks

```bash
npm run test:sentry   # 59 unit tests, no browser
npm run qa:sentry     # 24 end-to-end checks driving the real app in Chromium
```

The unit tests run the whole chain against synthetic scenes whose answer is
known exactly — a subject placed at an exact world position, moved at an exact
speed, projected through the same camera model the app calibrates. A change that
quietly biases distances upward by a tenth fails a test instead of being noticed
by somebody looking at a number on a phone and wondering.

The end-to-end harness hands Chromium a Y4M clip as a camera, so the permission
flow, capture loop, canvas scaling, pointer handling and rendering all run
without a camera or a person. The fixture walks a 1.75 m subject across a yard at
0.8 m/s, filmed from 3 m up at 24°. The app comes back with 6.67 m against 6.80 m
of visible travel, 0.85 m/s against 0.80, a standing height of 1.75 m, and a
cadence of 108 steps a minute against a fixture stepping at exactly 1.8 Hz.

If Puppeteer did not download a browser, set `PUPPETEER_EXECUTABLE_PATH`.

---

## Layout

```
public/sentry/
  index.html          interface
  styles.css
  js/ground.js        camera pose, ground projection, height, calibration fit
  js/scene.js         background model, shadow rejection, morphology, labelling
  js/tracker.js       assignment, smoothing, distance, speed, identity
  js/behaviour.js     cadence, sinuosity, dwell, reversals, posture, falls
  js/classify.js      person / animal / vehicle, from geometry
  js/zones.js         areas, tripwires, hysteresis, events
  js/vitals.js        gated breathing and pulse, over Baseline's estimator
  js/views.js         ironbow, motion, silhouette, edges
  js/dossier.js       the written summary, offline and deterministic
  js/llm.js           optional narration of a summary
  js/rf.js            external RF sensor adapter
  js/app.js           wiring
tests/sentry/         59 unit tests and the synthetic fixtures
scripts/qa-sentry.mjs end-to-end harness
```

The camera plumbing and the spectral estimators are imported from
[`public/baseline/`](../public/baseline) rather than duplicated: the estimator
that finds a breathing rate in a noisy trace is the same one that finds a step
rate, and it has tests of its own.
