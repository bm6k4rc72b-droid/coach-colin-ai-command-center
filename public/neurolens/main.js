// NEUROLENS — by Coach Colin.
// Shell: loop, input, guided tour, report. The app lives in app.js.

import { i18n } from './core/i18n.js';
import { createStage } from './core/scene.js';
import { Feed } from './core/feed.js';
import { initAudio, sfx, ambience } from './core/audio.js';
import { NeuroLens } from './app.js';

const $ = (s) => document.querySelector(s);
const boot = $('#boot');
// Key art generated for this project with Higgsfield; the page works without it.
const KEYART = 'https://d8j0ntlcm91z4.cloudfront.net/user_3D17dPWC57zGXhL3gHkykFe9E5n/hf_20261001_041255_37779acb-3af8-4e85-99e1-76c9f4a0b071.png';
const TABS = ['brain', 'viewer', 'screen', 'photo'];

try {
  i18n.apply();
  { const img = new Image(); img.onload = () => { $('#keyart').style.backgroundImage = `url("${KEYART}")`; $('#keyart').classList.add('on'); }; img.src = KEYART; }
  const app = { stage: createStage($('#scene')), feed: new Feed($('#feed')), state: { time: 0 } };
  const N = new NeuroLens(app);
  N.setTab('brain');

  // ── Tour ─────────────────────────────────────────
  const pick = (k) => $(`[data-rg="${k}"]`)?.click();
  const TOUR = [
    [0.5, () => { N.setTab('brain'); app.feed.push('tour.1', 'ok'); }],
    [2, () => pick('vta')], [5, () => pick('nacc')], [8, () => pick('amyg')], [11, () => pick('dmn')],
    [14, () => { $('[data-sc="omitted"]')?.click(); app.feed.push('tour.2', 'ok'); }],
    [19, () => { N.setTab('viewer'); N.setPreset('scroller'); app.feed.push('tour.3', 'ok'); }],
    [25, () => { N.setTab('screen'); N.loadReel('launch'); N.start(); app.feed.push('tour.4', 'ok'); }],
    [58, () => { N.loadReel('tuned'); N.start(); app.feed.push('tour.5', 'ok'); }],
    [64, () => { N.sel = 2; N.reel[2].dur = 2.0; N.edits++; N.score.edited = true; N.render(); }],
    [90, () => { N.setTab('photo'); app.feed.push('tour.6', 'ok'); }],
    [94, () => { $('[data-ph="eyes"]')?.click(); }],
    [99, () => N.showReport()], [104, () => stopTour()],
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
    initAudio(); ambience(0.02);
    $('#start').classList.add('hidden'); $('#keyart').style.display = 'none'; $('#hud').classList.remove('hidden');
    N.entered = true; N.setTab('brain');
    if (withTour) startTour();
  };
  $('#btn-start').onclick = () => launch(false);
  $('#btn-start-tour').onclick = () => launch(true);
  $('#btn-lang-start').onclick = () => i18n.toggle();
  $('#btn-lang').onclick = () => i18n.toggle();
  $('#btn-tour').onclick = () => (tour ? stopTour() : startTour());
  $('#btn-report').onclick = () => N.showReport();
  $('#rep-close').onclick = () => $('#report').classList.add('hidden');
  $('#rep-print').onclick = () => print();
  document.querySelectorAll('#tabs [data-tab]').forEach((b) => { b.onclick = () => N.setTab(b.dataset.tab); });
  i18n.onChange(() => { $('#labels').innerHTML = ''; N.render(); });

  // ── Input ────────────────────────────────────────
  const el = $('#scene');
  el.addEventListener('pointerdown', (e) => { if (!N.entered) return; el.setPointerCapture?.(e.pointerId); N.pointerDown(e); });
  el.addEventListener('wheel', (e) => { e.preventDefault(); if (N.entered) N.wheel(e); }, { passive: false });
  addEventListener('pointermove', (e) => { if (N.entered) N.pointerMove(e); });
  addEventListener('pointerup', () => { if (N.entered) N.pointerUp(); });
  addEventListener('resize', () => { if (N.tab === 'photo') N.drawPhotoOverlay(); });
  addEventListener('keydown', (e) => {
    if (!N.entered || e.target.matches?.('input, select, textarea')) return;
    if (e.key === 'Escape') { $('#report').classList.add('hidden'); return; }
    if (/^[1-4]$/.test(e.key)) N.setTab(TABS[+e.key - 1]);
    if (e.key === ' ') e.preventDefault();
    N.key(e.key);
  });

  // ── Loop ─────────────────────────────────────────
  let last = performance.now();
  const debug = { renderPaused: false, manual: false };
  function frame(dt) {
    app.state.time += dt;
    if (tour) { tour.t += dt; while (tour && tour.i < TOUR.length && tour.t >= TOUR[tour.i][0]) TOUR[tour.i++][1](); }
    N.update(dt, app.state.time);
    if (!debug.renderPaused) app.stage.render(app.state.time, dt);
  }
  function loop(now) { const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; if (!debug.manual) frame(dt); requestAnimationFrame(loop); }
  requestAnimationFrame(loop);
  window.__neuro = Object.assign(debug, { app, N, launch, startTour, step(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) frame(dt); } });
  void sfx;
  boot.classList.add('done');
} catch (err) {
  console.error(err);
  boot.textContent = 'Could not start: ' + (err?.message || err) + ' · WebGL is required.';
  boot.classList.add('err');
}
