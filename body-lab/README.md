# Body Lab

**A gallery of interactive physiology exhibits.** Six apparatus stand on glowing plinths in a dark
room. Each one is built on real BodyParts3D anatomy and runs a small, published physiology model live,
so every number on screen comes from tested code.

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # physiology model tests
npm run build   # typecheck + production build in dist/
```

Use the arrows, the ← → keys or the tabs to move between exhibits. Each has a deep link
(`#heart`, `#airways`, `#nerve`, `#hip`, `#halflife`, `#reaction`). Add `?lite` to the URL to turn off
the reflective floor and bloom on slow devices.

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
