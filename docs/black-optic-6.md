# Black Optic 6 — ranch perimeter console

A security console for a property, built around one rule: **no number appears
without saying where it came from.** It lives at
[`public/black-optic-6/`](../public/black-optic-6) — static, no backend, no keys,
works with the signal off. Locally it is `/black-optic-6/` under `./start.sh`.

---

## Why provenance is the whole design

This console is read at two in the morning by somebody deciding whether to walk
outside. In that moment a fabricated number and a measured one look identical,
and both get acted on. So every reading carries one of six states, and the badge
is drawn before the value:

| State | Meaning |
| --- | --- |
| `LIVE` | A sensor on this device measured it, now. |
| `LINKED` | A named external device measured it. |
| `MODELLED` | Computed from a measurement, carrying its own error. |
| `BLOCKED` | The platform exposes no such sensor to any web page. |
| `NEEDS KIT` | Physically requires a sensor this device does not have. |
| `UNSOUND` | Even with the sensor, the measurement would not support the claim. |

Only the first three may raise an alarm. That is enforced in
[`provenance.js`](../public/black-optic-6/js/provenance.js) and tested, because
it is the rule everything else leans on — and an unknown state resolves to
`UNSOUND` rather than to nothing, so a panel that loses track of its own origin
fails closed.

---

## What it actually does

**Optics.** The device camera runs a detection pipeline: a learned background,
segmentation, tracking, and geometric classification into person, animal or
vehicle. Five views — natural, ironbow false-colour, motion, silhouette, edges.
Any camera publishing HLS, WebRTC or MJPEG can be added as another source.

**Calibration is the gate to metres.** Until you type the camera's mount height,
tilt and field of view, the console reports pixels and refuses to convert them.
Once calibrated it reports standing height and ground speed with their errors,
and draws the horizon line so you can check the calibration is right — if that
line is not on the real horizon, nothing derived from it means anything.

**Watch.** Contacts with their evidence, an event log, and a response deck:
screen flood, siren, and a blackout that kills every emission the console
controls while the sensors keep recording.

**Acoustic.** Level, background, spectral flatness and band split from the
microphone, with impulses logged by shape and level. One microphone answers *how
loud* and *exactly when* and cannot answer *where* — bearing needs four or more
synchronised microphones — so the console never draws a direction, and never
names the source. A sharp broadband impulse is reported as a sharp broadband
impulse.

**Geofence.** Walk the boundary, mark the corners, and the console tracks which
side of the line you are on — but only when the fix can support the answer. When
the accuracy radius reaches across the boundary the state is `unresolved` and no
alert fires. That single refusal is the difference between a tripwire and the
thing you switch off in week two.

**Orbital.** Real NASA imagery over your coordinates — true colour, night
lights, NDVI, thermal anomalies — with the next overpass times and an honest
caption on every frame. Also a ladder of what sharper imagery costs.

**Vault.** The recorder runs into a rolling buffer, so a kept clip contains the
thirty seconds *before* the event as well as after. Each clip is SHA-256 hashed
on write and stays on the device until exported.

**Thermal palettes.** All thirteen a thermal camera offers — White Hot, Black
Hot, Ironbow, Lava, Arctic, Rainbow, Rainbow HC, Amber, Sepia, Glowbow, Rain,
Green Hot, Red Hot — with auto gain from the 2nd and 98th percentiles, manual
level and span so two frames are comparable, isotherm bands, and fusion edges
borrowed from the visible camera.

A palette is a colour ramp over a field of numbers, and *what the field contains*
is the whole question. A radiometric camera gives temperature, and then spot
meters, area minimum and maximum, isotherms in Celsius and emissivity correction
all mean something. An ordinary camera gives brightness, and then an ironbow ramp
over a night-time frame looks exactly like thermal imaging and is nothing of the
kind — a white shirt in shade paints hotter than a face in sun. So the console
carries the source with the field, prints "60% of scale" rather than a
temperature, and withholds emissivity correction entirely until there is a
temperature to correct.

**Target lock.** The motion tracker answers "what is moving" and loses anything
that stops, because a stationary thing becomes background. Two appearance
trackers sit beside it for following one specific thing:

- *Colour* (CAMShift) — a kernel-weighted hue histogram, back-projected and
  followed uphill each frame, window resized from the mass it encloses. Follows a
  red quad bike through a turn. Refuses to lock onto a grey region, because a
  region with no hue would drift onto the first saturated thing that passed.
- *Appearance* (normalised cross-correlation) — tells two similar-coloured things
  apart, breaks when the subject turns. Refuses to lock onto a flat patch,
  because a textureless region correlates equally well with everywhere.

Both report a confidence and say which way they lost the subject. A tracker that
silently keeps drawing a box on the wrong thing is worse than one that lets go.

**Harvest.** Loads logged against blocks give progress by row, a picking rate
with the spread across the gaps between loads, and a finish *window* — widened
while the rate is unsettled, because a single predicted finishing time reads as a
promise and the first wrong one costs the console its credibility with the crew.
Yield per hectare is withheld below a quarter of a block picked and marked
extrapolated above it.

**Aerial.** Anything tracked wholly above the horizon line is airborne, with its
angular width and angular rate measured. What it *is* stays open: one camera
measures angles, never range, so a gull at thirty metres and a quadcopter at a
hundred and fifty are identical in the image. The console lists what the angles
are consistent with and what would actually settle it — a second camera for
parallax, a microphone for the rotor signature, a receiver on the control bands.
Your own aircraft's telemetry, bridged in, is a measurement rather than an
inference.

**Spectral.** Vegetation indices over the live frame or a loaded image. An
ordinary camera has three bands, so it gets TGI, VARI and Excess Green — enough
to find *where* a block differs from itself. Near-infrared unlocks NDVI and SAVI;
red edge unlocks NDRE and CIre, which keep working once the canopy has closed and
NDVI has flattened. The console only offers the indices the connected source can
actually feed, masks the bare alleys out before averaging anything, and ranks the
worst cells so a forty-hectare block becomes three flags to walk to.

**Subsurface.** Occupancy mapping from sonar returns, with the beam drawn as the
cone it is rather than a ray. Dead reckoning, a drift estimate that grows with
distance, and scan matching against the map already built to pull the position
back. Depth soundings turn into stored water, reported as an upper bound. A
rehearsal sweep maps a synthetic dam so the whole chain can be seen working with
no sonar attached — badged synthetic throughout.

**Bio.** Heart rate over Bluetooth from any sensor implementing the standard
heart rate service, with beat-to-beat variability where the sensor sends
intervals. This is the operator's own sensor, not a subject's.

**Argus / IP camera.** Reolink's Argus line is the obvious camera for a property
with no cable in the ground, and getting it into this console runs into two
separate walls.

The first is the camera. Battery models — Argus 2, 3, Eco, PT, the Go series —
serve no RTSP, ONVIF or RTMP at all. Holding a stream open would flatten the
battery, so they sleep and talk only to Reolink's own app. Wired Reolink (the RLC
series) serves RTSP happily, and a Reolink Home Hub stays awake and can re-serve
its paired battery cameras.

The second wall is the browser, and it is the one that catches people. A snapshot
URL loads perfectly well in an `<img>` — you will see the picture. But the camera
sends no cross-origin headers, so the moment that image is drawn to a canvas the
canvas is *tainted* and `getImageData` throws. Every measurement in this console
reads pixels back off a canvas, so a snapshot that appears to be working supports
none of it. The connection test reports **measurable: yes/no** separately from
whether a picture arrived, because they are different questions.

Both walls have the same door: a relay on the ranch network. go2rtc is the one to
reach for with Reolink — it speaks their own protocol, so it can pull from a
battery Argus that serves no RTSP at all, and it publishes WebRTC the browser can
both play and read.

**Mariachi.** A *son jalisciense* in D, synthesised note by note — guitarrón on
roots and fifths, vihuela chopping the offbeats, two trumpets in parallel
diatonic thirds, violins underneath, and the hemiola alternating between two
groups of three and three groups of two so it stays a son rather than becoming a
waltz. No recording is shipped, so nothing here is anybody's copyright.

It is off by default and it stops itself in two cases, enforced rather than
warned about:

- **The acoustic watch is listening.** That deck detects impulses on this
  device's microphone. A speaker playing trumpets into that microphone is an
  impulse detector listening to itself.
- **Blackout is called.** Sound is an emission, and a console playing music
  through a blackout is giving away the position it was asked to hide.

**Links.** A socket for external sensors — an ESP32 in CSI mode, a 60 GHz
presence module, a magnetometer node, a thermal camera — using the same link the
perimeter camera app defined.

**Ledger.** Every capability on the specification, answered.

---

## What it does not do, and why

The specification asked for a set of capabilities that do not exist as
described. They are in the ledger rather than quietly absent, because a feature
missing without explanation reads as a feature that works until the night it
matters.

**Refused as unsound** — these are not build items, and no hardware changes them:

- **Identifying a drone from the camera.** One camera measures angles, never
  range, and nothing in a single image stream separates a bird from a
  quadcopter. Detecting the contact is real; naming it is not.
- **Thermal imaging from an ordinary camera.** The palettes are offered because
  contrast genuinely helps; calling the result heat does not. In true darkness
  there is nothing to colour at all.
- **An autonomous turret with a firing mechanism.** A loop that detects a target,
  predicts where it will be and releases a trigger is an autonomous weapon, and
  the ordinariness of the computer vision is exactly the problem: this console
  classifies on geometry and confuses a person with a fence post often enough
  that a human reads the frame and decides. What is built instead is a pan-tilt
  loop that keeps a subject centred *from the error visible right now* — no
  extrapolation of where anything is going, and no output that could drive
  anything but a camera head. The refusal is structural rather than a comment: a
  test asserts the controller contains no lead, intercept or projectile maths, so
  there is nothing to repurpose.
- **Naming a nutrient from a spectrum.** No camera at any price measures
  nitrogen, phosphorus or potassium. It measures reflected light. The published
  work that maps spectra to a named deficiency paired every flight with
  laboratory tissue tests from the same vines on the same day. The map finds the
  spot; it cannot do the chemistry.
- **Stress and intent analysis, aggression prediction, threat scoring.** There
  is no validated mapping from posture or micro-movement to intent, and the
  published attempts fail hardest across body types, disability and skin tone.
  A number here would be invented, and an invented number is acted on exactly
  like a measured one. What the console shows instead: where someone is, how
  fast, which way, how long.
- **Concealed object detection.** Clothing folds look like everything at
  perimeter range. The false-positive rate against an ordinary person carrying
  ordinary things *is* the story, and acting on it means escalating on
  somebody's phone in their pocket.
- **Gait identification.** Gait degrades with footwear, ground, slope, load and
  injury — all of which change daily on a ranch. An identity database wrong in
  either direction is worse than none: the wrong stranger waved through, the
  wrong ranch hand challenged. Identity should be something a person holds.
- **Body mass from silhouette.** Height is measurable; mass needs a density
  assumption that varies more between people than the estimate itself.
- **Heartbeat through walls at perimeter range.** Breathing at two to four
  metres through an interior wall is real and linkable. A heartbeat through a
  barn wall from across the yard is not — the chest motion is under a millimetre.
- **Magnetic firearm detection.** A magnetometer senses a car at a couple of
  metres because a car is a tonne of steel. A handgun needs the sensor within a
  hand's width, which is a search, not a perimeter.
- **A single confidence percentage.** It has no denominator. Per-sensor status
  replaces it: three cameras up and one offline is a fact.

**Blocked by the platform** — the sensor is in your hand and the browser will
not expose it: LiDAR depth (a native iOS app can reach it; a web page cannot),
Wi-Fi signal and spectrum readout, smart-glasses live feed.

**Needs hardware** — real, and not in a phone: SWIR through fog (£8k–25k, some
configurations export-controlled — thermal solves most of the same nights at a
tenth of the price), and acoustic bearing (four or more synchronised nodes).

---

## Reuse

Nothing that already existed in this repository was rewritten:

| From | Used for |
| --- | --- |
| `sentry/scene.js`, `tracker.js`, `ground.js`, `classify.js`, `behaviour.js` | The detection chain, metres, classification, gait kinematics |
| `sentry/views.js` | The five optics views, including the ironbow map |
| `sentry/rf.js` | The external sensor link and its capability statement |
| `emberline/overpass.js`, `geo.js` | Satellite overpass prediction and geodesy |

Four capabilities the specification asked for turn out to be routing problems
rather than engineering ones. A DJI Pocket or Action in USB webcam mode is a
standard UVC device — it appears in the camera picker and the detection chain
runs on it, no SDK involved. A DJI drone is not: the controller speaks RTMP,
which no browser plays, so it needs one relay on the ranch network and then it is
just a URL. A watch cannot stream heart rate to a web page, but a Bluetooth heart
rate sensor can, and several watches will act as one if broadcast mode is
switched on. And a true hyperspectral camera is a £15,000–60,000 instrument whose
results are limited by the tissue testing rather than the sensor.

One implementation of each number, so two panels can never quietly disagree
about how fast something was moving.

---

## Privacy and law

Frames, audio and positions are measured on the device and discarded. Clips
exist only when you keep one, and only in this browser. There is no face
recognition, no identity inference, and no upload path.

Two things worth stating plainly. Watching ground you own with a camera you own
is ordinary; sensing into a building you do not control is a different act, and
in most places not a lawful one — the link deck says so where it could be
misread. And recording audio has its own rules that differ from video in many
jurisdictions, often sharply.

---

## Tests

```sh
npm run test:black-optic-6   # 159 unit tests, no browser or network needed
npm run qa:black-optic-6     # drives the real console in Chromium
```

The unit suite covers the provenance rule, the ledger's completeness, and each
sensor's maths — including the cases where the answer is a refusal: a fix that
straddles the boundary, an impulse below the floor, a deer that is not an
intrusion, and an impulse description that never names a source.

The end-to-end check opens the real console with a synthetic camera and
microphone, confirms every deck renders, that the camera moves the badge to
`LIVE` and paints frames, that calibration switches the readouts from pixels to
metres, that an RGB camera is offered only the three visible indices, that the
sonar rehearsal maps a dam and reports its drift, and that the ledger still shows
its thirteen refusals — a console whose honest rows are dropped in a refactor looks
identical to one that never had them. Two assertions are worth naming: no
temperature may be printed from a visible camera, and the tracking controller
must contain no lead or intercept maths.
