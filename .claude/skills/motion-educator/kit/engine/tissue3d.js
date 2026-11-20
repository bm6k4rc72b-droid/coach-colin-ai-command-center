// Skeletal muscle at every scale, built procedurally but to histology and electron microscopy: the muscle in
// section, a fascicle, one muscle fibre (cell), a myofibril, the sarcomere's filament lattice and the molecules of
// the overlap zone, plus the two things that matter for training: a fibre that grows (myofibrils added, the
// cross-section widening) and a satellite cell fusing (its nucleus joining the fibre).
//
//   import { createParts } from "../../kit/engine/parts3d.js";
//   import { createTissue } from "../../kit/engine/tissue3d.js";
//   const P = createParts(space);
//   const T = createTissue(space, P);
//   const fibre = T.fibre({ diameter: 50 });            // a THREE.Group, axis along +z, cut end at z = 0
//   space.scene.add(fibre);
//   tl.to(fibre.userData.state, { grow: 1, duration: 3 }, s.s05.start);   // states are plain numbers to tween
//   film.each((t) => { T.update(); space.render(1, t); });               // T.update() before each render
//   T.lens(space, 120);                                // camera near/far for a view this many µm across
//
// One unit everywhere: 1 world unit = 1 µm (`userData.unit === "µm"` on every group). A whole small muscle is
// thousands of units across and a thin filament 0.007: the film chooses the scale by camera distance and calls
// T.lens() so the depth range suits it. Every group is named, its parts are named children, and
// `userData.dims` records the real sizes it was built at (µm), `userData.sources` the facts behind them.
//
// Builders (each returns a THREE.Group; `group.userData.state` holds the numbers a timeline tweens):
//   T.muscle({ radius, length, fascicles, stagger, seed })            muscle in section: epimysium, fascicles in
//                                                                       perimysium, arterioles, venules, nerves
//   T.fascicle({ fibres, diameter, length, stagger, seed })            fibres as irregular polygons, endomysium,
//                                                                       capillaries at the fibre corners, nuclei
//   T.fibre({ diameter, length, sr, grow, fuse, contract, seed })      one cell: sarcolemma, basal lamina, peripheral
//                                                                       flattened nuclei, striations, satellite cell,
//                                                                       myofibrils + mitochondria at the cut end, SR/T
//                                                                       state: { grow, fuse, contract, glowNew }
//   T.myofibril({ sarcomeres, diameter, sr, contract })                banded chain of sarcomeres, SR sleeve, triads,
//                                                                       paired mitochondria, filament lattice at the cut
//                                                                       state: { contract }
//   T.sarcomere({ radius, contract, heads, slab })                     the filament lattice Z to Z: thick (myosin) with
//                                                                       helical heads and bare zone, thin (F-actin,
//                                                                       tropomyosin, troponin), Z-disc zig-zag, M-line,
//                                                                       titin. state: { contract, heads }
//   T.overlap({ length, heads })                                       molecular close-up of the overlap zone: one thick
//                                                                       filament and its six thin filaments, monomer by
//                                                                       monomer. state: { heads }
//
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
// FACTS (each number with its source; [S#] keys below). Sizes in µm unless marked nm.
//
// Muscle and its sheaths
//   - Epimysium (dense connective tissue around the whole muscle, carries the neurovascular supply), perimysium
//     (wraps each fascicle; carries arterioles, venules and nerves larger than those in the endomysium; larger
//     arterial branches enter the muscle along perimysial laminae), endomysium (delicate reticular layer around each
//     fibre).                                                                                              [S1][S2]
//   - Endomysium 0.2-1.0 µm thick; interstitial space between fibres about 1 µm.                         [S3]
//   - Fibres per fascicle: 10-100 [S2], about 100-150 [S4]. Fibre profiles are polygonal, packing tightly. [S4]
//   - Capillaries sit at the corners of the fibres [S2]. Capillary-to-fibre ratio in human vastus lateralis
//     1.7-2.2, 4.9-5.7 capillaries around each fibre [S5] (ratio 1.9-2.1 in [S6]).
//   - Capillary outer diameter here 5.5 µm (lumen about 4 µm): a typical textbook value; not verified in a source
//     reachable from this session (ASSUMED).
// Muscle fibre
//   - Mature fibre diameter 10-100 µm [S7] (10-50 µm in other summaries [S7]); default here 50 µm.
//   - Sarcolemma = the fibre's plasma membrane; cytoplasm = sarcoplasm.                                   [S8]
//   - Myonuclei: post-mitotic, flattened and elongated, long axis parallel to the fibre axis [S9]; displaced to the
//     periphery just beneath the sarcolemma [S10]. About 100 to about 300 myonuclei per mm of fibre length
//     [S9][S11]. Size used here 11 x 4.5 x 1.6 µm (length x width x depth): an estimate from published
//     micrographs, no measurement found in this session (ESTIMATE).
//   - Satellite cells: small mononuclear cells with a high nuclear-to-cytoplasm ratio, heterochromatic nucleus,
//     wedged between the basal lamina and the sarcolemma.                                                 [S10][S12]
//   - Myofibrils about 1.2 µm in diameter [S8] (1-2 µm in other texts), hundreds to thousands per fibre, running
//     the fibre's whole length [S8][S13].
//   - Mitochondria: intermyofibrillar ones are slender and paired, confined to the I-band on both sides of the
//     Z-line, partly encircling the myofibrils; subsarcolemmal ones are spherical/ovoid, clustered beneath the
//     sarcolemma.                                                                                          [S14]
//   - Triads (one T-tubule between two terminal cisternae of the SR) sit at the A-I junction in mammals, so two
//     per sarcomere.                                                                                       [S15]
// Sarcomere
//   - Sarcomere length about 2 µm [S8]; 2.2 µm in frog sartorius, 2-3 µm Z to Z in lecture notes [S16]. Human:
//     optimal length 2.64 µm [S32], usually given as 2.8 µm [S33]; default rest length here 2.8 µm (H-zone
//     0.26 µm with human thin filaments), contracted 2.2 µm (thin filaments overlap past the M-line).
//   - Thick filament length about 1.65 µm, essentially constant across vertebrate muscles and species [S17];
//     1.6 µm used. Diameter 10-12 nm (backbone) in lecture notes [S16]; 15 nm used for the backbone with heads
//     folded (a common textbook value; the brief's figure).
//   - Myosin heads: crowns every 14.3 nm with a 42.9 nm helical repeat (three crowns) [S18]; three-stranded, three
//     head pairs per crown, each crown turned 40 degrees from the last [S19]. Two heads per myosin molecule [S20].
//     Bare zone (no heads) in the middle where the polarity reverses [S19]: about 0.16 µm used (210 nm reported in
//     tarantula; mammalian value not confirmed here) (APPROX).
//   - Thin filament length 0.95-1.40 µm across muscles and species [S17]; 1.19-1.37 µm in human deltoid and
//     pectoralis [S21]; human 1.27 µm with thick 1.60 µm [S32]. Default 1.27 µm (a parameter: `thin`/`thinL`).
//     Diameter 5-7 nm [S16]; 7 nm used.
//   - F-actin: two-stranded helix, crossovers about 36 nm apart, 13 monomers per crossover [S22]. Tropomyosin spans
//     seven actin monomers (38.5 nm); one troponin complex per tropomyosin; troponin in pairs every 38.5 nm;
//     actin : tropomyosin : troponin = 7 : 1 : 1.                                                           [S22]
//   - Lattice: thick filaments hexagonal, thin filaments at the trigonal positions (vertebrate muscle), so each
//     thick filament has six thin neighbours [S23]; thick-thick spacing about 40 nm [S23] (d10 x 2/sqrt 3).
//   - Z-disc: antiparallel actin filaments cross-linked by alpha-actinin, a zig-zag in longitudinal section;
//     30-50 nm wide in fast fibres (two Z-link layers), 100-140 nm in slow fibres (up to six layers).       [S24][S25]
//   - Titin spans each half sarcomere from the Z-disc to the M-band.                                      [S26]
//   - Myosin power stroke about 5-12 nm per head (lever-arm swing).                                      [S27]
//   - Sliding filaments: with shortening, the A-band keeps its length while the I-band and H-zone narrow; the
//     filaments themselves do not shorten.                                                                [S28]
// Hypertrophy
//   - Growth is radial growth of existing fibres with more myofibrillar protein; whether by enlarging, splitting or
//     new myofibrils (myofibrillogenesis) is debated; recent imaging argues for new myofibrils [S29][S30].
//     Hyperplasia (new fibres) is shown in some animals; evidence in humans is lacking [S31].
//   - Myonuclei cannot divide: satellite cells are the source of new nuclei, fusing with the fibre [S31]; type II
//     fibre hypertrophy over 30% with 9.5% myonuclear accretion reported after training [S31].
//   - grow = 1 here means +50% cross-sectional area (illustrative; within what long training reaches).
//
// Sources (fetched pages were blocked in this session; numbers were checked in search-result text):
//   [S1]  LibreTexts, Human Anatomy (Lange et al.) 8.03 Skeletal Muscle Organ Structure; Kenhub, Skeletal muscle histology.
//   [S2]  Kenhub / Ditki / vetscraft histology summaries (perimysium vessels; capillaries at fibre corners).
//   [S3]  Frontiers in Physiology 2020, 11:495 (review citing 1974 measurements of endomysium thickness).
//   [S4]  Human Kinetics, "Muscle structure and function" excerpt; sportsinjuryclinic.net skeletal muscle structure.
//   [S5]  Int J Sports Med 1990;11(2):99-102 (soccer players vs sedentary, vastus lateralis).
//   [S6]  Zoladz et al., Folia Histochem Cytobiol 2005/2011 (vastus lateralis, untrained vs trained men).
//   [S7]  Ditki "Muscle fiber" glossary (10-100 µm); vetscraft "Histology of skeletal muscles".
//   [S8]  OpenStax Anatomy & Physiology 2e, 10.2 Skeletal Muscle (myofibril ~1.2 µm; sarcomere ~2 µm).
//   [S9]  Manchester Metropolitan Univ. review on the myonuclear domain (e-space.mmu.ac.uk/595925).
//   [S10] digitalhistology.org Skeletal muscle 9; PMC3684130 fig 1 legend (myonucleus under, satellite cell above).
//   [S11] Nature Communications 2020, s41467-020-20057-8 (> 100 myonuclei per mm in human fibres).
//   [S12] PMC10717481; neuromuscular.wustl.edu myogenesis (satellite cells between basal lamina and sarcolemma).
//   [S13] BYU-Idaho BIO 264, Gross and microscopic anatomy of skeletal muscle.
//   [S14] Ogata & Yamasaki, rat striated muscle SEM (Cell Tissue Res, BF00217168); Frontiers Cell Dev Biol 2021.757305.
//   [S15] Wikipedia "Triad (anatomy)"; BYU-Idaho BIO 461 T-tubules and sarcoplasmic reticulum.
//   [S16] Texas A&M Animal Science, "5. Muscle ultrastructure" lecture notes (college.agrilife.org).
//   [S17] Gokhin & Fowler, PMC3287155 / PMC4178374 (thick ~1.65 µm constant; thin 0.95-1.40 µm).
//   [S18] Woodhead et al., Nature 2005 (citing frog X-ray: 14.3 nm crowns, 42.9 nm repeat).
//   [S19] PMC2593797 / PMC4266557 (three-stranded quasi-helix ~43 nm; bare zone; tails form the backbone).
//   [S20] Wikipedia "Myosin" (myosin II, two heavy chains, two heads).
//   [S21] Gokhin et al., Am J Physiol Cell Physiol 2012 (human thin filament 1.19-1.37 µm).
//   [S22] encyclopedia.pub entry 23016; PMC2856783; Nature 283:680 (1980) (actin helix, Tm/Tn periodicity).
//   [S23] BioCAT MuscleX docs, "The equatorial diffraction pattern from striated muscle".
//   [S24] Luther, J Muscle Res Cell Motil 2009 (s10974-009-9189-6), "The vertebrate muscle Z-disc".
//   [S25] Luther et al., J Mol Biol 2003 (two-layer fast, six-layer slow Z-bands); PMC2799012.
//   [S26] J Exp Biol 219:135, "The sarcomeric cytoskeleton: from molecules to motion".
//   [S27] PMC2823865 / PMC16344 (5 nm lever swing, ~12 nm interaction distance; 10 nm single-head stroke).
//   [S28] Huxley & Hanson 1954 and Huxley & Niedergerke 1954 (Nature); PMC5642817, PMC4352199.
//   [S29] Jorgenson, Phillips & Hornberger, Cells 2020 (PMC7408414), "Building muscle: molecular regulation...".
//   [S30] Jorgenson et al., eLife reviewed preprint 92674 (FIM-ID: myofibrillogenesis drives growth).
//   [S31] Murach et al., Front Physiol 2018 (PMC5986879); Bagley et al. 2023 (PMC9931674) on the myonuclear domain.
//   [S32] Burkholder & Lieber, J Exp Biol 204:1529 (2001), table after Walker & Schrodt: human thick 1.60, thin 1.27,
//         optimal sarcomere 2.64 µm.
//   [S33] Murray et al. 2000 (Stanford NMBL), "2.8 µm, the optimal sarcomere length in human muscle".
// ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
import { rng } from "./parts3d.js";

export const FACTS = {
  unit: "µm",
  fibreDiameter: { value: 50, range: [10, 100], src: "S7" },
  myofibrilDiameter: { value: 1.2, src: "S8" },
  sarcomereRest: { value: 2.8, optimalHuman: [2.64, 2.8], src: "S32 S33" },
  sarcomereShort: { value: 2.2, note: "H-zone gone; thin filaments overlap past the M-line", src: "S28 (geometry)" },
  thickLength: { value: 1.6, note: "~1.65 constant", src: "S17" },
  thickDiameter: { value: 0.015, note: "10-15 nm", src: "S16" },
  bareZone: { value: 0.16, note: "approx", src: "S19" },
  crown: { value: 0.0143, repeat: 0.0429, pairsPerCrown: 3, turn: 40, src: "S18 S19" },
  thinLength: { value: 1.27, range: [0.95, 1.4], human: [1.19, 1.37], src: "S17 S21 S32" },
  thinDiameter: { value: 0.007, src: "S16" },
  actinCrossover: { value: 0.036, monomers: 13, src: "S22" },
  troponinRepeat: { value: 0.0385, src: "S22" },
  latticeSpacing: { value: 0.04, src: "S23" },
  zDiscWidth: { fast: [0.03, 0.05], slow: [0.1, 0.14], src: "S24" },
  myonuclei: { perMm: [100, 300], size: [11, 4.5, 1.6], sizeNote: "estimate", src: "S9 S11" },
  endomysium: { value: [0.2, 1.0], src: "S3" },
  capillaryPerFibre: { value: [1.7, 2.2], around: [4.9, 5.7], src: "S5 S6" },
  capillaryDiameter: { value: 5.5, note: "assumed" },
  hypertrophyCSA: { value: 0.5, note: "grow = 1 means +50% CSA (illustrative)", src: "S31" },
};

const TAU = Math.PI * 2;
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const lerp = (a, b, u) => a + (b - a) * u;
const smooth = (a, b, x) => {
  const u = clamp((x - a) / (b - a));
  return u * u * (3 - 2 * u);
};

// ── 2D: polygons, power diagrams (weighted Voronoi), relaxed point sets ──────────────────────────────────────────
function clip(poly, nx, ny, c) {
  // keep nx*x + ny*y <= c
  const out = [];
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % n];
    const da = nx * a[0] + ny * a[1] - c;
    const db = nx * b[0] + ny * b[1] - c;
    if (da <= 0) out.push(a);
    if (da <= 0 !== db <= 0) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}
const area = (p) => {
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
};
function centroid(p) {
  let cx = 0;
  let cy = 0;
  let s = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i];
    const b = p[(i + 1) % p.length];
    const k = a[0] * b[1] - b[0] * a[1];
    s += k;
    cx += (a[0] + b[0]) * k;
    cy += (a[1] + b[1]) * k;
  }
  if (Math.abs(s) < 1e-12) return p[0].slice();
  return [cx / (3 * s), cy / (3 * s)];
}
// Clip a convex polygon `poly` by a convex `boundary` (both CCW).
function clipTo(poly, boundary) {
  let out = poly;
  for (let i = 0; i < boundary.length && out.length; i++) {
    const a = boundary[i];
    const b = boundary[(i + 1) % boundary.length];
    // inside is the left of a->b; keep -(left normal) . x <= -(left normal) . a
    const nx = b[1] - a[1];
    const ny = -(b[0] - a[0]);
    out = clip(out, nx, ny, nx * a[0] + ny * a[1]);
  }
  return out;
}
// Power cells of points with weights, inside a convex boundary. `reach` bounds the neighbour search.
function powerCells(pts, w, boundary, reach) {
  const grid = new Map();
  const key = (x, y) => `${Math.floor(x / reach)},${Math.floor(y / reach)}`;
  pts.forEach((p, i) => {
    const k = key(p[0], p[1]);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k).push(i);
  });
  let bmax = 0;
  for (const b of boundary) bmax = Math.max(bmax, Math.hypot(b[0], b[1]));
  return pts.map((p, i) => {
    const [x, y] = p;
    let poly = [
      [x - reach, y - reach],
      [x + reach, y - reach],
      [x + reach, y + reach],
      [x - reach, y + reach],
    ];
    const gx = Math.floor(x / reach);
    const gy = Math.floor(y / reach);
    const pp = x * x + y * y;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const list = grid.get(`${gx + dx},${gy + dy}`);
        if (!list) continue;
        for (const j of list) {
          if (j === i) continue;
          const q = pts[j];
          const ex = q[0] - x;
          const ey = q[1] - y;
          if (ex * ex + ey * ey > reach * reach * 2) continue;
          poly = clip(poly, ex, ey, (q[0] * q[0] + q[1] * q[1] - pp - w[j] + w[i]) / 2);
          if (!poly.length) return poly;
        }
      }
    if (Math.hypot(x, y) > bmax - reach * 1.5) poly = clipTo(poly, boundary);
    return poly;
  });
}
// A convex polygon moved in by d (intersection of its edges' inward half-planes).
function inset(poly, d) {
  let out = poly;
  for (let i = 0; i < poly.length && out.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len < 1e-9) continue;
    const lx = -(b[1] - a[1]) / len; // left (inward for CCW) normal
    const ly = (b[0] - a[0]) / len;
    out = clip(out, -lx, -ly, -(lx * a[0] + ly * a[1]) - d);
  }
  return out;
}
// Round every corner (quadratic arcs), `steps` points per corner.
function fillet(poly, r, steps = 4) {
  const n = poly.length;
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = poly[(i + n - 1) % n];
    const b = poly[i];
    const c = poly[(i + 1) % n];
    const la = Math.hypot(a[0] - b[0], a[1] - b[1]);
    const lc = Math.hypot(c[0] - b[0], c[1] - b[1]);
    if (la < 1e-9 || lc < 1e-9) continue;
    const ta = Math.min(r, la * 0.45) / la;
    const tc = Math.min(r, lc * 0.45) / lc;
    const p1 = [b[0] + (a[0] - b[0]) * ta, b[1] + (a[1] - b[1]) * ta];
    const p2 = [b[0] + (c[0] - b[0]) * tc, b[1] + (c[1] - b[1]) * tc];
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      out.push([(1 - t) ** 2 * p1[0] + 2 * (1 - t) * t * b[0] + t * t * p2[0], (1 - t) ** 2 * p1[1] + 2 * (1 - t) * t * b[1] + t * t * p2[1]]);
    }
  }
  return out;
}
// Split long edges so the outline can bend around obstacles.
function densify(poly, maxLen) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / maxLen));
    for (let k = 0; k < n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}
// Push outline points out of circles [x, y, r] (a capillary or vessel indents the fibre or fascicle beside it).
function avoid(poly, circles) {
  if (!circles.length) return poly;
  return poly.map(([x, y]) => {
    for (const [cx, cy, r] of circles) {
      const dx = x - cx;
      const dy = y - cy;
      const d = Math.hypot(dx, dy);
      if (d < r && d > 1e-9) {
        x = cx + (dx / d) * r;
        y = cy + (dy / d) * r;
      }
    }
    return [x, y];
  });
}
// Points on a jittered hexagonal grid inside a convex boundary, then relaxed toward their cell centroids.
function relaxedPoints(boundary, spacing, rand, { jitter = 0.35, iters = 2, weights } = {}) {
  let xmin = Infinity;
  let xmax = -Infinity;
  let ymin = Infinity;
  let ymax = -Infinity;
  for (const [x, y] of boundary) {
    xmin = Math.min(xmin, x);
    xmax = Math.max(xmax, x);
    ymin = Math.min(ymin, y);
    ymax = Math.max(ymax, y);
  }
  const h = (spacing * Math.sqrt(3)) / 2;
  const pts = [];
  const inside = (x, y) => clipTo([[x, y], [x + 1e-6, y], [x, y + 1e-6]], boundary).length >= 3;
  for (let row = 0, y = ymin + h * 0.5; y < ymax; y += h, row++)
    for (let x = xmin + (row % 2 ? spacing / 2 : 0); x < xmax; x += spacing) {
      const px = x + (rand() - 0.5) * 2 * jitter * spacing;
      const py = y + (rand() - 0.5) * 2 * jitter * spacing;
      if (inside(px, py)) pts.push([px, py]);
    }
  const w = weights ?? pts.map(() => 0);
  let cells = null;
  for (let k = 0; k < iters; k++) {
    cells = powerCells(pts, w, boundary, spacing * 2.2);
    for (let i = 0; i < pts.length; i++) if (cells[i].length >= 3) pts[i] = centroid(cells[i]);
  }
  return pts;
}
const circlePoly = (r, n = 64, cx = 0, cy = 0, wobble = null) =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * TAU;
    const rr = r * (wobble ? wobble(a) : 1);
    return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr];
  });
// Shared corners of a cell set: points where three or more cells meet (Voronoi vertices), deduplicated.
function corners(cells, tol) {
  const out = [];
  const seen = new Map();
  for (const poly of cells)
    for (const [x, y] of poly) {
      const k = `${Math.round(x / tol)},${Math.round(y / tol)}`;
      if (seen.has(k)) seen.get(k).n++;
      else {
        const v = { x, y, n: 1 };
        seen.set(k, v);
        out.push(v);
      }
    }
  return out.filter((v) => v.n >= 2);
}

export function createTissue(space, P) {
  const { THREE } = space;
  const V3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
  const live = [];

  // ── geometry writer: merged prisms and tubes with the attributes the tissue shader reads ──────────────────────
  class Geo {
    constructor() {
      this.p = [];
      this.n = [];
      this.uv = [];
      this.c = [];
      this.i = [];
      this.count = 0;
    }
    v(x, y, z, nx, ny, nz, u = 0, w = 0, cell = [0, 0, 0, 0]) {
      this.p.push(x, y, z);
      this.n.push(nx, ny, nz);
      this.uv.push(u, w);
      this.c.push(cell[0], cell[1], cell[2], cell[3]);
      return this.count++;
    }
    t(a, b, c) {
      this.i.push(a, b, c);
    }
    build(uvScale = 1 / 25) {
      const g = new THREE.BufferGeometry();
      g.setAttribute("uv", new THREE.Float32BufferAttribute(this.uv.map((v) => v * uvScale), 2));
      g.setAttribute("position", new THREE.Float32BufferAttribute(this.p, 3));
      g.setAttribute("normal", new THREE.Float32BufferAttribute(this.n, 3));
      g.setAttribute("aUV", new THREE.Float32BufferAttribute(this.uv, 2));
      g.setAttribute("aCell", new THREE.Float32BufferAttribute(this.c, 4));
      g.setIndex(this.count > 65535 ? new THREE.Uint32BufferAttribute(this.i, 1) : new THREE.Uint16BufferAttribute(this.i, 1));
      g.computeBoundingSphere();
      return g;
    }
  }
  // A prism from outline (CCW) between z0 and z1, with a rounded bevel into its top cap (the cut face).
  // segZ splits the long side into rows; displace(i, z) moves outline point i out along its normal at height z (a
  // bundle bulging into a ridge, swelling and narrowing along its length). The cap uses the displacement at z1.
  function prism(g, outline, z0, z1, { bevel = 0, cell = [0, 0, 0, 0], bottom = false, segZ = 1, displace = null } = {}) {
    let ol = outline;
    if (area(ol) < 0) ol = ol.slice().reverse();
    const m = ol.length;
    if (m < 3) return;
    const normalsOf = (pts) =>
      pts.map((p, i) => {
        const a = pts[(i + m - 1) % m];
        const b = pts[(i + 1) % m];
        const e1x = p[0] - a[0];
        const e1y = p[1] - a[1];
        const e2x = b[0] - p[0];
        const e2y = b[1] - p[1];
        const l1 = Math.hypot(e1x, e1y) || 1;
        const l2 = Math.hypot(e2x, e2y) || 1;
        const nx = e1y / l1 + e2y / l2;
        const ny = -e1x / l1 - e2x / l2;
        const l = Math.hypot(nx, ny) || 1;
        return [nx / l, ny / l];
      });
    const nrm0 = normalsOf(ol);
    const at = (z) => {
      if (!displace) return { pts: ol, nrm: nrm0 };
      const pts = ol.map((p, i) => {
        const d = displace(i, z);
        return [p[0] + nrm0[i][0] * d, p[1] + nrm0[i][1] * d];
      });
      return { pts, nrm: normalsOf(pts) };
    };
    const per = [0];
    for (let k = 1; k <= m; k++) per.push(per[k - 1] + Math.hypot(ol[k % m][0] - ol[k - 1][0], ol[k % m][1] - ol[k - 1][1]));
    const b = Math.min(bevel, (z1 - z0) * 0.45);
    const ring = (z, inset, mixUp, shape = at(z)) => {
      const s = g.count;
      for (let k = 0; k <= m; k++) {
        const i = k % m;
        const [nx, ny] = shape.nrm[i];
        const up = mixUp;
        const l = Math.hypot(nx * (1 - up), ny * (1 - up), up) || 1;
        g.v(shape.pts[i][0] - nx * inset, shape.pts[i][1] - ny * inset, z, (nx * (1 - up)) / l, (ny * (1 - up)) / l, up / l, per[k], z, cell);
      }
      return s;
    };
    const quads = (a, c) => {
      for (let k = 0; k < m; k++) {
        g.t(a + k, a + k + 1, c + k + 1);
        g.t(a + k, c + k + 1, c + k);
      }
    };
    let prev = ring(z0, 0, 0);
    const rows = Math.max(1, segZ);
    for (let j = 1; j <= rows; j++) {
      const r = ring(lerp(z0, z1 - b, j / rows), 0, 0);
      quads(prev, r);
      prev = r;
    }
    const topShape = at(z1);
    if (b > 0) {
      const r2 = ring(z1 - b * 0.3, b * 0.45, 0.55, topShape);
      quads(prev, r2);
      const r3 = ring(z1, b, 0.92, topShape);
      quads(r2, r3);
    }
    // the cap: flat, its own up-facing vertices
    const [cx, cy] = centroid(topShape.pts);
    const cs = g.count;
    for (let k = 0; k < m; k++) {
      const [nx, ny] = topShape.nrm[k];
      g.v(topShape.pts[k][0] - nx * b, topShape.pts[k][1] - ny * b, z1, 0, 0, 1, per[k], z1, cell);
    }
    const cc = g.v(cx, cy, z1, 0, 0, 1, 0, z1, cell);
    for (let k = 0; k < m; k++) g.t(cc, cs + k, cs + ((k + 1) % m));
    if (bottom) {
      const bs = g.count;
      for (let k = 0; k < m; k++) g.v(ol[k][0], ol[k][1], z0, 0, 0, -1, per[k], z0, cell);
      const bc = g.v(cx, cy, z0, 0, 0, -1, 0, z0, cell);
      for (let k = 0; k < m; k++) g.t(bc, bs + ((k + 1) % m), bs + k);
    }
  }
  // An open sheath (tube wall) along z around an outline, offset out by `off`, with an annulus lip of `thick` at z1.
  function sheath(g, outline, z0, z1, { off = 0, thick = 0, segZ = 1, displace = null, cell = [0, 0, 0, 0] } = {}) {
    let ol = outline;
    if (area(ol) < 0) ol = ol.slice().reverse();
    const m = ol.length;
    const nrm = ol.map((p, i) => {
      const a = ol[(i + m - 1) % m];
      const b = ol[(i + 1) % m];
      let nx = b[1] - a[1];
      let ny = -(b[0] - a[0]);
      const l = Math.hypot(nx, ny) || 1;
      return [nx / l, ny / l];
    });
    const per = [0];
    for (let k = 1; k <= m; k++) per.push(per[k - 1] + Math.hypot(ol[k % m][0] - ol[k - 1][0], ol[k % m][1] - ol[k - 1][1]));
    const wall = (o, sign) => {
      const s = g.count;
      for (let j = 0; j <= segZ; j++) {
        const z = lerp(z0, z1, j / segZ);
        for (let k = 0; k <= m; k++) {
          const i = k % m;
          const [nx, ny] = nrm[i];
          const d = o + (displace ? displace(ol[i][0], ol[i][1], z) : 0);
          g.v(ol[i][0] + nx * d, ol[i][1] + ny * d, z, nx * sign, ny * sign, 0, per[k], z, cell);
        }
      }
      for (let j = 0; j < segZ; j++)
        for (let k = 0; k < m; k++) {
          const a = s + j * (m + 1) + k;
          const c = a + m + 1;
          if (sign > 0) {
            g.t(a, a + 1, c + 1);
            g.t(a, c + 1, c);
          } else {
            g.t(a, c + 1, a + 1);
            g.t(a, c, c + 1);
          }
        }
      return s;
    };
    wall(off + thick, 1);
    if (thick > 0) {
      wall(off, -1);
      // lip at z1
      const s = g.count;
      for (let k = 0; k <= m; k++) {
        const i = k % m;
        const [nx, ny] = nrm[i];
        g.v(ol[i][0] + nx * off, ol[i][1] + ny * off, z1, 0, 0, 1, per[k], z1, cell);
        g.v(ol[i][0] + nx * (off + thick), ol[i][1] + ny * (off + thick), z1, 0, 0, 1, per[k], z1, cell);
      }
      for (let k = 0; k < m; k++) {
        const a = s + k * 2;
        g.t(a, a + 1, a + 3);
        g.t(a, a + 3, a + 2);
      }
    }
  }
  // A tube through points (parallel-transport frames), into a Geo.
  function tubeInto(g, pts, radius, radial = 5, cell = [0, 0, 0, 0], radiusAt = null) {
    const n = pts.length;
    if (n < 2) return;
    const T = [];
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)];
      const b = pts[Math.min(n - 1, i + 1)];
      T.push(V3().subVectors(b, a).normalize());
    }
    let N = V3(0, 0, 1);
    if (Math.abs(N.dot(T[0])) > 0.9) N = V3(1, 0, 0);
    N = V3().crossVectors(T[0], N).normalize();
    const s = g.count;
    for (let i = 0; i < n; i++) {
      if (i > 0) {
        const axis = V3().crossVectors(T[i - 1], T[i]);
        const l = axis.length();
        if (l > 1e-8) N.applyAxisAngle(axis.divideScalar(l), Math.asin(Math.min(1, l)));
      }
      const B = V3().crossVectors(T[i], N).normalize();
      const r = radiusAt ? radiusAt(i / (n - 1)) : radius;
      for (let k = 0; k <= radial; k++) {
        const a = (k / radial) * TAU;
        const nx = N.x * Math.cos(a) + B.x * Math.sin(a);
        const ny = N.y * Math.cos(a) + B.y * Math.sin(a);
        const nz = N.z * Math.cos(a) + B.z * Math.sin(a);
        g.v(pts[i].x + nx * r, pts[i].y + ny * r, pts[i].z + nz * r, nx, ny, nz, k / radial, i / (n - 1), cell);
      }
    }
    for (let i = 0; i < n - 1; i++)
      for (let k = 0; k < radial; k++) {
        const a = s + i * (radial + 1) + k;
        const c = a + radial + 1;
        g.t(a, a + 1, c + 1);
        g.t(a, c + 1, c);
      }
  }

  // ── the tissue shader: one patch on MeshPhysicalMaterial, features switched by defines ──────────────────────────
  // BAND      cross-striations along local z (A, I, H, M, Z), with a faint Z-line furrow (relief)
  // PITS      T-tubule openings on the sarcolemma at each A-I junction
  // CAPFIB    a fascicle's cut face at muscle scale: fibre profiles, endomysium, capillaries, peripheral nuclei
  // SIDEFIB   a fascicle's side at muscle scale: fibres running along it
  // CAPMYO    a fibre's cut face at fascicle scale: myofibril fields (Cohnheim) and a darker rim
  // CRISTAE   mitochondria: folds across the long (local x) axis
  // CHROMATIN nuclei: mottled chromatin, heterochromatin dense at the envelope
  // HELIX     myosin backbone: the tails' helical ridges
  // RIM       membranes: alpha and light rise at grazing angles (fresnel)
  // SSS       light scattered inside soft tissue: a warm glow that rises toward the silhouette
  const GLSL = /* glsl */ `
    varying vec3 vLoc; varying vec3 vPos; varying vec3 vLocN; varying vec2 vUV2; varying vec4 vCell; varying vec3 vAxV;
    uniform float uSL, uPhase, uThickL, uThinL, uBand, uRelief, uFib, uR, uSSSk, uRimA, uRimK, uGlowNew;
    uniform vec3 uADark, uSSS, uRimC, uC2, uC3, uC4;
    float tH1(float n){ return fract(sin(n) * 43758.5453123); }
    vec2 tH2(vec2 p){ p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453123); }
    float tN3(vec3 p){
      vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
      float n = dot(i, vec3(1.0, 57.0, 113.0));
      return mix(mix(mix(tH1(n), tH1(n + 1.0), f.x), mix(tH1(n + 57.0), tH1(n + 58.0), f.x), f.y),
                 mix(mix(tH1(n + 113.0), tH1(n + 114.0), f.x), mix(tH1(n + 170.0), tH1(n + 171.0), f.x), f.y), f.z);
    }
    vec4 tWorley(vec2 p, float jit, out vec2 rel){
      vec2 n = floor(p); vec2 f = fract(p);
      float F1 = 8.0, F2 = 8.0, F3 = 8.0, id = 0.0; rel = vec2(0.0);
      for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
        vec2 g = vec2(float(i), float(j));
        vec2 o = 0.5 + jit * (tH2(n + g) - 0.5);
        vec2 r = g + o - f; float d = length(r);
        if (d < F1) { F3 = F2; F2 = F1; F1 = d; id = dot(n + g, vec2(7.0, 113.0)); rel = -r; }
        else if (d < F2) { F3 = F2; F2 = d; } else if (d < F3) { F3 = d; }
      }
      return vec4(F1, F2, F3, id);
    }
    float tBand(float z){
      float w = max(fwidth(z), 1e-5);
      float s = mod(z - uPhase + 0.5 * uSL, uSL) - 0.5 * uSL;
      float a = abs(s);
      float hA = 0.5 * uThickL;
      float hH = max(0.5 * uSL - uThinL, 0.0);
      float aa = w * 0.8 + 0.006;
      float inA = 1.0 - smoothstep(hA - aa, hA + aa, a);
      float inH = 1.0 - smoothstep(hH - aa, hH + aa, a);
      float mL = 1.0 - smoothstep(0.02, 0.02 + aa * 2.0, a);
      float zL = 1.0 - smoothstep(0.035, 0.035 + aa * 2.0, abs(a - 0.5 * uSL));
      float d = inA * (1.0 - 0.36 * inH) + 0.3 * mL * inA;
      d = max(d, 1.3 * zL);
      float meanD = (uThickL - 0.72 * hH) / uSL + 0.05;
      return mix(d, meanD, smoothstep(0.1, 0.4, w / uSL));
    }
    float tZ(float z){
      float s = mod(z - uPhase, uSL) - 0.5 * uSL; // 0 at the Z-line
      return 1.0 - smoothstep(0.0, 0.09, abs(s));
    }
  `;
  function tissueMaterial(params, defines = {}, uniforms = {}) {
    const m = new THREE.MeshPhysicalMaterial(params);
    m.defines = { ...(m.defines ?? {}), ...defines };
    const u = {
      uSL: { value: 2.5 },
      uPhase: { value: 0 },
      uThickL: { value: 1.6 },
      uThinL: { value: 1.0 },
      uBand: { value: 1 },
      uRelief: { value: 0.6 },
      uFib: { value: 50 },
      uR: { value: 25 },
      uSSSk: { value: 0.0 },
      uRimA: { value: 0 },
      uRimK: { value: 0 },
      uGlowNew: { value: 0 },
      uADark: { value: new THREE.Color(0.55, 0.36, 0.42) },
      uSSS: { value: new THREE.Color(0.5, 0.06, 0.06) },
      uRimC: { value: new THREE.Color(1, 1, 1) },
      uC2: { value: new THREE.Color(0xe9e2d6) },
      uC3: { value: new THREE.Color(0x3b2c8f) },
      uC4: { value: new THREE.Color(0xb3202a) },
      ...uniforms,
    };
    m.userData.u = u;
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", `#include <common>\nattribute vec4 aCell; attribute vec2 aUV;\nvarying vec3 vLoc; varying vec3 vPos; varying vec3 vLocN; varying vec2 vUV2; varying vec4 vCell; varying vec3 vAxV;`)
        .replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
          vLoc = position; vLocN = normal; vUV2 = aUV; vCell = aCell;
          #ifdef USE_INSTANCING
            vPos = (instanceMatrix * vec4(position, 1.0)).xyz;
          #else
            vPos = position;
          #endif
          vAxV = normalize(normalMatrix * vec3(0.0, 0.0, 1.0));`,
        );
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", `#include <common>\n${GLSL}`)
        .replace(
          "#include <color_fragment>",
          `#include <color_fragment>
          float capness = smoothstep(0.75, 0.97, abs(vLocN.z));
          #ifdef BAND
            float bd = tBand(vPos.z);
            diffuseColor.rgb *= mix(vec3(1.0), uADark, clamp(bd, 0.0, 1.3) * uBand * (1.0 - capness));
            diffuseColor.rgb *= mix(1.0, 0.8, capness);
          #endif
          #ifdef PITS
            {
              float s = mod(vPos.z - uPhase + 0.5 * uSL, uSL) - 0.5 * uSL;
              float dz = abs(abs(s) - 0.5 * uThickL);
              float circ = atan(vPos.y, vPos.x) * uR / 1.25;
              float cell = fract(circ + 0.5 * step(0.0, s)) - 0.5;
              float pit = (1.0 - smoothstep(0.08, 0.16, length(vec2(cell * 1.25, dz)))) * (1.0 - smoothstep(0.02, 0.06, fwidth(vPos.z)));
              diffuseColor.rgb *= 1.0 - 0.45 * pit;
            }
          #endif
          #ifdef CAPFIB
            {
              vec2 q = vPos.xy / uFib; vec2 rel;
              vec4 W = tWorley(q, 0.85, rel);
              float px = max(fwidth(q.x), 1e-4);
              float border = W.y - W.x;
              float endo = 1.0 - smoothstep(0.035, 0.035 + px * 1.5, border);
              float corner = 1.0 - smoothstep(0.12, 0.12 + px * 2.0, W.z - W.x);
              float fh = tH1(W.w);
              vec3 fib = diffuseColor.rgb * mix(0.72, 1.12, fh);
              float ang = atan(rel.y, rel.x);
              float sec = (ang + 3.14159) / 6.28318 * 22.0;
              float sid = floor(sec);
              float on = step(0.83, tH1(W.w * 1.37 + sid * 3.17));
              float sa = abs(fract(sec) - 0.5);
              float nuc = on * (1.0 - smoothstep(0.25, 0.4, sa)) * (smoothstep(0.035, 0.05, border) - smoothstep(0.085, 0.11, border));
              vec3 col = fib;
              col = mix(col, uC3, nuc * 0.95 * (1.0 - smoothstep(0.06, 0.16, px)));
              col = mix(col, uC2, endo * 0.9 * (1.0 - smoothstep(0.05, 0.16, px)));
              col = mix(col, uC4, corner * 0.85);
              float far = smoothstep(0.08, 0.3, px);
              col = mix(col, mix(fib, uC2, 0.12), far);
              diffuseColor.rgb = mix(diffuseColor.rgb, col, capness);
            }
          #endif
          #ifdef SIDEFIB
            {
              float u = vUV2.x / (uFib * 0.9);
              float k = floor(u);
              float f = fract(u + 0.3 * (tH1(k) - 0.5));
              float px = max(fwidth(u), 1e-4);
              float line = 1.0 - smoothstep(0.0, 0.06 + px, min(f, 1.0 - f));
              float tone = mix(0.85, 1.08, tH1(k * 1.7));
              vec3 col = diffuseColor.rgb * tone;
              col = mix(col, col * 0.62, line * 0.8 * (1.0 - smoothstep(0.12, 0.45, px)));
              diffuseColor.rgb = mix(col, diffuseColor.rgb, capness);
            }
          #endif
          #ifdef CAPMYO
            {
              vec2 q = (vPos.xy - vCell.xy) / 1.25; vec2 rel;
              vec4 W = tWorley(q, 0.9, rel);
              float px = max(fwidth(q.x), 1e-4);
              float border = W.y - W.x;
              float line = (1.0 - smoothstep(0.04, 0.04 + px * 1.5, border)) * (1.0 - smoothstep(0.15, 0.5, px));
              float rr = length(vPos.xy - vCell.xy) / max(vCell.z, 1e-3);
              vec3 col = diffuseColor.rgb * (1.0 - 0.32 * line) * mix(1.04, 0.86, smoothstep(0.7, 1.0, rr));
              diffuseColor.rgb = mix(diffuseColor.rgb, col, capness);
            }
          #endif
          #ifdef CRISTAE
            {
              float f = sin(vLoc.x * 26.0 + 1.3 * sin(vLoc.y * 9.0)) * 0.5 + 0.5;
              float px = fwidth(vLoc.x * 26.0);
              diffuseColor.rgb *= 1.0 - 0.28 * smoothstep(0.55, 0.9, f) * (1.0 - smoothstep(0.6, 2.0, px));
            }
          #endif
          #ifdef CHROMATIN
            {
              float n = tN3(vLoc * 3.2) * 0.6 + tN3(vLoc * 7.9) * 0.4;
              diffuseColor.rgb *= mix(0.78, 1.18, n);
            }
          #endif
          #ifdef HELIX
            {
              float f = sin(atan(vLoc.y, vLoc.x) * 3.0 - vLoc.z * 6.2832 / 0.0429) * 0.5 + 0.5;
              diffuseColor.rgb *= 0.86 + 0.18 * f;
            }
          #endif
          if (uGlowNew > 0.0) diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.16, 1.3, 1.12) + vec3(0.05, 0.03, 0.0), uGlowNew * vCell.w);`,
        )
        .replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>
          #ifdef BAND
            {
              float e = 0.025;
              float dz = (tZ(vPos.z + e) - tZ(vPos.z - e)) / (2.0 * e);
              float side = 1.0 - capness;
              float fade = 1.0 - smoothstep(0.04, 0.2, fwidth(vPos.z));
              normal = normalize(normal + normalize(vAxV) * dz * uRelief * side * fade * 0.08);
            }
          #endif`,
        )
        .replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
          {
            float ndv = abs(dot(normalize(normal), normalize(vViewPosition)));
            #ifdef SSS
              totalEmissiveRadiance += uSSS * uSSSk * (0.3 + 0.7 * pow(1.0 - ndv, 2.0));
            #endif
            #ifdef CHROMATIN
              diffuseColor.rgb *= mix(0.62, 1.0, smoothstep(0.0, 0.45, ndv));
            #endif
            #ifdef RIM
              totalEmissiveRadiance += uRimC * uRimK * pow(1.0 - ndv, 3.0);
            #endif
          }`,
        )
        .replace(
          "#include <opaque_fragment>",
          `#ifdef RIM
            {
              float ndv2 = abs(dot(normalize(normal), normalize(vViewPosition)));
              diffuseColor.a = clamp(diffuseColor.a + uRimA * pow(1.0 - ndv2, 2.5), 0.0, 1.0);
            }
          #endif
          #include <opaque_fragment>`,
        );
    };
    m.customProgramCacheKey = () => `tissue-${Object.keys(m.defines).sort().join(",")}`;
    return m;
  }

  // ── palette (stain-free medical 3D) and materials ────────────────────────────────────────────────────────────
  const C = {
    muscle: 0xb8323c, // fibre red
    muscleLight: 0xd95a64,
    aDark: [0.6, 0.38, 0.44], // A-band relative tone (denser, slightly cooler)
    nucleus: 0x4a3aa8, // deep violet-blue
    satNucleus: 0x2b1f6e, // heterochromatic, darker
    collagen: 0xf1ebe2, // pale translucent sheath
    septum: 0xe8dccd,
    mito: 0xe08a3a, // amber
    actin: 0xf7c04a, // gold
    tropomyosin: 0xc4503a, // brick red
    troponin: 0xa996e0, // lilac
    myosin: 0x3f86c9, // steel blue
    myosinHead: 0x6fb0e8,
    titin: 0x8fe0a8, // pale green
    zdisc: 0xf2ece3,
    sr: 0x86c6e8, // pale blue
    ttubule: 0xf3d98a, // pale yellow
    artery: 0xc23a45,
    vein: 0x5b4a92,
    nerve: 0xeadba8,
    blood: 0x6e0a12,
    endothelium: 0xd0535b,
  };
  const collagenMap = (() => {
    const c = P.canvasOf(512);
    const ctx = c.getContext("2d");
    const r = rng(77);
    ctx.fillStyle = "#808080";
    ctx.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 700; i++) {
      const y0 = r() * 512;
      const a = (r() - 0.5) * 0.7;
      ctx.strokeStyle = `rgba(255,255,255,${0.08 + r() * 0.18})`;
      ctx.lineWidth = 1 + r() * 3;
      ctx.beginPath();
      for (let x = -20; x <= 532; x += 16) {
        const y = y0 + Math.tan(a) * x + Math.sin(x / 40 + i) * 3;
        x < 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    return P.texture(P.normalFrom(c, 1.4), { repeat: 2 });
  })();
  function fibreMat(extra = {}, defines = {}) {
    const m = tissueMaterial(
      { color: C.muscle, roughness: 0.4, metalness: 0, sheen: 0.28, sheenColor: new THREE.Color(0xff8080), sheenRoughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.3, ...extra },
      { SSS: "", ...defines },
      { uSSSk: { value: 0.32 }, uADark: { value: new THREE.Color(...C.aDark) } },
    );
    m.userData.cut = 0x9c2430;
    return m;
  }
  function membraneMat(color, { opacity = 0.35, rim = 0.55, rimK = 0.35, rough = 0.3, defines = {}, normal = true, uniforms = {} } = {}) {
    const m = tissueMaterial(
      {
        color,
        roughness: rough,
        metalness: 0,
        transparent: true,
        opacity,
        depthWrite: false,
        side: THREE.DoubleSide,
        clearcoat: 0.8,
        clearcoatRoughness: 0.25,
        sheen: 0.5,
        sheenColor: new THREE.Color(0xffffff),
        normalMap: normal ? collagenMap : null,
        normalScale: new THREE.Vector2(0.35, 0.35),
      },
      { RIM: "", ...defines },
      { uRimA: { value: rim }, uRimK: { value: rimK }, ...uniforms },
    );
    m.userData.cut = color;
    return m;
  }
  const solid = (color, { rough = 0.45, sheen = 0.4, clear = 0.3, defines = {}, uniforms = {}, side } = {}) =>
    tissueMaterial(
      { color, roughness: rough, metalness: 0, sheen, sheenColor: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.5), sheenRoughness: 0.5, clearcoat: clear, clearcoatRoughness: 0.3, ...(side ? { side } : {}) },
      defines,
      uniforms,
    );
  const nucleusMat = (color = C.nucleus) => solid(color, { rough: 0.38, sheen: 0.6, clear: 0.5, defines: { CHROMATIN: "" } });
  const mitoMat = () => solid(C.mito, { rough: 0.4, sheen: 0.5, clear: 0.4, defines: { CRISTAE: "", SSS: "" }, uniforms: { uSSSk: { value: 0.25 }, uSSS: { value: new THREE.Color(0.6, 0.25, 0.05) } } });

  // shapes reused by instancing
  const ellipsoid = new THREE.SphereGeometry(1, 20, 12);
  const ellipsoidLo = new THREE.SphereGeometry(1, 12, 8);
  // half an ellipsoid whose flat face looks +z (a nucleus or vessel cut by the section plane), dome toward -z
  const halfEllipsoid = (() => {
    const dome = new THREE.SphereGeometry(1, 20, 8, 0, TAU, 0, Math.PI / 2);
    dome.rotateX(-Math.PI / 2);
    const cap = new THREE.CircleGeometry(1, 20);
    const merged = mergeGeos([dome, cap]);
    return merged;
  })();
  function mergeGeos(list) {
    // position + normal only, indexed
    const g = new Geo();
    for (const src of list) {
      const base = g.count;
      const p = src.attributes.position;
      const n = src.attributes.normal;
      for (let i = 0; i < p.count; i++) g.v(p.getX(i), p.getY(i), p.getZ(i), n.getX(i), n.getY(i), n.getZ(i));
      if (src.index) for (let i = 0; i < src.index.count; i += 3) g.t(base + src.index.getX(i), base + src.index.getX(i + 1), base + src.index.getX(i + 2));
      else for (let i = 0; i < p.count; i += 3) g.t(base + i, base + i + 1, base + i + 2);
    }
    return g.build();
  }
  function instanced(geo, mat, n, name) {
    const m = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
    m.count = n;
    m.name = name;
    m.frustumCulled = false;
    m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return m;
  }
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _s = new THREE.Vector3();
  const _p = new THREE.Vector3();
  const _e = new THREE.Euler();
  function setInst(mesh, i, x, y, z, rx, ry, rz, sx, sy, sz, order = "XYZ") {
    _e.set(rx, ry, rz, order);
    _q.setFromEuler(_e);
    _m.compose(_p.set(x, y, z), _q, _s.set(sx, sy, sz));
    mesh.setMatrixAt(i, _m);
  }
  const named = (o, name) => {
    o.name = name;
    return o;
  };
  const meshOf = (geo, mat, name) => named(new THREE.Mesh(geo, mat), name);
  function groupOf(name, kind, dims, sources) {
    const g = new THREE.Group();
    g.name = name;
    g.userData.unit = "µm";
    g.userData.kind = kind;
    g.userData.dims = dims;
    g.userData.sources = sources;
    return g;
  }
  function track(group, state, apply) {
    group.userData.state = state;
    let last = "";
    const run = (force) => {
      const key = JSON.stringify(state);
      if (!force && key === last) return;
      last = key;
      apply(state);
    };
    group.userData.update = () => run(true);
    live.push(run);
    run(true);
  }

  // ── 1. MUSCLE IN SECTION ───────────────────────────────────────────────────────────────────────────────────
  // A short length of a small muscle, cut square at z = 0 (the section faces +z), its fascicles standing a little
  // proud of the cut by different amounts the way a sectioned specimen does. Sizes: radius 2500 µm (a muscle about
  // 5 mm across), fascicles about 0.7 mm, fibres 50 µm shown as the pattern on each fascicle's cut face.
  function muscle({ radius = 2500, length = 5000, fascicles = 56, fibre = 50, seed = 3, surfaceVessels = 3, name = "muscle" } = {}) {
    const rand = rng(seed);
    const g = groupOf(name, "muscle-section", { radius, length, fascicleCount: fascicles, fibreDiameter: fibre, epimysium: "about 30 µm here, translucent" }, ["S1", "S2", "S4", "S7"]);
    const epiT = radius * 0.012;
    const a1 = rand() * TAU;
    const a2 = rand() * TAU;
    const wob = (a) => 1 + 0.07 * Math.cos(2 * a + a1) + 0.025 * Math.cos(3 * a + a2);
    const inner = circlePoly(radius - epiT, 128, 0, 0, wob);
    const spacing = Math.sqrt((Math.PI * (radius - epiT) ** 2) / (fascicles * 0.866));
    const pts = relaxedPoints(inner, spacing, rand, { jitter: 0.45, iters: 2 });
    const w = pts.map(() => (rand() - 0.5) * spacing * spacing * 0.45);
    const cells = powerCells(pts, w, inner, spacing * 2.4);
    // neurovascular bundles where three septa meet
    const septum = spacing * 0.03;
    const verts = corners(cells, spacing * 0.02).filter((v) => Math.hypot(v.x, v.y) < radius - spacing * 0.5);
    const bundles = [];
    for (const v of verts) {
      if (rand() > 0.55) continue;
      const s = spacing * (0.06 + rand() * 0.035);
      const ang = rand() * TAU;
      const kinds = rand() < 0.4 ? ["artery", "vein", "nerve"] : ["artery", "vein"];
      kinds.forEach((kind, k) => {
        const a = ang + (k * TAU) / kinds.length;
        const r = kind === "vein" ? s * 1.25 : kind === "nerve" ? s * 0.9 : s * 0.8;
        bundles.push({ kind, x: v.x + Math.cos(a) * s * 0.95, y: v.y + Math.sin(a) * s * 0.95, r });
      });
    }
    const circles = bundles.map((b) => [b.x, b.y, b.r + septum * 1.4]);
    const boundaryR = (x, y) => (radius - epiT) * wob(Math.atan2(y, x));
    // fascicles: the section is one plane (each face bulges at most a few µm); where a fascicle reaches the surface
    // it swells into a rounded ridge that wanders slightly along its length, like bundles under a sheath
    const fasc = new Geo();
    const shown = [];
    const NB = 720;
    const envelope = new Float64Array(NB);
    cells.forEach((cell) => {
      if (cell.length < 3) return;
      let ol = inset(cell, septum);
      if (ol.length < 3 || Math.abs(area(ol)) < spacing * spacing * 0.05) return;
      ol = avoid(densify(fillet(ol, spacing * 0.14, 6), spacing * 0.04), circles);
      if (area(ol) < 0) ol = ol.slice().reverse();
      const [cx, cy] = centroid(ol);
      const rr = Math.sqrt(Math.abs(area(ol)) / Math.PI);
      const ridge = ridgeProfile(ol, (x, y) => boundaryR(x, y) - Math.hypot(x, y) < septum * 2.2, spacing * 0.11);
      const ph = rand() * TAU;
      const ph2 = rand() * TAU;
      const along = (z) => 1 + 0.28 * Math.sin(z / 1400 + ph) + 0.12 * Math.sin(z / 520 + ph2);
      const displace = ridge.any ? (i, z) => ridge.amp[i] * along(z) : null;
      const out = rand() * 2.5;
      prism(fasc, ol, -length, out, { bevel: rr * 0.015, cell: [cx, cy, rr, rand()], segZ: ridge.any ? 24 : 1, displace });
      // the radial envelope the epimysium is stretched over
      ol.forEach(([x, y], i) => {
        const a = Math.atan2(y, x);
        const r = Math.hypot(x, y) + ridge.amp[i] * 1.3;
        const bin = Math.floor(((a + Math.PI) / TAU) * NB) % NB;
        envelope[bin] = Math.max(envelope[bin], r);
      });
      shown.push({ x: cx, y: cy, r: rr, out });
    });
    // fill and smooth the envelope
    for (let k = 0; k < NB; k++) if (!envelope[k]) envelope[k] = (radius - epiT) * wob((k / NB) * TAU - Math.PI);
    const env = Array.from(envelope, (_, k) => {
      let sum = 0;
      for (let d = -3; d <= 3; d++) sum += envelope[(k + d + NB) % NB];
      return sum / 7;
    });
    const envAt = (a) => {
      const f = ((a + Math.PI) / TAU) * NB;
      const k = Math.floor(f);
      return lerp(env[((k % NB) + NB) % NB], env[(((k + 1) % NB) + NB) % NB], f - k);
    };
    const fasMat = fibreMat({ color: 0x9a1f2c, roughness: 0.38, sheen: 0.2 }, { CAPFIB: "", SIDEFIB: "" });
    fasMat.userData.u.uFib.value = fibre;
    fasMat.userData.u.uC2.value.set(0xe9d6cc);
    fasMat.userData.u.uC3.value.set(C.nucleus);
    fasMat.userData.u.uC4.value.set(0x8a0f1c);
    g.add(meshOf(fasc.build(1 / 400), fasMat, "fascicles"));
    // perimysium between the fascicles: pale connective tissue in the septa (on the section and in the grooves)
    const sep = new Geo();
    prism(sep, inset(inner, septum * 0.5), -length, -0.5, { cell: [0, 0, radius, 0] });
    g.add(meshOf(sep.build(1 / 400), solid(0xc08a84, { rough: 0.5, sheen: 0.25, clear: 0.25 }), "perimysium-septa"));
    // epimysium: a thin glistening translucent sheath stretched over the bundles, ending at the section
    const outerEnv = circlePoly(1, 256).map(([x, y]) => {
      const a = Math.atan2(y, x);
      const r = envAt(a) + epiT * 0.35;
      return [Math.cos(a) * r, Math.sin(a) * r];
    });
    const epi = new Geo();
    sheath(epi, outerEnv, -length, -2, { off: 0, thick: epiT * 0.6, segZ: 1 });
    const epiMat = membraneMat(0xf6efe9, { opacity: 0.06, rim: 0.32, rimK: 0.14, rough: 0.1 });
    epiMat.clearcoat = 1;
    epiMat.clearcoatRoughness = 0.08;
    epiMat.normalScale = new THREE.Vector2(0.5, 0.5);
    g.add(meshOf(epi.build(1 / 300), epiMat, "epimysium"));
    // vessels and nerves in the perimysium, cut on the section (lumen, wall, adventitia)
    g.add(vesselSet(bundles, length, 1.5, "vessels"));
    // vessels on the surface: arteries with their paired veins running along the muscle, branching around it
    const art = new Geo();
    const ven = new Geo();
    const onSurf = (a, z, lift) => {
      const r = envAt(a) + epiT * 0.6 + lift;
      return V3(Math.cos(a) * r, Math.sin(a) * r, z);
    };
    for (let k = 0; k < surfaceVessels; k++) {
      const a0 = a1 + (k * TAU) / surfaceVessels + rand() * 0.6;
      const path = (da, rad) => {
        const out = [];
        for (let j = 0; j <= 90; j++) {
          const z = -length + (length - radius * 0.02) * (j / 90);
          const a = a0 + da + 0.08 * Math.sin(z / 900 + k) + 0.03 * Math.sin(z / 260 + k * 2);
          out.push(onSurf(a, z, rad));
        }
        return out;
      };
      const rA = radius * 0.016;
      const rV = radius * 0.021;
      tubeInto(art, path(0, rA), rA, 10);
      tubeInto(ven, path(rA * 2.6 / radius, rV), rV, 10);
      // branches: leave the trunk at intervals, curve around the muscle and taper away
      for (let z = -length + 500 + rand() * 400; z < -400; z += 650 + rand() * 500) {
        const side = rand() < 0.5 ? -1 : 1;
        const span = 0.35 + rand() * 0.45;
        const dz = (rand() - 0.2) * 900;
        const bA = [];
        const bV = [];
        for (let j = 0; j <= 28; j++) {
          const u = j / 28;
          const a = a0 + 0.08 * Math.sin(z / 900 + k) + side * span * u;
          const zz = z + dz * u * u + 120 * Math.sin(u * 5 + k);
          bA.push(onSurf(a, zz, rA * 0.5));
          bV.push(onSurf(a + side * 0.012, zz + 40, rV * 0.5));
        }
        tubeInto(art, bA, rA * 0.55, 8, [0, 0, 0, 0], (u) => rA * lerp(0.6, 0.18, u));
        tubeInto(ven, bV, rV * 0.5, 8, [0, 0, 0, 0], (u) => rV * lerp(0.55, 0.2, u));
      }
    }
    g.add(
      meshOf(art.build(), solid(0xd63a3e, { rough: 0.28, sheen: 0.3, clear: 0.8, defines: { SSS: "" }, uniforms: { uSSSk: { value: 0.5 }, uSSS: { value: new THREE.Color(0.7, 0.08, 0.06) } } }), "surface-arteries"),
      meshOf(ven.build(), solid(0x3f4fa0, { rough: 0.3, sheen: 0.5, clear: 0.7, defines: { SSS: "" }, uniforms: { uSSSk: { value: 0.2 }, uSSS: { value: new THREE.Color(0.2, 0.1, 0.4) } } }), "surface-veins"),
    );
    g.userData.fascicles = shown;
    g.userData.top = 3;
    return g;
  }
  // For an outline, how far each point bulges out where it lies on a surface: rounded across each run of surface
  // points (zero at the grooves where it dives between neighbours), `max` at the middle of a wide run.
  function ridgeProfile(ol, onSurface, max) {
    const m = ol.length;
    const on = ol.map(([x, y]) => onSurface(x, y));
    const amp = new Float64Array(m);
    let any = false;
    if (!on.some((v) => !v)) return { amp, any };
    let start = on.findIndex((v, i) => v && !on[(i + m - 1) % m]);
    if (start < 0) return { amp, any };
    for (let n = 0, i = start; n < m; ) {
      if (!on[i]) {
        i = (i + 1) % m;
        n++;
        continue;
      }
      const run = [];
      while (on[i] && run.length < m) {
        run.push(i);
        i = (i + 1) % m;
        n++;
      }
      const lens = [0];
      for (let k = 1; k < run.length; k++) lens.push(lens[k - 1] + Math.hypot(ol[run[k]][0] - ol[run[k - 1]][0], ol[run[k]][1] - ol[run[k - 1]][1]));
      const L = lens[lens.length - 1];
      if (L <= 0) continue;
      const A = Math.min(max, L * 0.11);
      run.forEach((idx, k) => {
        amp[idx] = A * Math.sqrt(Math.max(0, Math.sin((Math.PI * lens[k]) / L)));
      });
      any = true;
    }
    return { amp, any };
  }
  // A set of cut vessels/nerves running along z, each [kind, x, y, r], their ends standing `out` above z = 0.
  function vesselSet(bundles, length, out = 4, name = "vessels") {
    const g = new THREE.Group();
    g.name = name;
    const build = (kinds, layer) => {
      const geo = new Geo();
      for (const b of bundles) {
        if (!kinds.includes(b.kind)) continue;
        const r = b.r * layer.k;
        const sq = b.kind === "vein" ? 0.72 : 1; // veins sag oval
        const ol = circlePoly(r, 28, b.x, b.y).map(([x, y]) => [b.x + (x - b.x), b.y + (y - b.y) * sq]);
        prism(geo, ol, -length, out + layer.dz, { bevel: r * 0.15, cell: [b.x, b.y, r, 0] });
      }
      return geo.build();
    };
    const add = (kinds, layer, mat, nm) => {
      if (bundles.some((b) => kinds.includes(b.kind))) g.add(meshOf(build(kinds, layer), mat, nm));
    };
    // arteries: thick muscular media, round lumen
    add(["artery"], { k: 1, dz: 0 }, solid(0xe7b9b3, { rough: 0.55, defines: { SSS: "" }, uniforms: { uSSSk: { value: 0.2 } } }), "arteriole-adventitia");
    add(["artery"], { k: 0.86, dz: 0.6 }, solid(C.artery, { rough: 0.4, defines: { SSS: "" }, uniforms: { uSSSk: { value: 0.3 } } }), "arteriole-media");
    add(["artery"], { k: 0.5, dz: 1.2 }, solid(C.blood, { rough: 0.25, clear: 0.9 }), "arteriole-lumen");
    // veins: thin wall, wide lumen, darker blood
    add(["vein"], { k: 1, dz: 0 }, solid(0x8a7cb8, { rough: 0.5 }), "venule-wall");
    add(["vein"], { k: 0.84, dz: 0.8 }, solid(0x3a0c1e, { rough: 0.25, clear: 0.9 }), "venule-lumen");
    // nerves: epineurium around nerve fascicles in perineurium
    add(["nerve"], { k: 1, dz: 0 }, solid(C.nerve, { rough: 0.6, sheen: 0.7 }), "nerve-epineurium");
    const nf = new Geo();
    const r2 = rng(5);
    for (const b of bundles) {
      if (b.kind !== "nerve") continue;
      const n = 3 + Math.floor(r2() * 3);
      for (let k = 0; k < n; k++) {
        const a = (k / n) * TAU + r2();
        const d = b.r * (n > 1 ? 0.42 : 0);
        const rr = b.r * (0.3 + r2() * 0.1);
        prism(nf, circlePoly(rr, 20, b.x + Math.cos(a) * d, b.y + Math.sin(a) * d), -length * 0.05, out + 0.9, { bevel: rr * 0.2 });
      }
    }
    if (nf.count) g.add(meshOf(nf.build(), solid(0xf6ecc8, { rough: 0.45, sheen: 0.8, clear: 0.5, defines: { CHROMATIN: "" } }), "nerve-fascicles"));
    return g;
  }

  // ── 2. FASCICLE ────────────────────────────────────────────────────────────────────────────────────────────
  // About 120 fibres (mean 50 µm, type I and II mixed so sizes vary) packed as irregular polygons in endomysium,
  // capillaries at most fibre corners (about 2 per fibre), the whole in perimysium peeled back from the cut end.
  function fascicle({ fibres = 120, diameter = 50, length = 900, seed = 7, name = "fascicle" } = {}) {
    const rand = rng(seed);
    const R = Math.sqrt((fibres * Math.PI * (diameter / 2) ** 2) / 0.86 / Math.PI);
    const g = groupOf(name, "fascicle", { radius: R, fibres, fibreDiameter: diameter, length, capillaryOuter: 5.5, endomysium: 1.2, perimysium: "thin translucent sheath" }, ["S2", "S3", "S4", "S5", "S7", "S9"]);
    const a1 = rand() * TAU;
    const wob = (a) => 1 + 0.05 * Math.cos(2 * a + a1) + 0.02 * Math.cos(3 * a);
    const boundary = circlePoly(R, 128, 0, 0, wob);
    const spacing = Math.sqrt((Math.PI * R * R) / (fibres * 0.866));
    const w0 = [];
    const pts = relaxedPoints(boundary, spacing, rand, { jitter: 0.3, iters: 3 });
    for (let i = 0; i < pts.length; i++) w0.push((rand() - 0.5) * spacing * spacing * 0.5);
    const cells = powerCells(pts, w0, boundary, spacing * 2.4);
    const gap = 0.6; // half the endomysial space each side (µm)
    // capillaries at the fibre corners (C:F about 2), including the grooves on the fascicle's surface
    const cv = corners(cells, spacing * 0.01).filter((v) => Math.hypot(v.x, v.y) < R * wob(Math.atan2(v.y, v.x)) - 1.5);
    const caps = cv.filter(() => rand() < 0.86).map((v) => ({ x: v.x, y: v.y, r: 2.6 + rand() * 0.6 }));
    const circles = caps.map((c) => [c.x, c.y, c.r + gap * 1.2]);
    const onSurface = (x, y) => R * wob(Math.atan2(y, x)) - Math.hypot(x, y) < gap * 3;
    const fib = new Geo();
    const nucleiSide = [];
    const nucleiCut = [];
    const fibreInfo = [];
    cells.forEach((cell) => {
      if (cell.length < 3) return;
      let ol = inset(cell, gap);
      if (ol.length < 3) return;
      ol = avoid(densify(fillet(ol, 2.6, 4), 2.0), circles);
      if (area(ol) < 0) ol = ol.slice().reverse();
      const [cx, cy] = centroid(ol);
      const rr = Math.sqrt(Math.abs(area(ol)) / Math.PI);
      // fibres on the surface swell into ridges that wander a little along their length
      const ridge = ridgeProfile(ol, onSurface, 7);
      const ph = rand() * TAU;
      const along = (z) => 1 + 0.3 * Math.sin(z / 260 + ph) + 0.12 * Math.sin(z / 95 + ph * 2);
      const out = rand() * 0.6; // a section is one plane: each face bulges only a fraction of a µm
      prism(fib, ol, -length, out, { bevel: 1.2, cell: [cx, cy, rr, rand()], segZ: ridge.any ? 16 : 1, displace: ridge.any ? (i, z) => ridge.amp[i] * along(z) : null });
      fibreInfo.push({ cx, cy, rr, out, ol });
      // nuclei just under the surface, along the whole visible length of the outer fibres (~220 per mm per fibre;
      // the share on the outward face is drawn), oriented along the axis
      if (ridge.any) {
        const outward = ol.map((p, i) => i).filter((i) => ridge.amp[i] > 0.5);
        const n = Math.round((length / 1000) * 220 * (outward.length / ol.length) * 1.4);
        for (let k = 0; k < n; k++) {
          const idx = outward[Math.floor(rand() * outward.length)];
          const z = -4 - rand() * (length - 10);
          const p = ol[idx];
          const q = ol[(idx + 1) % ol.length];
          const tl = Math.hypot(q[0] - p[0], q[1] - p[1]) || 1;
          const nx = (q[1] - p[1]) / tl;
          const ny = -(q[0] - p[0]) / tl;
          const d = ridge.amp[idx] * along(z) - 0.6;
          nucleiSide.push({ x: p[0] + nx * d, y: p[1] + ny * d, z, a: Math.atan2(ny, nx) });
        }
      }
      // nuclei cut by the section: one to three peripheral profiles per fibre, flattened against the edge
      const nc = rand() < 0.3 ? 0 : 1 + Math.floor(rand() * 2.4);
      for (let k = 0; k < nc; k++) {
        const idx = Math.floor(rand() * ol.length);
        const p = ol[idx];
        const dx = p[0] - cx;
        const dy = p[1] - cy;
        const d = Math.hypot(dx, dy) || 1;
        nucleiCut.push({ x: p[0] - (dx / d) * 1.9, y: p[1] - (dy / d) * 1.9, z: out + 0.04, a: Math.atan2(dy, dx) });
      }
    });
    const fm = fibreMat({ color: 0xa3222f, roughness: 0.36, sheen: 0.2 }, { BAND: "", CAPMYO: "" });
    fm.userData.u.uRelief.value = 1.0;
    g.add(meshOf(fib.build(1 / 60), fm, "muscle-fibres"));
    // the endomysium between fibres (on the section and in the surface grooves)
    const endo = new Geo();
    prism(endo, inset(boundary, 1.5), -length, -0.4, {});
    g.add(meshOf(endo.build(), solid(0xcf9f98, { rough: 0.55, sheen: 0.35, clear: 0.2 }), "endomysium"));
    // capillaries: endothelial tube, lumen with blood, cut flush with the section
    const capOuter = new Geo();
    const capLumen = new Geo();
    for (const c of caps) {
      const out = 0.3 + rand() * 0.4;
      prism(capOuter, circlePoly(c.r, 18, c.x, c.y), -length, out, { bevel: 0.5 });
      prism(capLumen, circlePoly(c.r * 0.68, 16, c.x, c.y), -length * 0.02, out + 0.06, {});
    }
    g.add(meshOf(capOuter.build(), solid(C.endothelium, { rough: 0.35, clear: 0.6, defines: { SSS: "" }, uniforms: { uSSSk: { value: 0.3 } } }), "capillaries"));
    g.add(meshOf(capLumen.build(), solid(C.blood, { rough: 0.2, clear: 1 }), "capillary-lumen"));
    // nuclei
    const nm = nucleusMat();
    const ns = instanced(new THREE.SphereGeometry(1, 12, 7), nm, nucleiSide.length, "myonuclei");
    nucleiSide.forEach((n, i) => setInst(ns, i, n.x, n.y, n.z, 0, 0, n.a, 0.8, 2.2, 5.5, "XYZ"));
    const nc = instanced(halfEllipsoid, nm, nucleiCut.length, "myonuclei-cut");
    nucleiCut.forEach((n, i) => setInst(nc, i, n.x, n.y, n.z, 0, 0, n.a, 0.8, 2.3, 5.5, "XYZ"));
    g.add(ns, nc);
    // perimysium: a thin, glistening, translucent collagen sheath over the bundle, ending at the section
    const per = new Geo();
    sheath(per, boundary, -length, -1.5, { off: 11, thick: 1.5, segZ: 1 });
    const pm = membraneMat(0xf7f0ea, { opacity: 0.05, rim: 0.3, rimK: 0.12, rough: 0.1 });
    pm.clearcoat = 1;
    pm.clearcoatRoughness = 0.08;
    g.add(meshOf(per.build(1 / 80), pm, "perimysium"));
    g.userData.fibres = fibreInfo;
    g.userData.capillaries = caps;
    g.userData.top = 1;
    return g;
  }

  // ── 3. MUSCLE FIBRE (one cell), with hypertrophy and satellite-cell fusion ───────────────────────────────────
  // Axis +z, the cut end at z = 0. The fibre is opaque sarcoplasm and myofibrils under a translucent sarcolemma;
  // flattened elongated nuclei lie just under it, oriented along the axis; a satellite cell sits outside the
  // sarcolemma under the basal lamina; the section shows the myofibrils (Voronoi-packed, about 1.2 µm), mitochondria
  // between them and under the sarcolemma, nuclei cut in profile; a sector of myofibrils is drawn out of the cut,
  // their bands in register with the fibre's striations, some wrapped in SR with triads at each A-I junction.
  // pull: how far a sector of myofibrils is drawn out of the cut (0 = a clean flat section). newAt: where grow adds
  // myofibrils, "throughout" (between the old ones, which spread apart) or "periphery" (a ring under the sarcolemma);
  // where new myofibrils form is not settled [S29][S30], so both are offered. Each new one grows in: it starts thin
  // and short of the section, then thickens and lengthens to it.
  function fibre({ diameter = 50, length = 160, myo = 1.2, sr = 0.3, pull = 1, newAt = "throughout", grow = 0, fuse = 0, contract = 0, glowNew = 0, sarcomere = 2.8, short = 2.2, thin = 1.27, seed = 11, satellites = 1, name = "muscle-fibre" } = {}) {
    const rand = rng(seed);
    const R0 = diameter / 2;
    const GROW = 0.5; // +50% CSA at grow = 1
    const R1 = R0 * Math.sqrt(1 + GROW);
    const g = groupOf(
      name,
      "muscle-fibre",
      { diameter, length, myofibril: myo, sarcomere, thinFilament: thin, nucleus: [11, 4.5, 1.6], satelliteCell: [18, 6, 2.2], basalLamina: "drawn 0.3 µm off the sarcolemma (real: ~50 nm lamina + endomysium)" },
      ["S7", "S8", "S9", "S10", "S12", "S13", "S14", "S15", "S29", "S31"],
    );
    const bandU = {
      uSL: { value: sarcomere },
      uPhase: { value: -0.9 },
      uThickL: { value: 1.6 },
      uThinL: { value: thin },
    };
    const fm = fibreMat({}, { BAND: "" });
    Object.assign(fm.userData.u, bandU);
    fm.userData.u.uRelief.value = 0.35;
    // the myofibrils' material: the same bands (shared uniforms), cut faces lighter
    const mm = fibreMat({ color: 0xc63c48, roughness: 0.36 }, { BAND: "" });
    Object.assign(mm.userData.u, bandU);
    mm.userData.u.uRelief.value = 1.6;
    const coreMat = fm;
    // sarcoplasm between myofibrils (seen in the gaps of the section)
    const sarcoplasm = solid(0x6a1822, { rough: 0.6, sheen: 0.3, clear: 0 });
    const core = meshOf(new THREE.CylinderGeometry(1, 1, length, 96, 1, true), coreMat, "sarcoplasm-core");
    core.geometry.rotateX(Math.PI / 2);
    core.geometry.translate(0, 0, -length / 2 - 0.4);
    const floor = meshOf(new THREE.CircleGeometry(1, 96), sarcoplasm, "sarcoplasm");
    const sarcolemmaMat = membraneMat(0xc95560, { opacity: 0.26, rim: 0.26, rimK: 0.07, rough: 0.22, defines: { BAND: "", PITS: "" }, normal: false });
    Object.assign(sarcolemmaMat.userData.u, bandU);
    sarcolemmaMat.userData.u.uADark.value.set(0.66, 0.5, 0.56);
    sarcolemmaMat.userData.u.uRelief.value = 0;
    sarcolemmaMat.clearcoat = 0.5;
    const sarcolemma = meshOf(new THREE.CylinderGeometry(1, 1, length, 128, 1, true), sarcolemmaMat, "sarcolemma");
    sarcolemma.geometry.rotateX(Math.PI / 2);
    sarcolemma.geometry.translate(0, 0, -length / 2);
    g.add(core, floor, sarcolemma);
    // basal lamina: a fainter sheath, peeled back from the cut, tented over the satellite cell
    const laminaEnd = -6;
    const laminaSeg = [128, 90];
    const laminaGeo = new THREE.CylinderGeometry(1, 1, 1, laminaSeg[0], laminaSeg[1], true);
    laminaGeo.rotateX(Math.PI / 2);
    const laminaMat = membraneMat(0xf6efe6, { opacity: 0.16, rim: 0.42, rimK: 0.35 });
    const lamina = meshOf(laminaGeo, laminaMat, "basal-lamina");
    g.add(lamina);
    const laminaBase = laminaGeo.attributes.position.array.slice();
    // nuclei under the sarcolemma: flattened, elongated along the axis, density ~200 per mm (all around)
    const nucCount = Math.round((length / 1000) * 230 * (diameter / 50));
    const nuclei = [];
    for (let i = 0; i < nucCount; i++) nuclei.push({ a: rand() * TAU, z: -6 - rand() * (length - 12), L: 9 + rand() * 4.5, W: 3.8 + rand() * 1.4, D: 1.4 + rand() * 0.4 });
    // nuclei cut by the section (their profiles on the cut face)
    const cutNuclei = [0.6, 2.9, 4.4].map((a) => ({ a: a + rand() * 0.3, W: 4.4, D: 1.5, L: 11 }));
    const nm = nucleusMat();
    const nucMesh = instanced(ellipsoid, nm, nuclei.length, "myonuclei");
    const nucCutMesh = instanced(halfEllipsoid, nm, cutNuclei.length, "myonuclei-cut");
    g.add(nucMesh, nucCutMesh);
    // subsarcolemmal mitochondria: clusters near the nuclei and at the cut face's rim
    const ssm = [];
    for (const n of nuclei.slice(0, Math.min(nuclei.length, 40))) {
      const k = 2 + Math.floor(rand() * 4);
      for (let j = 0; j < k; j++) ssm.push({ a: n.a + (rand() - 0.5) * 0.18, z: n.z + (rand() - 0.5) * n.L * 1.3, s: 0.45 + rand() * 0.35 });
    }
    const mito = mitoMat();
    const mitoCutMat = solid(0x8f4a24, { rough: 0.5, sheen: 0.2, clear: 0.2, defines: { CRISTAE: "" } });
    const ssmMesh = instanced(ellipsoidLo, mito, ssm.length, "mitochondria-subsarcolemmal");
    g.add(ssmMesh);
    // satellite cells: spindle-shaped, flattened between sarcolemma and basal lamina, nucleus filling most of it
    const sats = [];
    for (let i = 0; i < satellites; i++) sats.push({ a: -0.35 + i * 2.1 + (rand() - 0.5) * 0.2, z: -28 - i * 37 - rand() * 10, L: 18, W: 6.5, T: 2.2 });
    const satCellMat = solid(0xd8908f, { rough: 0.42, sheen: 0.25, clear: 0.35, defines: { SSS: "" }, uniforms: { uSSSk: { value: 0.35 }, uSSS: { value: new THREE.Color(0.55, 0.12, 0.12) } } });
    satCellMat.transparent = true;
    const satCells = sats.map((s, i) => {
      const m = meshOf(ellipsoid.clone(), satCellMat, `satellite-cell-${i + 1}`);
      m.userData.base = m.geometry.attributes.position.array.slice();
      g.add(m);
      return m;
    });
    const satNucMat = nucleusMat(C.satNucleus);
    const satNuclei = sats.map((s, i) => {
      const m = meshOf(ellipsoid, satNucMat.clone(), `satellite-cell-nucleus-${i + 1}`);
      m.material.onBeforeCompile = satNucMat.onBeforeCompile;
      m.material.customProgramCacheKey = satNucMat.customProgramCacheKey;
      m.material.userData.u = satNucMat.userData.u;
      g.add(m);
      return m;
    });
    // myofibrils at the cut end: a fixed point set at the grown size, ordered so that every prefix is even
    const coreGap = 0.45; // subsarcolemmal rim at the section (µm)
    const spacing = myo * 1.08;
    const Rc1 = R1 - coreGap;
    const disc1 = circlePoly(Rc1, 96);
    const base = relaxedPoints(disc1, spacing, rand, { jitter: 0.3, iters: 1 });
    // farthest-point order: any prefix is spread evenly over the disc
    const order = [];
    {
      const n = base.length;
      const dmin = new Float64Array(n).fill(Infinity);
      let cur = 0;
      const used = new Uint8Array(n);
      for (let k = 0; k < n; k++) {
        used[cur] = 1;
        order.push(cur);
        let best = -1;
        let bd = -1;
        const [cx, cy] = base[cur];
        for (let j = 0; j < n; j++) {
          if (used[j]) continue;
          const d = (base[j][0] - cx) ** 2 + (base[j][1] - cy) ** 2;
          if (d < dmin[j]) dmin[j] = d;
          if (dmin[j] > bd) {
            bd = dmin[j];
            best = j;
          }
        }
        cur = best;
        if (best < 0) break;
      }
    }
    const rank = new Int32Array(base.length);
    order.forEach((idx, k) => (rank[idx] = k));
    const N0 = Math.round(base.length / (1 + GROW));
    // which myofibrils are drawn out of the cut: a sector facing up-right, longer toward the rim
    const sector = { a: 0.55, w: 0.95 };
    const props = base.map(([x, y]) => {
      const a = Math.atan2(y, x);
      const da = Math.abs(((a - sector.a + Math.PI * 3) % TAU) - Math.PI);
      const rr = Math.hypot(x, y) / Rc1;
      const inSector = da < sector.w / 2 && rr > 0.3;
      const drawn = inSector && rand() < 0.85 ? (2.5 + rand() * 9) * smooth(0.25, 0.8, rr) * (1 - smooth(sector.w * 0.3, sector.w * 0.5, da)) * pull : 0;
      const p2 = drawn > 2 ? drawn : rand() * 0.15;
      return { pull: p2, sr: p2 > 3 && rand() < sr, mito: rand() };
    });
    const myoGroup = new THREE.Group();
    myoGroup.name = "myofibrils";
    const imfGroup = new THREE.Group();
    imfGroup.name = "mitochondria-intermyofibrillar";
    const srGroup = new THREE.Group();
    srGroup.name = "sarcoplasmic-reticulum";
    g.add(myoGroup, imfGroup, srGroup);
    const torusT = new THREE.TorusGeometry(1, 0.035, 5, 22);
    const torusC = new THREE.TorusGeometry(1, 0.075, 6, 22);
    const arc = new THREE.TorusGeometry(1, 0.1, 6, 14, Math.PI * 0.6);
    const rod = new THREE.CylinderGeometry(1, 1, 1, 5, 1, true).rotateX(Math.PI / 2);
    const srMat = membraneMat(C.sr, { opacity: 0.78, rim: 0.2, rimK: 0.2, normal: false });
    srMat.side = THREE.FrontSide;
    const ttMat = solid(C.ttubule, { rough: 0.35, sheen: 0.6, clear: 0.6 });

    function buildSection(Rg) {
      const periphery = newAt === "periphery";
      const k = periphery ? 1 : Rg / R1;
      const Ng = base.length * (Rg / R1) ** 2;
      const ramp = Math.max(8, base.length * 0.06); // how many myofibrils are part-grown at once
      const vis = [];
      const fOf = [];
      const newOf = [];
      for (let i = 0; i < base.length; i++) {
        let f;
        let isNew;
        if (periphery) {
          const d = Rg - coreGap - Math.hypot(base[i][0], base[i][1]);
          f = smooth(-0.4 * spacing, 0.9 * spacing, d);
          isNew = Math.hypot(base[i][0], base[i][1]) > R0 - coreGap - 0.3 * spacing ? 1 : 0;
        } else {
          f = smooth(0, ramp, Ng - rank[i]);
          isNew = rank[i] >= N0 ? 1 : 0;
        }
        if (f > 0.03) {
          vis.push(i);
          fOf.push(f);
          newOf.push(isNew);
        }
      }
      let pts = vis.map((i) => [base[i][0] * k, base[i][1] * k]);
      const disc = circlePoly(Rg - coreGap, 96);
      // obstacles: the nuclei cut by the section push the myofibrils aside
      const obst = cutNuclei.flatMap((n) => {
        const r = Rg - 1.3;
        return [-1.3, 0, 1.3].map((t) => {
          const a = n.a + t / r;
          return [Math.cos(a) * r, Math.sin(a) * r, t ? 0.95 : 1.05];
        });
      });
      pts = pts.map((p) => {
        for (const [ox, oy, orr] of obst) {
          const d = Math.hypot(p[0] - ox, p[1] - oy);
          if (d < orr + 0.4 && d > 1e-6) return [ox + ((p[0] - ox) / d) * (orr + 0.4), oy + ((p[1] - oy) / d) * (orr + 0.4)];
        }
        return p;
      });
      // a growing myofibril claims less room (power-diagram weight), so its neighbours keep theirs
      const w = fOf.map((f) => -(1 - f) * spacing * spacing * 0.9);
      // one relaxation pass, so every state is evenly packed
      let cells = powerCells(pts, w, disc, spacing * 2.3);
      pts = pts.map((p, i) => (cells[i].length >= 3 ? centroid(cells[i]) : p));
      cells = powerCells(pts, w, disc, spacing * 2.3);
      const geo = new Geo();
      const pulled = [];
      const triples = [];
      cells.forEach((cell, j) => {
        if (cell.length < 3) return;
        const i = vis[j];
        const f = fOf[j];
        let ol = inset(cell, 0.04);
        if (ol.length < 3) return;
        ol = fillet(ol, 0.18, 2);
        if (f < 1) {
          // thickening: the profile grows about its own centre
          const [gx, gy] = centroid(ol);
          const sc = lerp(0.35, 1, f);
          ol = ol.map(([x, y]) => [gx + (x - gx) * sc, gy + (y - gy) * sc]);
        }
        ol = avoid(ol, obst.map(([x, y, r]) => [x, y, r + 0.15]));
        const [cx, cy] = centroid(ol);
        const rr = Math.sqrt(Math.abs(area(ol)) / Math.PI);
        if (rr < 0.08) return;
        const pr = props[i];
        const isNew = newOf[j];
        if (pr.pull > 2) {
          // a myofibril drawn out of the section is free of its neighbours: round, its own diameter
          const r0 = Math.min(rr * 0.88, myo * 0.55);
          ol = circlePoly(r0, 22, cx, cy, (a) => 1 + 0.04 * Math.sin(3 * a + i));
        }
        // lengthening: a new myofibril reaches the section last
        const top = f < 1 ? lerp(-1.1, pr.pull, f) : pr.pull;
        prism(geo, ol, -1.6, top, { bevel: pr.pull > 2 ? 0.2 : Math.min(0.12, rr * 0.25), cell: [cx, cy, rr, isNew] });
        if (pr.pull > 2 && f >= 1) pulled.push({ cx, cy, rr: Math.min(rr * 0.88, myo * 0.55), pull: pr.pull, sr: pr.sr, mito: pr.mito });
      });
      for (const v of corners(cells, 0.01)) if (Math.hypot(v.x, v.y) < Rg - 1.5) triples.push(v);
      return { geo: geo.build(), pulled, triples };
    }
    const sectionMesh = meshOf(new THREE.BufferGeometry(), mm, "myofibrils-section");
    myoGroup.add(sectionMesh);
    const mitoCut = instanced(ellipsoidLo, mito, 1, "mitochondria-section");
    imfGroup.add(mitoCut);
    const mitoPair = instanced(arc, mito, 1, "mitochondria-paired");
    imfGroup.add(mitoPair);
    const tt = instanced(torusT, ttMat, 1, "t-tubules");
    const cis = instanced(torusC, srMat, 1, "terminal-cisternae");
    const lsr = instanced(rod, srMat, 1, "longitudinal-sr");
    srGroup.add(tt, cis, lsr);
    const grow1 = (gr) => R0 * Math.sqrt(1 + GROW * gr);
    let lastGrow = null;
    let lastSL = null;

    function place(st) {
      const Rg = grow1(st.grow);
      const SL = lerp(sarcomere, short, st.contract);
      bandU.uSL.value = SL;
      fm.userData.u.uGlowNew.value = 0;
      mm.userData.u.uGlowNew.value = st.glowNew;
      core.scale.set(Rg - 0.35, Rg - 0.35, 1);
      floor.scale.set(Rg - 0.35, Rg - 0.35, 1);
      floor.position.z = -0.45;
      sarcolemma.scale.set(Rg, Rg, 1);
      sarcolemmaMat.userData.u.uR.value = Rg;
      // nuclei
      nuclei.forEach((n, i) => {
        const r = Rg - 0.08 - n.D * 0.5;
        setInst(nucMesh, i, Math.cos(n.a) * r, Math.sin(n.a) * r, n.z, 0, 0, n.a, n.D * 0.5, n.W / 2, n.L / 2);
      });
      nucMesh.count = nuclei.length;
      nucMesh.instanceMatrix.needsUpdate = true;
      cutNuclei.forEach((n, i) => {
        const r = Rg - 1.3;
        setInst(nucCutMesh, i, Math.cos(n.a) * r, Math.sin(n.a) * r, 0.05, 0, 0, n.a, n.D * 0.5, n.W / 2, n.L / 2);
      });
      nucCutMesh.instanceMatrix.needsUpdate = true;
      ssm.forEach((m, i) => {
        const r = Rg - 0.4 - m.s * 0.4;
        setInst(ssmMesh, i, Math.cos(m.a) * r, Math.sin(m.a) * r, m.z, 0, 0, m.a, m.s * 0.55, m.s * 0.8, m.s * 1.2);
      });
      ssmMesh.instanceMatrix.needsUpdate = true;
      // satellite cells and fusion (the first one fuses)
      sats.forEach((s, i) => {
        const f = i === 0 ? st.fuse : 0;
        const flat = 1 - smooth(0.05, 0.65, f); // the cell's own body thins into the fibre
        const m = satCells[i];
        const pos = m.geometry.attributes.position;
        const b = m.userData.base;
        for (let v = 0; v < pos.count; v++) {
          const x = b[v * 3]; // tangential
          const y = b[v * 3 + 1]; // radial
          const z = b[v * 3 + 2]; // axial
          const rad = Rg + 0.05 + (y + 1) * s.T * 0.5 * Math.max(flat, 0.02);
          const a = s.a - (x * s.W * 0.5) / Rg;
          pos.setXYZ(v, Math.cos(a) * rad, Math.sin(a) * rad, s.z + z * s.L * 0.5 * (1 - 0.2 * (1 - flat)));
        }
        pos.needsUpdate = true;
        m.geometry.computeVertexNormals();
        m.material.opacity = lerp(0.62, 0, smooth(0.35, 0.75, f));
        m.visible = m.material.opacity > 0.01;
        m.material.depthWrite = false;
        // the nucleus: from the satellite cell (dark, plump, above the sarcolemma) into a myonucleus (below it)
        const u = smooth(0.25, 0.9, f);
        const n = satNuclei[i];
        const r = lerp(Rg + 0.05 + s.T * 0.55, Rg - 0.08 - 0.8, u);
        n.position.set(Math.cos(s.a) * r, Math.sin(s.a) * r, s.z);
        n.rotation.set(0, 0, s.a);
        n.scale.set(lerp(0.95, 0.8, u), lerp(2.3, 2.25, u), lerp(4.4, 5.6, u));
        n.material.color.set(C.satNucleus).lerp(new THREE.Color(C.nucleus), u);
      });
      // basal lamina: off the sarcolemma, tented over the satellite cells
      {
        const pos = laminaGeo.attributes.position;
        const z1 = laminaEnd;
        const z0 = -length;
        for (let v = 0; v < pos.count; v++) {
          const bx = laminaBase[v * 3];
          const by = laminaBase[v * 3 + 1];
          const bz = laminaBase[v * 3 + 2]; // -0.5..0.5
          const a = Math.atan2(by, bx);
          const z = lerp(z0, z1, bz + 0.5);
          let bump = 0;
          sats.forEach((s, i) => {
            const f = i === 0 ? st.fuse : 0;
            const flat = 1 - smooth(0.05, 0.65, f);
            const da = (((a - s.a + Math.PI * 3) % TAU) - Math.PI) * Rg;
            const dz = z - s.z;
            bump += s.T * 1.05 * flat * Math.exp(-((da / (s.W * 0.62)) ** 2) - (dz / (s.L * 0.55)) ** 2);
          });
          const r = Rg + 0.3 + bump;
          pos.setXYZ(v, Math.cos(a) * r, Math.sin(a) * r, z);
        }
        pos.needsUpdate = true;
        laminaGeo.computeVertexNormals();
      }
      // the section: rebuilt when the fibre grows (myofibrils added, cross-section widened)
      if (lastGrow !== st.grow || lastSL !== SL) {
        lastGrow = st.grow;
        lastSL = SL;
        const { geo, pulled, triples } = buildSection(Rg);
        sectionMesh.geometry.dispose();
        sectionMesh.geometry = geo;
        // mitochondria in the section: at some myofibril corners (I-band level: the cut is near a Z-line)
        const mc = triples.filter((_, i) => i % 4 === 0);
        const mc2 = instanced(ellipsoidLo, mitoCutMat, mc.length, "mitochondria-section");
        mc.forEach((v, i) => setInst(mc2, i, v.x, v.y, -0.12, 0, 0, (i * 2.39) % TAU, 0.34, 0.2, 0.26));
        const oldCut = place.mc ?? mitoCut;
        imfGroup.remove(oldCut);
        oldCut.dispose();
        imfGroup.add(mc2);
        place.mc = mc2;
        // along the drawn-out myofibrils: paired mitochondria at the I-band either side of each Z-line (no SR),
        // or the SR sleeve with a triad at each A-I junction
        const pairs = [];
        const tts = [];
        const ciss = [];
        const longs = [];
        const phase = bandU.uPhase.value;
        for (const p of pulled) {
          const rr = p.rr + 0.06;
          const firstM = Math.ceil((-0.8 - phase) / SL);
          for (let kk = firstM; ; kk++) {
            const M = phase + kk * SL;
            if (M - SL / 2 > p.pull) break;
            const Zs = [M - SL / 2, M + SL / 2];
            if (!p.sr) {
              for (const Z of [M + SL / 2]) {
                for (const side of [-1, 1]) {
                  const z = Z + side * (0.18 + 0.05 * SL);
                  if (z > 0.3 && z < p.pull - 0.2) pairs.push({ x: p.cx, y: p.cy, z, r: rr + 0.08, a: p.mito * TAU + kk * 1.3 + side });
                }
              }
              continue;
            }
            for (const side of [-1, 1]) {
              const T = M + side * 0.8;
              if (T > 0.2 && T < p.pull - 0.1) {
                tts.push({ x: p.cx, y: p.cy, z: T, r: rr + 0.12 });
                for (const s2 of [-1, 1]) ciss.push({ x: p.cx, y: p.cy, z: T + s2 * 0.16, r: rr + 0.12 });
                // longitudinal tubules over the A-band (toward M) and the I-band (toward Z)
                for (let q = 0; q < 7; q++) {
                  const a = (q / 7) * TAU + kk;
                  const zA0 = T - side * 0.28;
                  const zA1 = M + side * 0.08;
                  const zI0 = T + side * 0.28;
                  const zI1 = Zs[side > 0 ? 1 : 0] - side * 0.05;
                  for (const [za, zb] of [
                    [zA0, zA1],
                    [zI0, zI1],
                  ]) {
                    const lo = Math.max(0.15, Math.min(za, zb));
                    const hi = Math.min(p.pull - 0.05, Math.max(za, zb));
                    if (hi - lo > 0.05) longs.push({ x: p.cx + Math.cos(a) * (rr + 0.12), y: p.cy + Math.sin(a) * (rr + 0.12), z: (lo + hi) / 2, l: hi - lo });
                  }
                }
              }
            }
            if (M > 0.2 && M < p.pull) ciss.push({ x: p.cx, y: p.cy, z: M, r: rr + 0.1, thin: true }); // fenestrated collar at H
          }
        }
        const remake = (old, geo, mat, list, nm2, set) => {
          const mesh = instanced(geo, mat, list.length, nm2);
          list.forEach((it, i) => set(mesh, i, it));
          mesh.instanceMatrix.needsUpdate = true;
          old.parent.add(mesh);
          old.parent.remove(old);
          old.dispose();
          return mesh;
        };
        place.pair = remake(place.pair ?? mitoPair, arc, mito, pairs, "mitochondria-paired", (m, i, it) => setInst(m, i, it.x, it.y, it.z, 0, 0, it.a, it.r, it.r, 1.4));
        place.tt = remake(place.tt ?? tt, torusT, ttMat, tts, "t-tubules", (m, i, it) => setInst(m, i, it.x, it.y, it.z, 0, 0, 0, it.r, it.r, 1));
        place.cis = remake(place.cis ?? cis, torusC, srMat, ciss, "terminal-cisternae", (m, i, it) => setInst(m, i, it.x, it.y, it.z, 0, 0, 0, it.r, it.r, it.thin ? 0.6 : 1));
        place.lsr = remake(place.lsr ?? lsr, rod, srMat, longs, "longitudinal-sr", (m, i, it) => setInst(m, i, it.x, it.y, it.z, 0, 0, 0, 0.045, 0.045, it.l));
      }
      lamina.visible = true;
    }
    track(g, { grow, fuse, contract, glowNew }, place);
    g.userData.satellites = sats; // [{ a (angle), z, L, W, T }] in the fibre's own frame
    g.userData.radius = () => grow1(g.userData.state.grow);
    return g;
  }

  // ── 4. MYOFIBRIL ───────────────────────────────────────────────────────────────────────────────────────────
  // About 1.2 µm across, a chain of sarcomeres along +z ending at z = 0 in a clean cut through the overlap zone, so
  // the filament lattice shows on the face (blue myosin, gold actin, six thin around each thick). An SR sleeve
  // (longitudinal tubules, H-zone collar, terminal cisternae) with a T-tubule at each A-I junction wraps most of it;
  // paired mitochondria sit at the I-bands. Bands match the fibre's (same sarcomere length and phase rule).
  function myofibril({ sarcomeres = 5, diameter = 1.2, sr = true, srArc = 2 * Math.PI, contract = 0, sarcomere = 2.8, short = 2.2, thinL = 1.27, spacing = 0.04, name = "myofibril" } = {}) {
    const R = diameter / 2;
    const g = groupOf(name, "myofibril", { diameter, sarcomeres, sarcomere, latticeSpacing: spacing }, ["S8", "S14", "S15", "S16", "S17", "S23"]);
    const bandU = { uSL: { value: sarcomere }, uPhase: { value: 0 }, uThickL: { value: 1.6 }, uThinL: { value: thinL } };
    const mm = fibreMat({ color: 0xc8404c, roughness: 0.34 }, { BAND: "" });
    Object.assign(mm.userData.u, bandU);
    mm.userData.u.uRelief.value = 2.4;
    mm.userData.u.uSSSk.value = 0.45;
    const body = meshOf(new THREE.BufferGeometry(), mm, "myofibril-body");
    // the far end is closed with a rounded cap
    const end = meshOf(new THREE.SphereGeometry(R, 48, 16, 0, TAU, Math.PI / 2, Math.PI / 2).rotateX(-Math.PI / 2), mm, "myofibril-end");
    g.add(body, end);
    // the cut face: thick and thin filaments in their lattice, standing a little proud like a fresh section
    const thick = [];
    const thin = [];
    const a = spacing;
    const h = (a * Math.sqrt(3)) / 2;
    const n = Math.ceil(R / a) + 2;
    for (let j = -n * 2; j <= n * 2; j++)
      for (let i = -n * 2; i <= n * 2; i++) {
        const x = i * a + j * a * 0.5;
        const y = j * h;
        if (Math.hypot(x, y) < R - 0.02) thick.push([x, y]);
        for (const [dx, dy] of [
          [a / 2, h / 3],
          [a, (2 * h) / 3],
        ])
          if (Math.hypot(x + dx, y + dy) < R - 0.012) thin.push([x + dx, y + dy]);
      }
    const r = rng(19);
    const thickMat = solid(C.myosin, { rough: 0.35, clear: 0.6 });
    const thinMat = solid(C.actin, { rough: 0.35, clear: 0.6 });
    const cyl = new THREE.CylinderGeometry(1, 1, 1, 8, 1).rotateX(Math.PI / 2).translate(0, 0, 0.5);
    const thickMesh = instanced(cyl, thickMat, thick.length, "thick-filaments-section");
    const thinMesh = instanced(cyl, thinMat, thin.length, "thin-filaments-section");
    g.add(thickMesh, thinMesh);
    // a dark matrix behind them (the gaps between filaments read as depth)
    const face = meshOf(new THREE.CircleGeometry(R * 0.999, 72), solid(0x4a1018, { rough: 0.8, sheen: 0.2, clear: 0 }), "section-matrix");
    g.add(face);
    // SR and T-tubules
    const srMat = membraneMat(C.sr, { opacity: 0.8, rim: 0.25, rimK: 0.35, normal: false });
    srMat.side = THREE.FrontSide;
    srMat.depthWrite = true;
    const ttMat = solid(C.ttubule, { rough: 0.3, sheen: 0.6, clear: 0.6 });
    const srGroup = new THREE.Group();
    srGroup.name = "sarcoplasmic-reticulum";
    const mitoGroup = new THREE.Group();
    mitoGroup.name = "mitochondria";
    g.add(srGroup, mitoGroup);
    const mito = mitoMat();
    function place(st) {
      const SL = lerp(sarcomere, short, st.contract);
      bandU.uSL.value = SL;
      // z = 0 cuts the last sarcomere 0.45 µm from its M-line (in the overlap zone at rest)
      const L = SL * (sarcomeres - 1) + SL / 2 + 0.45;
      bandU.uPhase.value = -0.45;
      body.geometry.dispose();
      body.geometry = new THREE.CylinderGeometry(R, R, L, 72, 1, true).rotateX(Math.PI / 2).translate(0, 0, -L / 2);
      end.position.z = -L;
      for (const [mesh, list, rad] of [
        [thickMesh, thick, 0.0075],
        [thinMesh, thin, 0.0035],
      ]) {
        list.forEach(([x, y], i) => setInst(mesh, i, x, y, -0.01, 0, 0, 0, rad, rad, 0.012 + r() * 0.02 + (mesh === thickMesh ? 0.012 : 0)));
        mesh.instanceMatrix.needsUpdate = true;
      }
      face.position.z = -0.002;
      // rebuild the sleeve for this sarcomere length
      for (const c of [...srGroup.children, ...mitoGroup.children]) {
        c.geometry.dispose();
        c.parent.remove(c);
      }
      if (sr) {
        const geo = new Geo();
        const tgeo = new Geo();
        const r0 = R + 0.06;
        const a0 = Math.PI * 0.5 - srArc / 2; // the open side faces the camera's default view (+x side kept open)
        const arcPts = (z, rad, steps = 40, from = a0, span = srArc) => Array.from({ length: steps + 1 }, (_, k) => V3(Math.cos(from + (span * k) / steps) * rad, Math.sin(from + (span * k) / steps) * rad, z));
        for (let k = 0; k < sarcomeres; k++) {
          const M = -0.45 - k * SL;
          if (k < 2) continue; // the two sarcomeres at the cut stay bare, to show their bands
          for (const side of [-1, 1]) {
            const T = M + side * 0.8;
            tubeInto(tgeo, arcPts(T, r0 + 0.02), 0.03, 6);
            tubeInto(geo, arcPts(T - 0.11, r0 + 0.03), 0.065, 6);
            tubeInto(geo, arcPts(T + 0.11, r0 + 0.03), 0.065, 6);
            // longitudinal tubules over the A-band with cross-links, and over the I-band to the Z-line
            const nl = srArc > 6 ? 12 : 9;
            for (let q = 0; q <= nl; q++) {
              const ang = a0 + (srArc * q) / nl;
              const wig = (z0, z1, ph) =>
                Array.from({ length: 9 }, (_, s) => {
                  const z = lerp(z0, z1, s / 8);
                  const aa = ang + 0.06 * Math.sin(s * 1.7 + ph);
                  return V3(Math.cos(aa) * (r0 + 0.01), Math.sin(aa) * (r0 + 0.01), z);
                });
              tubeInto(geo, wig(T - side * 0.16, M + side * 0.06, q), 0.022, 5);
              tubeInto(geo, wig(T + side * 0.16, M + side * (SL / 2 - 0.04), q + 2), 0.022, 5);
            }
          }
          // fenestrated collar at the H-zone
          tubeInto(geo, arcPts(M, r0 + 0.01), 0.04, 6);
          tubeInto(geo, arcPts(M - 0.12, r0 + 0.01), 0.02, 5);
          tubeInto(geo, arcPts(M + 0.12, r0 + 0.01), 0.02, 5);
        }
        srGroup.add(meshOf(geo.build(), srMat, "sr-network"), meshOf(tgeo.build(), ttMat, "t-tubules"));
      }
      // paired mitochondria at the I-band, either side of each Z-line, on the open side
      const mg = new Geo();
      for (let k = 0; k < sarcomeres - 1; k++) {
        const Z = -0.45 - k * SL - SL / 2;
        for (const side of [-1, 1]) {
          const z = Z + side * 0.22;
          const pts = Array.from({ length: 17 }, (_, s) => {
            const aa = -Math.PI * 0.55 + (Math.PI * 0.9 * s) / 16;
            return V3(Math.cos(aa) * (R + 0.1), Math.sin(aa) * (R + 0.1), z);
          });
          tubeInto(mg, pts, 0.09, 10, [0, 0, 0, 0], (u) => 0.09 * Math.sqrt(Math.max(0.05, Math.sin(Math.PI * u))));
        }
      }
      mitoGroup.add(meshOf(mg.build(), mito, "mitochondria-paired"));
    }
    track(g, { contract }, place);
    return g;
  }

  // ── 5. SARCOMERE: the filament lattice from Z to Z ──────────────────────────────────────────────────────────
  // M-line at z = 0, Z-discs at ±SL/2, a cylinder of lattice `radius` µm. Thick filaments (myosin, 1.6 µm, a bare
  // zone at M, head pairs in three-stranded crowns every 14.3 nm turned 40° each) on a hexagonal lattice 40 nm
  // apart; thin filaments (F-actin double helix, 36 nm crossovers, tropomyosin in the grooves, troponin every
  // 38.5 nm) in the trigonal positions, anchored in a Z-disc of alpha-actinin struts (zig-zag) where the next
  // sarcomere's filaments interdigitate; myomesin bridges at the M-line; titin from each Z to the M-line.
  // state.contract 0..1 slides the thin filaments toward M (SL rest -> short: A-band constant, I-band and H-zone
  // shrink; defaults are human: rest 2.8, short 2.2, thin 1.27); state.heads 0..1 is the cross-bridge stroke (lever from ~90° to ~45°, heads leaning toward M).
  function sarcomere({ radius = 0.13, slab = null, span = null, contract = 0, heads = 0, rest = 2.8, short = 2.2, thickL = 1.6, thinL = 1.27, spacing = 0.04, bare = 0.16, titin = 2, seed = 23, name = "sarcomere" } = {}) {
    // slab: [width, depth] µm keeps a flat slice of the lattice (like a longitudinal EM section) instead of a cylinder
    // span: [z0, z1] µm builds only what reaches into that range of z (a thin transverse slab for a cross-section)
    const keep = (a, b) => !span || (Math.max(a, b) >= span[0] && Math.min(a, b) <= span[1]);
    const inside = (x, y, m) => (slab ? Math.abs(x) <= slab[0] / 2 + m && Math.abs(y) <= slab[1] / 2 + m : Math.hypot(x, y) <= radius + m);
    const rand = rng(seed);
    const g = groupOf(
      name,
      "sarcomere",
      { radius, rest, short, thick: thickL, thin: thinL, spacing, bareZone: bare, thickDiameter: 0.015, thinDiameter: 0.007, crown: 0.0143, repeat: 0.0429, troponin: 0.0385, zDisc: 0.04, titinPerHalfThick: `${titin} drawn (6 in vivo)` },
      ["S8", "S16", "S17", "S18", "S19", "S22", "S23", "S24", "S26", "S27", "S28"],
    );
    const a = spacing;
    const h = (a * Math.sqrt(3)) / 2;
    const thick = [];
    const thin = [];
    const n = Math.ceil((slab ? Math.max(...slab) : radius * 2) / a) + 2;
    for (let j = -n * 2; j <= n * 2; j++)
      for (let i = -n * 2; i <= n * 2; i++) {
        const x = i * a + j * a * 0.5;
        const y = j * h;
        if (inside(x, y, 0)) thick.push([x, y]);
        for (const [dx, dy] of [
          [a / 2, h / 3],
          [a, (2 * h) / 3],
        ])
          if (inside(x + dx, y + dy, a * 0.35)) thin.push([x + dx, y + dy]);
      }
    const thickMat = solid(C.myosin, { rough: 0.32, sheen: 0.5, clear: 0.6, defines: { HELIX: "" } });
    const headMat = solid(C.myosinHead, { rough: 0.3, sheen: 0.6, clear: 0.6 });
    const actinMat = solid(C.actin, { rough: 0.3, sheen: 0.5, clear: 0.6 });
    const tmMat = solid(C.tropomyosin, { rough: 0.35, clear: 0.5 });
    const tnMat = solid(C.troponin, { rough: 0.35, clear: 0.5 });
    const titinMat = solid(C.titin, { rough: 0.4, clear: 0.4 });
    const zMat = solid(C.zdisc, { rough: 0.35, clear: 0.5 });
    // thick filament: tapered backbone along z, centred on M
    const backbone = (() => {
      const prof = [];
      const L = thickL / 2;
      for (let k = 0; k <= 24; k++) {
        const z = -L + (2 * L * k) / 24;
        const taper = smooth(L, L - 0.12, Math.abs(z));
        prof.push(new THREE.Vector2(0.0075 * (0.45 + 0.55 * taper), z));
      }
      prof.unshift(new THREE.Vector2(0.0001, -L - 0.002));
      prof.push(new THREE.Vector2(0.0001, L + 0.002));
      const geo = new THREE.LatheGeometry(prof, 8);
      geo.rotateX(Math.PI / 2);
      geo.computeVertexNormals();
      return geo;
    })();
    const thickMesh = instanced(backbone, thickMat, thick.length, "thick-filaments");
    thick.forEach(([x, y], i) => setInst(thickMesh, i, x, y, 0, 0, 0, 0, 1, 1, 1));
    g.add(thickMesh);
    // head pair: two pear-shaped S1 heads from a short S2 neck; local +x is out from the backbone, +z toward Z
    const headPair = (() => {
      const parts = [];
      for (const s of [-1, 1]) {
        const ico = new THREE.IcosahedronGeometry(1, 0);
        ico.scale(0.0085, 0.0032, 0.0028);
        ico.translate(0.0105, s * 0.0024, 0);
        ico.rotateX(s * 0.35);
        parts.push(ico);
      }
      const neck = new THREE.CylinderGeometry(0.0012, 0.0012, 0.008, 4, 1).rotateZ(Math.PI / 2).translate(0.004, 0, 0);
      parts.push(neck);
      const m = mergeGeos(parts);
      m.computeVertexNormals();
      return m;
    })();
    const crowns = [];
    const L2 = thickL / 2;
    for (const half of [-1, 1]) for (let z = bare / 2; z <= L2 - 0.01; z += 0.0143) if (keep(half * z - 0.02, half * z + 0.02)) crowns.push({ z: half * z, half, k: Math.round((z - bare / 2) / 0.0143) });
    const headMesh = instanced(headPair, headMat, thick.length * crowns.length * 3, "myosin-heads");
    g.add(headMesh);
    const headInfo = [];
    thick.forEach(([x, y], ti) => {
      const phi0 = rand() * TAU;
      for (const c of crowns)
        for (let j = 0; j < 3; j++) headInfo.push({ x, y, z: c.z, half: c.half, phi: phi0 + c.k * ((40 * Math.PI) / 180) + (j * TAU) / 3, jit: (rand() - 0.5) * 0.25 });
      void ti;
    });
    // thin filament: two strands of actin twisting (crossovers every 36 nm), tropomyosin along each groove,
    // troponin every 38.5 nm alternating strands. Built along +z from its Z end (z = 0) for thinL.
    const thinGeo = (() => {
      const geo = new Geo();
      const pitch = 0.072; // full turn of one strand
      const steps = Math.ceil((thinL / 0.036) * 5);
      for (const s of [0, 1]) {
        const pts = [];
        const tm = [];
        for (let k = 0; k <= steps; k++) {
          const z = (thinL * k) / steps;
          const ang = (z / pitch) * TAU + s * Math.PI;
          pts.push(V3(Math.cos(ang) * 0.0018, Math.sin(ang) * 0.0018, z));
          const at = ang + Math.PI / 2;
          tm.push(V3(Math.cos(at) * 0.0042, Math.sin(at) * 0.0042, z));
        }
        tubeInto(geo, pts, 0.0026, 4);
        if (s === 0) tubeInto(geo, tm, 0.0009, 3);
        else tubeInto(geo, tm.map((p) => V3(-p.x, -p.y, p.z)), 0.0009, 3);
      }
      const base = geo.build();
      const tn = [];
      for (let z = 0.02, k = 0; z < thinL - 0.01; z += 0.0385, k++) {
        for (const s of [0, 1]) {
          const ico = new THREE.OctahedronGeometry(1, 0).scale(0.0026, 0.0026, 0.004);
          const zz = z + s * 0.0193; // the two strands' troponins are offset
          const ang = (zz / 0.072) * TAU + s * Math.PI + Math.PI / 2;
          ico.translate(Math.cos(ang) * 0.0055, Math.sin(ang) * 0.0055, zz);
          tn.push(ico);
        }
      }
      return { actin: base, troponin: mergeGeos(tn) };
    })();
    // the actin strands and tropomyosin share one geometry: split the colours with two meshes drawing the same
    // instances (tropomyosin is the thinner tube; the shader can't tell, so tropomyosin is drawn as its own geo)
    const thinActin = (() => {
      const geo = new Geo();
      const steps = Math.ceil((thinL / 0.036) * 5);
      for (const s of [0, 1]) {
        const pts = [];
        for (let k = 0; k <= steps; k++) {
          const z = (thinL * k) / steps;
          const ang = (z / 0.072) * TAU + s * Math.PI;
          pts.push(V3(Math.cos(ang) * 0.0018, Math.sin(ang) * 0.0018, z));
        }
        tubeInto(geo, pts, 0.0026, 4);
      }
      return geo.build();
    })();
    const thinTm = (() => {
      const geo = new Geo();
      const steps = Math.ceil((thinL / 0.036) * 4);
      for (const s of [0, 1]) {
        const pts = [];
        for (let k = 0; k <= steps; k++) {
          const z = (thinL * k) / steps;
          const ang = (z / 0.072) * TAU + s * Math.PI + Math.PI / 2;
          pts.push(V3(Math.cos(ang) * 0.0041, Math.sin(ang) * 0.0041, z));
        }
        tubeInto(geo, pts, 0.0008, 3);
      }
      return geo.build();
    })();
    thinGeo.actin.dispose();
    const nThin = thin.length * 2;
    const actinMesh = instanced(thinActin, actinMat, nThin, "thin-filaments-actin");
    const tmMesh = instanced(thinTm, tmMat, nThin, "tropomyosin");
    const tnMesh = instanced(thinGeo.troponin, tnMat, nThin, "troponin");
    g.add(actinMesh, tmMesh, tnMesh);
    const thinPhase = thin.map(() => rand() * TAU);
    // the next sarcomeres' thin filaments, just across each Z-disc (offset: the Z lattice is square, interdigitated)
    const stubL = 0.12;
    const stubGeo = (() => {
      const geo = new Geo();
      for (const s of [0, 1]) {
        const pts = [];
        for (let k = 0; k <= 20; k++) {
          const z = (stubL * k) / 20;
          const ang = (z / 0.072) * TAU + s * Math.PI;
          pts.push(V3(Math.cos(ang) * 0.0018, Math.sin(ang) * 0.0018, z));
        }
        tubeInto(geo, pts, 0.0026, 4);
      }
      return geo.build();
    })();
    const stubs = thin.map(([x, y]) => [x + a * 0.25, y + h * 0.18]);
    const stubMesh = instanced(stubGeo, actinMat, stubs.length * 2, "thin-filaments-next-sarcomeres");
    g.add(stubMesh);
    // Z-disc: alpha-actinin struts between each filament end and its nearest opposite-side neighbours (zig-zag)
    const strut = new THREE.CylinderGeometry(0.0013, 0.0013, 1, 4, 1).rotateX(Math.PI / 2).translate(0, 0, 0.5);
    const links = [];
    thin.forEach(([x, y]) => {
      const near = stubs.map(([sx, sy], k) => [Math.hypot(sx - x, sy - y), k]).sort((p, q) => p[0] - q[0]).slice(0, 2);
      for (const [, k] of near) links.push([x, y, stubs[k][0], stubs[k][1]]);
    });
    const zMesh = instanced(strut, zMat, links.length * 4, "z-disc-alpha-actinin");
    g.add(zMesh);
    // M-line: myomesin bridges between neighbouring thick filaments at three levels (M4', M1, M4)
    const mGeo = new Geo();
    const neigh = [];
    thick.forEach(([x, y], i) =>
      thick.forEach(([x2, y2], j) => {
        if (j > i && Math.abs(Math.hypot(x2 - x, y2 - y) - a) < a * 0.1) neigh.push([x, y, x2, y2]);
      }),
    );
    for (const [x, y, x2, y2] of neigh)
      for (const z of [-0.022, 0, 0.022]) {
        const mx = (x + x2) / 2;
        const my = (y + y2) / 2;
        if (keep(z, z)) tubeInto(mGeo, [V3(x, y, z), V3(mx, my, z + 0.004), V3(x2, y2, z)], 0.0016, 4);
      }
    g.add(meshOf(mGeo.build(), zMat, "m-line-myomesin"));
    // titin: Z-disc to the thick filament's tip (the extensible I-band spring), then along it to M
    const titinMesh = meshOf(new THREE.BufferGeometry(), titinMat, "titin");
    g.add(titinMesh);
    const titinPaths = [];
    thick.forEach(([x, y]) => {
      for (const half of [-1, 1])
        for (let k = 0; k < titin; k++) {
          const ang = rand() * TAU;
          if (!span) titinPaths.push({ x, y, half, ang });
        }
    });

    function place(st) {
      const SL = lerp(rest, short, st.contract);
      const Zr = SL / 2;
      // thin filaments: anchored at each Z-disc, pointing to M
      let i = 0;
      thin.forEach(([x, y], k) => {
        for (const half of [-1, 1]) {
          // half = -1: the left Z at -Zr, filament runs +z; half = +1: right Z at +Zr, runs -z
          const rx = half > 0 ? Math.PI : 0;
          const zEnd = half * (Zr + 0.015);
          if (!keep(zEnd, zEnd - half * thinL)) continue;
          setInst(actinMesh, i, x, y, zEnd, rx, 0, thinPhase[k], 1, 1, 1, "XYZ");
          tmMesh.setMatrixAt(i, _m);
          tnMesh.setMatrixAt(i, _m);
          i++;
        }
      });
      for (const mesh of [actinMesh, tmMesh, tnMesh]) {
        mesh.count = i;
        mesh.instanceMatrix.needsUpdate = true;
      }
      i = 0;
      stubs.forEach(([x, y], k) => {
        for (const half of [-1, 1]) {
          if (!keep(half * (Zr - 0.03), half * (Zr - 0.03 + stubL))) continue;
          setInst(stubMesh, i++, x, y, half * (Zr - 0.03), half > 0 ? 0 : Math.PI, 0, k * 0.7, 1, 1, 1);
        }
      });
      stubMesh.count = i;
      stubMesh.instanceMatrix.needsUpdate = true;
      // Z-disc struts: each link two struts (two Z-link layers, as in fast fibres), alternating = zig-zag
      i = 0;
      const dir = new THREE.Vector3();
      const up = new THREE.Vector3(0, 0, 1);
      for (const half of [-1, 1]) {
        const zc = half * Zr;
        if (!keep(zc - 0.015, zc + 0.015)) continue;
        for (const [x, y, sx, sy] of links) {
          for (const layer of [-1, 1]) {
            const p0 = V3(x, y, zc + layer * 0.012);
            const p1 = V3(sx, sy, zc - layer * 0.012);
            dir.subVectors(p1, p0);
            const len = dir.length();
            _q.setFromUnitVectors(up, dir.normalize());
            _m.compose(p0, _q, _s.set(1, 1, len));
            zMesh.setMatrixAt(i++, _m);
          }
        }
      }
      zMesh.count = i;
      zMesh.instanceMatrix.needsUpdate = true;
      // myosin heads: lever from ~90° (pre-stroke, slightly toward Z) to ~45° leaning toward M (post-stroke)
      i = 0;
      for (const hd of headInfo) {
        const tiltDeg = lerp(-8, 45, clamp(st.heads + hd.jit * 0.3)) + hd.jit * 12;
        const tilt = (tiltDeg * Math.PI) / 180;
        // local x points out; rotate about local y so the tip leans toward M (toward -z in the right half)
        _e.set(0, hd.half > 0 ? tilt : -tilt, hd.phi, "ZYX");
        _q.setFromEuler(_e);
        const ox = Math.cos(hd.phi) * 0.0065;
        const oy = Math.sin(hd.phi) * 0.0065;
        _m.compose(_p.set(hd.x + ox, hd.y + oy, hd.z), _q, _s.set(1, 1, 1));
        headMesh.setMatrixAt(i++, _m);
      }
      headMesh.instanceMatrix.needsUpdate = true;
      // titin
      const tg = new Geo();
      for (const t of titinPaths) {
        const zZ = t.half * Zr;
        const zTip = t.half * (thickL / 2);
        const pts = [];
        const r0 = 0.012;
        const iLen = Math.abs(zZ - zTip);
        const coils = Math.max(2, Math.round(iLen / 0.03));
        const amp = 0.006 * clamp(1.4 - iLen / 0.45, 0.25, 1.2); // a spring: coils looser when stretched
        for (let k = 0; k <= 40; k++) {
          const u = k / 40;
          const z = lerp(zZ, zTip, u);
          const ang = t.ang + u * 0.6;
          const wig = amp * Math.sin(u * coils * TAU) * Math.sin(Math.PI * u);
          pts.push(V3(t.x + Math.cos(ang) * (r0 + wig), t.y + Math.sin(ang) * (r0 + wig), z));
        }
        for (let k = 1; k <= 12; k++) {
          const u = k / 12;
          const z = lerp(zTip, 0.004 * t.half, u);
          const ang = t.ang + 0.6 + u * 0.8;
          pts.push(V3(t.x + Math.cos(ang) * 0.0085, t.y + Math.sin(ang) * 0.0085, z));
        }
        tubeInto(tg, pts, 0.0011, 3);
      }
      titinMesh.geometry.dispose();
      titinMesh.geometry = tg.build();
      g.userData.length = SL;
      g.userData.bands = { A: thickL, I: Math.max(0, SL - thickL), H: Math.max(0, SL - 2 * thinL), SL };
    }
    // with a span, each filament is capped where the slab is cut, so the section reads as solid dots: a thick
    // filament with its six thin neighbours
    if (span) {
      const disc = new THREE.CircleGeometry(1, 20);
      const tc = instanced(disc, thickMat, thick.length, "thick-filaments-section");
      thick.forEach(([x, y], k) => setInst(tc, k, x, y, span[1] - 0.0004, 0, 0, 0, 0.0075, 0.0075, 1));
      const nc = instanced(disc, actinMat, thin.length, "thin-filaments-section");
      thin.forEach(([x, y], k) => setInst(nc, k, x, y, span[1] - 0.0004, 0, 0, 0, 0.0042, 0.0042, 1));
      g.add(tc, nc);
    }
    track(g, { contract, heads }, place);
    return g;
  }

  // ── 5b. OVERLAP ZONE, molecule by molecule ──────────────────────────────────────────────────────────────────
  // One thick filament and the six thin filaments around it over `length` µm of the overlap zone (right half of a
  // sarcomere: M is toward -z). Actin monomers (5.5 nm, two strands, 13 per 36 nm crossover), tropomyosin coiled-
  // coils in both grooves, troponin complexes (core + TnT tail) every 38.5 nm, myosin heads in crowns every
  // 14.3 nm turned 40°: each with a motor domain and a lever arm (with its two light chains) on an S2 neck. Heads
  // whose azimuth faces a thin filament reach it; state.heads swings their levers through the power stroke.
  function overlap({ length = 0.26, heads = 0, spacing = 0.04, seed = 31, name = "overlap-zone" } = {}) {
    const rand = rng(seed);
    const g = groupOf(name, "overlap-molecular", { length, spacing, actinMonomer: 0.0055, crossover: 0.036, troponin: 0.0385, crown: 0.0143 }, ["S18", "S19", "S20", "S22", "S23", "S27"]);
    const dThin = spacing / Math.sqrt(3); // thick-thin axis distance (23 nm)
    const thinPos = Array.from({ length: 6 }, (_, k) => {
      const a = (k * Math.PI) / 3 + Math.PI / 6;
      return [Math.cos(a) * dThin, Math.sin(a) * dThin, a];
    });
    const actinMat = solid(C.actin, { rough: 0.32, sheen: 0.6, clear: 0.5, defines: { CHROMATIN: "" } });
    const actinMat2 = solid(0xe39a2f, { rough: 0.32, sheen: 0.6, clear: 0.5, defines: { CHROMATIN: "" } });
    const tmMat = solid(C.tropomyosin, { rough: 0.35, clear: 0.5 });
    const tnMat = solid(C.troponin, { rough: 0.35, clear: 0.5 });
    const myoMat = solid(C.myosin, { rough: 0.3, clear: 0.6, defines: { HELIX: "" } });
    const headMat = solid(C.myosinHead, { rough: 0.3, sheen: 0.6, clear: 0.6, defines: { CHROMATIN: "" } });
    const lcMat = solid(0x9fd0f5, { rough: 0.3, clear: 0.6 });
    const sph = new THREE.IcosahedronGeometry(1, 2);
    // actin: per filament, two strands; monomer every 5.54 nm per strand, strands offset by half
    const rise = 0.036 / 6.5;
    const nMon = Math.ceil(length / rise) + 2;
    const strands = [actinMat, actinMat2].map((mat, s) => instanced(sph, mat, 6 * nMon, s ? "actin-strand-b" : "actin-strand-a"));
    const tmGeo = new Geo();
    const tnGeo = new Geo();
    thinPos.forEach(([x, y], f) => {
      const ph = rand() * TAU;
      for (let s = 0; s < 2; s++) {
        for (let k = 0; k < nMon; k++) {
          const z = k * rise + s * rise * 0.5;
          if (z > length) break;
          const ang = ph + (z / 0.072) * TAU + s * Math.PI;
          // a monomer: slightly elongated, tilted along its strand
          setInst(strands[s], f * nMon + k, x + Math.cos(ang) * 0.0017, y + Math.sin(ang) * 0.0017, z, 0, 0, ang, 0.0027, 0.0024, 0.003);
        }
        // tropomyosin along the groove of this strand (coiled-coil: two thin helices wound together)
        for (const cc of [0, 1]) {
          const pts = [];
          for (let k = 0; k <= 180; k++) {
            const z = (length * k) / 180;
            const ang = ph + (z / 0.072) * TAU + s * Math.PI + Math.PI * 0.42;
            const r = 0.0043;
            const cx = x + Math.cos(ang) * r;
            const cy = y + Math.sin(ang) * r;
            const tw = (z / 0.014) * TAU + cc * Math.PI;
            pts.push(V3(cx + Math.cos(tw) * 0.0006, cy + Math.sin(tw) * 0.0006, z));
          }
          tubeInto(tmGeo, pts, 0.0007, 4);
        }
        // troponin every 38.5 nm on this strand: TnC/TnI core lobes and the elongated TnT tail on tropomyosin
        for (let z = 0.01 + s * 0.019; z < length - 0.006; z += 0.0385) {
          const ang = ph + (z / 0.072) * TAU + s * Math.PI + Math.PI * 0.42;
          const cx = x + Math.cos(ang) * 0.0062;
          const cy = y + Math.sin(ang) * 0.0062;
          for (const [dz, rr] of [
            [0, 0.0024],
            [0.003, 0.0019],
            [-0.0025, 0.0017],
          ]) {
            const pts = Array.from({ length: 7 }, (_, k) => {
              const a2 = (k / 6) * Math.PI;
              return V3(cx + Math.cos(ang) * rr * Math.sin(a2) * 0.6, cy + Math.sin(ang) * rr * Math.sin(a2) * 0.6, z + dz + Math.cos(a2) * rr);
            });
            tubeInto(tnGeo, pts, rr * 0.75, 7);
          }
          const tail = Array.from({ length: 10 }, (_, k) => {
            const zz = z - 0.004 - k * 0.0018;
            const a2 = ph + (zz / 0.072) * TAU + s * Math.PI + Math.PI * 0.42;
            return V3(x + Math.cos(a2) * 0.005, y + Math.sin(a2) * 0.005, zz);
          });
          tubeInto(tnGeo, tail, 0.0009, 4);
        }
      }
    });
    strands.forEach((m) => (m.instanceMatrix.needsUpdate = true));
    g.add(...strands, meshOf(tmGeo.build(), tmMat, "tropomyosin"), meshOf(tnGeo.build(), tnMat, "troponin"));
    // thick filament backbone
    const bb = meshOf(new THREE.CylinderGeometry(0.0062, 0.0062, length + 0.02, 24, 1).rotateX(Math.PI / 2).translate(0, 0, length / 2), myoMat, "thick-filament");
    g.add(bb);
    // heads
    const motor = new THREE.SphereGeometry(1, 16, 12);
    const lever = new THREE.CylinderGeometry(1, 1, 1, 8, 1).rotateZ(Math.PI / 2).translate(0.5, 0, 0);
    const crowns = [];
    for (let z = 0.006, k = 0; z < length - 0.004; z += 0.0143, k++) for (let j = 0; j < 3; j++) crowns.push({ z, phi: k * ((40 * Math.PI) / 180) + (j * TAU) / 3 + 0.2 });
    const headCount = crowns.length * 2;
    const motors = instanced(motor, headMat, headCount, "myosin-motor-domains");
    const levers = instanced(lever, lcMat, headCount, "myosin-lever-arms");
    const necks = instanced(lever, myoMat, crowns.length, "myosin-s2");
    g.add(motors, levers, necks);
    function place(st) {
      let i = 0;
      crowns.forEach((c, ci) => {
        // nearest thin filament in azimuth
        let best = thinPos[0];
        let bd = 9;
        for (const t of thinPos) {
          const d = Math.abs(((t[2] - c.phi + Math.PI * 3) % TAU) - Math.PI);
          if (d < bd) {
            bd = d;
            best = t;
          }
        }
        const bound = bd < 0.4;
        const phi = bound ? best[2] : c.phi;
        // S2 neck from the backbone surface outward
        const base = V3(Math.cos(phi) * 0.006, Math.sin(phi) * 0.006, c.z);
        const neckEnd = V3(Math.cos(phi) * (bound ? 0.009 : 0.0085), Math.sin(phi) * (bound ? 0.009 : 0.0085), c.z + 0.006);
        const dirN = V3().subVectors(neckEnd, base);
        const ln = dirN.length();
        _q.setFromUnitVectors(V3(1, 0, 0), dirN.normalize());
        _m.compose(base, _q, _s.set(ln, 0.0011, 0.0011));
        necks.setMatrixAt(ci, _m);
        for (const side of [-1, 1]) {
          // lever arm: from the neck end, angled between pre-stroke (~90°) and post-stroke (~45° toward M = -z)
          const stroke = bound ? clamp(st.heads) : 0.15;
          const tilt = ((lerp(95, 45, stroke) + side * 8) * Math.PI) / 180; // angle from +z axis
          const radial = V3(Math.cos(phi + side * 0.25), Math.sin(phi + side * 0.25), 0);
          const ldir = radial.clone().multiplyScalar(Math.sin(tilt)).add(V3(0, 0, Math.cos(tilt))).normalize();
          const lL = 0.0085;
          _q.setFromUnitVectors(V3(1, 0, 0), ldir);
          _m.compose(neckEnd, _q, _s.set(lL, 0.0013, 0.0013));
          levers.setMatrixAt(i, _m);
          // motor domain at the lever's far end, reaching toward the thin filament when bound
          const tip = neckEnd.clone().addScaledVector(ldir, lL);
          let mpos = tip.clone().addScaledVector(ldir, 0.0045);
          if (bound) {
            const tx = best[0];
            const ty = best[1];
            const toT = V3(tx - mpos.x, ty - mpos.y, 0);
            const d = toT.length();
            mpos.addScaledVector(toT.normalize(), Math.max(0, d - 0.0072));
          }
          const mdir = V3().subVectors(mpos, tip).normalize();
          _q.setFromUnitVectors(V3(1, 0, 0), mdir);
          _m.compose(mpos, _q, _s.set(0.0058, 0.0032, 0.0028));
          motors.setMatrixAt(i, _m);
          i++;
        }
      });
      for (const m of [motors, levers, necks]) m.instanceMatrix.needsUpdate = true;
    }
    track(g, { heads }, place);
    return g;
  }

  // Camera depth range for a view about `across` µm wide: near and far that keep depth precision at any scale.
  function lens(sp, across) {
    const cam = sp.camera;
    cam.near = Math.max(1e-5, across * 0.02);
    cam.far = across * 40;
    cam.updateProjectionMatrix();
  }
  // Triangle count of an object as drawn (instanced meshes count every instance).
  function triangles(root) {
    let n = 0;
    root.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      let v = true;
      for (let p = o.parent; p; p = p.parent) if (!p.visible) v = false;
      if (!v) return;
      const geo = o.geometry;
      const t = geo.index ? geo.index.count / 3 : (geo.attributes.position?.count ?? 0) / 3;
      n += t * (o.isInstancedMesh ? o.count : 1);
    });
    return Math.round(n);
  }
  const update = () => {
    for (const run of live) run(false);
  };
  return { muscle, fascicle, fibre, myofibril, sarcomere, overlap, update, lens, triangles, colors: C, FACTS };
}
