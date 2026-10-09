# Two-Speed Brain

**Why feelings arrive before reasons.** An interactive 3D brain that replays everyday moments
(being criticised, a change at work, a post attacking your side, a near miss, learning, being
shown you're wrong) millisecond by millisecond. It shows the fast alarm (amygdala, insula, body)
firing before the slow, deliberate system (prefrontal cortex) catches up.

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # simulation + content-integrity tests
npm run build   # typecheck + production build in dist/
```

## Modes

- **Simulate.** Pick a scenario and play it in slow motion (⅛×, ¼× or 1×), or scrub the timeline.
  - Regions light up by role: fast system, body alarm, slow system, habit, senses.
  - Signal pathways (the thalamus→amygdala "low road", the cortical route, prefrontal regulation) pulse as they fire.
  - The timeline plots feeling against reasoning and marks the moment reason overtakes.
- **Your state.** Toggle *Slept 5 hours*, *Already stressed* and *Practised pause*, then watch the crossover move.
- **Pause trainer.** Five steps (trigger → notice → name → reframe → respond) that drive the brain from alarm to regulation. It contrasts reappraisal with suppression.
- **Myths & evidence.** 15 popular claims (the lizard brain, the 10% myth, the backfire effect, ego depletion, left/right-brained people…), each rated *Strong / Moderate / Mixed / Weak / Myth* with its source.

Click any lit structure to see what it does. The toolbar peels back the cortex, toggles the skull and controls auto-rotate.

## Honesty rules

- Every claim names its source and carries an evidence rating (`src/data/evidence.ts`).
- Timings and intensities are **illustrative**. They follow typical latencies from the cited studies, but real brains vary, and regions work in overlapping networks.
- Functional areas without their own mesh are shown on the nearest anatomical structure and labelled as approximations (for example, the whole cingulate gyrus stands in for the anterior cingulate).
- The fast/slow split is a description, not two separate brains (see Myths & evidence).
- Tests check that every cited reference exists, every rated phase has a source, and every region maps to a real mesh.

## Data

Brain and skull meshes come from **BodyParts3D, Copyright© 2008 ライフサイエンス統合データベースセンター
licensed by CC表示-継承2.1 日本** (Database Center for Life Science, CC BY-SA 2.1 JP), as processed by
[Human Atlas](../human-atlas). They are not duplicated in git: `vite.config.ts` serves them from
`../human-atlas/public/anatomy` during development and copies them into `dist/atlas/` at build time.

Educational use only. Not medical or psychological advice.
