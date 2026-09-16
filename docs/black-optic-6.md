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

Both walls have the same door, and it costs nothing.

### The free setup, in full

1. **Put go2rtc on a machine that stays on.** It is open source, one binary of
   about twenty megabytes, and it idles at a few percent of one core. A NAS, a
   mini PC, a Raspberry Pi — anything already switched on. It is the relay to
   reach for with Reolink specifically, because it speaks their own protocol as
   well as RTSP, which is what lets it pull from a battery Argus that serves no
   RTSP at all.
2. **Press "Write my go2rtc config" in the Argus panel.** It emits the YAML for
   your camera. A wired camera gets its RTSP source; a battery one gets both
   routes in order — Reolink's HTTP-FLV endpoint, which some battery models
   answer and which costs nothing to try, and the Home Hub, which is mains
   powered, stays awake, re-serves its paired cameras over RTSP, and is the route
   that always works.
3. **Run the console on that same machine** with `./start.sh`, and open it at
   `http://localhost:4173/black-optic-6/`.
4. **Press "Use the local relay".** The stream is added through `/relay`, which
   the console's own dev server proxies to go2rtc.

Step four is the one doing the real work. Serving the relay from the console's
own origin removes both walls at once: no cross-origin read to be refused, no
tainted canvas, and no mixed-content block from an HTTPS page reaching for an
HTTP camera. The frames become fully measurable — motion, tracking, thermal
palettes, vegetation indices, all of it.

Nothing in that list is paid. No Reolink subscription is involved, because none
of it touches their cloud; the camera is read on your own network. The only
optional purchase is a Home Hub, and only if the free HTTP-FLV route does not
answer on your model.

`npm run qa:camera-relay` proves the chain: it stands a relay up on go2rtc's
port, starts the console's real dev server with its real configuration, and
checks that the stream comes back from the console's own origin with its bytes
and content type intact.

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
npm run test:black-optic-6   # 166 unit tests, no browser or network needed
npm run qa:black-optic-6     # drives the real console in Chromium
npm run qa:camera-relay      # proves the relay reaches the console same-origin
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

---

## World feeds — what is happening off the ranch

Every other deck measures something on the property. This one reports what
somebody else's instruments measured elsewhere, which makes the provenance
question sharper rather than softer.

### What each feed actually needs

| Feed | Source | Works on a static page? | Why |
| --- | --- | --- | --- |
| **Seismic** | USGS | **Yes — nothing at all** | USGS sends CORS headers, so the browser reads the GeoJSON directly. No key, no relay, no server. |
| **Roads** | Caltrans / Austin / TfL | Frames yes, list no | An `<img>` needs no CORS so the picture appears; the catalog is a cross-origin *read* and needs the relay, and so does measuring anything off a frame |
| **Fire points** | NASA FIRMS | No | Needs a free `MAP_KEY`, which cannot live in a static page |
| **Headlines** | GDELT | No | No CORS header; also the source with the licence that matters |

The dev server proxies the two that need it at `/relay/caltrans` and
`/relay/gdelt`, in front of the existing camera relay because Vite matches
proxy rules in order.

### Report, never predict

The temptation with an earthquake feed is to compute what the shaking *was at
the ranch* — take magnitude, distance and depth, run an intensity prediction
equation, print a number. This console will not.

Doing it properly needs a regional IPE whose coefficients cannot be checked at
three in the morning; doing it improperly produces a confident number that is
out by two whole intensity units. That is the difference between "go and look at
the tank foundations" and "go back to bed".

So the console reports what USGS itself computed, in a fixed order of
preference:

1. **`cdi`** — Did You Feel It, the intensity people actually reported. An
   observation, so it is shown as LINKED.
2. **`mmi`** — ShakeMap's modelled maximum for the event as a whole. Shown as
   MODELLED, and labelled as *not* an estimate for this ranch.
3. **Nothing.** Where the feed publishes no intensity, the panel says so.

`shaking-here` is in the ledger as UNSOUND, with the honest path written next to
it: an accelerometer on the property would *measure* it for a few hundred
dollars instead of estimating it.

### Two things the feed itself tells you

- **`status` is `automatic` until a seismologist reviews it.** Automatic
  magnitudes get revised, routinely by a couple of tenths and occasionally by
  much more, and the solution minutes after an event is the one most likely to
  be wrong. Unreviewed rows carry the warning and render in caution amber.
- **Depth is the least-constrained parameter** in a location solution. A depth
  at or above zero usually means the analyst fixed it rather than solved for it,
  and the panel says so before anybody reasons about it.

For a M6+ event there is a third: the rupture is tens of kilometres long, so the
epicentre distance this console computes can be much further away than the
nearest shaking. That caveat appears automatically above M6.

### The `Number(null)` bug this found

`Number(null)` is `0`, and `Number.isFinite(0)` is `true`. The obvious guard —
`Number.isFinite(Number(p.mag)) ? Number(p.mag) : null` — therefore turns a
magnitude USGS has not assigned yet into a confident **M0.0**, and an absent Did
You Feel It count into "0 reports", which reads as *nobody felt it* rather than
*nobody was asked*. Both are fabricated readings of exactly the kind this
console exists to refuse, and both came from one missing null check. There is
now a single `num()` helper and a test that pins it.

### Cameras: published catalogs only

The roads panel reads catalogs that a transport agency published deliberately —
cameras pointed at public roads by the agency that owns the road, no login, no
expectation of privacy. Caltrans District 4 covers Napa and is preselected.

It has **no facility for finding a camera nobody published**, and that is a
decision rather than a limitation. `cam-discovery` is the only row on the whole
ledger whose "what would change the answer" is *nothing* — every other refusal
is physics, a platform, or a measurement that does not support the claim; this
one would still be refused if it became trivial.

Whether a frame can be *measured* is answered by `analysable()` in `argus.js`
rather than by a second function here: a traffic camera and a Reolink on a fence
post hit exactly the same canvas-taint wall, and two functions answering one
question eventually disagree.

### Headlines, and the licence that has teeth

Google News' terms restrict use to **personal, non-commercial** purposes. A
vineyard is a business, so `chooseSource()` will not select it unless the caller
explicitly declares personal use — and silently substitutes GDELT, whose terms
permit commercial use with citation, saying why. The citation travels with the
results rather than living in a footer.

Three things the panel states before any headline arrives, because a news panel
on a security console looks like situational awareness and is nothing of the
kind:

- A location-matched headline is a **string match, not an incident**.
- **Silence is not safety.** An empty result means nothing was published and
  indexed — a fact about newsrooms and crawlers, not about the valley. The panel
  renders "nothing indexed", never "all clear".
- **Nothing here is timely enough to act on.** Indexing lag runs minutes to
  hours. `news-as-warning` is in the ledger as UNSOUND for exactly this.

A feed that cannot be reached shows *no rows at all* rather than an empty list,
for the same reason.
