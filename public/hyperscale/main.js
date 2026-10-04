// HYPERSCALE — by Coach Colin.
// Shell: loop, input, guided tour, debrief. The app lives in app.js.

import { i18n } from './core/i18n.js';
import { createStage } from './core/scene.js';
import { Feed } from './core/feed.js';
import { initAudio, sfx, ambience } from './core/audio.js';
import { Hyperscale } from './app.js';

const $ = (s) => document.querySelector(s);
const boot = $('#boot');
// Key art generated for this project with Higgsfield; the page works without it.
const KEYART = 'https://d8j0ntlcm91z4.cloudfront.net/user_3D17dPWC57zGXhL3gHkykFe9E5n/hf_20261004_230621_e9fe1e7a-fb82-4c58-8d15-22df6f5930c5.png';
const TABS = ['train', 'power', 'cool', 'fabric', 'ops'];

try {
  i18n.apply();
  { const img = new Image(); img.onload = () => { $('#keyart').style.backgroundImage = `url("${KEYART}")`; $('#keyart').classList.add('on'); }; img.src = KEYART; }
  const app = { stage: createStage($('#scene')), feed: new Feed($('#feed')), state: { time: 0 } };
  app.stage.grade.uniforms.uHolo.value = 0.25; app.stage.grade.uniforms.uStreak.value = 1.1; app.stage.bloom.strength = 0.6; app.stage.bloom.threshold = 0.8; app.stage.bloom.radius = 0.5;
  const A = new Hyperscale(app);
  A.setTab('train');

  // ── Tour ─────────────────────────────────────────
  const TOUR = [
    [0.5, () => { A.setTab('train'); Object.assign(A.tr, { lN: Math.log10(70e9), lD: Math.log10(1.4e12), ln: 12, mfu: 0.4 }); A.acc = 'a700'; A.render(); app.feed.push('tour.1', 'ok'); }],
    [6, () => { Object.assign(A.tr, { lN: Math.log10(105e9), lD: Math.log10(13.5e12), ln: 13, mfu: 0.45 }); A.acc = 'a1000'; A.render(); app.feed.push('tour.2', 'ok'); }],
    [12, () => { A.setTab('power'); Object.assign(A.pw, { ln: 16, pue: 1.35, supply: 'grid' }); A.render(); app.feed.push('tour.3', 'ok'); }],
    [17, () => { Object.assign(A.pw, { pue: 1.1, supply: 'solar' }); A.render(); app.feed.push('tour.4', 'ok'); }],
    [22, () => { A.setTab('cool'); Object.assign(A.cl, { mode: 'air', amb: 35, rack: 100 }); A.render(); app.feed.push('tour.5', 'ok'); }],
    [26, () => { Object.assign(A.cl, { mode: 'tower', supply: 30 }); A.render(); app.feed.push('tour.6', 'ok'); }],
    [30, () => { Object.assign(A.cl, { mode: 'dry', supply: 44 }); A.render(); app.feed.push('tour.7', 'ok'); }],
    [35, () => { A.setTab('fabric'); Object.assign(A.fb, { ln: 16, gbps: 400, k: 64, m: 8 }); A.render(); app.feed.push('tour.8', 'ok'); }],
    [40, () => { Object.assign(A.fb, { m: 64, gbps: 800 }); A.render(); app.feed.push('tour.9', 'ok'); }],
    [45, () => { A.auto = true; A.setTab('ops'); A.op.rate = 0.75; A.startDay(); app.feed.push('tour.10', 'ok'); }],
    [82, () => { A.showReport(); app.feed.push('tour.11', 'ok'); }], [88, () => stopTour()],
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
    A.entered = true; A.setTab('train');
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
  window.__hyperscale = Object.assign(debug, { app, A, launch, startTour, step(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) frame(dt); } });
  void sfx;
  boot.classList.add('done');
} catch (err) {
  console.error(err);
  boot.textContent = 'Could not start: ' + (err?.message || err) + ' · WebGL is required.';
  boot.classList.add('err');
}
