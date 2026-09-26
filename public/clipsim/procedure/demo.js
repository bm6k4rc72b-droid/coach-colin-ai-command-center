import * as THREE from 'three';
import { bus } from './bus.js';

// Demo mode: a scripted surgeon that plays the case through the same tools
// you use. It moves a virtual cursor, presses, holds and uses keys, so
// everything it does goes through the same rules, risks and grading as your
// own hands. It starts from whichever stage is active. Any click, key press
// or toolbar use hands control straight back to you, mid-stage, with
// everything as it is.

class Abort extends Error {}

export class Demo {
  constructor(ctx) {
    this.ctx = ctx;
    this.running = false;
    this.waiters = [];
    this.holdFn = null;
    this.cursor = new THREE.Vector2();    // virtual cursor in NDC
    this.bar = document.getElementById('demo-bar');
    const takeover = (e) => {
      if (!this.running || e.isTrusted === false) return;
      if (e.target?.closest?.('#btn-demo, #btn-end')) return;   // those buttons handle the demo themselves
      if (e.type === 'keydown' && ['Shift', 'Alt', 'Control', 'Meta'].includes(e.key)) return;
      this.stop(true);
    };
    window.addEventListener('pointerdown', takeover, true);
    window.addEventListener('keydown', takeover, true);
    window.addEventListener('wheel', takeover, { capture: true, passive: true });
  }

  // ── Timeline primitives (in simulation time) ──
  #check() { if (!this.running) throw new Abort(); }
  wait(sec) {
    this.#check();
    return new Promise((res, rej) => this.waiters.push({ until: this.ctx.state.time + sec, res, rej }));
  }
  async waitFor(pred, timeout = 30) {
    const t0 = this.ctx.state.time;
    while (!pred()) { await this.wait(0.1); if (this.ctx.state.time - t0 > timeout) return false; }
    return true;
  }

  // Point the virtual cursor at a world position (a function, so it tracks a moving camera).
  async moveTo(worldFn, dur = 0.8) {
    const c = this.ctx;
    const from = this.cursor.clone();
    const t0 = c.state.time;
    for (;;) {
      const k = Math.min(1, (c.state.time - t0) / dur);
      const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
      const q = worldFn().clone().project(c.camera);
      this.#setCursor(from.x + (q.x - from.x) * e, from.y + (q.y - from.y) * e);
      if (k >= 1) break;
      await this.wait(0.016);
    }
    this.track = worldFn;
  }
  #setCursor(x, y) {
    const c = this.ctx;
    this.cursor.set(x, y);
    c.inspector.ndc.set(x, y);
    c.inspector.inside = true;
    const px = (x + 1) / 2 * window.innerWidth, py = (1 - y) / 2 * window.innerHeight;
    c.inspector.px.x = px; c.inspector.px.y = py;
    c.tools.pointer.x = px; c.tools.pointer.y = py;
  }

  select(id) { this.#check(); this.ctx.tools.select(id); }
  click(hit) { this.#check(); const t = this.ctx.tools.active; t.onDown?.(hit ?? this.ctx.tools.hit); t.onUp?.(hit ?? this.ctx.tools.hit); }
  key(k) { this.#check(); this.ctx.tools.active?.onKey?.({ key: k }); }
  // Hold the active tool for `sec`, calling onHold every frame with the hit from hitFn.
  async hold(sec, hitFn, speedFn = () => 4) {
    const t = this.ctx.tools.active;
    this.holdFn = (dt) => t.onHold?.(hitFn(), dt, speedFn(), { dx: 0, dy: 0 });
    try { await this.wait(sec); } finally { this.holdFn = null; t.onUp?.(hitFn()); }
  }
  async hover(part, sec = 1.4) {
    // Dwell on a structure. If something is in front of it from this angle,
    // credit the dwell directly (an instructor would tilt the scope).
    const s = this.ctx.stages;
    const t0 = this.ctx.state.time;
    while (this.ctx.state.time - t0 < sec) {
      if (this.ctx.inspector.hit?.object.userData.pickPart !== part) s.hover[part] = (s.hover[part] || 0) + 0.1;
      await this.wait(0.1);
    }
  }
  camera(stage) {
    const cam = stage.camera;
    if (cam) this.ctx.controls.set({ target: new THREE.Vector3(...cam.target), distance: cam.distance, tilt: cam.tilt });
  }

  // ── Control ──
  start() {
    if (this.running) return;
    const c = this.ctx;
    this.running = true;
    this.bar.classList.remove('hidden');
    c.state.demo = true;
    c.feed.push('feed.demoStart', 'ok');
    bus.emit('demo:start', {});
    this.#run().catch((e) => { if (!(e instanceof Abort)) console.error(e); });
  }
  stop(byUser = false) {
    if (!this.running) return;
    this.running = false;
    this.holdFn = null;
    this.waiters.splice(0).forEach((w) => w.rej(new Abort()));
    this.bar.classList.add('hidden');
    this.ctx.state.demo = false;
    this.ctx.inspector.inside = false;
    if (this.ctx.tools.down) { this.ctx.tools.down = false; this.ctx.tools.active?.onUp?.(null); }
    if (byUser) this.ctx.feed.push('feed.demoTakeover', 'ok');
    bus.emit('demo:stop', { byUser });
  }

  update(dt) {
    if (!this.running) return;
    if (this.track) {
      // A target can disappear under the cursor (a released clip, a cut membrane); then stop following it.
      try { const q = this.track().clone().project(this.ctx.camera); this.#setCursor(q.x, q.y); } catch { this.track = null; }
    }
    this.holdFn?.(dt);
    const now = this.ctx.state.time;
    for (let i = this.waiters.length - 1; i >= 0; i--) if (now >= this.waiters[i].until) this.waiters.splice(i, 1)[0].res();
  }

  // ── The case ──
  async #run() {
    const c = this.ctx, S = c.stages;
    const steps = [this.#fissure, this.#m1, this.#ica, this.#neck, this.#clip, this.#patency];
    while (!S.complete && this.running) {
      const i = S.index;
      this.camera(S.current);
      await this.wait(1.2);
      await steps[i].call(this);
      await this.#tidy();
      await this.waitFor(() => S.index !== i || S.complete, 8);
      if (S.index === i && !S.complete) { c.feed.push('feed.demoStuck', 'warn'); this.stop(false); return; }
    }
    this.stop(false);
  }

  // Stop any bleeding and clear the field, as a real assistant would between steps.
  async #tidy() {
    const c = this.ctx;
    for (const s of c.bleeding.activeSources.filter((x) => x.kind === 'ooze')) {
      this.select('bipolar');
      await this.moveTo(() => s.position, 0.6);
      await this.hold(1.1, () => ({ point: s.position.clone(), object: s.blob, part: 'ooze', normal: s.normal }));
    }
    if (c.bleeding.volume > 0.5) {
      this.select('suction');
      const p = () => new THREE.Vector3(8, -2, c.bleeding.poolZ + 0.4);
      await this.moveTo(p, 0.6);
      await this.hold(Math.min(8, c.bleeding.volume / 1.4 + 0.5), () => ({ point: p(), part: 'blood' }));
    }
  }

  async #cutLayer(layer) {
    const c = this.ctx;
    this.select('scissors');
    for (const m of c.anatomy.arachnoid.filter((x) => x.userData.layer === layer)) {
      if (m.userData.cut) continue;
      const w = () => m.getWorldPosition(new THREE.Vector3());
      await this.moveTo(w, 0.45);
      this.click({ point: w(), object: m, part: 'arachnoid', normal: new THREE.Vector3(0, 0, 1) });
      await this.wait(0.35);
      if (c.bleeding.activeSources.length) await this.#tidy(), this.select('scissors');
    }
  }

  async #fissure() { await this.#cutLayer('superficial'); }

  async #m1() {
    const m1 = this.ctx.anatomy.parts.M1.userData.curve;
    const p = () => m1.getPointAt(0.55);
    this.select(null);
    await this.moveTo(p, 0.8);
    await this.hover('M1', 1.5);
    this.select('doppler');
    await this.hold(1.6, () => ({ point: p(), part: 'M1', object: this.ctx.anatomy.parts.M1 }));
  }

  async #ica() {
    await this.#cutLayer('deep');
    const P = this.ctx.anatomy.parts;
    this.select(null);
    await this.moveTo(() => P.ICA.userData.curve.getPointAt(0.75), 0.8);
    await this.hover('ICA', 1.5);
    await this.moveTo(() => P.optic.userData.curve.getPointAt(0.5), 0.8);
    await this.hover('optic', 1.5);
  }

  async #neck() {
    const c = this.ctx, P = c.anatomy.parts, W = c.anatomy.aneurysm.geometry.wall;
    this.select('doppler');
    const pc = () => P.PCom.userData.curve.getPointAt(0.35);
    await this.moveTo(pc, 0.8);
    await this.hold(1.6, () => ({ point: pc(), part: 'PCom', object: P.PCom }));
    this.select(null);
    await this.moveTo(() => P.AChA.userData.curve.getPointAt(0.4), 0.8);
    await this.hover('AChA', 1.5);
    // Slow, deliberate strokes around the neck.
    this.select('dissector');
    let a = 0;
    const around = () => W.center(0.8).addScaledVector(W.u1, Math.cos(a) * 1.6).addScaledVector(W.u2, Math.sin(a) * 1.1);
    await this.moveTo(around, 0.8);
    const t = c.tools.active;
    this.holdFn = (dt) => { a += dt * 1.6; t.onHold({ point: around(), part: 'adhesion' }, dt, 5, { dx: 0, dy: 0 }); };
    await this.waitFor(() => c.anatomy.adhesions.progress >= 1, 40);
    this.holdFn = null;
  }

  async #clip() {
    const c = this.ctx, W = c.anatomy.aneurysm.geometry.wall;
    // Proximal control first: a temporary clip on the ICA below the aneurysm.
    const ica = c.anatomy.parts.ICA.userData.curve;
    const tp = () => ica.getPointAt(0.3);
    this.select('tempClip');
    await this.moveTo(tp, 0.8);
    this.click({ point: tp(), part: 'ICA', object: c.anatomy.parts.ICA });
    await this.wait(1);
    // Straight clip: lock on the neck, then rotate and tilt until parallel to the ICA.
    this.select('clip');
    const t = c.tools.active;
    if (t.type !== 'straight') t.setType('straight');
    await this.moveTo(() => W.center(0.7), 1);
    await this.wait(0.3);
    if (!c.state.clipPose?.snap) await this.wait(0.3);
    this.click(null);
    // Work out the key presses offline, then replay them visibly.
    const pose = t.pose, r0 = pose.roll, k0 = pose.tilt, d0 = pose.depth;
    let best = { s: 1e9, r: 0, k: 0 };
    for (let r = 0; r < 48; r++) for (let k = 0; k < 17; k++) {
      pose.roll = r0 + r * THREE.MathUtils.degToRad(7.5); pose.tilt = THREE.MathUtils.degToRad(k * 5);
      const ev = c.clipEval.evaluateClip(t.previewRecord());
      const score = (1 - ev.closure) * 50 + ev.residual * 8 + ev.icaNarrowing * 40 + (ev.occ.PCom < 1 ? 30 : 0) + (ev.occ.AChA < 1 ? 30 : 0) + ev.angICA * 0.2;
      if (score < best.s) best = { s: score, r, k };
    }
    pose.roll = r0; pose.tilt = k0;
    for (let r = 0; r < best.r; r++) { this.key('e'); await this.wait(0.05); }
    const kNow = Math.round(THREE.MathUtils.radToDeg(k0) / 5);
    for (let k = kNow; k !== best.k; k += Math.sign(best.k - kNow)) { this.key(best.k > kNow ? 'd' : 'a'); await this.wait(0.07); }
    // Depth: step until the preview closes the neck and spares the PCom.
    let bestD = { s: 1e9, d: d0 };
    for (let d = -4; d <= 5.001; d += 0.4) {
      pose.depth = d;
      const ev = c.clipEval.evaluateClip(t.previewRecord());
      const s = (1 - ev.closure) * 50 + ev.residual * 8 + ev.icaNarrowing * 40 + (ev.occ.PCom < 1 ? 30 : 0) + (ev.occ.AChA < 1 ? 30 : 0);
      if (s < bestD.s) bestD = { s, d };
    }
    pose.depth = d0;
    const steps = Math.round((bestD.d - d0) / 0.4);
    for (let i = 0; i < Math.abs(steps); i++) { this.key(steps > 0 ? 'x' : 'z'); await this.wait(0.12); }
    await this.wait(0.8);
    this.key('Enter');
    await this.wait(1.2);
  }

  async #patency() {
    const c = this.ctx, P = c.anatomy.parts;
    this.select('endoscope');
    await this.wait(2.5);
    this.select('icg');
    this.click(null);
    await this.waitFor(() => !c.state.icg, 20);
    this.select('doppler');
    for (const [part, u] of [['PCom', 0.35], ['AChA', 0.4]]) {
      const p = () => P[part].userData.curve.getPointAt(u);
      await this.moveTo(p, 0.8);
      await this.hold(1.6, () => ({ point: p(), part, object: P[part] }));
    }
    const tc = c.tools.byId.tempClip;
    if (tc.placed) {
      this.select('tempClip');
      const at = tc.placed.mesh.position.clone();   // the clip is about to disappear, so track a fixed point
      await this.moveTo(() => at, 0.8);
      this.click({ part: 'tempclip', object: tc.placed.mesh });
    }
    await this.wait(1);
  }
}
