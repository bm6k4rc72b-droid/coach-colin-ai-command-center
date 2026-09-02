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
| `js/vision.js` | Per-frame detection pipeline |
| `js/tracker.js` | Stable identities across frames |
| `js/forecast.js` | Ripening velocity, harvest window, spoilage risk |
| `js/ledger.js` | Scan history, settings, CSV and GeoJSON export |
| `js/rowwalk.js` | GPS-binned transects |
| `js/camera.js` | `getUserMedia`, torch, zoom, frame capture |
| `js/app.js` | Wiring, overlay rendering, panels |
| `sw.js`, `manifest.webmanifest` | Offline install |

## Testing

```bash
npm run test:harvest-eye   # 42 unit tests over the pure logic
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
