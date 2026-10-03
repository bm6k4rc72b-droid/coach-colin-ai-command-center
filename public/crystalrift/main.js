// CRYSTAL RIFT — by Coach Colin.
// Shell: loop, input, guided tour, debrief. The app lives in app.js.

import { i18n } from './core/i18n.js';
import { createStage } from './core/scene.js';
import { Feed } from './core/feed.js';
import { initAudio, sfx, ambience } from './core/audio.js';
import { Rift } from './app.js';

const $ = (s) => document.querySelector(s);
const boot = $('#boot');
// Key art generated for this project with Higgsfield; the page works without it.
const KEYART = 'https://d8j0ntlcm91z4.cloudfront.net/user_3D17dPWC57zGXhL3gHkykFe9E5n/hf_20261003_195602_ef38bead-6a3d-4d99-a9ea-f81ea79b8ed5.png';
const TABS = ['ferrum', 'academy', 'mist', 'isles', 'rift'];

try {
  i18n.apply();
  { const img = new Image(); img.onload = () => { $('#keyart').style.backgroundImage = `url("${KEYART}")`; $('#keyart').classList.add('on'); }; img.src = KEYART; }
  const app = { stage: createStage($('#scene')), feed: new Feed($('#feed')), state: { time: 0 } };
  app.stage.grade.uniforms.uHolo.value = 0.2; app.stage.grade.uniforms.uStreak.value = 1.3; app.stage.bloom.strength = 0.35; app.stage.bloom.threshold = 0.88; app.stage.renderer.toneMappingExposure = 0.9; app.stage.grade.uniforms.uHolo.value = 0.12;
  const A = new Rift(app);
  A.setTab('ferrum');

  // ── Tour ─────────────────────────────────────────
  const TOUR = [
    [0.5, () => { A.setTab('ferrum'); Object.assign(A.fe, { Th: 600, f: 0.6, save: 0 }); A.render(); app.feed.push('tour.1', 'ok'); }],
    [5, () => { Object.assign(A.fe, { Th: 900, f: 0.65, save: 0.2 }); A.render(); app.feed.push('tour.2', 'ok'); }],
    [10, () => { A.auto = true; A.ac.seed = 2; A.ac.D = null; A.setTab('academy'); app.feed.push('tour.3', 'ok'); }],
    [22, () => { A.setTab('mist'); Object.assign(A.ms, { V: 30000, gas: 'helium', P: 600 }); A.render(); app.feed.push('tour.4', 'ok'); }],
    [25, () => { Object.assign(A.ms, { V: 70000, gas: 'hydrogen', P: 1500 }); A.render(); }],
    [29, () => { A.setTab('isles'); Object.assign(A.is, { x: -6, y: 0, ang: 0, v0: 10, goals: 0 }); A.render(); A.shoot(); app.feed.push('tour.5', 'ok'); }],
    [32, () => { Object.assign(A.is, { x: 6, y: 0, ang: 0, v0: 20 }); A.render(); A.shoot(); app.feed.push('tour.6', 'ok'); }],
    [34.5, () => { Object.assign(A.is, { x: 6, y: 0.6, ang: -6 }); A.render(); A.shoot(); }], [37, () => { Object.assign(A.is, { x: 5.5, y: -0.5, ang: 5, v0: 22 }); A.render(); A.shoot(); }],
    [40, () => { A.auto = true; A.setTab('rift'); A.startBattle(10); app.feed.push('tour.7', 'ok'); }],
    [80, () => { A.showReport(); app.feed.push('tour.8', 'ok'); }], [86, () => stopTour()],
  ];
  let tour = null;
  const startTour = () => { $('#report').classList.add('hidden'); tour = { t: 0, i: 0 }; $('#demo-bar').classList.remove('hidden'); $('#btn-tour span').textContent = i18n.t('app.tourStop'); };
  function stopTour(takeover = false) { if (!tour) return; tour = null; $('#demo-bar').classList.add('hidden'); $('#btn-tour span').textContent = i18n.t('app.tour'); if (takeover) app.feed.push('app.takeover', 'ok'); }
  const takeover = (e) => { if (e.isTrusted && tour && !e.target.closest?.('#btn-tour')) stopTour(true); };
  addEventListener('pointerdown', takeover, true); addEventListener('keydown', takeover, true);

  // ── Start ────────────────────────────────────────
  const ack = $('#ack');
  ack.onchange = () => { $('#btn-start').disabled = $('#btn-start-tour').disabled = !ack.checked; };
  const launch = (withTour) => {
    initAudio(); ambience(0.03);
    $('#start').classList.add('hidden'); $('#keyart').style.display = 'none'; $('#hud').classList.remove('hidden');
    A.entered = true; A.setTab('ferrum');
    if (withTour) startTour();
  };
  $('#btn-start').onclick = () => launch(false);
  $('#btn-start-tour').onclick = () => launch(true);
  $('#btn-lang-start').onclick = () => i18n.toggle();
  $('#btn-lang').onclick = () => i18n.toggle();
  $('#btn-tour').onclick = () => (tour ? stopTour() : startTour());
  $('#btn-report').onclick = () => A.showReport();
  $('#rep-close').onclick = () => $('#report').classList.add('hidden');
  $('#rep-print').onclick = () => print();
  document.querySelectorAll('#tabs [data-tab]').forEach((b) => { b.onclick = () => A.setTab(b.dataset.tab); });
  i18n.onChange(() => A.render());

  // ── Input ────────────────────────────────────────
  const cv = $('#scene');
  cv.addEventListener('contextmenu', (e) => e.preventDefault());
  cv.addEventListener('pointerdown', (e) => { if (!A.entered) return; cv.setPointerCapture?.(e.pointerId); A.pointerDown(e); });
  cv.addEventListener('wheel', (e) => { e.preventDefault(); if (A.entered) A.wheel(e); }, { passive: false });
  addEventListener('pointermove', (e) => { if (A.entered) A.pointerMove(e); });
  addEventListener('pointerup', () => { if (A.entered) A.pointerUp(); });
  addEventListener('keyup', (e) => { if (A.entered) A.keyUp(e.key === 'Shift' ? 'shift' : e.key.toLowerCase()); });
  addEventListener('blur', () => A.keys.clear());
  addEventListener('keydown', (e) => {
    if (!A.entered || e.target.matches?.('input, select, textarea')) return;
    if (e.key === 'Escape') { $('#report').classList.add('hidden'); return; }
    if (/^[1-5]$/.test(e.key)) A.setTab(TABS[+e.key - 1]);
    if ([' ', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) e.preventDefault();
    A.key(e.key === 'Shift' ? 'shift' : e.key.toLowerCase());
  });

  // ── Loop ─────────────────────────────────────────
  let last = performance.now();
  const debug = { renderPaused: false, manual: false };
  function frame(dt) {
    app.state.time += dt;
    if (tour) { tour.t += dt; while (tour && tour.i < TOUR.length && tour.t >= TOUR[tour.i][0]) TOUR[tour.i++][1](); }
    A.update(dt, app.state.time);
    if (!debug.renderPaused) app.stage.render(app.state.time, dt);
  }
  function loop(now) { const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; if (!debug.manual) frame(dt); requestAnimationFrame(loop); }
  requestAnimationFrame(loop);
  window.__crystalrift = Object.assign(debug, { app, A, launch, startTour, step(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) frame(dt); } });
  void sfx;
  boot.classList.add('done');
} catch (err) {
  console.error(err);
  boot.textContent = 'Could not start: ' + (err?.message || err) + ' · WebGL is required.';
  boot.classList.add('err');
}
