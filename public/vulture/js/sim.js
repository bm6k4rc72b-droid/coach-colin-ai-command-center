/**
 * Simulated feeds, so the whole system can be explored (and tested) with no
 * camera. Everything downstream of the detector — tracking, zones, alerts,
 * kinetics — runs exactly as it does on a real feed; only the detector is
 * replaced by ground truth with realistic jitter and dropped frames. The UI
 * stamps these feeds "SIMULATED" so they are never mistaken for live video.
 *
 * @module vulture/sim
 */

const D2R = Math.PI / 180;

/**
 * Side-view 33-point pose for a known movement.
 *
 * @param {'stand'|'squat'|'run'} mode Movement.
 * @param {number} t Seconds.
 * @param {object} [o] Options.
 * @param {number} [o.period=2.5] Squat cycle, seconds.
 * @param {number} [o.cadence=170] Running steps/min.
 * @param {number} [o.speed=0] Horizontal travel in frame-heights per second.
 * @param {number} [o.aspect=16/9] Frame aspect.
 * @param {boolean} [o.pingPong=false] Turn around at the frame edges.
 * @returns {{x:number,y:number,z:number,visibility:number}[]} Landmarks.
 */
export function simulatedPose(mode, t, o = {}) {
  const { period = 2.5, cadence = 170, speed = 0, aspect = 16 / 9, pingPong = false } = o;
  const H = 0.74; // stature in frame heights
  const L = { shank: 0.246 * H, thigh: 0.245 * H, trunk: 0.3 * H, neck: 0.13 * H, upper: 0.186 * H, fore: 0.146 * H, foot: 0.13 * H, ankleH: 0.039 * H };
  const ground = 0.93;
  const pts = new Array(33);
  const P = (x, y) => ({ x, y });
  const add = (p, len, deg) => P(p.x + len * Math.sin(deg * D2R), p.y - len * Math.cos(deg * D2R)); // deg from vertical-up, +forward
  let x0 = aspect * 0.42;
  let dir = 1;
  if (speed) {
    const span = aspect * 0.6;
    const travel = speed * t;
    if (pingPong) {
      const ph = travel % (2 * span);
      dir = ph < span ? 1 : -1;
      x0 = aspect * 0.2 + (ph < span ? ph : 2 * span - ph);
    } else {
      x0 = aspect * 0.15 + travel;
    }
  }
  const legs = [];
  let hip; let lean = 0; let armA = [15, -15];
  if (mode === 'run') {
    const ph = 2 * Math.PI * (cadence / 120) * t;
    const bob = 0.023 * H * Math.cos(2 * ph);
    hip = P(x0, ground - L.ankleH - (L.shank + L.thigh) * 0.94 + bob);
    lean = 8;
    for (const s of [0, Math.PI]) {
      const thighA = 32 * Math.sin(ph + s);
      const kneeFlex = 15 + 70 * Math.max(0, Math.sin(ph + s + 2.2)) ** 1.5;
      const knee = add(hip, -L.thigh, -thighA); // down the thigh
      const shankA = thighA - kneeFlex;
      const ankle = add(knee, -L.shank, -shankA);
      legs.push({ knee, ankle, footA: 95 + shankA * 0.5 });
    }
    armA = [-40 * Math.sin(ph), -40 * Math.sin(ph + Math.PI)];
  } else {
    const p = mode === 'squat' ? ((t % period) + period) % period / period : 0;
    const s = p < 0.22 ? 0 : Math.sin((Math.PI * (p - 0.22)) / 0.78) ** 2;
    const kneeInt = 176 - 92 * s;
    const shankTilt = 0.42 * (180 - kneeInt);
    const thighTilt = (180 - kneeInt) - shankTilt;
    for (const off of [0.004, -0.004]) {
      const ankle = P(x0 + off, ground - L.ankleH);
      const knee = add(ankle, L.shank, shankTilt);
      legs.push({ knee, ankle, footA: 90, thighTilt });
    }
    hip = add(legs[0].knee, L.thigh, -thighTilt);
    lean = 0.55 * thighTilt;
    armA = [20 + 70 * s, 20 + 70 * s];
  }
  const shoulder = add(hip, L.trunk, lean * dir);
  const nose = add(shoulder, L.neck, (lean * 0.6 + 12) * dir);
  for (let i = 0; i <= 10; i++) pts[i] = { ...nose };
  const fill = (i, p, z = 0) => { pts[i] = { x: p.x / aspect, y: p.y, z, visibility: 0.99 }; };
  for (let i = 0; i <= 10; i++) fill(i, P(nose.x + (i % 3) * 0.004 * dir, nose.y - (i > 0 && i < 9 ? 0.012 : 0)));
  [11, 12].forEach((i, k) => {
    fill(i, shoulder, k ? 0.05 : -0.05);
    const elbow = add(shoulder, -L.upper, -armA[k] * dir);
    const wrist = add(elbow, -L.fore, -(armA[k] + (mode === 'squat' ? 0 : 60)) * dir);
    fill(13 + k, elbow, k ? 0.05 : -0.05);
    fill(15 + k, wrist, k ? 0.05 : -0.05);
    fill(17 + k, wrist); fill(19 + k, wrist); fill(21 + k, wrist);
  });
  [23, 24].forEach((i, k) => {
    fill(i, hip, k ? 0.04 : -0.04);
    const leg = legs[k];
    const knee = mode === 'run' ? leg.knee : P(leg.knee.x + (k ? -0.004 : 0.004), leg.knee.y);
    const ankle = mode === 'run' ? P(hip.x + (leg.ankle.x - hip.x) * dir, leg.ankle.y) : leg.ankle;
    const kn = mode === 'run' ? P(hip.x + (knee.x - hip.x) * dir, knee.y) : knee;
    fill(25 + k, kn, k ? 0.04 : -0.04);
    fill(27 + k, ankle, k ? 0.04 : -0.04);
    const heel = P(ankle.x - 0.03 * H * dir, ankle.y + L.ankleH * 0.8);
    const toe = add(ankle, L.foot, leg.footA * dir);
    fill(29 + k, heel); fill(31 + k, P(toe.x, Math.min(toe.y + L.ankleH * 0.6, ground)));
  });
  return pts;
}

/** Ground-truth parking lot with cars arriving, parking and leaving. */
export class LotSim {
  constructor(seed = 7) {
    this.rand = mulberry32(seed);
    this.cars = [];
    this.people = [];
    this.last = null;
    this.nextArrival = 0;
    this.nextPerson = 3;
    this.layout = lotLayout();
    // Start with some bays already full.
    this.layout.bays.forEach((bay, i) => {
      if (this.rand() < 0.55) this.cars.push(this.makeCar(i, 'parked', 20 + this.rand() * 120));
    });
  }

  makeCar(bayIdx, state, dwell) {
    const bay = this.layout.bays[bayIdx];
    const c = { bay: bayIdx, state, dwell, x: state === 'parked' ? bay.cx : -0.06, y: state === 'parked' ? bay.cy : this.layout.roadY, color: CAR_COLORS[Math.floor(this.rand() * CAR_COLORS.length)], top: bay.top };
    return c;
  }

  /** @param {number} t Seconds. */
  step(t) {
    const dt = this.last === null ? 0 : Math.min(0.2, t - this.last);
    this.last = t;
    const taken = new Set(this.cars.map((c) => c.bay));
    if (t >= this.nextArrival) {
      const free = this.layout.bays.map((_, i) => i).filter((i) => !taken.has(i));
      if (free.length) this.cars.push(this.makeCar(free[Math.floor(this.rand() * free.length)], 'arrive', 25 + this.rand() * 90));
      this.nextArrival = t + 4 + this.rand() * 9;
    }
    if (t >= this.nextPerson) {
      const toBay = this.rand() < 0.35;
      this.people.push({ x: -0.03, y: 0.15, vx: 0.05 + this.rand() * 0.03, detour: toBay ? 0.72 + this.rand() * 0.12 : null, phase: 'walk' });
      this.nextPerson = t + 6 + this.rand() * 10;
    }
    const v = 0.14;
    for (const c of this.cars) {
      const bay = this.layout.bays[c.bay];
      if (c.state === 'arrive') {
        c.x += v * dt;
        if (c.x >= bay.cx) { c.x = bay.cx; c.state = 'in'; }
      } else if (c.state === 'in') {
        const dy = bay.cy - c.y;
        c.y += Math.sign(dy) * Math.min(Math.abs(dy), v * 0.6 * dt);
        if (Math.abs(bay.cy - c.y) < 1e-4) c.state = 'parked';
      } else if (c.state === 'parked') {
        c.dwell -= dt;
        if (c.dwell <= 0) c.state = 'out';
      } else if (c.state === 'out') {
        const dy = this.layout.roadY - c.y;
        c.y += Math.sign(dy) * Math.min(Math.abs(dy), v * 0.6 * dt);
        if (Math.abs(dy) < 1e-4) c.state = 'exit';
      } else if (c.state === 'exit') {
        c.x += v * dt;
      }
    }
    this.cars = this.cars.filter((c) => c.x < 1.08);
    for (const p of this.people) {
      if (p.detour !== null && p.phase === 'walk' && p.x >= p.detour) p.phase = 'down';
      if (p.phase === 'down') { p.y += 0.04 * dt; if (p.y > 0.24) p.phase = 'up'; }
      else if (p.phase === 'up') { p.y -= 0.04 * dt; if (p.y <= 0.15) { p.y = 0.15; p.phase = 'done'; } }
      else p.x += p.vx * dt;
    }
    this.people = this.people.filter((p) => p.x < 1.05);
  }

  /** Ground truth boxes with detector-like jitter and ~8 % dropouts. */
  detections() {
    const out = [];
    const j = () => (this.rand() - 0.5) * 0.006;
    for (const c of this.cars) {
      if (this.rand() < 0.08) continue;
      const vertical = c.state === 'parked' || c.state === 'in' || c.state === 'out';
      const w = vertical ? 0.062 : 0.1;
      const h = vertical ? 0.13 : 0.075;
      out.push({ label: this.rand() < 0.06 ? 'truck' : 'car', score: 0.62 + this.rand() * 0.35, x: c.x - w / 2 + j(), y: c.y - h / 2 + j(), w, h });
    }
    for (const p of this.people) {
      if (this.rand() < 0.1) continue;
      out.push({ label: 'person', score: 0.55 + this.rand() * 0.4, x: p.x - 0.012 + j(), y: p.y - 0.05 + j(), w: 0.024, h: 0.06 });
    }
    return out;
  }

  /**
   * Paint the scene.
   *
   * @param {CanvasRenderingContext2D} g Context.
   * @param {number} W Width px.
   * @param {number} Hh Height px.
   */
  draw(g, W, Hh) {
    g.fillStyle = '#2a2f36'; g.fillRect(0, 0, W, Hh);
    g.fillStyle = '#3a3f46'; g.fillRect(0, 0.08 * Hh, W, 0.14 * Hh); // sidewalk
    g.fillStyle = '#4b3a2a'; g.fillRect(0.7 * W, 0.08 * Hh, 0.18 * W, 0.18 * Hh); // loading bay
    g.strokeStyle = '#f5c518'; g.setLineDash([8, 6]); g.lineWidth = 2; g.strokeRect(0.7 * W, 0.08 * Hh, 0.18 * W, 0.18 * Hh); g.setLineDash([]);
    g.fillStyle = '#23272d'; g.fillRect(0, (this.layout.roadY - 0.07) * Hh, W, 0.14 * Hh);
    g.strokeStyle = '#d8d8d8'; g.lineWidth = 2;
    for (const b of this.layout.bays) {
      g.beginPath();
      g.moveTo(b.poly[0].x * W, b.poly[0].y * Hh);
      for (const p of b.poly.slice(1)) g.lineTo(p.x * W, p.y * Hh);
      g.closePath(); g.stroke();
    }
    g.strokeStyle = '#ffffff55'; g.setLineDash([18, 14]);
    g.beginPath(); g.moveTo(0, this.layout.roadY * Hh); g.lineTo(W, this.layout.roadY * Hh); g.stroke(); g.setLineDash([]);
    for (const c of this.cars) {
      const vertical = c.state === 'parked' || c.state === 'in' || c.state === 'out';
      const w = (vertical ? 0.055 : 0.09) * W; const h = (vertical ? 0.12 : 0.065) * Hh;
      g.save(); g.translate(c.x * W, c.y * Hh);
      g.fillStyle = '#0006'; roundRect(g, -w / 2 + 3, -h / 2 + 4, w, h, 6); g.fill();
      g.fillStyle = c.color; roundRect(g, -w / 2, -h / 2, w, h, 6); g.fill();
      g.fillStyle = '#9fd3ff88';
      if (vertical) { const f = c.top ? 1 : -1; g.fillRect(-w * 0.36, f * h * 0.12 - h * 0.08, w * 0.72, h * 0.16); }
      else g.fillRect(w * 0.12, -h * 0.36, w * 0.16, h * 0.72);
      g.restore();
    }
    for (const p of this.people) {
      g.fillStyle = '#ffd7a8'; g.beginPath(); g.arc(p.x * W, (p.y - 0.035) * Hh, 0.008 * Hh, 0, 7); g.fill();
      g.fillStyle = '#4fc3f7'; g.fillRect(p.x * W - 0.006 * W, (p.y - 0.027) * Hh, 0.012 * W, 0.035 * Hh);
    }
  }

  /** Zones matching the simulated layout, so the demo works out of the box. */
  defaultZones() {
    const zones = this.layout.bays.map((b, i) => ({ id: `sp${i + 1}`, name: `Space ${i + 1}`, kind: 'space', points: b.poly.map((p) => ({ ...p })) }));
    zones.push({ id: 'load', name: 'Loading bay', kind: 'restricted', points: [{ x: 0.7, y: 0.08 }, { x: 0.88, y: 0.08 }, { x: 0.88, y: 0.26 }, { x: 0.7, y: 0.26 }] });
    const y0 = this.layout.roadY - 0.07; const y1 = this.layout.roadY + 0.07;
    zones.push({ id: 'entry', name: 'Entry gate', kind: 'line', points: [{ x: 0.04, y: y0 }, { x: 0.04, y: y1 }] });
    zones.push({ id: 'exit', name: 'Exit gate', kind: 'line', points: [{ x: 0.96, y: y1 }, { x: 0.96, y: y0 }] });
    return zones;
  }
}

function lotLayout() {
  const bays = [];
  const n = 8; const x0 = 0.1; const x1 = 0.9; const w = (x1 - x0) / n;
  const roadY = 0.56;
  for (const [top, ya, yb] of [[true, 0.3, 0.48], [false, 0.64, 0.82]]) {
    for (let i = 0; i < n; i++) {
      const xa = x0 + i * w; const xb = xa + w;
      bays.push({ top, cx: (xa + xb) / 2, cy: (ya + yb) / 2, poly: [{ x: xa, y: ya }, { x: xb, y: ya }, { x: xb, y: yb }, { x: xa, y: yb }] });
    }
  }
  return { bays, roadY };
}

const CAR_COLORS = ['#c0392b', '#ecf0f1', '#2c3e50', '#7f8c8d', '#2980b9', '#16a085', '#f39c12', '#8e44ad', '#111'];

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}

/** Small deterministic PRNG so the demo is reproducible. */
export function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
