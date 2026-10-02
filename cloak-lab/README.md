# Cloak Lab: invisibility, sensors and EMP hardening (educational)

An interactive lab about how close today's technology gets to an invisibility cloak, and why it
still fails. Real AI models run in the browser. The physics is simplified but honest.

> **Educational demonstration.** Software cloaks only alter video; they do not hide anyone in the
> real world. The EMP section is defensive and conceptual: it teaches protection, not how to
> create pulses. It is not a tool for evading lawful surveillance. Webcam video is processed
> locally and never uploaded.

## Run it

```bash
cd cloak-lab
npm install
npm run dev        # http://localhost:5173 (fetches the AI runtimes first)
npm test           # Vitest
npm run build      # typecheck + build into dist/
```

`scripts/fetch-models.mjs` runs before `dev` and `build`. It self-hosts the in-browser AI:

- the MediaPipe Tasks Vision WASM runtime, copied from `node_modules`;
- the COCO-SSD weights, downloaded once from Google's tfjs-models storage.

Both are git-ignored. If either is missing, the app falls back to the public CDNs. The MediaPipe
selfie-segmentation model (`public/models/selfie_segmenter.tflite`, Apache-2.0, about 250 KB) is
committed with the app.

## The five modules

| Tab | What you do | What's real |
|---|---|---|
| **1 · AI Stack** | Browse today's tools, labelled Shipping, Prototype, Research or Fiction. Build a pipeline and check whether it fits a 30 fps budget. | Catalogue entries cover MediaPipe, COCO-SSD/YOLO, SAM 2, LaMa/ProPainter, Depth Anything, Gaussian splatting, thermal, radar, Wi-Fi sensing, adaptive tiles, lens and metamaterial cloaks, and AI coding assistants. |
| **2 · Live Cloak** | Store a clean plate, then switch between clean plate, refraction shimmer, adaptive camo and mask-debug modes. Break the illusion with lighting changes or camera shake. Watch per-stage timings. | **Webcam mode runs Google MediaPipe person segmentation and TensorFlow.js COCO-SSD person detection in your browser.** Synthetic mode uses a drawn actor with a simulated segmenter and a pixel-evidence detector. |
| **3 · Spectrum Lab** | Pick an optical, thermal, radar and acoustic loadout plus a gait, then cross past a guard post. | Visible and thermal cameras use Johnson criteria. Radar uses the radar equation with Doppler filtering. The microphone model uses spreading loss, and Wi-Fi motion sensing is included. |
| **4 · EMP Lab** | Choose enclosure, filters, fibre and isolation for each device, then simulate a pulse. | A conceptual coupling model: field × conductor length, shielding in dB, clamped let-through, and E3 for long lines. Units are relative. |
| **5 · Quiz** | Six questions with explanations. | — |

A **guided tour** (14 narrated steps) drives every module through the same actions as the buttons.
It ends with the EMP-hardened cloak surviving a pulse in the live view.

## What it teaches

1. **The AI does one narrow job.** A segmentation network labels your pixels. "Invisibility" is
   plain compositing on top of that, and it breaks when the camera or the light changes.
2. **Fooling a detector fools the video, not the world.** The red-team detector drops to ~0% on
   the cloaked output, while the real room and other sensors are unaffected.
3. **Invisibility is per band.** An optical cloak does nothing for thermal, radar, sound or Wi-Fi.
   An active display skin even makes you warmer. Even the full loadout leaves a high chance of
   detection, at a cost of 13 kg and 210 W.
4. **Electronics need hardening.** Long conductors collect energy. Enclosures, filters, fibre and
   isolation are the defences.
5. **Where language models fit.** They are too slow for a 33 ms frame loop, but they are excellent
   at building and testing the pipeline. This lab was written with Claude Code.

## Architecture

```
src/config/lab.ts      every constant (cloak pipeline, sensors, EMP, enclosures)
src/core/              pure, unit-tested logic: cloakMath (mask ops, compositing, evidence),
                       spectrum (sensor physics), emp (hardening), techStack (+ latency budget),
                       quiz, tour (narrated steps over an actions interface), store
src/ai/                MediaPipe segmenter, COCO-SSD detector (lazy-loaded), synthetic camera
src/scene/             Three.js Spectrum Lab scene
src/ui/                tab views
tests/                 Vitest (35 tests)
```
