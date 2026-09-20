# The Black Optic 6 film — a cinematic site that cannot oversell the product

A scroll-driven showcase for the Black Optic 6 console: anamorphic backdrop,
parallax plates, a 3D card reveal, an operator who walks toward the lens as you
scroll, an interactive demo running the console's own code, a ballistics trainer,
and a different synthesised voice explaining each act.

It lives at [`public/black-optic-6-site/`](../public/black-optic-6-site) and has
no backend, no build step, no keys and no dependencies. Locally it is
`/black-optic-6-site/` under `./start.sh`.

---

## The one design decision everything follows from

Every feature claim on the page is **read out of the console's capability
ledger at load time**, wearing whatever state that ledger gives it.

There is no second copy of the marketing text. `catalog.js` holds *pointers* —
capability ids — and `resolve()` turns each one into the ledger's own name,
verdict and provenance badge. A row the ledger calls UNSOUND appears on the site
as UNSOUND, in the section about the thing it is adjacent to. The title card's
three numbers are computed from `tally()`, not typed. The thirteen thermal
palettes are imported from the renderer that draws them; the five satellites from
the orbital panel; the camera routes from the device and Argus modules.

The consequence is the point:

```js
// catalog.js
export function capability(id) {
  const row = BY_ID.get(id);
  if (!row) throw new Error(`no capability row: ${id}`);
  return row;
}
```

A feature cannot appear in the film unless it exists in the console. A typo
throws at load rather than rendering a confident blank card. And if somebody
later softens a verdict in the ledger, the film softens with it and
`tests/black-optic-6-site/catalog.test.mjs` says so in the diff.

Three tests enforce it directly: every cited id exists; every rendered row
carries the ledger's own state and verdict rather than a rewritten one; and
every UNSOUND row that describes a sellable feature is *named on the site*
rather than quietly dropped.

---

## The film

Eleven acts, laid out as ordinary document flow. The cinematic layer is a fixed
element behind the text, reading the same scroll position. Built the other way
round — film as document, text laid into it — the page stops working the moment
JavaScript fails, a screen reader walks it, or someone prints it.

| Act | What it covers |
| --- | --- |
| I · Arrival | Title, and the ledger's counts |
| II · Optics | Every camera route: built-in, DJI Pocket over USB, GoPro, capture card, iPhone, IP/RTSP, Argus battery and wired, cloud-only (blocked) |
| III · Thermal | All thirteen palettes as live ramps, and the three honest sources |
| IV · Orbital | Five spacecraft, four rungs of resolution ladder with prices |
| V · Aerial | Your own aircraft vs. an unidentified contact reported as angles |
| VI · Wearables | Bluetooth heart rate, HRV, Apple Watch (blocked), glasses (blocked) |
| VII · Field | Harvest, gait kinematics, geofence, acoustic watch, evidence vault |
| VIII · Marksmanship | The ballistics trainer |
| IX · Demo | The console's tracker and palettes, running in the page |
| X · Ledger | The rows that say no |
| XI · Launch | Into the console |

---

## The operator

A photographic plate of the operator, composited over the backdrop and pushed in
by your scroll position. Two plates: he stands in the command centre for most of
the film and tips his hat to camera over the last stretch.

### Why a plate and not a cutout

The obvious move is to matte him out and composite the subject alone. It does not
survive contact with the image, and the numbers say why:

| | L\* | b\* |
| --- | --- | --- |
| White hat | 63 | **−22** |
| Leather coat | 2 | −3 |
| Dark frame corner | 1 | −4 |
| Earth | 22–39 | −23 to −36 |

The plate is graded cold, so his white hat is *bluer* than most of the
background — any blue-channel key eats it. And the coat and the dark corners of
the frame are the same pixel, so no luminance threshold separates them either.
The topology that would work (the Earth's glow forms a bright ring right around
him) breaks at the bottom of frame, where the coat and the console floor merge
into one connected black region. Every matte that can be pulled from this image
either eats the hat or leaves a blue rim, and a blue rim against a dark page is
the most obvious sign of a cheap cutout there is.

### What is done instead

The plate is kept whole and given a **separable edge feather** — alpha ramps from
zero to one over the outer 10–20% of each edge, and the four ramps are multiplied
so corners darken fastest. The plate's own corners are already #000–#040a10 and
the page ground is #04060a, so it lands with no visible edge at all, and the
Earth and the console panels come with it at full photographic fidelity because
they were always part of the artwork.

An elliptical feather was tried first and is the instructive failure: an ellipse
large enough to leave the subject and the Earth at full opacity necessarily
extends past the plate's own bounds, so `rx × outer` came to 0.52 of the width,
it never reached zero at the sides, and the plate kept a visible rectangle. A
test now asserts alpha is exactly zero at all four edges and both diagonal
corners, and exactly one in the middle.

### The push-in

This is the one place the film departs from the motion model.

The earlier vector rig was sized from anatomy: a 1.83 m figure at whatever
distance the model reported, which at 60 m is a thirty-pixel silhouette and reads
perfectly, because a distant person *should* be a smudge. A photograph at thirty
pixels does not read as a distant person — it reads as a thumbnail, because the
plate carries a whole scene and the man inside it is only part of it.

So the plate is framed against the frame, the way a push-in is actually shot: it
starts at 0.62 of frame height and finishes filling it twice over, cropped by the
matte. The interpolation is linear in scroll, which is exactly the
constant-rate-of-growth property the reciprocal-distance model was chosen to
give, so the approach still reads as one continuous move rather than an ease. A
test asserts every increment is equal and positive.

What survives from the gait model is the **bob**: a small vertical oscillation at
the footfall rate, because a dolly on a walking subject is never perfectly
steady, and a plate that slides in without one reads as a sticker being scaled.

### Placement

Each act declares which side of the viewport the plate takes, as data in
`catalog.js` rather than as a formula, because it is art direction: the text
column alternates sides down the page and the plate has to take whichever side
the column is not on. The compositor blends between neighbouring acts' values
using the same presence weights that cross-dissolve the scenes, so he drifts
across during a transition instead of jumping. A test checks the rule holds
against the actual act order — reordering the film without moving him would
otherwise put a 400-pixel photograph under a paragraph. Below 720 px there is no
free side, so he centres and drops to 38% opacity, and the two centred acts get a
radial scrim behind their text.

### The fallback

`figure.js` still draws the original figure from a joint rig, and it is not dead
code: it runs for the first frames of every load, and it carries the whole film
on a connection that drops the plates or a browser that refuses them. Its gait is
driven by ground covered rather than by a timer, so scrolling back walks it
backwards through the same footfalls, and its knee gets a rectified sine biased
into swing rather than the hip's sinusoid. Those tests still run.

## The lens

[`js/anamorphic.js`](../public/black-optic-6-site/js/anamorphic.js) is a WebGL
fragment shader plus the maths it uses, separated so the maths is testable
without a GPU.

Anamorphic is not a colour grade. It is a cylindrical element squeezing a 2.39:1
field onto the negative, and every characteristic people love is a side effect of
that squeeze acting on one axis:

- **Bokeh is a vertical oval**, `ry = r`, `rx = r / 2`. Getting this backwards is
  the classic fake-anamorphic tell, so it has its own assertion.
- **Flares are horizontal streaks** — exponential falloff along, Gaussian across
  — and blue, because the coatings on classic anamorphics reflect blue hardest.
- **Vignette is elliptical**, so the corners of a wide frame hold up better than
  a round vignette would suggest.
- **Mustache distortion**: barrel in the middle, pincushion clawing the corners
  back. The test checks the extreme corner actually comes *back*, which is the
  difference between mustache and plain barrel.

The shader also runs volumetric haze, halation, a filmic toe and per-frame grain
that is stronger in the shadows. It renders at 65% resolution — invisible on a
full-screen haze field, and roughly a quarter of the fill cost, which is what
keeps it at 60 fps on a phone. If the context is refused the page falls back to a
CSS gradient and loses nothing structural.

---

## The voices

Ten guides, one per act, each with its own installed voice, pitch and rate.

**What the voice is.** The browser's own `speechSynthesis` — offline, free,
instant, works in a barn with no signal. Not a cloned celebrity, and not a
language model improvising, because a synthesised voice that improvises is a
synthesised voice that eventually says something untrue about a sensor somebody
is relying on at two in the morning.

**What it says.** Every line is composed from the capability ledger. A trustworthy
row is described; an untrustworthy one is named as such *first* — "Blocked." then
the reason — because a listener half-attending needs the verdict before the
explanation. A test walks all 88 lines and fails if any sentence contains copy
that exists nowhere in the catalogue.

Distinctness is done properly rather than by randomising pitch. `assignVoices()`
allocates preference matches first, strongest match wins, and whoever is left
takes an unused voice chosen by a stable hash — so no two guides share a voice
while spares exist, and the same guide sounds the same on every load. Too few
voices degrades to sharing; no voices at all is an ordinary case, not an error.

---

## The demo

The console's own modules, imported directly: `thermal.js` for the palettes,
gain and readout, `lock.js` for the CAMShift colour tracker. A demo that
reimplements the product eventually demonstrates something the product no longer
does.

It runs **without a camera**. There is a procedural night scene — cold ground,
vine rows, a warm engine block, a deer, a person, generated as a scalar field
rather than as a picture because that is what a thermal sensor hands you.
Granting the camera swaps the source and changes nothing else.

The source badge never lies. A palette over the synthetic scene or over your
webcam is colouring *brightness*, so the spot readout says "% of scale" and the
badge says MODELLED. It will say degrees when, and only when, a radiometric
camera is feeding it. The headless check taps the view and asserts the string
contains `% of scale` and does not contain `°C`.

---

## The range

A ballistics trainer against static steel at known distance:
[`js/range.js`](../public/black-optic-6-site/js/range.js). Pick a load, a zero
and a wind, place your hold, fire, and it tells you where the bullet went and
*why* — "low, not enough elevation for the drop" rather than "miss" — then shows
the correct hold.

It is not a targeting system. Nothing in the platform tracks a person for a
weapon, and the concept board's turret row is shown in this very section, marked
UNSOUND, rather than quietly delivered.

**On the accuracy of the solver, stated up front.** Flat-fire exponential drag:
drag taken as proportional to v², so velocity falls as v₀·e^(−kx) and time of
flight closes in one expression. Real G1 drag varies with Mach, so a single k
cannot be right everywhere. Fitted against published tables it runs within about
2 inches to 300 yards and 6 to 500 for ordinary centrefire loads, drifts to about
a foot by 600, and degrades badly past transonic — where the dope card turns its
rows amber and says so. The tests check it against published .308 175 gr figures
for velocity, time of flight and 10 mph drift.

Two details that are usually got wrong elsewhere:

- **Wind drift uses lag time**, not full time of flight: the crosswind acts on
  how much *longer* the bullet took than a vacuum round would have. The full-time
  version roughly doubles every wind call, and a test pins the difference.
- **A true MOA is 1.047 inches at 100 yards**, not one inch. The dope card is in
  mils, which is what most turrets speak, and the MOA/mil ratio of 3.438 is
  asserted.

---

## Accessibility and degradation

- One `<h1>`, real headings, real links, real tables. With JavaScript off the
  content is still a document — the catalogue-built sections are the only thing
  lost, and a skip link jumps past the film.
- `prefers-reduced-motion: reduce` removes the walk cycle, the parallax, the
  backdrop animation, the flare and smooth scrolling. The operator freezes
  mid-approach rather than disappearing, so the page still has a subject. Every
  card stays fully visible — a headless check counts them.
- No autoplaying voice, ever. Speech starts on a click.
- Nothing overflows a 390 px viewport; asserted rather than assumed.
- The HUD collapses to a hairline progress bar on a phone, where there is no room
  for it beside a heading.

---

## Tests

```
npm run test:black-optic-6-site   # 95 unit tests
npm run qa:black-optic-6-site     # 40 checks, real Chromium
```

The unit suites cover the timeline, the gait and rig, the plate feather and
push-in, the lens maths, the ballistics, the voice assignment and — the important
one — the rule that nothing reaches the page or a voice that is not in the
ledger.

The headless check proves the film: the shader draws a non-black frame, the
operator grows and his step count rises as the page scrolls, scrolling back
reproduces the same gait phase exactly, both plates decode and reach the canvas
as a photograph rather than a silhouette, the feather still reaches zero on every
edge, all thirteen palette strips are real
ramps rather than flat blocks, the demo animates with no camera granted, the
brightness readout refuses to print degrees, firing reports a cause, the guide
changes with the act, reduced motion keeps every card visible, and nothing
overflows a phone.
