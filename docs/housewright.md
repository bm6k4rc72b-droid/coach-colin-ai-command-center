# HOUSEWRIGHT

A property survey, floor plan, massing model and renovation analysis that runs
entirely in a browser tab, on a phone, a tablet or a laptop, with no account,
no upload and no network call.

Live at `/housewright/` alongside the other apps in `public/`.

```
npm run dev            # then open http://localhost:5173/housewright/
npm run test:housewright
npm run qa:housewright
```

## What it does

You walk a property with a phone. You hold it at a stated height, aim the
reticle where a wall meets the floor, and hold a fingertip still in the frame
for a second. Each dwell drops a corner. Four corners make a room; the rooms
make a plan, a 3D massing model, and a ranked list of what is actually worth
spending money on.

Five screens: **Setup** (the property and its market), **Walk** (the
viewfinder), **Plan** (a dimensioned blueprint), **3D** (an orbitable massing
model), **Report** (the improvement analysis).

## How the measurement works

A phone knows which way it is facing and roughly how high it is being held.
That is enough, because a ray leaving a known height at a known depression
angle meets the floor at exactly one place:

```
distance = height / tan(depression)
```

`pose.floorHit()` is that identity plus the guards around it. Three properties
of the technique bound its accuracy, and the app states all three rather than
hiding them:

**Height is the whole ball game.** Distance scales linearly with the stated
hold height, so a 3% error there is a 3% error in every measurement. The
Setup screen has a calibration: shoot the floor at something you can measure,
enter both numbers, and `pose.calibrate()` corrects the height by the ratio.

**Indoor compass is a liar.** Steel studs, appliances, underfloor heating and
the fridge all drag magnetic north around by tens of degrees. So the survey
never uses absolute heading. The first shot of a room defines its datum and
every later shot is expressed relative to it (`pose.relativeHeading`), which
makes the drift cancel. The plan is oriented afterwards, by hand.

**Grazing shots are noise amplifiers.** Near the horizon `tan` runs away, so a
corner aimed 2° below level is unusable. The reticle grades every shot on
*relative* error — what one degree of hand-shake costs as a share of the
distance being measured, which is `2·rad/sin(2θ)`. That figure is remarkably
flat at 3.5–5% per degree across the useful window, bottoming out at 45° and
climbing steeply outside roughly 22°–68° of depression. Inside that window the
reticle is green; outside it, red, and `floorHit` returns `null` rather than a
confident number.

In practice: stand *in* the room and shoot its corners, rather than shooting a
far wall from the doorway. At a 1.45 m hold height the good window runs from
about 0.6 m to 3.6 m, which covers the corners of a normal room from the
middle of it.

### Two fallbacks, so it runs on anything

A laptop has a camera and no orientation sensors at all. The app detects that
(`Orientation.ready` only goes true after a second real reading, so a silent
stream of zeroes is not mistaken for a phone lying flat) and switches modes.

- **Trace** — photograph a wall square on, tap its two ends, and give one known
  dimension to set the scale. Assumes the reference and the measured span are
  the same distance from the lens and square to it: true for a wall shot
  head-on, wrong for a receding one.
- **Type** — dictate the room as wall runs, each a length and a turn. The loop
  closes itself. This is also the fastest path when you already have a tape.

All three modes produce the same room record, so the plan, the model and the
report do not care which was used.

## The fingertip tracker

On a job walk one hand holds the phone and the other is holding a torch, a
tape, or a door. There is no spare thumb for a capture button, and tapping the
screen nudges the phone at the exact moment its orientation is being read. So
the app watches for a finger instead: hold one still over the corner for a
second and the shot is taken. Nothing is touched, so nothing moves.

The pipeline is classical — no model, no weights, no network:

1. Downscale to a 48×64 YCbCr grid.
2. Mark pixels whose chroma sits in the skin locus. The test is chroma-only
   with a wide luma gate, because skin is well behaved in Cb/Cr across every
   skin tone and it is luma that varies — between people, and between a lit
   hand and a shaded one.
3. Mark pixels that changed since the last frame.
4. Label the connected components of the *skin* mask, and accept the largest
   one that either contains motion or lies inside the lock already held.
5. The fingertip is the point of that component furthest from the frame edge
   the arm crosses.

Step 4 is where the design earns its keep, and it took two attempts to get
right. Requiring motion **per cell** fails twice over: a dwelling finger stops
moving at exactly the moment the gesture needs it, and a finger creeping in
slowly only registers motion at its leading and trailing edges, so the mask
keeps a rim and throws the hand away. Requiring no motion at all is worse —
a pine door, a terracotta floor and unpainted plaster are all squarely inside
the skin locus, and the tracker would sit on the wall forever. Qualifying a
whole *component* by whether it contains motion anywhere gets both: a hand
keeps its identity whether it is moving, holding, or creeping, and a static
wall never acquires one. Both cases are regression-tested.

### Where it fails, stated plainly

- Gloves in a colour outside the skin locus are invisible to it.
- A wall genuinely the colour of skin, filling the frame, is rejected as a
  covered lens rather than tracked — which is the safe failure, but it does
  mean the gesture is unavailable in that room.
- Covering the lens does nothing, by design: any blob over 55% of the frame is
  refused.

Which is why every gesture has a button behind it. The finger is the fast path,
never the only one.

## What the camera reads about a room

`finish.js` measures what a photograph can honestly support — mean luminance,
contrast, the red-to-blue ratio, clipped highlights, crushed shadows, edge
density — and emits *signals* with confidences and plain-English evidence,
never verdicts. "Reads dark on camera (91%) — mean brightness 16%, with 4% of
the frame crushed to black" is a fact about the frame plus an inference the
reader can check. It is not a claim about a specific material, and the report
treats it as one input among the measured geometry rather than as truth.

## The improvement analysis

`report.js` holds a catalogue of 22 interventions, each with a relevance test
that reads the measured geometry and the camera signals, a cost band, a recoup
band, a build phase and a "watch out" note. Costs are planning-grade bands from
published national remodelling cost-and-recoup ranges, scaled by the measured
areas and the local price per square foot.

The engine rests on one idea most renovation advice ignores: **a block has a
ceiling.** Spend enough and any house can be made beautiful, but the market
will only pay up to roughly what the best house on the street is worth. So the
report computes headroom — the gap between what the property is worth now and
what the neighbourhood will bear — and rations uplift against it, best-returning
work first.

That rationing decays rather than falling off a cliff, because that is how
markets behave: the second bathroom is worth less than the first, not worth
nothing. Each item realises its raw uplift scaled by the headroom still
unspent, so the total approaches the ceiling asymptotically and never crosses
it. There is a test that asserts exactly that, and it caught a real bug —
rounding each figure to a presentable band let their sum drift a few hundred
dollars past the ceiling, so the printed figure is now clamped against what is
left, not merely derived from it.

The consequence is a report that says no. A property already at its street
ceiling is told, in those words, that the work returns nothing and is a
lifestyle spend. A full kitchen rebuild ranks below staging and a garage door.
That is the useful part.

Work is grouped into five phases — structure, systems, surfaces, light,
presentation — and printed in build order, because doing surfaces before
systems is how renovation money is burned.

### What it is not

Planning-grade estimates for deciding what to look at first. Not an appraisal,
not a bid, not a guarantee of value. The caveat is on the screen, in the text
export, and on the SVG plan.

## A single file, when you need one

`npm run bundle:housewright` flattens the ten modules, the stylesheet and the
markup into one self-contained HTML file you can email, drop on any host, or
open from a USB stick. `--body-only` omits the document wrapper for hosts that
supply their own.

The transform is deliberately dumb — strip the relative imports, concatenate in
dependency order, emit a namespace object per module — and it is safe only
because two properties are *checked* rather than assumed: every import is a
relative sibling, and no two modules declare the same top-level name. A
violation of either fails the build with the offending identifier and both
files, rather than producing a bundle that is subtly wrong.

## Exporting

The plan, the report and the raw survey all export. Where the app is served
normally that is a plain download. Where it is embedded in a viewer that does
not let a frame start its own download, `ledger.download()` asks the host to
mediate the save instead, and reports honestly when the viewer declines. A
button that silently does nothing is worse than one that says it was refused.

## Privacy

A job walk happens in a house with someone else's name on the deed, often
before anything is signed. So there is no server: surveys live in
`localStorage` and leave only when you export them. Exports carry the geometry
and the market figures — never frames, so a survey can be mailed to a builder
without mailing photographs of someone's home. Leaving the Walk screen releases
the camera, so the indicator light goes out while you read the report.

## Layout

```
public/housewright/
  index.html          five panels in one document
  styles.css          dark, high-contrast, thumb-reachable
  js/mathkit.js       scalars, units, money rounding
  js/pose.js          orientation -> pointing ray -> floor coordinate
  js/hand.js          fingertip tracking and the dwell state machine
  js/plan.js          polygon geometry, squaring, openings, SVG blueprint
  js/massing.js       extrusion, projection, painter's-algorithm render
  js/finish.js        frame statistics and room signals
  js/report.js        the intervention catalogue and the ROI engine
  js/ledger.js        localStorage persistence and export
  js/camera.js        getUserMedia and DeviceOrientation, across three platforms
  js/app.js           orchestration
tests/housewright/    57 unit tests, no DOM required
scripts/qa-housewright.mjs   headless Chromium against a synthetic camera
```

## Testing

`npm run test:housewright` runs 57 unit tests over the pure modules — the
trigonometry is checked against hand-derived values rather than snapshots,
because a survey app tested only against its own past output is not tested.

`npm run qa:housewright` drives the real app in headless Chromium against a
synthetic camera feed and synthetic orientation events, and checks 21 things
that only exist once a browser is involved: the camera opens, the aim solves to
the right distance, the fingertip is tracked and dwells to a commit *without a
tap*, the plan renders as dimensioned SVG, the massing canvas paints, the
report builds with its caveat, and the phone layout does not overflow.

The QA fixture is worth a note, because getting it wrong is instructive. Its
first wall colour was a warm brown that landed inside the skin locus, so the
tracker saw a hand covering the whole lens and correctly refused it — the
fixture was wrong, not the code. It is now a cool painted wall, with a finger
that reaches in, dwells and withdraws on a loop, because acquisition needs
motion and a finger that arrives before the camera opens and never moves again
is, by design, invisible.
