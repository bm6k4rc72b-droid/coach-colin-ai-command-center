/**
 * VIGIL — the console. Views, the simulated memory-care wing, the response ladder,
 * the AI concierge, the enterprise build sheet and the business calculator.
 *
 * Simulated residents throughout; the optional camera mode runs the shared
 * vision-kit pipeline (COCO-SSD → ByteTrack → FallWatch) entirely in the tab.
 */
import { MEDIA } from './media.js';
import { totals, schedule, money, unitEconomics, LADDER, ladderAt, pose, poseBox, BONES, rng } from './core.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const now = () => performance.now() / 1000;
const hhmm = (d = new Date()) => d.toTimeString().slice(0, 5);

// ───────────────────────────────────────────── data (fictional)
const SITES = [
  { name: 'Willow Crest', kind: 'Memory care · Santa Barbara', n: 96 },
  { name: 'The Ashford', kind: 'Assisted living · Montecito', n: 112 },
  { name: 'Larkspur House', kind: 'Skilled nursing · Ventura', n: 88 },
  { name: 'Cypress Point Residences', kind: 'Assisted living · Carmel', n: 104 },
  { name: 'Halcyon Gardens', kind: 'Memory care · San Luis Obispo', n: 72 },
  { name: 'Marisol Terrace', kind: 'Independent living · Pismo Beach', n: 68 },
  { name: 'VIGIL at Home', kind: '250 private residences · Central Coast', n: 250 },
];
const RESIDENTS = [
  { id: 'MH', name: 'Margaret Hale', age: 86, room: 'Suite 214 · Willow Crest', risk: 'high', gait: 0.71, sleep: 6.1, steps: 1840, brief: 'Up three times after midnight, longer bathroom visits than her usual. Gait speed down 9% over ten days. Worth a urine screen and a hydration check today.' },
  { id: 'RA', name: 'Robert Alvarez', age: 81, room: 'Suite 216 · Willow Crest', risk: 'mod', gait: 0.88, sleep: 7.4, steps: 3920, brief: 'Steady week. Walked the garden loop twice daily. Bed-exit at 05:40 most mornings — his normal.' },
  { id: 'EV', name: 'Eleanor Voss', age: 92, room: 'Suite 220 · Willow Crest', risk: 'high', gait: 0.58, sleep: 8.9, steps: 760, brief: 'Sleeping 1.6 h more than her baseline and fewer steps. Low mood flagged by the evening check-in. Suggest a nurse visit and a call from her son.' },
  { id: 'JO', name: 'James Okafor', age: 78, room: 'Home · Arroyo Grande', risk: 'low', gait: 1.02, sleep: 7.2, steps: 6210, brief: 'Independent and active. Kitchen activity at regular meal times. No alerts in 41 days.' },
  { id: 'DL', name: 'Dorothy Lin', age: 88, room: 'Suite 108 · The Ashford', risk: 'mod', gait: 0.79, sleep: 6.8, steps: 2650, brief: 'New walker since Tuesday; turning near the bed is the riskiest moment. Bed-exit alert stays on overnight.' },
  { id: 'WC', name: 'Walter Cruz', age: 84, room: 'Home · Lompoc', risk: 'mod', gait: 0.83, sleep: 7.0, steps: 3100, brief: 'Bathroom radar shows two long visits this week (> 25 min). Both resolved on voice check-in.' },
];
const ROOMS = [
  { id: 214, who: 'Margaret H.', r: { x: 0.42, y: 0.86, phase: 0 } },
  { id: 216, who: 'Robert A.', r: { x: 0.55, y: 0.84, phase: 2 } },
  { id: 218, who: 'Vacant · cleaning', r: null },
  { id: 220, who: 'Eleanor V.', r: { x: 0.36, y: 0.88, phase: 4, seated: true } },
];

const state = { view: 'overview', privacy: 'skeleton', drill: null, feed: [], catalog: null, res: 0, call: null };

// ───────────────────────────────────────────── shell
function go(view) {
  state.view = view;
  document.body.dataset.view = view;
  $$('#nav button').forEach((b) => b.classList.toggle('on', b.dataset.view === view));
  $$('.view').forEach((v) => (v.hidden = v.id !== `view-${view}`));
  window.scrollTo({ top: 0, behavior: 'smooth' });
  try { localStorage.setItem('vigil.view', view); } catch {}
}
$$('#nav button').forEach((b) => b.addEventListener('click', () => go(b.dataset.view)));
document.addEventListener('click', (e) => { const g = e.target.closest('[data-go]'); if (g) go(g.dataset.go); });

$('#intro-bg').style.backgroundImage = `url(${MEDIA.residence})`;
$('#hero').style.backgroundImage = `url(${MEDIA.residence})`;
$('#enter').addEventListener('click', () => {
  $('#intro').classList.add('out');
  $('#shell').hidden = false;
  let v = 'overview';
  try { v = localStorage.getItem('vigil.view') || v; } catch {}
  go(v);
  setTimeout(() => $('#intro').remove(), 900);
});

setInterval(() => ($('#clock').textContent = hhmm()), 1000);
$('#clock').textContent = hhmm();

function log(text, lvl = '') {
  state.feed.unshift({ t: hhmm(), text, lvl });
  state.feed = state.feed.slice(0, 40);
  $('#feed').innerHTML = state.feed.map((f) => `<li class="${f.lvl}"><time>${f.t}</time><span>${f.text}</span></li>`).join('');
  $('#feed-count').textContent = `${state.feed.length} events`;
}

function toast(title, body, ms = 6000) {
  const t = $('#toast');
  t.innerHTML = `<b>${esc(title)}</b>${esc(body)}`;
  t.hidden = false;
  clearTimeout(toast.h);
  toast.h = setTimeout(() => (t.hidden = true), ms);
}

// ───────────────────────────────────────────── overview
function renderOverview() {
  const k = [
    ['790', 'Residents protected'], ['2.8 s', 'Median time to alert'], ['3 m 12 s', 'Median to bedside'], ['0.4', 'False alarms / room / wk'],
  ];
  $('#kpis').innerHTML = k.map(([b, s]) => `<div class="kpi"><b>${b}</b><span>${s}</span></div>`).join('');
  renderSites();
  const film = $('#film');
  if (MEDIA.film) film.innerHTML = `<video src="${MEDIA.film}" poster="${MEDIA.ad}" controls playsinline loop></video>`;
  else film.innerHTML = `<img src="${MEDIA.ad}" alt="VIGIL print advertisement" />`;
  [
    ['Night rounds verified by radar · Halcyon Gardens, all 72 suites', 'good'],
    ['Bed-exit predicted 3 min early · Dorothy L., caregiver arrived first', 'good'],
    ['Bathroom stay 26 min · Walter C. answered voice check-in: “just slow tonight”', ''],
    ['AI verifier suppressed 2 false alarms (laundry pile, yoga mat) · logged for audit', ''],
  ].reverse().forEach(([t, l]) => log(t, l));
}
function renderSites(alertSite = null) {
  $('#sites').innerHTML = SITES.map((s) => `<div class="site"><div><b>${s.name}</b><small>${s.kind}</small></div><span class="n">${s.n}</span><span class="dot ${alertSite === s.name ? 'warn' : ''}"></span></div>`).join('');
}

// ───────────────────────────────────────────── live watch (simulated wing)
const roomEls = ROOMS.map((room) => {
  const el = document.createElement('div');
  el.className = 'room';
  el.innerHTML = `<canvas></canvas><div class="lbl">Suite <b>${room.id}</b> · ${room.who}</div><div class="st">${room.r ? 'Steady' : 'Empty'}</div>`;
  $('#rooms').appendChild(el);
  return { room, el, cv: $('canvas', el), st: $('.st', el) };
});
const suiteImg = new Image();
suiteImg.crossOrigin = 'anonymous';
suiteImg.src = MEDIA.suite;

$$('#privacy button').forEach((b) => b.addEventListener('click', () => {
  state.privacy = b.dataset.p;
  $$('#privacy button').forEach((x) => x.classList.toggle('on', x === b));
}));

function drawRoom(R, t) {
  const { cv, room } = R;
  const w = cv.clientWidth, h = cv.clientHeight;
  if (!w) return;
  const dpr = Math.min(2, devicePixelRatio || 1);
  if (cv.width !== Math.round(w * dpr)) { cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  // background: the suite, darkened; radar mode shows only a grid
  if (state.privacy !== 'radar' && suiteImg.complete && suiteImg.naturalWidth) {
    g.globalAlpha = 0.42;
    const ox = (room.id % 3) * 0.08 * w;
    g.drawImage(suiteImg, -ox, 0, w * 1.25, h * 1.1);
    g.globalAlpha = 1;
  } else {
    g.fillStyle = '#0b0a09'; g.fillRect(0, 0, w, h);
  }
  if (state.privacy === 'radar') {
    g.strokeStyle = 'rgba(201,169,110,0.12)';
    for (let i = 1; i < 8; i++) { g.beginPath(); g.arc(w / 2, h, (i * h) / 6, Math.PI, 0); g.stroke(); }
    const sweep = (t * 0.9) % Math.PI;
    g.strokeStyle = 'rgba(201,169,110,0.5)';
    g.beginPath(); g.moveTo(w / 2, h); g.lineTo(w / 2 - Math.cos(sweep) * h * 1.2, h - Math.sin(sweep) * h * 1.2); g.stroke();
  }
  // a soft vignette
  const vg = g.createRadialGradient(w / 2, h / 2, h * 0.2, w / 2, h / 2, w * 0.7);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.65)');
  g.fillStyle = vg; g.fillRect(0, 0, w, h);

  if (!room.r) return;
  const r = { ...room.r };
  const D = state.drill;
  if (D && D.room === room.id) r.fallAt = D.fallAt;
  const p = pose(r, t);
  const X = (q) => q[0] * w, Y = (q) => q[1] * h;
  const alert = p.fall > 0;
  const col = p.fall >= 1 ? '#e07a6a' : alert ? '#f0b48a' : '#e8d3a6';

  if (state.privacy === 'radar') {
    const [bx, by, bw, bh] = poseBox(p.kp);
    g.fillStyle = alert ? 'rgba(224,122,106,0.55)' : 'rgba(232,211,166,0.45)';
    g.beginPath(); g.ellipse((bx + bw / 2) * w, (by + bh / 2) * h, Math.max(14, bw * w * 0.7), Math.max(14, bh * h * 0.35), 0, 0, Math.PI * 2); g.fill();
  } else if (state.privacy === 'silhouette') {
    g.strokeStyle = alert ? 'rgba(224,122,106,0.85)' : 'rgba(232,211,166,0.8)';
    g.lineCap = 'round'; g.lineWidth = Math.max(10, h * 0.055);
    for (const [a, b] of BONES) { g.beginPath(); g.moveTo(X(p.kp[a]), Y(p.kp[a])); g.lineTo(X(p.kp[b]), Y(p.kp[b])); g.stroke(); }
    g.fillStyle = g.strokeStyle; g.beginPath(); g.arc(X(p.kp.head), Y(p.kp.head), h * 0.04, 0, Math.PI * 2); g.fill();
  } else {
    g.shadowColor = col; g.shadowBlur = 12;
    g.strokeStyle = col; g.lineWidth = 2; g.lineCap = 'round';
    for (const [a, b] of BONES) { g.beginPath(); g.moveTo(X(p.kp[a]), Y(p.kp[a])); g.lineTo(X(p.kp[b]), Y(p.kp[b])); g.stroke(); }
    g.fillStyle = col;
    for (const q of Object.values(p.kp)) { g.beginPath(); g.arc(X(q), Y(q), 2.6, 0, Math.PI * 2); g.fill(); }
    g.beginPath(); g.arc(X(p.kp.head), Y(p.kp.head), h * 0.028, 0, Math.PI * 2); g.lineWidth = 1.5; g.stroke();
    g.shadowBlur = 0;
  }
  // halo ring at the feet
  g.strokeStyle = alert ? 'rgba(224,122,106,0.7)' : 'rgba(201,169,110,0.35)';
  g.lineWidth = 1;
  const fx = (p.kp.lan[0] + p.kp.ran[0]) / 2 * w, fy = Math.max(p.kp.lan[1], p.kp.ran[1]) * h;
  const pulse = alert ? 1 + 0.25 * Math.sin(t * 8) : 1;
  g.beginPath(); g.ellipse(fx, fy, 34 * pulse, 9 * pulse, 0, 0, Math.PI * 2); g.stroke();

  R.st.textContent = alert ? (p.fall >= 1 ? 'FALL · on floor' : 'Falling') : r.seated ? 'Seated' : 'Walking · steady';
  R.el.classList.toggle('alert', p.fall >= 1);
}

function loop() {
  const t = now();
  if (state.view === 'watch') roomEls.forEach((R) => drawRoom(R, t));
  tickDrill(t);
  requestAnimationFrame(loop);
}

// ───────────────────────────────────────────── the drill → ladder → concierge → report
$('#drill').addEventListener('click', startDrill);
function startDrill() {
  if (state.drill && !state.drill.closed) return;
  const t = now();
  state.drill = { room: 214, start: t, fallAt: t + 1.2, detected: null, ack: null, fired: new Set(), closed: false };
  log('Drill started · Suite 214, Margaret H.', '');
  $('#drill').disabled = true;
}
function tickDrill(t) {
  const D = state.drill;
  if (!D || D.closed) return;
  // edge AI confirms 1.5 s after the body is down (as FallWatch confirmSec)
  if (D.detected === null && t >= D.fallAt + 0.7 + 1.5) {
    D.detected = t;
    document.body.classList.add('alarm');
    $('#status').textContent = 'Fall · Suite 214';
    renderSites('Willow Crest');
    toast('Fall detected · Suite 214', 'Margaret Hale is on the floor beside the armchair. Nearest caregiver paged. Open Response to follow the ladder.');
    $('#ack').disabled = false;
    $('#inc-title').textContent = 'Fall · Suite 214 · Margaret Hale';
    log('<b>Fall detected</b> · Suite 214 · posture: on floor · confidence 0.97', 'bad');
    playCall(true);
  }
  if (D.detected !== null) {
    const el = t - D.detected;
    const sim = el * 12; // the demo clock runs 12× so the whole ladder is visible in ~30 s
    for (const step of LADDER) {
      if (!D.fired.has(step.at) && step.at <= sim && (D.ack === null || step.at <= D.ackSim)) {
        D.fired.add(step.at);
        if (step.at > 0) log(`${step.who} · ${step.what}`, step.at >= 60 ? 'bad' : '');
      }
    }
    const ackSim = D.ack === null ? Infinity : D.ackSim;
    const shown = Math.min(sim, ackSim === Infinity ? sim : ackSim);
    $('#inc-timer').textContent = `${String(Math.floor(shown / 60)).padStart(2, '0')}:${String(Math.floor(shown % 60)).padStart(2, '0')}`;
    renderLadder(sim, ackSim);
    if (D.ack === null && sim > 300) acknowledge(true);
  }
}
function renderLadder(t = -1, ack = Infinity) {
  const steps = t < 0 ? LADDER.map((s) => ({ ...s, state: 'waiting' })) : ladderAt(t, ack);
  $('#ladder').innerHTML = steps.map((s) => `<li class="${s.state}"><span class="t">+${s.at < 60 ? s.at + 's' : s.at / 60 + 'm'}</span><div><b>${s.who}</b><small>${s.what}${s.state === 'skipped' ? ' · not needed' : ''}</small></div></li>`).join('');
}
$('#ack').addEventListener('click', () => acknowledge(false));
function acknowledge(auto) {
  const D = state.drill;
  if (!D || D.detected === null || D.ack !== null) return;
  D.ack = now();
  D.ackSim = (D.ack - D.detected) * 12;
  $('#ack').disabled = true;
  const mm = Math.floor(D.ackSim / 60), ss = Math.round(D.ackSim % 60);
  log(auto ? '911 dispatched · no responder acknowledged' : `<b>Acknowledged</b> by Ana R. (CNA) at +${mm}m ${ss}s · on the way`, auto ? 'bad' : 'good');
  setTimeout(() => {
    log('<b>On scene</b> · resident seated, no visible injury · daughter notified by video call', 'good');
    document.body.classList.remove('alarm');
    $('#status').textContent = 'All residents accounted for';
    renderSites();
    D.closed = true;
    state.drill.fallAt = null;
    $('#drill').disabled = false;
    $('#report').textContent = draftReport(D, mm, ss);
    toast('Resolved · Suite 214', 'Incident report drafted by AI and waiting for the nurse\'s signature in AI Concierge.', 5000);
    state.drill = null;
  }, 2500);
}

function draftReport(D, mm, ss) {
  const d = new Date();
  return `INCIDENT REPORT — UNWITNESSED FALL (AI DRAFT · REQUIRES RN REVIEW)
Facility        Willow Crest Memory Care · Suite 214
Resident        Margaret Hale, 86 · fall-risk HIGH (score 78)
Date / time     ${d.toLocaleDateString()} ${hhmm(d)}

TIMELINE (from VIGIL event log)
  +0.0 s   Edge AI: rapid vertical drop, floor posture held 1.5 s
  +0.2 s   AI verifier: "person lying on rug beside armchair" (0.97)
  +0.3 s   Caregiver Ana R. paged (critical push + badge)
  +0.5 s   Voice concierge check-in started; resident responded
  +${mm}m ${ss}s  Acknowledged by Ana R.; on scene shortly after

RESIDENT RESPONSE (voice check-in transcript)
  Alert and oriented, reported "my knee gave out", denied head strike,
  pain 3/10 left knee.

ACTIONS
  Assisted from floor with gait belt after RN assessment.
  Vitals within normal limits. Neuro checks q15m x 4 ordered.
  Daughter (primary contact) notified via VIGIL family app video call.

CONTRIBUTING FACTORS (AI-suggested, verify)
  Gait speed down 9% over 10 days; 3 night-time bathroom trips;
  possible UTI / dehydration — see daily baseline.

FOLLOW-UP
  [ ] Physician notified   [ ] Care plan updated   [ ] PT referral
  [ ] State report if injury confirmed within 24 h

Prepared by VIGIL AI · Reviewed by: ____________ RN   Signature: ________`;
}

// ───────────────────────────────────────────── concierge
const SCRIPT = [
  ['sys', 'Fall confirmed · in-room speaker · Suite 214'],
  ['ai', 'Margaret, it\'s VIGIL. I noticed you may have fallen. Are you alright?'],
  ['res', 'Oh… I\'m on the floor. My knee just went.'],
  ['ai', 'Thank you for telling me. Please stay where you are. Ana is on her way right now. Did you hit your head?'],
  ['res', 'No, no. Just my knee.'],
  ['ai', 'Good. On a scale of one to ten, how much does it hurt?'],
  ['res', 'Maybe a three.'],
  ['ai', 'Okay. Ana is coming down the corridor now. Would you like me to call Sarah for you?'],
  ['res', 'Yes please, call my daughter.'],
  ['sys', 'Caregiver on scene · family video call connected'],
];
$('#call').addEventListener('click', () => playCall(false));
function playCall(fromDrill) {
  clearInterval(state.call);
  const chat = $('#chat');
  chat.innerHTML = '';
  $('#call-state').textContent = 'live';
  let i = 0;
  state.call = setInterval(() => {
    if (i >= SCRIPT.length) { clearInterval(state.call); $('#call-state').textContent = fromDrill ? 'logged' : 'complete'; return; }
    const [who, text] = SCRIPT[i++];
    const m = document.createElement('div');
    m.className = `msg ${who}`;
    m.textContent = text;
    chat.appendChild(m);
  }, 1500);
}

// ───────────────────────────────────────────── residents
function spark(seed, trend) {
  const r = rng(seed);
  const pts = Array.from({ length: 14 }, (_, i) => 0.5 + trend * (i / 13 - 0.5) + (r() - 0.5) * 0.25);
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${(i / 13) * 100},${36 - v * 32}`).join(' ');
  return `<svg viewBox="0 0 100 36" preserveAspectRatio="none"><path d="${d}" fill="none" stroke="#c9a96e" stroke-width="1.5" vector-effect="non-scaling-stroke"/></svg>`;
}
function renderResidents() {
  $('#res-list').innerHTML = RESIDENTS.map((r, i) => `<li data-i="${i}" class="${i === state.res ? 'on' : ''}"><span class="mono-av">${r.id}</span><div>${r.name}<small>${r.room}</small></div><span class="risk ${r.risk}">${{ low: 'LOW', mod: 'MOD', high: 'HIGH' }[r.risk]}</span></li>`).join('');
  $$('#res-list li').forEach((li) => li.addEventListener('click', () => { state.res = +li.dataset.i; renderResidents(); }));
  const r = RESIDENTS[state.res];
  const tr = r.risk === 'high' ? -0.5 : r.risk === 'mod' ? -0.1 : 0.2;
  $('#res-detail').innerHTML = `
    <p class="eyebrow">${r.room}</p><h3>${r.name}, ${r.age}</h3>
    <div class="metrics">
      <div class="metric"><span>Gait speed</span><b>${r.gait.toFixed(2)} m/s</b>${spark(r.age, tr)}</div>
      <div class="metric"><span>Sleep</span><b>${r.sleep} h</b>${spark(r.age + 3, tr * -0.6)}</div>
      <div class="metric"><span>Daily steps</span><b>${r.steps.toLocaleString()}</b>${spark(r.age + 7, tr)}</div>
    </div>
    <p class="eyebrow">AI daily brief</p>
    <p class="brief">${r.brief}</p>
    <p class="muted small">Written by the AI from activity, radar and wearable data, never from video. Consent on file: resident + family POA, skeleton-only vision.</p>`;
}

// ───────────────────────────────────────────── response chart
function renderResponse() {
  const data = [['Willow Crest', 2.9], ['The Ashford', 3.4], ['Larkspur House', 4.1], ['Cypress Point', 3.1], ['Halcyon Gardens', 2.6], ['Marisol Terrace', 3.8], ['At home (family + EMS)', 7.9]];
  const max = 8;
  $('#resp-chart').innerHTML = data.map(([n, v]) => `<div class="bar"><span>${n}</span><div class="track"><div class="fill" style="width:${(v / max) * 100}%"></div></div><span>${v.toFixed(1)}m</span></div>`).join('');
  renderLadder();
}

// ───────────────────────────────────────────── enterprise quote
async function renderEnterprise() {
  const cat = await (await fetch('data/catalog.json')).json();
  state.catalog = cat;
  const T = totals(cat);
  const S = schedule(T.total);
  $('#cat-sub').textContent = `${cat.title} ${cat.client}. Tap any line for the tech, the AI and the open-source repos behind it.`;
  let html = '';
  cat.sections.forEach((s, si) => {
    html += `<div class="q-sec"><span>${s.name}</span><span>${money(T.sections[si].total)}</span></div>`;
    for (const it of s.items) {
      const repos = it.repos.length
        ? it.repos.map((r) => { const slug = r.split(' ')[0]; const hf = r.includes('(HF)'); return `<a class="repo" target="_blank" rel="noopener" href="${hf ? 'https://huggingface.co/' : 'https://github.com/'}${slug}">${esc(slug)}</a>`; }).join('')
        : '<span class="muted">Service / operations line</span>';
      html += `<div class="q-item"><div class="q-row"><span>${esc(it.name)}</span><span class="p">${money(it.price)}</span><span class="chev">›</span></div>
        <div class="q-body"><p class="what">${esc(it.what)}</p>
          <div><h4>Tech</h4><p>${esc(it.tech)}</p></div>
          <div><h4>AI</h4><p>${esc(it.ai)}</p></div>
          <div><h4>GitHub</h4><p>${repos}</p></div></div></div>`;
    }
  });
  html += `<div class="q-total"><span>Total for 12 months</span><span>${money(T.total)}</span></div>
    <p class="q-pay">Paid monthly at ${money(S.monthly)} (first payment ${money(S.first)})</p>`;
  $('#quote').innerHTML = html;
  $$('.q-row').forEach((r) => r.addEventListener('click', () => r.parentElement.classList.toggle('open')));
}

// ───────────────────────────────────────────── business
const CALC = [
  ['beds', 'Facility beds under contract', 0, 3000, 540, 10],
  ['bedPrice', 'Price per bed / month ($)', 20, 120, 59, 1],
  ['homes', 'At-home subscribers', 0, 3000, 250, 10],
  ['homePrice', 'At-home plan / month ($)', 49, 399, 189, 5],
];
function renderBusiness() {
  const vals = Object.fromEntries(CALC.map(([k, , , , v]) => [k, v]));
  $('#calc').innerHTML = `<div class="card-head"><h3>Revenue model</h3><span class="tag">drag</span></div>` +
    CALC.map(([k, label, min, max, v, step]) => `<label>${label}<output id="o-${k}">${v.toLocaleString()}</output><input type="range" id="i-${k}" min="${min}" max="${max}" step="${step}" value="${v}"></label>`).join('');
  const update = () => {
    for (const [k] of CALC) { vals[k] = +$(`#i-${k}`).value; $(`#o-${k}`).textContent = vals[k].toLocaleString(); }
    const e = unitEconomics({ ...vals, bedCost: 14, homeCost: 41, kitPrice: 699, kitCost: 310 });
    $('#econ').innerHTML = [
      ['Monthly recurring', money(e.mrr, 0)], ['Annual recurring', money(e.arr, 0)],
      ['Gross margin', `${Math.round(e.grossMargin * 100)}%`], ['Year-one gross profit', money(e.yearOneGross, 0)],
    ].map(([s, b]) => `<div><span>${s}</span><b>${b}</b></div>`).join('') +
      `<p class="muted small" style="grid-column:1/-1">Assumes $14/bed and $41/home monthly cost to serve (cloud, AI, radar/camera amortisation, monitoring staff share) and a $699 at-home kit that costs $310 to build.</p>`;
  };
  CALC.forEach(([k]) => $(`#i-${k}`).addEventListener('input', update));
  update();
  $('#playbook').innerHTML = PLAYBOOK;
}
const PLAYBOOK = `
<h3>Who pays</h3>
<ul>
<li><strong>Care communities</strong> (assisted living, memory care, skilled nursing): per-bed SaaS, 3-year terms, plus the one-off build/integration fee on the build sheet for large operators. Sell on fewer falls with injury, lower liability premiums, fewer night-check staff hours and better state-survey results.</li>
<li><strong>Home-care agencies</strong>: white-label VIGIL to their clients; they bill families and get remote eyes between visits.</li>
<li><strong>Families direct</strong>: $699 kit + monthly plan (self-monitored, or 24/7 concierge response on the top tier).</li>
<li><strong>Payers</strong>: Medicaid waiver programs and some Medicare Advantage plans cover personal emergency response; long-term-care insurers reward documented fall prevention.</li>
</ul>
<h3>What you must get right</h3>
<ul>
<li><strong>Consent and state law.</strong> Many states regulate cameras in resident rooms (e.g. Texas, Illinois, Oklahoma, Washington, Virginia): written consent from the resident or legal representative and any roommate, posted notice, and rules on who sees footage. Radar-only in bathrooms; skeleton-only by default; no facial recognition.</li>
<li><strong>HIPAA.</strong> You are a business associate: sign BAAs, host on HIPAA-eligible cloud with a BAA, encrypt everything, keep audit logs, and run a risk assessment. Aim for SOC 2 Type II by month 12; enterprise buyers will ask.</li>
<li><strong>Not a medical device — say so.</strong> Market as safety and wellness monitoring that alerts people, not as diagnosis. Get a regulatory attorney to review claims before launch; avoid words like "diagnose" or "prevent falls" without evidence.</li>
<li><strong>Measured accuracy.</strong> Publish recall, false alarms per room-week and time-to-alert from your own pilots. Staff stop trusting a system that cries wolf, which is why the AI verifier line exists.</li>
<li><strong>Insurance.</strong> Tech E&amp;O, cyber liability and general liability before the first install.</li>
</ul>
<h3>The first 120 days</h3>
<ul>
<li><strong>Days 0-30</strong> · Form the LLC, insurance, BAA templates. Stand up the edge box with Frigate + YOLO-pose + radar in one model suite. Recruit 1 friendly community for a free 10-room pilot.</li>
<li><strong>Days 30-60</strong> · Pilot live with consent packs. Label every event. Tune thresholds until false alarms &lt; 1/room/week. Ship the caregiver app.</li>
<li><strong>Days 60-90</strong> · Turn pilot numbers into a case study (time-to-bedside, falls with injury, night-round hours saved). Launch at-home kit to 25 families.</li>
<li><strong>Days 90-120</strong> · Sell to regional operators (5-20 communities) at state assisted-living association events; partner with 2 home-care agencies.</li>
</ul>
<h3>Team</h3>
<ul>
<li>You (sales, brand, operator relationships) · 1 full-stack engineer · 1 ML/edge engineer · 1 installer/field tech · a clinical advisor (RN, director of nursing) · a part-time compliance lead. A 24/7 response desk can be outsourced to a UL-listed monitoring center at first.</li>
</ul>`;

// ───────────────────────────────────────────── optional: the viewer's own camera
let cam = null;
$('#camera-btn').addEventListener('click', async () => {
  if (cam) return;
  $('#cam-card').hidden = false;
  const stateEl = $('#cam-state');
  try {
    const [{ Detector, openCamera }, { ByteTracker, FallWatch }] = await Promise.all([
      import('../../vision-kit/detector.js'), import('../../vision-kit/bytetrack.js'),
    ]);
    cam = { det: new Detector(), trk: new ByteTracker({ minHits: 2 }), fall: new FallWatch({ fps: 10, confirmSec: 1.5, stillSec: 30 }) };
    await cam.det.load('webgl', (m) => (stateEl.textContent = m.split('·')[0].trim()));
    const v = $('#cam');
    cam.stream = await openCamera(v, 'user');
    stateEl.textContent = `live · ${cam.det.backend}`;
    const cv = $('#cam-canvas');
    const run = async () => {
      if (!cam) return;
      cv.width = v.videoWidth; cv.height = v.videoHeight;
      const dets = (await cam.det.detect(v, 10, 0.4)).filter((d) => d.cls === 'person');
      const tracks = cam.trk.update(dets);
      for (const ev of cam.fall.update(tracks, now())) {
        if (ev.type === 'fall') { toast('Fall detected · your camera', `Track ${ev.id} is lying down. In production this pages the nearest caregiver.`); log(`<b>Fall</b> · camera demo · track ${ev.id}`, 'bad'); }
        if (ev.type === 'recovered') log(`Recovered · camera demo · track ${ev.id}`, 'good');
      }
      const g = cv.getContext('2d');
      g.clearRect(0, 0, cv.width, cv.height);
      for (const tr of tracks) {
        const fallen = cam.fall.state.get(tr.id)?.fallen;
        const [x, y, w, h] = tr.box;
        g.strokeStyle = fallen ? '#e07a6a' : '#e8d3a6'; g.lineWidth = 2;
        g.strokeRect(x, y, w, h);
        g.fillStyle = g.strokeStyle; g.font = '14px JetBrains Mono, monospace';
        g.fillText(`ID ${tr.id}${fallen ? ' · FALL' : ''}`, x + 6, y + 18);
      }
      setTimeout(run, 100);
    };
    run();
  } catch (e) {
    stateEl.textContent = 'unavailable';
    $('#watch-note').textContent = `Camera demo could not start: ${e.message}`;
    cam = null;
  }
});

// ───────────────────────────────────────────── boot
renderOverview();
renderResidents();
renderResponse();
renderEnterprise();
renderBusiness();
requestAnimationFrame(loop);
