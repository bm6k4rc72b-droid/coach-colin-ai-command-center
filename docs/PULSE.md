# PULSE — contactless vitals

A camera-based pulse-rate monitor that runs on an iPhone, an Android phone and
a laptop from **one codebase and one URL**. No native app, no App Store, no
account, no server: the page opens the camera, measures the colour of your
skin, and reports a heart rate.

> **Not a medical device.** Wellness and engineering demonstration only. It
> cannot diagnose, treat or monitor any condition, and must never be used in an
> emergency.

---

## Opening it

| Where | How |
| --- | --- |
| **Laptop / desktop** | `./start.sh`, then <http://localhost:4173/pulse/> |
| **Any device, over HTTPS** | Deploy to GitHub Pages (below), then open `https://<user>.github.io/<repo>/pulse/` |
| **Install as an app** | Open the HTTPS link, then *Add to Home Screen* (iOS Safari) or *Install app* (Android Chrome / desktop Chrome / Edge) |

Installed, it launches full-screen from the home screen with its own icon and
works offline — the whole pipeline is local, so after the first load there is
nothing left to fetch.

### Why phones need HTTPS

Browsers only hand out the camera in a **secure context**: HTTPS, or
`localhost`. A phone opening your laptop's dev server over the LAN
(`http://192.168.x.x:4173`) is neither, so the camera is refused before the
page ever runs — the app detects this and says so rather than failing silently.

The fix is to publish it. Unlike the globe, which needs the dev server's 16
`/api/*` proxy routes, **PULSE is completely static** — nothing degrades on a
static host. `.github/workflows/pages.yml` already builds and publishes the
whole site; enable Pages under *Settings → Pages → Source → GitHub Actions*,
run the workflow, and the `/pulse/` path on the resulting URL is the app, over
HTTPS, on every device you own.

(Android-only alternative for local testing: allow the origin under
`chrome://flags/#unsafely-treat-insecure-origin-as-secure`. iOS Safari has no
equivalent.)

---

## Using it

**Face mode** — the contactless one, and the one in the demo videos.

1. Sit still in soft, even light. Indirect daylight is ideal; avoid
   backlighting, and avoid cheap LED bulbs, whose mains flicker lands right in
   the measurement band.
2. Press **Start** and keep your forehead inside the guide.
3. Wait. The ring fills as the analysis window fills — the first estimate needs
   8 seconds, and it keeps improving to about 20.

**Fingertip mode** — dramatically more reliable, and the fallback when face
mode struggles. Rest one fingertip over the **rear camera and its torch**
(the app switches cameras and turns the torch on for you where the platform
allows it). Rest, don't press: squeezing the fingertip cuts off the very
perfusion being measured.

### Reading the instrument

| Readout | What it means |
| --- | --- |
| **BPM** | Confidence-weighted median of recent estimates, not the instantaneous one |
| **Confidence** | How much of the pulse band's energy sits in the peak and its harmonic, scaled by capture quality |
| **Stability** | How little the estimate has scattered over the last 10 seconds |
| **Signal SNR** | The raw spectral figure behind confidence, in dB |
| **Waveform** | The band-passed pulse trace — you should be able to count beats in it |
| **Spectrum** | Energy across 42–240 BPM. One sharp peak is a good reading; a flat or scattered spectrum means the estimate is guessing |

If the number looks implausible, look at the spectrum before believing it. A
clean reading is unmistakable.

---

## How it works

Each heartbeat pushes a bolus of blood through the capillary bed under the
skin, and that blood absorbs slightly more green light. The skin's colour
therefore oscillates in time with the pulse — by a few parts per thousand, far
below what the eye can see, but well within what an 8-bit sensor averaged over
thousands of pixels can resolve.

```
frames ─▶ ROI mean RGB ─▶ uniform resample ─▶ POS projection
       ─▶ band-limit 42–240 BPM ─▶ FFT peak + SNR ─▶ weighted-median tracker
```

1. **Region of interest.** Every frame is reduced to `192×144` and averaged
   over one small region: the forehead (the least occluded, best-perfused patch
   that stays put while you blink or talk) when the platform offers a face
   detector, otherwise the centred alignment guide. Pixels failing a skin-tone
   test are dropped — unless most of them fail, in which case the region is
   averaged whole, so deep skin tones and torch-lit fingertips still work.

2. **Uniform resampling.** Camera frames do not arrive on a metronome. Each
   sample carries its own timestamp and the series is linearly resampled to
   30 Hz, so frame-rate jitter does not smear the spectrum.

3. **POS projection.** The three channels are combined by *Plane-Orthogonal-to-
   Skin* (Wang et al., IEEE TBME 2017). Motion and lighting changes move the
   colour along the specular axis; the pulse moves it along a different one.
   Projecting onto the plane orthogonal to skin tone cancels the former and
   keeps the latter — which is why this beats simply watching the green
   channel. Fingertip mode skips it: with the lens covered, the red channel
   carries essentially all the signal.

4. **Spectral estimation.** The signal is detrended, Hann-windowed,
   zero-padded ×4 and transformed; the strongest bin between 42 and 240 BPM is
   refined by parabolic interpolation. Confidence is the ratio of energy near
   that peak and its first harmonic to the rest of the band.

5. **Tracking.** Estimates below the confidence floor are discarded outright.
   Survivors are combined as a confidence-weighted median over a 10-second
   window, which rejects the harmonic slips (a doubled or halved peak) that a
   running mean would be dragged toward. Capture quality — brightness,
   clipping, and frame-to-frame motion — scales confidence before the tracker
   sees it, so a moving subject reports *low confidence* instead of a
   confident wrong number.

**Refusing to answer is a feature.** Every published rPPG demo looks good on a
still subject in good light; the difference between a demo and an instrument is
what it does when conditions are bad.

---

## Accuracy and limits

- Expect a few BPM of error on a still subject in decent light, and worse
  otherwise. Motion is by far the largest error source; low light is second.
- The variability figures (mean IBI, RMSSD) are **indicative only**. Beat
  timing from a 30 fps camera is quantised to 33 ms, which is the same order as
  the variability being measured. Do not read them as HRV data.
- It cannot measure blood pressure, oxygen saturation, respiration or
  temperature. Anything claiming otherwise from a plain RGB camera is
  overselling.
- Heavy makeup, sunscreen, a shaking hand, or a rate changing fast (right after
  exercise) all degrade the estimate.

## Privacy

Video never leaves the device. There is no server, no upload, no analytics: the
frames are read into memory, reduced to three numbers each, and discarded.
Saved readings live in that browser's `localStorage` until you clear them, and
**Export CSV** writes a file locally.

---

## Files

| Path | Role |
| --- | --- |
| `public/pulse/vitals-core.js` | The signal-processing core. Pure functions, no DOM — everything above is implemented here |
| `public/pulse/app.js` | Camera, sampling loop, canvases, session log |
| `public/pulse/index.html`, `pulse.css` | The interface, in the Command Center skin |
| `public/pulse/sw.js`, `manifest.webmanifest`, `icons/` | Installability and offline use |
| `src/vitals/vitalsCore.test.mjs` | 35 unit tests over the core |
| `scripts/build-pulse-icons.mjs` | Regenerates the icon PNGs from their geometry |

The app is plain ES modules under `public/`, so Vite copies it verbatim — it
needs no build step and will run from any static file server. Every path is
relative, so it works unchanged at a domain root or under a project subpath.

## Tests

```bash
node --test src/vitals/vitalsCore.test.mjs   # this module alone
npm test                                      # the whole repository suite
```

The tests import the same `public/pulse/vitals-core.js` the browser loads, so
what is tested is what ships. They cover the FFT against a naive DFT, the
band-pass, pulse recovery from a synthetic skin trace with illumination
wander, harmonic rejection in the tracker, ROI selection, and the end-to-end
pipeline against jittered frame timestamps.
