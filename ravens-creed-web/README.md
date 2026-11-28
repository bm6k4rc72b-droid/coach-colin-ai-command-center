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
- **Duel combat** (in the spirit of modern samurai and Viking action games):
  - Hold block to catch blows on the axe; tap it just as a blow lands to **deflect**. A deflect slows time, staggers the
    foe and opens a **riposte** (attack within the window for an execution).
  - Enemy attacks are telegraphed: a **blue** flash means block won't hold, so deflect it; a **red** flash means it
    can't be blocked, so dodge. A dodge at the last instant is a **perfect dodge** that also opens a riposte.
  - Enemies have **posture**, a yellow bar under their health. Deflects and heavy blows fill it; when it breaks the foe
    kneels, and your next attack is a cinematic **execution**.
  - Foes guard against light attacks from the front, take turns attacking while the others circle you, and get
    knocked back.
  - **Lock-on** (T or middle mouse) keeps the camera framed on one foe and lets you strafe.
  - **Standoff** (Z): call out a group in the open. Wait through feints, then strike the instant one charges. Strike
    too early or too late and you take the blow. Chain up to three kills.
  - Enemies: Gullbrand Circle cutthroats, wolf-head raiders, the berserker Hrolf the Red, and Thorvald in the
    holmgang ring.
- **Traversal:** jump at a ledge to grab and mantle it (up to about 2.9 m), and sprint to vault low obstacles. Landing
  from a high fall while moving turns into a roll; landing standing still costs health.
- **Feel and look:** combat stance, block pose, lean into turns, breathing idle, blood and spark particles, rain
  splashes, weapon glints, hit-stop and slow motion, and a colour grade (cool shadows, warm highlights, vignette,
  grain).
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

## Side quests

- **Wolves at the Door** (Ivar the hall-guard, at the hall door): find the wolf-head camp, defeat Hrolf the Red, and
  bring back the stolen arm-ring. Reward: XP, silver, Honor.
- **Feathers for the Völva** (Ulfhild): climb to three raven feathers on the watchtower, the harbour cargo stack and
  the plateau cairn. Reward: **Raven Sight** (R), which desaturates the world and marks every foe in red through rain
  and walls.

Quest givers show **!** (quest available) or **?** (ready to turn in). The journal (J) lists every quest with its
objectives and lets you choose which one the map and compass track.

## Controls

| Desktop | Phone | Action |
| --- | --- | --- |
| W A S D, Shift | Left-thumb joystick (push far to run) | Move, run |
| Mouse, wheel | Right-thumb swipe, pinch | Camera, zoom |
| Left click or F | ⚔ | Axe combo; silent kill from behind an unaware enemy; execution on a broken or deflected foe |
| Hold right click or V | Block (hold) | Block; tap as the blow lands to deflect |
| G or Shift+click | Heavy | Heavy attack (breaks guards) |
| T or middle click | Lock | Lock on |
| Z | Stand | Standoff |
| R | Sight | Raven Sight (after Ulfhild's quest) |
| Space at a ledge | Jump | Climb |
| Q | Dodge | Dodge roll |
| C | Sneak | Crouch and hide |
| E | E | Talk, use, pickpocket, swap the horn |
| 1–6 | Tap a reply | Dialogue choices |
| J | Tap the quest panel | Journal |
| Tab, N, Y, M, H | Map, weather buttons | Map, day/night, weather (clear, rain, storm), sound, help |

Not in the browser version (the Unreal design covers them): the open-world regions beyond Valdrheim, the settlement,
sailing, the rumour network, NPC schedules beyond the quest beats, and the tower-in-the-storm solution.
