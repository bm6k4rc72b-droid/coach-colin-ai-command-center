# Raven's Creed: Saga of the North (browser version)

A playable third-person Viking action RPG in the browser (Three.js), built from the design in
[`../ravens-creed`](../ravens-creed). You play **Bjorn Vargrsson**, the fjord-raven, on the night two clans swear one fleet
on the oath-horn at Valdrheim, and play through the vertical-slice quest **The Drowned Oath**.

- **Play:** open `ravens-creed.html` in a browser (desktop or phone; needs internet once to load Three.js from jsDelivr).
  Published on GitHub Pages under `/ravens-creed/`.
- **Build:** `node build.mjs` concatenates `src/*.js` into `index.html` (artifact page) and `ravens-creed.html` (standalone
  page). It also inlines the dialogue graphs from `../ravens-creed/Content/Data/Dialogue/*.json`, so the browser game runs
  the same Thorvald and Hild dialogue data as the Unreal package (same conditions, effects, tones and locked-choice hints).
- The engine (character rig, controls, touch controls, sky, HUD, combat) is shared with `../kaye-realm` and `../aurum-city`.

## What is in it

- **Valdrheim:** a stave hall with a high seat and the oath-horn, the oath-stone and a watchtower on the plateau, Cliff
  Town on the terrace, cliff stairs down to the harbour, a boathouse, piers and longships on the fjord, and a wolf-head camp
  in the western wood.
- **Weather:** rain, thunderstorms with real lightning strikes (thunder delayed by distance, strikes favour the
  watchtower brazier, strikes near the hall blow out its torches), fog, and an aurora on clear nights.
- **Stealth:** crouch (C) to hide. Enemies have a sight cone, line of sight and an awareness meter shown as **?** then
  **!**; rain, fog and night shorten their sight, and storms drown out footsteps. From behind an unaware enemy, the attack
  button becomes a silent wrist-seax kill.
- **Combat:** Dane-axe three-hit combo, heavy attack, dodge roll with invulnerability, stamina, XP and levels. Enemies:
  Gullbrand Circle cutthroats, wolf-head raiders, a berserker, and Thorvald in the holmgang ring.
- **Dialogue:** choices tagged by tone (Oath, Shadow, Rune, Crown, Threat), locked options that show what they need, and
  marked points of no return. Keys 1–6, or tap.
- **The four winds:** Honor (Oath), Cunning (Shadow), Piety (Rune) and Ambition (Crown) change with what you do and gate
  dialogue choices. The journal (J, or tap the quest panel) shows them with your clues and proof.

## The Drowned Oath

1. Speak with Jarl Eirik at the oath-stone.
2. Find out why the lawspeaker Thorvald hasn't slept. Help Hild carry the mead casks (she will testify), crouch in the
   boathouse to overhear Thorvald's meeting with the Hedeby merchant, pickpocket the vial from behind, or make Ulfhild the
   völva your companion.
3. Confront Thorvald alone in the boathouse (promise Hild's safety so he confesses, turn him into a double agent, fake
   his drowning, or drown him), or tell Eirik to call the thing.
4. At the thing, in the thunderstorm: expose him with proof (then holmgang or outlawry), let him confess, call Ulfhild's
   omen, accuse him without proof, or say nothing. During a lightning blackout you can swap the oath-horn for Thorvald's
   own cup.

Ten endings are reachable: Exposed, Confessed, Turned, Omen, False Accusation, Exploited, Swapped (the gods'
judgment), Assassinated, Fled, and the horn going round with nobody stopping it. Each ends with a saga card and a dawn
epilogue: aurora over the fjord if the clans stand united, fog if they split.

## Controls

| Desktop | Phone | Action |
| --- | --- | --- |
| W A S D, Shift | Left-thumb joystick (push far to run) | Move, run |
| Mouse, wheel | Right-thumb swipe, pinch | Camera, zoom |
| Left click or F | ⚔ | Axe combo; silent kill from behind an unaware enemy |
| Right click or G | Heavy | Heavy attack |
| Q | Dodge | Dodge roll |
| C | Sneak | Crouch and hide |
| E | E | Talk, use, pickpocket, swap the horn |
| 1–6 | Tap a reply | Dialogue choices |
| J | Tap the quest panel | Journal |
| Tab, N, R, M, H | Map, weather buttons | Map, day/night, weather (clear, rain, storm), sound, help |

Not in the browser version (the Unreal design covers them): the open-world regions beyond Valdrheim, the settlement,
sailing, the rumour network, NPC schedules beyond the quest beats, and the tower-in-the-storm solution.
