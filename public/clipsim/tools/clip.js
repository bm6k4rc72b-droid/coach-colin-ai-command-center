import * as THREE from 'three';
import { buildClip, buildApplier, CLIP_SPECS } from './clipModel.js';
import { partRoot } from './index.js';
import { sfx } from '../audio/engine.js';
import { bus } from '../procedure/bus.js';

// Aneurysm clip (key 6).
//   1. Move over the neck: the clip follows the cursor, blades open.
//   2. Click to LOCK the position.
//   3. Wheel (or Q/E) rotates the clip about its approach axis.
//      Alt+wheel (or A/D) tilts the blades away from the microscope axis.
//      Shift+wheel (or Z/X) sets blade depth: how far the blades reach past the neck.
//      C toggles straight / curved.
//   A cyan ring marks the neck, and the readout shows the blade angle to the
//   ICA and the height above the neck plane.
//   4. Click again or press Enter to APPLY (the blades close). Esc unlocks.
// Click an applied clip to take it off and reposition it.
// Goal (evaluated in M5): blades parallel to the ICA, closing the whole neck,
// tips past the far side of the neck, and the PCom and AChA left free.
export function clip(ctx) {
  const root = new THREE.Group();
  const applier = buildApplier();
  let type = 'straight', model = null;
  const pose = { anchor: new THREE.Vector3(), roll: 0, tilt: THREE.MathUtils.degToRad(30), depth: 0, locked: false };
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
  // microscope axis, tilted by `tilt` (30° to start) so you see them in
  // profile. `roll` spins the whole clip about the view axis, which sets the
  // blade direction on screen. Together, roll and tilt can point the blades
  // anywhere in the half-space facing away from you.
  function frame() {
    const TILT = pose.tilt;
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
    const origin = pose.anchor.clone().addScaledVector(z, -L * 0.5 + pose.depth);
    return { x, y, z, origin };
  }
  function place(obj, f) {
    obj.position.copy(f.origin);
    obj.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.x, f.y, f.z));
  }

  const ghostPlaced = new THREE.MeshBasicMaterial({ color: '#3ff3ff', transparent: true, opacity: 0.12, depthTest: false, depthWrite: false });
  function apply(f = frame(), t = type) {
    const c = buildClip(t);
    c.userData.setOpening(3.6);
    place(c, f);
    c.traverse((o) => { if (o.isMesh) { o.userData.pickPart = 'clip'; ctx.anatomy.pickables.push(o); } });
    const meshes = [];
    c.traverse((o) => { if (o.isMesh) meshes.push(o); });
    meshes.forEach((o) => { const gm = new THREE.Mesh(o.geometry, ghostPlaced); gm.renderOrder = 19; gm.raycast = () => {}; o.add(gm); });
    c.userData.part = 'clip';
    ctx.scene.add(c);
    ctx.animate(0.14, (k) => c.userData.setOpening(3.6 * (1 - k)));
    const record = { mesh: c, type: t, frame: { origin: f.origin.clone(), x: f.x.clone(), y: f.y.clone(), z: f.z.clone() }, length: CLIP_SPECS[t].length, curve: CLIP_SPECS[t].curve, time: ctx.state.time };
    placed.push(record);
    pose.locked = false;
    sfx.clipSnap();
    ctx.feed.push('feed.clipApplied', 'ok', { type: ctx.i18n.t('clip.' + t) });
    bus.emit('clip:applied', record);
    return record;
  }

  // Guide: the neck footprint on the ICA wall (an ellipse elongated along the
  // ICA), drawn 0.6 mm above the wall where the blades should close.
  const g = ctx.anatomy.aneurysm.geometry, W = g.wall;
  const ringPts = [];
  for (let i = 0; i <= 64; i++) { const a = (i / 64) * Math.PI * 2; ringPts.push(new THREE.Vector3(Math.cos(a) * W.A, Math.sin(a) * W.B, 0)); }
  const guide = new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(ringPts),
    new THREE.LineDashedMaterial({ color: '#3ff3ff', dashSize: 0.5, gapSize: 0.35, transparent: true, opacity: 0.85, depthTest: false }));
  guide.computeLineDistances();
  guide.position.copy(W.center(0.6));
  guide.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(W.u1, W.u2, W.n));
  guide.renderOrder = 21;
  guide.visible = false;
  ctx.scene.add(guide);
  // Blade alignment: angle between the blades and the ICA, and height of the
  // blade midpoint above the neck plane.
  const ray = new THREE.Raycaster();
  function alignment(f) {
    const L = CLIP_SPECS[type].length;
    const zp = f.z.clone().addScaledVector(W.n, -f.z.dot(W.n));
    const ang = zp.lengthSq() < 1e-6 ? 90 : THREE.MathUtils.radToDeg(Math.acos(Math.min(1, Math.abs(zp.normalize().dot(W.u1)))));
    const mid = f.origin.clone().addScaledVector(f.z, L * 0.5);
    const h = mid.clone().sub(W.point).dot(W.n);           // height above the ICA wall
    return { angICA: ang, height: h };
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
    guide,
    // The clip that would be applied now (used by demo mode and tests).
    previewRecord() { const f = frame(); return { frame: f, length: CLIP_SPECS[type].length, curve: CLIP_SPECS[type].curve, type }; },
    pose,
    // Apply a clip with an explicit frame (used by demo mode and tests).
    applyDirect(f, t = 'straight') { return apply(f, t); },
    remove,
    get placed() { return placed; },
    setType(t) { type = t; rebuild(); ctx.feed.push('feed.clipType', 'ok', { type: ctx.i18n.t('clip.' + t) }); bus.emit('clip:type', { type }); },
    validate(hit) {
      if (pose.locked) return { state: 'ok', action: 'act.clipApply', highlight: ctx.anatomy.parts.aneurysm };
      if (hit?.part === 'clip') return { state: 'warn', action: 'act.clipRemove', highlight: clipAncestor(hit.object) };
      if (pose.snap) return { state: 'ok', action: 'act.clipLock', highlight: ctx.anatomy.parts.aneurysm };
      if (!hit) return { state: 'idle', action: 'act.clipPosition' };
      return { state: 'idle', action: 'act.clipPosition' };
    },
    onDown(hit) {
      if (pose.locked) return apply();
      if (hit?.part === 'clip') return remove(clipAncestor(hit.object));
      if (!hit && !pose.snap) return;
      pose.locked = true;
      sfx.select();
    },
    onWheel(e) {
      const s = Math.sign(e.deltaY);
      if (e.shiftKey) pose.depth = THREE.MathUtils.clamp(pose.depth + s * 0.4, -4, 5);
      else if (e.altKey) pose.tilt = THREE.MathUtils.clamp(pose.tilt + s * THREE.MathUtils.degToRad(5), 0, THREE.MathUtils.degToRad(85));
      else pose.roll += s * THREE.MathUtils.degToRad(7.5);
      return true;
    },
    onKey(e) {
      const k = e.key.toLowerCase();
      if (k === 'c') { tool.setType(type === 'straight' ? 'curved' : 'straight'); return true; }
      if (k === 'enter' && pose.locked) { apply(); return true; }
      if (k === 'escape' && pose.locked) { pose.locked = false; return true; }
      if (k === 'q' || k === 'e') { pose.roll += (k === 'q' ? -1 : 1) * THREE.MathUtils.degToRad(7.5); return true; }
      if (k === 'a' || k === 'd') { pose.tilt = THREE.MathUtils.clamp(pose.tilt + (k === 'a' ? -1 : 1) * THREE.MathUtils.degToRad(5), 0, THREE.MathUtils.degToRad(85)); return true; }
      if (k === 'z' || k === 'x') { pose.depth = THREE.MathUtils.clamp(pose.depth + (k === 'z' ? -0.4 : 0.4), -4, 5); return true; }
      return false;
    },
    update(dt, hit) {
      if (!pose.locked) {
        // Neck snap: the neck usually hides behind the ICA, so when the cursor
        // ray passes within 4 mm of it, the blades centre on the nearest point
        // of the ray to the neck. Place it using the cyan outline. Elsewhere the
        // blades straddle the tissue ~1.5 mm under the surface you point at.
        ray.setFromCamera(ctx.inspector.ndc, ctx.camera);
        const target = W.center(0.7);
        const cp = ray.ray.closestPointToPoint(target, new THREE.Vector3());
        pose.snap = cp.distanceTo(target) < 4;
        if (pose.snap) pose.anchor.copy(cp);
        else if (hit) { const fwd = new THREE.Vector3(); ctx.camera.getWorldDirection(fwd); pose.anchor.copy(hit.point).addScaledVector(fwd, 1.5); }
      }
      root.visible = pose.locked || pose.snap || !!hit;
      guide.material.opacity = pose.snap || pose.locked ? 1 : 0.5;
      const f = frame();
      place(root, f);
      // The applier grips the clip head (just behind the blades) and leads out to the right hand.
      if (!applier.parent) ctx.scene.add(applier);
      applier.visible = root.visible;
      ctx.tools.aim(applier, f.origin.clone().addScaledVector(f.z, -2.2), 1);
      guide.visible = true;
      ctx.state.clipPose = { snap: pose.snap, roll: THREE.MathUtils.radToDeg(pose.roll), tilt: THREE.MathUtils.radToDeg(pose.tilt), depth: pose.depth, locked: pose.locked, type, ...alignment(f) };
    },
    deactivate() { pose.locked = false; applier.visible = false; guide.visible = false; },
  };
  return tool;
}
