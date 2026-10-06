// TWO MINDS — by Coach Colin.
// Shell: loop, input, guided tour, debrief. The app lives in app.js.

import { i18n } from './core/i18n.js';
import { createStage } from './core/scene.js';
import { Feed } from './core/feed.js';
import { initAudio, sfx, ambience } from './core/audio.js';
import { Minds } from './app.js';

const $ = (s) => document.querySelector(s);
const boot = $('#boot');
// Key art generated for this project with Higgsfield; the page works without it.
const KEYART = 'https://d8j0ntlcm91z4.cloudfront.net/user_3D17dPWC57zGXhL3gHkykFe9E5n/hf_20261006_084115_743f4ed1-7fd5-4165-a00e-709de7d6ca8e.png';
const TABS = ['split', 'brain', 'roots', 'tribes', 'bridge'];

try {
  i18n.apply();
  { const img = new Image(); img.onload = () => { $('#keyart').style.backgroundImage = `url("${KEYART}")`; $('#keyart').classList.add('on'); }; img.src = KEYART; }
  const app = { stage: createStage($('#scene')), feed: new Feed($('#feed')), state: { time: 0 } };
  app.stage.grade.uniforms.uHolo.value = 0.25; app.stage.grade.uniforms.uStreak.value = 1.0; app.stage.bloom.strength = 0.3; app.stage.bloom.threshold = 0.9; app.stage.bloom.radius = 0.5; app.stage.renderer.toneMappingExposure = 0.85;
  const A = new Minds(app);
  A.setTab('split');

  // ── Tour ─────────────────────────────────────────
  const TOUR = [
    [0.5, () => { A.setTab('split'); app.feed.push('tour.1', 'ok'); }],
    [5, () => { A.sp.ans = [1, 0, 1, -1, 1]; A.render(); document.querySelector('[data-ans="4:1"]')?.click(); app.feed.push('tour.2', 'ok'); }],
    [10, () => { A.setTab('brain'); Object.assign(A.br, { benefit: 10, threat: 6, unc: 0.7, lambda: 2.4, iu: 1.2 }); A.render(); app.feed.push('tour.3', 'ok'); }],
    [15, () => { Object.assign(A.br, { unc: 0.3, lambda: 1, iu: 0.2 }); A.render(); app.feed.push('tour.4', 'ok'); }],
    [20, () => { A.setTab('roots'); Object.assign(A.rt, { harsh: 0.9, unpred: 0.9, support: 0.1, autonomy: 0.1, age: 25 }); A.render(); app.feed.push('tour.5', 'ok'); }],
    [25, () => { Object.assign(A.rt, { harsh: 0.4, unpred: 0.2, support: 0.9, autonomy: 0.8 }); A.render(); app.feed.push('tour.6', 'ok'); }],
    [30, () => { A.setTab('tribes'); A.tr.S = A.newSociety(5); Object.assign(A.tr, { eps: 0.4, h: 0.6, zeal: 0 }); A.render(); app.feed.push('tour.7', 'ok'); }],
    [38, () => { A.tr.eps = 0.95; A.render(); app.feed.push('tour.8', 'ok'); }],
    [44, () => { A.setTab('bridge'); A.bg.who = 'privacy'; A.render(); A.talk('mock'); app.feed.push('tour.9', 'ok'); }],
    [47, () => { A.bg.who = 'worker'; A.render(); A.talk('concerns'); A.talk('choice'); }],
    [49, () => { A.bg.who = 'artist'; A.render(); A.talk('concerns'); A.talk('choice'); A.talk('messenger'); }],
    [51, () => { A.bg.who = 'elder'; A.render(); A.talk('handsOn'); A.talk('messenger'); app.feed.push('tour.10', 'ok'); }],
    [57, () => { A.showReport(); app.feed.push('tour.11', 'ok'); }], [63, () => stopTour()],
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
    A.entered = true; A.setTab('split');
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
  window.__aidivide = Object.assign(debug, { app, A, launch, startTour, step(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) frame(dt); } });
  void sfx;
  boot.classList.add('done');
} catch (err) {
  console.error(err);
  boot.textContent = 'Could not start: ' + (err?.message || err) + ' · WebGL is required.';
  boot.classList.add('err');
}
