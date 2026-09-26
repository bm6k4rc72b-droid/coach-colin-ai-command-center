import * as THREE from 'three';
import { BRAIN } from '../config/anatomy.js';
import { bus } from '../procedure/bus.js';

// Bleeding model.
//   Sources:
//     'ooze'      slow venous or capillary bleeding (~3 ml/min); the bipolar stops it
//     'arterial'  a pulsatile jet from a rupture; only a clip stops it (from M4)
//   Particles: droplets that run from each source down into the depth of the field.
//   Pool: a glossy blood layer that rises from the floor of the fissure as volume
//     collects, hiding anatomy until it is suctioned away.
const MAX_P = 2400;
const GRAVITY = new THREE.Vector3(0, -0.3, -1).normalize().multiplyScalar(40); // mm/s², "down" = into the depth

export const BLEED = {
  oozeRate: 0.05,          // ml/s
  arterialRate: 2.6,       // ml/s at normal pressure (tamed by a temporary clip)
  mmPerMl: 1.5,            // how fast the pool surface rises per ml collected
  poolMaxZ: -6,
  suctionRate: 1.6,        // ml/s the suction clears when submerged in blood
};

function dropletTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(26, 26, 2, 32, 32, 30);
  grd.addColorStop(0, 'rgba(255,190,190,1)');
  grd.addColorStop(0.25, 'rgba(200,20,30,1)');
  grd.addColorStop(1, 'rgba(90,0,8,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}

export class Bleeding {
  constructor(scene, pickables) {
    this.scene = scene;
    this.pickables = pickables;
    this.sources = [];
    this.volume = 0;          // ml currently pooled in the field
    this.totalLoss = 0;       // ml lost in total (estimated blood loss)
    this.pressure = 1;        // multiplier fed by vitals and the temporary clip
    this.floorZ = BRAIN.floor.z + 1;
    this.#buildPool();
    this.#buildParticles();
  }

  #buildPool() {
    const geo = new THREE.PlaneGeometry(90, 56, 1, 1);
    this.poolMat = new THREE.MeshPhysicalMaterial({
      color: '#4a0006', roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02,
      transparent: true, opacity: 0.94, envMapIntensity: 1.2, sheen: 0.5, sheenColor: new THREE.Color('#ff2a3a'),
    });
    this.pool = new THREE.Mesh(geo, this.poolMat);
    this.pool.position.set(8, -3, this.floorZ);
    this.pool.visible = false;
    this.pool.userData = { part: 'blood', pickPart: 'blood', kind: 'blood' };
    this.pool.renderOrder = 1;
    this.scene.add(this.pool);
    this.pickables.push(this.pool);
  }

  #buildParticles() {
    this.pPos = new Float32Array(MAX_P * 3);
    this.pVel = new Float32Array(MAX_P * 3);
    this.pLife = new Float32Array(MAX_P);
    this.pCount = 0;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setDrawRange(0, 0);
    this.points = new THREE.Points(geo, new THREE.PointsMaterial({
      size: 0.9, map: dropletTexture(), transparent: true, depthWrite: false, sizeAttenuation: true, color: '#ffffff',
    }));
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
    this.scene.add(this.points);
  }

  get poolZ() { return Math.min(BLEED.poolMaxZ, this.floorZ + this.volume * BLEED.mmPerMl); }
  get activeSources() { return this.sources.filter((s) => s.active); }

  addSource(position, kind = 'ooze', normal = new THREE.Vector3(0, 0, 1)) {
    const blob = new THREE.Mesh(
      new THREE.SphereGeometry(kind === 'arterial' ? 1.1 : 0.75, 18, 12),
      new THREE.MeshPhysicalMaterial({ color: '#7a0010', roughness: 0.1, clearcoat: 1, emissive: '#300004' }),
    );
    blob.scale.set(1, 1, 0.55);
    blob.position.copy(position);
    blob.userData = { part: 'ooze', pickPart: 'ooze', kind: 'blood' };
    this.scene.add(blob);
    this.pickables.push(blob);
    const src = { id: this.sources.length, kind, position: position.clone(), normal: normal.clone().normalize(), active: true, coag: 0, blob, emitAcc: 0 };
    this.sources.push(src);
    bus.emit('bleed:start', { kind, id: src.id });
    return src;
  }

  // Nearest actively bleeding source to a point (within `radius` mm).
  nearest(point, radius = 2.5, kind = null) {
    let best = null, bd = radius;
    for (const s of this.sources) {
      if (!s.active || (kind && s.kind !== kind)) continue;
      const d = s.position.distanceTo(point);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  // Bipolar coagulation. Returns {source, progress} or null. Oozes seal after
  // ~0.8 s of current; arterial bleeding cannot be coagulated.
  coagulate(point, dt) {
    const s = this.nearest(point, 2.5);
    if (!s) return null;
    if (s.kind === 'arterial') return { source: s, progress: 0, refused: true };
    s.coag += dt / 0.8;
    if (s.coag >= 1) this.stop(s, 'bipolar');
    return { source: s, progress: Math.min(1, s.coag) };
  }

  stop(s, by) {
    if (!s.active) return;
    s.active = false;
    s.blob.material.color.set('#2a1210');
    s.blob.material.emissive.set('#000000');
    s.blob.material.roughness = 0.6;
    s.blob.scale.multiplyScalar(0.7);
    s.blob.userData.part = s.blob.userData.pickPart = 'char';
    bus.emit('bleed:stop', { kind: s.kind, id: s.id, by });
  }

  // Suction at a tip position. Clears the pool when the tip reaches the blood
  // surface, and pulls nearby droplets in. Returns the ml removed this frame.
  suction(tip, dt) {
    let removed = 0;
    const reach = this.poolZ + 2.5 - tip.z;
    if (this.volume > 0 && reach > 0) {
      removed = Math.min(this.volume, BLEED.suctionRate * dt * Math.min(1, reach / 2.5 + 0.2));
      this.volume -= removed;
    }
    for (let i = 0; i < this.pCount; i++) {
      const dx = tip.x - this.pPos[i * 3], dy = tip.y - this.pPos[i * 3 + 1], dz = tip.z - this.pPos[i * 3 + 2];
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < 36) {
        if (d2 < 1.2) this.pLife[i] = 0;
        else { const k = 260 / Math.sqrt(d2) * dt; this.pVel[i * 3] += dx * k; this.pVel[i * 3 + 1] += dy * k; this.pVel[i * 3 + 2] += dz * k; }
      }
    }
    return removed;
  }

  #emit(s, n, speed) {
    for (let k = 0; k < n && this.pCount < MAX_P; k++) {
      const i = this.pCount++;
      const jitter = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(0.6);
      this.pPos[i * 3] = s.position.x + jitter.x;
      this.pPos[i * 3 + 1] = s.position.y + jitter.y;
      this.pPos[i * 3 + 2] = s.position.z + jitter.z;
      const v = s.normal.clone().multiplyScalar(speed * (0.6 + Math.random() * 0.6)).add(jitter.multiplyScalar(speed * 0.5));
      this.pVel[i * 3] = v.x; this.pVel[i * 3 + 1] = v.y; this.pVel[i * 3 + 2] = v.z;
      this.pLife[i] = 2.5 + Math.random() * 2;
    }
  }

  // heartPressure is the 0..1 arterial waveform, so arterial bleeding spurts in time with the pulse.
  update(dt, t, heartPressure = 0.5) {
    for (const s of this.sources) {
      if (!s.active) continue;
      const pulsatile = s.kind === 'arterial' ? 0.35 + 1.3 * heartPressure : 1;
      const rate = (s.kind === 'arterial' ? BLEED.arterialRate : BLEED.oozeRate) * this.pressure * pulsatile;
      this.volume += rate * dt;
      this.totalLoss += rate * dt;
      s.emitAcc += rate * dt * (s.kind === 'arterial' ? 120 : 260);
      const n = Math.floor(s.emitAcc);
      s.emitAcc -= n;
      this.#emit(s, n, s.kind === 'arterial' ? 55 * pulsatile * this.pressure : 3);
      const pulse = 1 + 0.12 * Math.sin(t * 7 + s.id);
      s.blob.scale.set(pulse, pulse, 0.55 * pulse);
    }

    // Integrate droplets: gravity plus heavy drag, since blood runs along
    // tissue rather than flying freely. A droplet dies when it joins the pool.
    const pz = this.poolZ;
    let w = 0;
    for (let i = 0; i < this.pCount; i++) {
      let life = this.pLife[i] - dt;
      const i3 = i * 3;
      const drag = Math.exp(-dt * 2.2);
      this.pVel[i3] = (this.pVel[i3] + GRAVITY.x * dt) * drag;
      this.pVel[i3 + 1] = (this.pVel[i3 + 1] + GRAVITY.y * dt) * drag;
      this.pVel[i3 + 2] = (this.pVel[i3 + 2] + GRAVITY.z * dt) * drag;
      this.pPos[i3] += this.pVel[i3] * dt;
      this.pPos[i3 + 1] += this.pVel[i3 + 1] * dt;
      this.pPos[i3 + 2] += this.pVel[i3 + 2] * dt;
      if (this.pPos[i3 + 2] < Math.max(pz, this.floorZ) - 0.3) life = 0;
      if (life > 0) {
        if (w !== i) {
          this.pPos[w * 3] = this.pPos[i3]; this.pPos[w * 3 + 1] = this.pPos[i3 + 1]; this.pPos[w * 3 + 2] = this.pPos[i3 + 2];
          this.pVel[w * 3] = this.pVel[i3]; this.pVel[w * 3 + 1] = this.pVel[i3 + 1]; this.pVel[w * 3 + 2] = this.pVel[i3 + 2];
        }
        this.pLife[w] = life;
        w++;
      }
    }
    this.pCount = w;
    this.points.geometry.setDrawRange(0, w);
    this.points.geometry.attributes.position.needsUpdate = true;

    // The pool surface eases toward its volume-derived height and shimmers slightly.
    this.pool.visible = this.volume > 0.04;
    this.pool.position.z += (pz - this.pool.position.z) * Math.min(1, dt * 4);
    this.poolMat.opacity = Math.min(0.94, 0.4 + this.volume * 0.6);
  }
}
