# QB IQ — quarterback performance intelligence

A console for the two halves of playing quarterback that are usually discussed
without numbers: what the body does during the throw, and what the mind does
before it. It lives at [`apps/qb-iq/`](../apps/qb-iq) and is served at `/qb-iq/`.

The audience is a room — a position coach, a biomechanist, a performance
scientist, an agent — and the design brief was that nothing on screen should
survive a knowledgeable person asking "what is that, exactly, and why should I
care". Every figure in the app is looked up in a metric dictionary before it is
rendered, and arrives carrying its unit, how it is measured, why a staff would
raise it, and the published range it sits in.

---

## What it measures

### Biomechanics

The throw is taken apart at the events that define it rather than sliced by
time. Eight phases from stance to follow-through, with front-foot plant as the
origin every downstream timing is measured from; joint angles read at the
instant each one means something (peak external rotation, foot plant, ball
release); the five-segment kinetic chain with peak angular velocity and the
millisecond each segment reaches it; release height, arm slot and release-point
scatter; ball speed, spin rate, spiral efficiency and wobble; drop time split by
play type; and lead/trail ground-reaction force.

Two details in here are the ones a biomechanist checks first.

**Sequencing is scored with a tolerance.** Segments are ordered anatomically —
pelvis, trunk, shoulder internal rotation, elbow extension, wrist. In high-effort
throwing the two distal peaks are genuinely near-simultaneous, and peak elbow
extension velocity can lead peak shoulder internal rotation by a few
milliseconds on a perfectly healthy rep. A distal pair inside a 12 ms tolerance
is therefore scored as compliant rather than as a violation, and the tolerance is
a parameter of the rule, not a constant buried inside it.

**Wobble is not an independent draw.** It is the geometric complement of spiral
efficiency: the share of angular momentum that is not about the ball's long axis
is the cone the nose traces in flight. The two are plotted against each other for
exactly that reason.

### Cognition

Read speed timed to its own event at every stage: huddle break to first
fixation, snap to a committed coverage declaration, dwell per progression stop,
and the reaction-time core — read complete to the first frame of the throwing
motion, isolated from footwork and from arm speed.

Alongside it: a live-variable count per rep (protection identification, hot
conversions, sight adjustments, alerts, tempo checks) plotted against what those
calls returned; anticipatory throw rate, timed from release against the
receiver's break; gaze dwell on the primary read and whether the eyes moved a
deep safety; and a full clean-versus-pressure table.

Coverage identification is never shown without its accuracy. A quick declaration
that is wrong is worse than a slow one that is right, so the pair is the metric.

### The OODA loop

Observe, orient, decide and act are mapped onto snap-to-throw as four spans that
**partition the release clock exactly** — the app asserts this on every rep. That
exactness is what makes the decomposition useful: two quarterbacks at 2.6 seconds
can be a slow-orient problem and a slow-act problem, and those are opposite
coaching weeks.

There is a loop-speed gauge scaled to the athlete's own season range rather than
a league one, a season trendline that carries its least-squares fit *and its
r²*, and a structured-versus-off-structure comparison. Loop stability — the
structured median expressed against the off-structure median — is where the
module earns its place: everyone is fast on schedule.

### Stress performance and training

Four documented practices, each held to the standard that it has to produce a
number:

- **Paced breathing** measured with a chest strap: RMSSD before against RMSSD
  during, a duration/effect scatter, and post-protocol decision accuracy shown
  *against a matched control block*. The autonomic effect is large and reliable;
  the decision-accuracy effect is small and noisy, and the app shows it that way.
- **Graded exposure**, scored by a composure index built from four measured
  pressured-minus-clean deltas — on-target rate, decision latency, release
  scatter and loop time — each mapped onto 0–100 across a range printed on the
  panel rather than hidden inside the index.
- **Rapid-exposure recognition drilling**, scored on correct-trial response time
  and accuracy, with a transfer check that plots weekly drill response time
  against the same week's on-field observe span and reports the r² of the fit.
- **Situational decision quality**, from a rule engine whose rules are printed
  next to the score. Every rep can be expanded into the rules that produced it,
  and the score can be reconstructed by adding them to a base of 70.

### Game report

Auto-generated per game: headline metrics against the rest of the season, a
cognitive-load summary, the OODA partition, an isolated under-duress block,
fatigue markers, situational scores, a findings list, and a full rep ledger.
The findings are written by rules that read the numbers shown above them; each
one names the two figures it compared and the sample it compared them on, and no
finding is written that cannot name a number. It prints to letter paper as a
black-on-white scouting report.

### Development

Season and career trendlines for every core metric, a season-by-season table on
one athlete, comparison against pooled archetype composites, and a one-page card
of six figures for the ten minutes at the start of a meeting where nobody is
going to open a dashboard.

---

## The three rules the app is built on

**1. Every number is compared with the athlete, not with a table.**

There is no population norm anywhere in the flag engine. A quarterback whose lead
leg has always braked at 1.85 ×BW is not injured because a textbook says 2.1, and
one who has always thrown from a 52° slot has not "lost his arm slot" because the
average professional throws from 58°. A recent window is scored against the same
athlete's earlier reps using a median and a scaled median absolute deviation, so
a handful of off-platform throws cannot quietly redefine what normal is. A metric
needs forty baseline reps before it can be flagged at all, fifteen in the recent
window before it is compared, and a robust z beyond 1.8 in the direction that is
actually bad for that metric.

**2. A rep that cannot answer a question is excluded, never defaulted.**

A sack has no release point, no ball flight and no loop time, so those fields are
`null` rather than fabricated, and the rep is absent from release scatter and
velocity while remaining present in the outcome and EPA views where it belongs. A
throwaway has mechanics but is kept out of the accuracy denominator, because
charting convention keeps it there and counting it as an inaccurate throw would
score ball protection as a miss. Where a sample is too thin, the app prints the
sample size and says "thin" rather than printing the number as if it meant
something.

**3. Every figure carries its definition.**

`StatTile` takes a metric id, not a label and a unit. The definition, the unit,
the direction and the published reference range come from
[`src/domain/metrics.ts`](../apps/qb-iq/src/domain/metrics.ts) and cannot drift
apart from the figure they describe. The "i" beside any label opens it.

---

## Swapping the model for real sensors

The demo runs on a seeded synthetic season so every module is populated on first
load. The seam that makes it replaceable is real, not aspirational:

- **[`src/domain/types.ts`](../apps/qb-iq/src/domain/types.ts)** — the record
  model. One `ThrowRecord` is one dropback, with every field unit-tagged in its
  own name (`...Deg`, `...Ms`, `...In`, `...Mph`, `...DegPerSec`, `...Bw`),
  because a number with an implied unit is how a lab gets a wrong answer.
- **[`src/data/source.ts`](../apps/qb-iq/src/data/source.ts)** — the
  `QbIqDataSource` interface. Every chart, score and flag in the app talks to
  this and nothing else. It is asynchronous even though the mock resolves
  immediately, because a real source is a network call and building against a
  synchronous one is how an app ends up needing a rewrite to accept it. A source
  also declares whether it is `synthetic` or `live`, and the header says so.
- **[`src/data/adapters/`](../apps/qb-iq/src/data/adapters)** — the vendor
  adapter. `VendorThrowPayload` is the SI-unit shape optical-tracking and
  markerless-mocap vendors converge on; `adaptVendorThrow` converts it, derives
  the fields the vendor does not send, and **refuses bad records rather than
  passing through a plausible-looking one**. It returns either a record or a list
  of reasons, so an ingest pipeline can quarantine a rep and say why: a capture
  rate below 100 Hz cannot resolve a peak angular velocity, a release that
  precedes front-foot plant is a solve error, and a spiral efficiency of 92.8
  sent where a 0–1 fraction was expected is caught rather than rendered as
  9280%.

Conversions live in exactly one place,
[`units.ts`](../apps/qb-iq/src/data/adapters/units.ts), and are covered by tests,
because a silent factor-of-π error in a joint velocity is the kind of bug that
survives a demo and ruins a deployment.

---

## The synthetic data

It is a model, not a random-number spray. Every rep is built from a few latent
variables — throw effort, in-game fatigue, season-long familiarity with the
install, whether the pocket held — and each observable is a function of those.
Velocity tracks effort, spin follows velocity, wobble is the complement of
spiral, the chain sequences proximal-to-distal and degrades on the same reps
where the pocket collapses, decision latency lengthens under pressure and
shortens across the season, and the accuracy split between clean and pressured
pockets lands where charted football says it lands.

One storyline is planted deliberately so the injury-risk module has something
true to find. From week 13 the lead leg stops braking as hard, the trunk starts
leaning further to get over the ball, and elbow varus torque climbs while
velocity stays flat — a recognisable compensation pattern. The flag engine has to
discover it from the athlete's own earlier weeks, and the test suite asserts both
that it finds it in 2026 and that it does *not* find it in 2025, so the flag
cannot be an artefact of the detector.

The generator is seeded, so the numbers are identical on every load and in every
test run. A dashboard whose headline figure changes when you refresh is not a
dashboard.

---

## Design

Dark, high-contrast, sized for a room rather than a laptop. One accent — electric
blue — marks the live thing and nothing else; status colours are reserved for
state and always ship with a label beside them, so a colour on screen never means
two things. Numerals are monospaced and tabular so columns align; labels are a
quiet sans.

The chart layer follows one set of rules, enforced in
[`components/charts.tsx`](../apps/qb-iq/src/components/charts.tsx) rather than
per chart: thin marks, recessive grid and axes, text on the ink tokens rather
than the series colour, a hover tooltip on every plotted form, a legend whenever
there is more than one series, and **no second y-axis anywhere** — two measures
on different scales get two charts. The categorical ramp is validated for the
`#0f1318` chart surface: every adjacent pair clears the colour-vision separation
floor and every mark clears 3:1 contrast against that surface. Scatter and
small-multiple forms use the first three slots only, which is the subset that
validates across all pairs rather than adjacent ones.

Chart form follows the question. Where every value sits far from zero — ball
speed by throw depth, loop time by situation — bars from a zero baseline would
draw a row of near-identical rectangles and hide the comparison, so those become
a dot plot and a signed-delta chart respectively.

Print redefines the theme tokens rather than chasing individual classes, so one
block flips the whole console to black-on-white without any component knowing it
happened.

---

## Running it

```bash
npm run qbiq:install   # once
npm run qbiq:dev       # http://localhost:5180/
npm run qbiq:build     # compiles into public/qb-iq/
```

`./start.sh` builds it automatically on first run and serves it at
`http://localhost:4173/qb-iq/` alongside everything else in `public/`.

## Tests

```bash
npm run test:qbiq   # 162 unit tests
npm run qa:qbiq     # 32 end-to-end checks in Chromium (add --shots for screenshots)
```

The unit tests cover the statistics (including that the median resists an outlier
the mean does not, and that MAD barely stirs where the standard deviation
explodes), every unit conversion, the vendor adapter's conversions *and* its
refusals, the sequencing tolerance in both directions, the aggregation rules
about which reps count toward which metric, the flag engine's thresholds and
direction test, the composure index at both ends, the situational rule engine
rule by rule, and a block of plausibility assertions on the generated season —
deliberately wide, so they do not pin the model to today's constants but do catch
a change that makes the demo data indefensible.

The end-to-end checks build the app, serve the real bundle, and drive it in
Chromium: every module is opened and asserted to have drawn charts and resolved
its figures, the definition popovers are opened and read, the season, game and
capture-quality filters are exercised, the print view is checked for hidden
navigation, and the console is watched for errors throughout.

## Known limits

- There is no service worker. The other apps in this repo cache a hand-listed
  shell; QB IQ ships hashed bundles, and a stale-bundle risk during a live demo
  is a worse trade than the offline capability is worth.
- The expected-points model in the generator is deliberately simple — enough to
  move in the right direction and the right rough magnitude, and clearly not a
  substitute for a fitted league model. A live deployment replaces it with
  whatever EPA the club already trusts.
- Archetype composites are pooled and de-identified by construction. No named
  athlete's proprietary tracking data is used anywhere in the app, and the
  comparison view says so on the panel.
