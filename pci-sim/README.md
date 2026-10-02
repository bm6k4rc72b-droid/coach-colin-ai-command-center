# PCI Simulator: mid-LAD stenting via right radial access

A browser-based **educational** simulator of percutaneous coronary intervention (PCI) for medical
students. You stent a 90% mid-LAD stenosis through right radial access: guide catheter up the arm,
engagement of the left main, wiring, pre-dilation, stent deployment and final angiography, with a
scored debrief.

> **For education and demonstration only.** This is a simplified teaching model. It is not
> clinical training, it is not validated for skills assessment, and it is not medical advice.
> The start screen says the same.

## Run it

```bash
cd pci-sim
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest unit tests
npm run build      # typecheck (tsc --noEmit) + production build into dist/
```

There is no backend. All state is held in memory.

## The case

The patient is a 68-year-old 80 kg man with exertional angina despite medical therapy. Stress
testing shows anterior ischaemia. He has a focal 14 mm, 90% diameter stenosis in the mid LAD
between D1 and D2. The reference diameter there is ≈ 2.95 mm.

| Stage | Sub-tasks (each latches once done) |
|---|---|
| 1 Advance guide to aortic root | past the elbow · into the aorta · look on fluoro · reach the root |
| 2 Engage left main | face the left cusp · seat gently · diagnostic angiogram |
| 3 Cross the LAD lesion | heparin · wire out · LAD not LCx · cross gently · park distally |
| 4 Pre-dilate | markers across lesion · ≥ 6 atm over lesion · deflate |
| 5 Deploy stent | QCA · stent loaded · cover whole lesion · deploy · deflate |
| 6 Final angiogram | inject after stent · second distinct projection |

Tools unlock by stage, and a locked tool shows why it is locked on hover or press.

## Controls

| Keys | Action |
|---|---|
| `1`–`7` | guide, wire, balloon, stent, contrast, fluoro, measure |
| `W`/`S` or wheel | advance / retract (hold `Shift` for fine control) |
| `A`/`D` | rotate guide or wire tip |
| `E` (hold) / `Q` | inflate (`Shift` = fine) / deflate |
| `G` | heparin |
| `5` or `C` | contrast injection (cine) |
| `Space` or `6` (hold) | fluoroscopy pedal |
| `Tab` | 3D ↔ X-ray |
| `V`, arrows | C-arm presets, fine angles |
| `F` · `L` · `H` · `M` · `N` · `Esc` | follow tip · labels · help · mentor · sound · pause |
| drag · `Ctrl`+wheel | orbit · zoom |

On touch screens, use the toolbar and the hold buttons in the device panel.

**Demo mode** ("Watch a demo first") runs the whole case through the same input path as the
learner and narrates each step. Any key, click or wheel hands control back to you. A complete demo
run ends with an Excellent debrief.

## Architecture

The simulation (sizing, flow, scoring, stages, devices, physiology) is written as pure TypeScript
with no Three.js or DOM. The whole case runs headless, and the tests drive it the same way the UI
does.

```
src/config/anatomy.ts   every anatomy, lesion, device, fluoro, contrast, physiology constant (1 unit = 1 mm)
src/anatomy/            heart surface (v, φ), vessel tree + access rail, lumen profiles & QCA, vector maths
src/physics/            1D coronary rail, guide, wire, balloon/stent, flow & contrast transit, physiology + ECG,
                        device polylines
src/tools/              tool rules & unlocking, input controller, 3D hover picking
src/procedure/          Simulation (state + step), stages, snapshot, mentor hints, debrief, demo autopilot
src/scene/              renderer, 3D world + orbit camera + C-arm, fluoro world (X-ray materials, pulsed
                        frames, post-process, LIH), vessel and device meshes, tube geometry
src/ui/                 start/help/pause/debrief overlays, HUD, checklist, mentor, vitals/ECG, toolbar,
                        device panel, labels
src/audio/              QRS beep + two-tone alarm (Web Audio)
src/state/store.ts      single in-memory state + subscribe/emit
tests/                  Vitest unit tests (70)
```

### Models (deliberately simple)

- **Lesion.** The lesion is cosine-tapered with a 3 mm plateau at 90% diameter stenosis (DS).
- **Balloons.** Balloons are semi-compliant: Ø = nominal × (1 + c × (P − nominal)), smaller while
  unfolding below 2 atm. The pre-dilation balloon is 1.5%/atm (nominal 8, RBP 14). The stent
  balloon is 1.2%/atm (nominal 10, RBP 16). Balloons rupture at RBP + 4 atm.
- **Lumen.** A balloon stretches the lumen while it is inflated. Afterwards a plain balloon leaves
  the lumen open minus 30% recoil, and a stent holds it at its expanded size minus 3%. Ends taper
  smoothly.
- **Flow.** `flowFactor(DS)` is 1 below 60%, falls as 1 − x³ and reaches 0 at ≥ 98%. TIMI grades
  are 3 at ≥ 0.8, 2 at ≥ 0.25 and 1 above 0.02. The untreated lesion gives TIMI 2.
- **Contrast transit.** Contrast fills ring by ring, limited by the tightest narrowing upstream.
  Branches inherit it. An inflated balloon stops flow beyond it, including D2. An unsealed
  dissection multiplies downstream flow by 0.45.
- **Dissection.** A dissection can be caused by a forced wire (hidden risk, rolled when the wire
  crosses), or by a device larger than 1.2 × reference. For a stent this is an edge dissection
  just beyond its distal end. A balloon rupture can also dissect. A stent covering the flap seals
  it.
- **Physiology.** Ischaemia builds over about 20 s of LAD occlusion and recovers with τ ≈ 8 s. It
  drives ST elevation in V2 (up to 4 mm), chest pain and HR. After 40 s of occlusion come PVCs and
  a BP drop. After 60 s the patient is unstable, the alarm sounds and "Deflate now" appears.
  Heparin takes the ACT from 128 s to about 285 s.

### Scoring

`buildDebrief(summary)` is a pure function that returns a 0–100 score, a grade
(Excellent / Good / Acceptable / Needs work / Incomplete), a headline and 15 items. Each item has
a value, an ok/warn/bad status and a teaching point. The items are residual stenosis, TIMI flow,
stent : reference ratio, coverage margins, extra stents, heparin, pre-dilation, QCA, dissection,
wire forcing, balloon rupture, longest inflation, contrast volume, fluoro time and final views.

### Try a bad case

Do pre-dilation and QCA, then pick a **3.5 × 12 mm** stent, centre it and inflate to **16 atm**.
The stent is 1.27 × reference, so it raises an edge dissection beyond its distal end. You will
see lingering contrast stain on fluoro and a dark flap in 3D, and flow drops to TIMI 2. The 12 mm
stent cannot cover the 14 mm lesion (geographic miss), and the debrief grades the case
**Needs work**. A second stent placed over the flap (bailout) seals it. This exact scenario is
covered in `tests/procedure.test.ts`.
