import * as THREE from 'three';
import { buildClip, buildApplier, CLIP_SPECS } from './clipModel.js';
import { partRoot } from './index.js';
import { sfx } from '../audio/engine.js';
import { bus } from '../procedure/bus.js';

// Aneurysm clip (key 6).
//   1. Move over the neck: the clip follows the cursor, blades open.
//   2. Click to LOCK the position.
//   3. Wheel (or Q/E) rotates the clip about its approach axis.
//      Shift+wheel (or Z/X) sets blade depth: how far the blades reach past the neck.
//      C toggles straight / curved.
//   4. Click again or press Enter to APPLY (the blades close). Esc unlocks.
// Click an applied clip to take it off and reposition it.
// Goal (evaluated in M5): blades parallel to the ICA, closing the whole neck,
// tips past the far side of the neck, and the PCom and AChA left free.
export function clip(ctx) {
  const root = new THREE.Group();
  const applier = buildApplier();
  let type = 'straight', model = null;
  const pose = { anchor: new THREE.Vector3(), roll: 0, depth: 0, locked: false };
  const placed = [];
  ctx.state.clips = placed;

  function rebuild() {
    if (model) root.remove(model);
    model = buildClip(type);
    model.userData.setOpening(3.6);
    root.add(model);
    ctx.state.clipType = type;
  }
  rebuild();
  root.add(applier);

  // The clip frame from the current pose: blades along the microscope's
  // viewing axis, the jaws opening across it, rotated by `roll`.
  function frame() {
    const cam = ctx.camera;
    const z = new THREE.Vector3(); cam.getWorldDirection(z);
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const x = right.applyAxisAngle(z, pose.roll).normalize();
    const y = new THREE.Vector3().crossVectors(z, x).normalize();
    const L = CLIP_SPECS[type].length;
    const origin = pose.anchor.clone().addScaledVector(z, -L * 0.55 + pose.depth);
    return { x, y, z, origin };
  }
  function place(obj, f) {
    obj.position.copy(f.origin);
    obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.x, f.y, f.z));
  }

  function apply() {
    const f = frame();
    const c = buildClip(type);
    c.userData.setOpening(3.6);
    place(c, f);
    c.traverse((o) => { if (o.isMesh) { o.userData.pickPart = 'clip'; ctx.anatomy.pickables.push(o); } });
    c.userData.part = 'clip';
    ctx.scene.add(c);
    ctx.animate(0.14, (k) => c.userData.setOpening(3.6 * (1 - k)));
    const record = { mesh: c, type, frame: { origin: f.origin.clone(), x: f.x.clone(), y: f.y.clone(), z: f.z.clone() }, length: CLIP_SPECS[type].length, curve: CLIP_SPECS[type].curve };
    placed.push(record);
    pose.locked = false;
    sfx.clipSnap();
    ctx.feed.push('feed.clipApplied', 'ok', { type: ctx.i18n.t('clip.' + type) });
    bus.emit('clip:applied', record);
  }
  function remove(mesh) {
    const i = placed.findIndex((r) => r.mesh === mesh);
    if (i < 0) return;
    const r = placed[i];
    placed.splice(i, 1);
    ctx.scene.remove(r.mesh);
    r.mesh.traverse((o) => { const k = ctx.anatomy.pickables.indexOf(o); if (k >= 0) ctx.anatomy.pickables.splice(k, 1); });
    ctx.feed.push('feed.clipRemoved', 'warn');
    bus.emit('clip:removed', r);
  }
  function clipAncestor(obj) { let o = obj; while (o && !o.userData.setOpening) o = o.parent; return o; }

  const tool = {
    id: 'clip', model: root, placesOwnModel: true, usesWheel: true,
    get type() { return type; },
    setType(t) { type = t; rebuild(); ctx.feed.push('feed.clipType', 'ok', { type: ctx.i18n.t('clip.' + t) }); bus.emit('clip:type', { type }); },
    validate(hit) {
      if (pose.locked) return { state: 'ok', action: 'act.clipApply', highlight: ctx.anatomy.parts.aneurysm };
      if (!hit) return { state: 'idle', action: 'act.clipPosition' };
      if (hit.part === 'clip') return { state: 'warn', action: 'act.clipRemove', highlight: clipAncestor(hit.object) };
      const near = ctx.geo.distToNeck(hit.point) < ctx.geo.neckRadius + 4;
      return { state: near ? 'ok' : 'idle', action: 'act.clipLock', highlight: near ? ctx.anatomy.parts.aneurysm : null };
    },
    onDown(hit) {
      if (pose.locked) return apply();
      if (!hit) return;
      if (hit.part === 'clip') return remove(clipAncestor(hit.object));
      pose.anchor.copy(hit.point);
      pose.locked = true;
      sfx.select();
    },
    onWheel(e) {
      const s = Math.sign(e.deltaY);
      if (e.shiftKey) pose.depth = THREE.MathUtils.clamp(pose.depth + s * 0.4, -4, 5);
      else pose.roll += s * THREE.MathUtils.degToRad(7.5);
      return true;
    },
    onKey(e) {
      const k = e.key.toLowerCase();
      if (k === 'c') { tool.setType(type === 'straight' ? 'curved' : 'straight'); return true; }
      if (k === 'enter' && pose.locked) { apply(); return true; }
      if (k === 'escape' && pose.locked) { pose.locked = false; return true; }
      if (k === 'q' || k === 'e') { pose.roll += (k === 'q' ? -1 : 1) * THREE.MathUtils.degToRad(7.5); return true; }
      if (k === 'z' || k === 'x') { pose.depth = THREE.MathUtils.clamp(pose.depth + (k === 'z' ? -0.4 : 0.4), -4, 5); return true; }
      return false;
    },
    update(dt, hit) {
      if (!pose.locked && hit) pose.anchor.copy(hit.point);
      root.visible = pose.locked || !!hit;
      place(root, frame());
      ctx.state.clipPose = { roll: THREE.MathUtils.radToDeg(pose.roll), depth: pose.depth, locked: pose.locked, type };
    },
    deactivate() { pose.locked = false; },
  };
  return tool;
}
