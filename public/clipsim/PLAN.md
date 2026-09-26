# IC-PC Aneurysm Clipping Simulator — Plan

**by Coach Colin** · Educational demonstration only. It is not clinical training and not medical advice.

A browser simulator of microsurgical clipping of a right internal carotid–posterior
communicating artery (IC-PC) aneurysm through a pterional, transsylvian approach,
viewed as if through an operating microscope.

---

## 1. Stack decision: no build step

You said to skip the Vite build if the app still works without it. This repo already
serves no-build apps from `public/` (`cinematicx/`, `armory/`), so the simulator lives
at **`public/clipsim/`** and uses:

- **Native ES modules + TypeScript-style JSDoc types.** Browsers run the modules
  directly, with no compiler or bundler.
- **Three.js 0.168 through an import map**, pinned to the version `cinematicx` uses.
  The `three/addons` files supply `EffectComposer`, `BokehPass`, `UnrealBloomPass`
  and a custom vignette/grade shader.
- **Web Audio API** for the Doppler tones and alarms, synthesised in code with no
  audio files.
- **No backend.** All state stays in memory.

Deploy: the existing Pages workflow already copies `public/`, so the app goes live at
`…github.io/coach-colin-ai-command-center/clipsim/`. Locally it runs at
`http://localhost:4173/clipsim/` under `./start.sh`, or with `npx vite` / any static server.

**Decided:** no-build (Coach Colin delegated the call). Three.js r168 is vendored in
`vendor/`, so the app needs no CDN and works offline.

## 2. Module layout

```
public/clipsim/
  index.html            start screen with disclaimer, HUD shell, import map
  main.js               boot and main loop
  config/anatomy.js     ALL anatomy sizes, positions and colours (tune here)
  scene/                renderer, microscope camera, lights, post-FX, holo grade
  anatomy/              lobes, fissure, arachnoid, vessels (TubeGeometry), nerves,
                        aneurysm + bleb, spatulas, glossy pulsating materials
  tools/                one file per tool: cursor model, hover rule, action
  procedure/            stage machine, goals, demo-mode script, scoring
  physics/              flow model (which vessels fill), rupture risk,
                        bleeding sources, blood particles, pooling layer
  audio/                Doppler synth, alarms, UI ticks
  ui/                   toolbar, checklist, mentor, vitals + ECG canvas,
                        endoscope PiP, debrief, i18n (EN / 日本語)
```

## 3. Visual direction

- **Microscope look:** circular optical vignette, shallow depth of field focused on the
  cursor target, soft bloom on wet highlights, a warm key light from the scope,
  and slight chromatic fringing at the edge.
- **Holographic / anamorphic cinematic grade** across the scene and UI:
  - teal-to-magenta split toning
  - horizontal anamorphic lens streaks on specular highlights
  - iridescent cyan/violet/amber accents on the thin panel borders
  - monospace neon numerals
- **Tissue colours stay readable.** Arteries stay red and nerves stay cream, so
  learners can still recognise the anatomy.
- **Higgsfield** (optional): generate one cinematic title-screen backdrop and one
  short looping video for the start screen. This spends your Higgsfield credits, so
  I'll only do it after you say yes. The app works fully without it.

## 4. Anatomy model (procedural, right side, surgeon's view)

These are simplified geometric shapes for teaching, not patient data. Every value lives in `config/anatomy.js`.

- **Lobes.**
  - Frontal and temporal lobes are deformed spheres with gyral noise.
  - The sylvian fissure runs between them.
  - The arachnoid over the fissure is a set of ~12 thin, cuttable patches.
- **Vessels.** Each is a TubeGeometry on a Catmull-Rom spline:
  - ICA (≈4 mm)
  - M1, and two M2 trunks
  - A1
  - PCom (≈1.2 mm)
  - Anterior choroidal artery (≈0.8 mm)
- **Nerves.** The optic nerve runs medial to the ICA. The oculomotor nerve (CN III)
  runs below the PCom and the aneurysm.
- **Aneurysm.**
  - 6.6 mm dome at the IC-PC junction.
  - It projects posterolaterally and inferiorly.
  - It has a small bleb on the dome.
  - A neck ring is defined for clip evaluation.
- **Tissue.** Materials are MeshPhysicalMaterial with clearcoat to look wet. Vertices
  pulse in sync with the simulated heart rate.
- **Retraction.** Two brain spatulas hold the frontal and temporal lobes apart.

## 5. Interaction rules (summary)

| Key | Tool | Rule |
|---|---|---|
| 1 | Suction | Lowers pooled blood under the cursor. Too close to the dome raises rupture risk. |
| 2 | Micro scissors | Cuts an arachnoid patch. Cutting near a vessel risks a small bleed. |
| 3 | Bipolar | Stops oozing points. It is ineffective on arterial rupture. |
| 4 | Dissector | Frees neck adhesions (the progress ring fills). Rough, fast drags raise rupture risk. |
| 5 | Spatula | Adjusts retraction depth. Over-retraction lowers MEP. |
| 6 | Aneurysm clip | Straight/curved (C); position with the mouse, rotate with the wheel, blade depth with Shift+wheel, apply with Enter or a click. |
| 7 | ICG | Fluorescence view: filled vessels glow and a blocked segment stays dark. |
| 8 | Micro Doppler | Pulsatile tone on a vessel with flow, silence on an occluded one. |
| 9 | Endoscope | PiP view from behind the aneurysm, showing the neck, PCom and AChA. |
| 0 | Temporary clip | Placed on the ICA. Reduces bleeding and starts the occlusion timer. |

**Camera controls:**
- Right-drag to orbit within a limited cone, so the view stays like looking down the scope.
- Wheel to zoom when no clip tool is active.
- Middle-drag to pan.
- F focuses on the target under the cursor.

## 6. Procedure stages (each unlocks when its goals are met)

1. **Open the sylvian fissure.** Cut ≥ 80 % of the arachnoid patches and keep the field dry.
2. **Identify M1.** Doppler or hover-inspect M1.
3. **Identify the ICA and optic nerve.** Touch both.
4. **Confirm the PCom and dissect the neck.** Touch the PCom, then reach 100 % neck dissection.
5. **Clip the aneurysm.** Apply the permanent clip.
6. **Confirm PCom patency.** Run ICG and Doppler on the PCom and AChA.

**Demo mode** runs a scripted sequence that moves a ghost cursor through each stage.
Any click or tool key hands control to you at the current stage.

## 7. Physiology and bleeding

- **Vitals:**
  - Live ECG canvas trace.
  - HR, arterial BP, SpO₂, operation time, temporary-occlusion timer, EBL and MEP %.
  - Values drift with smoothed noise.
  - Bleeding lowers BP and raises HR.
  - Temporary occlusion longer than ~5 min slowly drops MEP.
  - An ICA-narrowing clip or an occluded AChA drops MEP.
- **Rupture risk.** A hidden 0–1 value, raised by dome contact, dissector speed and
  suction proximity. Crossing a stochastic threshold ruptures the aneurysm.
- **Bleeding sources:**
  - Ooze: slow, and bipolar stops it.
  - Arterial rupture: fast, only reduced by a temporary clip, and only stopped by a
    definitive clip.
- **Blood rendering.** Blood particles are pooled into a rising, glossy, height-mapped
  layer that hides anatomy until you suction it.

## 8. Clip evaluation

The clip's geometry is tested against the neck ring and the parent vessels:

- neck closure %
- residual neck
- ICA narrowing
- PCom and AChA patency

The result shows up in the physics: ICG fill, Doppler sound and the endoscope view.
A text summary only appears in the debrief.

## 9. Debrief

The debrief shows:

- total time
- EBL
- temporary occlusion time
- rupture (yes/no)
- clip grade

It ends with 3–5 specific tips drawn from what happened. For example: "Your
temporary occlusion ran 7:40; aim for under 5 minutes."

## 10. Milestones (each one runnable)

- **M1** Scene, microscope camera, post-FX grade, procedural anatomy, config file, start screen with disclaimer, EN/JA toggle.
- **M2** Toolbar with keys 1–0, cursor models, hover highlight, all tool interactions (placeholder effects where later systems are needed).
- **M3** Stage machine, checklist panel, collapsible mentor panel with sub-tasks and %.
- **M4** Vitals panel and ECG, bleeding, ooze, rupture, suction and pooling, temporary clip timer, alarms.
- **M5** Clip placement and evaluation, ICG fluorescence, Doppler audio, endoscope PiP.
- **M6** Debrief, demo mode, polish and performance pass, README entry.

After each milestone I serve the app, check the console in headless Chromium for
errors, fix what I find, push, and send you a short "what to test" list.

## Open question

- Should I spend Higgsfield credits on a title backdrop and loop (optional)? Currently skipped.
