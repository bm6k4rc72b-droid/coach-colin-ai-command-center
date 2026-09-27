// RAPTOR LAB — by Coach Colin.
// Shell: loop, panels, input routing and the demo. The lab lives in lab.js;
// the physics in engine/model.js and engine/thermo.js.

import { i18n } from './core/i18n.js';
import { createStage } from './core/scene.js';
import { StageSystem } from './core/stages.js';
import { Checklist, Mentor, Toolbar, Debrief } from './core/panels.js';
import { Feed } from './core/feed.js';
import { bus } from './core/bus.js';
import { initAudio, sfx } from './core/audio.js';
import { Lab } from './lab.js';
import { RaptorDemo } from './demo.js';

const $ = (s) => document.querySelector(s);
const boot = $('#boot');
// Key art generated for this project with Higgsfield; the page works without it.
const KEYART = 'https://d8j0ntlcm91z4.cloudfront.net/user_3D17dPWC57zGXhL3gHkykFe9E5n/hf_20260927_054136_10c86129-e303-4f6e-bded-1951a7484982.png';

try {
  i18n.apply();
  { const img = new Image(); img.onload = () => { $('#keyart').style.backgroundImage = `url("${KEYART}")`; $('#keyart').classList.add('on'); }; img.src = KEYART; }

  const app = {
    state: { time: 0, paused: false },
    frame: 0,
    stage: createStage($('#scene')),
    live: $('#live'),
    chooser: $('#chooser'),
    feed: new Feed($('#feed')),
    debrief: new Debrief($('#debrief')),
    banner(kicker, title) {
      const b = $('#banner');
      b.querySelector('.b-kicker').textContent = kicker;
      b.querySelector('.b-title').textContent = title;
      b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    },
    setScope(title) { $('#scope').classList.toggle('hidden', !title); if (title) $('#scope-title').textContent = title; },
  };
  app.stage.renderer.toneMappingExposure = 0.92;
  app.stages = new StageSystem(app);
  app.checklist = new Checklist($('#checklist'), app.stages, app.state);
  app.mentor = new Mentor($('#mentor'), app.stages);
  app.toolbar = new Toolbar($('#toolbar'), $('#toolcard'));
  $('#chooser .ch-x').onclick = () => app.chooser.classList.add('hidden');

  const lab = new Lab(app);
  app.mode = lab;
  let entered = false;

  // ── Demo ─────────────────────────────────────────
  const refreshDemo = () => { $('#btn-demo span').textContent = i18n.t(lab.demo ? 'app.demoStop' : 'app.demoBtn'); };
  function startDemo() {
    stopDemo(); app.debrief.hide(); lab.newRun();
    lab.demo = new RaptorDemo(lab, app, () => stopDemo());
    $('#demo-bar').classList.remove('hidden'); refreshDemo();
  }
  function stopDemo(takeover = false) {
    if (!lab.demo) return;
    lab.demo.stop?.(); lab.demo = null;
    $('#demo-bar').classList.add('hidden');
    if (takeover) app.feed.push('app.takeover', 'ok');
    refreshDemo();
  }
  const takeover = (e) => { if (e.isTrusted && lab.demo && !e.target.closest?.('#btn-demo')) stopDemo(true); };
  addEventListener('pointerdown', takeover, true);
  addEventListener('keydown', takeover, true);
  i18n.onChange(refreshDemo);

  // ── Start screen ─────────────────────────────────
  const ack = $('#ack');
  ack.onchange = () => { $('#btn-start').disabled = $('#btn-start-demo').disabled = !ack.checked; };
  const launch = (demo) => {
    initAudio();
    $('#start').classList.add('hidden'); $('#keyart').classList.remove('on'); $('#keyart').style.display = 'none';
    $('#hud').classList.remove('hidden');
    if (!entered) { lab.enter(); entered = true; }
    if (demo) startDemo();
  };
  $('#btn-start').onclick = () => launch(false);
  $('#btn-start-demo').onclick = () => launch(true);
  $('#btn-lang-start').onclick = () => i18n.toggle();
  $('#btn-lang').onclick = () => i18n.toggle();
  $('#btn-demo').onclick = () => (lab.demo ? stopDemo() : startDemo());
  $('#btn-end').onclick = () => { stopDemo(); lab.showDebrief(); };
  $('#btn-view').onclick = () => lab.cycleView();
  $('#btn-cut').onclick = () => lab.toggleCutaway();
  $('#btn-exp').onclick = () => lab.toggleExplode();
  $('#btn-scope').onclick = () => lab.toggleScope();

  // ── Input ────────────────────────────────────────
  const canvas = $('#scene');
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => { if (!entered) return; canvas.setPointerCapture?.(e.pointerId); lab.pointerDown(e); });
  addEventListener('pointermove', (e) => { if (entered) lab.pointerMove(e); });
  addEventListener('pointerup', () => lab.pointerUp());
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); if (entered) lab.wheel(e); }, { passive: false });
  addEventListener('keydown', (e) => {
    if (!entered || e.target.matches?.('input, textarea')) return;
    if (!$('#debrief').classList.contains('hidden')) { if (e.key === 'Escape') app.debrief.hide(); return; }
    if (/^[0-9]$/.test(e.key) && app.toolbar.press(e.key)) { e.preventDefault(); return; }
    if (lab.key(e)) e.preventDefault();
  });
  bus.on('stages:complete', () => sfx.confirm());

  // ── Loop ─────────────────────────────────────────
  let last = performance.now();
  const debug = { renderPaused: false, manual: false };
  function frame(dt) {
    app.state.time += dt; app.frame++;
    if (entered) { lab.update(dt, app.state.time); app.checklist.update(); app.mentor.update(); }
    // The grade's flash decays on simulation time, rendered or not.
    const fl = app.stage.grade.uniforms.uFlash; if (debug.renderPaused) fl.value = Math.max(0, fl.value - dt * 1.6);
    if (!debug.renderPaused) {
      if (!entered) idleSpin(dt);
      app.stage.render(app.state.time, dt);
      if (entered) lab.postRender(app.stage.renderer);
    }
  }
  // Before entering, the stand turns slowly behind the start card.
  let idleSet = false;
  function idleSpin(dt) {
    if (!idleSet) { app.stage.use(lab.S.scene, lab.camera); idleSet = true; }
    lab.cam.yaw += dt * 0.05;
    lab.camera.position.set(Math.sin(lab.cam.yaw) * 13, 2.6, Math.cos(lab.cam.yaw) * 13); lab.camera.lookAt(0, 1.8, 0);
  }
  function loop(now) {
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    if (!debug.manual) frame(dt);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  window.__raptor = Object.assign(debug, { app, lab, startDemo, stopDemo, launch, step(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) frame(dt); } });
  boot.classList.add('done');
} catch (err) {
  console.error(err);
  boot.textContent = 'Could not start: ' + (err?.message || err) + ' · WebGL is required.';
  boot.classList.add('err');
}
