import { OFFENSE, RECEIVERS, ROUTES, CONCEPTS, COVERAGES, DEFENDER_POS, SPEED, TIMING, FIELD } from './config.js';

// One pass play, simulated in screen coordinates (sx, z) in yards.
// The controller renders it; the simulation owns every rule:
//   receivers   run their routes, accelerating off the line
//   man         defenders shadow their receiver with a reaction delay, so sharp breaks create separation
//   zone        defenders drop to their area and squeeze the most dangerous receiver in it.
//               Deep zones drift toward where the quarterback is looking
//   rush        rushers are picked up by the protection. An extra rusher beyond
//               the blockers comes free, so a slide the wrong way costs time
//   ball        flies to where the receiver WILL be; the outcome depends on who is closest when it arrives
const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export class PlaySim {
  constructor({ coverage, concept, protection }) {
    this.coverage = coverage;
    this.concept = concept;
    this.protection = protection;          // { slide: -1 | 0 | 1, rbStay: bool }
    this.t = 0;
    this.snapped = false;
    this.over = false;
    this.result = null;
    this.ball = null;
    this.frames = [];
    this.eyes = { x: 0, stare: 0 };
    this.actors = {};
    for (const o of OFFENSE) this.actors[o.id] = { id: o.id, team: 'off', pos: o.pos, x: o.sx, z: o.z, vx: 0, vz: 0, side: o.side ?? 0 };
    const cov = COVERAGES[coverage];
    for (const [id, d] of Object.entries(cov)) {
      if (typeof d !== 'object' || !d.pre) continue;
      this.actors[id] = { id, team: 'def', pos: DEFENDER_POS[id], x: d.pre[0], z: d.pre[1], vx: 0, vz: 0, job: d.job, deep: !!d.job.deep };
    }
    this.history = {};
  }

  get offense() { return OFFENSE.map((o) => this.actors[o.id]); }
  get defense() { return Object.values(this.actors).filter((a) => a.team === 'def'); }
  get receivers() { return RECEIVERS.map((id) => this.actors[id]).filter((r) => !(r.id === 'RB' && this.protection.rbStay)); }

  // Pre-snap motion: the slot motions toward the formation. A man defender follows
  // him across the field; zone defenders only bump over. That is how motion reveals man vs zone.
  motion(dt) {
    const s = this.actors.S;
    const target = 4.5;
    if (s.x <= target) return true;
    s.x = Math.max(target, s.x - 5.5 * dt);
    const nb = this.actors.NB;
    if (nb.job.man === 'S') { nb.x += (s.x - nb.x) * Math.min(1, dt * 3); }
    else nb.x += (Math.max(9, s.x + 5) - nb.x) * Math.min(1, dt * 1.2);
    return false;
  }

  snap() {
    this.snapped = true;
    // Routes from the alignment at the snap.
    this.routes = {};
    for (const r of this.receivers) {
      const name = CONCEPTS[this.concept].routes[r.id];
      const side = r.side || (r.x < 0 ? -1 : 1);
      const pts = ROUTES[name](side).map(([dx, dz]) => ({ x: r.x + dx, z: r.z + dz }));
      this.routes[r.id] = { name, pts, i: 0, speed: SPEED[r.pos] ?? SPEED.WR };
    }
    // Protection: blockers are the five linemen, plus the RB if he stays in.
    const rushers = this.defense.filter((d) => d.job.rush !== undefined).sort((a, b) => a.x - b.x);
    const blockers = ['LT', 'LG', 'C', 'RG', 'RT'].map((id) => this.actors[id]);
    if (this.protection.rbStay) blockers.push(this.actors.RB);
    this.unblocked = [];
    if (rushers.length > blockers.length) {
      // The slide protects one side. The extra rusher on the other side comes free.
      const extra = rushers.length - blockers.length;
      const slide = this.protection.slide;
      const pool = slide === 0 ? rushers.filter((r) => DEFENDER_POS[r.id] !== 'DL') : slide < 0 ? [...rushers].reverse() : rushers;
      this.unblocked = pool.slice(0, extra).map((r) => r.id);
    }
    // Sliding away from the blitz side weakens the pocket even when everyone is picked up.
    const blitzSide = Math.sign(rushers.filter((r) => DEFENDER_POS[r.id] !== 'DL').reduce((s, r) => s + r.x, 0));
    this.pocketTime = TIMING.pocketClean - (blitzSide && this.protection.slide && this.protection.slide !== blitzSide ? 0.8 : 0);
    const blocked = rushers.filter((r) => !this.unblocked.includes(r.id));
    this.blocks = {};
    blocked.forEach((r, k) => { this.blocks[r.id] = blockers[Math.min(k, blockers.length - 1)].id; });
    this.firstPressure = null;
  }

  // Where a receiver will be `ahead` seconds from now, following his route.
  predict(r, ahead) {
    const R = this.routes[r.id];
    let x = r.x, z = r.z, i = R.i, t = ahead;
    const sp = R.speed;
    while (t > 0 && i < R.pts.length) {
      const p = R.pts[i];
      const d = Math.hypot(p.x - x, p.z - z);
      const step = sp * t;
      if (step >= d) { x = p.x; z = p.z; t -= d / sp; i++; }
      else { x += (p.x - x) / d * step; z += (p.z - z) / d * step; t = 0; }
    }
    return { x, z };
  }

  throw(targetId, touch = false) {
    if (this.ball || this.over) return null;
    const qb = this.actors.QB, r = this.actors[targetId];
    const speed = touch ? SPEED.touch : SPEED.bullet;
    let land = { x: r.x, z: r.z }, tFlight = 0.5;
    for (let k = 0; k < 4; k++) { tFlight = dist(qb, land) / speed + 0.12; land = this.predict(r, tFlight); }
    const sep = this.separation(r);
    this.ball = { from: { x: qb.x, z: qb.z }, to: land, t0: this.t, tFlight, touch, target: targetId, peak: touch ? 1.5 + dist(qb, land) * 0.16 : 0.6 + dist(qb, land) * 0.05 };
    this.release = { t: this.t, target: targetId, sepAtThrow: sep, best: this.bestOpen(), eyesStare: this.eyes.stare, eyesOnTarget: Math.abs(this.eyes.x - r.x) < 5 };
    return this.ball;
  }
  throwAway() {
    if (this.ball || this.over) return;
    const qb = this.actors.QB;
    const side = qb.x >= 0 ? 1 : -1;
    this.ball = { from: { x: qb.x, z: qb.z }, to: { x: side * (FIELD.sidelineX + 4), z: qb.z + 12 }, t0: this.t, tFlight: 1.1, touch: true, target: null, peak: 4, away: true };
    this.release = { t: this.t, target: null, away: true, best: this.bestOpen() };
  }

  separation(r) { return Math.min(...this.defense.filter((d) => d.job.rush === undefined).map((d) => dist(d, r))); }
  bestOpen() {
    let best = null;
    for (const r of this.receivers) {
      const s = this.separation(r);
      if (!best || s > best.sep) best = { id: r.id, sep: s };
    }
    return best;
  }

  #moveToward(a, tx, tz, speed, dt, accel = 14) {
    const dx = tx - a.x, dz = tz - a.z;
    const d = Math.hypot(dx, dz);
    const want = d < 0.05 ? 0 : Math.min(speed, d / Math.max(dt, 1e-3));
    const vx = d < 1e-4 ? 0 : dx / d * want, vz = d < 1e-4 ? 0 : dz / d * want;
    const k = Math.min(1, accel * dt / Math.max(0.001, Math.hypot(vx - a.vx, vz - a.vz)));
    a.vx += (vx - a.vx) * k; a.vz += (vz - a.vz) * k;
    a.x += a.vx * dt; a.z += a.vz * dt;
  }

  step(dt) {
    if (!this.snapped || this.over) return;
    this.t += dt;
    const A = this.actors, qb = A.QB;
    // Receivers record where they were, for defenders' reaction delay.
    for (const r of this.receivers) { (this.history[r.id] ||= []).push({ t: this.t, x: r.x, z: r.z }); if (this.history[r.id].length > 40) this.history[r.id].shift(); }

    // Quarterback: shotgun drop, then settle.
    if (!this.ball || this.ball.away) this.#moveToward(qb, 0, this.t < TIMING.dropBack ? -7 : -7, SPEED.QB, dt);

    // Receivers.
    for (const r of this.receivers) {
      const R = this.routes[r.id];
      const ramp = Math.min(1, 0.45 + this.t * 0.9);
      if (this.ball && this.ball.target === r.id && !this.ball.away) {
        // Track the ball's landing point in the last part of its flight.
        const left = this.ball.t0 + this.ball.tFlight - this.t;
        const p = this.predict(r, 0);
        if (left < 0.5) this.#moveToward(r, this.ball.to.x, this.ball.to.z, R.speed, dt, 30);
        else if (R.i < R.pts.length) this.#followRoute(r, R, ramp, dt); else this.#moveToward(r, p.x, p.z, 0, dt);
      } else if (R.i < R.pts.length) this.#followRoute(r, R, ramp, dt);
      else this.#moveToward(r, r.x, r.z, 0, dt);
    }

    // Defense.
    const land = this.ball && !this.ball.away ? this.ball.to : null;
    for (const d of this.defense) {
      const sp = SPEED[d.pos] ?? 7;
      const job = d.job;
      if (job.rush !== undefined) { this.#rush(d, dt); continue; }
      if (land && this.t - this.ball.t0 > SPEED.reaction && dist(d, land) < 15) { this.#moveToward(d, land.x, land.z, sp * 1.05, dt, 20); continue; }
      if (job.man) {
        const h = this.history[job.man];
        const lag = h ? h.find((e) => e.t >= this.t - SPEED.reaction) || h[h.length - 1] : A[job.man];
        const tgt = A[job.man];
        const inside = tgt.x > 0 ? -0.5 : 0.5;
        this.#moveToward(d, lag.x + inside, lag.z + 0.8, sp, dt, 11);
        continue;
      }
      const [zx, zz, hw, hd] = job.zone;
      const threats = this.receivers.filter((r) => Math.abs(r.x - zx) < hw + 2 && Math.abs(r.z - zz) < hd + 3);
      let tx = zx, tz = zz;
      if (d.deep) {
        const deepest = threats.sort((a, b) => b.z - a.z)[0];
        if (deepest) { tx = deepest.x; tz = Math.max(deepest.z + 2.5, zz - hd * 0.4); }
        // Deep zones read the quarterback's eyes.
        const bias = clamp(this.eyes.x - tx, -1, 1) * (2.5 + Math.min(4, this.eyes.stare * 3));
        if (Math.abs(this.eyes.x - zx) < hw + 6) tx += bias;
        tz = Math.min(tz, zz + hd);
      } else if (threats.length) {
        const near = threats.sort((a, b) => dist(a, d) - dist(b, d))[0];
        tx = clamp(near.x, zx - hw, zx + hw); tz = clamp(near.z + 0.8, zz - hd, zz + hd);
      }
      this.#moveToward(d, tx, tz, sp * (this.t < 0.3 ? 0.6 : 1), dt, 10);
    }

    // Offensive line: stay between each blocked rusher and the quarterback.
    for (const [rid, bid] of Object.entries(this.blocks || {})) {
      const r = A[rid], b = A[bid];
      const dx = qb.x - r.x, dz = qb.z - r.z, d = Math.hypot(dx, dz) || 1;
      this.#moveToward(b, r.x + dx / d * 0.9, r.z + dz / d * 0.9, 6, dt, 20);
    }

    // Sack check.
    if (!this.ball) {
      for (const d of this.defense) if (d.job.rush !== undefined && dist(d, qb) < 1.15) { this.#end({ type: 'sack', by: d.id, yards: Math.round(qb.z - 0.5) }); break; }
      const closest = Math.min(...this.defense.filter((d) => d.job.rush !== undefined).map((d) => dist(d, qb)));
      this.pressure = clamp(1 - (closest - 1.2) / 5, 0, 1);
    }

    // Ball in flight.
    if (this.ball && !this.over) {
      const b = this.ball, k = (this.t - b.t0) / b.tFlight;
      if (k >= 1) this.#arrive();
    }
    this.#record();
  }

  #followRoute(r, R, ramp, dt) {
    const p = R.pts[R.i];
    this.#moveToward(r, p.x, p.z, R.speed * ramp, dt, 16);
    if (Math.hypot(p.x - r.x, p.z - r.z) < 0.6) R.i++;
  }

  #rush(d, dt) {
    const qb = this.actors.QB;
    const free = this.unblocked.includes(d.id);
    if (free) return this.#moveToward(d, qb.x, qb.z, TIMING.unblockedSpeed, dt, 12);
    const collapse = this.t > this.pocketTime;
    const b = this.actors[this.blocks[d.id]];
    if (!collapse) {
      // Engaged: the blocker holds him near the line; he inches forward.
      const tx = b ? b.x + (d.x - b.x) * 0.2 : d.x;
      this.#moveToward(d, tx, Math.max(-3.8, d.z - dt * 0.35) , 2.5, dt, 8);
      if (d.z > -1) this.#moveToward(d, d.x, -1.5, 3, dt, 8);
    } else this.#moveToward(d, qb.x, qb.z, 3.2, dt, 6);
  }

  #arrive() {
    const b = this.ball;
    if (b.away) return this.#end({ type: 'throwaway', yards: 0 });
    const r = this.actors[b.target];
    const dRec = dist(r, b.to);
    const defs = this.defense.filter((d) => d.job.rush === undefined).map((d) => ({ d, dd: dist(d, b.to) })).sort((a, c) => a.dd - c.dd);
    const nd = defs[0];
    const window = nd.dd;
    const rnd = Math.random();
    if (nd.dd < 1.0 && nd.dd < dRec) {
      return this.#end(rnd < 0.55 + (1 - nd.dd) * 0.4 ? { type: 'int', by: nd.d.id, yards: 0, window } : { type: 'pbu', by: nd.d.id, yards: 0, window });
    }
    if (dRec <= 1.6) {
      const p = 0.97 - Math.max(0, 1.8 - nd.dd) * 0.35;
      if (rnd < p) {
        const yac = clamp((nd.dd - 1) * 1.7, 0, 14);
        const yards = Math.round(b.to.z + yac - 0);
        return this.#end({ type: 'catch', target: b.target, yards, yac: Math.round(yac), window, air: Math.round(b.to.z) });
      }
      return this.#end({ type: nd.dd < 1.8 ? 'pbu' : 'drop', by: nd.d.id, yards: 0, window });
    }
    return this.#end({ type: 'miss', yards: 0, window, off: dRec });
  }

  #end(res) {
    this.over = true;
    this.result = { ...res, time: this.t, release: this.release, pressureAtEnd: this.pressure };
  }

  // Ball position in the air (for rendering).
  ballPos() {
    const b = this.ball; if (!b) return null;
    const k = clamp((this.t - b.t0) / b.tFlight, 0, 1);
    return { x: b.from.x + (b.to.x - b.from.x) * k, z: b.from.z + (b.to.z - b.from.z) * k, y: 1.9 + Math.sin(k * Math.PI) * b.peak - k * 0.8, k };
  }

  #record() {
    const f = { t: this.t, a: {} };
    for (const a of Object.values(this.actors)) f.a[a.id] = [a.x, a.z];
    const bp = this.ballPos(); if (bp) f.ball = [bp.x, bp.z, bp.y];
    this.frames.push(f);
  }
}
