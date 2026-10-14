/**
 * The four disease → protein → structure targets, and where to pull each
 * from, free. These are the real identifiers a researcher would use.
 *
 * `pdb` is the RCSB Protein Data Bank entry; the live app pulls it from
 * files.rcsb.org/download/<id>.pdb (free, no key, CORS-enabled). `bundled`
 * names a structure shipped with the app so it also works offline. `ligandCode`
 * is the three-letter code of the co-crystallised inhibitor, so the pocket
 * can be found from the real complex; `boxCenter` is a fallback binding-site
 * centre (Å) for structures that ship without their ligand.
 *
 * @module dockinglab/core/targets
 */

export const TARGETS = [
  {
    id: 'DPP4',
    disease: 'Type 2 diabetes',
    protein: 'DPP-4',
    proteinFull: 'Dipeptidyl peptidase-4',
    role: 'Breaks down the incretin hormones (GLP-1, GIP) that tell the pancreas to release insulin after a meal. Block DPP-4 and those hormones last longer, so blood sugar is controlled.',
    benchmark: 'DPP-4 inhibitors (the "-gliptins") are an approved drug class, so a working method should rank them above unrelated drugs.',
    pdb: '1X70',
    pdbTitle: 'Human DPP-4 in complex with a selective inhibitor',
    ligandCode: null,
    bundled: 'data/DPP4.pdb',
    boxCenter: { x: -18.3, y: -5.122, z: 59.878 },
    accent: '#38e1ff',
    color2: '#8b5cff',
  },
  {
    id: 'BACE1',
    disease: "Alzheimer's disease",
    protein: 'BACE1',
    proteinFull: 'Beta-secretase 1 (β-site APP-cleaving enzyme)',
    role: 'Makes the first cut in the amyloid precursor protein, the step that leads to the amyloid-β plaques that build up in the Alzheimer\'s brain. Block BACE1 and less plaque is made.',
    benchmark: 'Several BACE1 inhibitors reached late-stage trials; a method should rank those above unrelated drugs, even though none has yet been approved.',
    pdb: '1FKN',
    pdbTitle: 'BACE1 protease in complex with inhibitor OM99-2',
    ligandCode: null,
    bundled: 'data/BACE1.pdb',
    boxCenter: { x: 24.495, y: 12.617, z: 22.123 },
    accent: '#ff5fa8',
    color2: '#ffb347',
  },
  {
    id: 'PfDHFR',
    disease: 'Malaria',
    protein: 'PfDHFR',
    proteinFull: 'Plasmodium falciparum dihydrofolate reductase',
    role: 'The malaria parasite needs this enzyme to make the DNA building blocks it copies as it multiplies. Block it and the parasite cannot reproduce.',
    benchmark: 'Pyrimethamine and cycloguanil already target PfDHFR, with decades of published data — the gold standard to validate a method against.',
    pdb: '3QGT',
    pdbTitle: 'P. falciparum DHFR-TS with a diaminopyrimidine inhibitor',
    ligandCode: null,
    boxCenter: null,
    accent: '#3ef0b4',
    color2: '#38e1ff',
  },
  {
    id: 'HER2',
    disease: 'Breast cancer',
    protein: 'HER2',
    proteinFull: 'Human epidermal growth factor receptor 2 (ERBB2)',
    role: 'A growth-signal receptor that, when over-active, drives aggressive breast-tumour growth. Block its kinase and the growth signal is cut.',
    benchmark: 'Lapatinib, neratinib and tucatinib are approved HER2 inhibitors — real drugs to benchmark a method against.',
    pdb: '3PP0',
    pdbTitle: 'HER2 kinase domain in complex with an inhibitor',
    ligandCode: null,
    boxCenter: null,
    accent: '#ffd166',
    color2: '#ff5fa8',
  },
];

/** RCSB download URL for a PDB id (free, no key). */
export const rcsbURL = (id) => `https://files.rcsb.org/download/${id}.pdb`;

/** PubChem 3D SDF URL for a compound id (free, no key). */
export const pubchemURL = (cid) => `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/${cid}/record/SDF?record_type=3d`;

/** RCSB page and PubChem page, for the "see the source" links. */
export const rcsbPage = (id) => `https://www.rcsb.org/structure/${id}`;
export const pubchemPage = (cid) => `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}`;

export const targetById = (id) => TARGETS.find((t) => t.id === id);
