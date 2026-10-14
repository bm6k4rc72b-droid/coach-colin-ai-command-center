/**
 * Reading protein structures: PDB-format files as served free by the RCSB
 * Protein Data Bank (files.rcsb.org/download/<ID>.pdb).
 *
 * Fixed-column records (wwPDB format v3.3):
 *   ATOM/HETATM  name 13–16, altLoc 17, resName 18–20, chain 22, resSeq
 *                23–26, x/y/z 31–54 (Å), element 77–78
 *   HELIX        chain 20, start 22–25, end 34–37
 *   SHEET        chain 22, start 23–26, end 34–37
 *
 * @module dockinglab/core/pdb
 */

/** Het groups that are solvent, buffer, ions or cofactors — never "the drug". */
export const NOT_LIGANDS = new Set([
  'HOH', 'WAT', 'DOD', 'SO4', 'PO4', 'GOL', 'EDO', 'PEG', 'PGE', 'PG4', '1PE', 'P6G', 'ACT', 'ACY', 'DMS', 'FMT', 'MES', 'TRS', 'EPE',
  'IMD', 'BME', 'DTT', 'CL', 'NA', 'MG', 'ZN', 'CA', 'K', 'MN', 'FE', 'CU', 'NI', 'CO', 'CD', 'IOD', 'BR', 'NO3', 'NH4', 'CIT', 'TLA',
  'MPD', 'BOG', 'NAG', 'NDG', 'MAN', 'BMA', 'FUC', 'GAL', 'GLC', 'SIA', 'NDP', 'NAP', 'NAD', 'NAI', 'FAD', 'FMN', 'ADP', 'ATP', 'ANP',
  'UMP', 'UFP', 'SAM', 'SAH', 'HEM', 'COA', 'PLP', 'ACE', 'NH2', 'UNX', 'UNL', 'CSO', 'SEP', 'TPO', 'PTR', 'MSE', 'LLP', 'KCX',
]);

/** Element from the element columns, else from the atom name. */
function elementOf(line, name, het) {
  const col = line.slice(76, 78).trim();
  if (col) return col[0] + col.slice(1).toLowerCase();
  const n = name.trim().replace(/^\d+/, '');
  if (het && /^(CL|BR)/i.test(n)) return n[0] + n[1].toLowerCase();
  return n[0] || 'C';
}

/**
 * Parse a PDB file: first model only, first alternate location only.
 *
 * @param {string} text PDB file contents.
 * @returns {{ atoms: object[], helices: object[], sheets: object[], title: string, resolution: number|null }} The structure.
 */
export function parsePDB(text) {
  const atoms = [];
  const helices = [];
  const sheets = [];
  let title = '';
  let resolution = null;
  for (const line of String(text).split(/\r?\n/)) {
    const rec = line.slice(0, 6).trim();
    if (rec === 'ENDMDL') break;
    if (rec === 'TITLE') title += line.slice(10).trim() + ' ';
    else if (rec === 'REMARK' && line.slice(7, 10) === '  2' && /RESOLUTION\./.test(line)) {
      const m = line.match(/(\d+\.\d+)\s+ANGSTROM/);
      if (m) resolution = Number(m[1]);
    } else if (rec === 'HELIX') {
      helices.push({ chain: line[19], start: Number(line.slice(21, 25)), end: Number(line.slice(33, 37)) });
    } else if (rec === 'SHEET') {
      sheets.push({ chain: line[21], start: Number(line.slice(22, 26)), end: Number(line.slice(33, 37)) });
    } else if (rec === 'ATOM' || rec === 'HETATM') {
      const alt = line[16];
      if (alt !== ' ' && alt !== 'A' && alt !== '1' && alt !== undefined) continue;
      const name = line.slice(12, 16);
      const het = rec === 'HETATM';
      const element = elementOf(line, name, het);
      if (element === 'H' || element === 'D') continue;
      atoms.push({
        het,
        name: name.trim(),
        resName: line.slice(17, 20).trim(),
        chain: line[21],
        resSeq: Number(line.slice(22, 26)),
        x: Number(line.slice(30, 38)),
        y: Number(line.slice(38, 46)),
        z: Number(line.slice(46, 54)),
        element,
      });
    }
  }
  return { atoms, helices, sheets, title: title.trim().replace(/\s+/g, ' '), resolution };
}

/** Group HETATMs into residues (one instance = chain + resName + resSeq). */
export function hetGroups(structure) {
  const groups = new Map();
  for (const a of structure.atoms) {
    if (!a.het) continue;
    const key = `${a.chain}:${a.resName}:${a.resSeq}`;
    if (!groups.has(key)) groups.set(key, { key, resName: a.resName, chain: a.chain, resSeq: a.resSeq, atoms: [] });
    groups.get(key).atoms.push(a);
  }
  return [...groups.values()];
}

/**
 * The co-crystallised drug: the largest het group that is not solvent,
 * buffer, ion or cofactor (or the named one), first instance.
 *
 * @param {object} structure From parsePDB.
 * @param {string} [code] A three-letter ligand code to prefer.
 * @returns {object|null} { resName, chain, resSeq, atoms }.
 */
export function findLigand(structure, code) {
  const groups = hetGroups(structure).filter((g) => (code ? g.resName === code : !NOT_LIGANDS.has(g.resName)) && g.atoms.length >= 6);
  // A peptide inhibitor is often its own short chain (a handful of
  // residues) rather than a het group; count each such chain as one ligand.
  if (!code) {
    const residues = new Map();
    for (const a of structure.atoms) {
      if (!residues.has(a.chain)) residues.set(a.chain, new Set());
      residues.get(a.chain).add(a.resSeq);
    }
    for (const [chain, set] of residues) {
      if (set.size > 12) continue;
      const atoms = structure.atoms.filter((a) => a.chain === chain && !NOT_LIGANDS.has(a.resName));
      if (atoms.length >= 6) groups.push({ key: `${chain}:peptide`, resName: `chain ${chain}`, chain, resSeq: Math.min(...set), atoms, peptide: true });
    }
  }
  if (!groups.length) return null;
  const most = Math.max(...groups.map((g) => g.atoms.length));
  return groups.find((g) => g.atoms.length === most);
}

/** Centroid of a set of atoms. */
export function centroid(atoms) {
  let x = 0; let y = 0; let z = 0;
  for (const a of atoms) { x += a.x; y += a.y; z += a.z; }
  const n = Math.max(1, atoms.length);
  return { x: x / n, y: y / n, z: z / n };
}

/**
 * The docking box: centred on the ligand, each side the ligand's extent
 * plus `pad` Å on every face (AutoDock Vina's usual set-up), at least `min`.
 */
export function dockingBox(ligandAtoms, pad = 6, min = 18) {
  const lo = { x: Infinity, y: Infinity, z: Infinity };
  const hi = { x: -Infinity, y: -Infinity, z: -Infinity };
  for (const a of ligandAtoms) for (const k of ['x', 'y', 'z']) { lo[k] = Math.min(lo[k], a[k]); hi[k] = Math.max(hi[k], a[k]); }
  const center = { x: (lo.x + hi.x) / 2, y: (lo.y + hi.y) / 2, z: (lo.z + hi.z) / 2 };
  const size = { x: Math.max(min, hi.x - lo.x + 2 * pad), y: Math.max(min, hi.y - lo.y + 2 * pad), z: Math.max(min, hi.z - lo.z + 2 * pad) };
  return { center, size };
}

/** Protein residues with any heavy atom within `cut` Å of the ligand. */
export function pocketResidues(structure, ligandAtoms, cut = 4.5) {
  const c2 = cut * cut;
  const seen = new Map();
  for (const a of structure.atoms) {
    if (a.het) continue;
    for (const l of ligandAtoms) {
      const dx = a.x - l.x; const dy = a.y - l.y; const dz = a.z - l.z;
      if (dx * dx + dy * dy + dz * dz <= c2) {
        const key = `${a.chain}:${a.resSeq}`;
        if (!seen.has(key)) seen.set(key, { chain: a.chain, resSeq: a.resSeq, resName: a.resName });
        break;
      }
    }
  }
  return [...seen.values()].sort((p, q) => (p.chain === q.chain ? p.resSeq - q.resSeq : p.chain < q.chain ? -1 : 1));
}

/** Cα trace per chain, tagged helix / sheet / coil, for the ribbon. */
export function backbone(structure) {
  const ss = (chain, resSeq) => {
    if (structure.helices.some((h) => h.chain === chain && resSeq >= h.start && resSeq <= h.end)) return 'helix';
    if (structure.sheets.some((s) => s.chain === chain && resSeq >= s.start && resSeq <= s.end)) return 'sheet';
    return 'coil';
  };
  const chains = new Map();
  for (const a of structure.atoms) {
    if (a.het || a.name !== 'CA') continue;
    if (!chains.has(a.chain)) chains.set(a.chain, []);
    const list = chains.get(a.chain);
    const last = list[list.length - 1];
    // A gap of more than 4.2 Å between Cα means a break in the chain.
    if (last && Math.hypot(a.x - last.x, a.y - last.y, a.z - last.z) > 4.2) list.push(null);
    list.push({ x: a.x, y: a.y, z: a.z, resSeq: a.resSeq, resName: a.resName, ss: ss(a.chain, a.resSeq) });
  }
  // Split at breaks into segments.
  const out = [];
  for (const [chain, list] of chains) {
    let seg = [];
    for (const p of list) {
      if (p === null) { if (seg.length > 3) out.push({ chain, points: seg }); seg = []; } else seg.push(p);
    }
    if (seg.length > 3) out.push({ chain, points: seg });
  }
  return out;
}
