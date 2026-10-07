/** App shell: a quantum-circuit lab and an SCNT (cloning) lab, with a guided tour across both. */
import './style.css';
import { PRESETS, presetById } from './core/algorithms';
import { canPlace, emptyCircuit, PALETTE, place, removeAt, run, sample, type Circuit, type GateDef } from './core/circuit';
import { fmtC } from './core/complex';
import { DEFAULTS, evaluate, SPECIES, speciesOf, type Choices } from './core/cloning';
import { decohere, fidelity, gatesBeforeDecoherence, PLATFORMS } from './core/decohere';
import type { GateName, Op } from './core/quantum';
import { STAGES } from './core/scnt-stages';
import { drawBloch } from './scene/bloch';
import { drawScene } from './scene/scntScene';
import { buildTour, type TourStep } from './ui/tour';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const pct = (x: number) => `${(x * 100).toFixed(x < 0.01 ? 2 : x < 0.1 ? 1 : 0)}%`;

// ================================================================ state ====
let tab: 'quantum' | 'clone' = 'quantum';
// Quantum
let circ: Circuit = presetById('bell')!.build();
let selGate: GateName = 'H';
let angle = Math.PI / 2;
let ctrlPending: number | null = null;
let blochQ = 0;
let shots = 1024;
let platform = PLATFORMS[0];
let decoT = 50;
// Cloning
let choices: Choices = { ...DEFAULTS };
let stageIdx = 0;

// ================================================================ quantum ===
function renderQLeft(): void {
  $('#q-left').innerHTML = `
    <h3>Examples</h3>
    <div class="chips" id="presets">${PRESETS.map((p) => `<button data-preset="${p.id}">${esc(p.name)}</button>`).join('')}</div>
    <p class="hint" id="preset-blurb"></p>
    <h3 style="margin-top:12px">Gates — click one, then a cell</h3>
    <div class="palette" id="palette">${PALETTE.map((gdef) => `<button data-gate="${gdef.name}" title="${esc(gdef.blurb)}">${esc(gdef.label)}</button>`).join('')}</div>
    <p class="hint" id="gate-blurb"></p>
    <div class="group" id="angle-wrap" style="margin-top:8px">
      <label>Rotation angle: <span id="angle-val" class="mono"></span></label>
      <input type="range" id="angle" min="0" max="6.2832" step="0.0785" />
    </div>
    <div class="group">
      <label>Qubits</label>
      <div class="chips">${[1, 2, 3].map((n) => `<button data-n="${n}">${n}</button>`).join('')}<button id="clear-btn">Clear</button></div>
    </div>`;
  $('#q-left').querySelectorAll<HTMLButtonElement>('[data-preset]').forEach((b) => b.addEventListener('click', () => manual(() => loadPreset(b.dataset.preset!))));
  $('#q-left').querySelectorAll<HTMLButtonElement>('[data-gate]').forEach((b) => b.addEventListener('click', () => manual(() => selectGate(b.dataset.gate as GateName))));
  $('#q-left').querySelectorAll<HTMLButtonElement>('[data-n]').forEach((b) => b.addEventListener('click', () => manual(() => { circ = emptyCircuit(Number(b.dataset.n)); blochQ = 0; ctrlPending = null; })));
  $('#clear-btn').addEventListener('click', () => manual(() => { circ = emptyCircuit(circ.n); ctrlPending = null; }));
  $('#angle').addEventListener('input', (e) => { angle = Number((e.target as HTMLInputElement).value); syncQLeft(); });
  syncQLeft();
}

function syncQLeft(): void {
  $('#palette').querySelectorAll<HTMLButtonElement>('[data-gate]').forEach((b) => b.classList.toggle('sel', b.dataset.gate === selGate));
  $('#gate-blurb').textContent = PALETTE.find((g) => g.name === selGate)?.blurb ?? '';
  const isParam = ['RX', 'RY', 'RZ'].includes(selGate);
  $('#angle-wrap').style.display = isParam ? '' : 'none';
  ($('#angle') as HTMLInputElement).value = String(angle);
  $('#angle-val').textContent = `${(angle / Math.PI).toFixed(2)}π`;
}

function selectGate(g: GateName): void {
  selGate = g;
  ctrlPending = null;
}

function loadPreset(id: string): void {
  const p = presetById(id)!;
  circ = p.build();
  blochQ = 0;
  ctrlPending = null;
  $('#preset-blurb').innerHTML = `<b>${esc(p.name)}.</b> ${esc(p.blurb)}`;
}

const PAL: Record<string, GateDef> = Object.fromEntries(PALETTE.map((g) => [g.name, g]));

function renderCircuit(): void {
  const cols = Math.max(circ.cols.length + 1, 6);
  let html = '<div class="circuit"><table class="cgrid"><tbody>';
  for (let q = 0; q < circ.n; q++) {
    html += `<tr><td class="qlab">q${q} |0⟩</td>`;
    for (let col = 0; col < cols; col++) {
      const op = circ.cols[col]?.find((o) => o.q === q || o.control === q);
      let inner = '';
      if (op) {
        if (op.control === q) inner = '<span class="cell ctrl"></span>';
        else if (op.gate === 'CNOT') inner = '<span class="cell tgt">⊕</span>';
        else if (op.gate === 'CZ' || op.gate === 'SWAP') inner = `<span class="cell tgt">${op.gate === 'CZ' ? 'Z' : '⤬'}</span>`;
        else if (op.gate === 'MEASURE') inner = '<span class="cell meas">M</span>';
        else inner = `<span class="cell g1">${PAL[op.gate]?.label ?? op.gate}${op.angle !== undefined ? '' : ''}</span>`;
      }
      const pend = ctrlPending === col * 100 + q ? ' style="outline:2px solid var(--q2)"' : '';
      html += `<td data-col="${col}" data-q="${q}"${pend}>${inner}</td>`;
    }
    html += '</tr>';
  }
  html += '</tbody></table></div><p class="hint">Two-qubit gates: click the <b>control</b> qubit cell, then the <b>target</b> cell in the same column. Click a filled cell to remove it.</p>';
  $('#q-circuit').innerHTML = html;
  $('#q-circuit').querySelectorAll<HTMLTableCellElement>('td[data-col]').forEach((td) =>
    td.addEventListener('click', () => manual(() => cellClick(Number(td.dataset.col), Number(td.dataset.q)))),
  );
}

function cellClick(col: number, q: number): void {
  const existing = circ.cols[col]?.find((o) => o.q === q || o.control === q);
  if (existing) {
    circ = removeAt(circ, col, q);
    return;
  }
  const def = PAL[selGate];
  if (def.kind === 'control') {
    if (ctrlPending === null) {
      ctrlPending = col * 100 + q;
      return;
    }
    const pc = ctrlPending % 100;
    const pcol = Math.floor(ctrlPending / 100);
    ctrlPending = null;
    if (pcol !== col || pc === q) return;
    const op: Op = { gate: selGate, q, control: pc };
    if (canPlace(circ, col, op)) circ = place(circ, col, op);
    return;
  }
  const op: Op = { gate: selGate, q, ...(def.kind === 'param' ? { angle } : {}) };
  if (canPlace(circ, col, op)) circ = place(circ, col, op);
}

function drawProbs(): void {
  const res = run(circ, 7);
  const cv = $('#q-probs') as HTMLCanvasElement;
  const g = cv.getContext('2d')!;
  const W = cv.width;
  const H = cv.height;
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#0a0f17';
  g.fillRect(0, 0, W, H);
  const probs = res.probabilities;
  const n = probs.length;
  const bw = Math.min(64, (W - 40) / n);
  const x0 = (W - bw * n) / 2 + 10;
  g.font = '11px ui-monospace, monospace';
  for (let i = 0; i < n; i++) {
    const h = probs[i] * (H - 50);
    const x = x0 + i * bw;
    g.fillStyle = probs[i] > 0.001 ? '#38bdf8' : '#1b2a3a';
    g.fillRect(x + 3, H - 28 - h, bw - 6, h);
    g.fillStyle = '#8fa6c6';
    g.save();
    g.translate(x + bw / 2, H - 24);
    if (n > 8) g.rotate(Math.PI / 2.5);
    g.textAlign = n > 8 ? 'left' : 'center';
    g.fillText(res.state.label(i), 0, 10);
    g.restore();
    if (probs[i] > 0.02) {
      g.fillStyle = '#cfe4f7';
      g.textAlign = 'center';
      g.fillText(pct(probs[i]), x + bw / 2, H - 32 - h);
    }
  }
  // State amplitudes list
  $('#q-state').innerHTML = probs
    .map((p, i) => (p > 1e-6 ? `<div>|${res.state.label(i)}⟩ &nbsp; ${fmtC(res.state.amps[i])} &nbsp; <span class="hint">${pct(p)}</span></div>` : ''))
    .join('') || '<div class="hint">(no amplitude)</div>';
  // Bloch
  const bq = Math.min(blochQ, circ.n - 1);
  const bl = res.bloch[bq];
  drawBloch($('#q-bloch') as HTMLCanvasElement, [{ v: bl, label: `q${bq}`, color: res.purity[bq] < 0.9 ? '#f87171' : '#7c4dff' }], blochSpin);
  $('#q-bloch-q').innerHTML = `q${bq} · ${res.purity[bq] < 0.9 ? `mixed (purity ${res.purity[bq].toFixed(2)} — entangled)` : 'pure'} · <button id="bloch-cycle" style="padding:1px 7px">next qubit</button>`;
  $('#bloch-cycle')?.addEventListener('click', () => manual(() => (blochQ = (blochQ + 1) % circ.n)));
}

function renderQRight(): void {
  const counts = sample(circ, shots, 11);
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  $('#q-right').innerHTML = `
    <h3>Run on a "device"</h3>
    <div class="group"><label>Shots: ${shots}</label><input type="range" id="shots" min="128" max="4096" step="128" value="${shots}" /></div>
    <div id="hist">${entries.map(([k, v]) => `<div class="bar">|${k}⟩ <i style="width:${(v / shots) * 150}px"></i> ${v}</div>`).join('')}</div>
    <p class="hint">Real quantum computers only give samples: you run the circuit many times and build up the histogram. A single run gives one bit-string.</p>
    <div id="decoh"><h3 style="margin-top:12px">Decoherence</h3>
      <div class="group"><label>Hardware</label><select id="platform">${PLATFORMS.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></div>
      <p class="hint" id="plat-note"></p>
      <div class="group"><label>Idle time: <span class="mono" id="decoT-v"></span></label><input type="range" id="decoT" min="0" max="400" step="5" value="${decoT}" /></div>
      <div class="kv">
        <b>Coherence T₂</b><span>${platform.T2 >= 1e6 ? (platform.T2 / 1e6).toFixed(1) + ' s' : platform.T2 + ' µs'}</span>
        <b>Superposition left</b><span id="fid"></span>
        <b>Gates before decoherence</b><span>${Number.isFinite(gatesBeforeDecoherence(platform.T2, platform.gate)) ? Math.round(gatesBeforeDecoherence(platform.T2, platform.gate)).toLocaleString() : '∞'}</span>
      </div>
      <p class="hint">Decoherence — the leaking of quantum information into the environment — is why quantum computers need extreme isolation and error correction.</p>
    </div>`;
  $('#shots').addEventListener('input', (e) => { shots = Number((e.target as HTMLInputElement).value); renderQRight(); });
  const sel = $('#platform') as HTMLSelectElement;
  sel.value = platform.id;
  sel.addEventListener('change', () => { platform = PLATFORMS.find((p) => p.id === sel.value)!; renderQRight(); });
  $('#decoT').addEventListener('input', (e) => { decoT = Number((e.target as HTMLInputElement).value); syncDecoh(); });
  syncDecoh();
}

function syncDecoh(): void {
  $('#plat-note').textContent = platform.note;
  $('#decoT-v').textContent = `${decoT} µs`;
  const b0 = { x: 1, y: 0, z: 0 };
  const b = decohere(b0, decoT, platform.T1, platform.T2);
  $('#fid').textContent = pct(Math.max(0, 2 * fidelity(b0, b) - 1));
}

// ================================================================ cloning ===
function renderCLeft(): void {
  const sp = speciesOf(choices);
  $('#c-left').innerHTML = `
    <div class="note">Educational and demonstration only. This explains the biology of cloning and why it is so inefficient. Human reproductive cloning is banned by law in most countries.</div>
    <h3>Species</h3>
    <div class="chips" id="species">${SPECIES.map((s) => `<button data-sp="${s.id}">${esc(s.name)}</button>`).join('')}</div>
    <p class="hint" id="sp-note"></p>
    <h3 style="margin-top:12px">Protocol choices</h3>
    <div class="group"><label>Donor cell state</label><div class="chips"><button data-arr="g0">G0-arrested (serum-starved)</button><button data-arr="cycling">Cycling</button></div></div>
    <div class="group"><label>Activation</label><div class="chips"><button data-act="electro-chem">Electric + chemical</button><button data-act="electro-only">Electric only</button></div></div>
    <label class="toggle"><input type="checkbox" id="hdac" /> HDAC inhibitor (trichostatin A) to aid reprogramming</label>
    <label class="toggle"><input type="checkbox" id="sync" /> Surrogate synchronised</label>
    <div class="group" style="margin-top:8px"><label>Blastocysts transferred: <span class="mono" id="emb-v"></span></label><input type="range" id="emb" min="1" max="60" step="1" /></div>
    <p class="hint">Milestone: ${esc(sp.milestone)}</p>`;
  $('#c-left').querySelectorAll<HTMLButtonElement>('[data-sp]').forEach((b) => b.addEventListener('click', () => manual(() => { choices = { ...choices, species: b.dataset.sp! }; })));
  $('#c-left').querySelectorAll<HTMLButtonElement>('[data-arr]').forEach((b) => b.addEventListener('click', () => manual(() => { choices = { ...choices, arrest: b.dataset.arr as Choices['arrest'] }; })));
  $('#c-left').querySelectorAll<HTMLButtonElement>('[data-act]').forEach((b) => b.addEventListener('click', () => manual(() => { choices = { ...choices, activation: b.dataset.act as Choices['activation'] }; })));
  $('#hdac').addEventListener('change', (e) => manual(() => { choices = { ...choices, hdac: (e.target as HTMLInputElement).checked }; }));
  $('#sync').addEventListener('change', (e) => manual(() => { choices = { ...choices, synchronised: (e.target as HTMLInputElement).checked }; }));
  $('#emb').addEventListener('input', (e) => { choices = { ...choices, embryosTransferred: Number((e.target as HTMLInputElement).value) }; syncCLeft(); renderCRight(); drawFunnel(); });
  syncCLeft();
}

function syncCLeft(): void {
  const sp = speciesOf(choices);
  $('#c-left').querySelectorAll<HTMLButtonElement>('[data-sp]').forEach((b) => b.classList.toggle('on', b.dataset.sp === choices.species));
  $('#c-left').querySelectorAll<HTMLButtonElement>('[data-arr]').forEach((b) => b.classList.toggle('on', b.dataset.arr === choices.arrest));
  $('#c-left').querySelectorAll<HTMLButtonElement>('[data-act]').forEach((b) => b.classList.toggle('on', b.dataset.act === choices.activation));
  ($('#hdac') as HTMLInputElement).checked = choices.hdac;
  ($('#sync') as HTMLInputElement).checked = choices.synchronised;
  ($('#emb') as HTMLInputElement).value = String(choices.embryosTransferred);
  $('#emb-v').textContent = String(choices.embryosTransferred);
  $('#sp-note').textContent = sp.note;
}

function renderStage(): void {
  const st = STAGES[stageIdx];
  $('#c-room').textContent = `${stageIdx + 1}/${STAGES.length} · ${st.room}`;
  $('#c-title').textContent = st.title;
  $('#c-what').textContent = st.what;
  $('#c-detail').textContent = st.detail;
  $('#c-step-nav').innerHTML = `<button id="st-prev" ${stageIdx === 0 ? 'disabled' : ''}>◀</button><button id="st-next" ${stageIdx === STAGES.length - 1 ? 'disabled' : ''}>Next ▶</button>`;
  $('#st-prev').addEventListener('click', () => manual(() => (stageIdx = Math.max(0, stageIdx - 1))));
  $('#st-next').addEventListener('click', () => manual(() => (stageIdx = Math.min(STAGES.length - 1, stageIdx + 1))));
}

function drawFunnel(): void {
  const o = evaluate(choices);
  const cv = $('#c-funnel') as HTMLCanvasElement;
  const g = cv.getContext('2d')!;
  const W = cv.width;
  const H = cv.height;
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#0a0f17';
  g.fillRect(0, 0, W, H);
  const steps = o.stepRates;
  const bw = (W - 20) / steps.length;
  g.font = '10px system-ui, sans-serif';
  let cumulative = 1;
  for (let i = 0; i < steps.length; i++) {
    cumulative *= steps[i].rate;
    const h = Math.max(2, Math.pow(cumulative, 0.5) * (H - 60));
    const x = 10 + i * bw;
    g.fillStyle = i < 5 ? '#34d399' : '#f48fb1';
    g.fillRect(x + 2, H - 30 - h, bw - 4, h);
    g.fillStyle = '#cfe4f7';
    g.textAlign = 'center';
    g.fillText(`${(steps[i].rate * 100).toFixed(0)}%`, x + bw / 2, H - 34 - h);
    g.fillStyle = '#8fa6c6';
    g.save();
    g.translate(x + bw / 2, H - 26);
    g.rotate(0.5);
    g.fillText(steps[i].name.split(' ').slice(0, 2).join(' '), 0, 0);
    g.restore();
  }
  $('#c-funnel-note').innerHTML = `Reaching blastocyst: <b>${pct(o.blastocystRate)}</b> of reconstructed embryos. Overall efficiency to a healthy birth: <b>${pct(o.efficiency)}</b> — about <b>${Math.round(o.embryosPerBirth)}</b> reconstructed embryos per birth.`;
}

function renderCRight(): void {
  const o = evaluate(choices);
  const sp = speciesOf(choices);
  $('#c-right').innerHTML = `
    <h3>Expected result</h3>
    <div class="kv">
      <b>Blastocyst rate</b><span>${pct(o.blastocystRate)}</span>
      <b>Efficiency (birth / embryo)</b><span>${pct(o.efficiency)}</span>
      <b>Embryos per birth</b><span>~${Math.round(o.embryosPerBirth)}</span>
      <b>Expected live births</b><span>${o.expectedBirths.toFixed(2)}</span>
    </div>
    <h3 style="margin-top:12px">What this teaches</h3>
    <ul class="lessons">${o.lessons.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
    <h3 style="margin-top:12px">Milestones</h3>
    <div class="timeline">
      <div><b>1996</b> Dolly the sheep — first mammal from an adult cell</div>
      <div><b>1998</b> Mice (Honolulu technique)</div>
      <div><b>2001</b> CC the cat — first cloned pet</div>
      <div><b>2005</b> Snuppy the dog</div>
      <div><b>2018</b> Zhong Zhong & Hua Hua — first primates by SCNT</div>
    </div>
    <h3 style="margin-top:12px">Reproductive vs therapeutic</h3>
    <p class="hint">Reproductive cloning aims at a live birth and is banned for humans almost everywhere. Therapeutic cloning makes early embryos only to derive stem cells for research or repair. Induced pluripotent stem cells (iPSCs, Yamanaka 2006) now reprogram cells without eggs or embryos, sidestepping much of the ethics.</p>
    <p class="hint">Current species: ${esc(sp.name)}. Difficulty ×${sp.difficulty}.</p>`;
}

// ================================================================= tabs =====
function setTab(t: 'quantum' | 'clone'): void {
  tab = t;
  $('#quantum').classList.toggle('hidden', t !== 'quantum');
  $('#clone').classList.toggle('hidden', t !== 'clone');
  document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
}
document.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach((b) => b.addEventListener('click', () => manual(() => setTab(b.dataset.tab as 'quantum' | 'clone'))));

// ================================================================= tour =====
let tourSteps: TourStep[] = [];
let tourIdx = -1;
let tourElapsed = 0;
let tourActive = false;
let paused = false;
let applying = false;
let highlighted: Element | null = null;

const tourApi = {
  setTab,
  loadPreset: (id: string) => { setTab('quantum'); loadPreset(id); },
  setPlatform: (id: string) => { platform = PLATFORMS.find((p) => p.id === id)!; renderQRight(); },
  setChoices: (c: Partial<Choices>) => { choices = { ...choices, ...c }; },
  gotoStage: (i: number) => { setTab('clone'); stageIdx = i; },
  highlight: (sel: string | null) => {
    highlighted?.classList.remove('highlight');
    highlighted = sel ? document.querySelector(sel) : null;
    highlighted?.classList.add('highlight');
  },
};

function manual(fn: () => void): void {
  if (tourActive && !applying) stopTour();
  fn();
  renderAll();
}

function startTour(): void {
  $('#overlay').classList.add('hidden');
  tourSteps = buildTour();
  tourActive = true;
  paused = false;
  tourIdx = -1;
  nextStep();
}
function stopTour(): void {
  tourActive = false;
  tourApi.highlight(null);
  $('#tourbar').classList.add('hidden');
}
function nextStep(): void {
  applying = true;
  tourIdx++;
  tourElapsed = 0;
  if (tourIdx >= tourSteps.length) { stopTour(); applying = false; renderAll(); return; }
  tourSteps[tourIdx].enter(tourApi);
  applying = false;
  renderAll();
  drawTour();
}
function prevStep(): void {
  if (tourIdx <= 0) return;
  tourIdx -= 2;
  nextStep();
}
function drawTour(): void {
  const st = tourSteps[tourIdx];
  const bar = $('#tourbar');
  bar.classList.toggle('hidden', !tourActive || !st);
  if (!tourActive || !st) return;
  bar.innerHTML = `<div class="t-head"><span class="badge">TOUR ${tourIdx + 1}/${tourSteps.length}</span><strong>${esc(st.title)}</strong>
    <button data-tb="prev" aria-label="Previous">◀</button><button data-tb="pause">${paused ? '▶' : '❚❚'}</button><button data-tb="next" aria-label="Next">▶▶</button><button data-tb="stop" aria-label="Stop">✕</button></div>
    <div style="margin-top:6px">${esc(st.text)}</div><div class="progress"><i style="width:${Math.min(100, (tourElapsed / st.seconds) * 100)}%"></i></div>`;
}
$('#tourbar').addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest<HTMLButtonElement>('[data-tb]');
  if (!b) return;
  if (b.dataset.tb === 'prev') prevStep();
  else if (b.dataset.tb === 'next') nextStep();
  else if (b.dataset.tb === 'pause') { paused = !paused; drawTour(); }
  else stopTour();
});
$('#tour-btn').addEventListener('click', startTour);

// ============================================================= start menu ===
function startScreen(): void {
  $('#overlay').classList.remove('hidden');
  $('#overlay').innerHTML = `<div class="panel" role="dialog" aria-labelledby="st">
    <h2 id="st">QUBITS <span style="color:var(--muted)">&amp;</span> <span class="b">CLONES</span></h2>
    <p>Two of the strangest technologies of our age, side by side. Build real quantum circuits and watch
    superposition, entanglement and interference do things ordinary bits cannot — then step through a cloning
    facility and see why copying a mammal is possible, grotesquely inefficient, and nothing like science fiction.</p>
    <div class="note">Educational and demonstration only. The quantum simulator computes exact amplitudes; the cloning
    model uses simplified, literature-anchored numbers to teach the biology. Human reproductive cloning is prohibited
    by law in most of the world — this is not a protocol, it is an explanation.</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
      <button class="primary" id="st-tour">▶ Guided tour (both labs)</button>
      <button id="st-q">⚛ Quantum lab</button>
      <button id="st-c">🧬 Cloning lab</button>
    </div>
  </div>`;
  $('#st-tour').addEventListener('click', startTour);
  $('#st-q').addEventListener('click', () => { setTab('quantum'); $('#overlay').classList.add('hidden'); });
  $('#st-c').addEventListener('click', () => { setTab('clone'); $('#overlay').classList.add('hidden'); });
}

// ================================================================= render ===
function renderAll(): void {
  if (tab === 'quantum') {
    renderCircuit();
    syncQLeft();
    renderQRight();
  } else {
    syncCLeft();
    renderStage();
    renderCRight();
    drawFunnel();
  }
}

renderQLeft();
renderCircuit();
loadPreset('bell');
renderQRight();
renderCLeft();
renderStage();
renderCRight();
setTab('quantum');
startScreen();

let blochSpin = 0;
let last = performance.now();
let t = 0;
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  t += dt;
  blochSpin += dt * 0.35;
  if (tab === 'quantum') drawProbs();
  else drawScene($('#c-scene') as HTMLCanvasElement, STAGES[stageIdx], t);
  if (tourActive && !paused) {
    tourElapsed += dt;
    if (tourElapsed >= tourSteps[tourIdx].seconds) nextStep();
    else if ((t * 10) % 1 < 0.06) drawTour();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

(window as unknown as Record<string, unknown>).__qc = { get circ() { return circ; }, get choices() { return choices; }, run, evaluate, setTab, loadPreset, startTour, get tab() { return tab; } };
