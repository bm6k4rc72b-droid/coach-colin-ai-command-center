# Vice Command — a 1986 crime picture that sells three real things

A scroll-driven film wrapped around a services page. You press start, and over
eight acts a city drifts past, the police arrive, the army arrives, a saucer
detonates the skyline and a shield stops the front — while the same page shows
the apps, deploys an outreach and automation swarm, and quotes a security
detail.

It runs entirely in the browser: no build step, no framework, no video file, no
audio file, no API key, and — after the first visit — no signal. The city is
generated, the cast is drawn as vector paths, and the score is synthesised in
Web Audio while you scroll.

**Live at <https://bm6k4rc72b-droid.github.io/coach-colin-ai-command-center/vice/>.**
Locally it is `/vice/` (`http://localhost:4173/vice/` under `./start.sh`).

---

## The brief, and what it turned into

The request named a set of beats and three scroll positions they had to happen
at. Those positions are the spec, and they are the thing most of the testing
exists to protect.

| Asked for | What it is |
| --- | --- |
| A Vice City that parallax-scrolls the whole way down | **Yes.** Four bands of generated towers, a bay, a causeway and palms, each moving at its own depth. Not a photograph — a seeded generator, a few kilobytes, and it never reaches an edge. |
| A man walking the strip | **Yes**, through the opening two acts, with a walk cycle described as angles rather than drawn as frames. |
| Reveal-on-scroll and a 3D horizontal showcase | **Yes.** Reveals are driven by a custom property so they run *backwards* on the way up; the showcase is eleven cards on a real perspective rack you can scroll, drag, or arrow through. |
| A cop chase at 25% — five felony stars, armoured Chargers, a white Rolls with red rims, black enforcer bumper, wide splitter, side skirts, huge rear diffuser | **Yes**, all of it, and the stars climb one at a time and go back out if you scroll up. |
| The army in choppers and tanks at 50% | **Yes.** Three gunships with searchlights and two tanks on the causeway. |
| A gold truck and a UFO with a Grok sticker detonating the city at 75%, with the hero shielded and alive | **Yes**, with one change — see *The fiction* below. |
| "Push It to the Limit" and "La Chona" | **No, and it cannot be.** See *The score*. |
| AI agents for outreach and automation across every social channel and email | **Yes**, with the arithmetic that says when the selection is more than one person can run. |
| The apps, prioritised from the screenshots | **Yes.** FireHazmat leads, then Artifact/Broker Ranch and God's Eye View, then the rest of the suite. |
| In-person and open-house security marketed | **Yes.** Six services, a live estimator, and the licensing note beside every price. |

---

## The three marks

The brief's set pieces are at a quarter, a half and three quarters of the way
down, and they stay there — on a laptop, on a phone, with a slow font, with an
image that arrives late.

Getting that right took three decisions that are easy to skip and expensive to
retrofit:

1. **One act table, in one file.** [`js/sequence.js`](../public/vice/js/sequence.js)
   maps a single number — how far the page is scrolled — to the entire state of
   the frame: which act, how bright the sky, where the cars are, how many stars
   are lit, how hard the camera is shaking, which music cue is running. The
   canvas, the HUD, the audio and the tests all read that one table, so the
   sirens cannot play while the police are off screen.

2. **Section heights are solved, not chosen.** At boot every section is
   measured at its natural height, then the whole document's scroll distance is
   set to the smallest value at which each section fits inside its act's share
   of it, and each is padded to exactly that share. Nothing is squeezed; the
   tallest section sets the scale. That is why the marks land on the same
   fractions at 1440px and at 390px.

3. **The scroll-to-act mapping is measured.** Progress is interpolated between
   the measured tops of the act sections, not computed as `scrollY / height`.
   So "the gunships arrive at 50%" is not a claim about section heights — it is
   a guarantee that they arrive when the cavalry section does.

There is also a fourth, duller one: every image carries its `width` and
`height`, so a late-loading picture cannot grow the document under a reader
mid-scroll and slide every mark down with it.

## Everything is reversible

The film holds no state. There is no "the explosion has started" flag and no
timer counting down an act — every frame is a pure function of the scroll
position, including the explosion, whose debris is closed-form ballistics
rather than an accumulating simulation.

Scrub back up and the fireball collapses, the shockwave comes back in, the
rubble flies home and the felony stars go out one at a time. Nothing on the
page can get stuck in a state you cannot get it out of, and the test suite
asserts exactly that: the frame at any position is identical whether you
reached it going down or coming back up.

---

## The fiction

The chase, the gunships, the saucer and the detonation are a parody set piece.
They are labelled as such in the page footer.

One change was made to the brief. The gold truck and the saucer are on screen
as asked, sticker and all, but no real person is named or depicted as
destroying the city. Naming a living person as the perpetrator of a mass-
casualty event on a commercial marketing site is a defamation exposure for the
business that publishes it, and the joke does not need it — the truck and the
saucer carry the gag on their own. The vehicles are drawn, not photographed,
and no logo, livery or trademark is reproduced.

## The score

The brief named two commercial recordings. Neither is here and neither can be:
publishing a copyrighted master on a public marketing site is the owner's
liability, not a technical problem.

What is here instead is original music, synthesised in the browser, written to
do the same job:

| Cue | Where | What it is |
| --- | --- | --- |
| `drift` | Arrival, brief | 84bpm, wide detuned pad, slow arpeggio. Miami at sunset. |
| `chase` | Wanted, fleet | 128bpm, sixteenth-note bass, hard chord stabs. |
| `cavalry` | Air cavalry, swarm | 132bpm, minor, brass. |
| `blast` | Detonation | A riser and a sub drop. |
| `finale` | Aftermath | 118bpm, brass, off-beat bass and upbeat hats. |

Plus a small effects bank — a two-tone siren, tyres letting go, rotor thump,
the detonation, and the shield's ring.

**If the licences are bought**, the synth stands down without touching the
page: `score.useTrack('chase', 'media/audio/chase.mp3')` plays the real thing
for that cue instead. Nothing else changes.

Audio only starts when you ask for it, from the start gate or the ♪ control.

---

## What is on the page

### The fleet (act 4)

Eleven apps on a perspective rack, in billing order:
FireHazmat, Artifact — Broker Ranch, God's Eye View, then Sentry, Nexus,
Baseline, Touchline, Carrier, Astra, Harvest Eye and Montes & Co. Scroll turns
the rack; once you drag or arrow it, scroll stops moving it, because having the
page yank a card out from under a finger is the worst thing a showcase can do.

The three with artwork get a full plate below the rack.
[`js/apps.js`](../public/vice/js/apps.js) holds the catalog, and a card whose
public URL is not known links to the contact section rather than guessing at an
App Store id.

### The swarm (act 6)

Ten agents — five outreach, five automation — across email, Instagram,
Facebook, TikTok, YouTube, LinkedIn, X, SMS, phone and reviews.

The roster is the easy half. The half that matters is
[`deploymentPlan`](../public/vice/js/agents.js), which answers three questions
about whatever you select:

- How many touches a week is that?
- How many hours of *your* time does approving them cost?
- Does any channel land above the volume at which that platform starts
  treating you as spam?

Select everything at full throttle and it refuses to call the plan ready: 3,620
touches a week, 10.9 hours of approvals against a five-hour budget, and four
channels over their line. **Find a safe throttle** bisects for the highest
setting that clears every line — about 30% — and says so.

The per-channel ceilings are the conservative numbers experienced operators
use. They are not quoted from a published API limit, because platforms do not
publish the ones that get accounts restricted. They are a caution line, not a
permission slip.

### The security desk (act 8)

Six services — open house, private event, estate post, executive protection,
ranch patrol, vacant listing watch — with a live estimator.

Two honesty rules are in the module rather than the copy, because copy gets
rewritten and modules do not:

1. **The rate card is one constant.** [`RATE_CARD`](../public/vice/js/security.js)
   is the only place a price lives, so the page cannot quote two different
   numbers. It ships indicative and is meant to be edited to the real one.
2. **An estimate says what it assumed.** Every quote prints its officers, tier,
   billed hours, uplifts — and, when the four-hour minimum raises the hours, it
   says so and says what you asked for. A client billed for four hours on a
   two-hour booking without being told does not book again.

Licensing is printed beside every price.

---

## How it is put together

```
public/vice/
  index.html          the document: eight acts, twelve sections
  styles.css          the look; reveals driven by a custom property
  js/
    sequence.js       the act table — one number in, the whole frame out
    scroll.js         reading position, the measured act map, reveals
    stage.js          one canvas, one rAF loop, no story state
    city.js           the generated skyline, bay, causeway, palms, rain
    actors.js         Tommy, the Rolls, the Chargers, gunships, armour,
                      the gold truck, the saucer, Colin and the shield
    explosion.js      the detonation, as closed-form ballistics
    hud.js            felony stars, radar, mission line, act cards
    score.js          five synthesised cues and an effects bank
    showcase.js       the 3D rack
    apps.js           the catalog
    agents.js         the roster and the deployment arithmetic
    security.js       the services and the estimator
    app.js            the wiring: layout, measurement, one loop
    mathkit.js        clamp, mix, easing, seeded random, colour ramps
  media/              five AVIFs, 291 KB the lot
```

Nothing in `sequence.js`, `scroll.js`, `apps.js`, `agents.js`, `security.js`,
`mathkit.js` or `explosion.js` touches the DOM, which is why they are tested
without a browser.

### Performance

One canvas, one `requestAnimationFrame` loop, one measurement pass per frame.
The backing store is capped at 2× device pixel ratio — beyond that is invisible
here and costs a third of the frame rate on a phone — and the loop stops
entirely when the page is hidden.

### Accessibility

- The page is readable with the film off. The canvas only ever adds.
- `prefers-reduced-motion` stops the camera shake, the rain, the grain and the
  scanline roll, and reveals resolve immediately.
- The rack is keyboard-driven with the arrow keys and announces itself.
- The blast flash peaks warm and at 78%, not white, and lasts under a twentieth
  of an act.
- Audio never starts on its own.

---

## Testing

```bash
npm run test:vice   # 77 unit tests, no browser
npm run qa:vice     # 57 end-to-end checks in a real browser
```

The unit suites cover the act table's timing and reversibility, the measured
scroll map against deliberately wrong section heights, the app catalog's links,
the agent planner's refusals, the quote arithmetic, and the drawing entry
points against degenerate input.

The end-to-end harness drives the real page at two viewport sizes and checks
the things only a browser can answer: that each act begins at the fraction the
act table promises, that the three marks land at 25/50/75 on both a laptop and
a phone, that nothing pinned is taller than the window, that the page never
scrolls sideways, that the rack lays its cards out rather than stacking them,
that the swarm console refuses an over-committed plan, that the quote on screen
matches the module, and that scrubbing back up runs the film backwards.
