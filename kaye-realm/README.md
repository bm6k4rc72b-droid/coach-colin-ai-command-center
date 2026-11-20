# Kaye's Realm

A playable third-person open-world fantasy game in the browser, built with Three.js. You play Kareema, called Kaye.

- **Play:** open `kaye-realm.html` in a desktop browser (Chrome, Edge, Firefox or Safari). It needs internet access once to load Three.js from jsDelivr.
- **Build:** `node build.mjs` concatenates `src/*.js` and inlines the dragon model into `index.html` (artifact page) and `kaye-realm.html` (standalone page).
- **Dragon model:** `blender -b -P blender/dragon.py -- assets/dragon.glb` regenerates the sleeping white dragon (Blender 4.x, needs numpy for the glTF exporter).

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Third-person camera (click the game to lock the mouse; drag also works) |
| Shift | Run |
| Space | Jump (or stand up) |
| E | Interact: greet, pet, sit, advance dialogue |
| C | Crouch |
| X | Lie down |
| Tab | World map |
| N / R | Day–night / rain (also buttons in the bottom-left HUD) |
| Wheel | Camera zoom |
| M / H | Sound / help panel |

## The world

| Place | What's there |
| --- | --- |
| Willowmere | 30 furnished, enterable houses (beds, tables, fireplaces, shelves, rugs, lanterns), one resident per house, a fountain square, market stalls, benches, a well and lamp posts. Residents wander, sit on benches, go home at night and bow when greeted. |
| Bob the cat | Wanders town and curls up beside houses. Press E for "Hello, darling!" |
| Pigeons | 34 pigeons perch on roof ridges and chimneys and fly off when Kaye gets close. |
| Silverrun River | A flowing, reflective river with a stone arch bridge on the royal road. |
| Eldergrove Forest | A dense forest with sun shafts, floating dust, ferns and wind-swayed canopies. |
| The Gilded Acorn | A richly furnished elven pub and café with a bar, bottle shelves, barrels, chandeliers and a hearth. Thalindra the elf bartender works behind the bar. |
| Elvenhollow | Five round elven homes around giant trees, a pond and a fire circle. The elves smile, raise their hats and gesture when greeted. |
| Castle Aurelion | A walled castle 300 m across with corner towers, a gatehouse, banners, gardens with gardeners, a fountain, friendly guards and servants. The two-storey keep holds a great hall with pillars, torches, banquet tables and a throne Kaye can sit on, plus corridors, staircases, bedrooms, a library, kitchens and an armoury. |
| Skyreach Tower | A 70 m spiral staircase to a summit that overlooks the whole map. |
| Frostpeak Mountains | Snowy peaks with falling snow and Snowmane, a large white dragon sleeping at Dragon's Rest. Press E to pet her. |

## Code map

| File | Contents |
| --- | --- |
| `src/00-core.js` | Renderer, noise, hand-painted procedural textures, materials, mesh batching |
| `src/10-world.js` | Terrain height field and shader, collision world, water |
| `src/20-buildings.js` | Houses and interiors, town square, bridge, pub, elven homes, castle, keep, tower |
| `src/30-nature.js` | Instanced trees, grass, flowers, ferns, rocks, light shafts, clouds, distant peaks |
| `src/40-characters.js` | Skinned procedural rig, blended animation, Kaye's physics hair, cloth cape and skirt, Bob, pigeons, dragon |
| `src/50-player.js` | Input, Kaye's controller, collision-aware third-person camera |
| `src/60-npcs.js` | Town walking graph, schedules, greetings, dialogue, interactions |
| `src/70-env.js` | Sky, sun and moon, day–night cycle, weather, torch lights, procedural sound |
| `src/80-ui.js` | HUD, minimap, compass, world map, location names, main loop |
