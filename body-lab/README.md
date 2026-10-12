# Body Lab

**A 3D body you can explore, with physiology you can run.** A whole BodyParts3D body (nearly 900
structures) stands in a dark gallery. Orbit, zoom and pan; hover anything for its name; click to select
it; switch layers (skeleton, muscles, organs, brain, vessels) or X-ray. Six glowing hotspots open
exhibits that run a small, published physiology model live **on the real organs**: the heart beats at
your heart rate, the lungs breathe, a nerve impulse races from heel to brain, the femur heats under
load, the pancreas fades with the drug, the amygdala fires before the cortex. Every exhibit also has
an apparatus **on the bench**: a museum-style rig on a glowing plinth. Every number on screen comes
from tested code.

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # physiology model tests
npm run build   # typecheck + production build in dist/
```

Use the hotspots, arrows, ← → keys or tabs to move between exhibits; Esc goes back. Deep links:
`#explore`, `#heart`, `#airways`, `#nerve`, `#hip`, `#halflife`, `#reaction`, and `/bench` for the
apparatus (e.g. `#hip/bench`). Add `?lite` to the URL to turn off the reflective floor and bloom on
slow devices. Muscles (5 MB) load only when that layer is first switched on.

## The exhibits

| # | Exhibit | Model | Anatomy |
|---|---|---|---|
| 01 | The Heart Pump | Cardiac output = rate × stroke volume; mean pressure ≈ output × vessel resistance + venous pressure | Heart (BodyParts3D) |
| 02 | The Airway Tree | 23 generations of branching (Weibel), Murray's law diameters, mean air speed = flow ÷ total area | Lungs (BodyParts3D) + model tree |
| 03 | The Nerve Signal | Hursh's rule (≈ 6 m/s per µm, myelinated); ≈ 1.6·√d m/s unmyelinated | Model axon |
| 04 | The Hip Load | Peak hip contact force × body weight from instrumented implants (Bergmann 1993, 2001) | Left femur (BodyParts3D) |
| 05 | The Half-life Race | Fraction left = ½^(t / half-life) for GLP-1, exenatide and semaglutide | – |
| 06 | Fast and Slow | Your reaction time against the amygdala's ~74 ms and the N400's ~400 ms | Brain (BodyParts3D) |

All are teaching models: simplified so they run live, with their sources listed in the app under
**Credits & sources**. Educational only, not medical advice.

## Data

Body meshes: **BodyParts3D, Copyright© 2008 ライフサイエンス統合データベースセンター licensed by
CC表示-継承2.1 日本** (Database Center for Life Science, CC BY-SA 2.1 JP), via
[Human Atlas](../human-atlas). They are copied in at build time.
