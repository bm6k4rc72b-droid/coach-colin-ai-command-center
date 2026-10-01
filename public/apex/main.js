// APEX — by Coach Colin.
// Shell: loop, input, guided tour, debrief. The app lives in app.js.

import { i18n } from './core/i18n.js';
import { createStage } from './core/scene.js';
import { Feed } from './core/feed.js';
import { initAudio, sfx, ambience } from './core/audio.js';
import { Apex } from './app.js';

const $ = (s) => document.querySelector(s);
const boot = $('#boot');
// Key art generated for this project with Higgsfield; the page works without it.
const KEYART = 'https://d8j0ntlcm91z4.cloudfront.net/user_3D17dPWC57zGXhL3gHkykFe9E5n/hf_20261001_114321_fc895743-11dd-4055-bd43-e5ccb87dbceb.png';
const TABS = ['garage', 'lap', 'tyres', 'strategy'];

try {
  i18n.apply();
  { const img = new Image(); img.onload = () => { $('#keyart').style.backgroundImage = `url("${KEYART}")`; $('#keyart').classList.add('on'); }; img.src = KEYART; }
  const app = { stage: createStage($('#scene')), feed: new Feed($('#feed')), state: { time: 0 } };
  app.stage.grade.uniforms.uHolo.value = 0.25; app.stage.grade.uniforms.uStreak.value = 1.0;
  const A = new Apex(app);
  A.setTab('garage');

  // ── Tour ─────────────────────────────────────────
  const set = (k, v) => { A.setup[k] = v; A.score.setup = true; A.rerun(); A.render(); };
  const TOUR = [
    [0.5, () => { A.setTab('garage'); A.view.yaw = 0.8; A.view.r = 9; app.feed.push('tour.1', 'ok'); }],
    [5, () => { set('rw', 11); app.feed.push('tour.2', 'ok'); }],
    [10, () => { set('rw', 7); set('ride', 19); app.feed.push('tour.3', 'ok'); }],
    [15, () => { set('ride', 30); A.explodeOn = true; A.score.explode = true; A.render(); A.caption('cap.explode'); app.feed.push('tour.4', 'ok'); }],
    [21, () => { A.explodeOn = false; set('compound', 'soft'); set('fw', 8); }],
    [23, () => { A.setTab('lap'); A.play.t = 0; A.play.on = true; A.play.cam = 'chase'; A.score.lap = true; A.render(); app.feed.push('tour.5', 'ok'); }],
    [33, () => { A.play.cam = 'onboard'; A.score.onboard = true; A.render(); app.feed.push('tour.6', 'ok'); }],
    [41, () => { A.play.cam = 'tv'; A.render(); }], [48, () => { A.play.cam = 'heli'; A.render(); }],
    [54, () => { A.setTab('tyres'); A.tyre.compound = 'soft'; A.score.tyres = true; A.render(); app.feed.push('tour.7', 'ok'); }],
    [58, () => { A.tyre.Fz = 8000; A.render(); }], [61, () => { A.tyre.T = 70; A.render(); }], [64, () => { A.tyre.T = 100; A.tyre.Fz = 4000; A.render(); }],
    [66, () => { A.setTab('strategy'); app.feed.push('tour.8', 'ok'); }],
    [76, () => A.showReport()], [81, () => stopTour()],
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
    A.entered = true; A.setTab('garage');
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
  addEventListener('keydown', (e) => {
    if (!A.entered || e.target.matches?.('input, select, textarea')) return;
    if (e.key === 'Escape') { $('#report').classList.add('hidden'); return; }
    if (/^[1-4]$/.test(e.key)) A.setTab(TABS[+e.key - 1]);
    if (e.key === ' ') e.preventDefault();
    A.key(e.key.toLowerCase());
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
  window.__apex = Object.assign(debug, { app, A, launch, startTour, step(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) frame(dt); } });
  void sfx;
  boot.classList.add('done');
} catch (err) {
  console.error(err);
  boot.textContent = 'Could not start: ' + (err?.message || err) + ' · WebGL is required.';
  boot.classList.add('err');
}
