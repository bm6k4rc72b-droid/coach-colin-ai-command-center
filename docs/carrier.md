# Carrier — vertical briefings, rendered from a script

A bench for producing the kind of vertical explainer reel that circulates in
security content: a headline, an animated technical diagram, three numbers, and
a narrator's caption typing itself out at the bottom. You write the script;
Carrier renders the frames and records the video.

It lives at [`public/carrier/`](../public/carrier) and has no backend, no build
step and no keys. Locally it is `/carrier/` under `./start.sh`.

---

## The one design decision everything follows from

A reel is never seen on a bare 1080×1920 rectangle. It is seen inside a host
app that draws its own furniture over the top of it — a back button, a "Reels"
tab and a friends row across the top ~300 px, and the account handle, caption,
follow button and action rail across the bottom ~470 px.

So Carrier lays out **from the bottom up, against those bands**, not from the
top down against the canvas:

```
0                          ← host header: nothing readable is drawn here
300   kicker               ← // 06 · WIRELESS HARDENING
340   headline             ← wraps to as many lines as it needs
      panel                ← takes whatever height is left
      stat strip           ← up to three label/value cells
      scene progress       ← above the card, so it is inside the visible area
1150  caption card         ← anchored above the host's own furniture
1450                       ← host footer: handle, caption, buttons
1920
```

`layoutFrame()` in [`js/chrome.js`](../public/carrier/js/chrome.js) computes
this, and the headless check in `scripts/qa-carrier.mjs` asserts it on pixels:
the header band must come back under 2% ink, and the headline band must not.
That is the assertion the whole engine exists to keep passing.

Safe-area guides are drawn over the preview in the editor and are never
recorded.

---

## The script format

A script is plain data. Everything the renderer draws is a function of it and a
timestamp — which is what lets the preview, the exporter and CI agree on what
frame 213 looks like.

```js
{
  id: 'wifi-csi',
  handle: 'nightowl_sec.sh',
  speaker: 'NIGHTOWL',            // drawn as `>_ NIGHTOWL` on the caption card
  theme: 'nightowl',              // or 'daywatch'
  size: { w: 1080, h: 1920 },
  safeArea: { top: 300, bottom: 470 },
  avatarSlot: 'avatar',
  scenes: [{
    id: 'harden',
    kicker: '06 · wireless hardening',
    title: 'Contain Your [RF Boundary]',
    seconds: 10,
    caption: 'Sensing needs signal. Turn transmit power down…',
    stats: [{ label: 'default install', value: '+20 dBm', tone: 'alert' }],
    panel: { type: 'heatmap', spanM: 46, facadeY: 0.62 },
    source: 'Illustrative model — verify with a site survey',
    claim: false,                 // true means "this asserts something"
    note: 'Editor-only note, never drawn.',
  }],
}
```

**Title markup.** `[phrase]` is the accent colour, `!phrase!` the alert colour,
`{phrase}` the confirmation colour. An unmatched delimiter stays a literal
character rather than swallowing the rest of the line.

**Stat tones.** `accent`, `alert`, `good`, `warn`, `dim`. Three stats maximum —
a fourth is dropped rather than drawn off the edge.

**Timing.** A scene without `seconds` is given a duration long enough to read
its caption. Cuts are 0.34 s dissolves taken out of the incoming scene's own
time, so adding a cut never lengthens the episode.

---

## The panels

| `type` | What it draws |
| --- | --- |
| `heatmap` | Two floors side by side — leaking and contained — over a free-space path-loss field with a facade attenuation term. Prints the strongest reading at the kerb on both, and marks the noise floor on the scale. |
| `floorplan` | Rooms with occupancy counts, a guard walking a timed patrol between checkpoints, and a receiver parked on the street. |
| `sniffer` | A passive capture table: SSID, BSSID, channel, RSSI, and an animated per-subcarrier channel response. |
| `pose` | A reconstruction in either of its two honest forms — `blob` (per-joint confidence maps, what the model emits) or `skeleton` (the keypoint fit, what gets posted) — or `both`, side by side. |
| `media` | A slot for real footage. Empty, it draws itself as a labelled empty slot rather than a hole. |
| `grid` | Splits its box and draws other panels inside it. Nests up to three deep. |

Panels are registered in [`js/panels/index.js`](../public/carrier/js/panels/index.js);
adding one is a file and a line, and the script format, editor, exporter and
tests pick it up without changes.

### On the heatmap's numbers

The field is `Tx − 40.05 dB − 20·log₁₀(d) − attenuation`, which is free-space
path loss at 2.4 GHz plus a flat facade term. The *shape* is right — power falls
with the square of distance, attenuation subtracts — and the deltas are
meaningful. The absolute values are not a propagation simulation, and every
frame that uses the panel says so in its footer. Verify a real building with a
real site survey.

---

## The checks deck

Two questions, asked of every scene:

1. **Will the caption finish before the cut?** Narration lands at roughly 2.6
   words a second. A caption that needs more time than its scene has is a
   caption nobody read.
2. **Does every claim name a source?** A scene marked `claim: true` with no
   `source` is a warning. Citations are drawn on the panel itself, shrunk to fit
   and — on a two-up grid — moved to their own row rather than dropped.

Unknown panel types and duplicate scene ids are errors. The shipped episode
passes with nothing outstanding, and a unit test keeps it that way.

---

## Media

Files are read into the tab as object URLs, decoded, and drawn straight to the
canvas. Nothing is uploaded and nothing survives the tab closing — the footage
people cut into a security briefing is often of their own premises, and the
safest place for it is the machine it is already on.

Video slots are **seeked, not played**. The renderer is a function of a
timestamp; a `<video>` running at its own rate would be a second clock, and it
would drift most visibly during an export. Clips shorter than their scene loop.

---

## Export

Recording runs in real time from a `captureStream` on the preview canvas: a
60-second episode takes 60 seconds, and the tab has to stay in front — a
backgrounded tab is throttled to about one frame a second and would record a
slideshow.

That constraint is deliberate. The alternative — pushing frames as fast as they
render — produces a file whose playback speed depends on how fast the machine
is, which is a bug that only appears on somebody else's laptop.

Container is negotiated: MP4/H.264 where the browser offers it (Safari, and
Chromium builds with the encoder), WebM/VP9 otherwise. "Save this frame" writes
a PNG of the current frame with the guides off.

---

## The shipped episode

*Your walls are not opaque to your Wi-Fi* — seven scenes, 60 seconds. It is
written to be the accurate version of a story that circulates in a badly
overclaimed form, and three corrections carry their own scenes:

- **The famous through-wall skeleton footage is not Wi-Fi.** It is MIT CSAIL's
  RF-Pose (Zhao et al., CVPR 2018), which used a purpose-built FMCW radio at
  5.4–7.2 GHz. Attributing it to a five-dollar board is the most common error in
  this genre.
- **The real Wi-Fi result is DensePose from WiFi** (Geng, Huang and De la Torre,
  CMU, 2022): three commodity routers transmitting, three receiving, a network
  trained against camera footage, producing a UV surface map. Ordinary hardware,
  genuine result.
- **What it yields is occupancy, posture and timing** — not identity, not faces,
  and not the contents of anything encrypted. CSI is a physical-layer artefact;
  capturing it neither requires nor provides the network key.

The fifth scene is about where the demos break down: these models are trained in
the room they are tested in, and the papers report the drop themselves. The last
two are the payload — transmit power, access-point placement and facade
attenuation, then a one-line instruction to walk your own kerb with a scanner
and write down the strongest reading.

There is no capture code anywhere in this app, and every number in the panels is
synthetic.

---

## Tests

```sh
npm run test:carrier   # 49 unit tests, no browser or network needed
npm run qa:carrier     # drives the real app in Chromium end to end
```

The unit suite covers the script format, the clock, the panel arithmetic (the
containment delta, the patrol loop, the walk cycle, the determinism of the
background), and the renderer itself — against a recording canvas context, which
turns "is the headline where a viewer will see it" into an assertion about
coordinates.

The end-to-end check loads the real app, reads ink coverage per band off the
canvas, steps every scene, pastes in a short script, records it, and confirms the
browser handed back a video file with frames in it and a PNG of a frame.
