# CLIPSIM — IC-PC Aneurysm Clipping Simulator · by Coach Colin

> **Education and demonstration only.** This is not clinical training, not a
> medical device and not medical advice.

A browser-based view through an operating microscope of microsurgical clipping of a right
internal carotid–posterior communicating artery (IC-PC) aneurysm via a pterional,
transsylvian approach. There is no build step: native ES modules and a vendored Three.js r168.

## Run

- `./start.sh` at the repo root, then open <http://localhost:4173/clipsim/>
- or any static server pointed at `public/`, e.g. `python3 -m http.server -d public 8000` → `/clipsim/`

## Tune the anatomy

Every size, position and colour is in [`config/anatomy.js`](config/anatomy.js), in millimetres.
That file documents the coordinate frame.

## Layout

| Folder | What lives there |
|---|---|
| `config/` | anatomy and microscope parameters |
| `scene/` | renderer, microscope camera controls, scope lighting, post-FX grade |
| `anatomy/` | lobes, vessels, nerves, aneurysm, arachnoid, spatulas, tissue materials |
| `physics/` | heart clock, vitals (HR, BP, SpO₂, MEP), bleeding and blood pool, rupture risk and rupture, vessel flow, clip evaluation |
| `tools/` | tool manager plus one file per instrument (keys 1–0), instrument and clip models |
| `audio/` | synthesised suction, bipolar, Doppler and UI sounds |
| `procedure/` | event bus, the six stage definitions (`stages.js`) and the stage engine |
| `ui/` | i18n (EN/日本語), inspector, labels, toolbar, feed, checklist, mentor, vitals monitor |

Add `?fx=low` to the URL to turn off depth of field and bloom on slower GPUs.

See [`PLAN.md`](PLAN.md) for the milestone plan.
