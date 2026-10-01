// CHRONOS — by Coach Colin.
// Shell: loop, input, guided tour, logbook. The app lives in app.js.

import { i18n } from './core/i18n.js';
import { createStage } from './core/scene.js';
import { Feed } from './core/feed.js';
import { initAudio, sfx, ambience } from './core/audio.js';
import { Chronos } from './app.js';

const $ = (s) => document.querySelector(s);
const boot = $('#boot');
// Key art generated for this project with Higgsfield; the page works without it.
const KEYART = 'https://d8j0ntlcm91z4.cloudfront.net/user_3D17dPWC57zGXhL3gHkykFe9E5n/hf_20261001_041255_d52a0672-d1dc-48d4-aecd-f46a7f7249a7.png';
const TABS = ['twin', 'gravity', 'wormhole', 'paradox'];

try {
  i18n.apply();
  { const img = new Image(); img.onload = () => { $('#keyart').style.backgroundImage = `url("${KEYART}")`; $('#keyart').classList.add('on'); }; img.src = KEYART; }
  const app = { stage: createStage($('#scene')), feed: new Feed($('#feed')), state: { time: 0 } };
  app.stage.grade.uniforms.uHolo.value = 0.35; app.stage.grade.uniforms.uStreak.value = 0.9;
  const C = new Chronos(app);
  C.setTab('twin');

  // ── Tour ─────────────────────────────────────────
  const TOUR = [
    [0.5, () => { C.setTab('twin'); C.trip.dest = 'proxima'; C.trip.a = 1; C.trip.cap = 0.999999; C.computeTrip(); C.trip.u = 0; C.trip.playing = true; C.render(); app.feed.push('tour.1', 'ok'); }],
    [16, () => { C.trip.dest = 'pleiades'; C.score.extreme = true; C.computeTrip(); C.trip.u = 0.2; C.trip.playing = true; C.render(); app.feed.push('tour.2', 'ok'); }],
    [32, () => { C.trip.u = 1; C.trip.playing = false; C.score.twin = true; C.setTab('gravity'); C.grav.orbit = 'gps'; C.grav.h = 20.2e6; C.score.gps = true; C.render(); app.feed.push('tour.3', 'ok'); }],
    [40, () => { $('#gr-miller')?.click(); app.feed.push('tour.4', 'ok'); }],
    [52, () => { C.setTab('wormhole'); C.wh.b = 100; C.wh.beta = 0.99; C.wh.T = 10; C.wh.D = 1; C.score.exotic = true; C.render(); app.feed.push('tour.5', 'ok'); }],
    [64, () => { C.setTab('paradox'); C.px.delta = 13.5; C.solveParadox(false); C.px.sel = -1; C.render(); app.feed.push('tour.6', 'ok'); }],
    [76, () => { C.solveParadox(true); C.render(); }],
    [92, () => C.showReport()], [97, () => stopTour()],
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
    C.entered = true; C.setTab('twin');
    if (withTour) startTour();
  };
  $('#btn-start').onclick = () => launch(false);
  $('#btn-start-tour').onclick = () => launch(true);
  $('#btn-lang-start').onclick = () => i18n.toggle();
  $('#btn-lang').onclick = () => i18n.toggle();
  $('#btn-tour').onclick = () => (tour ? stopTour() : startTour());
  $('#btn-report').onclick = () => C.showReport();
  $('#rep-close').onclick = () => $('#report').classList.add('hidden');
  $('#rep-print').onclick = () => print();
  document.querySelectorAll('#tabs [data-tab]').forEach((b) => { b.onclick = () => C.setTab(b.dataset.tab); });
  i18n.onChange(() => C.render());

  // ── Input ────────────────────────────────────────
  const el = $('#scene');
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('pointerdown', (e) => { if (!C.entered) return; el.setPointerCapture?.(e.pointerId); C.pointerDown(e); });
  el.addEventListener('wheel', (e) => { e.preventDefault(); if (C.entered) C.wheel(e); }, { passive: false });
  addEventListener('pointermove', (e) => { if (C.entered) C.pointerMove(e); });
  addEventListener('pointerup', () => { if (C.entered) C.pointerUp(); });
  addEventListener('keydown', (e) => {
    if (!C.entered || e.target.matches?.('input, select, textarea')) return;
    if (e.key === 'Escape') { $('#report').classList.add('hidden'); return; }
    if (/^[1-4]$/.test(e.key)) C.setTab(TABS[+e.key - 1]);
    if (e.key === ' ') e.preventDefault();
    C.key(e.key);
  });

  // ── Loop ─────────────────────────────────────────
  let last = performance.now();
  const debug = { renderPaused: false, manual: false };
  function frame(dt) {
    app.state.time += dt;
    if (tour) { tour.t += dt; while (tour && tour.i < TOUR.length && tour.t >= TOUR[tour.i][0]) TOUR[tour.i++][1](); }
    C.update(dt, app.state.time);
    if (!debug.renderPaused) app.stage.render(app.state.time, dt);
  }
  function loop(now) { const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; if (!debug.manual) frame(dt); requestAnimationFrame(loop); }
  requestAnimationFrame(loop);
  window.__chronos = Object.assign(debug, { app, C, launch, startTour, step(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) frame(dt); } });
  void sfx;
  boot.classList.add('done');
} catch (err) {
  console.error(err);
  boot.textContent = 'Could not start: ' + (err?.message || err) + ' · WebGL is required.';
  boot.classList.add('err');
}
