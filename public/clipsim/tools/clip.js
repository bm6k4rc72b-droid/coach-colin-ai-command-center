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

  // A faint holographic outline drawn through tissue, so you can still place
  // the clip when the neck is hidden behind the ICA.
  const ghostMat = new THREE.MeshBasicMaterial({ color: '#3ff3ff', transparent: true, opacity: 0.28, depthTest: false, depthWrite: false });
  function rebuild() {
    if (model) root.remove(model);
    model = buildClip(type);
    model.userData.setOpening(3.6);
    const meshes = [];
    model.traverse((o) => { if (o.isMesh) meshes.push(o); });
    meshes.forEach((o) => { const g = new THREE.Mesh(o.geometry, ghostMat); g.renderOrder = 20; o.add(g); });
    root.add(model);
    ctx.state.clipType = type;
  }
  rebuild();

  // The clip frame from the current pose. The blades point down the
  // microscope axis, tilted 30° so you see them in profile. `roll` spins the
  // whole clip about the view axis, which sets the blade direction on screen
  // (aim for parallel to the ICA).
  const TILT = THREE.MathUtils.degToRad(30);
  function frame() {
    const cam = ctx.camera;
    const fwd = new THREE.Vector3(); cam.getWorldDirection(fwd);
    const right = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(cam.matrixWorld, 1);
    const q = new THREE.Quaternion().setFromAxisAngle(fwd, pose.roll);
    const z = fwd.clone().multiplyScalar(Math.cos(TILT)).addScaledVector(up, -Math.sin(TILT)).applyQuaternion(q).normalize();
    const x = right.applyQuaternion(q).normalize();
    const y = new THREE.Vector3().crossVectors(z, x).normalize();
    x.crossVectors(y, z).normalize();
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
    extraModels: [applier],
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
      const f = frame();
      place(root, f);
      // The applier grips the clip head (just behind the blades) and leads out to the right hand.
      if (!applier.parent) ctx.scene.add(applier);
      applier.visible = root.visible;
      ctx.tools.aim(applier, f.origin.clone().addScaledVector(f.z, -2.2), 1);
      ctx.state.clipPose = { roll: THREE.MathUtils.radToDeg(pose.roll), depth: pose.depth, locked: pose.locked, type };
    },
    deactivate() { pose.locked = false; applier.visible = false; },
  };
  return tool;
}
