/** App shell: case picker, triage, procedure controls, 3D + DSA views, mentor, demo, debrief. */
import './style.css';
import { CASES, CLOT_INFO } from './config/cases';
import { ETICI_ORDER, ETICI_TEXT, type ETici } from './core/angio';
import { debrief } from './core/debrief';
import { Autopilot } from './core/demo';
import { neurons, penumbra } from './core/physiology';
import { fmt, Sim, STENT_LENGTHS, type DeviceId } from './core/sim';
import { Dsa, type Projection } from './scene/dsa';
import { World } from './scene/world';

const $ = <T extends HTMLElement = HTMLElement>(s: string) => document.querySelector(s) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

let caseId = 'm1';
let sim = new Sim(caseId, Date.now() % 100000);
let world = new World($('#view3d') as HTMLCanvasElement, sim);
let dsa = new Dsa($('#dsa') as HTMLCanvasElement, sim);
let pilot: Autopilot | null = null;
let quizFor = -1;
let quizAnswer: { pick: ETici; run: number } | null = null;
let shownDebrief = false;

const DEV_LABEL: Record<DeviceId, string> = { guide: 'Balloon guide', asp: 'Aspiration catheter', micro: 'Microcatheter + wire' };
const SPEED: Record<DeviceId, number> = { guide: 45, asp: 25, micro: 14 };

function newCase(id: string, demo = false): void {
  caseId = id;
  ($('#case-select') as HTMLSelectElement).value = id;
  sim = new Sim(id, demo ? 1 : (Date.now() % 100000) + 1);
  // Rebuild renderers for the new anatomy (arch type differs per case).
  world.dispose();
  const c3 = $('#view3d') as HTMLCanvasElement;
  const fresh = c3.cloneNode() as HTMLCanvasElement;
  c3.replaceWith(fresh);
  world = new World(fresh, sim);
  dsa = new Dsa($('#dsa') as HTMLCanvasElement, sim);
  dsa.view = (document.querySelector('[data-proj].on') as HTMLElement)?.dataset.proj as Projection ?? 'AP';
  pilot = demo ? new Autopilot(sim, 'combined', 45) : null;
  quizFor = -1;
  quizAnswer = null;
  shownDebrief = false;
  $('#overlay').classList.add('hidden');
  sim.beginTriage();
  sig = '';
  renderAll();
}

// ------------------------------------------------------------- start screen --
function startScreen(): void {
  $('#overlay').classList.remove('hidden');
  $('#overlay').innerHTML = `<div class="panel" role="dialog" aria-labelledby="st">
    <h2 id="st">STROKE CODE</h2>
    <p>A large clot has blocked an artery in the brain. Every minute, roughly <b>1.9 million neurons</b> die. You run the code stroke —
    imaging, thrombolysis, eligibility — then go into the angio suite and pull the clot out through a catheter from the groin.</p>
    <div class="note"><b>For education and demonstration only.</b> Simplified teaching models of anatomy, clot behaviour and outcomes.
    Not clinical training, not validated for skills assessment, and not medical advice.</div>
    <h3>Choose a case</h3>
    <div class="cases">${CASES.map((c) => `<button data-case="${c.id}"><b>${esc(c.title)}</b><small>${c.age}${c.sex} · NIHSS ${c.nihss} · ASPECTS ${c.aspects} · arch type ${c.arch}</small></button>`).join('')}</div>
    <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="primary" id="st-demo">▶ Watch the demo first (case 1)</button></div>
  </div>`;
  $('#overlay').querySelectorAll<HTMLButtonElement>('[data-case]').forEach((b) => b.addEventListener('click', () => newCase(b.dataset.case!)));
  $('#st-demo').addEventListener('click', () => newCase('m1', true));
}

// ------------------------------------------------------------- left panel --
function renderLeft(): void {
  const c = sim.c;
  const core = sim.core;
  const pen = penumbra(c, core);
  const reperf = sim.reperfusedAt !== null;
  const tot = c.hypoperfused;
  const q = sim.triageCurrent;
  $('#left').innerHTML = `
    <h3>Patient</h3>
    <div><b>${c.age}${c.sex}</b> · NIHSS <b>${c.nihss}</b> · BP ${c.bp[0]}/${c.bp[1]}</div>
    <div class="hint" style="color:var(--muted);font-size:12.5px">${esc(c.deficits)}</div>
    <div style="margin-top:8px" class="kv">
      <b>Since last known well</b><span class="clock" style="font-size:20px">${fmt(sim.sinceOnset)}</span>
      <b>Since arrival (door)</b><span>${fmt(sim.t)}</span>
      <b>ASPECTS</b><span>${c.aspects}/10</span>
      <b>Clot</b><span>${c.clot.segment === 'ica' ? 'ICA-T' : 'M1'} · ${c.clot.lengthMm} mm</span>
      <b>Collaterals</b><span>${c.collaterals}</span>
    </div>
    <h3 style="margin-top:12px">Brain at risk</h3>
    <div class="meter" title="core / penumbra"><i style="width:${(core / tot) * 100}%;background:#991b1b"></i><i style="width:${(pen / tot) * 100}%;background:${reperf ? '#16a34a' : '#f59e0b'}"></i></div>
    <div class="legend"><span style="--c:#991b1b">Core ${core.toFixed(0)} mL</span><span style="--c:${reperf ? '#16a34a' : '#f59e0b'}">${reperf ? 'Reperfused' : 'Penumbra'} ${pen.toFixed(0)} mL</span></div>
    <div style="font-size:12.5px;margin-top:4px">≈ <b>${(neurons(core) / 1e9).toFixed(2)} billion</b> neurons in the core${!reperf && sim.phase !== 'done' ? ` · growing ~${((neurons(1) * (core < tot ? { good: 2.5, moderate: 6, poor: 16 }[c.collaterals] : 0)) / 60 / 1e6).toFixed(1)} M/min` : ''}</div>
    ${q ? questionHtml() : ''}
    ${sim.decisions.length ? `<h3 style="margin-top:12px">Decisions</h3>${sim.decisions.map((d) => `<div class="dec"><b class="${d.correct === false ? 'bad' : d.correct ? 'ok' : ''}">${d.correct === false ? '✖' : d.correct ? '✔' : '•'} ${esc(d.choice)}</b><br>${esc(d.feedback)}</div>`).join('')}` : ''}`;
  $('#left').querySelectorAll<HTMLButtonElement>('[data-ans]').forEach((b) => b.addEventListener('click', () => manual(() => sim.decide(b.dataset.q!, b.dataset.ans!))));
}

function questionHtml(): string {
  const q = sim.triageCurrent!;
  return `<div class="q" id="question"><p>${esc(q.question)}</p>${q.options.map((o) => `<button data-q="${q.id}" data-ans="${o.id}">${esc(o.label)}</button>`).join('')}</div>`;
}

// --------------------------------------------------------------- controls --
let sig = '';
function controlsSig(): string {
  return [sim.phase, sim.active, !!sim.stent, sim.stentLength, sim.bgcInflated, sim.aspirating, sim.crossed(), sim.passes.length, sim.runs.length, !!pilot].join('|');
}

function renderControls(): void {
  const s = controlsSig();
  if (s === sig) return;
  sig = s;
  const el = $('#controls');
  if (sim.phase === 'triage') {
    el.innerHTML = '<p style="margin:0">Code stroke in progress — answer the decisions in the <b>Patient</b> panel. The clock is running.</p>';
    return;
  }
  if (sim.phase === 'done') {
    el.innerHTML = '<button class="primary" id="show-debrief">Show debrief</button> <button id="again">Try again</button>';
    $('#show-debrief').addEventListener('click', showDebrief);
    $('#again').addEventListener('click', () => newCase(caseId));
    return;
  }
  const dis = pilot ? 'disabled' : '';
  el.innerHTML = `
    <div class="ctl-row"><span class="lbl">Device</span>${(['guide', 'asp', 'micro'] as DeviceId[]).map((d, i) => `<button data-dev="${d}" class="${sim.active === d ? 'on' : ''}" ${dis}>${i + 1} · ${DEV_LABEL[d]}</button>`).join('')}</div>
    <div class="ctl-row"><span class="lbl">Move</span><button class="hold" data-hold="1" ${dis}>▲ Advance (W)</button><button class="hold" data-hold="-1" ${dis}>▼ Retract (S)</button>
      <button data-rot="-30" ${dis}>⟲ (A)</button><span class="dial" id="dial"></span><button data-rot="30" ${dis}>⟳ (D)</button></div>
    <div class="ctl-row"><span class="lbl">Imaging</span><button id="run-btn" ${dis}>💉 Run DSA (R)</button></div>
    <div class="ctl-row"><span class="lbl">Stent</span>${STENT_LENGTHS.map((l) => `<button data-len="${l}" class="${sim.stentLength === l ? 'on' : ''}" ${sim.stent || pilot ? 'disabled' : ''}>${l} mm</button>`).join('')}
      <button id="deploy-btn" ${sim.stent || !sim.crossed() || pilot ? 'disabled' : ''}>Deploy stent retriever</button><button id="wait-btn" ${dis}>⏱ Wait 1 min</button></div>
    <div class="ctl-row"><span class="lbl">Pass</span><button id="bgc-btn" class="${sim.bgcInflated ? 'on' : ''}" ${dis}>${sim.bgcInflated ? 'Deflate' : 'Inflate'} balloon guide</button>
      <button id="asp-btn" class="${sim.aspirating ? 'on' : ''}" ${dis}>Aspiration ${sim.aspirating ? 'ON' : 'off'}</button>
      <button id="ret-btn" class="primary" ${dis}>⤺ Retrieve (pass ${sim.passes.length + 1})</button>
      <button id="finish-btn" class="danger" ${dis}>Finish procedure</button></div>`;
  el.querySelectorAll<HTMLButtonElement>('[data-dev]').forEach((b) => b.addEventListener('click', () => manual(() => (sim.active = b.dataset.dev as DeviceId))));
  el.querySelectorAll<HTMLButtonElement>('[data-rot]').forEach((b) => b.addEventListener('click', () => manual(() => sim.rotate(sim.active, Number(b.dataset.rot)))));
  el.querySelectorAll<HTMLButtonElement>('[data-len]').forEach((b) => b.addEventListener('click', () => manual(() => sim.setStentLength(Number(b.dataset.len)))));
  el.querySelectorAll<HTMLButtonElement>('[data-hold]').forEach((b) => {
    const dir = Number(b.dataset.hold);
    const stop = () => (hold = 0);
    b.addEventListener('pointerdown', (e) => {
      b.setPointerCapture(e.pointerId);
      manual(() => (hold = dir));
    });
    b.addEventListener('pointerup', stop);
    b.addEventListener('pointercancel', stop);
    b.addEventListener('lostpointercapture', stop);
  });
  $('#run-btn').addEventListener('click', () => manual(runDsa));
  $('#deploy-btn').addEventListener('click', () => manual(() => sim.deployStent()));
  $('#wait-btn').addEventListener('click', () => manual(() => sim.wait(1)));
  $('#bgc-btn').addEventListener('click', () => manual(() => sim.setBalloon(!sim.bgcInflated)));
  $('#asp-btn').addEventListener('click', () => manual(() => sim.setAspiration(!sim.aspirating)));
  $('#ret-btn').addEventListener('click', () => manual(() => sim.retrieve()));
  $('#finish-btn').addEventListener('click', () => manual(() => sim.finish()));
}

function runDsa(): void {
  sim.runDsa();
}

// ------------------------------------------------------------ right panel --
function renderRight(): void {
  const runs = sim.runs;
  const lastRun = runs.length - 1;
  if (lastRun !== quizFor && lastRun >= 0 && sim.passes.length) {
    quizFor = lastRun;
    quizAnswer = null;
  }
  const quiz =
    quizFor >= 0 && quizFor === lastRun && sim.passes.length && !pilot
      ? `<div class="quiz" id="quiz"><h3>Grade this run yourself</h3>${
          quizAnswer
            ? `<p class="${quizAnswer.pick === runs[quizAnswer.run].grade ? 'ok' : 'warn'}">${quizAnswer.pick === runs[quizAnswer.run].grade ? '✔ Correct' : `You said ${quizAnswer.pick}; it is`} eTICI ${runs[quizAnswer.run].grade}: ${esc(ETICI_TEXT[runs[quizAnswer.run].grade])} (${Math.round(runs[quizAnswer.run].f * 100)}% of the MCA territory perfused).</p>`
            : `<div class="chips">${ETICI_ORDER.map((g) => `<button data-grade="${g}">${g}</button>`).join('')}</div><p style="font-size:12px;color:var(--muted)">eTICI: share of the target territory reperfused. ≥ 2b50 counts as success.</p>`
        }</div>`
      : '';
  $('#right').innerHTML = `
    <h3>Mentor</h3><p class="mentor">${esc(sim.hint())}</p>
    ${quiz}
    ${sim.passes.length ? `<h3 style="margin-top:10px">Passes</h3>${sim.passes.map((p) => `<div class="dec"><b>Pass ${p.n}</b> · ${p.technique}${p.flowArrest ? ' + flow arrest' : ''} → <b class="${p.outcome.result === 'complete' ? 'ok' : p.outcome.result === 'partial' ? 'warn' : 'bad'}">${p.outcome.result}</b> (eTICI ${p.grade}) <br><span style="color:var(--muted)">${Math.round(p.outcome.odds.complete * 100)}% chance of complete removal: ${esc(p.outcome.odds.why.join('; '))}</span></div>`).join('')}` : ''}
    <h3 style="margin-top:10px">Clot</h3><p style="margin:0;font-size:12.5px">${esc(CLOT_INFO[sim.c.clot.type])}</p>
    <h3 style="margin-top:10px">Event log</h3>
    <div class="log">${[...sim.log].reverse().slice(0, 60).map((l) => `<div class="${l.kind === 'bad' ? 'bad' : l.kind === 'warn' ? 'warn' : l.kind === 'good' ? 'ok' : ''}"><time>${fmt(l.t)}</time>${esc(l.text)}</div>`).join('')}</div>`;
  $('#right').querySelectorAll<HTMLButtonElement>('[data-grade]').forEach((b) => b.addEventListener('click', () => {
    quizAnswer = { pick: b.dataset.grade as ETici, run: quizFor };
    renderRight();
  }));
}

function renderHud(): void {
  if (sim.phase !== 'procedure') {
    $('#hud').innerHTML = sim.phase === 'triage' ? 'CODE STROKE · imaging and decisions' : 'PROCEDURE COMPLETE';
    return;
  }
  const d = sim.dev[sim.active];
  const loc = sim.locate(d.s);
  const j = sim.nextJunction();
  const cl = sim.clotRange();
  const toClot = cl ? cl.from - d.s : null;
  $('#hud').innerHTML = `${DEV_LABEL[sim.active].toUpperCase()} · tip in ${esc(sim.tree.segs[loc.seg].name)} · rotation ${Math.round(d.angle)}°<br>` +
    (j ? (j.into ? `<span class="j">Junction ${j.distance > 0.5 ? `in ${j.distance.toFixed(0)} mm` : 'here'}: ${esc(j.hint)} → will enter: <b>${esc(sim.tree.segs[j.into].name)}</b></span><br>` : `<span class="j">End of the ${esc(sim.tree.segs[j.at].name)} in ${Math.max(0, j.distance).toFixed(0)} mm</span><br>`) : '') +
    (toClot !== null && Math.abs(toClot) < 60 && sim.active !== 'guide' ? `Clot face ${toClot > 0 ? `${toClot.toFixed(1)} mm ahead` : sim.crossed() ? 'crossed ✓' : 'here'}` : '') +
    (sim.stent ? ` · stent embedded ${(sim.t - sim.stent.deployedAt).toFixed(1)} min · covers ${Math.round(sim.coverage() * 100)}%` : '');
  const dial = document.getElementById('dial');
  if (dial) dial.textContent = `${Math.round(d.angle)}°`;
}

// ---------------------------------------------------------------- debrief --
function showDebrief(): void {
  const r = debrief(sim);
  const t = (v: number | null) => (v === null ? '—' : `${Math.round(v)} min`);
  $('#overlay').classList.remove('hidden');
  $('#overlay').innerHTML = `<div class="panel" role="dialog" aria-labelledby="db">
    <h2 id="db">DEBRIEF · ${esc(sim.c.title)}</h2>
    <div class="grid2">
      <div><h3>Reperfusion</h3><div class="big ${r.success ? 'ok' : 'bad'}">eTICI ${r.grade ?? '—'}</div>
        <p style="margin:2px 0">${r.passes} pass${r.passes === 1 ? '' : 'es'}${r.firstPass ? ' · <b class="ok">first-pass effect</b>' : ''}${sim.complications.length ? ` · <span class="warn">${esc(sim.complications.join(', '))}</span>` : ''}</p>
        <p style="margin:2px 0">Score <b>${r.score}</b>/100</p></div>
      <div><h3>Teaching outcome estimate</h3>
        <div class="kv"><b>Final infarct</b><span>${r.infarct.toFixed(0)} mL</span><b>Without thrombectomy</b><span>~${r.untreated.toFixed(0)} mL</span>
        <b>Neurons saved</b><span>≈ ${(r.neuronsSaved / 1e9).toFixed(1)} billion</span>
        <b>Chance of independence (mRS 0–2)</b><span class="${r.pIndep > r.pIndepUntreated ? 'ok' : ''}">${Math.round(r.pIndep * 100)}% vs ${Math.round(r.pIndepUntreated * 100)}%</span>
        <b>Symptomatic haemorrhage risk</b><span>${Math.round(r.sichRisk * 100)}%</span></div></div>
    </div>
    <h3 style="margin-top:14px">Times</h3>
    <table class="times">${r.times.map((x) => `<tr><td>${x.label}</td><td class="${x.ok === false ? 'bad' : x.ok ? 'ok' : ''}">${t(x.value)}</td><td style="color:var(--muted)">${x.target}</td></tr>`).join('')}</table>
    <h3 style="margin-top:14px">Lessons</h3><ul class="lessons">${r.lessons.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>
    <p style="font-size:12px;color:var(--muted)">Evidence named here: HERMES meta-analysis (early window), DAWN and DEFUSE-3 (6–24 h), SELECT2 / ANGEL-ASPECT / RESCUE-Japan LIMIT / TENSION (large core), ASTER and COMPASS (aspiration vs stent retriever), first-pass effect studies, ENCHANTED2/MT and OPTIMAL-BP (do not push SBP too low after reperfusion). The outcome numbers are a simplified teaching model, not a prediction.</p>
    <div style="display:flex;gap:8px;flex-wrap:wrap"><button class="primary" id="db-again">Try this case again</button><button id="db-next">Choose another case</button><button id="db-close">Close</button></div>
  </div>`;
  $('#db-again').addEventListener('click', () => newCase(caseId));
  $('#db-next').addEventListener('click', startScreen);
  $('#db-close').addEventListener('click', () => $('#overlay').classList.add('hidden'));
}

// ------------------------------------------------------------------ input --
let hold = 0;
let fine = false;
function manual(fn: () => void): void {
  if (pilot) stopDemo();
  fn();
  renderAll();
}
function stopDemo(): void {
  pilot = null;
  $('#demobar').classList.add('hidden');
  sig = '';
}

addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).closest('select, input')) return;
  if (!$('#overlay').classList.contains('hidden')) return;
  fine = e.shiftKey;
  const k = e.key.toLowerCase();
  if (sim.phase !== 'procedure') return;
  if (k === 'w' || e.key === 'ArrowUp') manual(() => (hold = 1));
  else if (k === 's' || e.key === 'ArrowDown') manual(() => (hold = -1));
  else if (k === 'a' || e.key === 'ArrowLeft') manual(() => sim.rotate(sim.active, -30));
  else if (k === 'd' || e.key === 'ArrowRight') manual(() => sim.rotate(sim.active, 30));
  else if (k === '1' || k === '2' || k === '3') manual(() => (sim.active = (['guide', 'asp', 'micro'] as DeviceId[])[Number(k) - 1]));
  else if (k === 'r') manual(runDsa);
  else return;
  e.preventDefault();
});
addEventListener('keyup', (e) => {
  fine = e.shiftKey;
  if (['w', 's', 'arrowup', 'arrowdown'].includes(e.key.toLowerCase())) hold = 0;
});
addEventListener('blur', () => (hold = 0));

document.querySelectorAll<HTMLButtonElement>('[data-cam]').forEach((b) =>
  b.addEventListener('click', () => {
    const m = b.dataset.cam;
    if (m === 'follow') world.follow = true;
    else if (m === 'overview') world.overview();
    else world.brainView();
  }),
);
document.querySelectorAll<HTMLButtonElement>('[data-proj]').forEach((b) =>
  b.addEventListener('click', () => {
    dsa.view = b.dataset.proj as Projection;
    document.querySelectorAll('[data-proj]').forEach((x) => x.classList.toggle('on', x === b));
  }),
);
const sel = $('#case-select') as HTMLSelectElement;
sel.innerHTML = CASES.map((c) => `<option value="${c.id}">${esc(c.title)}</option>`).join('');
sel.addEventListener('change', () => newCase(sel.value));
$('#restart-btn').addEventListener('click', () => newCase(caseId));
$('#demo-btn').addEventListener('click', () => newCase(caseId, true));

function renderAll(): void {
  renderLeft();
  renderControls();
  renderRight();
  renderHud();
}

// ------------------------------------------------------------------- loop --
let last = performance.now();
let uiT = 0;
let lastLog = 0;
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (hold && sim.phase === 'procedure') sim.move(sim.active, hold * SPEED[sim.active] * (fine ? 0.25 : 1) * dt);
  if (pilot) {
    pilot.update(dt);
    $('#demobar').classList.remove('hidden');
    const html = `<div class="t-head"><span class="badge">DEMO</span><strong>${esc(sim.c.title)}</strong><button id="demo-stop">Take over ✕</button></div><div style="margin-top:6px">${esc(pilot.narration)}</div>`;
    if ($('#demobar').dataset.n !== pilot.narration) {
      $('#demobar').dataset.n = pilot.narration;
      $('#demobar').innerHTML = html;
      $('#demo-stop').addEventListener('click', () => {
        stopDemo();
        renderAll();
      });
    }
    if (pilot.done) stopDemo();
  }
  world.update(dt);
  dsa.update(dt);
  uiT += dt;
  if (uiT > 0.12 || sim.log.length !== lastLog) {
    uiT = 0;
    lastLog = sim.log.length;
    renderLeftLight();
    renderControls();
    renderHud();
    if (sim.phase === 'done' && !shownDebrief) {
      shownDebrief = true;
      renderAll();
      setTimeout(showDebrief, 1200);
    }
  }
  requestAnimationFrame(frame);
}

/** Re-render panels only when something visible changed (keeps buttons clickable). */
let leftSig = '';
let rightSig = '';
function renderLeftLight(): void {
  const l = [sim.phase, sim.triageStep, Math.round(sim.t * 10), Math.round(sim.core), sim.reperfusedAt].join('|');
  if (l !== leftSig) {
    leftSig = l;
    renderLeft();
  }
  const r = [sim.log.length, sim.passes.length, sim.runs.length, quizAnswer?.pick, sim.hint(), !!pilot].join('|');
  if (r !== rightSig) {
    rightSig = r;
    renderRight();
  }
}

sim.beginTriage();
renderAll();
startScreen();
requestAnimationFrame(frame);

(window as unknown as Record<string, unknown>).__stroke = {
  get sim() {
    return sim;
  },
  get pilot() {
    return pilot;
  },
  newCase,
};
