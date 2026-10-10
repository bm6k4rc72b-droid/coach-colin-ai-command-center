# Peptide Journey

**Where peptides go in the body.** Pick a real peptide hormone or medicine and follow it through a 3D
body (real BodyParts3D anatomy): where it starts, how it travels through the blood, which organs it
acts on, and what clears it, on a timeline that runs from one second to thirty days.

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # pharmacokinetics and anatomy-mapping tests
npm run build   # typecheck + production build in dist/
```

## The peptides

| Peptide | Type | Half-life | Starts | Acts on |
|---|---|---|---|---|
| GLP-1 | Natural hormone | ~2 min | Small intestine, colon | Pancreas, stomach, brain |
| Insulin | Natural hormone | ~5 min | Pancreas | Liver, skeletal muscle |
| Ghrelin | Natural hormone | ~10 min | Stomach | Brain appetite centres, pituitary |
| Vasopressin (ADH) | Natural hormone | 10–20 min | Hypothalamus → pituitary | Kidneys, blood vessels |
| ANP | Natural hormone | 2–4 min | Heart | Kidneys, vessels, adrenal glands |
| Secretin | Natural hormone | a few minutes | Duodenum | Pancreas, liver, stomach |
| Semaglutide | Medicine | ~1 week | Injection | Pancreas, stomach, brain, heart |
| Tirzepatide | Medicine | ~5 days | Injection | Pancreas, stomach, brain |
| Exenatide | Venom-derived medicine | ~2.4 h | Injection | Pancreas, stomach, brain |
| Teriparatide | Medicine | ~1 h | Injection | Bones, kidneys |

Each card shows the journey step by step (click any stop to fly the camera there), the engineering
trick behind each medicine, a fact, its approval status and sources.

## The timeline

Blood levels come from a one-compartment model built from each peptide's published half-life and time to peak:

- **Injected medicines** use first-order absorption from the depot under the skin (the Bateman function), with the absorption rate solved from the published time to peak.
- **Natural hormones** are secreted for a typical window after their trigger, then fall at their own half-life.

Curves are normalised to their own peak, so they show timing, not amounts. For the GLP-1 medicines, natural
GLP-1 is overlaid as a dashed curve: two minutes against a week. Tests check that every curve peaks
at the published time and then halves once per half-life, and that every organ named in the data exists
as a mesh.

## Data

Body meshes: **BodyParts3D, Copyright© 2008 ライフサイエンス統合データベースセンター licensed by
CC表示-継承2.1 日本** (Database Center for Life Science, CC BY-SA 2.1 JP), via
[Human Atlas](../human-atlas), including its "Organs & glands" system. They are copied in at build time.

Educational only. No dosing information, and not medical advice.
