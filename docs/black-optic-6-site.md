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

An original figure — long storm coat, hard shoulder and shin plates, a visor
with one horizontal light bar. Drawn from a joint rig in
[`js/operator.js`](../public/black-optic-6-site/js/operator.js) and
[`js/figure.js`](../public/black-optic-6-site/js/figure.js), not traced from
anything.

Three decisions do most of the work:

**Screen size grows linearly, not distance.** Apparent height goes as 1/d, so
walking 64 m → 2.6 m at a constant pace would sit motionless for most of the
scroll and then explode in the last tenth. The timeline interpolates *reciprocal*
distance instead, which puts the growth on screen at a constant rate — the same
trick a dolly operator uses through a push-in. A test asserts it:

```js
const steps = [0, 0.25, 0.5, 0.75, 1].map((p) => apparentHeight(distanceAt(p), 1080));
// every delta must be equal
```

**The gait is driven by ground covered, not by a timer.** Step count is distance
÷ stride length, and stride length is 0.43 × standing height, the measured adult
ratio. Scroll back and his feet walk backwards through the same footfalls; stop
scrolling and he stops mid-step, weight on one leg. The headless check confirms
the phase at 10% is bit-identical before and after a trip to 95%.

**The knee is not a sinusoid.** The hip very nearly is; the knee flexes sharply
through swing and stays near-straight through stance, so it gets a rectified sine
biased into the swing half. A test measures maximum stance flexion against
maximum swing flexion rather than trusting the formula.

He changes posture per act — console in hand, thermal monocular to the eye, two
hands on drone sticks, wrist turned in, glassing a block, low ready at the range
— and each posture scales the arm swing, because a figure carrying something does
not swing both arms.

---

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
npm run test:black-optic-6-site   # 83 unit tests
npm run qa:black-optic-6-site     # 35 checks, real Chromium
```

The unit suites cover the timeline, the gait and rig, the lens maths, the
ballistics, the voice assignment and — the important one — the rule that nothing
reaches the page or a voice that is not in the ledger.

The headless check proves the film: the shader draws a non-black frame, the
operator grows and his step count rises as the page scrolls, scrolling back
reproduces the same gait phase exactly, all thirteen palette strips are real
ramps rather than flat blocks, the demo animates with no camera granted, the
brightness readout refuses to print degrees, firing reports a cause, the guide
changes with the act, reduced motion keeps every card visible, and nothing
overflows a phone.
