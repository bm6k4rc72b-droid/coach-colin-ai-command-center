// GUARDIAN — by Coach Colin.
// Shell: loop, input, guided tour, report. The app lives in app.js.

import { i18n } from './core/i18n.js';
import { createStage } from './core/scene.js';
import { Feed } from './core/feed.js';
import { initAudio, sfx, ambience } from './core/audio.js';
import { Guardian } from './app.js';

const $ = (s) => document.querySelector(s);
const boot = $('#boot');
// Key art generated for this project with Higgsfield; the page works without it.
const KEYART = 'https://d8j0ntlcm91z4.cloudfront.net/user_3D17dPWC57zGXhL3gHkykFe9E5n/hf_20260927_054137_0e63bc5e-0e24-43b0-8212-7f5b6a241a43.png';

try {
  i18n.apply();
  { const img = new Image(); img.onload = () => { $('#keyart').style.backgroundImage = `url("${KEYART}")`; $('#keyart').classList.add('on'); }; img.src = KEYART; }
  const app = { stage: createStage($('#scene')), feed: new Feed($('#feed')), state: { time: 0 } };
  app.stage.renderer.toneMappingExposure = 0.8;
  app.stage.bloom.strength = 0.4; app.stage.bloom.threshold = 0.9; app.stage.grade.uniforms.uHolo.value = 0.4;
  const G = new Guardian(app);
  let entered = false;

  // ── Tour ─────────────────────────────────────────
  const TOUR = [
    [0.5, () => { G.setTab('home'); app.feed.push('tour.1', 'ok'); }], [2, () => G.select('dimHall')], [4, () => { G.applyFix('dimHall'); G.render(); }],
    [5.5, () => G.select('rug')], [7, () => { G.applyFix('rug'); G.render(); }], [8.5, () => { G.select('grab'); app.feed.push('tour.2', 'ok'); }], [10, () => { G.applyFix('grab'); G.render(); }],
    [11, () => { G.applyFix('bathFloor'); G.applyFix('stairs'); G.applyFix('bedLight'); G.render(); }], [12.5, () => { G.closeDetail(); app.feed.push('tour.3', 'ok'); G.startWalk(); }],
    [28, () => G.setTab('balance')], [31, () => { G.bal.answers = { worried: true, push: true, rush: true }; G.bal.tug = 10.4; G.bal.chair = 11; G.bal.tandem = 10; G.render(); }],
    [35, () => G.setTab('scams')], [37, () => G.scam.found.add('p2')], [37.2, () => { G.scam.found.add('p3'); G.scam.found.add('p4'); G.scam.found.add('p5'); G.scam.answered = true; G.scam.choice = true; G.render(); }],
    [42, () => G.setTab('care')], [44, () => { G.care.meds.noon = 'taken'; G.care.checkin = '09:12'; G.render(); }], [47, () => G.showReport()], [52, () => stopTour()],
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
    entered = true; G.setTab('home'); app.feed.push('feed.welcome', 'ok');
    if (withTour) startTour();
  };
  $('#btn-start').onclick = () => launch(false);
  $('#btn-start-tour').onclick = () => launch(true);
  $('#btn-lang-start').onclick = () => i18n.toggle();
  $('#btn-lang').onclick = () => i18n.toggle();
  $('#btn-tour').onclick = () => (tour ? stopTour() : startTour());
  $('#btn-report').onclick = () => G.showReport();
  $('#rep-close').onclick = () => $('#report').classList.add('hidden');
  $('#rep-print').onclick = () => print();
  $('#detail .d-x').onclick = () => G.closeDetail();
  document.querySelectorAll('#tabs [data-tab]').forEach((b) => { b.onclick = () => G.setTab(b.dataset.tab); });
  i18n.onChange(() => G.render());

  // ── Input ────────────────────────────────────────
  const canvas = $('#scene');
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => { if (!entered) return; canvas.setPointerCapture?.(e.pointerId); G.pointerDown(e); });
  addEventListener('pointermove', (e) => { if (entered) G.pointerMove(e); });
  addEventListener('pointerup', (e) => { if (entered) G.pointerUp(e); });
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); if (entered) G.wheel(e); }, { passive: false });
  addEventListener('keydown', (e) => {
    if (!entered || e.target.matches?.('input, select, textarea')) return;
    if (e.key === 'Escape') { $('#report').classList.add('hidden'); G.closeDetail(); return; }
    if (/^[1-4]$/.test(e.key)) G.setTab(['home', 'balance', 'scams', 'care'][+e.key - 1]);
    if (e.key.toLowerCase() === 'n' && G.tab === 'home') G.startWalk();
  });

  // ── Loop ─────────────────────────────────────────
  let last = performance.now();
  const debug = { renderPaused: false, manual: false };
  function frame(dt) {
    app.state.time += dt;
    if (tour) { tour.t += dt; while (tour && tour.i < TOUR.length && tour.t >= TOUR[tour.i][0]) TOUR[tour.i++][1](); }
    if (!entered) G.cam.goal.yaw += dt * 0.05;
    G.update(dt, app.state.time);
    const fl = app.stage.grade.uniforms.uFlash; if (debug.renderPaused) fl.value = Math.max(0, fl.value - dt * 1.6);
    if (!debug.renderPaused) app.stage.render(app.state.time, dt);
  }
  function loop(now) { const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; if (!debug.manual) frame(dt); requestAnimationFrame(loop); }
  requestAnimationFrame(loop);
  window.__guardian = Object.assign(debug, { app, G, launch, startTour, step(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) frame(dt); } });
  void sfx;
  boot.classList.add('done');
} catch (err) {
  console.error(err);
  boot.textContent = 'Could not start: ' + (err?.message || err) + ' · WebGL is required.';
  boot.classList.add('err');
}
