// DIRECTOR'S CHAIR — by Coach Colin.
// Shell: loop, input, guided tour, wrap report. The app lives in app.js.

import { i18n } from './core/i18n.js';
import { createStage } from './core/scene.js';
import { Feed } from './core/feed.js';
import { initAudio, sfx, ambience } from './core/audio.js';
import { Director } from './app.js';

const $ = (s) => document.querySelector(s);
const boot = $('#boot');
// Key art generated for this project with Higgsfield; the page works without it.
const KEYART = 'https://d8j0ntlcm91z4.cloudfront.net/user_3D17dPWC57zGXhL3gHkykFe9E5n/hf_20260930_061422_977da08d-a26b-4cb6-924a-ed470f98d2e5.png';
const TABS = ['set', 'camera', 'light', 'cut'];

try {
  i18n.apply();
  { const img = new Image(); img.onload = () => { $('#keyart').style.backgroundImage = `url("${KEYART}")`; $('#keyart').classList.add('on'); }; img.src = KEYART; }
  const app = { stage: createStage($('#scene')), feed: new Feed($('#feed')), state: { time: 0 } };
  app.stage.grade.uniforms.uHolo.value = 0.45; app.stage.grade.uniforms.uStreak.value = 0.8;
  const D = new Director(app);
  D.setTab('set');

  // ── Tour ─────────────────────────────────────────
  const TOUR = [
    [0.5, () => { D.setTab('set'); D.t = 3; D.playing = true; app.feed.push('tour.1', 'ok'); }],
    [3.5, () => { D.sel = 'B'; D.render(); D.moveCam(-5.9, 0.9); }],
    [7, () => { D.sel = 'B'; D.setTab('camera'); D.t = 8; D.playing = true; D.lensSet.B.N = 2; D.score.dof = true; D.render(); app.feed.push('tour.2', 'ok'); }],
    [12, () => { D.frame('mcu'); app.feed.push('tour.3', 'ok'); }],
    [15, () => D.recordTake()],
    [17, () => { D.body.anamorphic = true; D.render(); app.feed.push('tour.4', 'ok'); }],
    [21, () => { D.body.anamorphic = false; D.sel = 'A'; D.t = 20; D.playing = false; D.render(); app.feed.push('tour.5', 'ok'); D.dollyZoom(); }],
    [27, () => { D.cams = { ...D.cams, A: { x: -0.8, y: 1.55, z: -6.5, target: 'two', f: 32 } }; D.setTab('light'); D.t = 20; app.feed.push('tour.6', 'ok'); }],
    [28, () => $('[data-lp="noir"]')?.click()],
    [32, () => $('[data-lp="golden"]')?.click()],
    [36, () => { D.body.falseColor = true; D.score.meter = true; D.render(); app.feed.push('tour.7', 'ok'); }],
    [40, () => { D.body.falseColor = false; $('[data-lp="noir"]')?.click(); D.setTab('cut'); $('#e-auto')?.click(); app.feed.push('tour.8', 'ok'); }],
    [72, () => D.showReport()], [77, () => stopTour()],
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
    D.entered = true; D.setTab('set'); app.feed.push('cap.set', 'ok');
    if (withTour) startTour();
  };
  $('#btn-start').onclick = () => launch(false);
  $('#btn-start-tour').onclick = () => launch(true);
  $('#btn-lang-start').onclick = () => i18n.toggle();
  $('#btn-lang').onclick = () => i18n.toggle();
  $('#btn-tour').onclick = () => (tour ? stopTour() : startTour());
  $('#btn-report').onclick = () => D.showReport();
  $('#rep-close').onclick = () => $('#report').classList.add('hidden');
  $('#rep-print').onclick = () => print();
  document.querySelectorAll('#tabs [data-tab]').forEach((b) => { b.onclick = () => D.setTab(b.dataset.tab); });
  i18n.onChange(() => D.render());

  // ── Input ────────────────────────────────────────
  const el = $('#scene');
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('pointerdown', (e) => { if (!D.entered) return; el.setPointerCapture?.(e.pointerId); D.pointerDown(e); });
  el.addEventListener('wheel', (e) => { e.preventDefault(); if (D.entered) D.wheel(e); }, { passive: false });
  addEventListener('pointermove', (e) => { if (D.entered) D.pointerMove(e); });
  addEventListener('pointerup', (e) => { if (D.entered) D.pointerUp(e); });
  addEventListener('keydown', (e) => {
    if (!D.entered || e.target.matches?.('input, select, textarea')) return;
    if (e.key === 'Escape') { $('#report').classList.add('hidden'); return; }
    const k = e.key.toLowerCase(), ti = ['q', 'w', 'e', 'r'].indexOf(k);
    if (ti >= 0) D.setTab(TABS[ti]);
    if (k === ' ') e.preventDefault();
    D.key(k);
  });

  // ── Loop ─────────────────────────────────────────
  let last = performance.now();
  const debug = { renderPaused: false, manual: false };
  function frame(dt) {
    app.state.time += dt;
    if (tour) { tour.t += dt; while (tour && tour.i < TOUR.length && tour.t >= TOUR[tour.i][0]) TOUR[tour.i++][1](); }
    D.update(dt, app.state.time);
    const fl = app.stage.grade.uniforms.uFlash; if (debug.renderPaused) fl.value = Math.max(0, fl.value - dt * 1.6);
    if (!debug.renderPaused) app.stage.render(app.state.time, dt);
  }
  function loop(now) { const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; if (!debug.manual) frame(dt); requestAnimationFrame(loop); }
  requestAnimationFrame(loop);
  window.__director = Object.assign(debug, { app, D, launch, startTour, step(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) frame(dt); } });
  void sfx;
  boot.classList.add('done');
} catch (err) {
  console.error(err);
  boot.textContent = 'Could not start: ' + (err?.message || err) + ' · WebGL is required.';
  boot.classList.add('err');
}
