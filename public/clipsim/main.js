// CLIPSIM: IC-PC aneurysm clipping simulator, by Coach Colin.
// For education and demonstration only. Not clinical training or medical advice.
import * as THREE from 'three';
import { MICROSCOPE } from './config/anatomy.js';
import { createRenderer } from './scene/renderer.js';
import { createLights } from './scene/lights.js';
import { createPostFX } from './scene/postfx.js';
import { MicroscopeControls } from './scene/controls.js';
import { buildAnatomy } from './anatomy/index.js';
import { Heart } from './physics/heart.js';
import { i18n } from './ui/i18n.js';
import { Inspector } from './ui/inspector.js';
import { Labels } from './ui/labels.js';
import { Feed } from './ui/feed.js';
import { Toolbar } from './ui/toolbar.js';
import { ToolManager } from './tools/index.js';
import { Bleeding } from './physics/bleeding.js';
import { RuptureRisk } from './physics/risk.js';
import { Flow } from './physics/flow.js';
import { bus } from './procedure/bus.js';
import { initAudio } from './audio/engine.js';
import { StageSystem } from './procedure/stageSystem.js';
import { Checklist } from './ui/checklist.js';
import { Mentor } from './ui/mentor.js';

const $ = (id) => document.getElementById(id);

function boot() {
  const canvas = $('scene');
  const { renderer, scene, camera } = createRenderer(canvas);
  const anatomy = buildAnatomy();
  scene.add(anatomy.root);

  const controls = new MicroscopeControls(camera, canvas);
  const lights = createLights(scene, camera);
  const fx = createPostFX(renderer, scene, camera);
  const heart = new Heart();
  const inspector = new Inspector(camera, canvas, anatomy.pickables);
  const labels = new Labels(camera, anatomy);

  const state = { started: false, time: 0 };
  const bleeding = new Bleeding(scene, anatomy.pickables);
  const risk = new RuptureRisk();
  const flow = new Flow();
  const feed = new Feed($('feed'));

  // Geometry helpers shared by the tools (all distances in mm).
  const g = anatomy.aneurysm.geometry;
  const blebR = anatomy.aneurysm.bleb.geometry.parameters.radius;
  const geo = {
    neckRadius: g.neckRadius,
    distToDome: (p) => p.distanceTo(g.domeCenter) - g.domeRadius,
    distToBleb: (p) => p.distanceTo(g.blebWorld) - blebR,
    distToNeck: (p) => p.distanceTo(g.neckPlane),
  };

  // Minimal tween runner for short tool animations.
  const tweens = [];
  const animate = (dur, fn, done) => tweens.push({ t: 0, dur, fn, done });

  // Running tallies for the debrief.
  const stats = { arachnoidCut: 0, suctionTime: 0, bipolarTime: 0, roughTime: 0, injuries: [], tempOcclusion: 0, icgRuns: 0, endoscopeUses: 0 };

  const ctx = { THREE, scene, camera, canvas, renderer, anatomy, controls, lights, fx, heart, inspector, labels, bleeding, risk, flow, feed, geo, animate, stats, state, i18n, bus };
  const tools = new ToolManager(ctx);
  new Toolbar($('toolbar'), $('toolcard'), tools);
  const stages = new StageSystem(ctx);
  const checklist = new Checklist($('checklist'), stages, state);
  const mentor = new Mentor($('mentor'), stages);

  // Cinematic stage-complete banner.
  const banner = (kicker, title) => {
    const b = $('banner');
    b.querySelector('.b-kicker').textContent = kicker;
    b.querySelector('.b-title').textContent = title;
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
  };
  bus.on('stage:complete', ({ index, id }) => {
    const last = index === stages.stages.length - 1;
    banner(i18n.t(last ? 'banner.all' : 'banner.stage').replace('{n}', index + 1), i18n.t('stage.' + id));
  });
  bus.on('risk:warn', ({ reason }) => feed.push('risk.' + reason, reason.includes('Bleb') || reason.includes('bleb') || reason === 'scissorsDome' ? 'bad' : 'warn'));

  // ── UI wiring ────────────────────────────────────
  i18n.apply();
  $('btn-lang').onclick = $('btn-lang-start').onclick = () => i18n.toggle();
  $('ack').onchange = (e) => { $('btn-start').disabled = !e.target.checked; };
  $('btn-start').onclick = () => {
    initAudio();
    state.started = true;
    stages.start();
    $('start').classList.add('hidden');
    $('hud').classList.remove('hidden');
    controls.reset();
  };
  $('btn-labels').onclick = () => labels.toggle();
  $('btn-reset').onclick = () => controls.reset();
  $('btn-tool-none').onclick = () => tools.select(null);

  window.addEventListener('keydown', (e) => {
    if (!state.started || e.target.tagName === 'INPUT') return;
    const k = e.key.toLowerCase();
    if (k === 'l') labels.toggle();
    else if (k === 'r') controls.reset();
    else if (k === 'f' && inspector.hit) controls.focusOn(inspector.hit.point);
  });

  // ── Main loop ────────────────────────────────────
  const clock = new THREE.Clock();
  const center = new THREE.Vector2(0, 0);
  let frame = 0;
  function tick() {
    const dt = Math.min(clock.getDelta(), 0.05);
    state.time += dt;
    frame++;

    if (!state.started) {
      // Attract mode behind the start screen: a slow drift around the field.
      controls.set({ yaw: MICROSCOPE.startYawDeg * Math.PI / 180 + Math.sin(state.time * 0.15) * 0.5, tilt: 0.38 + Math.sin(state.time * 0.11) * 0.08 });
    }
    controls.update(dt);
    heart.update(dt);
    lights.update(controls.target);
    if (state.started) {
      inspector.update();
      tools.update(dt, state.time);
      stages.update(dt);
    }
    bleeding.update(dt, state.time, heart.pressure);
    risk.update(dt);
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur);
      tw.fn(k);
      if (k >= 1) { tweens.splice(i, 1); tw.done?.(); }
    }
    labels.update();

    // Autofocus on whatever is under the cursor, else on the centre of the field.
    if (frame % 3 === 0) {
      const hit = inspector.hit || inspector.pick(center);
      const d = hit ? hit.distance : controls.cur.distance;
      state.focusGoal = d;
    }
    fx.setFocus(state.focusGoal ?? controls.cur.distance, dt);

    if (state.started && frame % 6 === 0) {
      checklist.update();
      mentor.update();
      $('ro-focus').textContent = fx.bokeh.uniforms.focus.value.toFixed(1);
      $('ro-wd').textContent = controls.cur.distance.toFixed(0);
      $('ro-mag').textContent = (MICROSCOPE.distance * 6 / controls.cur.distance).toFixed(1);
      $('ro-pool').textContent = bleeding.volume.toFixed(1);
      $('ro-ebl').textContent = bleeding.totalLoss.toFixed(0);
      $('ro-neck').textContent = Math.round(anatomy.adhesions.progress * 100);
      const occl = (state.tempClipOn ? state.time - state.tempClipStart : 0);
      $('ro-temp').textContent = state.tempClipOn ? `${String(Math.floor(occl / 60)).padStart(2, '0')}:${String(Math.floor(occl % 60)).padStart(2, '0')}` : '—';
      $('ro-temp').classList.toggle('alert', occl > 300);
      const cp = state.clipPose;
      $('ro-clip-row').classList.toggle('hidden', tools.active?.id !== 'clip');
      if (cp) $('ro-clip').textContent = `${cp.roll.toFixed(0)}° · ${cp.depth >= 0 ? '+' : ''}${cp.depth.toFixed(1)} mm${cp.locked ? ' · LOCK' : ''}`;
    }

    fx.render(state.time);
    tools.byId.endoscope.renderPiP(renderer, scene);
    requestAnimationFrame(tick);
  }
  tick();
  $('boot').classList.add('done');

  // A debugging handle for the console and automated checks.
  window.__clipsim = { ...ctx, tools, stages };
}

try {
  boot();
} catch (err) {
  console.error(err);
  const b = $('boot');
  b.classList.add('err');
  b.textContent = 'WebGL failed to start: ' + err.message;
}
