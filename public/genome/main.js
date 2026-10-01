// GENOME ATHLETE — by Coach Colin.
// Shell: loop, input, guided tour, debrief. The app lives in app.js.

import { i18n } from './core/i18n.js';
import { createStage } from './core/scene.js';
import { Feed } from './core/feed.js';
import { initAudio, sfx, ambience } from './core/audio.js';
import { GenomeApp } from './app.js';
import { PRESETS } from './sim/genes.js';

const $ = (s) => document.querySelector(s);
const boot = $('#boot');
// Key art generated for this project with Higgsfield; the page works without it.
const KEYART = 'https://d8j0ntlcm91z4.cloudfront.net/user_3D17dPWC57zGXhL3gHkykFe9E5n/hf_20261001_114321_3112bc8a-19d6-4540-941e-6d1a02bc04c9.png';
const TABS = ['genome', 'inherit', 'train', 'plan'];

try {
  i18n.apply();
  { const img = new Image(); img.onload = () => { $('#keyart').style.backgroundImage = `url("${KEYART}")`; $('#keyart').classList.add('on'); }; img.src = KEYART; }
  const app = { stage: createStage($('#scene')), feed: new Feed($('#feed')), state: { time: 0 } };
  app.stage.grade.uniforms.uHolo.value = 0.35; app.stage.grade.uniforms.uStreak.value = 0.7; app.stage.bloom.strength = 0.42;
  const A = new GenomeApp(app);
  A.setTab('genome');

  // ── Tour ─────────────────────────────────────────
  const pick = (id) => { A.pick(id); if (A.tab === 'genome') A.render(); };
  const TOUR = [
    [0.5, () => { A.setTab('genome'); A.applyPreset('average'); app.feed.push('tour.1', 'ok'); }],
    [4, () => pick('ppargc1a')], [7, () => { pick('actn3'); app.feed.push('tour.2', 'ok'); }],
    [11, () => { A.panelView = 'power'; A.applyPreset('sprinter'); app.feed.push('tour.3', 'ok'); }],
    [17, () => { A.panelView = 'endurance'; A.applyPreset('marathoner'); app.feed.push('tour.4', 'ok'); }],
    [22, () => pick('col5a1')], [24, () => pick('gdf5')],
    [26, () => { A.partnerName = 'sprinter'; A.partner = PRESETS.sprinter(); A.inh.gene = 'actn3'; A.inh.panel = 'power'; A.score.punnett = true; A.setTab('inherit'); app.feed.push('tour.5', 'ok'); }],
    [32, () => { A.inh.mid = 60; A.score.breeder = true; A.render(); app.feed.push('tour.6', 'ok'); }],
    [38, () => { A.setTab('train'); A.tr.k = 6; A.score.train = true; A.score.responder = true; A.render(); app.feed.push('tour.7', 'ok'); }],
    [43, () => { A.tr.k = 21; A.render(); }], [48, () => { A.tr.k = 13; A.tr.weeks = 12; A.render(); }],
    [52, () => { A.setTab('plan'); app.feed.push('tour.8', 'ok'); }],
    [62, () => A.showReport()], [67, () => stopTour()],
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
    A.entered = true; A.setTab('genome');
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
  window.__genome = Object.assign(debug, { app, A, launch, startTour, step(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) frame(dt); } });
  void sfx;
  boot.classList.add('done');
} catch (err) {
  console.error(err);
  boot.textContent = 'Could not start: ' + (err?.message || err) + ' · WebGL is required.';
  boot.classList.add('err');
}
