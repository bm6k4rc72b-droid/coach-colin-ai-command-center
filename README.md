# God's Eye View — Command Center skin

A copy of [**God's Eye View**](https://github.com/bilawalsidhu/gods-eye-view) by
[Bilawal Sidhu](https://github.com/bilawalsidhu), re-skinned with a dark,
high-tech instrumentation theme.

The upstream project is a real-time intelligence console for planet Earth: a
photorealistic 3D globe carrying live aircraft, vessels, satellites,
earthquakes, fires, traffic and public camera feeds, with hands-free voice
control. All application logic, data plumbing and features here are upstream's.
This fork changes **how it looks**, not what it does.

Upstream's own documentation is preserved verbatim as
[`README.upstream.md`](README.upstream.md) — read that for the full feature
list, data-source catalogue and operating notes.

---

## Also in here: the Agent Swarm

A multi-agent orchestration console built on top of the globe. Press
**AGENTS** (bottom right) or **Ctrl/Cmd+Shift+A**, type a goal in plain
language, and it plans the goal into a task graph, assigns each task to a
specialist agent, runs independent tasks in parallel, and folds the results
into one answer.

The agents can **drive the globe**, which is what makes it more than a chat
box. *"Find the biggest active wildfire in California, put it on screen, and
write me a one-page brief"* becomes a research task, a `geo-analyst` task that
genuinely enables the fires layer and flies the camera, and a writer task —
one job, run to completion.

Eight built-in agents (researcher, geo-analyst, recon, writer, engineer,
critic, summarizer, generalist), plus your own via **+ AGENT**. Globe tools are
resolved from the same `GEV_REALTIME_TOOLS` array that backs voice control, so
the two surfaces can never drift on what `fly_to_location` means. Each agent's
tool list is an enforced allowlist, not a hint.

Needs only `OPENAI_API_KEY` (the same one voice control uses); a Tavily or
Brave key additionally turns on web search. Full write-up, including the
failure and safety model, in [`docs/AGENT-SWARM.md`](docs/AGENT-SWARM.md).

```sh
npm run test:agents      # 46 unit tests, no key or browser needed
npm run qa:agent-swarm   # headless end-to-end run through the real console
```

---

## Also in here: Aegis

A fall guardian for a home at [`public/aegis/`](public/aegis) that fuses **a
camera, a phone carried in a pocket, and the room's own sound**, refuses to
raise an alarm on any one of them alone, and — when it does think somebody has
gone down — **asks them first**, out loud, by name, before it escalates to
anybody else. iPhone, Android, or any laptop with a webcam. Nothing recorded,
nothing uploaded, no face recognition anywhere in it.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/aegis/>** — open it and press
**Run the demonstration**; locally it is `/aegis/`.

Detecting a fall is the easy half. The two hard halves are not detecting the
things that *look* like falls, and responding without treating an adult as an
incident — roughly half the people who go down at home get themselves up within
a minute.

- **It measures the head row, not the bounding box**, which is why it still
  works in a room with furniture in it. A sofa hides shins; almost nothing in a
  home hides a standing adult's head. The floor reference is coasted while the
  feet are hidden, drawn **dashed** on the picture when it is, and spent by how
  far the subject has *moved* rather than by how long it has been — somebody
  lying motionless behind a sofa has a reference thirty seconds old and
  perfectly valid.
- **A fall is a transition, not a posture.** Sitting is a controlled lowering
  that ends at chair height. A shoelace is over in six seconds. Lying down in
  bed is lying down in a rest zone. The alarm only ever comes from a body that
  went down *and stayed there*.
- **An alarm needs two independent lines of evidence**, and the arithmetic
  enforces it rather than trusting anyone to remember. One channel is capped
  below the alarm threshold however confident it is. The single exception is
  stricter, not looser: a camera that watched the descent *and* the seven
  seconds afterwards has made two observations.
- **A still person is not a still object, because a still person breathes.**
  That one test is what stops a phone sliding onto a rug — free fall, 4.8 g
  impact, total silence — from reading as a fall, and the demonstration includes
  a scenario built specifically to fool the accelerometer so you can watch the
  fusion stage refuse it.
- **The microphone is a vibration sensor, never a microphone.** Audio becomes
  four numbers in the tick it arrives and the waveform is never copied out of
  the analyser's buffer. There is no code path by which a sound can be stored,
  replayed or sent anywhere.
- **It never claims to have seen a fall it did not see.** Somebody discovered
  already on the floor is `found-down`, capped below a watched fall, and the
  message contacts receive says so in those words.
- **Vera, the resident receptionist**, is the response layer rather than
  decoration: a holographic figure who asks by name, gives a generous and
  clearly stated way to wave her off, counts down out loud before she raises
  anybody, and goes straight to alerting if somebody says "help". Her voice
  ranks the installed system voices rather than taking the default, speaks in
  clauses with a real pitch contour, and gets *slower and lower* when the news
  is bad. A key in the voice panel bridges her to ElevenLabs or an
  OpenAI-compatible service for an exact voice match; that path leaves the
  device and the panel says so in those words.

**The demonstration is the same code path as the live camera** — there is no
demo branch inside the detector, so a scenario can show it being wrong. Eight of
them, negatives first, number keys 1–8.

Full write-up, including what it refuses to do and why:
[`docs/aegis.md`](docs/aegis.md). Tests: `npm run test:aegis` (63 checks,
including every scenario replayed through the real pipeline) and
`npm run qa:aegis` (19 end-to-end checks driving the real app in Chromium).

**Aegis is not a medical device.** It detects movement, not injury. It cannot
tell whether anybody is hurt and must not be used to decide whether somebody
needs a doctor.

---

## Also in here: Sentry

A security-camera app at [`public/sentry/`](public/sentry) that watches a piece
of ground and **draws the path of anything that crosses it, in metres** — a
person, an animal, a vehicle — then writes each subject up from what it
measured. iPhone, Android, or any laptop with a webcam. Nothing is uploaded,
nothing is recorded, and there is no face recognition anywhere in it.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/sentry/>** — open it on a phone and add it to the home screen. Locally it is
`/sentry/` (`http://localhost:4173/sentry/` under `./start.sh`).

- **The metres are real.** Mark the four corners of something you have measured
  — a patio, a parking bay — and it solves for the camera's height, tilt and
  field of view, then reports distances, speeds and standing heights from the
  ground plane. A 4.0 m / 28° / 62° camera comes back as 3.99 / 27.8 / 61.9.
- **A subject who never moves logs exactly zero metres.** Centroid jitter summed
  over a night turns a parked car into something that walked a kilometre, and
  every distance the app reports becomes worthless at the same moment. Three
  separate guards prevent it, and the test asserts equality, not a tolerance.
- **It measures gait, not motives.** Step cadence from head bob, path sinuosity,
  pauses, direction reversals, posture and a fall pattern. The written summary
  prints the figure beside every sentence and never speculates about intent —
  there is no threat score, because a threat score is a guess about a person's
  mind dressed as arithmetic.
- **Ironbow is labelled as a palette, not as thermal.** It spreads eight bits of
  murky night luminance across a ramp the eye can read. Bright means bright, not
  hot; a white shirt reads "hot". Real thermal needs a sensor no phone has, and
  the app says so where somebody might otherwise conclude a room is empty.
- **Through-wall WiFi sensing is an adapter, not a pretence.** No browser exposes
  a radio and no phone exposes channel state data, so the app connects to real
  RF hardware over a documented WebSocket and, with nothing attached, reports
  nothing rather than inventing a contact.
- **Zones live on the ground, in metres**, so they still mean the same thing
  after the camera is nudged — areas with loiter timers, directional tripwires,
  hysteresis on every rule so a subject on a boundary does not raise an event a
  frame.

Full write-up, including what it refuses to do and why:
[`docs/sentry.md`](docs/sentry.md). Tests: `npm run test:sentry` (59 unit tests)
and `npm run qa:sentry` (24 end-to-end checks driving the real app in Chromium
against a clip that walks a 1.75 m subject 6.8 m at 0.8 m/s — the app returns
6.67 m, 0.85 m/s, 1.75 m and 108 steps a minute).

Point it at ground you are entitled to watch. It is built for a perimeter you
own, not for following people.

---

## Also in here: Baseline

A camera-vitals app at [`public/baseline/`](public/baseline) that measures
**resting pulse, heart-rate variability and breathing rate from forty seconds
of your face**, then prescribes today's training session from how those compare
with *your own* recent history. iPhone, Android, or any laptop with a webcam.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/baseline/>** — open it on a phone and add it to the home screen. Locally it is
`/baseline/` (`http://localhost:4173/baseline/` under `./start.sh`).
Self-contained like the others: no build step, no dependencies, no backend, no
account, and it keeps working with the signal off.

- **It really does read your pulse off your skin.** Haemoglobin absorbs green
  light, so a face darkens by about half a per cent on every beat. The mixing
  is POS with CHROM as a second opinion — both cancel, exactly, anything that
  changes all three colour channels together, which is why leaning toward a
  lamp does not become a heart rate.
- **It says when it could not read you.** Every scan carries a signal-to-noise
  figure, and a scan that fails it is reported as unusable with the reason
  named — too dark, too much movement, face left the oval — rather than
  printing the largest bump in a spectrum made of noise.
- **Variability is held to a stricter bar than rate**, because RMSSD needs
  every individual beat located to a few milliseconds. Peaks are refined below
  the frame grid, and the figure is withheld entirely when the scan cannot
  support it.
- **It refuses to score you for the first four scans.** A resting pulse of 58
  means nothing without knowing yours; readiness is quoted against your own
  median and spread, computed robustly so one bad morning cannot redefine
  normal.
- **The coach is a decision engine, not a chat model** — tier rules, sixteen
  session templates, and Karvonen zones from your measured resting rate, each
  prescription showing the rule that produced it. An optional API key lets a
  language model reword the same decision; it never overrules it.
- **Paced breathing that measures whether it worked** — the camera keeps
  reading your pulse through the round, so it ends with how far your rate swung
  and whether the swing was locked to the pacing.

Full write-up, including the signal processing and the honest limits:
[`docs/baseline.md`](docs/baseline.md). Tests: `npm run test:baseline`
(75 unit tests) and `npm run qa:baseline` (32 end-to-end checks driving the
real app in Chromium against a synthetic face that pulses at exactly 66 bpm).

Baseline is a training tool, not a medical device, and says so on every result.

---

## Also in here: Jose Montes — Central Coast

A luxury estate site at [`public/jose-montes/`](public/jose-montes), built as
a scroll-linked film: a holographic house that **assembles itself as you
scroll**, cinematic property plates, the real monthly numbers behind every
asking price, a concierge who answers out loud, and — if you want it —
**scrolling with your hand through the camera**.

Locally it is `/jose-montes/` (`http://localhost:4173/jose-montes/` under
`./start.sh`). Like the other two it is self-contained: no build step, no
dependencies, no backend, no account, and it keeps working with the signal
off.

- **Every motion is a function of the scroll offset** — nothing is on a timer,
  so scrubbing back up runs each shot backwards exactly. Three scenes are
  pinned: the hero builds the house, the signature listing opens its plate
  like a shutter, and the interiors reel travels sideways while the page
  travels down.
- **A hand-written WebGL2 hologram** — slab, terrace, two floors, cantilevered
  roof, infinity pool and olive trees over a wireframe ocean, generated from
  about a hundred numbers in metres. Each edge carries an assembly order, so
  the estate draws itself from the foundations up in the vertex shader with no
  CPU work and no geometry uploads.
- **A concierge with a mind and a mouth in separate files** — the grammar and
  the answers are pure functions tested from Node; the voice is the platform's
  own synthesis, choosing the best installed voice and speaking in clauses so
  a line has a contour. She answers from the portfolio and the mortgage maths,
  so the figure she says is the figure on the page.
- **Hands-free scrolling** — frame differencing on a 160×120 camera feed,
  tracked by centre of mass, with a latch threshold, a deadzone and a release
  so a passing shadow does nothing and a still hand does not creep the page.
  No frame leaves the device.
- **A generative score** — a four-chord pad, a felt-piano voice and a surf bed
  synthesised with Web Audio, ducking under the concierge. No file, no
  licence, no loop seam.
- **The whole monthly cost, not just the mortgage** — loan, county tax,
  insurance and PMI, with affordability inverted by bisection and an equity
  projection that separates appreciation from principal paid down.
- **Ten cinematic plates at 88 KB total**, each with the full-resolution
  original as a network-only upgrade that a blocked connection simply skips.

Full write-up, including the design notes and the known limits:
[`docs/jose-montes.md`](docs/jose-montes.md). Tests: `npm run test:realtor`
(41 unit tests) and `npm run qa:realtor` (21 end-to-end checks driving the
real page in Chromium).

---

## Also in here: AETHER NEXUS

A holographic command centre at [`public/nexus/`](public/nexus) that teaches
**AI agents**, **AI app craft** and **cyber defence** — with a voice
receptionist standing on the dais, six interactive ranges, the phone camera
wired in, and a live picture of the sky on the globe behind her.

Locally it is `/nexus/` (`http://localhost:4173/nexus/` under `./start.sh`).
Like HarvestEye it is self-contained: no build step, no dependencies, no
backend, no account, and it keeps working with the signal off.

- **A hand-written WebGL2 hall** — rotunda, dais, curved video wall, and a
  holographic receptionist built as a point cloud from a parametric body
  profile. No model files, no 3D library. Drag to orbit, tilt the phone for
  gyroscope parallax, press **◍** to swap her for a wireframe Earth carrying
  the live feeds.
- **A receptionist who answers offline** — platform speech synthesis and
  recognition, plus a BM25 index over the syllabus so every answer arrives
  with the lesson it came from. Connect a Claude or OpenAI-compatible key and
  she reasons past the lessons; without one she still teaches.
- **22 lessons across three tracks**, each module ending in a check.
- **Six ranges with real analysis** — phishing triage graded asymmetrically,
  a password forge that shows the collapse from naive to effective entropy
  against four attacker profiles, a crypto bench running actual Web Crypto,
  an injection range with a defended and an undefended agent, an agent-loop
  builder, and a QR scanner that pulls a link apart before you follow it.
- **The phone camera** — front and rear, torch, capture, presence detection
  and code scanning, all on-device; no frame is uploaded or stored.
- **Live aircraft, launches, satellites, earthquakes, space weather and
  vulnerability feeds**, each degrading LIVE → CACHED → SIM and saying on
  screen which one it is.
- **An agent swarm** whose specialists hold tool allowlists enforced in code,
  not in a prompt — and a trace that shows the refusal when one is exceeded.

Full write-up, including the design notes and the known limits:
[`docs/nexus.md`](docs/nexus.md). Tests: `npm run test:nexus` (27 unit tests)
and `npm run qa:nexus` (29 end-to-end checks driving the real console in
Chromium).

---

## Also in here: HarvestEye

A second, self-contained app lives at [`public/harvest-eye/`](public/harvest-eye)
— **on-device crop maturity detection** through a phone camera, for iPhone and
Android. It shares nothing with the globe app but the repository and the dark
instrument aesthetic: no backend, no API key, no upload, and it keeps working
with the signal off.

**Live: <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/harvest-eye/>** — open it on a phone and add it to the home screen. Locally
it is `/harvest-eye/` (`http://localhost:4173/harvest-eye/` under `./start.sh`).

What it does beyond drawing boxes on fruit:

- **Measures each block's own ripening rate** from repeat scans and forecasts
  the harvest window from that, instead of from a generic crop table.
- **Calibrates to the light** off any neutral surface, so readings taken at dawn
  and at noon are comparable.
- **Learns your cultivar** — tap a fruit, name its stage, and the crop's colour
  path bends toward what you actually grow.
- **Walks a row** with GPS, producing a ripeness strip and hotspot list for a
  picking crew.
- **Keeps a field ledger** — dated, geotagged, sorted by urgency, exportable as
  CSV or GeoJSON.

Full write-up, including how the detector works and where it can be wrong:
[`docs/harvest-eye.md`](docs/harvest-eye.md). Tests: `npm run test:harvest-eye`
and `npm run qa:harvest-eye` (drives the real app in Chromium against a
synthetic camera feed).

---

## What the skin changes

Four files. No upstream rule was deleted, so pulling new commits from upstream
stays a clean merge.

| File | Change |
| --- | --- |
| `theme/command-center.css` | **New.** The entire skin: token overrides plus a decorative HUD layer. |
| `index.html` | Two lines — loads the theme after `style.css`, adds the `#cc-atmosphere` element. |
| `style.css` | Tokenized 98 hardcoded `rgba(0, 212, 255, …)` literals to `rgba(var(--accent-rgb), …)`. |
| `src/*.test.mjs` | 7 regex assertions widened to accept either colour notation (see below). |

Upstream's suite passes **2587/2587**, identical to a pristine checkout, and
`npm run build` is clean.

### Why `style.css` had to be touched

Upstream is about half-tokenized: 73 call sites use `var(--accent)`, but 98
inline the same cyan as a literal. Overriding the token alone would have
re-tinted roughly half the interface and left the rest on the old colour.

The sweep only rewrote literals that **exactly equalled upstream's own
`--accent` value**, so it is a provable no-op under upstream's palette —
`--accent-rgb: 0, 212, 255` is defined next to `--accent` in `style.css`, and
the file still renders identically with the theme removed. Deliberately left
alone: the cockpit teal (`#22e6e6`), the ambers, and every other colour that
was a genuine design distinction rather than a duplicated accent.

Four tests in `panelStackLayout.test.mjs` and `cockpitMarkup.test.mjs` matched
those literals with regexes, so 7 assertions were widened from
`rgba\(0, 212, 255, 0\.18\)` to
`rgba\((?:0, 212, 255|var\(--accent-rgb\)), 0\.18\)` — the colour *notation*
became flexible, nothing else. Selector, gradient shape, stop positions, alpha
values and box-shadow blur radius are all still asserted exactly, and the
originals still match, so the tests pass against pristine upstream too.

### The design

*Reading instruments in a dark room.*

- **The globe is the light source.** Chrome drops to near-black (`#03060b`) with
  a blue cast so the Earth is the only warm thing on screen.
- **Two accents, each with a job.** Signal cyan (`#38f0ff`) means live/active;
  ember amber (`#ffa63d`) means alert/attention.
- **Machined, not rounded.** Panel radius 16px → 4px, with a lit hairline along
  the top edge and bracket marks at opposing corners — targeting furniture, not
  soft cards.
- **Data reads as data.** Monospaced, tabular figures, uppercase labels tracked
  out at 0.14em, values glowing and labels receding.
- **Atmosphere.** One non-interactive film over the globe: a survey graticule
  masked to fade at centre, faint scanlines, and a vignette.

Layout tokens (`--left-stack-x`, `--dock-*`, and friends) are untouched.
Geometry stays exactly as upstream tuned it.

### Accessibility

The atmosphere layer is `pointer-events: none` at `z-index: 1` and can never
intercept a click. Scanlines drop under `prefers-reduced-motion`; the whole film
drops and glass goes opaque under `prefers-reduced-transparency`. Keyboard
focus rings were given an explicit cyan outline so they stay legible against
the darker ground.

---

## Running it

**Just run this:**

```bash
./start.sh
```

Then open <http://localhost:4173/>. That's it — it installs what it needs on
first run, creates your `.env`, and starts the app. Ctrl+C stops it. You only
need [Node.js](https://nodejs.org) installed first (the LTS build; `start.sh`
checks the version and tells you if it's too old).

### No API keys required

The app used to abort with `GOOGLE_MAPS_API_KEY not found`, so a keyless run
gave a dead white sphere. That check is now optional — `src/main.js` skips the
Google tileset when there's no key and lets `MapStackController`'s existing
keyless path take over, which was already written and already defaulted to
`'osm'` whenever no tileset was passed. Nothing else changed.

So with **zero keys, zero signup, zero credit card** you get:

- a real globe with OpenStreetMap imagery, and the whole interface and skin
- the no-key live layers: flights, military ADS-B, satellites, earthquakes,
  CCTV, radio, bikeshare, launches, and the bundled infrastructure datasets

Keys only add things on top. Put them in `.env` whenever you like:

| Key | Unlocks | Cost |
| --- | --- | --- |
| `GOOGLE_MAPS_API_KEY` | Photorealistic 3D tiles — the cinematic look | 1,000 free sessions/mo, then ~$6/1,000 |
| `CESIUM_ION_TOKEN` | Bing imagery, Cesium World Terrain | Free tier |
| `AISSTREAM_API_KEY` | Live ships | Free |
| `FIRMS_MAP_KEY` | Active fires | Free |
| `TOMTOM_API_KEY` | Real road traffic | Free tier |
| `OPENAI_API_KEY` | Voice control | Metered, $5 session cap |

Keys are brokered server-side by the dev server, never exposed to the browser.
It binds to localhost by default — putting it on a LAN exposes your keys with
it, so set budget caps provider-side too.

## Publishing a link (and its limits)

`.github/workflows/pages.yml` publishes a static copy to GitHub Pages. Enable
it under **Settings → Pages → Source → GitHub Actions**, then run it from the
Actions tab.

**Read this before relying on it.** A static host has no backend, and this app
is not a static app: `vite.config.js` implements **16 `/api/*` routes** that
proxy and key-broker every live feed. Deployed statically you get the globe,
the interface and the skin — but aircraft, ships, CCTV, traffic, fires and
voice have nothing to call and report unavailable.

The link is a shop window. `./start.sh` is the app.

There is also no way to publish this as a Claude Artifact: Artifact pages are
sandboxed with a CSP that blocks all outbound fetch/XHR/WebSocket, which is
every data source and every map tile this depends on.

`scripts/build-static.sh` produces the same build locally. It handles two
things a plain `vite build` gets wrong for a project subpath: `vite-plugin-cesium`
writes its runtime to `dist/<base>/cesium` while the app requests
`/<base>/cesium` (so it is hoisted), and the hand-written root-absolute asset
paths (`/logo.svg`, `/models/*.glb`) are rewritten to include the base.

## Tweaking or removing the skin

Every colour, radius and glow lives in the `:root` block at the top of
`theme/command-center.css`. Change `--accent` and `--accent-rgb` together and
the entire interface re-tints.

To go back to stock, delete the two `index.html` lines that reference
`command-center.css` and `#cc-atmosphere`. `style.css` is standalone-correct on
its own and needs no revert.

---

## Attribution and licence

God's Eye View is © 2026 Bilawal Sidhu, released under the MIT Licence, which
is retained unmodified in [`LICENSE`](LICENSE). This copy is a derivative work
under those terms.

- Upstream: https://github.com/bilawalsidhu/gods-eye-view
- Announcement: https://www.spatialintelligence.ai/p/i-open-sourced-gods-eye-view

Bundled datasets carry their own separate terms — see
[`DATA_SOURCES.md`](DATA_SOURCES.md). Upstream's stated scope limit is kept as
is: the project does not build features for named-person search, face
recognition, or tracking individuals.

**Not vendored:** `docs/media/` (68 MB of demo GIFs). Image links in
`README.upstream.md` will not resolve; the upstream repo has them.
