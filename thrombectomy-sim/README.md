# Stroke Code: mechanical thrombectomy simulator

A browser-based **educational** simulator of mechanical thrombectomy for acute ischaemic stroke
caused by a large-vessel occlusion. You run the code stroke: imaging, blood pressure,
thrombolysis, eligibility and anaesthesia. Then you go to the angio suite and remove the clot
through a catheter from the groin, and get a scored debrief.

> **For education and demonstration only.** Anatomy, clot behaviour and outcomes are simplified
> teaching models. This is not clinical training, it is not validated for skills assessment, and
> it is not medical advice. The start screen says the same.

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # anatomy, eTICI, physiology, pass model, triage grading, autopilot on every case
npm run build
```

## Cases

| Case | Teaching point |
| --- | --- |
| Left M1 · early window (67F, 1 h 35 min) | Lower BP to ≤ 185/110, then thrombolysis. CT + CTA is enough within 6 h. Thrombolysis does not replace thrombectomy (HERMES). |
| Wake-up stroke · late window (72M, 10.5 h) | No standard thrombolysis. Perfusion imaging selects patients (DAWN, DEFUSE-3). The firm "white" clot defeats aspiration alone. |
| ICA terminus · large core (74F, ASPECTS 4) | Large-core trials (SELECT2, ANGEL-ASPECT, RESCUE-Japan LIMIT, TENSION). Poor collaterals mean a fast-growing core. A type III arch is hard to catheterise. |

## The procedure

**Navigation**
- Advance the balloon guide up the aorta, rotating the tip to pick the left common carotid and
  then the internal carotid. Wrong vessels are flagged.
- The guide stops below the skull base.

**Crossing and positioning**
- The microcatheter and wire go through the carotid siphon and across the clot.
- The aspiration catheter follows to the clot face. It can't enter vessels too small for it.

**The pass**
- Deploy a stent retriever (20, 30 or 40 mm) across the clot and let it embed.
- Inflate the balloon guide for flow arrest, aspirate, then retrieve.
- Each pass is resolved by a clot-composition × technique model. The model rewards flow arrest,
  embedding time, full stent coverage and an aspiration catheter at the clot face. It penalises
  repeat passes and long clots. The panel shows the odds and the reasons for each pass.

**Angiography and outcomes**
- DSA in AP or lateral view shows contrast flowing from the guide tip, stopping at occlusions,
  with capillary blush where tissue is perfused.
- After each pass you grade the run yourself (eTICI 0–3) and the app checks your grade.
- The core grows on the clock at a collateral-dependent rate. Reperfusion stops it.
- The debrief shows final infarct volume and the chance of independence (mRS 0–2) compared with
  no thrombectomy. It also covers door-to-groin and groin-to-reperfusion times, the first-pass
  effect, complications (distal emboli, emboli to a new territory, vasospasm, wire perforation)
  and lessons.

**Watch demo** runs the whole case through the same API the buttons use, with narration.

## Controls

| Keys | Action |
| --- | --- |
| `1` `2` `3` | balloon guide · aspiration catheter · microcatheter + wire |
| `W`/`S` or ↑/↓ (hold, `Shift` = fine) | advance / retract |
| `A`/`D` or ←/→ | rotate tip 30° (selects the branch at the next junction) |
| `R` | run a DSA |

Touch screens use the on-screen buttons.

## Code map

| Area | Files |
| --- | --- |
| Arterial tree, branch selection | `src/core/anatomy.ts` |
| Contrast reach, perfused fraction, eTICI | `src/core/angio.ts` |
| Core growth, final infarct, mRS 0–2 model | `src/core/physiology.ts` |
| Pass odds by technique and clot | `src/core/thrombus.ts` |
| Case state machine and clock | `src/core/sim.ts` |
| Narrated autopilot | `src/core/demo.ts` |
| Debrief | `src/core/debrief.ts` |
| Three.js 3D view, DSA canvas | `src/scene/` |
