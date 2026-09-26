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
| `physics/` | heart clock and pulse waveform (later: flow, bleeding, rupture risk) |
| `ui/` | i18n (EN/日本語), hover inspector, anatomy labels |
| `tools/`, `procedure/`, `audio/` | arriving in milestones M2–M5 |

See [`PLAN.md`](PLAN.md) for the milestone plan.
