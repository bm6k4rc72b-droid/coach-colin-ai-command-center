/**
 * Unit tests for COLIN Dermal Technologies: the chemistry (molar masses
 * from formulas), the penetration maths (Potts–Guy, erfc diffusion), and
 * the face scanner's measurements on synthetic faces with known blotches,
 * redness and under-eye shadow.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  CONCERNS, SKIN_PEPTIDES, collagenShare, concentration, diffusivity, erfc, erfcInv, lagTime, logKp, molarMass, mwOf,
  rankConcerns, reach, slowdown, solutionsFor,
} from '../../public/astra/showcase/dermal.js';
import { OVAL, accumulate, isSkin, measureFrame, regionBoxes, report, toLab } from '../../public/astra/showcase/scan.js';

const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);

test('molar masses come out of the formulas to two decimals', () => {
  close(molarMass('C14H24N6O4'), 340.38, 0.01, 'GHK');
  close(molarMass('C14H22CuN6O4'), 401.91, 0.01, 'GHK-Cu');
  close(molarMass('C34H60N14O12S'), 889.00, 0.01, 'Argireline');
  close(molarMass('C39H75N7O10'), 802.07, 0.01, 'Matrixyl');
  close(molarMass('C41H70N16O16S'), 1075.17, 0.01, 'SNAP-8');
  close(molarMass('C29H39N5O7'), 569.66, 0.01, 'Leuphasyl');
  close(molarMass('C20H30O'), 286.46, 0.01, 'retinol');
  assert.throws(() => molarMass('C2Xx'));
});

test('Potts–Guy: each 100 Da costs a factor 10^0.61, and log P adds 0.71 per unit', () => {
  close(logKp(500, 0) - logKp(600, 0), 0.61, 1e-12);
  close(logKp(400, 1) - logKp(400, 0), 0.71, 1e-12);
  close(logKp(0, 0), -2.72, 1e-12);
  close(slowdown(400) / slowdown(300), 10 ** 0.61, 1e-9);
});

test('diffusion: D, reach 2√(Dt) and lag h²/6D agree with each other', () => {
  const mw = 401.91;
  const D = diffusivity(mw);
  close(D, 15e-4 * 10 ** (-2.72 - 0.0061 * mw), 1e-20);
  close(reach(mw, 8), 2 * Math.sqrt(D * 8) * 1e4, 1e-9);
  close(lagTime(mw), (15e-4) ** 2 / (6 * D), 1e-6);
  // Reach grows as √t: four times the time, twice the depth.
  close(reach(mw, 32) / reach(mw, 8), 2, 1e-12);
  // GHK-Cu takes about a day and a half to establish flux; SNAP-8 decades.
  assert.ok(lagTime(mw) > 24 && lagTime(mw) < 48);
  assert.ok(lagTime(molarMass('C41H70N16O16S')) > 24 * 365 * 10);
});

test('erfc matches tables, and its inverse undoes it', () => {
  close(erfc(0), 1, 1e-7);
  close(erfc(0.5), 0.4795001, 2e-7);
  close(erfc(1), 0.1572992, 2e-7);
  close(erfc(2), 0.0046777, 2e-7);
  close(erfc(-1), 1.8427008, 2e-7);
  for (const x of [0.1, 0.7, 1.3, 2.2]) close(erfcInv(erfc(x)), x, 1e-6);
  // At depth = reach, C/C0 = erfc(1).
  const mw = 600;
  close(concentration(mw, reach(mw, 10), 10), erfc(1), 2e-7);
  assert.equal(concentration(mw, 5, 0), 0);
});

test('collagen falls 1% a year from 20 on the straight line', () => {
  assert.equal(collagenShare(20), 1);
  close(collagenShare(45), 0.75, 1e-12);
  close(collagenShare(70), 0.5, 1e-12);
  assert.equal(collagenShare(10), 1);
});

test('every peptide has a valid formula, grade and target, and concerns list known peptides', () => {
  for (const p of SKIN_PEPTIDES) {
    assert.ok(mwOf(p) > 300 && mwOf(p) < 1200, p.name);
    assert.match(p.grade, /^[A-D]$/);
    assert.ok(['derm', 'muscle'].includes(p.target));
    assert.ok(p.cite.length > 10);
  }
  for (const c of CONCERNS) {
    const s = solutionsFor(c.id);
    assert.ok(s.length >= 2, c.id);
    for (let i = 1; i < s.length; i += 1) assert.ok(s[i - 1].grade <= s[i].grade, 'sorted strongest first');
  }
  assert.ok(solutionsFor('lines').some((o) => o.kind === 'peptide'));
});

test('pain points: what the visitor picks comes first, then strong camera flags', () => {
  const ranked = rankConcerns(['lines', 'nope'], [{ concern: 'redness', score: 70 }, { concern: 'eyes', score: 30 }, { concern: 'tone', score: 90 }]);
  assert.deepEqual(ranked, ['lines', 'tone', 'redness']);
});

/* ------------------------------------------------------------- scanner */

test('CIELAB conversion matches reference values', () => {
  const white = toLab(255, 255, 255);
  close(white[0], 100, 0.01); close(white[1], 0, 0.01); close(white[2], 0, 0.01);
  const red = toLab(255, 0, 0);
  close(red[0], 53.24, 0.02); close(red[1], 80.09, 0.05); close(red[2], 67.20, 0.05);
  const grey = toLab(119, 119, 119);
  close(grey[0], 50.03, 0.05);
  assert.ok(isSkin(224, 172, 140) && isSkin(141, 85, 58) && isSkin(92, 56, 40));
  assert.ok(!isSkin(40, 120, 200) && !isSkin(30, 200, 60));
});

/** A synthetic 180 × 240 face: skin in the oval, with optional features. */
function face({ blotch = 0, redCheeks = 0, darkEyes = 0, seed = 1 } = {}) {
  const w = 180;
  const h = 240;
  const data = new Uint8ClampedArray(w * h * 4);
  const boxes = regionBoxes(w, h);
  const inBox = (id, x, y) => boxes[id].some(([x0, y0, x1, y1]) => x >= x0 && x < x1 && y >= y0 && y < y1);
  let s = seed;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const p = (y * w + x) * 4;
      const u = (x - OVAL.cx * w) / (OVAL.rx * w);
      const v = (y - OVAL.cy * h) / (OVAL.ry * h);
      let r = 30; let g = 40; let b = 60;
      if (u * u + v * v <= 1.05) {
        r = 205; g = 150; b = 120;
        // Blotches: 8-pixel patches darker by up to `blotch`.
        if (blotch && ((Math.floor(x / 8) * 7 + Math.floor(y / 8) * 13) % 5 === 0)) { r -= blotch; g -= blotch; b -= blotch * 0.8; }
        if (redCheeks && (inBox('cheekA', x, y) || inBox('cheekB', x, y) || inBox('nose', x, y))) { r += redCheeks * 0.3; g -= redCheeks; b -= redCheeks * 0.5; }
        if (darkEyes && inBox('underEye', x, y)) { r -= darkEyes; g -= darkEyes; b -= darkEyes * 0.8; }
        r += (rand() - 0.5) * 4; g += (rand() - 0.5) * 4; b += (rand() - 0.5) * 4;
      }
      data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255;
    }
  }
  return { data, width: w, height: h };
}

function scanOf(opts) {
  let total = null;
  for (let k = 0; k < 4; k += 1) total = accumulate(total, measureFrame(face({ ...opts, seed: k + 1 })));
  const r = report(total);
  return Object.fromEntries(r.flags.map((f) => [f.concern, f.score]));
}

test('the scanner sees an even face as even, and finds what was painted on', () => {
  const plain = scanOf({});
  assert.ok(plain.tone < 20 && plain.redness < 20 && plain.eyes < 20, JSON.stringify(plain));
  const frame = measureFrame(face({}));
  assert.ok(frame.coverage > 0.9);
  assert.ok(scanOf({ blotch: 22 }).tone > plain.tone + 40, 'blotches raise tone');
  assert.ok(scanOf({ redCheeks: 30 }).redness > 60, 'red cheeks raise redness');
  assert.ok(scanOf({ darkEyes: 40 }).eyes > 60, 'dark under-eyes raise contrast');
  assert.equal(report(accumulate(null, measureFrame(face({})))).quality.confidence !== undefined, true);
});
