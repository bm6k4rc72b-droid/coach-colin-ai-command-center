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
import { Vitals } from './physics/vitals.js';
import { Rupture } from './physics/rupture.js';
import { installClipEval } from './physics/clipEval.js';
import { VitalsPanel } from './ui/vitalsPanel.js';
import { Demo } from './procedure/demo.js';
import { Debrief } from './ui/debrief.js';

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
  const vitals = new Vitals(ctx);
  const rupture = new Rupture(ctx);
  ctx.vitals = vitals; ctx.rupture = rupture;
  installClipEval(ctx);
  const vitalsPanel = new VitalsPanel($('vitals'), ctx, vitals);
  const stages = new StageSystem(ctx);
  const checklist = new Checklist($('checklist'), stages, state);
  const mentor = new Mentor($('mentor'), stages);
  const demo = new Demo(ctx);
  const debrief = new Debrief($('debrief'), ctx);
  ctx.demo = demo;
  bus.on('demo:start', () => { state.demoUsed = true; });
  bus.on('procedure:complete', () => setTimeout(() => debrief.show(), 3200));

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
  bus.on('rupture', () => banner('⚠', i18n.t('banner.rupture')));
  bus.on('mep:cause', ({ cause }) => feed.push('feed.mep.' + cause, 'bad'));
  bus.on('risk:warn', ({ reason }) => feed.push('risk.' + reason, reason.includes('Bleb') || reason.includes('bleb') || reason === 'scissorsDome' ? 'bad' : 'warn'));

  // ── UI wiring ────────────────────────────────────
  i18n.apply();
  $('btn-lang').onclick = $('btn-lang-start').onclick = () => i18n.toggle();
  $('ack').onchange = (e) => { $('btn-start').disabled = $('btn-start-demo').disabled = !e.target.checked; };
  $('btn-start-demo').onclick = () => { $('btn-start').onclick(); setTimeout(() => demo.start(), 600); };
  $('btn-demo').onclick = (e) => { e.stopPropagation(); demo.running ? demo.stop(true) : demo.start(); };
  $('btn-end').onclick = () => { demo.stop(false); debrief.show(); };
  $('btn-start').onclick = () => {
    initAudio();
    state.started = true;
    state.startTime = state.time;
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
  // Adaptive quality: if frames are slow for the first seconds of the case,
  // turn off depth of field, then bloom, and lower the pixel ratio.
  const perf = { t: 0, n: 0, level: 0 };
  function adapt(raw) {
    if (!state.started || perf.level >= 2 || /fx=/.test(location.search)) return;
    perf.t += raw; perf.n++;
    if (perf.t < 4) return;
    const avg = perf.t / perf.n;
    perf.t = 0; perf.n = 0;
    if (avg > 0.034) {
      perf.level++;
      if (perf.level === 1) fx.bokeh.enabled = false;
      else { fx.bloom.enabled = false; renderer.setPixelRatio(1); fx.composer.setPixelRatio?.(1); }
      console.info(`[clipsim] adaptive quality level ${perf.level} (avg ${(avg * 1000).toFixed(0)} ms/frame)`);
    } else perf.level = 2;   // fast enough: stop checking
  }

  // One simulation step (everything except drawing). The render loop calls it
  // every frame; automated checks can call it directly via __clipsim.step().
  function simulate(dt) {
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
      demo.update(dt);
      stages.update(dt);
      vitals.update(dt);
      rupture.update(dt);
      vitalsPanel.update(dt, frame % 6 === 0);
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
      $('ro-wd').textContent = controls.cur.distance.toFixed(0);
      $('ro-mag').textContent = (MICROSCOPE.distance * 6 / controls.cur.distance).toFixed(1);
      $('ro-neck').textContent = Math.round(anatomy.adhesions.progress * 100);
      const cp = state.clipPose;
      $('ro-clip-row').classList.toggle('hidden', tools.active?.id !== 'clip');
      if (cp) $('ro-clip').textContent = `${cp.snap || cp.locked ? '◎ ' : ''}∠ICA ${cp.angICA.toFixed(0)}° · h ${cp.height >= 0 ? '+' : ''}${cp.height.toFixed(1)} · tilt ${cp.tilt.toFixed(0)}°${cp.locked ? ' · LOCK' : ''}`;
    }
  }

  function tick() {
    const raw = clock.getDelta();
    adapt(raw);
    simulate(Math.min(raw, 0.05));
    fx.render(state.time);
    tools.byId.endoscope.renderPiP(renderer, scene);
    requestAnimationFrame(tick);
  }
  tick();
  $('boot').classList.add('done');

  // A debugging handle for the console and automated checks.
  window.__clipsim = { ...ctx, tools, stages, vitals, rupture, demo, debrief, step: (secs, dt = 0.05) => { for (let t = 0; t < secs; t += dt) simulate(dt); } };
}

try {
  boot();
} catch (err) {
  console.error(err);
  const b = $('boot');
  b.classList.add('err');
  b.textContent = 'WebGL failed to start: ' + err.message;
}
