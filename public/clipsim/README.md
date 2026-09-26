# CLIPSIM — IC-PC Aneurysm Clipping Simulator · by Coach Colin

> **Education and demonstration only.** This is not clinical training, not a
> medical device and not medical advice.

A browser-based view through an operating microscope of microsurgical clipping of a right
internal carotid–posterior communicating artery (IC-PC) aneurysm via a pterional,
transsylvian approach. There is no build step: native ES modules and a vendored Three.js r168.

## Run

- `./start.sh` at the repo root, then open <http://localhost:4173/clipsim/>
- or any static server pointed at `public/`, e.g. `python3 -m http.server -d public 8000` → `/clipsim/`

## Use it

1. Tick the disclaimer, then **Enter the microscope**, or **Watch the demo**.
2. Follow the checklist (left) and the mentor (bottom right). Tools are on keys **1–0**.
3. **▶ Demo** plays the case from the current stage. Any click or key hands control back to you.
4. **End case** (or finishing stage 6) opens the debrief: time, blood loss, temporary occlusion,
   rupture, the clip result checked point by point, a score, and specific tips.

| Key | Tool | Key | Tool |
|---|---|---|---|
| 1 | Suction | 6 | Aneurysm clip (C straight/curved, Q/E rotate, A/D tilt, Z/X depth, Enter apply) |
| 2 | Micro scissors | 7 | ICG videoangiography |
| 3 | Bipolar | 8 | Micro Doppler |
| 4 | Dissector | 9 | Endoscope (picture-in-picture) |
| 5 | Brain spatula | 0 | Temporary clip (proximal ICA) |

Microscope controls: right-drag tilts, middle-drag or Shift+right-drag pans, the wheel zooms, **F** focuses, **R** resets, and **L** shows labels.

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
| `procedure/` | event bus, the six stage definitions (`stages.js`), the stage engine, and the demo director |
| `ui/` | i18n (EN/日本語), inspector, labels, toolbar, feed, checklist, mentor, vitals monitor, debrief |

Quality adapts automatically: slow frames turn off depth of field, then bloom. Add `?fx=low` to force the light mode.

See [`PLAN.md`](PLAN.md) for the milestone plan.

## How clipping is graded

`physics/clipEval.js` tests each applied clip's closed blade line against the anatomy:

- **Neck closure.** The neck is graded as a footprint on the ICA wall, an ellipse elongated along the ICA. The blades must span it at 0.3–1.2 mm above the wall.
- **Residual neck.** Blades placed up on the sac, tips short of the far edge, or a clip across the ICA (dog ears) all leave a residual neck.
- **ICA narrowing.** Blades that bite into the lumen, or a misaligned clip that kinks the wall, narrow the parent artery.
- **Branches.** A blade on the PCom origin (at the proximal edge of the neck) or on the AChA kinks or occludes it.

The result drives `Flow`. ICG fill, Doppler, MEP and bleeding all follow from it, and the grade itself appears only in the debrief.
