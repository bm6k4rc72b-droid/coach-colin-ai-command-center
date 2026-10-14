/**
 * DOCKING LAB — the controller. Drives the five-step pipeline UI, the 3D
 * viewer and the live/offline data fetch.
 *
 * @module dockinglab/app
 */

import { Viewer } from './view/scene.js';
import {
  TARGETS, loadStructure, findPocket, loadLibrary, runScreen, pubchemURL,
} from './core/pipeline.js';
import { rcsbPage, pubchemPage, rcsbURL } from './core/targets.js';

const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, kids = []) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'text') n.textContent = v;
    else if (k === 'html') n.innerHTML = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of [].concat(kids)) if (kid != null && kid !== false) n.append(kid);
  return n;
};

const STEPS = [
  { id: 'disease', n: 1, label: 'Disease' },
  { id: 'structure', n: 2, label: 'Structure' },
  { id: 'pocket', n: 3, label: 'Pocket' },
  { id: 'screen', n: 4, label: 'Screen' },
  { id: 'benchmark', n: 5, label: 'Benchmark' },
];

const state = { ligandsIndex: null, target: null, run: null, step: 'disease', selected: null };
let viewer;

/* ---------------------------------------------------------------- startup */

async function boot() {
  const list = $('gate-targets');
  for (const t of TARGETS) {
    list.append(el('li', {}, [
      el('span', { class: 'gt-dot', style: `background:${t.accent}` }),
      el('span', {}, [el('b', { text: t.disease }), ` → ${t.protein}`]),
    ]));
  }
  $('enter').addEventListener('click', enter);
  $('help').addEventListener('click', showHelp);
  $('modal-close').addEventListener('click', () => $('modal').classList.add('hidden'));
  $('modal').addEventListener('click', (e) => { if (e.target === $('modal')) $('modal').classList.add('hidden'); });
  for (const b of document.querySelectorAll('[data-view]')) b.addEventListener('click', () => {
    if (b.dataset.view === 'pocket' && state.run) viewer.focusPocket(state.run.site.box.center, 20);
    else viewer.resetView();
  });
  try { state.ligandsIndex = await (await fetch('data/ligands.json')).json(); } catch (error) { state.ligandsIndex = {}; }
}

function enter() {
  $('gate').classList.add('gone');
  $('hud').classList.remove('hidden');
  viewer = new Viewer($('stage'));
  renderSteps();
  gotoDisease();
}

function renderSteps() {
  const bar = $('steps');
  bar.replaceChildren(...STEPS.map((s) => {
    const done = STEPS.findIndex((x) => x.id === state.step) >= s.n - 1;
    return el('button', {
      class: `step${state.step === s.id ? ' on' : ''}${done ? ' done' : ''}`,
      type: 'button', 'data-step': s.id,
      onclick: () => jumpTo(s.id),
    }, [el('span', { class: 'step-n', text: String(s.n) }), el('span', { class: 'step-label', text: s.label })]);
  }));
}

function jumpTo(stepId) {
  if (stepId === 'disease') return gotoDisease();
  if (!state.target) return;
  if (stepId === 'structure') return gotoStructure();
  if (!state.run) return;
  if (stepId === 'pocket') return gotoPocket();
  if (stepId === 'screen') return gotoScreen();
  if (stepId === 'benchmark') return gotoBenchmark();
}

function setStep(id) { state.step = id; renderSteps(); }
function panel(...kids) { $('panel-body').replaceChildren(...kids); }
function loader(on, text) { $('loader').classList.toggle('hidden', !on); if (text) $('loader-text').textContent = text; }
function viewTag(html) { $('view-tag').innerHTML = html; }

/* ---------------------------------------------------- step 1 · disease */

function gotoDisease() {
  setStep('disease');
  viewTag('Pick a disease to begin');
  panel(
    el('p', { class: 'kicker', text: 'Step 1 · Choose a disease' }),
    el('h2', { text: 'Every drug starts with a target' }),
    el('p', { class: 'lede', text: 'A disease is driven by a protein doing the wrong thing. Find that protein, and a molecule that jams it can become a medicine. Pick one:' }),
    el('div', { class: 'target-grid' }, TARGETS.map((t) => el('button', {
      class: 'target-card', type: 'button', style: `--accent:${t.accent};--accent2:${t.color2}`,
      onclick: () => chooseTarget(t),
    }, [
      el('div', { class: 'tc-disease', text: t.disease }),
      el('div', { class: 'tc-protein' }, [el('b', { text: t.protein }), el('span', { text: t.proteinFull })]),
      el('p', { class: 'tc-role', text: t.role }),
      el('div', { class: 'tc-go', text: 'Target it →' }),
    ]))),
    el('p', { class: 'fine', text: 'Four worked examples. Three of their targets already have approved or trial drugs, so the method can be checked against real results.' }),
  );
}

async function chooseTarget(t) {
  state.target = t;
  state.run = null;
  document.documentElement.style.setProperty('--accent', t.accent);
  document.documentElement.style.setProperty('--accent2', t.color2);
  await gotoStructure();
}

/* -------------------------------------------------- step 2 · structure */

async function gotoStructure() {
  setStep('structure');
  const t = state.target;
  loader(true, `Pulling ${t.pdb} from the Protein Data Bank…`);
  let loaded;
  try {
    loaded = await loadStructure(t);
  } catch (error) {
    loader(false);
    panel(el('p', { class: 'kicker', text: 'Step 2 · Structure' }), el('h2', { text: 'Could not load the structure' }),
      el('p', { class: 'lede', text: `${t.pdb} could not be pulled from RCSB and no offline copy is bundled for ${t.protein}. Connect to the internet and try again.` }),
      el('button', { class: 'btn-primary', type: 'button', text: 'Retry', onclick: gotoStructure }));
    return;
  }
  const site = findPocket(loaded.structure, t);
  state.run = { ...loaded, site, backbone: (await import('./core/pdb.js')).backbone(loaded.structure) };
  loader(true, 'Rendering the protein…');
  await new Promise((r) => setTimeout(r, 30));
  viewer.showProtein(state.run.backbone, { helix: t.accent, sheet: t.color2, coil: 0x53708f });
  viewer.showBox(site.box, t.accent);
  if (site.ligand) viewer.showLigand(ligandAsMol(loaded.structure, site.ligand), site.box.center);
  viewer.resetView();
  loader(false);
  const srcLabel = loaded.source === 'rcsb'
    ? `pulled live from RCSB PDB entry <a href="${rcsbPage(t.pdb)}" target="_blank" rel="noopener">${t.pdb}</a>`
    : `loaded from the bundled offline copy of <a href="${rcsbPage(t.pdb)}" target="_blank" rel="noopener">${t.pdb}</a> (RCSB unreachable)`;
  viewTag(`<b>${t.protein}</b> · ${state.run.structure.atoms.length.toLocaleString()} atoms · ${loaded.source === 'rcsb' ? 'live from RCSB' : 'offline copy'}`);
  panel(
    el('p', { class: 'kicker', text: 'Step 2 · Pull the 3D structure' }),
    el('h2', { text: `${t.protein}: the real atoms` }),
    el('p', { class: 'lede', html: `This structure was ${srcLabel} — a free, public database of experimentally-solved protein shapes. No account, no fee.` }),
    kvTable([
      ['Database', 'RCSB Protein Data Bank'],
      ['Entry', `${t.pdb} — ${t.pdbTitle}`],
      ['Atoms parsed', state.run.structure.atoms.length.toLocaleString()],
      ['Chains (ribbon)', String(state.run.backbone.length)],
      state.run.structure.resolution ? ['Resolution', `${state.run.structure.resolution} Å`] : null,
    ]),
    el('div', { class: 'how-url' }, [
      el('span', { text: 'The one URL that does it, free:' }),
      el('code', { text: rcsbURL(t.pdb) }),
    ]),
    el('p', { text: 'The ribbon traces the protein backbone. Helices and sheets are coloured; the glowing cube is the search box where we will test compounds.' }),
    el('button', { class: 'btn-primary', type: 'button', text: 'Find the binding pocket →', onclick: gotoPocket }),
  );
}

function ligandAsMol(structure, ligand) {
  // Reuse the ligand's PDB atoms as a stick model: fabricate bonds by distance.
  const atoms = ligand.atoms.map((a) => ({ ...a }));
  const bonds = [];
  for (let i = 0; i < atoms.length; i += 1) for (let j = i + 1; j < atoms.length; j += 1) {
    const d = Math.hypot(atoms[i].x - atoms[j].x, atoms[i].y - atoms[j].y, atoms[i].z - atoms[j].z);
    if (d < 1.9) bonds.push({ a: i, b: j, order: 1 });
  }
  return { atoms, bonds, name: ligand.resName };
}

/* ----------------------------------------------------- step 3 · pocket */

function gotoPocket() {
  setStep('pocket');
  const t = state.target;
  const site = state.run.site;
  viewer.showPocket(site.pocket, state.run.backbone, t.accent);
  viewer.focusPocket(site.box.center, 20);
  viewTag(`<b>Binding pocket</b> · ${site.pocket.length} residues line the site`);
  const b = site.box;
  panel(
    el('p', { class: 'kicker', text: 'Step 3 · Find the pocket' }),
    el('h2', { text: 'Where a drug would grab' }),
    el('p', { class: 'lede', text: site.ligand
      ? `This structure was solved with an inhibitor already bound, so the pocket is exactly the residues wrapped around it — and the search box is drawn around that molecule, the way a real docking run is set up.`
      : `The binding site is centred on the known catalytic pocket, and the lining is every residue within reach of it.` }),
    kvTable([
      ['Box centre (Å)', `${b.center.x.toFixed(1)}, ${b.center.y.toFixed(1)}, ${b.center.z.toFixed(1)}`],
      ['Box size (Å)', `${b.size.x.toFixed(0)} × ${b.size.y.toFixed(0)} × ${b.size.z.toFixed(0)}`],
      ['Pocket residues', String(site.pocket.length)],
      site.ligand ? ['Co-crystal ligand', site.ligand.resName] : null,
    ]),
    el('div', { class: 'pocket-res' }, site.pocket.slice(0, 40).map((r) => el('span', { class: 'res-chip', text: `${r.resName}${r.resSeq}` }))),
    el('p', { class: 'fine', text: 'Polar residues (that can make hydrogen bonds) and greasy ones (that bury a compound\'s hydrophobic surface) together decide what fits.' }),
    el('button', { class: 'btn-primary', type: 'button', text: 'Screen the compounds →', onclick: gotoScreen }),
  );
}

/* ----------------------------------------------------- step 4 · screen */

async function gotoScreen() {
  setStep('screen');
  const t = state.target;
  if (!state.run.library) {
    loader(true, 'Loading the compound library & computing descriptors…');
    state.run.library = await loadLibrary(t, state.ligandsIndex[t.id] || [], { dataBase: 'data/' });
    state.run.screen = runScreen(state.run.library, state.run.site.pocket, state.run.site.box);
    loader(false);
  }
  const s = state.run.screen;
  state.selected = s.ranked[0];
  showCompound(s.ranked[0]);
  viewTag(`<b>Virtual screen</b> · ${s.ranked.length} compounds ranked`);
  panel(
    el('p', { class: 'kicker', text: 'Step 4 · Screen compounds' }),
    el('h2', { text: 'Which molecules could block it?' }),
    el('p', { class: 'lede', text: `Each compound's real 3D structure is read from PubChem, its drug-like properties are computed, and it is scored for how well it fits this pocket. Most negative = tightest predicted fit. Tap one to see it dock.` }),
    el('ol', { class: 'leaderboard' }, s.ranked.map((c, i) => el('li', {
      class: `lb-row${c === state.selected ? ' on' : ''} ${c.role}`, 'data-id': c.id,
      onclick: () => { state.selected = c; showCompound(c); markRow(c); },
    }, [
      el('span', { class: 'lb-rank', text: String(i + 1) }),
      el('span', { class: 'lb-name' }, [el('b', { text: c.name }), el('span', { class: 'lb-note', text: c.role === 'active' ? 'known binder' : 'unrelated drug' })]),
      el('span', { class: `lb-aff ${c.affinity < -6 ? 'strong' : c.affinity < -4 ? 'mid' : 'weak'}`, text: `${c.affinity.toFixed(1)}` }),
      el('span', { class: 'lb-bar' }, [el('i', { style: `width:${Math.min(100, (-c.affinity / 10) * 100)}%` })]),
    ]))),
    el('p', { class: 'fine', text: 'Score is an estimated binding energy in kcal/mol — a transparent teaching function, not AutoDock Vina. Known binders are marked so you can see whether the ranking finds them.' }),
    el('button', { class: 'btn-primary', type: 'button', text: 'Benchmark vs known drugs →', onclick: gotoBenchmark }),
  );
}

function markRow(c) {
  for (const row of document.querySelectorAll('.lb-row')) row.classList.toggle('on', row.dataset.id === c.id);
}

function showCompound(c) {
  viewer.showLigand(c.mol, state.run.site.box.center);
  viewer.focusPocket(state.run.site.box.center, 18);
  const d = c.desc;
  const lip = d.lipinskiViolations === 0 ? 'passes all of Lipinski\'s rule of five' : `${d.lipinskiViolations} Lipinski violation${d.lipinskiViolations > 1 ? 's' : ''}`;
  $('view-tag').innerHTML = `<b>${c.name}</b> · docked · est. ${c.affinity.toFixed(1)} kcal/mol`;
  // A floating compound card over the viewer.
  let card = document.getElementById('cmp-card');
  if (!card) { card = el('div', { id: 'cmp-card', class: 'cmp-card' }); $('viewer-chrome').append(card); }
  card.replaceChildren(
    el('div', { class: 'cc-head' }, [el('b', { text: c.name }), el('span', { class: `cc-role ${c.role}`, text: c.role === 'active' ? 'known binder' : 'unrelated drug' })]),
    el('p', { class: 'cc-formula', text: `${c.formula || ''} · ${c.note}` }),
    el('div', { class: 'cc-grid' }, [
      stat('Est. affinity', `${c.affinity.toFixed(1)}`, 'kcal/mol'),
      stat('Ligand eff.', `${c.ligandEfficiency.toFixed(3)}`, 'per atom'),
      stat('MW', `${d.mw}`, 'Da'),
      stat('logP', `${d.logP}`, ''),
      stat('H-bond donors', `${d.hbd}`, ''),
      stat('H-bond acc. (N+O)', `${d.hba}`, ''),
      stat('Rotatable', `${d.rotatable}`, ''),
      stat('TPSA', `${d.tpsa}`, 'Å²'),
    ]),
    el('p', { class: 'cc-lip', text: `Drug-likeness: ${lip}${d.veber ? ', Veber OK' : ''}.` }),
    el('div', { class: 'cc-links' }, [
      el('a', { href: pubchemPage(c.cid), target: '_blank', rel: 'noopener', text: `PubChem CID ${c.cid} ↗` }),
      el('button', { class: 'cc-why', type: 'button', text: 'Why this score?', onclick: () => showScoreBreakdown(c) }),
    ]),
  );
}

function stat(label, value, unit) {
  return el('div', { class: 'cc-stat' }, [el('b', { text: value }), unit ? el('small', { text: unit }) : null, el('span', { text: label })]);
}

function showScoreBreakdown(c) {
  const terms = c.terms;
  openModal('Where the score comes from', [
    el('p', { text: `The estimated affinity for ${c.name} is the sum of physically-motivated terms — the same shape of function AutoDock Vina and Glide use, simplified so it runs on a phone:` }),
    el('table', { class: 'breakdown' }, [
      el('tr', {}, [el('th', { text: 'Term' }), el('th', { text: 'kcal/mol' }), el('th', { text: 'What it means' })]),
      brow('Hydrophobic contact', terms.hydrophobicContact, 'Burying the compound\'s greasy surface in the pocket'),
      brow('Hydrogen bonds', terms.hbondTerm, `${terms.hbondsMade} H-bonds the two sides can make`),
      brow('Lipophilicity (logP)', terms.logpTerm, 'A tad more binding for a more oil-loving molecule'),
      brow('Entropy penalty', terms.entropyPenalty, 'Freezing rotatable bonds on binding costs energy'),
      brow('Steric clash', terms.clashPenalty, terms.clashPenalty > 0 ? 'Too big for the box' : 'None — it fits'),
      el('tr', { class: 'brow-total' }, [el('td', { text: 'Estimated total' }), el('td', { text: c.affinity.toFixed(2) }), el('td', { text: `pocket filled ${(terms.fill * 100).toFixed(0)}%` })]),
    ]),
    el('p', { class: 'fine', text: 'This is a teaching estimate, not a validated binding prediction. A real campaign would dock thousands of flexible poses with AutoDock Vina and confirm the best in the lab.' }),
  ]);
}

function brow(name, val, meaning) {
  return el('tr', {}, [el('td', { text: name }), el('td', { class: val < 0 ? 'neg' : 'pos', text: val.toFixed(2) }), el('td', { text: meaning })]);
}

/* -------------------------------------------------- step 5 · benchmark */

function gotoBenchmark() {
  setStep('benchmark');
  const t = state.target;
  const s = state.run.screen;
  const topN = Math.max(1, Math.round(s.ranked.length * 0.25));
  const actives = s.ranked.filter((c) => c.role === 'active');
  const avgActive = actives.reduce((a, c) => a + c.affinity, 0) / actives.length;
  const decoys = s.ranked.filter((c) => c.role === 'decoy');
  const avgDecoy = decoys.reduce((a, c) => a + c.affinity, 0) / decoys.length;
  const separation = avgDecoy - avgActive;
  viewTag(`<b>Benchmark</b> · known drugs vs unrelated molecules`);
  panel(
    el('p', { class: 'kicker', text: 'Step 5 · Validate the method' }),
    el('h2', { text: 'Did it find the real drugs?' }),
    el('p', { class: 'lede', text: `${t.benchmark} The test: do the known binders rank above the unrelated drugs?` }),
    el('div', { class: 'bench-stats' }, [
      stat('Enrichment (top 25%)', `${s.enrichment.enrichment.toFixed(1)}×`, 'vs chance'),
      stat('Known binders found', `${s.enrichment.recovered}/${s.enrichment.actives}`, 'in top 25%'),
      stat('Avg known binder', `${avgActive.toFixed(1)}`, 'kcal/mol'),
      stat('Avg unrelated drug', `${avgDecoy.toFixed(1)}`, 'kcal/mol'),
    ]),
    el('div', { class: `verdict ${separation > 1 ? 'good' : separation > 0 ? 'ok' : 'poor'}` }, [
      el('b', { text: separation > 1 ? '✓ The method works here' : separation > 0 ? '~ Partial separation' : '✗ No separation' }),
      el('span', { text: `Known binders score on average ${separation.toFixed(1)} kcal/mol ${separation >= 0 ? 'stronger' : 'weaker'} than unrelated drugs${s.enrichment.enrichment >= 1.5 ? `, and the top of the list is enriched ${s.enrichment.enrichment.toFixed(1)}× in real drugs` : ''}.` }),
    ]),
    el('div', { class: 'bench-split' }, [
      el('div', {}, [el('h4', { text: 'Ranked as top binders' }), el('ul', { class: 'mini-list' }, s.ranked.slice(0, topN).map((c) => el('li', { class: c.role }, [el('span', { text: c.name }), el('b', { text: c.affinity.toFixed(1) })])))]),
      el('div', {}, [el('h4', { text: 'Ranked lowest' }), el('ul', { class: 'mini-list' }, s.ranked.slice(-topN).map((c) => el('li', { class: c.role }, [el('span', { text: c.name }), el('b', { text: c.affinity.toFixed(1) })])))]),
    ]),
    el('p', { class: 'fine', text: 'Enrichment is how many more known drugs land in the top 25% than you would get by shuffling the list. Above 1 means the ranking carries real signal. This is exactly the check a real virtual screen runs before trusting its hits.' }),
    el('div', { class: 'bench-actions' }, [
      el('button', { class: 'btn-primary', type: 'button', text: '← Try another disease', onclick: gotoDisease }),
      el('button', { class: 'btn-ghost', type: 'button', text: 'How this maps to real pharma', onclick: showHelp }),
    ]),
  );
}

/* ----------------------------------------------------------- helpers */

function kvTable(rows) {
  return el('table', { class: 'kv' }, rows.filter(Boolean).map(([k, v]) => el('tr', {}, [el('td', { text: k }), el('td', { text: String(v) })])));
}

function openModal(title, body) {
  $('modal-body').replaceChildren(el('h3', { text: title }), ...body);
  $('modal').classList.remove('hidden');
}

function showHelp() {
  openModal('How this maps to real drug discovery', [
    el('ol', { class: 'help-steps' }, [
      ['Pick the target', 'Choose the protein that drives a disease. Here: BACE1, PfDHFR, DPP-4, HER2 — all real, well-studied targets.'],
      ['Pull the structure', 'Download its experimentally-solved 3D shape from the RCSB Protein Data Bank — free, no key. Pharma uses the exact same database.'],
      ['Find the pocket', 'Locate the cavity where a small molecule can bind and block the protein, and box it for the search.'],
      ['Screen compounds', 'Score a library of molecules (pulled from PubChem) for how well each fits. Real campaigns screen millions this way before touching a pipette.'],
      ['Benchmark', 'Check the ranking against drugs already known to hit the target. If the method finds them, you can trust its new suggestions enough to test in the lab.'],
    ].map(([h, b]) => el('li', {}, [el('b', { text: h }), el('p', { text: b })]))),
    el('p', { class: 'fine', text: 'Everything here runs on your device and uses only free public data. The one shortcut: real docking (AutoDock Vina) searches thousands of 3D poses per molecule, which is too heavy for a phone — so this uses a transparent shape-and-chemistry score instead. The pipeline, the databases and the validation are the real thing.' }),
    el('p', { class: 'made-by', html: 'Made by <b>Colin Cook</b>' }),
  ]);
}

boot();
