// GRIDIRON IQ — by Coach Colin.
// One WebGL stage, one HUD, two modes:
//   FIELD        quarterback read simulator      (field/)
//   WEIGHT ROOM  Iron Lab lifting-form coach     (iron/)
// The shell below owns the loop, the panels and input routing; each mode owns its
// scene, tools, stages, live panel and debrief.

import { i18n } from './core/i18n.js';
import { createStage } from './core/scene.js';
import { StageSystem } from './core/stages.js';
import { Checklist, Mentor, Toolbar, Debrief } from './core/panels.js';
import { Feed } from './core/feed.js';
import { bus } from './core/bus.js';
import { initAudio, sfx } from './core/audio.js';
import { FieldMode } from './field/fieldMode.js';
import { FieldDemo } from './field/demo.js';
import { IronMode } from './iron/ironMode.js';
import { IronDemo } from './iron/demo.js';

const $ = (s) => document.querySelector(s);
const boot = $('#boot');

try {
  i18n.apply();

  const app = {
    state: { time: 0, paused: false },
    frame: 0,
    stage: createStage($('#scene')),
    live: $('#live'),
    chooser: $('#chooser'),
    feed: new Feed($('#feed')),
    debrief: new Debrief($('#debrief')),
    mode: null,
    banner(kicker, title) {
      const b = $('#banner');
      b.querySelector('.b-kicker').textContent = kicker;
      b.querySelector('.b-title').textContent = title;
      b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    },
    hoverTip(text, mouse) {
      const el = $('#hovertip');
      if (!text || !mouse) { el.classList.remove('on'); return; }
      if (el.textContent !== text) el.textContent = text;
      el.style.transform = `translate(${mouse.x + 16}px, ${mouse.y + 14}px)`;
      el.classList.add('on');
    },
  };
  app.stages = new StageSystem(app);
  app.checklist = new Checklist($('#checklist'), app.stages, app.state);
  app.mentor = new Mentor($('#mentor'), app.stages);
  app.toolbar = new Toolbar($('#toolbar'), $('#toolcard'));
  $('#chooser .ch-x').onclick = () => app.chooser.classList.add('hidden');

  const modes = { field: new FieldMode(app), iron: new IronMode(app) };
  const DEMOS = { field: FieldDemo, iron: IronDemo };

  // ── Mode switching ───────────────────────────────
  function setMode(id) {
    stopDemo();
    app.mode?.exit();
    app.debrief.hide();
    app.feed.clear();
    app.mode = modes[id];
    document.body.dataset.mode = id;
    app.mode.enter();
    refreshShell();
  }
  function refreshShell() {
    const id = app.mode?.id;
    if (!id) return;
    $('#mode-chip').textContent = i18n.t(id === 'field' ? 'app.mode.field' : 'app.mode.iron').toUpperCase();
    $('#hud-hint').textContent = i18n.t('app.hint.' + id);
    $('#btn-demo span').textContent = i18n.t(app.mode.demo ? 'app.demoStop' : 'app.demo');
  }
  i18n.onChange(refreshShell);

  // ── Demo ─────────────────────────────────────────
  function startDemo() {
    const id = app.mode.id;
    setMode(id);
    app.mode.demo = new DEMOS[id](app.mode, app, stopDemo);
    $('#demo-bar').classList.remove('hidden');
    $('#hud').classList.add('demo');
    refreshShell();
  }
  function stopDemo(takeover = false) {
    const m = app.mode;
    if (!m?.demo) return;
    m.demo.stop?.();
    m.demo = null;
    $('#demo-bar').classList.add('hidden');
    $('#hud').classList.remove('demo');
    if (takeover) app.feed.push('app.takeover', 'ok');
    refreshShell();
  }
  // Any real input during the demo hands control back to the user.
  const takeover = (e) => { if (e.isTrusted && app.mode?.demo && !e.target.closest?.('#btn-demo')) stopDemo(true); };
  addEventListener('pointerdown', takeover, true);
  addEventListener('keydown', takeover, true);

  // ── Start hub ────────────────────────────────────
  const ack = $('#ack');
  const gated = [...document.querySelectorAll('.mode-card'), $('#btn-start-demo')];
  ack.onchange = () => gated.forEach((b) => { b.disabled = !ack.checked; });
  const launch = (id, demo = false) => {
    initAudio();
    $('#start').classList.add('hidden');
    $('#hud').classList.remove('hidden');
    setMode(id);
    if (demo) startDemo();
  };
  document.querySelectorAll('.mode-card').forEach((b) => { b.onclick = () => launch(b.dataset.mode); });
  $('#btn-start-demo').onclick = () => launch('field', true);
  $('#btn-lang-start').onclick = () => i18n.toggle();
  $('#btn-lang').onclick = () => i18n.toggle();
  $('#btn-demo').onclick = () => (app.mode.demo ? stopDemo() : startDemo());
  $('#btn-switch').onclick = () => { sfx.select(); setMode(app.mode.id === 'field' ? 'iron' : 'field'); };
  $('#btn-end').onclick = () => { stopDemo(); app.mode.showDebrief(); };
  $('#btn-home').onclick = () => {
    stopDemo(); app.mode?.exit(); app.mode = null; app.debrief.hide();
    $('#hud').classList.add('hidden'); $('#start').classList.remove('hidden');
  };

  // ── Input routing ────────────────────────────────
  const canvas = $('#scene');
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointerdown', (e) => { if (!app.mode) return; canvas.setPointerCapture?.(e.pointerId); app.mode.pointerDown?.(e); });
  addEventListener('pointermove', (e) => { if (app.mode && (e.target === canvas || app.mode.cam?.drag)) app.mode.pointerMove?.(e); });
  addEventListener('pointerup', (e) => app.mode?.pointerUp?.(e));
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); app.mode?.wheel?.(e); }, { passive: false });
  addEventListener('keydown', (e) => {
    if (!app.mode || e.target.matches?.('input, textarea')) return;
    if (!$('#debrief').classList.contains('hidden')) { if (e.key === 'Escape') app.debrief.hide(); return; }
    if (/^[0-9]$/.test(e.key) && app.toolbar.press(e.key)) { e.preventDefault(); return; }
    if (app.mode.key?.(e)) e.preventDefault();
  });

  bus.on('stages:complete', () => { sfx.confirm(); });

  // ── Loop ─────────────────────────────────────────
  let last = performance.now();
  const debug = { renderPaused: false };
  function frame(dt) {
    app.state.time += dt;
    app.frame++;
    if (app.mode) {
      app.mode.update(dt, app.state.time);
      app.checklist.update();
      app.mentor.update();
    }
    if (!debug.renderPaused) app.stage.render(app.state.time, dt);
  }
  function loop(now) {
    const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));   // rAF time can precede the first performance.now()
    last = now;
    if (!debug.manual) frame(dt);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // Test / debug handle: step the simulation manually without rendering.
  window.__gridiron = Object.assign(debug, {
    app, modes, setMode, startDemo, stopDemo,
    step(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) frame(dt); },
  });

  boot.classList.add('done');
} catch (err) {
  console.error(err);
  boot.textContent = 'Could not start: ' + (err?.message || err) + ' · WebGL is required.';
  boot.classList.add('err');
}
