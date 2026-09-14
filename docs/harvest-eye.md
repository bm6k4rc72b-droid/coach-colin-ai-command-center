# HarvestEye — on-device crop maturity detection

A camera app for iPhone and Android that scores fruit ripeness in the live
viewfinder, forecasts the harvest window, and keeps a per-block history that
makes the forecast better every time you use it. It runs entirely in the
browser: no upload, no API key, no account, and — after the first visit — no
signal.

**Live at <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/harvest-eye/>.** Open that on a phone and add it to the home
screen — it launches full-screen like a native app and keeps working offline.
Locally it is `/harvest-eye/` (`http://localhost:4173/harvest-eye/` under
`./start.sh`).

The camera needs a secure context, so HTTPS or `localhost` only — opening the
files straight off disk (`file://`) will not get a camera.

---

## Two modes

**Fruit** detects and tracks individual fruit, scores maturity, and forecasts
the harvest window. **Canopy** stops looking for fruit and reads the leaves:
vegetation indices, canopy cover, yellowing and necrosis, and a false-colour
zone map of where the weak plants are. The chip in the top bar switches between
them; the ledger keeps both, separately.

---

## Why it isn't just a green/red filter

Six things make it worth carrying into a field.

**1. It runs on the device, not in a datacentre.** Detection is a colour and
shape pipeline in plain JavaScript over a 224 px frame — around 15 analyses a
second on a mid-range phone. There is no model to download and no request to
make, so it works in a polytunnel with one bar of signal, and no photograph of
your farm ever leaves your hand.

**2. It measures your block's ripening rate instead of guessing it.** The first
scan of a block is forecast from the crop's nominal cycle length, warped for
temperature. From the second scan onward a regression through *that block's own
readings* takes over, and the readout switches from `nominal` to `measured`.
Cultivar, aspect, irrigation and shade are already baked into that number
because it came from the block itself.

**3. Colour calibration.** The same tomato reads orange at golden hour and pink
under greenhouse sodium. Point the reticle at anything neutral — a grey card, a
white bucket lid, a sheet of paper — and every later reading is corrected by the
gains that pull that patch back to grey. Without this, colour-based maturity is
only comparable within a single hour of a single day.

**4. Teach mode.** Tap a fruit, say what stage it is, and the crop's colour path
bends toward what you actually grow. A pale beefsteak and a deep San Marzano
stop being scored by the same curve. Taught profiles persist per device and can
be reset.

**5. Row walk.** Hold the phone at the fruiting wall and walk. Readings are
binned every 5 m against GPS, producing a ripeness strip for the whole row and a
hotspot list — so a picking crew gets sent to metre 40, not "the north block".

**6. It writes things down.** Every scan is dated, geotagged and filed under a
block. The ledger sorts blocks by urgency, projects a stale reading forward at
its own measured rate, and exports to CSV or GeoJSON for whatever system the
farm already runs.

Plus the small things that matter one-handed in sun: torch control, lens
switching on multi-camera phones, haptics, a chirp when ripe fruit enters frame,
and an installable offline shell.

---

## Canopy mode — what a phone camera can honestly measure

The reels that inspired this feature show hyperspectral and multispectral
hardware: instruments that record a hundred narrow bands per pixel, or a handful
of calibrated ones including near-infrared. **A phone cannot do that**, and it is
worth being blunt about why: the sensor has three broad, heavily overlapping
colour channels, and an IR-cut filter is bonded over it at the factory
specifically to throw away the near-infrared that NDVI is built on. No amount of
processing recovers a spectral cube from three numbers per pixel.

What a phone *can* do is the visible-band subset of the same science, which is a
real and published field of agronomy:

| Index | Reads | Formula |
| --- | --- | --- |
| **ExG** — Excess Green | Canopy against soil. The masking workhorse. | `2g − r − b` on chromatic coordinates |
| **NGRDI** — Green-Red Difference | Vigour and biomass; falls as canopy yellows or thins. **Default.** | `(G − R) / (G + R)` |
| **VARI** | Canopy cover, with some resilience to changing light. | `(G − R) / (G + R − B)` |
| **GLI** — Green Leaf Index | Green fraction; thinning and senescence. | `(2G − R − B) / (2G + R + B)` |
| **TGI** — Triangular Greenness | Leaf chlorophyll, and so nitrogen status. | `−0.5[190(R − G) − 120(R − B)]` |
| **NDVI** | The real thing — needs an IR-converted camera. | `(NIR − RED) / (NIR + RED)` |

Sources: Woebbecke 1995, Hunt 2005, Gitelson 2002, Louhaichi 2001, Hunt 2011 and
2013, Rouse 1974.

### Real NDVI, if you want it

Removing a camera's IR-cut filter and fitting a red or blue long-pass filter
turns one channel into a genuine NIR channel — the Public Lab "Infragram"
arrangement, achievable with a cheap camera module and a piece of filter gel.
Tell the app which conversion you have in **Index → Camera** and NDVI unlocks
and is computed for real. Until then it stays greyed out, because pretending is
worse than not offering it.

### Measuring stress without a calibration lab

Absolute index thresholds are close to useless across crops and conditions, so
the headline numbers are relative to the field itself:

- **Spread** — how far the weakest tenth of zones sits below the strongest
  tenth, as a percentage. No threshold, no calibration, no crop table.
- **Weak zones** — the share of zones more than 10% below that reference, which
  is the conventional band management-zone maps are drawn in.
- **Yellowing / necrotic** — leaf-area fractions from a hue classifier, kept
  deliberately separate from the index so a grower can act on "12% of leaf area
  is necrotic" rather than on "TGI is 0.21".

Both relative measures are computed over **zones, not pixels**. Per-pixel, sensor
noise alone drops a tail below any relative cut, and a perfectly uniform field
reports a few percent of phantom stress; a zone is also the unit you can
actually drive a machine to.

### Field map

Point it at any photo taken from height — a drone shot, a mast, a ladder — and
the same index runs over the whole image at higher resolution and a denser
grid, producing the zone map, a numbered hotspot list with positions, and a CSV
of every zone for a spreader or irrigation plan. This is the drone-map workflow
without the drone subscription.

### Indices disagree, and that is the point

On a test field carrying a circular stress patch and a nitrogen-poor corner,
NGRDI reported a 67% spread and flagged 20% of zones; TGI reported 3% and
flagged none. Neither is broken — TGI is a chlorophyll index and that particular
stress moved red and green together, which its triangle largely cancels.
Carrying five indices and letting the operator switch is the honest design; one
index presented as truth would not be.

---

## How the detector works

Per frame:

1. **White-balance** every pixel with the operator's calibration gains.
2. **Project** each pixel's hue onto the crop's ripening path — an ordered set
   of hue anchors from immature to ripe (`js/crops.js`). Distance from that path
   decides whether the pixel is this crop at all; position along it is the
   maturity coordinate `m ∈ [0,1]`.
3. **Measure texture** as local gradient magnitude. Fruit skin is smooth and
   often specular; leaves have veins, serrations and self-shadowing.
4. **Clean** the mask with a 3×3 majority filter.
5. **Grow blobs** with maturity-aware connectivity: neighbouring pixels only
   join when their maturity is close, so a ripe fruit does not weld itself to
   the immature-green canopy behind it.
6. **Gate** each blob on shape, colour purity, smoothness and size. Green blobs
   face a stricter bar — unripe fruit and foliage share a hue band, and only
   texture and roundness separate them — plus an area cap, because a green
   region covering a third of the view is canopy, not one enormous fruit.
7. **Track** blobs across frames by box overlap so each fruit keeps a stable
   label (`TM014`) and a smoothed maturity instead of a number that jitters with
   every gust of wind.

The maturity scale ends at **full colour**, not spoilage. Hue stops moving once
a fruit has finished colouring, so a perfect vine-ripe tomato and one that sat
three days too long are the same hue. Actual spoilage is a separate measurement
— the dull, dark browns the detector counts as decay — and it overrides the
colour verdict when it appears.

## The forecast

```
daysToHarvest = (harvestAt − maturity) / ratePerDay
```

`ratePerDay` is either the measured regression slope for that block, or
`1 / cycleDays` warped by a Q₁₀ ≈ 2 temperature factor. A measured slope is only
trusted when it is positive, well-fit (r² ≥ 0.4) and built on at least two
scans; otherwise noise would masquerade as evidence. The forecast always reports
which basis it used, and the ledger prints the fit quality.

`spoilageRisk()` converts a delay into fruit: once a block is inside its window,
waiting a day moves part of the ripe fraction past it. That is the number that
decides whether a crew is worth pulling off another block today.

---

## Honest limits

- This is a **colour and shape estimator, not a trained neural network**. It
  does not know what a tomato is; it knows what ripening looks like in hue
  space. It is reproducible and inspectable, and it will be wrong on cultivars
  and lighting it has never been calibrated for.
- It cannot see fruit **behind leaves**. Counts are what is visible, not what is
  on the plant.
- **Internal quality** — sugar, acidity, firmness — is not visible to a camera.
  Colour leads and correlates; it does not replace a refractometer.
- **This is not hyperspectral imaging** and cannot be made into it in software.
  Three broad channels are three broad channels.
- **Water stress is not directly measurable** from colour. Wilting and colour
  loss are late, indirect symptoms; the real measurement is canopy temperature,
  which needs a thermal sensor.
- Harsh or mixed lighting shifts hue. Calibrate before comparing readings taken
  across a whole day.
- Anthocyanin crops and blushed cultivars benefit most from teach mode.

## Privacy

Frames are analysed in memory and discarded. Nothing is uploaded — there is no
server to upload to. Scans, settings and taught colours live in the browser's
local storage on that one device, and leave only when you export them.

---

## Files

| Path | What it is |
| --- | --- |
| `public/harvest-eye/index.html` | App shell and panels |
| `public/harvest-eye/styles.css` | Dark instrument skin, safe-area aware |
| `js/color.js` | HSV, circular hue maths, white-balance gains |
| `js/crops.js` | Crop profiles, maturity stages, teach-mode learning |
| `js/vision.js` | Per-frame fruit detection pipeline |
| `js/spectral.js` | Vegetation indices, canopy masking, zone statistics |
| `js/tracker.js` | Stable identities across frames |
| `js/forecast.js` | Ripening velocity, harvest window, spoilage risk |
| `js/ledger.js` | Scan history, settings, CSV and GeoJSON export |
| `js/rowwalk.js` | GPS-binned transects |
| `js/camera.js` | `getUserMedia`, torch, zoom, frame capture |
| `js/app.js` | Wiring, overlay rendering, panels |
| `sw.js`, `manifest.webmanifest` | Offline install |

## Testing

```bash
npm run test:harvest-eye   # 66 unit tests over the pure logic
npm run qa:harvest-eye     # end-to-end: real Chromium, synthetic camera feed
```

The QA script hands Chromium a generated Y4M clip as a fake camera — ripe and
unripe fruit on a textured canopy — then drives the real app: permission flow,
capture loop, detector, overlay, readout, scan logging and ledger render. It
writes a screenshot and exits non-zero on any failed check.

## Deploying it

The camera API requires HTTPS (or localhost). Unlike the globe app, HarvestEye
has no backend at all, so the repository's GitHub Pages workflow publishes a
**fully functional** copy — that is what serves the live link above.

Two notes if you redeploy it yourself: GitHub restricts the `github-pages`
environment to the default branch, so a deploy has to run from `main` (a
`workflow_dispatch` on a feature branch is rejected before the deploy job
starts), and `scripts/build-static.sh` derives the base path from the
repository name, so a fork or a rename keeps working without edits.
