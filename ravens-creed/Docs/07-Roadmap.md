# Technical Roadmap and Vertical-Slice Milestones

## The vertical slice: "One Night at Valdrheim"

A 45–60 minute playable slice proving all four pillars in one place: the Valdrheim promontory (≈1.5 km²: cliff town,
stave hall, boathouse, watchtower, forest edge), Bjorn, 25 named NPCs with schedules, *The Drowned Oath* with all ten
outcomes, the storm cycle (rain → thunderstorm → aurora dawn), parkour across cliffs and scaffolding, stealth, combat
against up to six enemies, one holmgang duel, and save/load of the full world state.

**Exit criteria.** All ten outcomes reachable and verified by the branch walker; two players' different choices
produce visibly different dawns; 60 fps (performance mode) on PS5-class hardware; no blocker bugs across 20 full
playthroughs; an external focus-test score of 7.5+ for "my choices mattered".

## Team for the slice (≈ 26 people, 9 months)

| Discipline | Heads | Notes |
|---|---|---|
| Direction and production | 3 | Game director, producer, narrative director |
| Gameplay engineering | 6 | Traversal, combat, AI/social, weather/systems, UI, tools |
| Engine and rendering | 2 | Weather rendering, performance, streaming |
| Design | 5 | Quest, systems (social and alignment), combat, level, technical design |
| Art | 7 | Art director, 2 environment, 2 character, VFX, lighting |
| Animation | 2 | Motion matching set-up, traversal and combat montages |
| Audio | 1 | Weather and combat audio, temp VO |

## Milestones

| # | Month | Milestone | Deliverables | Gate |
|---|---|---|---|---|
| M0 | 0–1 | **Foundation** | Project, module and plugins; CI with build, validator and automation tests; World Partition map; this code base compiled and unit-tested; greybox of Valdrheim | Compiles on all targets; tests green |
| M1 | 1–3 | **First playable (greybox)** | Movement with motion matching; climb/vault/mantle with warping; light/heavy/parry/dodge; one NPC archetype with schedule; dialogue UI on the JSON graphs; weather state machine with debug sky | Traverse the promontory and finish the quest greybox via two outcomes |
| M2 | 3–5 | **Systems complete** | Social simulation (witnesses, rumours, deaths, vengeance); stealth and Raven Sight; assassinations; lightning, cold, grip, noise wired into gameplay; save/load of all state; all ten outcomes playable in greybox | Branch walker reaches all outcomes; save round-trip tests pass |
| M3 | 5–7 | **Content and art pass** | Final Valdrheim art (Nanite cliffs, hall interior), Bjorn's hero character and five MetaHuman-based NPCs, weather materials (wetness, snow, puddles), Niagara rain, lightning and aurora, cloth on cloaks and banners, VO temp | Art review against the art direction; performance ≤ 16.6 ms on target |
| M4 | 7–8 | **Polish and performance** | Camera and cinematic framing in dialogue; combat feel; accessibility options; audio mix; streaming and memory budgets | 20 clean playthroughs; focus test |
| M5 | 9 | **Slice lock** | Final build, capture-ready trailer beats, post-mortem, production plan for full game | Stakeholder green-light |

## Technical risks and spikes (first 6 weeks)

| Spike | Question | Owner |
|---|---|---|
| Climbing anywhere | Can tag- and phys-mat-driven climbing plus warping cover photogrammetry cliffs without hand-placed handholds? | Traversal engineer |
| Social simulation scale | 600 records with hourly rumours and 60 live brains: under 0.5 ms average game-thread cost? | AI engineer |
| Snow occlusion | Is a per-cell top-down capture good enough for roofs and overhangs, or do we need distance-field queries? | Rendering engineer |
| Branch explosion | Can the flag-ledger plus branch walker keep 10 outcomes × 3 later quests testable? | Technical designer |
| Wet surfaces on Nanite | Do material-driven wetness and puddles stay within the base-pass budget with Nanite and Lumen? | Rendering engineer |

## Full game, after the slice (indicative)

| Phase | Duration | Scope |
|---|---|---|
| Pre-production | 6 months | Regions blocked out, the full quest graph on paper and in the branch walker, companion arcs, tools hardened |
| Production | 24–30 months | Five regions, ≈30 main and 60 regional quests, 6 companions, sailing and naval battles, settlement, large battles with Mass AI |
| Alpha → Beta → Release | 8–10 months | Content complete, bug fixing, performance, certification, localisation (8 languages), VO (≈40k lines) |

## What exists today (in this folder)

| Item | Status |
|---|---|
| GDD and system designs (`Docs/`) | Written |
| C++ module: world state, alignment, save, weather, social, NPC, dialogue, quests, player, parkour, combat, Raven Sight | Written against UE 5.4 APIs; **not yet compiled** (no Unreal Engine in the authoring environment). Expect a first compile pass in M0 to fix API drift |
| *The Drowned Oath* dialogue graphs (JSON) | Written; pass the validator |
| `Tools/validate_dialogue.py` | Runs today; checks the data against the C++ types |
| Art, levels, animation, audio | Not started (M1–M3) |
