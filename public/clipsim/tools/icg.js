import * as THREE from 'three';
import { reticleModel } from './models.js';
import { sfx } from '../audio/engine.js';
import { bus } from '../procedure/bus.js';

// ICG videoangiography (key 7): click to inject indocyanine green. The scope
// switches to near-infrared: dye fluoresces as it passes through the vessels.
// Arteries fill first (ICA → branches), then the veins. A vessel that stays
// dark has no flow. After clipping, the aneurysm itself should stay dark.
// Click again to leave the fluorescence view early.
const PHASE = {                 // seconds after injection that each vessel lights up
  ICA: 0.6, PCom: 1.2, AChA: 1.25, M1: 1.1, A1: 1.2, perforator: 1.5, M2s: 1.6, M2i: 1.6,
  aneurysm: 1.5, bleb: 1.9, SSV: 5.0,
};
const DURATION = 14;
const GLOW = new THREE.Color('#d9ffe9');

export function icg(ctx) {
  const model = reticleModel('#5dffa8');
  let running = false, t0 = 0, lastT = 0;
  const saved = new Map();
  const targets = [];
  ctx.anatomy.root.traverse((o) => {
    const part = o.userData.pickPart;
    if (o.isMesh && part in PHASE) targets.push({ mesh: o, part });
  });

  function start(t) {
    running = true; t0 = t;
    ctx.state.icg = true;
    ctx.tools.highlighter.clear();
    for (const { mesh } of targets) if (!saved.has(mesh.material)) saved.set(mesh.material, { c: mesh.material.emissive.clone(), i: mesh.material.emissiveIntensity });
    ctx.lights.setICG(true);
    sfx.confirm();
    ctx.feed.push('feed.icgStart', 'ok');
    bus.emit('icg:start', {});
    ctx.stats.icgRuns++;
  }
  function stop() {
    running = false;
    ctx.state.icg = false;
    for (const [m, s] of saved) { m.emissive.copy(s.c); m.emissiveIntensity = s.i; }
    saved.clear();
    ctx.lights.setICG(false);
    (ctx.state.icgExtras || []).forEach((x) => { x.mesh.visible = false; });
    const filled = Object.keys(PHASE).filter((p) => p !== 'SSV').map((p) => ({ part: p, flow: ctx.flow.at(p) }));
    bus.emit('icg:done', { filled });
  }

  return {
    id: 'icg', model, side: 1,
    get progress() { return running ? Math.min(1, (lastT - t0) / DURATION) : 0; },
    validate() { return { state: 'ok', action: running ? 'act.icgStop' : 'act.icgInject' }; },
    onDown() { running ? stop() : start(lastT); },
    // The fluorescence keeps running after you switch tools, so you can Doppler during it.
    background(dt, t) {
      lastT = t;
      const u = ctx.fx.grade.uniforms.uIcg;
      u.value += ((running ? 1 : 0) - u.value) * Math.min(1, dt * 5);
      if (!running) return;
      const e = t - t0;
      const fade = 1 - THREE.MathUtils.smoothstep(e, DURATION - 3, DURATION);
      for (const x of ctx.state.icgExtras || []) {
        const fill = THREE.MathUtils.smoothstep(e, x.phase, x.phase + 1.4) * fade * x.flow();
        x.mesh.visible = fill > 0.03;
        x.mesh.material.emissiveIntensity = fill * 2.6;
      }
      for (const { mesh, part } of targets) {
        const flow = part === 'SSV' ? 0.8 : ctx.flow.at(part);
        const fill = THREE.MathUtils.smoothstep(e, PHASE[part], PHASE[part] + 1.4) * fade * flow;
        mesh.material.emissive.copy(GLOW);
        mesh.material.emissiveIntensity = fill * 2.4;
      }
      if (e > DURATION) stop();
    },
    update(dt, hit) { model.visible = !!hit; if (hit) { model.position.copy(hit.point); model.lookAt(ctx.camera.position); model.rotateX(Math.PI / 2); } },
    placesOwnModel: true,
  };
}
