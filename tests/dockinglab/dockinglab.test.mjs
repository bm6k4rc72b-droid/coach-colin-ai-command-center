/**
 * Unit tests for DOCKING LAB: the PDB and SDF parsers, the drug-like
 * descriptors (checked against RDKit reference values baked into the bundled
 * ligand index), the pocket/box geometry, the docking score, and the
 * end-to-end benchmark that it ranks the known drugs above the decoys.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { parsePDB, findLigand, dockingBox, pocketResidues, backbone, centroid } from '../../public/dockinglab/core/pdb.js';
import { parseSDF, descriptors, WEIGHT } from '../../public/dockinglab/core/chem.js';
import { pocketProfile, score, screen, enrichment } from '../../public/dockinglab/core/dock.js';
import { loadStructure, findPocket, loadLibrary, runScreen } from '../../public/dockinglab/core/pipeline.js';
import { TARGETS } from '../../public/dockinglab/core/targets.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public/dockinglab');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
const idx = JSON.parse(read('data/ligands.json'));
const close = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''}: ${a} vs ${b}`);

// A Node fetch shim that serves bundled files from disk and refuses the net.
const fetchImpl = async (url) => {
  if (/^https?:/.test(url)) throw new Error('offline');
  const p = path.join(ROOT, url.replace(/^\.?\//, ''));
  if (!fs.existsSync(p)) return { ok: false, status: 404, text: async () => '' };
  return { ok: true, status: 200, text: async () => fs.readFileSync(p, 'utf8') };
};

/* ----------------------------------------------------------- chemistry */

test('descriptors match the bundled RDKit reference values', () => {
  let mwErr = 0; let heavyOk = 0; let hbdOk = 0; let hbaOk = 0; let rotOk = 0; let n = 0;
  for (const comps of Object.values(idx)) for (const c of comps) {
    const d = descriptors(parseSDF(read(`data/${c.sdf}`)));
    n += 1;
    mwErr += Math.abs(d.mw - c.mw);
    if (d.heavyAtoms === c.heavy) heavyOk += 1;
    if (d.hbd === c.hbd) hbdOk += 1;
    if (d.hba === c.hbaNO) hbaOk += 1;
    if (Math.abs(d.rotatable - c.rot) <= 2) rotOk += 1;
  }
  assert.ok(n >= 40);
  assert.ok(mwErr / n < 0.1, `mean MW error ${mwErr / n}`);
  assert.equal(heavyOk, n, 'all heavy-atom counts exact');
  assert.equal(hbdOk, n, 'all HBD exact');
  assert.equal(hbaOk, n, 'all HBA (N+O) exact');
  assert.ok(rotOk >= n - 1, 'rotatable within 2 for all but at most one');
});

test('Lipinski flags are set from the real numbers', () => {
  const sita = descriptors(parseSDF(read('data/ligands/DPP4_sitagliptin.sdf')));
  assert.equal(sita.lipinski, true);
  // Lapatinib is a known big, greasy drug: it breaks the rule of five.
  const lap = descriptors(parseSDF(read('data/ligands/HER2_lapatinib.sdf')));
  assert.ok(lap.mw > 500);
});

/* ------------------------------------------------------------- the PDB */

test('parse a bundled protein and build a ribbon', () => {
  const s = parsePDB(read('data/DPP4.pdb'));
  assert.ok(s.atoms.length > 3000);
  assert.ok(s.atoms.every((a) => Number.isFinite(a.x) && Number.isFinite(a.y) && Number.isFinite(a.z)));
  assert.ok(!s.atoms.some((a) => a.element === 'H'), 'hydrogens dropped');
  const segs = backbone(s);
  assert.ok(segs.length >= 1);
  assert.ok(segs.every((seg) => seg.points.length > 3));
  assert.ok(segs.flatMap((seg) => seg.points).every((p) => ['helix', 'sheet', 'coil'].includes(p.ss)));
});

test('a HETATM ligand is found, boxed and its pocket read', () => {
  // A tiny synthetic complex: a protein chain A + a 7-atom HETATM ligand in
  // its own chain B, built by exact PDB columns.
  const lines = [];
  let n = 0;
  const atom = (rec, name, res, chain, seq, el, x, y, z) => {
    const row = Array(80).fill(' ');
    const put = (str, start) => { for (let i = 0; i < str.length; i += 1) row[start + i] = str[i]; };
    put(rec.padEnd(6), 0);
    put(String(++n).padStart(5), 6);
    put(name.length < 4 ? ` ${name}`.padEnd(4) : name, 12);
    put(res.padStart(3), 17);
    put(chain, 21);
    put(String(seq).padStart(4), 22);
    put(x.toFixed(3).padStart(8), 30);
    put(y.toFixed(3).padStart(8), 38);
    put(z.toFixed(3).padStart(8), 46);
    put(el.padStart(2), 76);
    lines.push(row.join('').trimEnd());
  };
  for (let i = 0; i < 6; i += 1) atom('ATOM', 'CA', 'GLY', 'A', i + 1, 'C', i, 0, 0);
  for (let i = 0; i < 7; i += 1) atom('HETATM', `C${i}`, 'LIG', 'B', 100, 'C', 2 + i * 0.3, 1.2, 0);
  const s = parsePDB(lines.join('\n') + '\nEND');
  const lig = findLigand(s);
  assert.ok(lig && lig.resName === 'LIG' && lig.atoms.length === 7);
  const box = dockingBox(lig.atoms, 6, 18);
  assert.ok(box.size.x >= 18 && box.size.y >= 18);
  close(box.center.y, 1.2, 1e-6);
  const pocket = pocketResidues(s, lig.atoms, 4.5);
  assert.ok(pocket.length >= 1, 'at least one protein residue lines the ligand');
});

test('solvent and ions are never mistaken for the drug', () => {
  const lines = [];
  let n = 0;
  const het = (name, res, seq, x) => lines.push(`HETATM${String(++n).padStart(5)} ${name.padEnd(4)} ${res} A${String(seq).padStart(4)}    ${x.toFixed(3).padStart(8)}${(0).toFixed(3).padStart(8)}${(0).toFixed(3).padStart(8)}  1.00  0.00           O`);
  for (let i = 0; i < 20; i += 1) het('O', 'HOH', 200 + i, i); // lots of water
  het('S', 'SO4', 300, 50);
  const s = parsePDB(lines.join('\n'));
  assert.equal(findLigand(s), null, 'water and sulfate are not ligands');
});

/* ----------------------------------------------------------- the score */

test('the score rewards fit and punishes clash and floppiness', () => {
  const pocket = { volume: 20 * 20 * 20, hbondSites: 8, hydrophobic: 8, residues: 24 };
  const good = score({ heavyAtoms: 30, hbd: 1, hba: 7, logP: 3, rotatable: 5 }, pocket);
  const huge = score({ heavyAtoms: 700, hbd: 1, hba: 7, logP: 3, rotatable: 5 }, pocket);
  const floppy = score({ heavyAtoms: 30, hbd: 1, hba: 7, logP: 3, rotatable: 30 }, pocket);
  assert.ok(good.affinity < -4, `a drug-like fit should be reasonably strong, got ${good.affinity}`);
  assert.ok(good.affinity > -12 && good.affinity <= 0, 'within a sane range');
  assert.ok(huge.affinity > good.affinity, 'a molecule too big to fit scores worse');
  assert.ok(floppy.affinity > good.affinity, 'more rotatable bonds cost binding');
  assert.equal(huge.fitsBox, false, 'a molecule bigger than the box does not fit');
});

test('enrichment rewards putting actives on top', () => {
  const ranked = [
    { role: 'active' }, { role: 'active' }, { role: 'decoy' }, { role: 'decoy' },
    { role: 'active' }, { role: 'decoy' }, { role: 'decoy' }, { role: 'decoy' },
  ];
  const e = enrichment(ranked, (c) => c.role === 'active', 0.25);
  // top 25% of 8 = 2; both are actives; expected = 3*0.25 = 0.75; EF = 2/0.75.
  close(e.enrichment, 2 / 0.75, 1e-9);
  assert.equal(e.recovered, 2);
});

/* ------------------------------------------------------- the pipeline */

for (const tid of ['DPP4', 'BACE1']) {
  test(`end-to-end pipeline for ${tid} ranks known drugs above decoys`, async () => {
    const target = TARGETS.find((t) => t.id === tid);
    const { structure, source } = await loadStructure(target, { fetchImpl, preferBundled: true });
    assert.equal(source, 'bundled');
    const site = findPocket(structure, target);
    assert.ok(site.pocket.length > 5);
    assert.ok(site.box.size.x >= 18);
    const library = await loadLibrary(target, idx[tid], { fetchImpl, dataBase: 'data/' });
    assert.ok(library.length >= 8);
    assert.ok(library.every((c) => c.mol && c.desc.mw > 0), 'every compound parsed with descriptors');
    const result = runScreen(library, site.pocket, site.box);
    // The method must separate the known binders from the unrelated drugs.
    const actives = result.ranked.filter((c) => c.role === 'active');
    const decoys = result.ranked.filter((c) => c.role === 'decoy');
    const avgA = actives.reduce((s, c) => s + c.affinity, 0) / actives.length;
    const avgD = decoys.reduce((s, c) => s + c.affinity, 0) / decoys.length;
    assert.ok(avgA < avgD, `known binders should score stronger on average (${avgA.toFixed(2)} vs ${avgD.toFixed(2)})`);
    assert.ok(result.enrichment.enrichment >= 1.5, `enrichment should beat chance, got ${result.enrichment.enrichment}`);
    // The single best-scoring compound should be a real drug, not a decoy.
    assert.equal(result.ranked[0].role, 'active', `top hit for ${tid} should be a known binder`);
  });
}

test('the four targets are well-formed with free-database identifiers', () => {
  assert.equal(TARGETS.length, 4);
  for (const t of TARGETS) {
    assert.match(t.pdb, /^[0-9][A-Za-z0-9]{3}$/, `${t.id} has a valid PDB id`);
    assert.ok(t.disease && t.protein && t.role && t.benchmark);
    assert.ok(idx[t.id] && idx[t.id].length >= 8, `${t.id} has a compound library`);
    assert.ok(idx[t.id].some((c) => c.role === 'active') && idx[t.id].some((c) => c.role === 'decoy'));
  }
});
