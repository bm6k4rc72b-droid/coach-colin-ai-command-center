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

  // ── UI wiring ────────────────────────────────────
  i18n.apply();
  $('btn-lang').onclick = $('btn-lang-start').onclick = () => i18n.toggle();
  $('ack').onchange = (e) => { $('btn-start').disabled = !e.target.checked; };
  $('btn-start').onclick = () => {
    state.started = true;
    $('start').classList.add('hidden');
    $('hud').classList.remove('hidden');
    controls.reset();
  };
  $('btn-labels').onclick = () => labels.toggle();
  $('btn-reset').onclick = () => controls.reset();

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
    if (state.started) inspector.update();
    labels.update();

    // Autofocus on whatever is under the cursor, else on the centre of the field.
    if (frame % 3 === 0) {
      const hit = inspector.hit || inspector.pick(center);
      const d = hit ? hit.distance : controls.cur.distance;
      state.focusGoal = d;
    }
    fx.setFocus(state.focusGoal ?? controls.cur.distance, dt);

    if (state.started && frame % 6 === 0) {
      $('ro-focus').textContent = fx.bokeh.uniforms.focus.value.toFixed(1);
      $('ro-wd').textContent = controls.cur.distance.toFixed(0);
      $('ro-mag').textContent = (MICROSCOPE.distance * 6 / controls.cur.distance).toFixed(1);
    }

    fx.render(state.time);
    requestAnimationFrame(tick);
  }
  tick();
  $('boot').classList.add('done');

  // A debugging handle for the console and automated checks.
  window.__clipsim = { THREE, renderer, scene, camera, anatomy, controls, heart, fx, state, labels, inspector };
}

try {
  boot();
} catch (err) {
  console.error(err);
  const b = $('boot');
  b.classList.add('err');
  b.textContent = 'WebGL failed to start: ' + err.message;
}
