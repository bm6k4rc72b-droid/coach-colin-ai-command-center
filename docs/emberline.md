# Emberline

A fire tracker at [`public/emberline/`](../public/emberline) that fuses
**satellite detections, camera cross-bearings and network node loss** into
ranked fire hypotheses, then projects each one forward with Rothermel's surface
spread model — and draws every piece of it at the size its uncertainty actually
is.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/emberline/>**

It opens on a scenario with known answers, so nothing on screen has to be taken
on trust. Tests: `npm run test:emberline` (38 unit tests).

---

## The thing it is arguing with

Open any public fire map. Satellite detections are dots. All the dots are the
same size. There is a refresh button, and pressing it spins.

Each of those three is a lie of omission, and they compound.

**A detection is a pixel, not a point.** VIIRS resolves 375 m looking straight
down and about 800 m at the edge of its 3040 km swath; MODIS runs from 1 km to
nearly 5 km. The coordinate in the file is the *centre* of that pixel. FIRMS
publishes the actual footprint, per detection, in its `scan` and `track`
columns — and almost nothing draws them. In this app's own demo the three
pixels are 14, 36 and 266 hectares. As dots they look identical.

**A detection is old.** Polar orbiters look at a given place a few times a day.
A detection timestamped 13:42 and read at 17:00 is three hours stale, and a
wind-driven fire moves kilometres in three hours. So age is the primary
attribute here, not metadata.

**Refreshing does nothing between overpasses.** There is no new observation to
fetch. An app that animates a spinner while fetching nothing is teaching its
user that the data is live. Emberline instead answers *when the picture next
changes* — and names the geostationary option that fills the gap, at the far
coarser resolution that is the actual trade.

---

## What it does that comparable tools do not

### Projects the fire forward, with its error bars

The full Rothermel (1972) surface spread model is implemented, not
approximated: size-class surface-area weighting, packing ratio, reaction
intensity, moisture and mineral damping, propagating flux ratio, wind and slope
factors, and the dynamic live moisture of extinction. Anderson's thirteen
standard fuel models ship with it, plus Byram flame length and Van Wagner's
crowning threshold.

It agrees with BehavePlus where it should: fuel model 1 at 2 m/s midflame wind
and 6% dead moisture returns **25.3 m/min against a published ~26**, and
1.4 m/min no-wind against ~1.3. The arithmetic runs in the units the
coefficients were fitted in and converts once at the boundary, because
re-deriving Rothermel's constants in SI is how a factor-of-3.28 error gets
buried where nobody finds it.

**Nothing returns one ellipse.** Fuel moisture is a guess unless somebody
weighed a sample this morning; midflame wind is a forecast times one of four
coarse shelter factors; fuel model is a person looking at a hillside. So the
whole model is run three times — at the expected inputs and at both ends of a
stated plausible band — and what gets drawn is the *band between the slow and
fast perimeters*. When that band is embarrassingly wide, the honest response is
to show it.

Arrival at a place is therefore a **window**: "21–81 minutes", never "51
minutes". A window is what an evacuation decision needs. Past eight hours the
app says so rather than printing a number somebody might plan against —
"the conditions stay as they are" has by then stopped being an assumption and
become a fiction.

### Reads the fire off the network dying

This is the strongest thing in here and it is almost never used.

A fire front moving across ground destroys the infrastructure on that ground:
the power drop, the fibre, the pole-mounted radio, the camera on the mast. Each
was answering a ping a minute ago and is not answering now. So **a network of
mapped, surveyed nodes is a grid of fire sensors that already exists**, and
nobody installed it for that. Unlike a satellite pixel it is not hours old, not
blocked by cloud, and not 375 m wide — it is the exact coordinate of a thing
that has stopped existing.

The catch is that silence has other causes, so the reader requires a *spatial
and temporal pattern* before it will say "front": several nodes, in order,
moving in a consistent direction at a speed a fire could manage. That test
catches the important false positive. When an upstream switch fails, every node
behind it goes dark within seconds in no spatial order at all; a fire takes
minutes to cross the ground between two nodes. **Simultaneity is the signature
of an infrastructure fault; progression is the signature of a fire.** The
scenario's four losses are spaced to imply exactly 5.73 m/s, and the reader
recovers 5.726.

What it then reports is the operationally useful part: which *surviving* nodes
are in the path, and when.

### Counts independent sources, not observations

Forty VIIRS pixels from one overpass are **one observation**. One instrument,
one atmosphere, one pass, one calibration, one geolocation solution — if that
pass was mis-registered by a kilometre they are all wrong by a kilometre
together, and their unanimity means nothing. Count them as forty and the app
manufactures near-certainty about a position a single systematic error can move
wholesale.

Two cameras on two peaks are genuinely two. A camera and a satellite are two of
*different kinds*, which is stronger again, because the ways a camera fails —
fog, auto-exposure, a knocked mount — have nothing to do with the ways an
orbiting radiometer fails, and a burnt-out node fails in a third unrelated way.
Corroboration is worth something only to the extent the corroborating thing
could have failed differently.

So observations are grouped by their **independence key** — what could take
them all out at once — and confidence follows the number of distinct keys and
kinds, not the row count. The forty-pixel case scores **0.27**. A pixel plus a
camera bearing plus a destroyed node scores **0.81**.

### Carries the error ellipse a camera fix actually earns

Two bearings never meet at a point. They meet in a region whose shape is set by
the crossing angle and the range, and that is the interesting part: cross at 80°
from 5 km and it is a few hundred metres across; cross at 4° from 30 km and it
is a sliver ninety-seven kilometres long. **Both print as a latitude and a
longitude.** Only one is a location. Every fix here carries its covariance, the
map draws the ellipse, and a grazing fix is marked unusable and told where to
put a third observer — perpendicular to the long axis, which is the direction
the fix is blind in.

The dominant error is not the compass. It is that **a camera sees smoke, and
smoke is not where the fire is.** A column leans downwind as it rises, so the
visible top — the part that shows above a ridge, the part a distant observer
actually sees — can be kilometres downwind of the burning ground. Two observers
on the same side will cross their lines confidently, agree with each other, and
both point downwind. The app estimates that lean, moves the fix upwind, and
widens the error by half the correction again, because the height and the rise
rate are themselves estimates.

---

## What it refuses to do

- **Crown fire.** Rothermel is a surface model. Once fire is in the canopy it
  can run several times faster than anything here predicts. Van Wagner's
  threshold is evaluated and flagged; the result is not modelled. Under crowning
  conditions the envelope on the map is not conservative, it is the wrong model.
- **Spotting.** Embers land kilometres downwind and start new fires ahead of the
  front. This is what actually destroys towns and no surface model contains it.
- **Infer a fire nobody detected.** No detection is not no fire — cloud hides
  the ground completely, fires under roughly a hundred square metres fall below
  the threshold, and there are hours between looks. An empty map says "nothing
  was seen from orbit in this window", never "nothing is there".
- **Sense through walls unaided.** No browser has a radio API: `navigator.wifi`
  does not exist in any shipping engine, iOS exposes no channel state
  information to any app at any privilege level, and Android gives one
  signal-strength number per access point where presence sensing needs
  per-subcarrier phase. So this is an adapter, not a pretence — attach an
  ESP32 in CSI mode, a patched Intel 5300, a 60 GHz presence sensor or an SDR,
  stream it over a WebSocket, and its contacts fuse with everything else. With
  nothing attached the panel stays empty and names the four devices. A
  fabricated occupancy reading is what sends a crew into a building for nobody.
- **Report a single arrival time.** Windows only, for the reasons above.
- **Draw a basemap it does not have.** A procedurally generated hillshade would
  look convincing and be fiction, and under a fire projection somebody would
  read a ridge off it. The ground is a labelled coordinate graticule with a true
  scale bar.

Link attenuation between fixed radios is included and *not recommended*: fire
does perturb a path, but at Wi-Fi frequencies the effect is buried under rain, a
truck in the Fresnel zone, and an antenna sagging on a hot day. It is reported
as a drop in link margin — corroboration for a fire something else already
found, never a detection.

---

## The scenario it opens on

Every number in it was chosen, not measured, which is what makes it a test
rather than a showcase. `DEMO_TRUTH` is imported by the test suite, so what the
app is checked against is the same thing a person sees on first paint.

| Quantity | Truth | What the app recovers |
| --- | --- | --- |
| Front speed from node loss | 5.726 m/s | **5.726 m/s** |
| Camera fix, from 1–2° of injected bearing error at ~10 km | — | **481 m** from truth, ellipse ~1.1 km |
| Satellite pixel centre offsets | 420 m / 672 m | drawn as 14 ha / 36 ha footprints |
| Fused hypothesis | — | **83%**, 5 independent looks, 3 sensor kinds, located to 187 m |

The fire is at a fixed coordinate the app is never told. The camera bearings are
computed to it and then deliberately spoiled by a stated number of degrees, so
the triangulator's error can be compared against the error that was injected.

---

## Running it

It is a static, offline-capable PWA with no build step and no dependencies —
plain ES modules, a canvas, and a service worker. Locally it is `/emberline/`
(`http://localhost:4173/emberline/` under `./start.sh`). Open it on a phone and
add it to the home screen; everything runs on the device.

Live satellite detections need a free NASA FIRMS `MAP_KEY`. Without one the app
runs the built-in scenario and says which source is absent, in the space that
source's data would have occupied.

## Sources

Rothermel 1972 (INT-115), as restated with corrections in Andrews 2018
(RMRS-GTR-371) · fuel models Anderson 1982 (INT-122) · fire shape Anderson 1983
· flame length Byram 1959 · crowning Van Wagner 1977 · detections NASA FIRMS
(VIIRS, MODIS) · overpass timing from published sun-synchronous crossing times,
good to about ±50 minutes and not a substitute for propagating a current TLE.
