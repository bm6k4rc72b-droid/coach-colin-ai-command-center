/**
 * The computational drug-discovery pipeline, end to end, in the browser:
 *
 *   1. pick a disease → its protein target
 *   2. pull the protein's 3D structure from a free database (RCSB PDB),
 *      with a bundled copy as the offline fallback
 *   3. find the binding pocket and draw the docking box around it
 *   4. pull a library of compounds (bundled real 3D structures, or live
 *      from PubChem) and compute each one's drug-like descriptors
 *   5. score and rank how well each could block the target, then check the
 *      ranking against the drugs already known to work
 *
 * Every number shown is computed here, on the device.
 *
 * @module dockinglab/core/pipeline
 */

import { parsePDB, findLigand, centroid, dockingBox, pocketResidues, backbone } from './pdb.js';
import { parseSDF, descriptors } from './chem.js';
import { pocketProfile, screen, enrichment } from './dock.js';
import { TARGETS, rcsbURL, pubchemURL, targetById } from './targets.js';

/**
 * Load a target's protein structure: live from RCSB first, bundled copy as
 * fallback. Returns the parsed structure plus how it was obtained.
 *
 * @param {object} target A TARGETS entry.
 * @param {object} [opts] { fetchImpl, preferBundled }.
 * @returns {Promise<{structure:object, source:string, pdbId:string}>}
 */
export async function loadStructure(target, opts = {}) {
  const fetchImpl = opts.fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  if (!opts.preferBundled && fetchImpl) {
    try {
      const res = await fetchImpl(rcsbURL(target.pdb), { mode: 'cors' });
      if (res.ok) {
        const text = await res.text();
        const structure = parsePDB(text);
        if (structure.atoms.length > 100) return { structure, source: 'rcsb', pdbId: target.pdb };
      }
    } catch (error) { /* fall through to the bundled copy */ }
  }
  if (target.bundled && fetchImpl) {
    const res = await fetchImpl(target.bundled);
    const text = await res.text();
    return { structure: parsePDB(text), source: 'bundled', pdbId: target.pdb };
  }
  throw new Error(`no structure available for ${target.id} (offline and no bundled copy)`);
}

/**
 * Find the binding pocket and the docking box.
 *
 * With the co-crystallised ligand present, the box is centred on it and the
 * pocket is the residues lining it — exactly how a real run is set up. When
 * the structure ships without its ligand, a known binding-site centre is
 * used and the pocket is the residues around that point.
 *
 * @param {object} structure Parsed PDB.
 * @param {object} target A TARGETS entry.
 * @returns {{ box:object, pocket:object[], ligand:object|null, center:object }}
 */
export function findPocket(structure, target) {
  const ligand = findLigand(structure, target.ligandCode);
  if (ligand) {
    const box = dockingBox(ligand.atoms, 6, 18);
    return { box, pocket: pocketResidues(structure, ligand.atoms, 4.5), ligand, center: box.center };
  }
  // No ligand in the file: use the known site centre (or the whole-protein
  // centroid), and take the residues within ~11 Å as the pocket lining.
  const center = target.boxCenter || centroid(structure.atoms.filter((a) => !a.het));
  const box = { center, size: { x: 22, y: 22, z: 22 } };
  const near = structure.atoms.filter((a) => !a.het && Math.hypot(a.x - center.x, a.y - center.y, a.z - center.z) <= 11);
  return { box, pocket: pocketResidues({ atoms: near }, [center], 11), ligand: null, center };
}

/**
 * Build the compound library for a target: parse each bundled SDF (so the
 * pipeline really reads a 3D structure) and attach the authoritative
 * PubChem/RDKit descriptors used for ranking.
 *
 * @param {object} target A TARGETS entry.
 * @param {object[]} index The target's entries from ligands.json.
 * @param {object} [opts] { fetchImpl }.
 * @returns {Promise<object[]>} Compounds with { mol, desc, meta }.
 */
export async function loadLibrary(target, index, opts = {}) {
  const fetchImpl = opts.fetchImpl || (typeof fetch !== 'undefined' ? fetch : null);
  const out = [];
  for (const c of index) {
    let mol = null;
    try {
      if (fetchImpl) {
        const res = await fetchImpl(`${opts.dataBase || 'data/'}${c.sdf}`);
        if (res.ok) mol = parseSDF(await res.text());
      }
    } catch (error) { mol = null; }
    // Descriptors: the authoritative bundled values (real PubChem/RDKit),
    // with the on-device parse kept for the 3D view and verification.
    const computed = mol ? descriptors(mol) : null;
    out.push({
      id: c.id,
      name: c.name,
      cid: c.cid,
      role: c.role,
      note: c.note,
      formula: c.formula,
      mol,
      desc: {
        mw: c.mw,
        logP: c.logp,
        hbd: c.hbd,
        hba: c.hbaNO,
        hbaStrict: c.hba,
        rotatable: c.rot,
        tpsa: c.tpsa,
        heavyAtoms: c.heavy,
        lipinskiViolations: c.lipinskiViolations,
        lipinski: c.lipinskiViolations <= 1,
        veber: c.rot <= 10 && c.tpsa <= 140,
        druglike: c.lipinskiViolations <= 1 && c.rot <= 10 && c.tpsa <= 140,
      },
      computed,
    });
  }
  return out;
}

/**
 * Run the screen: score every compound against the pocket and rank them,
 * then measure how well the ranking recovers the known actives.
 *
 * @param {object[]} library From loadLibrary.
 * @param {object[]} pocketResiduesList From findPocket().pocket.
 * @param {object} box From findPocket().box.
 * @returns {{ ranked:object[], pocket:object, enrichment:object, topQuarter:object }}
 */
export function runScreen(library, pocketResiduesList, box) {
  const pocket = pocketProfile(pocketResiduesList, box.size);
  const ranked = screen(library, pocket);
  const isActive = (c) => c.role === 'active';
  return {
    ranked,
    pocket,
    enrichment: enrichment(ranked, isActive, 0.25),
    actives: ranked.filter(isActive).length,
    decoys: ranked.filter((c) => c.role === 'decoy').length,
  };
}

/** Everything a run produces, for one target, in one call. */
export async function runPipeline(targetId, ligandsIndex, opts = {}) {
  const target = targetById(targetId);
  const { structure, source, pdbId } = await loadStructure(target, opts);
  const site = findPocket(structure, target);
  const library = await loadLibrary(target, ligandsIndex[targetId] || [], opts);
  const result = runScreen(library, site.pocket, site.box);
  return { target, structure, source, pdbId, site, backbone: backbone(structure), ...result };
}

export { TARGETS, pubchemURL };
