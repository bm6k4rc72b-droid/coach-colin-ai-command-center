# AETHER NEXUS

A holographic command centre that teaches three things — **AI agents**, **AI
app craft** and **cyber defence** — with a voice receptionist standing on the
dais, six interactive ranges, the phone camera wired in, and a live picture of
the sky on the globe behind her.

It lives at [`public/nexus/`](../public/nexus) and shares nothing with the
Cesium globe app but the repository and the dark instrument aesthetic. No
build step, no framework, no dependencies, no backend, no account. Locally it
is `/nexus/` (`http://localhost:4173/nexus/` under `./start.sh`); on a static
host it is `/nexus/`.

```sh
npm run test:nexus   # 27 unit tests, no browser needed
npm run qa:nexus     # 29 end-to-end checks driving the real console in Chromium
npm run qa:nexus -- --out shot.png   # …and a screenshot
```

---

## What is actually in it

### The hall

A hand-written WebGL2 scene: a rotunda of curved display panels, a marble
inlay floor, a tiered dais and a chandelier, with a holographic receptionist
standing in a projected light. Every vertex is generated from maths in
[`js/geometry.js`](../public/nexus/js/geometry.js) — the figure is a point
cloud sampled from a parametric body profile, the room is a line list — which
is why the whole app is a few hundred kilobytes and needs no model files.

Two shader programs draw all of it: additive point sprites and lines. Bloom is
faked by drawing the figure twice, once wide and soft, once tight and bright,
which costs one extra draw call instead of a second framebuffer. The renderer
watches its own frame rate and drops resolution rather than frames, so a
mid-range phone stays smooth.

Drag to orbit, pinch or scroll to dolly, and on a phone **Tilt to look around**
(Lens deck) turns on gyroscope parallax. Press **◍** or `G` to swap the
receptionist for a wireframe Earth carrying the live feeds.

### The receptionist

Aether speaks through the platform's own speech synthesis, choosing the most
convincing female voice available for the interface language, and listens
through the platform's speech recognition where it exists. Nothing is sent to
a speech service; nothing is recorded.

Speech is optional in both directions. The typed input does everything the
microphone does, because recognition support is uneven — Chrome and Safari
have it, Firefox does not, and some in-app browsers block it.

The grammar in [`js/voice.js`](../public/nexus/js/voice.js) separates commands
from questions, which is the only part that has to be right: *"open the
phishing range"* navigates, *"what is phishing"* gets answered. Try:

| Say | What happens |
| --- | --- |
| *"open the cyber security track"* | Academy, cyber defence |
| *"run the phishing lab"* | Phishing triage range |
| *"show me the globe"* | Earth up, live markers on |
| *"brief me"* | Spoken status: feeds, latest quake, next launch, your rank |
| *"scan a QR code"* | Camera scanner |
| *"stop"* | Stops talking mid-sentence |

### The mentor, with and without a model

Ask a question and it is answered from the syllabus itself: a BM25 index over
lesson-sized chunks picks the right lesson, the best sentences are extracted,
and the answer arrives with the lessons it came from as tappable citations.
This runs offline, with no key and no account, and it is the default.

Some questions bypass retrieval because a specific answer beats a general one:
paste a link and ask if it is safe and you get the URL analysis; quote a
password and you get its strength against four attacker profiles; try an
injection on the receptionist and she names the patterns and explains why she
is not acting on them.

Adding an API key in Settings (Claude or any OpenAI-compatible endpoint) lets
Aether reason beyond the lessons, with the retrieved syllabus supplied as
context and the answer streamed. A failed call falls back to the local answer
rather than to an error. The console is blunt about the trade: **a key in a
browser is readable by anything running in that page**, so use a scoped,
revocable one, or leave it empty.

### The ranges

Six drills. All of the analysis is real and local — no scoring service, no
telemetry.

| Range | What it does |
| --- | --- |
| **Phishing Triage** | Six messages, some hostile. Call each and tag the indicators. Grading is asymmetric: a missed phish costs more than a false alarm, as it does in a real inbox. |
| **The Password Forge** | Watch a password's effective entropy collapse under human patterns, then see it against four attacker profiles from a rate-limited login to a rented GPU farm. The generator uses `crypto.getRandomValues` with rejection sampling and reports its true process entropy, not the naive alphabet figure. |
| **The Crypto Bench** | Encoding, hashing and encryption applied to the same string, with real Web Crypto: SHA-256 and the avalanche effect, PBKDF2 timed on your own device at 1k/100k/600k iterations, AES-256-GCM, then a Caesar cipher broken by letter-frequency analysis. |
| **The Injection Range** | Write a payload and serve it to two simulated agents — one built naively, one with framing, an enforced allowlist and no reachable credential. Includes a paraphrased preset that scores zero on the detector and still works on the undefended agent, which is the whole lesson. |
| **The Agent Loop Builder** | Assemble a loop from stages and run it against three tasks of increasing consequence. A loop with no observation, no bound, or no checkpoint before an irreversible action fails visibly and says why. |
| **The Field Scanner** | The phone camera pointed at a QR code, with the destination pulled apart before anybody follows it — the registrable domain, punycode, brand-in-subdomain, shorteners, credential-bearing userinfo, and the rest, each scored with the reason shown. |

### The camera

Front and rear on iPhone and Android, with the platform quirks handled:
`playsinline` so iOS does not go fullscreen, a facing mode that survives a
flip, torch control where the hardware exposes it, and permission failures
explained in words rather than swallowed.

On top of the feed: a frame-difference presence detector (on a 64-pixel-wide
copy — enough to notice somebody walk up, far too coarse to identify anyone),
ambient light measurement, still capture, and QR/barcode decoding via
`BarcodeDetector` where the platform has it. **No frame leaves the device**,
and none is stored.

The presence detector is what lets the receptionist greet a visitor who walks
up to the console, which is the one piece of theatre in here that is doing
real work.

### The live picture

Six public, keyless, CORS-reachable sources, polled on their own cadences and
plotted on the globe:

| Feed | Source |
| --- | --- |
| Seismic | USGS Earthquake Hazards Program |
| Air traffic | adsb.lol community ADS-B network, centred on your location if you grant it |
| Launches | The Space Devs, Launch Library 2 |
| Orbital | wheretheiss.at, plus a projected ISS ground track |
| Space weather | NOAA Space Weather Prediction Center planetary K-index |
| Vulnerabilities | FIRST.org EPSS exploitation probabilities |

Every source degrades in the same three steps and **says which one it is in**:
`LIVE` from the network, `CACHED` from the last good response in local
storage, `SIM` from a clearly-labelled synthetic feed. A console that quietly
showed you yesterday's earthquakes would be worse than one that admits it is
offline.

This is situational awareness for a training console, not an operational
picture. Public feeds lag, drop and disagree.

### The swarm

Six specialists over one task graph, in
[`js/swarm.js`](../public/nexus/js/swarm.js): a planner decomposes the goal,
independent tasks fan out in parallel, a writer folds the results together and
a critic reviews before release. The specialists do real work — the Scholar
queries the syllabus index, the Watcher reads the live feeds, the Red Team runs
the URL, injection and password analysers.

Each agent's tool list is **enforced before dispatch**, not described in a
prompt. That is the point of the exhibit, and the unit tests assert it: an
agent handed a tool outside its allowlist refuses and the refusal appears in
the trace.

### Progress

XP, a six-rung clearance ladder, a daily streak and twelve citations, all in
local storage. Exportable and importable as JSON, erasable in one click.
There is no account and nothing is uploaded.

---

## Offline, and on a phone

The service worker precaches the shell and serves it cache-first, so after one
visit the syllabus, the ranges, the grading and the hologram all work with the
signal off. Live feeds are deliberately not cached by the worker — the feed
layer owns that, with its own honest `CACHED` badge.

Install it: on Android or desktop Chrome the **⤓** button appears in the top
bar; on iOS use Share → Add to Home Screen. It runs standalone, respects the
safe-area insets, and the layout switches to a bottom sheet and a tab bar
below 900 px.

---

## Design notes

**Why no framework.** The console has to work from a static host with no build
step, stay small enough to precache, and survive being opened on a five-year-
old phone. Fourteen ES modules and one CSS file do that; a bundle would not
have made it better.

**Why the hologram is a point cloud.** A mesh would need a model file, a
loader, a material system and a light rig. A point cloud sampled from a
parametric profile needs none of those, reads correctly from every angle,
looks like a projection rather than a character, and can be modulated
per-vertex by the receptionist's voice in the vertex shader.

**Why the local brain is the default.** An education tool that stops teaching
when the network drops, or that requires a key before it says anything, is not
much of an education tool. The model is an upgrade, not the product.

**Why the security material is defensive.** Everything here teaches
recognition and prevention: how attacks start, what stops them, what to check.
The ranges simulate attacks against fictional targets and produce no tooling
that works against a real system.

---

## Known limits

- **Speech recognition** is absent in Firefox and some in-app browsers. The
  typed path is complete, and the console says so instead of failing silently.
- **`BarcodeDetector`** is absent on desktop Safari and Firefox; the scanner
  falls back to a paste-a-link field with the same analysis.
- **Feed reachability** varies. adsb.lol and Launch Library 2 rate-limit
  anonymous callers, so `CACHED` and `SIM` are normal states, not bugs.
- **Coastlines on the globe are stylised**, hand-encoded outlines — enough to
  read "Earth" at command-centre scale. Anything needing real geometry belongs
  on the Cesium globe in the main app.
- **URL analysis reads structure only.** It never fetches the page, and a
  compromised legitimate site scores zero. The console says this on screen
  every time it shows a score.
