// DROPZONE: LOMPOC — by Coach Colin.
// Shell: loop, input, guided tour, debrief. The app lives in app.js.

import { i18n } from './core/i18n.js';
import { createStage } from './core/scene.js';
import { Feed } from './core/feed.js';
import { initAudio, sfx, ambience } from './core/audio.js';
import { Drop } from './app.js';

const $ = (s) => document.querySelector(s);
const boot = $('#boot');
// Key art generated for this project with Higgsfield; the page works without it.
const KEYART = 'https://d8j0ntlcm91z4.cloudfront.net/user_3D17dPWC57zGXhL3gHkykFe9E5n/hf_20261003_165617_fd311f46-dcee-4b04-be75-35753b08de60.png';
const TABS = ['drop', 'zone', 'range', 'match'];

try {
  i18n.apply();
  { const img = new Image(); img.onload = () => { $('#keyart').style.backgroundImage = `url("${KEYART}")`; $('#keyart').classList.add('on'); }; img.src = KEYART; }
  const app = { stage: createStage($('#scene')), feed: new Feed($('#feed')), state: { time: 0 } };
  app.stage.grade.uniforms.uHolo.value = 0.2; app.stage.grade.uniforms.uStreak.value = 1.3; app.stage.bloom.strength = 0.35; app.stage.bloom.threshold = 0.88; app.stage.renderer.toneMappingExposure = 0.95; app.stage.grade.uniforms.uHolo.value = 0.12;
  const A = new Drop(app);
  A.setTab('drop');

  // ── Tour ─────────────────────────────────────────
  const TOUR = [
    [0.5, () => { A.setTab('drop'); Object.assign(A.dp, { poi: 'oldtown', mode: 'track', deploy: 220 }); A.dp.jump = A.bestJump(); A.calcDrop(); A.render(); app.feed.push('tour.1', 'ok'); }],
    [4, () => { A.jump(); app.feed.push('tour.2', 'ok'); }],
    [22, () => { A.setTab('zone'); A.zn.phase = 0; A.zn.you = [...A.zn.cs[0].c]; A.render(); app.feed.push('tour.3', 'ok'); }],
    [27, () => { A.zn.phase = 1; A.zn.you = [...A.zn.cs[1].c]; A.render(); A.monteCarlo(2000); app.feed.push('tour.4', 'ok'); }],
    [32, () => { A.setTab('range'); Object.assign(A.rg, { R: 500, w: 6, holdE: 0, holdW: 0, shots: [] }); A.render(); A.fire(); app.feed.push('tour.5', 'ok'); }],
    [35, () => { const s = A.solution(500, 6); Object.assign(A.rg, { holdE: Math.round(s.holdE * 10) / 10, holdW: Math.round(s.holdW * 10) / 10 }); A.render(); A.fire(); app.feed.push('tour.6', 'ok'); }],
    [39, () => { A.setTab('match'); Object.assign(A.ms, { auto: true }); A.startMatch(24); A.ms.speed = 10; app.feed.push('tour.7', 'ok'); }],
    [100, () => { A.showReport(); app.feed.push('tour.8', 'ok'); }], [106, () => stopTour()],
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
    A.entered = true; A.setTab('drop');
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
    if (/^[1-4]$/.test(e.key)) A.setTab(TABS[+e.key - 1]);
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
  window.__dropzone = Object.assign(debug, { app, A, launch, startTour, step(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) frame(dt); } });
  void sfx;
  boot.classList.add('done');
} catch (err) {
  console.error(err);
  boot.textContent = 'Could not start: ' + (err?.message || err) + ' · WebGL is required.';
  boot.classList.add('err');
}
