import * as THREE from 'three';
import { buildClip, CLIP_SPECS } from './clipModel.js';
import { partRoot } from './index.js';
import { sfx } from '../audio/engine.js';
import { bus } from '../procedure/bus.js';
import { ANEURYSM } from '../config/anatomy.js';

// Temporary clip (key 0): click the ICA PROXIMAL to the aneurysm neck to
// clamp it. Pressure in the aneurysm falls, which softens the dome for final
// dissection and slows bleeding after a rupture. The occlusion timer runs
// while it is on; keep it short (under ~5 min) because the territory
// downstream is ischaemic. Click the clip again to release it.
export function tempClip(ctx) {
  const ica = ctx.anatomy.parts.ICA.userData.curve;
  const preview = buildClip('temporary');
  preview.userData.setOpening(3.2);
  let placed = null;

  function paramOn(point) {
    let best = 0, bd = Infinity;
    for (let i = 0; i <= 200; i++) {
      const d = ica.getPointAt(i / 200).distanceToSquared(point);
      if (d < bd) { bd = d; best = i / 200; }
    }
    return best;
  }
  // The clip frame straddling the ICA at parameter t: blades along the view,
  // perpendicular to the vessel, with the jaws closing across it.
  function frameAt(t) {
    const c = ica.getPointAt(t), tan = ica.getTangentAt(t).normalize();
    const view = new THREE.Vector3(); ctx.camera.getWorldDirection(view);
    const z = view.addScaledVector(tan, -view.dot(tan)).normalize();
    const x = new THREE.Vector3().crossVectors(tan, z).normalize();
    const y = new THREE.Vector3().crossVectors(z, x).normalize();
    return { origin: c.clone().addScaledVector(z, -CLIP_SPECS.temporary.length * 0.5), x, y, z };
  }
  function pose(obj, f) { obj.position.copy(f.origin); obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.x, f.y, f.z)); }

  function place(t) {
    const c = buildClip('temporary');
    c.userData.setOpening(3.2);
    pose(c, frameAt(t));
    c.userData.part = 'tempclip';
    c.traverse((o) => { if (o.isMesh) { o.userData.pickPart = 'tempclip'; ctx.anatomy.pickables.push(o); } });
    ctx.scene.add(c);
    ctx.animate(0.14, (k) => c.userData.setOpening(3.2 * (1 - k)));
    placed = { mesh: c, t, start: ctx.state.time };
    ctx.flow.tempClip = true;
    ctx.state.tempClipOn = true;
    ctx.state.tempClipStart = ctx.state.time;
    sfx.clipSnap();
    ctx.feed.push('feed.tempOn', 'ok');
    bus.emit('tempclip:on', { t });
  }
  function release() {
    const dur = ctx.state.time - placed.start;
    ctx.scene.remove(placed.mesh);
    placed.mesh.traverse((o) => { const k = ctx.anatomy.pickables.indexOf(o); if (k >= 0) ctx.anatomy.pickables.splice(k, 1); });
    ctx.stats.tempOcclusion += dur;
    placed = null;
    ctx.flow.tempClip = false;
    ctx.state.tempClipOn = false;
    sfx.select();
    ctx.feed.push('feed.tempOff', 'ok', { s: Math.round(dur) });
    bus.emit('tempclip:off', { duration: dur });
  }

  return {
    id: 'tempClip', model: preview, placesOwnModel: true,
    validate(hit) {
      if (!hit) return { state: 'idle', action: 'act.tempPlace' };
      if (hit.part === 'tempclip') return { state: 'ok', action: 'act.tempRemove', highlight: placed?.mesh };
      if (placed) return { state: 'idle', action: 'act.tempAlready' };
      if (hit.part === 'ICA') {
        const proximal = paramOn(hit.point) < ANEURYSM.neckParam - 0.08;
        return { state: proximal ? 'ok' : 'warn', action: proximal ? 'act.tempPlace' : 'act.tempDistal', highlight: partRoot(hit.object) };
      }
      return { state: 'bad', action: 'act.tempOnlyICA' };
    },
    onDown(hit) {
      if (!hit) return;
      if (hit.part === 'tempclip' && placed) return release();
      if (placed || hit.part !== 'ICA') { sfx.deny(); return; }
      const t = paramOn(hit.point);
      if (t >= ANEURYSM.neckParam - 0.08) { sfx.deny(); ctx.feed.push('feed.tempDistal', 'bad'); return; }
      place(t);
    },
    update(dt, hit) {
      const show = !placed && hit?.part === 'ICA';
      preview.visible = show;
      if (show) pose(preview, frameAt(paramOn(hit.point)));
    },
    get placed() { return placed; },
  };
}
