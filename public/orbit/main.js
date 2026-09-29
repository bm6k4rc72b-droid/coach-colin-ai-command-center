// ORBIT — by Coach Colin.
// Shell: loop, input, guided tour, debrief. The app lives in app.js.

import { i18n } from './core/i18n.js';
import { createStage } from './core/scene.js';
import { Feed } from './core/feed.js';
import { initAudio, sfx, ambience } from './core/audio.js';
import { OrbitApp } from './app.js';

const $ = (s) => document.querySelector(s);
const boot = $('#boot');
// Key art generated for this project with Higgsfield; the page works without it.
const KEYART = 'https://d8j0ntlcm91z4.cloudfront.net/user_3D17dPWC57zGXhL3gHkykFe9E5n/hf_20260929_193132_35b4fb1a-7fd0-49d3-a69f-8b356f9940bd.png';

try {
  i18n.apply();
  { const img = new Image(); img.onload = () => { $('#keyart').style.backgroundImage = `url("${KEYART}")`; $('#keyart').classList.add('on'); }; img.src = KEYART; }
  const app = { stage: createStage($('#scene')), feed: new Feed($('#feed')), state: { time: 0 } };
  app.stage.grade.uniforms.uHolo.value = 0.45; app.stage.grade.uniforms.uStreak.value = 0.9;
  const O = new OrbitApp(app);
  O.setTab('cockpit');

  // ── Tour ─────────────────────────────────────────
  const TOUR = [
    [0.5, () => { O.setTab('cockpit'); O.jetReset('cruise'); O.view = 'cockpit'; app.feed.push('tour.1', 'ok'); }],
    [6, () => { O.jetReset('turn'); O.jet.stick = { x: 0.9, y: 0 }; O.jet.throttle = 1; O.jet.ab = true; app.feed.push('tour.2', 'ok'); }],
    [6.5, () => { O.jet.stick = { x: 0, y: 1 }; }], [7.2, () => { O.touch = { x: 0, y: 1 }; }], [10, () => { O.touch = null; O.view = 'chase'; }],
    [11, () => { O.jetReset('dash'); app.feed.push('tour.3', 'ok'); }], [15, () => { O.view = 'cockpit'; }],
    [18, () => { O.setTab('space'); O.warpAsc = 3; O.render(); O.ascLaunch(); app.feed.push('tour.4', 'ok'); }],
    [52, () => { if (O.asc.phase === 'orbit') { O.ascDeploy(); app.feed.push('tour.5', 'ok'); } }],
    [57, () => { O.toOrbitFromAscent(); O.setTab('orbit'); O.warpOrb = 3; O.render(); }],
    [59, () => { O.mission('raise'); app.feed.push('tour.6', 'ok'); }],
    [68, () => { O.setTab('range'); O.count.t = -60; O.count.run = true; O.render(); app.feed.push('tour.7', 'ok'); }],
    [70, () => { for (const T of O.surv.tracks) if (T.violation || T.src === 'primary') { O.sel = T.id; O.surv.resolve(T, T.kind === 'sea' ? 'uscg' : T.src === 'primary' ? 'intercept' : 'contact'); } O.fts.tested = true; }],
    [73, () => { app.feed.push('tour.8', 'ok'); }],
    [74, () => answer('gnss', 1)], [76, () => answer('replay', 1)], [78, () => answer('brute', 1)], [80, () => answer('jam', 0)], [82, () => answer('firmware', 1)],
    [96, () => { O.launchWarp = 20; }], [132, () => O.showReport()], [137, () => stopTour()],
  ];
  function answer(id, i) { const S = O.soc; if (!S.open.includes(id)) S.open.push(id); S.pick = id; if (S.done[id] === undefined) { S.done[id] = true; (S.choice ??= {})[id] = i; O.score.cyber++; } O.renderSoc(); }
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
    O.entered = true; O.setTab('cockpit'); app.feed.push('cap.cockpit', 'ok');
    if (withTour) startTour();
  };
  $('#btn-start').onclick = () => launch(false);
  $('#btn-start-tour').onclick = () => launch(true);
  $('#btn-lang-start').onclick = () => i18n.toggle();
  $('#btn-lang').onclick = () => i18n.toggle();
  $('#btn-tour').onclick = () => (tour ? stopTour() : startTour());
  $('#btn-report').onclick = () => O.showReport();
  $('#rep-close').onclick = () => $('#report').classList.add('hidden');
  $('#rep-print').onclick = () => print();
  document.querySelectorAll('#tabs [data-tab]').forEach((b) => { b.onclick = () => O.setTab(b.dataset.tab); });
  i18n.onChange(() => O.render());

  // ── Input ────────────────────────────────────────
  for (const el of [$('#scene'), $('#map')]) {
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('pointerdown', (e) => { if (!O.entered) return; el.setPointerCapture?.(e.pointerId); O.pointerDown(e); });
    el.addEventListener('wheel', (e) => { e.preventDefault(); if (O.entered) O.wheel(e); }, { passive: false });
  }
  addEventListener('pointermove', (e) => { if (O.entered) O.pointerMove(e); });
  addEventListener('pointerup', () => { if (O.entered) O.pointerUp(); });
  addEventListener('keydown', (e) => {
    if (!O.entered || e.target.matches?.('input, select, textarea')) return;
    if (e.key === 'Escape') { $('#report').classList.add('hidden'); return; }
    if (/^[1-4]$/.test(e.key)) O.setTab(['cockpit', 'space', 'orbit', 'range'][+e.key - 1]);
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) e.preventDefault();
  });

  // ── Loop ─────────────────────────────────────────
  let last = performance.now();
  const debug = { renderPaused: false, manual: false };
  function frame(dt) {
    app.state.time += dt;
    if (tour) { tour.t += dt; while (tour && tour.i < TOUR.length && tour.t >= TOUR[tour.i][0]) TOUR[tour.i++][1](); }
    O.update(dt, app.state.time);
    const fl = app.stage.grade.uniforms.uFlash; if (debug.renderPaused) fl.value = Math.max(0, fl.value - dt * 1.6);
    if (!debug.renderPaused) app.stage.render(app.state.time, dt);
  }
  function loop(now) { const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; if (!debug.manual) frame(dt); requestAnimationFrame(loop); }
  requestAnimationFrame(loop);
  window.__orbit = Object.assign(debug, { app, O, launch, startTour, step(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) frame(dt); } });
  void sfx;
  boot.classList.add('done');
} catch (err) {
  console.error(err);
  boot.textContent = 'Could not start: ' + (err?.message || err) + ' · WebGL is required.';
  boot.classList.add('err');
}
