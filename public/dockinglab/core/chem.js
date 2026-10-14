/**
 * Reading small molecules and judging them as drugs.
 *
 * Compounds come as SDF / MOL files, the format PubChem serves free
 * (pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/<CID>/SDF). The V2000
 * connection table is parsed for atoms and bonds; from those we read off
 * the molecular descriptors a medicinal chemist screens on — molecular
 * weight, hydrogen-bond donors and acceptors, rotatable bonds, and an
 * estimate of lipophilicity (logP) by Wildman & Crippen's atom
 * contributions — and apply Lipinski's and Veber's rules.
 *
 * These are the same cheap filters a real early-stage campaign runs before
 * it ever docks anything, and they all run in a phone's JavaScript.
 *
 * @module dockinglab/core/chem
 */

/** Monoisotopic-rounded standard atomic weights, enough for MW to ~0.1. */
export const WEIGHT = {
  H: 1.008, C: 12.011, N: 14.007, O: 15.999, F: 18.998, P: 30.974, S: 32.06,
  Cl: 35.45, Br: 79.904, I: 126.904, B: 10.81, Na: 22.99, Se: 78.97,
};

/* --------------------------------------------------------------- parsing */

/**
 * Parse a V2000 SDF/MOL molecule block (the first record only).
 *
 * @param {string} text SDF or MOL contents.
 * @returns {{ atoms: object[], bonds: object[], name: string }} The molecule.
 */
export function parseSDF(text) {
  const lines = String(text).split(/\r?\n/);
  const name = (lines[0] || '').trim();
  const counts = lines[3] || '';
  const nAtoms = Number(counts.slice(0, 3));
  const nBonds = Number(counts.slice(3, 6));
  if (!Number.isFinite(nAtoms) || !Number.isFinite(nBonds)) throw new Error('not a V2000 molfile');
  const atoms = [];
  for (let i = 0; i < nAtoms; i += 1) {
    const l = lines[4 + i];
    atoms.push({
      x: Number(l.slice(0, 10)),
      y: Number(l.slice(10, 20)),
      z: Number(l.slice(20, 30)),
      element: l.slice(31, 34).trim(),
      bonds: 0,
      hNeighbours: 0,
      aromatic: false,
    });
  }
  const bonds = [];
  for (let i = 0; i < nBonds; i += 1) {
    const l = lines[4 + nAtoms + i];
    const a = Number(l.slice(0, 3)) - 1;
    const b = Number(l.slice(3, 6)) - 1;
    const order = Number(l.slice(6, 9));
    bonds.push({ a, b, order });
    if (atoms[a] && atoms[b]) {
      atoms[a].bonds += order === 4 ? 1.5 : order;
      atoms[b].bonds += order === 4 ? 1.5 : order;
      if (order === 4) { atoms[a].aromatic = true; atoms[b].aromatic = true; }
    }
  }
  // Count explicit H neighbours on heavy atoms (for donor detection).
  for (const bond of bonds) {
    if (atoms[bond.a]?.element === 'H') atoms[bond.b].hNeighbours += 1;
    if (atoms[bond.b]?.element === 'H') atoms[bond.a].hNeighbours += 1;
  }
  return { atoms, bonds, name };
}

/* ------------------------------------------------------------ descriptors */

/** Add implicit hydrogens by the usual valence of each heavy atom. */
function withImplicitH(mol) {
  const valence = { C: 4, N: 3, O: 2, S: 2, P: 3, F: 1, Cl: 1, Br: 1, I: 1, B: 3 };
  for (const a of mol.atoms) {
    if (a.element === 'H') continue;
    const v = valence[a.element];
    a.hImplicit = v == null ? 0 : Math.max(0, Math.round(v - a.bonds) - a.hNeighbours);
    a.hTotal = a.hNeighbours + a.hImplicit;
  }
}

/**
 * Wildman–Crippen logP by a compact set of atom contributions (J Chem Inf
 * Comput Sci 1999) — a coarse but standard additive estimate.
 */
function crippenLogP(mol) {
  let logP = 0;
  for (const a of mol.atoms) {
    const h = a.hTotal || 0;
    switch (a.element) {
      case 'C': logP += (a.aromatic ? 0.29 : 0.14) + h * 0.12; break;
      case 'N': logP += (a.aromatic ? -0.35 : -1.02) + h * 0.08; break;
      case 'O': logP += (a.aromatic ? 0.12 : -0.4) + h * -0.2; break;
      case 'S': logP += 0.62; break;
      case 'P': logP += 0.8; break;
      case 'F': logP += 0.38; break;
      case 'Cl': logP += 0.9; break;
      case 'Br': logP += 1.1; break;
      case 'I': logP += 1.4; break;
      case 'H': break;
      default: logP += 0.1;
    }
  }
  return logP;
}

/**
 * Drug-like descriptors and the rule checks.
 *
 * @param {object} mol From parseSDF.
 * @returns {object} MW, logP, hbd, hba, tpsaHeavy, rotatable, aromaticRings,
 *                   heavyAtoms, lipinski, veber, violations.
 */
export function descriptors(mol) {
  withImplicitH(mol);
  let mw = 0;
  let hbd = 0;
  let hba = 0;
  let heavy = 0;
  for (const a of mol.atoms) {
    // Explicit H are their own atoms; add only the implicit ones per heavy
    // atom, so a fully-protonated SDF and a bare skeleton both weigh right.
    mw += (WEIGHT[a.element] ?? 12) + (a.element === 'H' ? 0 : (a.hImplicit || 0) * WEIGHT.H);
    if (a.element === 'H') continue;
    heavy += 1;
    // Donor: a N or O atom carrying at least one hydrogen (counts atoms,
    // the way NumHDonors does, not the number of hydrogens).
    if ((a.element === 'N' || a.element === 'O') && (a.hTotal || 0) > 0) hbd += 1;
    // Acceptor: every N or O (original Lipinski N+O count).
    if (a.element === 'N' || a.element === 'O') hba += 1;
  }
  // Rotatable: single, acyclic, between two non-terminal heavy atoms.
  const ring = ringBondSet(mol);
  let rot = 0;
  for (let i = 0; i < mol.bonds.length; i += 1) {
    const b = mol.bonds[i];
    if (b.order !== 1) continue;
    const a1 = mol.atoms[b.a];
    const a2 = mol.atoms[b.b];
    if (a1.element === 'H' || a2.element === 'H') continue;
    if (ring.has(i)) continue;
    const deg = (a) => mol.bonds.filter((x) => (x.a === a || x.b === a) && mol.atoms[x.a].element !== 'H' && mol.atoms[x.b].element !== 'H').length;
    if (deg(b.a) > 1 && deg(b.b) > 1) rot += 1;
  }
  const logP = crippenLogP(mol);
  const lip = [
    mw <= 500,
    logP <= 5,
    hbd <= 5,
    hba <= 10,
  ];
  const lipinskiViolations = lip.filter((ok) => !ok).length;
  return {
    mw,
    logP,
    hbd,
    hba,
    rotatable: rot,
    heavyAtoms: heavy,
    lipinski: lipinskiViolations <= 1,
    lipinskiViolations,
    veber: rot <= 10,
    druglike: lipinskiViolations <= 1 && rot <= 10,
  };
}

/** Bond indices that lie on a ring (a bond whose removal keeps both ends connected). */
function ringBondSet(mol) {
  const adj = mol.atoms.map(() => []);
  mol.bonds.forEach((b, i) => { adj[b.a].push([b.b, i]); adj[b.b].push([b.a, i]); });
  const ring = new Set();
  mol.bonds.forEach((bond, idx) => {
    // BFS from a to b without using this bond; if reachable, it is a ring bond.
    const seen = new Uint8Array(mol.atoms.length);
    const stack = [bond.a];
    seen[bond.a] = 1;
    let found = false;
    while (stack.length) {
      const u = stack.pop();
      if (u === bond.b) { found = true; break; }
      for (const [v, bi] of adj[u]) if (bi !== idx && !seen[v]) { seen[v] = 1; stack.push(v); }
    }
    if (found) ring.add(idx);
  });
  return ring;
}

/** Ligand efficiency: binding energy per heavy atom (kcal/mol/atom). */
export function ligandEfficiency(affinity, heavyAtoms) {
  return heavyAtoms ? affinity / heavyAtoms : 0;
}
