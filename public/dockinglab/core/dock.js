/**
 * A transparent, teaching docking score.
 *
 * Real campaigns run AutoDock Vina or Glide: they search thousands of poses
 * of a flexible ligand in a rigid pocket and score each with an empirical
 * function. That search is too heavy for a phone, so this does the honest,
 * simplified version — it scores how well a compound's *shape and chemistry*
 * fit a pocket, from the descriptors a phone can compute, and is explicit
 * that it is an estimate, not Vina.
 *
 * The score mimics the terms every empirical function shares (Böhm 1994;
 * Trott & Olson, Vina, 2010): a hydrophobic/contact term that rewards
 * filling the pocket, a hydrogen-bond term, and penalties for being too big
 * for the box or too floppy (lost rotatable-bond entropy). It is calibrated
 * so a well-fitting, drug-like compound lands near the −7 to −10 kcal/mol
 * that good inhibitors score in Vina, and it is reported in those units with
 * a clear "estimated" label.
 *
 * @module dockinglab/core/dock
 */

/**
 * Pocket descriptors, from the structure: how big the binding box is and
 * how many donors/acceptors its lining offers.
 *
 * @param {object[]} pocketResidues From pdb.pocketResidues.
 * @param {{x:number,y:number,z:number}} boxSize The docking box, Å.
 * @returns {{volume:number, hbondSites:number, hydrophobic:number}} Pocket profile.
 */
export function pocketProfile(pocketResidues, boxSize) {
  const volume = boxSize.x * boxSize.y * boxSize.z;
  // Residues that donate/accept H-bonds, and hydrophobic ones.
  const polar = new Set(['SER', 'THR', 'TYR', 'ASN', 'GLN', 'HIS', 'LYS', 'ARG', 'ASP', 'GLU', 'TRP', 'CYS']);
  const phobic = new Set(['ALA', 'VAL', 'LEU', 'ILE', 'PHE', 'MET', 'PRO', 'TRP', 'TYR']);
  let hbondSites = 0;
  let hydrophobic = 0;
  for (const r of pocketResidues) {
    if (polar.has(r.resName)) hbondSites += 1;
    if (phobic.has(r.resName)) hydrophobic += 1;
  }
  return { volume, hbondSites, hydrophobic, residues: pocketResidues.length };
}

/**
 * Score a compound against a pocket. Every term is returned so the UI can
 * show the viewer where the number came from.
 *
 * @param {object} desc Ligand descriptors (chem.descriptors).
 * @param {object} pocket Pocket profile (pocketProfile).
 * @returns {{ affinity:number, terms:object, fitsBox:boolean }} Estimated kcal/mol and the breakdown.
 */
export function score(desc, pocket) {
  // An ideal ligand fills ~60–75% of a Vina box by heavy-atom volume. Model
  // a heavy atom as ~20.4 Å³ (the mean of the common organic radii).
  const ligVolume = desc.heavyAtoms * 20.4;
  const fill = ligVolume / pocket.volume;
  // Hydrophobic contact: rewarded up to a good fill, then flat; a crowd of
  // greasy residues makes burying lipophilic surface pay more.
  const idealFill = 0.62;
  const fillFit = 1 - Math.min(1, Math.abs(fill - idealFill) / idealFill);
  const hydrophobicContact = -0.085 * desc.heavyAtoms * fillFit * (0.6 + 0.4 * Math.min(1, pocket.hydrophobic / 8));
  // Hydrogen bonds: as many as both sides can offer, capped; each ~ −0.8.
  const hbondsMade = Math.min(desc.hbd + desc.hba, pocket.hbondSites, 8);
  const hbondTerm = -0.8 * hbondsMade * (0.5 + 0.5 * Math.min(1, pocket.hbondSites / 6));
  // Lipophilic bonus from logP, saturating (too greasy stops helping).
  const logpTerm = -0.4 * Math.max(0, Math.min(desc.logP, 5));
  // Entropic penalty: each rotatable bond frozen on binding costs ~ +0.17.
  const entropyPenalty = 0.17 * desc.rotatable;
  // Steric clash: a ligand bigger than the box cannot fit — steep penalty.
  const overflow = Math.max(0, fill - 0.95);
  const clashPenalty = 18 * overflow;
  // Too small to make contact: fades the whole interaction.
  const sizeFloor = fill < 0.12 ? (0.12 - fill) * 20 : 0;
  const affinity = hydrophobicContact + hbondTerm + logpTerm + entropyPenalty + clashPenalty + sizeFloor - 0.6;
  return {
    affinity: Math.max(-14, Math.min(0, affinity)),
    fitsBox: fill <= 0.95 && fill >= 0.08,
    terms: {
      hydrophobicContact,
      hbondTerm,
      logpTerm,
      entropyPenalty,
      clashPenalty,
      fill,
      hbondsMade,
    },
  };
}

/**
 * Dock a library of compounds and rank them, strongest (most negative)
 * first — the same leaderboard a virtual screen produces.
 *
 * @param {{ name:string, desc:object, meta?:object }[]} library Compounds with descriptors.
 * @param {object} pocket Pocket profile.
 * @returns {object[]} Ranked results with affinity, ligand efficiency and terms.
 */
export function screen(library, pocket) {
  return library
    .map((c) => {
      const s = score(c.desc, pocket);
      return {
        ...c,
        affinity: s.affinity,
        ligandEfficiency: c.desc.heavyAtoms ? s.affinity / c.desc.heavyAtoms : 0,
        fitsBox: s.fitsBox,
        terms: s.terms,
      };
    })
    .sort((a, b) => a.affinity - b.affinity);
}

/**
 * Enrichment: of the known actives in a ranked list, what share land in the
 * top fraction — the standard way to tell if a screen's ranking is better
 * than chance (an ROC-style early-recognition check).
 *
 * @param {object[]} ranked Output of screen().
 * @param {(c:object)=>boolean} isActive True for a known active.
 * @param {number} topFraction e.g. 0.25 for the top quarter.
 * @returns {{ enrichment:number, recovered:number, actives:number }} Enrichment factor.
 */
export function enrichment(ranked, isActive, topFraction = 0.25) {
  const actives = ranked.filter(isActive).length;
  if (!actives) return { enrichment: 0, recovered: 0, actives: 0 };
  const topN = Math.max(1, Math.round(ranked.length * topFraction));
  const recovered = ranked.slice(0, topN).filter(isActive).length;
  const expected = actives * topFraction;
  return { enrichment: recovered / Math.max(1e-9, expected), recovered, actives };
}
