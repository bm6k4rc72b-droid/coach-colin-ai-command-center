import * as THREE from 'three';
import { bus } from '../procedure/bus.js';
import { alarmSound } from '../audio/engine.js';

// Intraoperative rupture. The hidden rupture-risk value (see risk.js) is
// compared with a threshold drawn once per case (0.55–0.9), so you never know
// exactly how much handling a given dome will tolerate. A single catastrophic
// act (cutting the dome) ruptures it at once.
//
// When it ruptures, a pulsatile arterial jet comes from the bleb, or from the
// dome point under the tool. The field fills faster than suction can clear it.
// The recovery sequence is: suction to see, a temporary clip on the proximal ICA
// to slow it, then a definitive clip across the neck.
export class Rupture {
  constructor(ctx) {
    this.ctx = ctx;
    this.threshold = 0.55 + Math.random() * 0.35;
    this.source = null;
    ctx.state.ruptured = false;

    // A permanent clip that closes the neck stops the rupture. In M5 this is
    // decided by the clip evaluation; until then, a clip across the neck region counts.
    bus.on('clip:evaluated', (ev) => { if (ev.neckClosure >= 0.9) this.#seal(); });
  }

  update(dt) {
    const c = this.ctx;
    if (c.state.ruptured || !c.state.started) return;
    if (c.risk.value >= this.threshold) this.trigger();
  }

  trigger(point = null) {
    const c = this.ctx;
    if (c.state.ruptured) return;
    c.state.ruptured = true;
    c.state.ruptureTime = c.state.time;
    const g = c.anatomy.aneurysm.geometry;
    // Most ruptures happen at the thinnest point: the bleb.
    const at = point || g.blebWorld.clone();
    const normal = at.clone().sub(g.domeCenter).normalize();
    this.source = c.bleeding.addSource(at, 'arterial', normal);
    c.feed.push('feed.rupture', 'bad');
    bus.emit('rupture', { at });
    alarmSound.high();
    // Visual shock: a red flash and a jolt of the scope.
    c.animate(1.4, (k) => { c.fx.grade.uniforms.uRed.value = Math.sin(k * Math.PI) * 0.8; });
    const t0 = c.controls.goal.target.clone();
    c.animate(0.6, (k) => { c.controls.target.copy(t0).add(new THREE.Vector3((Math.random() - 0.5) * 1.6, (Math.random() - 0.5) * 1.6, 0).multiplyScalar(1 - k)); });
  }

  #seal() {
    const c = this.ctx;
    if (!this.source?.active) return;
    c.bleeding.stop(this.source, 'clip');
    c.feed.push('feed.ruptureControlled', 'ok');
    bus.emit('rupture:controlled', {});
  }
}
