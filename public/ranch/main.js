// RANCH OPS — by Coach Colin.
// Shell: loop, input, guided tour, ranch report. The app lives in app.js.

import { i18n } from './core/i18n.js';
import { createStage } from './core/scene.js';
import { Feed } from './core/feed.js';
import { initAudio, sfx, ambience } from './core/audio.js';
import { Ranch } from './app.js';

const $ = (s) => document.querySelector(s);
const boot = $('#boot');
// Key art generated for this project with Higgsfield; the page works without it.
const KEYART = 'https://d8j0ntlcm91z4.cloudfront.net/user_3D17dPWC57zGXhL3gHkykFe9E5n/hf_20260930_061422_eb411368-70ea-4b7f-bfca-01418b82d071.png';
const TABS = ['flock', 'pasture', 'drone', 'watch'];

try {
  i18n.apply();
  { const img = new Image(); img.onload = () => { $('#keyart').style.backgroundImage = `url("${KEYART}")`; $('#keyart').classList.add('on'); }; img.src = KEYART; }
  const app = { stage: createStage($('#scene')), feed: new Feed($('#feed')), state: { time: 0 } };
  app.stage.grade.uniforms.uHolo.value = 0.4; app.stage.grade.uniforms.uStreak.value = 0.5;
  const R = new Ranch(app);
  R.setTab('flock');

  // ── Tour ─────────────────────────────────────────
  const TOUR = [
    [0.5, () => { R.setTab('flock'); app.feed.push('tour.1', 'ok'); }],
    [6, () => { R.spook(); app.feed.push('tour.2', 'ok'); }],
    [14, () => { R.setTab('pasture'); $('#p-ndvi')?.click(); app.feed.push('tour.3', 'ok'); }],
    [20, () => { $('#p-best')?.click(); app.feed.push('tour.4', 'ok'); }],
    [30, () => { R.setTab('drone'); R.cfg.camera = 'thermal'; R.cfg.area = 'ranch'; R.cfg.alt = 40; R.cfg.V = 12; R.cfg.observer = true; R.cfg.warp = 20; R.render(); app.feed.push('tour.5', 'ok'); }],
    [33, () => R.launch()],
    [70, () => { if (R.drone.mode !== 'idle') { R.drone.mode = 'idle'; R.missionDone(); } R.setTab('watch'); app.feed.push('tour.6', 'ok'); }],
    [72, () => R.patrol()],
    // Respond only to what the thermal camera has confirmed ('wait' holds the tour on this step).
    [80, () => { if (!R.nearestThreat(true)) return 'wait'; R.respondSpot(); app.feed.push('tour.7', 'ok'); }],
    [81, () => { if (!R.nearestThreat(true)) return; $('#w-dog')?.click(); }],
    [96, () => { R.view.mode = 'orbit'; R.setThermal(false); R.render(); }],
    [106, () => R.showReport()], [111, () => stopTour()],
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
    R.entered = true; R.setTab('flock'); app.feed.push('cap.flock', 'ok');
    if (withTour) startTour();
  };
  $('#btn-start').onclick = () => launch(false);
  $('#btn-start-tour').onclick = () => launch(true);
  $('#btn-lang-start').onclick = () => i18n.toggle();
  $('#btn-lang').onclick = () => i18n.toggle();
  $('#btn-tour').onclick = () => (tour ? stopTour() : startTour());
  $('#btn-report').onclick = () => R.showReport();
  $('#rep-close').onclick = () => $('#report').classList.add('hidden');
  $('#rep-print').onclick = () => print();
  document.querySelectorAll('#tabs [data-tab]').forEach((b) => { b.onclick = () => R.setTab(b.dataset.tab); });
  i18n.onChange(() => R.render());

  // ── Input ────────────────────────────────────────
  const el = $('#scene');
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('pointerdown', (e) => { if (!R.entered) return; el.setPointerCapture?.(e.pointerId); R.pointerDown(e); });
  el.addEventListener('wheel', (e) => { e.preventDefault(); if (R.entered) R.wheel(e); }, { passive: false });
  addEventListener('pointermove', (e) => { if (R.entered) R.pointerMove(e); });
  addEventListener('pointerup', () => { if (R.entered) R.pointerUp(); });
  addEventListener('keydown', (e) => {
    if (!R.entered || e.target.matches?.('input, select, textarea')) return;
    if (e.key === 'Escape') { $('#report').classList.add('hidden'); return; }
    if (/^[1-4]$/.test(e.key)) R.setTab(TABS[+e.key - 1]);
    R.key(e.key.toLowerCase());
  });

  // ── Loop ─────────────────────────────────────────
  let last = performance.now();
  const debug = { renderPaused: false, manual: false };
  function frame(dt) {
    app.state.time += dt;
    if (tour) { tour.t += dt; while (tour && tour.i < TOUR.length && tour.t >= TOUR[tour.i][0]) { if (TOUR[tour.i][1]() === 'wait') break; if (tour) tour.i++; } }
    R.update(dt, app.state.time);
    const fl = app.stage.grade.uniforms.uFlash; if (debug.renderPaused) fl.value = Math.max(0, fl.value - dt * 1.6);
    if (!debug.renderPaused) app.stage.render(app.state.time, dt);
  }
  function loop(now) { const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; if (!debug.manual) frame(dt); requestAnimationFrame(loop); }
  requestAnimationFrame(loop);
  window.__ranch = Object.assign(debug, { app, R, launch, startTour, step(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) frame(dt); } });
  void sfx;
  boot.classList.add('done');
} catch (err) {
  console.error(err);
  boot.textContent = 'Could not start: ' + (err?.message || err) + ' · WebGL is required.';
  boot.classList.add('err');
}
