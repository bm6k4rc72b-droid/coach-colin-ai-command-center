// HEARTBEAT — by Coach Colin.
// Shell: loop, input, guided tour, debrief. The app lives in app.js.

import { i18n } from './core/i18n.js';
import { createStage } from './core/scene.js';
import { Feed } from './core/feed.js';
import { initAudio, sfx, ambience } from './core/audio.js';
import { Heartbeat } from './app.js';

const $ = (s) => document.querySelector(s);
const boot = $('#boot');
// Key art generated for this project with Higgsfield; the page works without it.
const KEYART = 'https://d8j0ntlcm91z4.cloudfront.net/user_3D17dPWC57zGXhL3gHkykFe9E5n/hf_20260929_180450_c33fc9fe-b38d-4224-a89f-2e2671ff506e.png';

try {
  i18n.apply();
  { const img = new Image(); img.onload = () => { $('#keyart').style.backgroundImage = `url("${KEYART}")`; $('#keyart').classList.add('on'); }; img.src = KEYART; }
  const app = { stage: createStage($('#scene')), feed: new Feed($('#feed')), state: { time: 0 } };
  app.stage.renderer.toneMappingExposure = 0.95;
  app.stage.bloom.strength = 0.85; app.stage.bloom.threshold = 0.55; app.stage.bloom.radius = 0.55;
  app.stage.grade.uniforms.uHolo.value = 0.6; app.stage.grade.uniforms.uStreak.value = 0.8;
  const H = new Heartbeat(app);
  H.setTab('heart');

  // ── Tour ─────────────────────────────────────────
  const TOUR = [
    [0.5, () => { H.setTab('heart'); H.applyPreset('rest'); app.feed.push('tour.1', 'ok'); }],
    [5, () => { H.applyPreset('exercise'); app.feed.push('tour.2', 'ok'); }],
    [10, () => { H.applyPreset('af'); app.feed.push('tour.3', 'warn'); }],
    [15, () => H.launchEmbolus()],
    [20.5, () => { for (const k of ['E', 'F', 'A', 'S', 'T']) H.toggleBF(k); }],
    [22, () => { H.speedCase = 2; H.render(); H.act('call'); app.feed.push('tour.4', 'ok'); }],
    [25, () => H.act('ct')], [26.5, () => H.act('cta')], [27.4, () => { H.act('lysis'); H.act('evt'); }],
    [33, () => app.feed.push('tour.5', 'ok')], [36, () => { H.speedCase = 0; H.render(); }],
    [40, () => { H.setTab('mito'); H.speedMito = 2; H.mitoSet('core'); app.feed.push('tour.6', 'warn'); }],
    [46, () => { H.mitoSet('reperf'); app.feed.push('tour.7', 'bad'); }],
    [55, () => { H.mitoSet('core'); H.neuron.sdhBlock = true; H.render(); app.feed.push('tour.8', 'ok'); }],
    [61, () => H.mitoSet('reperf')],
    [69, () => { H.setTab('recovery'); H.rec.month = 0; H.rec.play = true; app.feed.push('tour.9', 'ok'); }],
    [85, () => H.showReport()], [90, () => stopTour()],
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
    initAudio(); ambience(0.025);
    $('#start').classList.add('hidden'); $('#keyart').style.display = 'none'; $('#hud').classList.remove('hidden');
    H.entered = true; H.setTab('heart'); app.feed.push('feed.welcome', 'ok');
    if (withTour) startTour();
  };
  $('#btn-start').onclick = () => launch(false);
  $('#btn-start-tour').onclick = () => launch(true);
  $('#btn-lang-start').onclick = () => i18n.toggle();
  $('#btn-lang').onclick = () => i18n.toggle();
  $('#btn-tour').onclick = () => (tour ? stopTour() : startTour());
  $('#btn-report').onclick = () => H.showReport();
  $('#rep-close').onclick = () => $('#report').classList.add('hidden');
  $('#rep-print').onclick = () => print();
  document.querySelectorAll('#tabs [data-tab]').forEach((b) => { b.onclick = () => H.setTab(b.dataset.tab); });
  i18n.onChange(() => H.render());

  // ── Input ────────────────────────────────────────
  const canvas = $('#scene');
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => { if (!H.entered) return; canvas.setPointerCapture?.(e.pointerId); H.pointerDown(e); });
  addEventListener('pointermove', (e) => { if (H.entered) H.pointerMove(e); });
  addEventListener('pointerup', () => { if (H.entered) H.pointerUp(); });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); if (H.entered) H.wheel(e); }, { passive: false });
  addEventListener('keydown', (e) => {
    if (!H.entered || e.target.matches?.('input, select, textarea')) return;
    if (e.key === 'Escape') { $('#report').classList.add('hidden'); return; }
    if (/^[1-4]$/.test(e.key)) H.setTab(['heart', 'stroke', 'mito', 'recovery'][+e.key - 1]);
    if (e.key === ' ') { e.preventDefault(); if (H.tab === 'stroke' && H.sc) H.caseRun = !H.caseRun; if (H.tab === 'mito') H.mitoRun = !H.mitoRun; if (H.tab === 'recovery') H.rec.play = !H.rec.play; H.render(); }
  });

  // ── Loop ─────────────────────────────────────────
  let last = performance.now();
  const debug = { renderPaused: false, manual: false };
  function frame(dt) {
    app.state.time += dt;
    if (tour) { tour.t += dt; while (tour && tour.i < TOUR.length && tour.t >= TOUR[tour.i][0]) TOUR[tour.i++][1](); }
    if (!H.entered) H.cam.goal.yaw += dt * 0.05;
    H.update(dt, app.state.time);
    const fl = app.stage.grade.uniforms.uFlash; if (debug.renderPaused) fl.value = Math.max(0, fl.value - dt * 1.6);
    if (!debug.renderPaused) app.stage.render(app.state.time, dt);
  }
  function loop(now) { const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; if (!debug.manual) frame(dt); requestAnimationFrame(loop); }
  requestAnimationFrame(loop);
  window.__heartbeat = Object.assign(debug, { app, H, launch, startTour, step(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) frame(dt); } });
  void sfx;
  boot.classList.add('done');
} catch (err) {
  console.error(err);
  boot.textContent = 'Could not start: ' + (err?.message || err) + ' · WebGL is required.';
  boot.classList.add('err');
}
