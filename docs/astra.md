# ASTRA — Peptide Intelligence Platform

A research facility for peptide science, built around one idea: **every claim
carries its evidence tier, and every tier opens into its sources.** Search,
compare, verify, understand.

It lives at [`public/astra/`](../public/astra) and shares nothing with the
Cesium globe app but the repository and the dark instrument aesthetic. No build
step, no framework, no dependencies, no backend, no account. Locally it is
`/astra/` (`http://localhost:4173/astra/` under `./start.sh`); on a static host
it is `/astra/`.

```sh
npm run test:astra   # 89 unit tests, no browser needed
npm run qa:astra     # 66 end-to-end checks driving the real platform in Chromium
npm run qa:astra -- --out shot.png   # …and a screenshot
```

---

## The positioning, and why it is the product

This is deliberately **not** a platform that tells anyone what to take. It does
not diagnose, does not recommend a compound to a person, and does not produce
dosing or treatment protocols. Ask it "what should I take for my knee" and it
says so plainly, then offers to show you what has actually been studied.

That constraint is what makes everything else possible. A platform that
recommends has to defend each recommendation; a platform that teaches evidence
literacy only has to be honest, and honesty is something you can build in code
and test in CI. Almost every interesting mechanism here — the confidence meter,
the compliance guardian, the debate room — exists because the product is
education rather than advice.

Three layers, as the brief framed them:

| Layer | Decks | What it does |
| --- | --- | --- |
| **Peptide Intelligence Engine** | Engine, Map, Record | Ask anything; get an eight-section dossier with graded claims and openable sources |
| **Research Laboratory** | Decoder, Lab, Verify | Decode a paper, compare compounds, convene a review panel, simulate a study design, check a claim |
| **Marketing Command Centre** | Studio, Command | Turn one paper into thirty governed assets; propose a campaign a human approves |

---

## The evidence model

This is the part worth reading even if you never open the app, because every
number on every screen comes out of it.

### Seven tiers, each a band rather than a point

| Tier | Band | What it means |
| --- | --- | --- |
| Human RCT | 62–96% | Randomised, controlled, in people |
| Human trial | 46–78% | Non-randomised or open-label human study |
| Human observational | 30–62% | Cohort, case-control, registry, case series |
| Animal model | 16–45% | In vivo, non-human |
| In vitro / cell | 10–34% | Cells, tissue, biochemical assay |
| Mechanistic rationale | 6–24% | A pathway argument, not a result |
| Anecdote / marketing | 2–12% | Testimonial, forum, vendor copy |

**The best available design picks the band. The quantity, replication and
consistency of the studies place you inside it.** Nothing can leave its band in
either direction, which makes "ten mouse studies never reach one randomised
trial" a property of the arithmetic rather than a slogan — every animal reading
is capped at 45%, and every reading with a relevant randomised human trial in it
starts at 62%. There is a test asserting exactly that
([`tests/astra/corpus.test.mjs`](../tests/astra/corpus.test.mjs)).

### Relevance, separately from design quality

Conflating *how well a study was done* with *how much it bears on the claim* is
the single most common way an evidence summary flatters a compound, and the
peptide market runs on it. TB-500 is the textbook case: the randomised human
trials people cite used **full-length thymosin beta-4, applied topically, to an
eye, for dry eye disease**. That is a real randomised trial. It says almost
nothing about an injected fragment used for a tendon.

So every study carries a `relevance` in (0, 1]. Below 0.6 it is counted one tier
down; below 0.35, two tiers down. The study card in the dossier shows the
adjustment — original tier, arrow, adjusted tier, and a sentence saying why —
rather than burying it in the arithmetic.

The effect on the library is the whole argument in one table:

| Compound | Best design on paper | Reading | Why |
| --- | --- | --- | --- |
| Semaglutide | Human RCT | **86%** Well established | Three large outcome trials, on the endpoint claimed |
| Tesamorelin | Human RCT | **82%** Well established | Approved, pivotal trial on the claimed endpoint |
| GHK-Cu | Human trial | **63%** Human-supported | Small cosmetic trials, topical, appearance endpoints |
| CJC-1295 | Human RCT | **54%** Emerging | The trial measured a hormone level, not an outcome |
| Ipamorelin | Human RCT | **52%** Emerging | Its one good human trial was for an unrelated indication, and missed |
| BPC-157 | Human trial | **39%** Preclinical only | The human trial is cited far more often than it is read |
| TB-500 | Human RCT | **34%** Preclinical only | Different molecule, different route, different indication |
| KPV | Animal | **22%** Preclinical only | Clean mouse work, no human study at all |
| KLOW Stack | Animal | **16%** Speculative | Bounded by its weakest member, then penalised again |

### Stacks inherit the weakest link

A combination with no combination study does not average its members' evidence —
that would make a stack look *better* than its parts. It is bounded below by its
weakest member, then multiplied by 0.7 for an interaction surface nobody has
measured. One function, `entryReading()` in
[`js/engine.js`](../public/astra/js/engine.js), owns that rule, and every
surface that shows a number goes through it. An earlier version pooled the
members' studies and reported KLOW as "Well established · 66%"; the tests now
make that regression impossible.

---

## What is actually in it

### The entrance

A scroll-linked descent through six chapters. The WebGL laboratory behind the
text flies between camera waypoints as each chapter arrives, the score changes
key, layered cards parallax at different rates, and the compound showcase
reveals one card at a time.

Three decisions worth knowing:

- **Scroll drives everything through one number.** Each chapter reports its own
  progress; every transform is a function of it. There is no animation state to
  fall out of sync, which is what makes fast scrolling and scrubbing back up
  feel solid.
- **Reveals are one-way.** A card that has been seen stays revealed. Re-hiding
  content on scroll-up is the most common way scroll animation becomes annoying
  to actually read.
- **Reduced motion is honoured completely** — not damped, off. The page becomes
  an ordinary document.

The showcase cards are drawn from the compound card art the platform was
designed against: one saturated neon accent per compound, gold rules, a glass
vial, key claims each with their tier — and, where the marketing puts a dosage,
an evidence meter.

### The laboratory renderer

A hand-written WebGL2 scene in [`js/lab.js`](../public/astra/js/lab.js): a
hexagonal vault with a peptide helix on the dais, a plinth of vials, ambient
dust, and — when you open the map — the knowledge graph replacing the room.
Every vertex is generated from maths in
[`js/geometry.js`](../public/astra/js/geometry.js), which is why the whole
platform is a few hundred kilobytes and loads no model files.

Three shader programs draw all of it: additive point sprites, glowing lines, and
a per-node-coloured point program for the graph. Bloom is faked by drawing each
cloud twice, once wide and soft and once tight and bright — one extra draw call
instead of a second framebuffer.

The camera is the "travelling between sections" mechanic: each deck owns a
waypoint and changing deck flies there rather than cutting. A lateral **framing**
offset slides the subject clear of whatever UI is over it — right of the
entrance's copy, left of the console's panel. Drag to orbit, scroll to dolly,
and tilt the device to parallax the whole volume. The renderer watches its own
frame rate and drops resolution rather than frames; without WebGL2 it reports
failure and the app falls back to a CSS-only backdrop.

### The nine decks

**Engine** — type a question, get an answer with citations, then the eight-section
dossier: what it is, proposed mechanism, human evidence, preclinical evidence,
active research, known uncertainties, regulatory considerations, sources. Always
those eight, always in that order, so no compound gets a friendlier layout for
being more popular. Human evidence comes *before* preclinical, and uncertainties
*before* regulatory status, because that is the order a careful reader needs
rather than the order a marketer would pick.

Every claim carries a **Show me the science** control that expands into the
studies behind it — design, population, n, finding, and the limitation, with a
live PubMed search rather than a link that can rot. Claims with nothing behind
them say so: *"No study in the corpus supports this claim. That is the finding."*

**Map** — the knowledge graph: compounds → mechanisms → body systems → studies,
83 nodes and 99 edges, laid out by a deterministic force simulation so the map
is in the same place on every visit. It answers "what connects these two
things?" with a shortest path.

**Decoder** — paste an abstract, get the five answers: what was studied, in whom,
what was found, what limits it, and what it does not prove. It runs on
structural cues — design vocabulary, sample-size patterns, species words,
statistical reporting, hedging density — and is deliberately conservative: when
it cannot tell, it says so. "Randomised" applied to rats does not promote the
study.

**Lab** — three tabs. *Comparison* puts two compounds across five axes and names
which has the better **evidence** (never which works better). *Debate Room*
convenes four reviewers — research scientist, clinical evidence reviewer,
sceptical reviewer, statistics reviewer — who disagree for structural reasons,
then writes the consensus. *Simulator* does not simulate taking anything; it
simulates **designing a study**. Move the sample size, the blinding and the prior
plausibility, and watch the same observed result change value: statistical
power, minimum detectable effect, and false-positive risk
(`FPR = 1 − power·prior / (power·prior + α(1−prior))`). Most people have never
seen how violently a conclusion moves when only the design changes.

**Verify** — one engine, three hats. *Myth Detector* walks claim → evidence →
contradicting evidence → confidence → source. *Social Fact Checker* returns
APPROVED / APPROVED WITH EDITS / HOLD before you publish. *Compliance Guardian*
flags language regulators read as drug claims — treatment and cure claims,
guarantees, implied approvals, dosing instructions, testimonial-as-evidence —
and offers a compliant rewrite. It is a drafting aid, not legal advice, and it
says so on screen.

A claim that names no compound the corpus knows returns "No compound
identified" rather than guessing. The detector attributing a stray sentence to
whatever the index ranked first would be worse than no detector.

**Studio** — one paper becomes thirty assets: an 8-slide carousel, a Reel script,
a YouTube outline, an email, a blog outline, an infographic concept, 6 FAQs, 6
hooks and a 5-question quiz. Every asset passes back through the compliance
guardian before you see it, so the studio cannot hand you a caption its own fact
checker would block — there is a test asserting `blocked === 0` across three
different source papers. Exports as Markdown. Below it, an A/B laboratory that
weights a result by how much of it there is, so a 2-of-4 variant never beats
180-of-1000.

**Command** — the private half. An executive dashboard built from events stored
on this device (nothing is uploaded, and the platform ships no tracking), a
demand-versus-evidence view showing where readers ask most and the library is
weakest, an arrival profile, the **AI Research Radar** reading Europe PMC live
from the browser, and **⚡ Generate campaign** — a seven-day plan derived from
the demand gap, with deliverables, compliance guardrails, and an approval gate.
Nothing publishes itself.

**Record** — interests that reorganise the whole platform, plus the progression
system. **Settings** — the optional model connection, sensors, calm mode, and the
full tier key.

### Progression, and the honest version of it

The brief asked for a progression loop built on the mechanics that drive return
visits: levels, streaks, unlocks, and rewards on a variable schedule. It is
here, and it works — clearance levels from Visitor to Director, seven gated
capabilities, streak bonuses, and research "drops" that arrive roughly one
action in five.

It is built with one constraint that changes what it is. **Every point is earned
by an act of research literacy** — expanding the sources behind a claim (14 XP),
opening the primary literature (22), decoding a paper (30), surfacing evidence
that contradicts a claim (34). Nothing is awarded for time on site, scroll depth
or returning for its own sake, and repeated identical actions decay toward a
floor so grinding one button is not a route to a rank. Every research drop is a
real limitation or contradiction from the library, not a badge.

**Calm mode**, in Settings, turns off streak pressure and the reward drops while
keeping the record; **Erase my record** deletes it. Both are offered plainly
rather than buried, because a persuasion system nobody can switch off is a dark
pattern regardless of how good its intentions are.

### Sensors and sound

**Motion** — device tilt parallaxes the lab camera, the entrance's layers and the
page background. iOS needs a gesture-bound permission request, which is why it
is a button (◈). On a laptop the same parallax runs from the pointer, so the
effect exists everywhere.

**Camera** (⊙) — scans a QR code or label and looks the compound up, and reads
ambient light so the facility warms toward the room you are sitting in. Frames
are read into a canvas and discarded: nothing is recorded, uploaded or stored.

**Score** — synthesised with Web Audio, not shipped as files, so it never has a
seam. A detuned sawtooth pad through a lowpass, a sub drone, sparse bells on a
pentatonic scale, all through a convolution reverb built from generated noise.
Each deck has its own chord and filter colour, so the harmony changes as you
travel: the ear notices the room change before the eye finishes the transition.

---

## Astra, the concierge

Two brains, one interface. The **local brain** retrieves from the corpus and
composes a cited answer; it needs no key, no network and no account, and it is
what runs by default. If an operator supplies an API key in Settings, the same
question goes to a language model with the *graded* evidence as context and the
answer streams back.

The local path is not a degraded mode — it is the guarantee. The platform
answers with citations offline, and there is an end-to-end check that asserts
exactly that with the network cut.

**A connected model can improve the prose but never the tier.** Evidence grading
always comes from the corpus, so a model cannot talk the platform into more
confidence than the studies support. The system prompt forbids diagnosing,
recommending, producing protocols, and inventing studies.

> The key is stored in that browser only. Calling a model API directly from a
> browser exposes the key to anything running on the page — use a restricted
> key, or leave it empty and run on the corpus.

---

## The corpus

Eleven compounds and two stacks, in
[`js/data/peptides.js`](../public/astra/js/data/peptides.js): BPC-157, TB-500,
KPV, GHK-Cu, semaglutide, tirzepatide, CJC-1295, ipamorelin, tesamorelin, Semax,
Selank, plus the KLOW and CJC-1295/Ipamorelin stacks. 29 catalogued studies, 34
graded claims, 38 mechanisms.

Two editorial rules govern the file:

1. **Nothing is a recommendation.** Dosing appears only as `reported` context —
   what the literature and the market describe — never as guidance, always with
   its own caveat. A test asserts that every compound's dosing note disclaims
   itself.
2. **Weak evidence is labelled weak.** Where a compound is popular and the human
   evidence is absent, the corpus says so rather than borrowing confidence from
   a mouse.

Studies store a **literature query rather than a link**, so "Open the literature"
runs a live PubMed search and a reader lands on the papers themselves rather
than on a URL that has rotted.

> **Verify every citation before republishing.** The corpus is curated, and the
> studies are described from the published record as summarised here. It is
> written to be a teaching instrument and a starting point for your own reading,
> not a substitute for reading the paper. Where a record is thin — BPC-157's
> human trial is the clearest case — the corpus says so in the limitation field
> and the relevance score reflects it.

---

## Offline

A service worker precaches the shell and serves it cache-first. The corpus, the
grading, the decoder, the graph layout and the renderer are all local, so the
whole platform works on a plane. The research radar's requests are cross-origin
and deliberately never cached: a stale literature sweep presented as fresh is
worse than an honest CACHED or OFFLINE badge, which the radar handles with its
own last-good store.

---

## Testing

```sh
npm run test:astra   # 89 unit tests over the pure logic
npm run qa:astra     # 66 end-to-end checks in headless Chromium
```

The unit tests cover the corpus's shape, the evidence arithmetic and its
invariants, retrieval, the dossier, the stack rule, the graph, the comparison
lab, the reviewers and simulator, the decoder, the compliance rules, the studio
and the progression system. The interesting ones are the invariants:

- No quantity of weak evidence outranks one good trial.
- Every tier's ceiling is a hard cap, not a soft one.
- Every stack scores at or below its weakest member.
- The studio never emits copy its own guardian would block.
- Every dossier section is populated for every compound.
- Every claim's cited studies actually exist on that compound.

The end-to-end suite drives the real platform: the entrance reveals and
scroll-links to the lab camera, WebGL renders, all nine decks open, the engine
answers and builds a dossier, "Show me the science" expands into studies with
working literature links, the decoder grades an animal study as animal evidence,
the guardian blocks unpublishable copy, the studio generates thirty governed
assets, the command centre proposes a campaign behind an approval gate, and the
whole thing keeps answering with the network cut.

Set `PUPPETEER_EXECUTABLE_PATH` to use a browser Puppeteer did not download.

---

## Files

```
public/astra/
  index.html            the shell
  styles.css            the visual system
  sw.js                 offline
  js/
    app.js              wiring: routing, entrance, rewards, service worker
    intro.js            the scroll-linked entrance
    lab.js              WebGL2 renderer
    geometry.js         procedural vault, helix, molecules, vials
    mathkit.js          matrices, easing, seeded RNG
    audio.js            the synthesised score
    sensors.js          device tilt, camera, reduced motion
    dom.js              element factory, formatters
    data/peptides.js    the corpus
    evidence.js         tiers, bands, relevance, the confidence arithmetic
    engine.js           retrieval, the eight-section dossier, the stack rule
    astra.js            the concierge, local and model paths
    decoder.js          the research paper decoder
    claims.js           myth detector, fact checker, compliance guardian
    compare.js          the comparison lab
    reviewers.js        the debate room and the study simulator
    graph.js            the knowledge graph and its layout
    studio.js           one paper into thirty governed assets
    command.js          telemetry, dashboard, radar, campaigns, arrival
    progress.js         clearance, streaks, unlocks, research drops
    decks.js            every panel
```

---

## What this is not

It does not diagnose, prescribe, or generate individualised dosing or treatment
plans, and it will not be extended to. Several compounds it covers are
prescription medicines; most of the rest are not approved for anything, and some
are prohibited in tested sport. The platform's job is to make that legible.
