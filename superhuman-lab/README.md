# Superhuman Gene Lab

**Fiction built on real science.** Build a being from nine real human gene variants and watch a
3D body (real BodyParts3D anatomy) change. Each gene card says what the variant really does, who
carries it, what it costs, and where the evidence comes from. A **Reality ↔ Fiction** dial
exaggerates the visuals for the "superhuman alien" version and labels everything past zero as not real.

```bash
npm install
npm run dev     # http://localhost:5173
npm test        # gene-data and effect tests
npm run build   # typecheck + production build in dist/
```

## The genes

| Power | Gene | Real effect | The cost |
|---|---|---|---|
| Double muscle | MSTN (myostatin) loss | Unusually large muscles (one reported child; Belgian Blue cattle, "bully" whippets) | Difficult births and lower fertility in cattle; cramping in dogs; long-term human effects unknown |
| Sprint fibres | ACTN3 R577 | Working copies are near-universal in elite sprinters; small effect | The "deficient" form tolerates cold better and may suit endurance |
| Unbreakable bones | LRP5 G171V | Very high bone density; no fractures reported in the family | Wide jaw, bony growth on the palate |
| Thin-air lungs | EPAS1 (Tibetan, from Denisovans) | Living at 4,000 m without thick blood | Little benefit at sea level |
| Short sleeper | BHLHE41/DEC2 P384R | About 6.25 h of sleep vs 8 h, with no apparent harm | Very few people studied; long-term effects unknown |
| HIV resistance | CCR5-Δ32 (two copies) | Highly resistant to common HIV-1 strains | Higher risk of severe West Nile virus; the 2018 embryo edits were condemned |
| Clean arteries | PCSK9 loss | LDL down 15–28%; coronary disease down 47–88% | Small increase in diabetes risk |
| Feels no pain | SCN9A loss | Complete absence of pain | Severe unnoticed injuries, loss of smell; the cautionary card |
| Malaria shield | HBB sickle trait | About 90% protection from severe malaria | Two copies cause sickle cell disease |

Full citations are on each card and in `src/data/genes.ts`.

## How the body shows it

Real effects are shown as gentle, illustrative changes: muscle and bone grow, and systems that work
differently glow in the gene's colour. Feeling no pain greys out the nervous system. Clicking a
glowing part opens the gene responsible. The Body, Skeleton and Organs views switch automatically to
show what a gene changes. Past 50% on the dial, an alien palette unlocks.

## Data and honesty

- Body meshes: **BodyParts3D, Copyright© 2008 ライフサイエンス統合データベースセンター licensed by
  CC表示-継承2.1 日本** (Database Center for Life Science, CC BY-SA 2.1 JP), via
  [Human Atlas](../human-atlas). They are copied in at build time, not duplicated in git.
- Every gene lists its trade-offs and sources. The fiction dial changes visuals only and is always labelled.
- Educational and entertainment use. Not medical or genetic advice.
