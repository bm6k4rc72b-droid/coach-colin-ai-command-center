# Raven's Creed: Saga of the North

An open-world stealth-action RPG set in the Viking Age (870–878 CE): parkour, stealth and combat; total NPC reactivity; a
branching saga with a four-axis alignment and eight major endings; and weather that changes how you play. This folder is
the pre-production package for an Unreal Engine 5 vertical slice.

## Contents

| Path | What it is |
|---|---|
| [`Docs/01-GDD.md`](Docs/01-GDD.md) | Game design document: pillars, setting, Bjorn Vargrsson, story in three acts, companions, factions, alignment, quests and branch points, 8 endings, systems, world |
| [`Docs/02-Systems-Architecture.md`](Docs/02-Systems-Architecture.md) | Module layout, class map, consequence pipeline, AI and animation integration, testing |
| [`Docs/03-Weather-System.md`](Docs/03-Weather-System.md) | Weather model, presets, rendering (clouds, wetness shader, snow, wind, lightning, aurora), gameplay effects, sail physics, budgets |
| [`Docs/04-Social-Simulation.md`](Docs/04-Social-Simulation.md) | NPC records, witnesses, memory, rumours, deaths and vengeance, interaction menu, daily life, worked example |
| [`Docs/05-Sample-Quest-The-Drowned-Oath.md`](Docs/05-Sample-Quest-The-Drowned-Oath.md) | Full branching quest: structure, gameplay solutions, 10 outcomes and their consequences, dialogue tree |
| [`Docs/06-Art-Direction.md`](Docs/06-Art-Direction.md) | Look, palette, characters, environments, lighting, UI |
| [`Docs/07-Roadmap.md`](Docs/07-Roadmap.md) | Vertical-slice milestones, team, risks, full-game phases |
| [`Source/RavensCreed`](Source/RavensCreed) | C++ game module (36 files): world state, alignment, save/load, weather, social simulation, NPCs, dialogue, quests, player, parkour, combat, Raven Sight |
| [`Content/Data/Dialogue`](Content/Data/Dialogue) | *The Drowned Oath* dialogue graphs as JSON (import with `URCDialogueAsset::ImportFromJson`) |
| [`Tools/validate_dialogue.py`](Tools/validate_dialogue.py) | Validates dialogue JSON against the C++ types and maps every path to its outcome |

## Status

- **Design:** complete for the vertical slice.
- **Code:** written against Unreal Engine 5.4 APIs but **not compiled yet**. The authoring environment has no Unreal
  Engine install. A structural check (balanced braces, includes, generated headers) passes. Expect a first-compile pass
  to fix API drift.
- **Data:** the sample quest's dialogue passes `python3 Tools/validate_dialogue.py` with 0 errors.
- **Not started:** art, levels, animation, audio, UI widgets, behaviour trees (all planned in the roadmap).

## Getting started (on a machine with Unreal Engine 5.4+)

1. Open `RavensCreed.uproject` (it generates project files and compiles the `RavensCreed` module).
2. Project Settings → Game → **Raven's Creed Weather**: assign the weather preset data table, the `MPC_Weather`
   collection, rain/snow/lightning Niagara systems and a thunder sound.
3. Create a Blueprint child of `ARCPlayerCharacter`, assign the Enhanced Input actions and mapping context, a weapon
   data asset and the traversal and combat montages (each with a `ParkourTarget` or `AssassinTarget` motion-warp
   window and `BeginHitWindow`/`EndHitWindow`/`OpenComboWindow` notifies).
4. Create `URCDialogueAsset`s, set `JsonSource` to the files in `Content/Data/Dialogue`, and press **Import From Json**.
5. Place `ARCNPCCharacter`s, set each `NPCId` (e.g. `Thorvald`, `Hild`, `Eirik`, `Sigrid`), dialogue, schedule and
   bonds.
6. In play, try `rc.Weather Thunderstorm`.

Validate dialogue any time (no engine needed):

```
python3 Tools/validate_dialogue.py
```

## Original IP note

Your concept art carried an existing franchise's branding. Everything here uses original names, symbols and terms (the
Raven Wardens, the Gullbrand Circle, Raven Sight, Raven's Plunge, the wrist-seax), so the game stands on its own.
