import * as THREE from 'three';
import { buildHome } from './sim/home.js';
import { HAZARDS, hazardIndex, routeRisk, CHECKLIST, steadi, fallPhysics, SCAMS } from './sim/model.js';
import { i18n } from './core/i18n.js';
import { sfx } from './core/audio.js';

// ─────────────────────────────────────────────────────────────────────────────
// GUARDIAN · the app: tabs, home walk-through, balance check, scam trainer, care.
// ─────────────────────────────────────────────────────────────────────────────

const $ = (s) => document.querySelector(s);
const H0 = hazardIndex(new Set());
const lerpColor = (r) => new THREE.Color().setHSL(0.36 * (1 - Math.min(1, r)), 0.95, 0.55);

export class Guardian {
  constructor(app) {
    this.app = app;
    this.home = buildHome();
    this.camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.1, 200);
    this.cam = { yaw: 0.55, pitch: 0.95, r: 17, target: new THREE.Vector3(0, 0, 0.3), goal: { yaw: 0.55, pitch: 0.95, r: 17, t: new THREE.Vector3(0, 0, 0.3) }, drag: null };
    this.fixed = new Set();
    this.tab = 'home'; this.sel = null;
    this.walk = null; this.night = 0;
    this.bal = { answers: {}, age: 78, sex: 'f', tug: null, chair: null, tandem: null, timers: {} };
    this.scam = { i: 0, answered: false, choice: null, found: new Set(), results: [] };
    this.care = { meds: { am: 'taken', noon: 'due', pm: 'due', night: 'due' }, checkin: null };
    this.ray = new THREE.Raycaster(); this.ndc = new THREE.Vector2();
    this.pickables = this.home.markers.map((m) => m.hit);
    app.stage.use(this.home.scene, this.camera);
    this.updateRoute();
  }

  // ── Tabs ───────────────────────────────────────────
  setTab(t) {
    this.tab = t; sfx.select();
    document.querySelectorAll('#tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
    document.body.dataset.tab = t;
    this.closeDetail();
    this.render();
    const G = this.cam.goal;
    if (t === 'home') Object.assign(G, { pitch: 0.95, r: 17 }), G.t.set(0, 0, 0.3);
    else Object.assign(G, { pitch: 0.55, r: 22 }), G.t.set(0, 0, 0);
  }
  render() {
    if (this.tab === 'home') this.renderHome();
    if (this.tab === 'balance') this.renderBalance();
    if (this.tab === 'scams') this.renderScam();
    if (this.tab === 'care') this.renderCare();
    this.updateIndex();
  }

  // ── Scores ─────────────────────────────────────────
  scores() {
    const home = Math.round(100 * (1 - hazardIndex(this.fixed) / H0));
    const s = this.steadiResult();
    const balance = s.done ? Math.max(0, 100 - 25 * s.n) : null;
    const res = this.scam.results;
    const scams = res.length ? Math.round(100 * res.reduce((a, r) => a + r.pts, 0) / res.length) : null;
    const meds = Object.values(this.care.meds), taken = meds.filter((m) => m === 'taken').length;
    const care = Math.round(100 * (0.7 * taken / meds.length + 0.3 * (this.care.checkin ? 1 : 0)));
    return { home, balance, scams, care };
  }
  updateIndex() {
    const s = this.scores();
    for (const k of ['home', 'balance', 'scams', 'care']) {
      const el = document.querySelector(`#index [data-k="${k}"]`); if (!el) continue;
      const v = s[k];
      el.style.setProperty('--p', v ?? 0);
      el.querySelector('b').textContent = v === null ? '—' : v;
      el.classList.toggle('low', v !== null && v < 50); el.classList.toggle('mid', v !== null && v >= 50 && v < 80);
    }
  }

  // ── HOME ───────────────────────────────────────────
  renderHome() {
    const p = $('#panel'), t = (k, v) => i18n.t(k, v);
    const idx = hazardIndex(this.fixed);
    p.innerHTML = `
      <header class="lv-head mono">${t('home.title')}</header>
      <p class="intro">${t('home.intro')}</p>
      <div class="gauge"><div class="g-ring" style="--p:${Math.round(idx * 100)}"><b class="mono">${Math.round(idx * 100)}</b><small>%</small></div>
        <div><label class="mono">${t('home.index')}</label><div class="mono big">${this.fixed.size}/${HAZARDS.length} ${t('home.fixed')}</div>
        <div class="mono small">H = 1 − Π(1 − wᵢ)</div></div></div>
      <ul class="hz-list"></ul>
      <div class="row-btns"><button class="btn primary" id="btn-walk"></button><button class="btn panel" id="btn-fixall"></button></div>
      <details class="phys"><summary class="lv-sub mono">${t('home.physics')}</summary><div id="phys"></div></details>`;
    const ul = p.querySelector('.hz-list');
    for (const h of [...HAZARDS].sort((a, b) => b.w - a.w)) {
      const li = document.createElement('li'); li.className = this.fixed.has(h.id) ? 'ok' : 'bad';
      li.innerHTML = `<span class="ic">${this.fixed.has(h.id) ? '✓' : '!'}</span><span class="n"></span><b class="mono">${(h.w * 100).toFixed(0)}</b>`;
      li.querySelector('.n').textContent = t(`hz.${h.id}.n`);
      li.onclick = () => this.select(h.id);
      ul.appendChild(li);
    }
    p.querySelector('#btn-walk').textContent = this.walk ? t('home.walking') : t('home.walk');
    p.querySelector('#btn-walk').onclick = () => this.startWalk();
    p.querySelector('#btn-fixall').textContent = t('home.fixAll');
    p.querySelector('#btn-fixall').onclick = () => { for (const h of HAZARDS) this.applyFix(h.id, true); this.render(); };
    const f = fallPhysics(70, 0.9, 20), f2 = fallPhysics(70, 0.9, 60);
    p.querySelector('#phys').innerHTML = `<p></p><div class="eq mono">v = √(2gh) · t = √(2h/g) · E = mgh · a = v²/(2d)</div><p class="hard"></p><p class="soft"></p>`;
    const ps = p.querySelectorAll('#phys p');
    ps[0].textContent = t('phys.intro', { h: '0.9', v: f.v.toFixed(2), t: f.t.toFixed(2), m: 70, E: f.E.toFixed(0) });
    ps[1].textContent = t('phys.hard', { g: f.g.toFixed(0) });
    ps[2].textContent = t('phys.soft', { g2: f2.g.toFixed(0) });
  }
  select(id) {
    this.sel = id; sfx.select();
    const h = HAZARDS.find((x) => x.id === id);
    this.cam.goal.t.set(h.x, 0, h.z); this.cam.goal.r = 8; this.cam.goal.pitch = 0.85;
    const d = $('#detail'), t = (k) => i18n.t(k);
    d.querySelector('.d-name').textContent = t(`hz.${id}.n`);
    d.querySelector('.d-why').textContent = t(`hz.${id}.why`);
    d.querySelector('.d-fix').textContent = t(`hz.${id}.fix`);
    d.querySelector('.d-w').textContent = `w = ${h.w.toFixed(2)}`;
    const btn = d.querySelector('.d-btn');
    const done = this.fixed.has(id);
    btn.textContent = done ? t('home.undo') : t('home.fix');
    btn.onclick = () => { if (this.fixed.has(id)) this.undoFix(id); else this.applyFix(id); this.select(id); this.render(); };
    d.classList.remove('hidden');
  }
  closeDetail() { $('#detail').classList.add('hidden'); this.sel = null; }
  applyFix(id, quiet = false) {
    if (this.fixed.has(id)) return;
    this.fixed.add(id);
    const H = this.home.H[id]; H.before.visible = false; H.after.visible = true;
    if (!quiet) { sfx.confirm(); this.app.feed.push('feed.fixed', 'ok', { n: i18n.t(`hz.${id}.n`) }); this.app.stage.flash('#5dffa8'); }
    this.updateRoute(); this.updateIndex();
  }
  undoFix(id) { this.fixed.delete(id); const H = this.home.H[id]; H.before.visible = true; H.after.visible = false; this.updateRoute(); this.updateIndex(); }
  // Colour the night route by local risk (green → red).
  updateRoute() {
    const R = this.home.route, col = R.geometry.attributes.color, pos = R.geometry.attributes.position;
    let sum = 0;
    for (let i = 0; i < pos.count; i++) { const r = routeRisk(this.fixed, pos.getX(i), pos.getZ(i)); sum += r; const c = lerpColor(r); col.setXYZ(i, c.r, c.g, c.b); }
    col.needsUpdate = true;
    this.routeAvg = sum / pos.count;
  }
  startWalk() {
    if (this.walk) return;
    this.walk = { u: 0, maxR: 0, sum: 0, n: 0 }; this.night = 1; sfx.select();
    this.cam.goal.t.set(-2.4, 0, 0.3); this.cam.goal.r = 12; this.cam.goal.pitch = 0.9;
    if (this.tab === 'home') this.renderHome();
  }

  // ── BALANCE (STEADI) ───────────────────────────────
  steadiResult() {
    const B = this.bal;
    const r = steadi({ answers: B.answers, tug: B.tug, chair: B.chair, age: B.age, sex: B.sex, tandem: B.tandem });
    r.done = Object.keys(B.answers).length > 0 || B.tug !== null || B.chair !== null || B.tandem !== null;
    return r;
  }
  renderBalance() {
    const p = $('#panel'), t = (k, v) => i18n.t(k, v), B = this.bal;
    const r = this.steadiResult();
    p.innerHTML = `
      <header class="lv-head mono">${t('bal.title')}</header><p class="intro">${t('bal.intro')}</p>
      <div class="bal-who"><label>${t('bal.age')} <input type="number" id="b-age" min="60" max="100" value="${B.age}"></label>
        <label>${t('bal.sex')} <select id="b-sex"><option value="f"${B.sex === 'f' ? ' selected' : ''}>${t('bal.f')}</option><option value="m"${B.sex === 'm' ? ' selected' : ''}>${t('bal.m')}</option></select></label></div>
      <div class="lv-sub mono">${t('bal.checklist')} · ${r.score} pts</div><ul class="checklist"></ul>
      <div class="test" data-t="tug"><b>${t('bal.tug')}</b><small>${t('bal.tugHow')}</small><div class="t-row"><span class="mono t-val">${B.tug === null ? '—' : B.tug.toFixed(1) + ' ' + t('bal.sec')}</span><button class="btn panel t-btn">${B.timers.tug ? t('bal.stop') : t('bal.start')}</button></div></div>
      <div class="test" data-t="chair"><b>${t('bal.chair')}</b><small>${t('bal.chairHow', { n: r.norm })}</small><div class="t-row"><span class="mono t-val">${B.chair === null ? '—' : B.chair}</span><button class="btn panel t-btn">${B.timers.chair ? t('bal.tap') : t('bal.start')}</button><button class="btn panel t-reset">${t('bal.reset')}</button></div></div>
      <div class="test" data-t="tandem"><b>${t('bal.tandem')}</b><small>${t('bal.tandemHow')}</small><div class="t-row"><span class="mono t-val">${B.tandem === null ? '—' : B.tandem.toFixed(1) + ' ' + t('bal.sec')}</span><button class="btn panel t-btn">${B.timers.tandem ? t('bal.stop') : t('bal.start')}</button></div></div>
      <div class="result ${r.done ? (r.atRisk ? 'bad' : 'ok') : ''}"><b>${t('bal.result')}</b><p>${r.done ? (r.atRisk ? t('bal.risk', { n: r.n }) : t('bal.ok')) : '—'}</p><ul class="flags"></ul></div>`;
    const ul = p.querySelector('.checklist');
    for (const q of CHECKLIST) {
      const li = document.createElement('li');
      li.innerHTML = `<label><input type="checkbox" ${B.answers[q.id] ? 'checked' : ''}> <span></span> <em class="mono">${q.pts}</em></label>`;
      li.querySelector('span').textContent = t('q.' + q.id);
      li.querySelector('input').onchange = (e) => { B.answers[q.id] = e.target.checked; this.renderBalance(); this.updateIndex(); };
      ul.appendChild(li);
    }
    const fl = p.querySelector('.flags');
    for (const [k, on] of Object.entries(r.flags)) if (on) { const li = document.createElement('li'); li.textContent = t('bal.flag.' + k, { s: r.score, n: r.norm }); fl.appendChild(li); }
    p.querySelector('#b-age').onchange = (e) => { B.age = +e.target.value || 75; this.renderBalance(); };
    p.querySelector('#b-sex').onchange = (e) => { B.sex = e.target.value; this.renderBalance(); };
    p.querySelectorAll('.test').forEach((el) => {
      const k = el.dataset.t;
      el.querySelector('.t-btn').onclick = () => this.testButton(k);
      const rs = el.querySelector('.t-reset'); if (rs) rs.onclick = () => { B.chair = null; B.timers.chair = null; this.renderBalance(); };
    });
  }
  testButton(k) {
    const B = this.bal, now = performance.now() / 1000;
    if (k === 'chair') {
      if (!B.timers.chair) { B.timers.chair = { t0: now }; B.chair = 0; sfx.select(); }
      else { B.chair++; sfx.select(); }
    } else if (!B.timers[k]) { B.timers[k] = { t0: now }; sfx.select(); }
    else { B[k] = now - B.timers[k].t0; B.timers[k] = null; sfx.confirm(); }
    this.renderBalance(); this.updateIndex();
  }
  tickBalance() {
    const B = this.bal, now = performance.now() / 1000;
    if (B.timers.chair && now - B.timers.chair.t0 >= 30) { B.timers.chair = null; sfx.confirm(); if (this.tab === 'balance') this.renderBalance(); this.updateIndex(); }
    if (this.tab !== 'balance') return;
    for (const k of ['tug', 'tandem']) if (B.timers[k]) { const el = document.querySelector(`.test[data-t="${k}"] .t-val`); if (el) el.textContent = (now - B.timers[k].t0).toFixed(1) + ' ' + i18n.t('bal.sec'); }
    if (B.timers.chair) { const el = document.querySelector('.test[data-t="chair"] small'); if (el) el.dataset.left = Math.ceil(30 - (now - B.timers.chair.t0)); }
  }

  // ── SCAMS ──────────────────────────────────────────
  renderScam() {
    const p = $('#panel'), t = (k, v) => i18n.t(k, v), S = this.scam;
    if (S.i >= SCAMS.length) {
      const sc = this.scores().scams;
      p.innerHTML = `<header class="lv-head mono">${t('scam.title')}</header><div class="result ok"><b>${t('scam.done', { s: sc })}</b></div><button class="btn panel" id="sc-again">↺</button>`;
      p.querySelector('#sc-again').onclick = () => { this.scam = { i: 0, answered: false, choice: null, found: new Set(), results: [] }; this.renderScam(); this.updateIndex(); };
      return;
    }
    const sc = SCAMS[S.i];
    const flagsTotal = sc.parts.filter((x) => x[1]).length;
    p.innerHTML = `
      <header class="lv-head mono">${t('scam.title')} · ${S.i + 1}/${SCAMS.length}</header><p class="intro">${t('scam.intro')}</p>
      <div class="phone ${sc.ch}"><div class="ph-head mono"><span>${t('ch.' + sc.ch)}</span><span class="from"></span></div><div class="ph-body"></div></div>
      <div class="row-btns"><button class="btn panel scam-b" data-v="1">⚠ ${t('scam.isScam')}</button><button class="btn panel scam-b" data-v="0">✓ ${t('scam.isLegit')}</button></div>
      <div class="scam-fb hidden"></div>`;
    p.querySelector('.from').textContent = sc.from;
    const body = p.querySelector('.ph-body');
    sc.parts.forEach(([pid, flag]) => {
      const s = document.createElement('span'); s.className = 'part' + (S.found.has(pid) ? ' found' : '') + (S.answered && flag ? ' reveal' : '');
      s.textContent = t(`sc.${sc.id}.${pid}`) + ' ';
      s.onclick = () => { if (!flag) { sfx.deny(); s.classList.add('nope'); setTimeout(() => s.classList.remove('nope'), 400); return; } if (S.found.has(pid)) return; S.found.add(pid); sfx.select(); s.classList.add('found'); const tag = document.createElement('i'); tag.className = 'flag-tag'; tag.textContent = t('flag.' + flag); s.appendChild(tag); if (S.answered) this.scamFeedback(); };
      if (S.found.has(pid) && flag) { const tag = document.createElement('i'); tag.className = 'flag-tag'; tag.textContent = t('flag.' + flag); s.appendChild(tag); }
      body.appendChild(s);
    });
    p.querySelectorAll('.scam-b').forEach((b) => { b.onclick = () => { if (S.answered) return; S.answered = true; S.choice = b.dataset.v === '1'; (S.choice === sc.scam ? sfx.confirm : sfx.warn)(); this.renderScam(); }; });
    if (S.answered) this.scamFeedback(flagsTotal);
  }
  scamFeedback() {
    const S = this.scam, sc = SCAMS[S.i], t = (k, v) => i18n.t(k, v);
    const total = sc.parts.filter((x) => x[1]).length;
    const found = sc.parts.filter((x) => x[1] && S.found.has(x[0])).length;
    const right = S.choice === sc.scam;
    const fb = document.querySelector('.scam-fb'); if (!fb) return;
    fb.className = 'scam-fb result ' + (right ? 'ok' : 'bad');
    fb.innerHTML = `<b></b><p class="tip"></p>${total ? `<p class="mono small">${t('scam.flagsFound', { a: found, b: total })}</p>` : ''}<button class="btn primary" id="sc-next">${t('scam.next')} →</button>`;
    fb.querySelector('b').textContent = `${right ? t('scam.correct') : t('scam.wrong')}: ${sc.scam ? t('scam.isScam') : t('scam.isLegit')}`;
    fb.querySelector('.tip').textContent = t('scam.tip.' + sc.id);
    fb.querySelector('#sc-next').onclick = () => {
      // Points: 70 % for the right call, 30 % for the red flags found.
      S.results.push({ id: sc.id, pts: (right ? 0.7 : 0) + (total ? 0.3 * found / total : 0.3) });
      S.i++; S.answered = false; S.choice = null; S.found = new Set(); this.renderScam(); this.updateIndex();
    };
    document.querySelectorAll('.part').forEach((el, i) => { if (sc.parts[i][1]) el.classList.add('reveal'); });
  }

  // ── CARE ───────────────────────────────────────────
  renderCare() {
    const p = $('#panel'), t = (k, v) => i18n.t(k, v), C = this.care;
    p.innerHTML = `
      <header class="lv-head mono">${t('care.title')}</header>
      <div class="lv-sub mono">${t('care.meds')}</div><ul class="meds"></ul>
      <div class="lv-sub mono">${t('care.checkin')}</div><button class="btn ${C.checkin ? 'panel' : 'primary'}" id="ci">${C.checkin ? t('care.checkedIn', { t: C.checkin }) : t('care.checkinBtn')}</button>
      <div class="lv-sub mono">${t('care.activity')}</div><canvas id="c-steps" class="chart"></canvas>
      <div class="lv-sub mono">${t('care.sleep')}</div><canvas id="c-night" class="chart small"></canvas>
      <div class="lv-sub mono">${t('care.alerts')}</div><ul class="alerts"></ul>`;
    const times = { am: '08:00', noon: '13:00', pm: '19:00', night: '22:00' };
    const ul = p.querySelector('.meds');
    for (const [k, st] of Object.entries(C.meds)) {
      const li = document.createElement('li'); li.className = st;
      li.innerHTML = `<span class="mono">${times[k]}</span><span></span><button class="btn panel">${t('care.' + st)}</button>`;
      li.children[1].textContent = t('med.' + k);
      li.querySelector('button').onclick = () => { C.meds[k] = st === 'taken' ? 'due' : 'taken'; sfx.select(); this.renderCare(); this.updateIndex(); };
      ul.appendChild(li);
    }
    p.querySelector('#ci').onclick = () => { if (!C.checkin) { C.checkin = new Date().toLocaleTimeString(i18n.lang === 'ja' ? 'ja-JP' : 'en-US', { hour: '2-digit', minute: '2-digit' }); sfx.confirm(); this.renderCare(); this.updateIndex(); } };
    const al = p.querySelector('.alerts');
    for (const [k, lvl] of [['night', 'ok'], ['door', 'ok'], ['missed', C.meds.noon === 'taken' ? 'ok' : 'warn'], ['scam', 'ok']]) { const li = document.createElement('li'); li.className = lvl; li.textContent = t('care.alert.' + k); al.appendChild(li); }
    this.drawBars(p.querySelector('#c-steps'), [3200, 4100, 2800, 5200, 4700, 3900, 4400], '#3ff3ff', ['M', 'T', 'W', 'T', 'F', 'S', 'S']);
    this.drawBars(p.querySelector('#c-night'), [2, 1, 3, 1, 1, 2, 1], '#ff4fd8', ['M', 'T', 'W', 'T', 'F', 'S', 'S']);
  }
  drawBars(cv, data, color, labels) {
    const dpr = Math.min(2, devicePixelRatio || 1), r = cv.getBoundingClientRect();
    cv.width = Math.max(10, Math.round(r.width * dpr)); cv.height = Math.max(10, Math.round(r.height * dpr));
    const g = cv.getContext('2d'), W = cv.width, H = cv.height, max = Math.max(...data) * 1.15, bw = W / data.length;
    g.clearRect(0, 0, W, H);
    g.font = `${9 * dpr}px JetBrains Mono, monospace`; g.textAlign = 'center';
    data.forEach((v, i) => {
      const h = (v / max) * (H - 16 * dpr);
      const grd = g.createLinearGradient(0, H - h, 0, H); grd.addColorStop(0, color); grd.addColorStop(1, 'rgba(139,92,255,.35)');
      g.fillStyle = grd; g.fillRect(i * bw + bw * 0.22, H - 12 * dpr - h, bw * 0.56, h);
      g.fillStyle = 'rgba(200,210,235,.7)'; g.fillText(labels[i], i * bw + bw / 2, H - 2 * dpr);
    });
  }

  // ── Report ─────────────────────────────────────────
  showReport() {
    const s = this.scores(), t = (k, v) => i18n.t(k, v), r = this.steadiResult();
    const meds = Object.values(this.care.meds);
    $('#rep-sub').textContent = t('rep.sub', { date: new Date().toLocaleDateString(i18n.lang === 'ja' ? 'ja-JP' : 'en-US') });
    const ul = $('#rep-list'); ul.innerHTML = '';
    const lines = [
      [t('rep.home', { f: this.fixed.size, t: HAZARDS.length, i: Math.round(hazardIndex(this.fixed) * 100) }), s.home >= 80],
      [t('rep.bal', { b: r.done ? (r.atRisk ? t('bal.risk', { n: r.n }) : t('bal.ok')) : t('rep.balNone') }), r.done && !r.atRisk],
      [s.scams === null ? t('rep.scamNone') : t('rep.scam', { s: s.scams }), (s.scams ?? 0) >= 80],
      [t('rep.care', { m: meds.filter((m) => m === 'taken').length, n: meds.length }), s.care >= 80],
    ];
    for (const [txt, ok] of lines) { const li = document.createElement('li'); li.className = ok ? 'ok' : 'bad'; li.innerHTML = `<span class="ic">${ok ? '✓' : '!'}</span><span></span>`; li.children[1].textContent = txt; ul.appendChild(li); }
    const nx = $('#rep-next'); nx.innerHTML = '';
    const next = HAZARDS.filter((h) => !this.fixed.has(h.id)).sort((a, b) => b.w - a.w).slice(0, 3).map((h) => t(`hz.${h.id}.fix`));
    if (r.done && r.atRisk) next.push(t('bal.risk', { n: r.n }));
    for (const n of next.length ? next : [t('bal.ok')]) { const li = document.createElement('li'); li.textContent = n; nx.appendChild(li); }
    const ring = $('#rep-ring'); const vals = Object.values(s).filter((v) => v !== null); const avg = Math.round(vals.reduce((a, b) => a + b, 0) / Math.max(1, vals.length));
    ring.style.setProperty('--p', avg); ring.querySelector('b').textContent = avg;
    $('#report').classList.remove('hidden'); sfx.confirm();
  }

  // ── Input ──────────────────────────────────────────
  pointerDown(e) {
    this.cam.drag = { x: e.clientX, y: e.clientY, moved: 0 };
  }
  pointerMove(e) {
    this.ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    if (!this.cam.drag) return;
    const G = this.cam.goal;
    G.yaw -= (e.clientX - this.cam.drag.x) * 0.005;
    G.pitch = THREE.MathUtils.clamp(G.pitch + (e.clientY - this.cam.drag.y) * 0.003, 0.2, 1.4);
    this.cam.drag.moved += Math.abs(e.clientX - this.cam.drag.x) + Math.abs(e.clientY - this.cam.drag.y);
    this.cam.drag.x = e.clientX; this.cam.drag.y = e.clientY;
  }
  pointerUp(e) {
    const d = this.cam.drag; this.cam.drag = null;
    if (!d || d.moved > 6 || this.tab !== 'home' || !e) return;
    this.ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const hit = this.ray.intersectObjects(this.pickables, false)[0];
    if (hit) this.select(hit.object.userData.hazard);
  }
  wheel(e) { const G = this.cam.goal; G.r = THREE.MathUtils.clamp(G.r * Math.exp(e.deltaY * 0.001), 4, 30); }

  // ── Frame ──────────────────────────────────────────
  update(dt, t) {
    const c = this.cam, G = c.goal, k = 1 - Math.exp(-dt * 2.5);
    if (!c.drag && this.tab !== 'home') G.yaw += dt * 0.04;
    c.yaw += (G.yaw - c.yaw) * k; c.pitch += (G.pitch - c.pitch) * k; c.r += (G.r - c.r) * k; c.target.lerp(G.t, k);
    this.camera.position.set(c.target.x + Math.sin(c.yaw) * Math.cos(c.pitch) * c.r, c.target.y + Math.sin(c.pitch) * c.r, c.target.z + Math.cos(c.yaw) * Math.cos(c.pitch) * c.r);
    this.camera.lookAt(c.target);
    // Hazard beacons pulse; fixed ones turn green and settle.
    for (const m of this.home.markers) {
      const ok = this.fixed.has(m.id), col = ok ? '#5dffa8' : '#ff4466';
      m.ring.material.color.set(col); m.beam.material.color.set(col); m.head.material.color.set(col);
      const pulse = ok ? 1 : 1 + 0.18 * Math.sin(t * 4 + m.g.position.x);
      m.ring.scale.setScalar(pulse); m.head.rotation.y += dt * 1.5; m.head.position.y = 1.5 + (ok ? 0 : 0.06 * Math.sin(t * 3));
      m.beam.material.opacity = ok ? 0.2 : 0.5; m.g.visible = this.tab === 'home';
      m.g.scale.setScalar(m.id === this.sel ? 1.25 : 1);
    }
    // Night mode lighting for the walk; the fixes that add light switch on.
    const nightT = this.walk ? 1 : 0;
    this.night += (nightT - this.night) * (1 - Math.exp(-dt * 2));
    const n = this.night, Hm = this.home;
    for (const l of Hm.warm) l.intensity = 0.9 * (1 - 0.85 * n);
    Hm.hemi.intensity = 0.3 * (1 - 0.6 * n); Hm.moon.intensity = 0.45 + 0.25 * n;
    for (const [id, base] of [['dimHall', 2.2], ['stairs', 1.6], ['bedLight', 1.4]]) { const L = Hm.H[id].light; if (L) L.intensity = this.fixed.has(id) ? base * (0.35 + 0.65 * n) : 0; }
    // The resident: idle by the bed, or walking the route at a pace that slows where it is risky.
    const P = Hm.person;
    if (this.walk) {
      const W = this.walk, pt = Hm.routeCurve.getPointAt(Math.min(1, W.u)), ahead = Hm.routeCurve.getPointAt(Math.min(1, W.u + 0.01));
      const risk = routeRisk(this.fixed, pt.x, pt.z);
      W.u += dt * (0.055 * (1 - 0.55 * risk)); W.sum += risk; W.n++; W.maxR = Math.max(W.maxR, risk);
      P.position.set(pt.x, 0, pt.z); P.lookAt(ahead.x, 0, ahead.z);
      const sw = Math.sin(W.u * 180);
      Hm.legs[0].rotation.x = 0.4 * sw; Hm.legs[1].rotation.x = -0.4 * sw; P.position.y = Math.abs(sw) * 0.02;
      P.rotation.z = risk > 0.35 ? Math.sin(t * 9) * 0.06 * risk : 0;               // unsteady where it is risky
      if (W.u >= 1) { const avg = W.sum / W.n; this.app.feed.push('feed.walkDone', avg > 0.3 ? 'warn' : 'ok', { r: Math.round(avg * 100) }); this.walk = null; this.cam.goal.r = 17; this.cam.goal.t.set(0, 0, 0.3); if (this.tab === 'home') this.renderHome(); }
    } else { const s = Hm.routeCurve.getPointAt(0); P.position.set(s.x, 0, s.z); Hm.legs[0].rotation.x = Hm.legs[1].rotation.x = 0; P.rotation.set(0, Math.PI * 0.75, 0); }
    P.visible = this.tab === 'home'; Hm.route.visible = this.tab === 'home';
    this.tickBalance();
  }
}
