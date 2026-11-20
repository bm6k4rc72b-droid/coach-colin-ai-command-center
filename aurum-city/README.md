# Gilded Circuit

A third-person action RPG in the browser (Three.js). You play **Rion Vale**, a swordsman with a glowing greatsword, in a golden
canal city: arcades with lit alcoves, a canal over glowing circuitry, hover cars on the water and saucers overhead. Rogue
Sentinels pour from the Breach in the east plaza.

- **Play:** open `gilded-circuit.html` in a browser (desktop or phone; needs internet once to load Three.js from jsDelivr).
- **Build:** `node build.mjs` concatenates `src/*.js` into `index.html` (artifact page) and `gilded-circuit.html` (standalone page).
- The engine (rig, controls, touch controls, sky and weather, HUD) is shared with `../kaye-realm`.

## Controls

| Desktop | Phone | Action |
| --- | --- | --- |
| W A S D, Shift | Left-thumb joystick (push far to run) | Move, run |
| Mouse | Right-thumb swipe, pinch | Camera, zoom (wheel) |
| Left click or F (tap again for a 3-hit combo) | ⚔ | Attack |
| Right click or G | Heavy | Spinning heavy attack |
| Q | Dodge | Dodge roll (brief invulnerability) |
| E | E | Talk to citizens, sit |
| Space, Tab, N, R, M, H | Jump, Map, top-left buttons | Jump, map, night, rain, sound, help |

## RPG systems

- Health, stamina (attacks and dodges cost it; it refills quickly) and XP. Levels raise health and damage.
- Health regenerates out of combat, faster while sitting.
- Enemies: **Sentinels**, heavier **Brutes**, and **Sentinel Prime** (boss, with a telegraphed ground slam). They chase, wind up, strike, stagger when hit, die and respawn later.
- Quest: defeat 12 Sentinels at the Breach or the West Docks, then Sentinel Prime at the portal.
- Feel: lock-on to the nearest enemy, sword trails, damage numbers (crits in gold), hit-stop, screen shake and bloom.

## Code map

| File | Contents |
| --- | --- |
| `src/10-world.js` | Layout, circuit/marble/arcade textures, collision world, canal and water |
| `src/20-city.js` | Arcade facades, Starbridges, promenades and cafés, skyline, Breach portal, docks, hover cars, saucers |
| `src/45-hero.js` | Rion Vale (scarf and hair physics) and the Circuit Edge greatsword |
| `src/60-citizens.js` | 36 named citizens, dialogue, seats |
| `src/65-combat.js` | Combo, heavy and dodge, attack poses, enemies and AI, XP, quest, combat HUD and sounds |
| `src/80-ui.js` | HUD, maps, locations, bloom post-processing, main loop |
