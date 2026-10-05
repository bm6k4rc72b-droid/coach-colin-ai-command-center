// MINDSCAPE — by Coach Colin.
// Shell: loop, input, guided tour, debrief. The app lives in app.js.

import { i18n } from './core/i18n.js';
import { createStage } from './core/scene.js';
import { Feed } from './core/feed.js';
import { initAudio, sfx, ambience } from './core/audio.js';
import { Mind } from './app.js';

const $ = (s) => document.querySelector(s);
const boot = $('#boot');
// Key art generated for this project with Higgsfield; the page works without it.
const KEYART = 'https://d8j0ntlcm91z4.cloudfront.net/user_3D17dPWC57zGXhL3gHkykFe9E5n/hf_20261005_002832_b37896e9-c618-4b8b-b434-6bdc961337a0.png';
const TABS = ['atlas', 'dopamine', 'motivation', 'arousal', 'attraction', 'suggestion'];

try {
  i18n.apply();
  { const img = new Image(); img.onload = () => { $('#keyart').style.backgroundImage = `url("${KEYART}")`; $('#keyart').classList.add('on'); }; img.src = KEYART; }
  const app = { stage: createStage($('#scene')), feed: new Feed($('#feed')), state: { time: 0 } };
  app.stage.grade.uniforms.uHolo.value = 0.3; app.stage.grade.uniforms.uStreak.value = 0.8; app.stage.bloom.strength = 0.55; app.stage.bloom.threshold = 0.82; app.stage.bloom.radius = 0.55; app.stage.renderer.toneMappingExposure = 1.0;
  const A = new Mind(app);
  A.setTab('atlas');

  // ── Tour ─────────────────────────────────────────
  const TOUR = [
    [0.5, () => { A.setTab('atlas'); A.at.sel = 'frontal'; A.at.glass = false; A.paint(); A.render(); app.feed.push('tour.1', 'ok'); }],
    [4, () => { A.at.sel = 'hippocampus'; A.paint(); A.render(); app.feed.push('tour.2', 'ok'); }],
    [7, () => { A.at.sel = 'vta'; A.paint(); A.render(); }],
    [10, () => { A.newQuiz(); A.paint(); A.render(); app.feed.push('tour.3', 'ok'); }],
    ...[11.5, 12.5, 13.5, 14.5, 15.5, 16.5].map((s) => [s, () => { if (A.at.quiz) A.answer(A.at.quiz.target); }]),
    [18, () => { A.setTab('dopamine'); Object.assign(A.da, { alpha: 0.3, gamma: 0.98, p: 1, run: true }); A.render(); app.feed.push('tour.4', 'ok'); }],
    [27, () => { A.da.run = false; A.da.omitNext = true; A.trial(); A.render(); app.feed.push('tour.5', 'ok'); }],
    [31, () => { A.setTab('motivation'); Object.assign(A.mo, { R: 10, delay: 30, E: 3, now: 0, A: 1.5, DA: 0.6 }); A.render(); app.feed.push('tour.6', 'ok'); }],
    [35, () => { Object.assign(A.mo, { E: 0.25, now: 1, delay: 7, A: 0.5 }); A.render(); app.feed.push('tour.7', 'ok'); }],
    [39, () => { A.setTab('arousal'); Object.assign(A.ar, { a: 0.9, diff: 0.7, conf: 0.92 }); A.render(); app.feed.push('tour.8', 'ok'); }],
    [43, () => { Object.assign(A.ar, { a: 0.5, conf: 0.5 }); A.render(); app.feed.push('tour.9', 'ok'); }],
    [47, () => { A.setTab('attraction'); A.tt.sys = 'attraction'; A.tt.n = 16; A.paint(); A.render(); A.runStudy(1); app.feed.push('tour.10', 'ok'); }],
    [52, () => { A.tt.n = 40; A.render(); A.runStudy(2); app.feed.push('tour.11', 'ok'); }],
    [57, () => { A.setTab('suggestion'); Object.assign(A.sg, { load: 0, fatigue: 0, depth: 0, h: 'high', reps: 1, trust: false, prompt: false }); A.paint(); A.render(); app.feed.push('tour.12', 'ok'); }],
    [61, () => { Object.assign(A.sg, { load: 0.8, fatigue: 1, depth: 1, reps: 10, trust: true }); A.paint(); A.render(); app.feed.push('tour.13', 'ok'); }],
    [67, () => { Object.assign(A.sg, { load: 0, fatigue: 0, depth: 0, trust: false, prompt: true }); A.paint(); A.render(); app.feed.push('tour.14', 'ok'); }],
    [74, () => { A.showReport(); app.feed.push('tour.15', 'ok'); }], [80, () => stopTour()],
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
    A.entered = true; A.setTab('atlas');
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
  addEventListener('pointerup', (e) => { if (A.entered) A.pointerUp(e); });
  addEventListener('keyup', (e) => { if (A.entered) A.keyUp(e.key === 'Shift' ? 'shift' : e.key.toLowerCase()); });
  addEventListener('blur', () => A.keys.clear());
  addEventListener('keydown', (e) => {
    if (!A.entered || e.target.matches?.('input, select, textarea')) return;
    if (e.key === 'Escape') { $('#report').classList.add('hidden'); return; }
    if (/^[1-6]$/.test(e.key)) A.setTab(TABS[+e.key - 1]);
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
  window.__mindscape = Object.assign(debug, { app, A, launch, startTour, step(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) frame(dt); } });
  void sfx;
  boot.classList.add('done');
} catch (err) {
  console.error(err);
  boot.textContent = 'Could not start: ' + (err?.message || err) + ' · WebGL is required.';
  boot.classList.add('err');
}
