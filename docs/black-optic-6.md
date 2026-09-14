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
npm run test:black-optic-6   # 38 unit tests, no browser or network needed
npm run qa:black-optic-6     # drives the real console in Chromium
```

The unit suite covers the provenance rule, the ledger's completeness, and each
sensor's maths — including the cases where the answer is a refusal: a fix that
straddles the boundary, an impulse below the floor, a deer that is not an
intrusion, and an impulse description that never names a source.

The end-to-end check opens the real console with a synthetic camera and
microphone, confirms every deck renders, that the camera moves the badge to
`LIVE` and paints frames, that calibration switches the readouts from pixels to
metres, and that the ledger still shows its seven refusals — a console whose
honest rows are dropped in a refactor looks identical to one that never had them.
