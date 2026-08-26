# PRISM — Coach Colin's AI Command Center

A holographic command deck of ten specialist AI agents.

One beam of intent goes in; the prism splits it into a spectrum. Instead of a
single chatbot and a blank text box you have to steer, PRISM gives you ten
named agents — each with a hue, a remit, and a set of **missions** that hand
back a finished piece of work.

Open `index.html`. There is no build step, no install, no account, and no
network required.

---

## Why it is not just another bot

A general chatbot puts the hardest part on you: knowing what to ask. PRISM
inverts that.

| | A chat bot | PRISM |
|---|---|---|
| Starting point | An empty box | A mission with 1–4 labelled fields, each with an **example** button |
| Output | A wall of prose | A structured card — sections, steps, stat tiles, copyable lines |
| Range | One voice for everything | Ten agents, each with its own remit and register |
| Getting better | You learn to prompt | The app opens up: new agents, new missions, deeper tiers |
| Cost to run | An API key | Nothing — it works fully offline |

**Missions, not conversations.** Every mission states plainly what you get
before you start: *"Three phases, weekly actions, and the metric that proves
each one."* You fill in a couple of fields — or hit *example* and let it fill
them for you — and it produces the artefact.

**The beam.** If you would rather just say what you need, type it into the
command bar and PRISM routes it. *"someone asked my price and I froze"* lands
on ECHO's Reply Engine with the field already filled.

---

## The spectrum

| Agent | Remit | Opens at |
|---|---|---|
| **ATLAS** | Strategy & sequencing — plans, weeks, what to stop doing | Level 1 |
| **VERSE** | Hooks, scripts & captions | Level 1 |
| **ECHO** | Front desk & replies — the message you have been avoiding | Level 1 |
| **FORGE** | Programme design — blocks, swaps, onboarding | Level 2 |
| **LEDGER** | Pricing & offers — tiers, true hourly, price rises | Level 3 |
| **PULSE** | Retention & check-ins — spotting who is about to quit | Level 5 |
| **SCOUT** | Finding the next client — where they are, what to say | Level 7 |
| **MUSE** | Mindset & the hard conversations | Level 9 |
| **CIPHER** | Numbers, read plainly — funnels, targets, retention maths | Level 12 |
| **RELAY** | Automation & systems | Level 15 |

Thirty missions in total. Nothing is paywalled — the locked facets are extra
range, not a gate on the basics, and every mission you run moves you toward
them.

---

## The progression loop

Three timescales, deliberately:

- **Every action pays immediately.** XP lands the moment a mission finishes,
  multiplied by a **chain** that builds from ×1.0 to ×2.5 while you keep
  moving and decays after three minutes of stillness.
- **Every day pays on top.** A streak, and three **directives** drawn from the
  calendar date — the same three all day, so a refresh never rerolls them.
- **Every week pays in range.** Levels unseal new agents; **mastery** with a
  single agent (earned by running it, 0–5) unseals that agent's advanced
  mission. Twenty-four badges sit across the whole thing.

Progress is stored in your browser only. Settings has export/import if you
want to move it, and a reset if you want it gone.

---

## The interface

- A volumetric canvas field, and a real dispersion fan behind the deck — one
  ray per agent you have unsealed, in that agent's own hue.
- Glass panels with iridescent 1px borders, cursor-tracked specular sheen, and
  3D tilt.
- Output materialises line by line rather than appearing.
- Optional synthesised audio (off by default).

All of it respects `prefers-reduced-motion`, and stops entirely when the tab
is hidden or you switch Motion off in Settings.

---

## Live Link — connecting a real Claude model (optional)

PRISM composes everything locally by default. The composers are deterministic
and genuinely useful — they are not placeholders waiting for an API key.

If you want live model output instead, **Settings → Live Link** streams
responses from the Claude Messages API, shaped by the same mission brief.
Missions, XP and the archive work identically either way, and a failed live
call falls back to the local composer rather than losing your work.

Two transports:

**Proxy (recommended).** Point PRISM at your own endpoint, which forwards to
Anthropic and holds the key server-side. Your endpoint receives the request
body and should forward it with your key attached:

```
POST https://api.anthropic.com/v1/messages
x-api-key: <your key>
anthropic-version: 2023-06-01
anthropic-beta: server-side-fallback-2026-07-01
```

Return the SSE stream to the browser unchanged.

**Direct.** The key is stored in this browser's local storage and sent from
the page. Anything with access to the browser profile can read it, so this is
for your own machine only — never a shared or public computer.

Requests use `claude-opus-5` with adaptive thinking, streaming, and
`fallbacks: "default"` so a declined request is re-run server-side rather than
handed back to you as a refusal.

---

## Layout

```
index.html            the page
css/
  base.css            reset, tokens, typography
  holo.css            glass, dispersion, scanlines, materialisation
  app.css             layout and components
js/
  core/
    util.js           DOM helpers, seeded RNG, formatting
    store.js          persistence (with an in-memory fallback)
    compose.js        the 30 local composers
    engine.js         intent routing + the Claude live link
    progress.js       XP, ranks, streaks, chains, directives
  data/
    agents.js         the roster and mission schemas
    quests.js         directives and badges
  ui/
    fx.js             canvas field, prism, tilt, audio
    views.js          every screen and the output renderer
  app.js              boot, routing, HUD, celebrations
tools/bundle.js       flattens everything into dist/prism.html
```

Plain scripts on a `P` namespace rather than ES modules, so the page works
straight from `file://` with no server.

### Single-file build

```
node tools/bundle.js     # → dist/prism.html
```

Everything inlined into one file you can email, host anywhere, or publish
as an Artifact.

---

## Adding an agent

1. Append an entry to `LIST` in `js/data/agents.js` — id, hue, role, `line`,
   three `goodAt` bullets, an `unlock` level, and its missions. Each mission
   field needs a `type`, a `label`, and an `ex` array so *example* works.
2. Add a matching composer object to `REGISTRY` in `js/core/compose.js`, keyed
   by agent id, with one function per mission returning `{title, subtitle,
   blocks}`.
3. Add routing phrases to `SIGNALS` in `js/core/engine.js`.

The deck, the prism fan, mastery, directives and badges all pick it up with no
further wiring.
