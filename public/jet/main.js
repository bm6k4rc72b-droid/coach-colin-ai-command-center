// JET ATELIER — by Coach Colin.
// Shell: loop, input, cinematic tour and the build-sheet overlay. Configurator in app.js.

import { i18n } from './core/i18n.js';
import { createStage } from './core/scene.js';
import { Feed } from './core/feed.js';
import { initAudio, sfx, ambience } from './core/audio.js';
import { Atelier, SECTIONS } from './app.js';
import { AIRFRAMES, CITIES } from './sim/data.js';
import { NM } from './sim/math.js';

const $ = (s) => document.querySelector(s);
const boot = $('#boot');
// Key art generated for this project with Higgsfield; the page works without it.
const KEYART = 'https://d8j0ntlcm91z4.cloudfront.net/user_3D17dPWC57zGXhL3gHkykFe9E5n/hf_20260927_054136_462c2d2d-83f0-43d3-9f67-6b50861981a0.png';

try {
  i18n.apply();
  { const img = new Image(); img.onload = () => { $('#keyart').style.backgroundImage = `url("${KEYART}")`; $('#keyart').classList.add('on'); }; img.src = KEYART; }
  const app = { stage: createStage($('#scene')), feed: new Feed($('#feed')), state: { time: 0 }, frame: 0 };
  app.stage.renderer.localClippingEnabled = true;
  app.stage.grade.uniforms.uHolo.value = 0.4;
  app.stage.bloom.threshold = 0.82; app.stage.bloom.radius = 0.45;
  const A = new Atelier(app);
  app.atelier = A;
  let entered = false;

  // ── Build sheet overlay ──────────────────────────
  const fmt = (n, d = 0) => Number(n).toLocaleString(i18n.lang === 'ja' ? 'ja-JP' : 'en-US', { maximumFractionDigits: d, minimumFractionDigits: d });
  app.showSummary = () => {
    const n = A.num, c = A.cfg, m = n.m, t = (k) => i18n.t(k);
    $('#sum-sub').textContent = `${t('ja.frame.' + c.frame)} · ${t('ja.paint.' + c.paint)} · ${t('app.by')}`;
    $('#sum-price').textContent = `US$ ${n.price.toFixed(1)} M`;
    const fill = (id, rows) => { const ul = $(id); ul.innerHTML = ''; for (const [k, v] of rows) { const li = document.createElement('li'); li.className = 'ok'; li.innerHTML = '<span></span><b class="mono"></b>'; li.children[0].textContent = k; li.children[1].textContent = v; ul.appendChild(li); } };
    fill('#sum-spec', [
      [t('ja.bs.frame'), t('ja.frame.' + c.frame)], [t('ja.tray.paint'), `${t('ja.paint.' + c.paint)} · ${t('ja.accent.' + c.accent)}`],
      [t('ja.sec.cabin'), c.layout.map((z) => t('ja.zone.' + z)).join(' · ')], [t('ja.bs.seats'), `${n.seats} / ${n.berths}`],
      [t('ja.sec.materials'), `${t('ja.leather.' + c.leather)} · ${t('ja.veneer.' + c.veneer)} · ${t('ja.metal.' + c.metal)}`], [t('ja.tray.kelvin'), `${c.kelvin} K`],
      [t('ja.bs.cabin'), `${fmt(n.cabinAlt)} ft`], [t('ja.bs.range'), `${fmt(m.rangeMaxKm / NM)} nm`],
    ]);
    fill('#sum-mission', [
      [t('ja.bs.route'), `${CITIES[c.from].name} → ${CITIES[c.to].name}`], [t('ja.bs.pax'), String(c.pax)],
      ['Great circle', `${fmt(n.distKm / NM)} nm · ${fmt(n.bearing)}°`], [t('ja.bs.time'), `${Math.floor(m.timeH)} h ${String(Math.round((m.timeH % 1) * 60)).padStart(2, '0')}`],
      [t('ja.bs.fuel'), `${fmt(m.fuel)} kg`], [t('ja.bs.co2'), `${fmt(m.co2 / 1000, 1)} t`], ['Verdict', t(m.feasible ? 'ja.ok.nonstop' : m.mtowLimited && !m.fuelLimited ? 'ja.ok.mtow' : 'ja.ok.stop')],
    ]);
    $('#summary').classList.remove('hidden'); sfx.confirm();
  };
  $('#sum-close').onclick = () => $('#summary').classList.add('hidden');
  $('#sum-again').onclick = () => { $('#summary').classList.add('hidden'); A.setSection('airframe'); };

  // ── Cinematic tour ───────────────────────────────
  const TOUR = [
    [0, () => { A.setSection('airframe'); }], [3, () => A.set('frame', 'ultra')], [6, () => A.setSection('exterior')], [7.5, () => A.set('paint', 'obsidian')], [9.5, () => A.set('accent', 'gold')],
    [12, () => A.setSection('cabin')], [15, () => A.set('zone2', 'media')], [18, () => A.setSection('materials')], [19.5, () => A.set('leather', 'cognac')], [21.5, () => A.set('veneer', 'ebony')],
    [24, () => A.setSection('lighting')], [25.5, () => A.set('kelvin', 2700)], [28, () => A.setSection('mission')], [29, () => A.set('from', 'LAX')], [31, () => A.set('to', 'HND')],
    [35, () => A.setSection('summary')], [36, () => A.setView('flight')], [44, () => app.showSummary()], [47, () => stopTour()],
  ];
  let tour = null;
  const startTour = () => { $('#summary').classList.add('hidden'); tour = { t: 0, i: 0 }; $('#demo-bar').classList.remove('hidden'); $('#btn-tour span').textContent = i18n.t('app.tourStop'); };
  function stopTour(takeover = false) { if (!tour) return; tour = null; $('#demo-bar').classList.add('hidden'); $('#btn-tour span').textContent = i18n.t('app.tour'); if (takeover) app.feed.push('app.takeover', 'ok'); }
  const takeover = (e) => { if (e.isTrusted && tour && !e.target.closest?.('#btn-tour')) stopTour(true); };
  addEventListener('pointerdown', takeover, true); addEventListener('keydown', takeover, true);

  // ── Start ────────────────────────────────────────
  const ack = $('#ack');
  ack.onchange = () => { $('#btn-start').disabled = $('#btn-start-tour').disabled = !ack.checked; };
  const launch = (withTour) => {
    initAudio(); ambience(0.06);
    $('#start').classList.add('hidden'); $('#keyart').style.display = 'none'; $('#hud').classList.remove('hidden');
    entered = true; A.setSection('airframe'); app.feed.push('ja.feed.welcome', 'ok');
    if (withTour) startTour();
  };
  $('#btn-start').onclick = () => launch(false);
  $('#btn-start-tour').onclick = () => launch(true);
  $('#btn-lang-start').onclick = () => i18n.toggle();
  $('#btn-lang').onclick = () => i18n.toggle();
  $('#btn-tour').onclick = () => (tour ? stopTour() : startTour());
  document.querySelectorAll('#nav [data-sec]').forEach((b) => { b.onclick = () => A.setSection(b.dataset.sec); });
  document.querySelectorAll('[data-view]').forEach((b) => { b.onclick = () => { A.setView(b.dataset.view); sfx.select(); ambience(b.dataset.view === 'flight' ? 0.14 : 0.06); }; });
  i18n.onChange(() => { A.renderTray(); A.updateSheet(); });

  // ── Input ────────────────────────────────────────
  const canvas = $('#scene');
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => { if (!entered) return; canvas.setPointerCapture?.(e.pointerId); A.pointerDown(e); });
  addEventListener('pointermove', (e) => { if (entered) A.pointerMove(e); });
  addEventListener('pointerup', () => A.pointerUp());
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); if (entered) A.wheel(e); }, { passive: false });
  const VIEWS = ['studio', 'cabin', 'walk', 'flight', 'globe'];
  addEventListener('keydown', (e) => {
    if (!entered || e.target.matches?.('input, select, textarea')) return;
    if (e.key === 'Escape') { $('#summary').classList.add('hidden'); return; }
    if (/^[1-7]$/.test(e.key)) { A.setSection(SECTIONS[+e.key - 1]); return; }
    if (e.key.toLowerCase() === 'v') A.setView(VIEWS[(VIEWS.indexOf(A.view) + 1) % VIEWS.length]);
  });

  // ── Loop ─────────────────────────────────────────
  let last = performance.now();
  const debug = { renderPaused: false, manual: false };
  function frame(dt) {
    app.state.time += dt; app.frame++;
    if (tour) { tour.t += dt; while (tour && tour.i < TOUR.length && tour.t >= TOUR[tour.i][0]) TOUR[tour.i++][1](); }
    if (!entered) { A.cam.goal.yaw += dt * 0.04; }
    A.update(dt, app.state.time);
    const fl = app.stage.grade.uniforms.uFlash; if (debug.renderPaused) fl.value = Math.max(0, fl.value - dt * 1.6);
    if (!debug.renderPaused) app.stage.render(app.state.time, dt);
  }
  A.setView('studio');
  function loop(now) { const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; if (!debug.manual) frame(dt); requestAnimationFrame(loop); }
  requestAnimationFrame(loop);
  window.__jet = Object.assign(debug, { app, A, launch, startTour, step(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) frame(dt); } });
  void AIRFRAMES;
  boot.classList.add('done');
} catch (err) {
  console.error(err);
  boot.textContent = 'Could not start: ' + (err?.message || err) + ' · WebGL is required.';
  boot.classList.add('err');
}
