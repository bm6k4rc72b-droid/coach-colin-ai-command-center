// ===== Duel combat: deflect and block, posture and guard breaks, executions, colour-coded attacks, attack tokens,
// lock-on, standoffs; traversal (ledge mantle, landing roll, fall damage, lean); particles; Raven Sight; colour grade =====
FEEL.slowT = 0; FEEL.slowK = 1;
function slowmo(t, k) { FEEL.slowT = Math.max(FEEL.slowT, t); FEEL.slowK = k; }
const PARRY_WIN = 0.24;
Object.assign(ETYPES.cutthroat, { guard: 0.3, red: 0.1, blue: 0.15, posture: 60 });
Object.assign(ETYPES.wolfhead, { guard: 0.22, red: 0.12, blue: 0.12, posture: 70 });
Object.assign(ETYPES.berserker, { name: 'Hrolf the Red', guard: 0, red: 0.38, blue: 0.2, posture: 170 });
Object.assign(ETYPES.champion, { guard: 0.45, red: 0.22, blue: 0.3, posture: 210 });
ATK.execute = { dur: 1.25, hit: 9, range: 0, arc: 0, mult: 0, st: 0, lunge: 0.8 };
ATK.drawcut = { dur: 0.75, hit: 9, range: 0, arc: 0, mult: 0, st: 0, lunge: 7 };
Object.assign(COMBAT_POSES, {
  execute(t, v) { const up = smooth(0, 0.45, t), dn = smooth(0.45, 0.58, t); v[C.hipY] = 0.92 - 0.2 * dn; v[C.sRX] = v[C.sLX] = lerp(-0.4, -3.0, up) + dn * 2.7; v[C.eRX] = v[C.eLX] = -0.5 + dn * 0.3; v[C.sRZ] = -0.25; v[C.sLZ] = 0.35; v[C.spX] = -0.3 * up + 0.75 * dn; v[C.chX] = -0.15 * up + 0.2 * dn; v[C.tLX] = -0.9 * dn; v[C.kLX] = 1.0 * dn; v[C.tRX] = 0.35 * dn; v[C.kRX] = 0.6 * dn; v[C.hdX] = 0.2 * dn; },
  drawcut(t, v) { const k = smooth(0.05, 0.25, t); v[C.hipY] = 0.8; v[C.tLX] = -0.9; v[C.kLX] = 1.0; v[C.tRX] = 0.6; v[C.kRX] = 0.4; v[C.spX] = 0.4; v[C.sRX] = -1.4; v[C.sRZ] = lerp(1.2, -1.9, k); v[C.eRX] = lerp(-1.8, -0.1, k); v[C.chYaw] = lerp(0.9, -0.9, k); v[C.sLX] = -0.4; v[C.sLZ] = 0.9 * k; },
  mantle(t, v) { const k = t / 0.7, pull = smooth(0.1, 0.6, k); v[C.sRX] = v[C.sLX] = lerp(-2.9, -0.6, pull); v[C.eRX] = v[C.eLX] = lerp(-0.2, -1.6, pull); v[C.sRZ] = -0.2; v[C.sLZ] = 0.2; v[C.tLX] = lerp(-0.4, -1.6, pull); v[C.kLX] = lerp(0.6, 2.0, pull); v[C.tRX] = lerp(0.2, -0.8, pull); v[C.kRX] = lerp(0.3, 1.4, pull); v[C.spX] = 0.3 + 0.3 * pull; v[C.hipY] = lerp(0.95, 0.7, pull); },
  roll(t, v) { const k = t / 0.5; v[C.hipY] = 0.5 + 0.35 * smooth(0.6, 1, k); v[C.spX] = 0.85; v[C.tLX] = v[C.tRX] = -1.4; v[C.kLX] = v[C.kRX] = 2.0; v[C.sLX] = v[C.sRX] = 0.5; v[C.eLX] = v[C.eRX] = -1.2; v[C.hipX] = Math.sin(k * Math.PI) * 1.2; },
});
// stance, guard, lean and breathing on every character
const _poseDuel = Char.prototype.pose;
Char.prototype.pose = function (state, v) {
  _poseDuel.call(this, state, v);
  const st = this.stance || 0;
  if (st > 0.01 && (state === 'idle' || state === 'walk')) { v[C.hipY] -= 0.06 * st; v[C.tLZ] += 0.1 * st; v[C.tRZ] -= 0.1 * st; v[C.kLX] += 0.28 * st; v[C.kRX] += 0.28 * st; v[C.tLX] -= 0.14 * st; v[C.tRX] -= 0.14 * st; v[C.spX] += 0.12 * st; v[C.chYaw] += 0.22 * st; }
  const bw = this.blockW || 0;
  if (bw > 0.01 && state !== 'sit' && state !== 'lie') { v[C.sRX] = lerp(v[C.sRX], -1.45, bw); v[C.sRZ] = lerp(v[C.sRZ], -0.8, bw); v[C.eRX] = lerp(v[C.eRX], -1.35, bw); v[C.sLX] = lerp(v[C.sLX], -1.3, bw); v[C.sLZ] = lerp(v[C.sLZ], 0.55, bw); v[C.eLX] = lerp(v[C.eLX], -1.55, bw); v[C.hdX] = lerp(v[C.hdX], 0.12, bw); }
  if (state === 'run' || state === 'walk') { v[C.hipRoll] += this.lean || 0; v[C.chX] += this.fwd || 0; }
  if (state === 'idle') v[C.chX] += Math.sin(this.t * 1.9) * 0.025;
};

// ---------- particles: sparks, blood, rain splashes ----------
class Particles {
  constructor(n, size, additive) {
    this.n = n; this.i = 0; this.pos = new Float32Array(n * 3); this.col = new Float32Array(n * 3); this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.add = additive;
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.pts = new THREE.Points(g, new THREE.PointsMaterial({ size, vertexColors: true, map: TEX.glow, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending, alphaTest: additive ? 0 : 0.3 }));
    this.pts.frustumCulled = false; scene.add(this.pts); for (let i = 0; i < n; i++) this.pos[i * 3 + 1] = -999;
  }
  emit(x, y, z, vx, vy, vz, r, g, b, life) { const i = this.i, o = i * 3; this.i = (i + 1) % this.n; this.pos[o] = x; this.pos[o + 1] = y; this.pos[o + 2] = z; this.vel[o] = vx; this.vel[o + 1] = vy; this.vel[o + 2] = vz; this.col[o] = r; this.col[o + 1] = g; this.col[o + 2] = b; this.life[i] = life; }
  update(dt, grav) {
    for (let i = 0; i < this.n; i++) {
      if (this.life[i] <= 0) continue; const o = i * 3; this.life[i] -= dt;
      if (this.life[i] <= 0) { this.pos[o + 1] = -999; continue; }
      this.vel[o + 1] -= grav * dt; this.pos[o] += this.vel[o] * dt; this.pos[o + 1] += this.vel[o + 1] * dt; this.pos[o + 2] += this.vel[o + 2] * dt;
      if (this.vel[o + 1] < 0 && grav > 0) { const gy = groundAt(this.pos[o], this.pos[o + 2], this.pos[o + 1] + 0.4); if (this.pos[o + 1] < gy + 0.02) { this.pos[o + 1] = gy + 0.02; this.vel[o] = this.vel[o + 1] = this.vel[o + 2] = 0; } }
      if (this.add) { this.col[o] *= 0.93; this.col[o + 1] *= 0.9; this.col[o + 2] *= 0.86; }
    }
    this.pts.geometry.attributes.position.needsUpdate = true; this.pts.geometry.attributes.color.needsUpdate = true;
  }
}
const PFX = { spark: null, blood: null, splash: null, t: 0 };
function initPfx() { PFX.spark = new Particles(220, 0.1, true); PFX.blood = new Particles(420, 0.075, false); PFX.splash = new Particles(160, 0.14, true); }
function sparks(p, n = 16, col = [1, 0.85, 0.5]) { for (let i = 0; i < n; i++) PFX.spark.emit(p.x, p.y, p.z, rr(-5, 5), rr(0, 5), rr(-5, 5), col[0], col[1], col[2], rr(0.25, 0.55)); }
function bloodBurst(p, dx, dz, n = 14) { for (let i = 0; i < n; i++) { const s = rr(1.5, 4.5); PFX.blood.emit(p.x, p.y, p.z, dx * s + rr(-1.2, 1.2), rr(0.8, 3.5), dz * s + rr(-1.2, 1.2), rr(0.32, 0.45), 0.02, 0.02, rr(1.5, 6)); } }
function updatePfx(dt) {
  if (!PFX.spark) return; PFX.spark.update(dt, 9); PFX.blood.update(dt, 13); PFX.splash.update(dt, 0);
  if (ENV.rain > 0.3 && !LITE) { const n = Math.round(ENV.rain * (IS_TOUCH ? 3 : 6)); for (let i = 0; i < n; i++) { const x = player.pos.x + rr(-14, 14), z = player.pos.z + rr(-14, 14), y = groundAt(x, z, player.pos.y + 6); if (y > SEA_Y - 0.1) PFX.splash.emit(x, y + 0.03, z, 0, 0.6, 0, 0.35, 0.38, 0.42, 0.12); } }
}
// weapon glints that telegraph enemy attacks (blue: parry it; red: dodge it)
const GLINTS = [];
function glint(e, color, dur) {
  let g = GLINTS.find((q) => q.t <= 0); if (!g) { g = { s: new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false })), t: 0 }; g.s.renderOrder = 10; scene.add(g.s); GLINTS.push(g); }
  g.e = e; g.t = dur; g.dur = dur; g.s.material.color.setHex(color); g.s.visible = true;
}
function updateGlints(dt) { for (const g of GLINTS) { if (g.t <= 0) { g.s.visible = false; continue; } g.t -= dt; g.e.ch.J.faR.getWorldPosition(g.s.position); const k = 1 - g.t / g.dur; g.s.scale.setScalar(0.4 + Math.sin(k * Math.PI) * 1.4); g.s.material.opacity = Math.sin(k * Math.PI); } }

// ---------- enemies: posture, guard, colour-coded attacks, attack tokens, knockback ----------
function ensureDuel(e) { if (e.posture === undefined) { e.posture = 0; e.maxPosture = e.T.posture || 80; e.kv = new THREE.Vector3(); e.ring = rr(4.2, 6.4); e.side = rand() < 0.5 ? 1 : -1; e.sideT = rr(2, 5); e.lastHit = -9; } }
let TOK_AT = -1; const TOKENS = new Set();
function hasToken(e) {
  if (TOK_AT !== COMBAT.now) {
    TOK_AT = COMBAT.now; TOKENS.clear();
    const list = ENEMIES.filter((o) => o.aggro && !o.dead && o.active && !o.held).sort((a, b) => a.pos.distanceToSquared(player.pos) - b.pos.distanceToSquared(player.pos));
    const n = list.length >= 3 ? 1 : 2; for (const o of list) if (o.T.boss || TOKENS.size < n || o.state === 'windup') TOKENS.add(o);
  }
  return TOKENS.has(e);
}
Enemy.prototype.startStrike = function () {
  const T = this.T, r = rand(); this.kind = r < (T.red || 0) ? 'red' : r < (T.red || 0) + (T.blue || 0) ? 'blue' : 'n';
  const w = T.windup + (this.kind === 'n' ? 0 : 0.28);
  this.state = 'windup'; this.special = null; this.ch.windup = w; this.timer = w; this.cool = rr(0.9, 1.9) + w; this.ch.play('eStrike', w + 0.45);
  if (this.kind !== 'n') { glint(this, this.kind === 'red' ? 0xff2a1a : 0x55b8ff, w); sfx(this.kind === 'red' ? 'warnRed' : 'warnBlue'); }
};
Enemy.prototype.strike = function (d, toP) {
  const T = this.T; COMBAT.incoming = { e: this, kind: this.special === 'slam' ? 'red' : this.kind || 'n' };
  if (this.special === 'slam') { shake(0.45); sfx('slam'); if (d < 5.5) heroHurt(Math.round(T.dmg * 1.4), this.pos.x, this.pos.z); }
  else { sfx('eswing'); if (d < T.reach + 0.9 && Math.abs(angDiff(this.yaw, toP)) < 1.2) heroHurt(Math.round(T.dmg * rr(0.9, 1.1) * (this.kind === 'red' ? 1.4 : this.kind === 'blue' ? 1.15 : 1)), this.pos.x, this.pos.z); }
  COMBAT.incoming = null; this.kind = 'n';
};
Enemy.prototype.hurt = function (dmg, dx, dz, push, crit, heavy) {
  if (this.dead || this.state === 'executed') return; ensureDuel(this);
  this.lastHit = COMBAT.now; if (!this.aggro) this.alertNow();
  const hitP = this.pos.clone().add(_v.set(-dx * 0.3, this.T.height * 0.62, -dz * 0.3));
  const facing = Math.abs(angDiff(this.yaw, Math.atan2(-dx, -dz))) < 1.1;
  if (facing && !heavy && !this.held && !['stagger', 'broken', 'windup'].includes(this.state) && rand() < (this.T.guard || 0)) {
    this.posture += dmg * 1.3; sparks(hitP, 14); sfx('block'); floatText(hitP, 'Guarded', 'blk'); this.kv.set(dx * 1.6, 0, dz * 1.6); this.ch.play('hurt', 0.25);
    if (this.posture >= this.maxPosture) this.breakGuard(); return;
  }
  this.hp -= dmg; this.flash = 1; dmgNumber(this.pos.clone().add(_v.set(0, this.T.height + 0.2, 0)), dmg, crit ? 'crit' : 'dmg');
  bloodBurst(hitP, dx, dz, crit || heavy ? 16 : 9);
  this.posture += dmg * (heavy ? 1.8 : 0.7);
  const kb = (this.T.boss ? 0.3 : 1) * (heavy ? 7 : 3.5); this.kv.set(dx * kb, 0, dz * kb);
  const armored = this.state === 'windup' && this.kind === 'red';
  if (!this.T.boss && !armored) { this.ch.action = null; this.state = 'stagger'; this.timer = heavy ? 0.6 : 0.35; this.ch.play('hurt', 0.4); }
  if (this.hp <= 0) { this.die(dx, dz); return; }
  if (this.posture >= this.maxPosture) this.breakGuard();
};
Enemy.prototype.breakGuard = function () {
  this.state = 'broken'; this.timer = this.T.boss ? 2.2 : 2.8; this.ch.action = null; this.posture = this.maxPosture; this.kind = 'n';
  const p = this.pos.clone().add(_v.set(0, this.T.height * 0.7, 0)); sparks(p, 26, [1, 0.95, 0.7]); floatText(p, 'Guard broken!', 'crit'); sfx('guardBreak'); shake(0.25);
};
const _dieDuel = Enemy.prototype.die;
Enemy.prototype.die = function (dx = 0, dz = 0) {
  if (this.dead) return; ensureDuel(this); _dieDuel.call(this);
  if (dx || dz) { this.kv.set(dx * 6, 0, dz * 6); this.yaw = Math.atan2(-dx, -dz); }
  bloodBurst(this.pos.clone().add(_v.set(0, this.T.height * 0.6, 0)), dx, dz, 22);
  if (COMBAT.lock === this) COMBAT.lock = nextLockTarget(this);
  if (COMBAT.riposte && COMBAT.riposte.e === this) COMBAT.riposte = null;
};
Enemy.prototype.update = function (dt) {
  const ch = this.ch, T = this.T; ensureDuel(this);
  if (!this.active) { ch.root.visible = false; this.bar.hidden = true; return; }
  const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z, d = Math.hypot(dx, dz), toP = Math.atan2(dx, dz);
  ch.root.visible = d < 140 && !(this.dead && this.sink > 2.2);
  this.flash = Math.max(0, this.flash - dt * 6);
  const rv = RAVEN.t > 0 && d < 90 && !this.dead ? 0.6 + 0.35 * Math.sin(COMBAT.now * 8) : 0, br = this.state === 'broken' ? 0.35 + 0.3 * Math.sin(COMBAT.now * 12) : 0;
  this.mat.emissive.setRGB(Math.max(this.flash, rv, br), this.flash * 0.9 + br * 0.75, this.flash * 0.8 + br * 0.2);
  if (this.kv.lengthSq() > 1e-4) { this.pos.x += this.kv.x * dt; this.pos.z += this.kv.z * dt; this.kv.multiplyScalar(Math.pow(this.dead ? 0.02 : 0.004, dt)); collideCircle(this.pos, this.radius, T.height); }
  if (this.state !== 'broken') this.posture = Math.max(0, this.posture - dt * (COMBAT.now - this.lastHit > 2 ? 16 : 3));
  if (this.dead) { this.timer += dt; ch.setState('lie'); this.sink = this.timer > 6 ? this.timer - 6 : 0; if (this.timer > 45 && this.respawns && d > 30) this.revive(); }
  else if (this.held) {
    this.yaw += angDiff(this.yaw, toP) * Math.min(1, dt * 6);
    if (this.charge && d > 1.3) { const sp = 12; this.pos.x += Math.sin(this.yaw) * sp * dt; this.pos.z += Math.cos(this.yaw) * sp * dt; ch.phase += sp * dt / 2.6 * TAU; ch.setState('run'); collideCircle(this.pos, this.radius, T.height); }
    else ch.setState('idle');
    ch.stance = 1;
  }
  else if (this.state === 'executed') { ch.setState('crouch'); this.yaw += angDiff(this.yaw, toP) * Math.min(1, dt * 8); }
  else if (this.state === 'broken') { ch.setState('crouch'); this.timer -= dt; if (this.timer <= 0) { this.state = 'idle'; this.posture = this.maxPosture * 0.4; } }
  else if (d > 140 && !this.aggro) return;
  else {
    const home = Math.hypot(this.pos.x - this.spawn.x, this.pos.z - this.spawn.z);
    if (!this.aggro && !COMBAT.dead) { const seen = this.detectRate(d, toP); this.aware = clamp(this.aware + (seen > 0 ? seen * dt : -0.2 * dt), 0, 1); if (this.aware >= 1) this.alertNow(); }
    if (this.aggro && (COMBAT.dead || home > 55 || d > T.sight * 2.5)) { this.aggro = false; this.aware = 0.4; this.state = 'idle'; }
    this.cool -= dt; this.timer -= dt;
    let move = 0, want = this.yaw, mdir = null;
    if (this.state === 'stagger') { if (this.timer <= 0) this.state = 'idle'; }
    else if (this.state === 'windup') { want = toP; if (this.timer <= 0) { this.state = 'recover'; this.timer = 0.55; this.strike(d, toP); } }
    else if (this.state === 'recover') { if (this.timer <= 0) this.state = 'idle'; }
    else if (this.aggro) {
      want = toP; const tok = hasToken(this);
      if (T.boss && (this.slamT -= dt) <= 0 && d < 9) { this.slamT = rr(6, 9); this.state = 'windup'; this.special = 'slam'; this.kind = 'red'; ch.windup = 0.95; this.timer = 0.95; ch.play('slam', 1.5); telegraph(this.pos, 5.5, 0.95); glint(this, 0xff2a1a, 0.95); sfx('warnRed'); }
      else if (tok && d < T.reach + 0.4 && this.cool <= 0) this.startStrike();
      else if (tok && d > T.reach * 0.8) move = T.speed;
      else if (!tok) {
        this.sideT -= dt; if (this.sideT < 0) { this.side *= -1; this.sideT = rr(2, 5); }
        const radial = d - this.ring; mdir = toP + (radial > 0.7 ? 0 : radial < -0.7 ? Math.PI : this.side * Math.PI / 2); move = Math.abs(radial) > 0.7 ? 2.4 : 1.2;
      }
    } else {
      if (home > 3) { want = Math.atan2(this.spawn.x - this.pos.x, this.spawn.z - this.pos.z); move = 1.4; }
      else if (this.timer < 0) { this.timer = rr(2, 5); this.yaw += rr(-1, 1); }
    }
    this.yaw += angDiff(this.yaw, want) * Math.min(1, dt * (this.state === 'windup' ? 3 : 7));
    if (move) { const a = mdir ?? this.yaw; this.pos.x += Math.sin(a) * move * dt; this.pos.z += Math.cos(a) * move * dt; ch.phase += move * dt / (1.6 * T.height / 1.9) * TAU; }
    for (const o of ENEMIES) { if (o === this || o.dead || !o.active) continue; const ox = this.pos.x - o.pos.x, oz = this.pos.z - o.pos.z, od = Math.hypot(ox, oz), m = this.radius + o.radius + 0.3; if (od < m && od > 0.01) { this.pos.x += ox / od * (m - od) * 0.5; this.pos.z += oz / od * (m - od) * 0.5; } }
    if (d < this.radius + 0.45 && d > 0.01) { this.pos.x -= dx / d * (this.radius + 0.45 - d); this.pos.z -= dz / d * (this.radius + 0.45 - d); }
    collideCircle(this.pos, this.radius, T.height);
    ch.setState(move > 2.5 ? 'run' : move > 0 ? 'walk' : 'idle'); ch.stance = lerp(ch.stance || 0, this.aggro ? 1 : 0, Math.min(1, dt * 4));
  }
  this.pos.y = groundAt(this.pos.x, this.pos.z, this.pos.y + 0.4);
  this.visY += (this.pos.y - this.visY) * Math.min(1, dt * 12);
  ch.root.position.set(this.pos.x, this.visY - (this.sink || 0) * 0.5, this.pos.z); ch.root.rotation.y = this.yaw;
  if (d < 70) ch.animate(dt);
};

// ---------- player: block, deflect, riposte, executions, guard break ----------
function blockStart() {
  if (!UI_STATE.started || COMBAT.dead || UI_STATE.dialog || UI_STATE.saga || UI_STATE.journal || player.mode === 'sit' || STANDOFF.on) return;
  if (player.mode !== 'stand') player.mode = 'stand';
  if (!COMBAT.drawn) sheathe(false); COMBAT.drawT = COMBAT.now;
  if (!COMBAT.block) { if (COMBAT.now - (COMBAT.lastBlockPress ?? -9) > 0.45) COMBAT.parryT = COMBAT.now; COMBAT.lastBlockPress = COMBAT.now; }
  COMBAT.block = true;
  if (COMBAT.atk && ATK[COMBAT.atk.name] && COMBAT.atk.name !== 'execute' && COMBAT.atk.name !== 'drawcut' && COMBAT.atk.t < ATK[COMBAT.atk.name].hit) { COMBAT.atk = null; COMBAT.queued = null; COMBAT.combo = 0; }
}
function blockEnd() { COMBAT.block = false; }
const facingFrom = (e) => Math.abs(angDiff(player.yaw, Math.atan2(e.pos.x - player.pos.x, e.pos.z - player.pos.z))) < 1.4;
function deflect(e) {
  const mid = player.pos.clone().lerp(e.pos, 0.5).add(_v.set(0, 1.45, 0)); sparks(mid, 34, [0.75, 0.9, 1]); sfx('deflect'); slowmo(0.45, 0.22); shake(0.2);
  floatText(mid, 'Deflect!', 'crit'); e.posture += e.maxPosture * (e.T.boss ? 0.3 : 0.5); e.lastHit = COMBAT.now;
  e.ch.action = null; e.state = 'stagger'; e.timer = e.T.boss ? 0.8 : 1.1; e.ch.play('hurt', 0.7); e.kind = 'n';
  const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z) || 1; e.kv.set((e.pos.x - player.pos.x) / d * 4, 0, (e.pos.z - player.pos.z) / d * 4);
  COMBAT.riposte = { e, until: COMBAT.now + 1.5 }; COMBAT.st = Math.min(COMBAT.maxSt, COMBAT.st + 15); player.ch.play('slash2', 0.35);
  if (e.posture >= e.maxPosture) e.breakGuard();
  QSTAT.deflects = (QSTAT.deflects || 0) + 1;
}
function guardBreakPlayer() { COMBAT.block = false; COMBAT.stunT = 0.9; player.ch.play('hurt', 0.9); floatText(player.pos.clone().add(_v.set(0, 2, 0)), 'Guard broken', 'hurt'); sfx('guardBreak'); shake(0.3); }
const _heroHurtDuel = heroHurt;
heroHurt = function (dmg, fx, fz) {
  const inc = COMBAT.incoming; COMBAT.incoming = null;
  if (COMBAT.dead) return;
  if (COMBAT.iframes > 0) { if (inc && COMBAT.dash && COMBAT.dash.t < 0.25 && !COMBAT.dash.perfect) { COMBAT.dash.perfect = true; slowmo(0.5, 0.25); floatText(player.pos.clone().add(_v.set(0, 2.1, 0)), 'Perfect dodge', 'xp'); COMBAT.riposte = { e: inc.e, until: COMBAT.now + 1.4 }; sfx('whoosh'); } return; }
  if (inc && COMBAT.block && inc.kind !== 'red' && facingFrom(inc.e)) {
    if (COMBAT.now - COMBAT.parryT < PARRY_WIN) { deflect(inc.e); return; }
    if (inc.kind === 'blue') { guardBreakPlayer(); return _heroHurtDuel(Math.round(dmg * 0.6), fx, fz); }
    COMBAT.st -= dmg * 1.5 + 6; COMBAT.lastSt = COMBAT.now; sparks(player.pos.clone().add(_v.set(Math.sin(player.yaw) * 0.5, 1.4, Math.cos(player.yaw) * 0.5)), 10); sfx('block'); shake(0.1);
    const d = Math.hypot(player.pos.x - fx, player.pos.z - fz) || 1; player.vel.x += (player.pos.x - fx) / d * 3; player.vel.z += (player.pos.z - fz) / d * 3;
    if (COMBAT.st <= 0) { COMBAT.st = 0; guardBreakPlayer(); }
    return;
  }
  _heroHurtDuel(dmg, fx, fz);
};
function brokenTarget() { let best = null, bd = 3.4; for (const e of ENEMIES) { if (e.dead || !e.active || e.state !== 'broken') continue; const d = e.pos.distanceTo(player.pos); if (d < bd) { bd = d; best = e; } } return best; }
function execute(e, why) {
  ensureDuel(e); if (!COMBAT.drawn) sheathe(false);
  const yaw = Math.atan2(e.pos.x - player.pos.x, e.pos.z - player.pos.z); player.yaw = COMBAT.faceYaw = yaw;
  COMBAT.atk = { name: 'execute', t: 0, hit: true }; COMBAT.queued = null; COMBAT.combo = 0; COMBAT.block = false; COMBAT.drawT = COMBAT.now;
  player.ch.play('execute', 1.25); e.state = 'executed'; e.ch.action = null; e.kv.set(0, 0, 0);
  COMBAT.execEv = { e, at: COMBAT.now + 0.55, why, dx: Math.sin(yaw), dz: Math.cos(yaw) };
  cine(yaw + Math.PI * 0.62 * (rand() < 0.5 ? 1 : -1), 3.1, 0.1, 1.5); sfx('swing');
}
function resolveExecution() {
  const ev = COMBAT.execEv; if (!ev || COMBAT.now < ev.at) return; COMBAT.execEv = null; const e = ev.e; if (e.dead) return;
  const p = e.pos.clone().add(_v.set(0, e.T.height * 0.7, 0)); bloodBurst(p, ev.dx, ev.dz, 30); sparks(p, 10, [1, 0.5, 0.3]); shake(0.5); hitstop(0.1); slowmo(0.4, 0.3); sfx('execute');
  if (e.T.boss && e.hp > e.maxHp * 0.35) { const dmg = Math.round(e.maxHp * 0.35); e.hp -= dmg; dmgNumber(p, dmg, 'crit'); e.state = 'stagger'; e.timer = 0.9; e.posture = 0; e.ch.play('hurt', 0.8); floatText(p, ev.why === 'riposte' ? 'Riposte' : 'Execution', 'crit'); }
  else { floatText(p, ev.why === 'riposte' ? 'Riposte' : ev.why === 'standoff' ? 'Standoff' : 'Execution', 'crit'); e.state = 'idle'; e.die(ev.dx, ev.dz); gainXP(12); QSTAT.executions = (QSTAT.executions || 0) + 1; }
}
const _attackDuel = attack;
attack = function (kind) {
  if (STANDOFF.on) { standoffStrike(); return; }
  if (COMBAT.stunT > 0 || MANTLE.on || COMBAT.dead || !UI_STATE.started || UI_STATE.dialog || UI_STATE.saga || UI_STATE.journal || UI_STATE.map) return;
  if (kind === 'light' && !COMBAT.dash && (!COMBAT.atk || COMBAT.atk.name !== 'execute')) {
    const r = COMBAT.riposte; if (r && COMBAT.now < r.until && !r.e.dead && r.e.pos.distanceTo(player.pos) < 4.2) { COMBAT.riposte = null; if (player.mode !== 'stand') player.mode = 'stand'; execute(r.e, 'riposte'); return; }
    const b = brokenTarget(); if (b) { if (player.mode !== 'stand') player.mode = 'stand'; execute(b, 'broken'); return; }
  }
  COMBAT.block = false; _attackDuel(kind);
};
const _combatMoveDuel = combatMove;
combatMove = function () {
  if (MANTLE.on || COMBAT.stunT > 0 || STANDOFF.on) return { x: 0, z: 0, speed: 0, lock: true };
  const o = _combatMoveDuel(); if (o) return o;
  if (COMBAT.block) return { mul: 0.42 };
  if (COMBAT.lock && COMBAT.drawn) return { mul: 0.8 };
  return null;
};

// ---------- lock-on and cinematic camera ----------
function nextLockTarget(not) { let best = null, bd = 18; for (const e of ENEMIES) { if (e === not || e.dead || !e.active || !e.aggro) continue; const d = e.pos.distanceTo(player.pos); if (d < bd) { bd = d; best = e; } } return best; }
function toggleLock() {
  if (!UI_STATE.started) return;
  if (COMBAT.lock) { COMBAT.lock = null; return; }
  let best = null, bs = 1e9; const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
  for (const e of ENEMIES) { if (e.dead || !e.active) continue; const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z, d = Math.hypot(dx, dz); if (d > 22) continue; const s = d * (1.6 - (dx * fx + dz * fz) / (d || 1)); if (s < bs) { bs = s; best = e; } }
  COMBAT.lock = best; if (best) { sfx('choice'); if (!COMBAT.drawn) sheathe(false); COMBAT.drawT = COMBAT.now; }
}
const CINE = { t: 0, yaw: 0, dist: 3, pitch: 0.1, saved: null };
function cine(yaw, dist, pitch, t) { if (!CINE.saved) CINE.saved = { dist: cam.dist, pitch: cam.pitch }; Object.assign(CINE, { yaw, dist, pitch, t }); }
const _updateCameraDuel = updateCamera;
updateCamera = function (dt) {
  if (CINE.t > 0 || STANDOFF.on) {
    CINE.t -= dt; const k = Math.min(1, dt * 5); cam.yaw += angDiff(cam.yaw, CINE.yaw) * k; cam.dist = lerp(cam.dist, CINE.dist, k); cam.pitch = lerp(cam.pitch, CINE.pitch, k);
  } else if (CINE.saved) { cam.dist = CINE.saved.dist; cam.pitch = CINE.saved.pitch; CINE.saved = null; }
  else if (COMBAT.lock && !COMBAT.lock.dead) {
    const t = COMBAT.lock, ty = Math.atan2(player.pos.x - t.pos.x, player.pos.z - t.pos.z) + 0.28; cam.yaw += angDiff(cam.yaw, ty) * Math.min(1, dt * 5); cam.pitch = lerp(cam.pitch, 0.22, Math.min(1, dt * 3));
  }
  _updateCameraDuel(dt);
};

// ---------- traversal: mantle ledges, landing rolls, fall damage, lean ----------
const MANTLE = { on: false, t: 0, dur: 0.6, from: new THREE.Vector3(), to: new THREE.Vector3() };
function tryMantle(maxRise = 2.9) {
  if (MANTLE.on || COMBAT.dead || COMBAT.atk || COMBAT.dash || player.mode !== 'stand' || player.air > 1.2 || UI_STATE.dialog || STANDOFF.on) return false;
  const p = player.pos, fx = Math.sin(player.yaw), fz = Math.cos(player.yaw), feet = p.y;
  let wall = false; for (const r of [0.45, 0.75, 1.0]) if (pointBlocked(p.x + fx * r, feet + 0.7, p.z + fz * r) || pointBlocked(p.x + fx * r, feet + 1.3, p.z + fz * r)) wall = true;
  if (!wall) return false;
  for (const r of [0.8, 1.05, 1.35, 1.6]) {
    const ax = p.x + fx * r, az = p.z + fz * r, top = groundAt(ax, az, feet + maxRise), rise = top - feet;
    if (rise > 0.55 && rise < maxRise && !pointBlocked(ax, top + 0.9, az) && !pointBlocked(ax, top + 1.6, az)) {
      Object.assign(MANTLE, { on: true, t: 0, dur: 0.42 + rise * 0.14 }); MANTLE.from.copy(p); MANTLE.to.set(ax + fx * 0.15, top, az + fz * 0.15);
      player.vel.set(0, 0, 0); player.vy = 0; player.ch.play('mantle', MANTLE.dur + 0.15); sfx('grab'); return true;
    }
  }
  return false;
}
function mantleStep(dt) {
  const ch = player.ch; MANTLE.t += dt; const k = Math.min(1, MANTLE.t / MANTLE.dur), up = smooth(0, 0.65, k), fw = smooth(0.4, 1, k);
  player.pos.set(lerp(MANTLE.from.x, MANTLE.to.x, fw), lerp(MANTLE.from.y, MANTLE.to.y + 0.05, up), lerp(MANTLE.from.z, MANTLE.to.z, fw));
  player.visY = player.pos.y; player.vy = 0; player.vel.set(0, 0, 0);
  if (k >= 1) { MANTLE.on = false; player.onGround = true; player.air = 0; player.pos.y = groundAt(player.pos.x, player.pos.z, player.pos.y + 0.5); sfx('land'); }
  ch.setState('idle'); ch.root.position.set(player.pos.x, player.visY, player.pos.z); ch.root.rotation.y = player.yaw; ch.animate(dt);
}
const _updatePlayerDuel = updatePlayer;
updatePlayer = function (dt) {
  if (MANTLE.on) { mantleStep(dt); return; }
  if (COMBAT.stunT > 0) COMBAT.stunT -= dt;
  const vyB = player.vy, wasG = player.onGround, yaw0 = player.yaw;
  const fwdHeld = KEYS.KeyW || KEYS.ArrowUp || (TOUCHIN.mag > 0.4 && TOUCHIN.y < -0.3);
  if (fwdHeld && !COMBAT.atk && !COMBAT.dash) {
    if (!player.onGround && player.air < 1.0 && (MANTLE.probe = (MANTLE.probe || 0) + dt) > 0.05) { MANTLE.probe = 0; if (tryMantle()) return; }
    else if (player.onGround && Math.hypot(player.vel.x, player.vel.z) > 5 && (KEYS.ShiftLeft || KEYS.ShiftRight || TOUCHIN.run) && tryMantle(1.35)) return;
  }
  _updatePlayerDuel(dt);
  const ch = player.ch, hs = Math.hypot(player.vel.x, player.vel.z);
  if (!wasG && player.onGround && !COMBAT.dead) {
    const impact = -vyB;
    if (impact > 13.5) {
      if (hs > 2.5 && impact < 25) { ch.play('roll', 0.5); sfx('dodge'); }
      else { const dmg = Math.round((impact - 13.5) * 6); if (dmg > 0) { heroHurt(dmg, player.pos.x + 0.01, player.pos.z); floatText(player.pos.clone().add(_v.set(0, 2.2, 0)), 'Hard landing', 'hurt'); } }
    }
  }
  const yr = angDiff(yaw0, player.yaw) / Math.max(dt, 1e-3);
  ch.lean = lerp(ch.lean || 0, clamp(-yr * 0.035 * hs / 7, -0.28, 0.28), Math.min(1, dt * 8));
  ch.fwd = lerp(ch.fwd || 0, clamp((hs - 3) / 5, 0, 1) * 0.16, Math.min(1, dt * 6));
  const L = COMBAT.lock;
  if (L && !L.dead && !COMBAT.dash && !COMBAT.atk && COMBAT.drawn) { player.yaw += angDiff(player.yaw, Math.atan2(L.pos.x - player.pos.x, L.pos.z - player.pos.z)) * Math.min(1, dt * 10); ch.root.rotation.y = player.yaw; }
  if (STANDOFF.on && STANDOFF.e) { player.yaw = Math.atan2(STANDOFF.e.pos.x - player.pos.x, STANDOFF.e.pos.z - player.pos.z); ch.root.rotation.y = player.yaw; }
  ch.stance = lerp(ch.stance || 0, COMBAT.drawn && (COMBAT.inFight || STANDOFF.on) ? 1 : 0, Math.min(1, dt * 5));
  ch.blockW = lerp(ch.blockW || 0, COMBAT.block ? 1 : 0, Math.min(1, dt * 16));
};

// ---------- standoff ----------
const STANDOFF = { on: false, phase: '', t: 0, e: null, kills: 0, group: [], cool: 0, delay: 0, feintAt: -1, feinted: false, chargeT: 0, pause: 0 };
function standoffCandidates() { return ENEMIES.filter((e) => e.active && !e.dead && !e.T.boss && e.state !== 'broken' && e.state !== 'executed' && e.pos.distanceTo(player.pos) < 20 && Math.abs(e.pos.y - player.pos.y) < 3.5); }
function standoffAvailable() {
  if (STANDOFF.on || STANDOFF.cool > 0 || COMBAT.dead || UI_STATE.dialog || player.mode !== 'stand' || COMBAT.atk || MANTLE.on) return false;
  if (COMBAT.now - COMBAT.lastHurt < 4) return false;
  const c = standoffCandidates(); if (!c.length) return false;
  return !c.some((e) => e.pos.distanceTo(player.pos) < 5 || e.state === 'windup' || e.state === 'recover');
}
function startStandoff() {
  if (!standoffAvailable()) return;
  STANDOFF.on = true; STANDOFF.kills = 0; STANDOFF.group = standoffCandidates(); COMBAT.lock = null; COMBAT.block = false;
  for (const e of STANDOFF.group) { e.held = true; e.aggro = true; e.aware = 1; e.state = 'idle'; e.ch.action = null; e.charge = false; }
  sheathe(true); document.body.classList.add('letterbox'); sfx('standoff'); toast('Standoff. Wait for them to strike, then attack. Not a moment sooner.');
  nextStandoff(1.6, 3.4);
}
function nextStandoff(a, b) {
  const alive = STANDOFF.group.filter((e) => !e.dead); if (!alive.length || STANDOFF.kills >= 3) { endStandoff(true); return; }
  alive.sort((x, y) => x.pos.distanceToSquared(player.pos) - y.pos.distanceToSquared(player.pos));
  const e = (STANDOFF.e = alive[0]);
  Object.assign(STANDOFF, { phase: 'wait', t: 0, delay: rr(a, b), feinted: false, chargeT: 0 }); STANDOFF.feintAt = rand() < 0.45 ? STANDOFF.delay * rr(0.35, 0.7) : -1;
  const ang = Math.atan2(e.pos.x - player.pos.x, e.pos.z - player.pos.z); cine(ang + Math.PI + 1.0, 4.6, 0.08, 99);
  $('standHint').hidden = false; $('standHint').textContent = 'Wait…';
}
function standoffStrike() {
  const S = STANDOFF; if (S.phase === 'wait') { standoffFail('Too soon. He saw you flinch.'); return; }
  if (S.phase !== 'charge') return;
  const e = S.e; e.charge = false; S.kills++; S.phase = 'pause'; S.pause = 1.1;
  sheathe(false); COMBAT.atk = { name: 'drawcut', t: 0, hit: true }; COMBAT.faceYaw = player.yaw; player.ch.play('drawcut', 0.75); sfx('swing');
  const dx = Math.sin(player.yaw), dz = Math.cos(player.yaw); e.held = false; e.state = 'idle';
  setTimeout(() => { sfx('execute'); }, 80);
  const p = e.pos.clone().add(_v.set(0, e.T.height * 0.65, 0)); bloodBurst(p, dx, dz, 30); slowmo(0.7, 0.2); shake(0.4); floatText(p, S.kills > 1 ? `Standoff ×${S.kills}` : 'Standoff', 'crit');
  e.die(dx, dz); gainXP(15); QSTAT.standoffs = (QSTAT.standoffs || 0) + 1;
  $('standHint').textContent = S.kills >= 3 ? 'Three in a row.' : 'Next…';
}
function standoffFail(msg) {
  const S = STANDOFF, e = S.e; toast(msg); if (e && !e.dead) { e.charge = false; e.held = false; e.state = 'idle'; e.ch.play('eStrike', 0.6); }
  COMBAT.incoming = null; heroHurt(28, e ? e.pos.x : player.pos.x, e ? e.pos.z : player.pos.z); endStandoff(false);
}
function endStandoff() {
  const S = STANDOFF; for (const e of S.group) { e.held = false; e.charge = false; if (!e.dead) { e.aggro = true; e.state = 'idle'; e.cool = rr(0.6, 1.4); } }
  S.on = false; S.e = null; S.cool = 8; CINE.t = 0; document.body.classList.remove('letterbox'); $('standHint').hidden = true; if (!COMBAT.drawn) sheathe(false);
}
function updateStandoff(dt) {
  const S = STANDOFF; if (S.cool > 0 && !S.on) S.cool -= dt; if (!S.on) return;
  if (COMBAT.dead) { endStandoff(false); return; }
  S.t += dt; const e = S.e;
  if (S.phase === 'pause') { S.pause -= dt; if (S.pause <= 0) nextStandoff(0.8, 1.8); return; }
  if (!e || e.dead) { nextStandoff(0.8, 1.6); return; }
  if (S.phase === 'wait') {
    if (S.feintAt > 0 && !S.feinted && S.t > S.feintAt) { S.feinted = true; e.ch.play('eStrike', 0.3); sfx('feint'); glint(e, 0xffffff, 0.25); }
    if (S.t >= S.delay) { S.phase = 'charge'; S.chargeT = 0; e.charge = true; glint(e, 0xff2a1a, 0.4); sfx('warnRed'); $('standHint').textContent = 'NOW!'; }
  } else if (S.phase === 'charge') {
    S.chargeT += dt; const d = Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z);
    if (d < 1.6 || S.chargeT > 0.95) standoffFail('Too slow.');
  }
}

// ---------- Raven Sight ----------
const RAVEN = { t: 0, cool: 0, k: 0 };
function ravenSight() {
  if (!flag('RAVEN_SIGHT')) { toast('You have not learned Raven Sight. Ulfhild might teach you.'); return; }
  if (RAVEN.cool > 0 || !UI_STATE.started) return; RAVEN.t = 6; RAVEN.cool = 14; sfx('raven');
}

// ---------- colour grade (split toning, contrast, vignette, grain, Raven Sight) ----------
const GRADE = { pass: null };
function makeGradePass() {
  GRADE.pass = new ShaderPass({ uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uRaven: { value: 0 }, uVig: { value: 1.15 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime, uRaven, uVig; varying vec2 vUv;
      float hh(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){ vec3 c = texture2D(tDiffuse, vUv).rgb; float l = dot(c, vec3(0.299, 0.587, 0.114));
        c += mix(vec3(-0.012, 0.0, 0.03), vec3(0.035, 0.018, -0.02), smoothstep(0.2, 0.8, l));
        c = mix(c, c * c * (3.0 - 2.0 * c), 0.22); c = mix(vec3(l), c, 0.9);
        float chroma = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b));
        vec3 rs = vec3(l * 0.5) * vec3(0.72, 0.84, 1.15); c = mix(c, mix(rs, c * 1.35, smoothstep(0.22, 0.45, chroma)), uRaven);
        vec2 q = vUv - 0.5; c *= 1.0 - dot(q, q) * uVig * (1.0 + uRaven * 1.2);
        c += (hh(vUv * vec2(1931.0, 1087.0) + fract(uTime)) - 0.5) * 0.03;
        gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0); }` });
  return GRADE.pass;
}
const _setupComposerDuel = setupComposer;
setupComposer = function () { _setupComposerDuel(); composer.addPass(makeGradePass()); initPfx(); };

// ---------- per-frame update and HUD ----------
const QSTAT = {};
const _updateHeroCombatDuel = updateHeroCombat;
updateHeroCombat = function (dt) {
  _updateHeroCombatDuel(dt);
  resolveExecution(); updateStandoff(dt); updateGlints(dt); updatePfx(dt);
  if (COMBAT.block) COMBAT.lastSt = COMBAT.now;
  if (COMBAT.riposte && COMBAT.now > COMBAT.riposte.until) COMBAT.riposte = null;
  if (COMBAT.lock && (COMBAT.lock.dead || !COMBAT.lock.active || COMBAT.lock.pos.distanceTo(player.pos) > 30)) COMBAT.lock = nextLockTarget(COMBAT.lock);
  RAVEN.t = Math.max(0, RAVEN.t - dt); RAVEN.cool = Math.max(0, RAVEN.cool - dt); RAVEN.k = lerp(RAVEN.k, RAVEN.t > 0 ? 1 : 0, Math.min(1, dt * 4));
  if (GRADE.pass) { GRADE.pass.uniforms.uRaven.value = RAVEN.k; GRADE.pass.uniforms.uTime.value = COMBAT.now; }
  if (!HOLM.active) { const b = ENEMIES.find((e) => e.type === 'berserker' && e.aggro && !e.dead && e.active); COMBAT.boss = b || null; }
};
const _updateCombatHudDuel = updateCombatHud;
updateCombatHud = function (dt) {
  _updateCombatHudDuel(dt);
  for (const e of ENEMIES) {
    if (!e.bar.hidden) { let b = e.bar.querySelector('b'); if (!b) { b = document.createElement('b'); e.bar.appendChild(b); } b.style.width = `${clamp(e.posture / (e.maxPosture || 1), 0, 1) * 100}%`; }
    if (!e.active || e.dead) continue;
    const exec = e.state === 'broken' || (COMBAT.riposte && COMBAT.riposte.e === e), rs = RAVEN.t > 0 && e.pos.distanceTo(player.pos) < 90;
    if (exec || rs) {
      const s = project(_v.set(e.pos.x, e.visY + e.T.height + 0.75, e.pos.z)); if (!s.on) continue;
      e.mark.hidden = false; e.mark.textContent = exec ? '⚔' : '◆'; e.mark.classList.toggle('alert', !exec); e.mark.classList.toggle('exec', exec); e.mark.style.opacity = '1';
      e.mark.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%) scale(${exec ? 1.3 : 0.9})`;
    } else e.mark.classList.remove('exec');
  }
  const L = COMBAT.lock, lm = $('lockMark');
  if (L && !L.dead) { const s = project(_v.set(L.pos.x, L.visY + L.T.height * 0.6, L.pos.z)); lm.hidden = !s.on; lm.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%)`; } else lm.hidden = true;
  const sa = standoffAvailable(); $('standPrompt').hidden = !sa; if (IS_TOUCH) { $('tbStand').hidden = !(sa || STANDOFF.on); $('tbSight').hidden = !flag('RAVEN_SIGHT'); $('tbLock').setAttribute('aria-pressed', !!COMBAT.lock); }
  const rc = $('ravenCool'); if (rc) { rc.hidden = !flag('RAVEN_SIGHT'); rc.textContent = RAVEN.t > 0 ? 'Raven Sight' : RAVEN.cool > 0 ? `Raven Sight ${Math.ceil(RAVEN.cool)}s` : 'Raven Sight ready (R)'; rc.classList.toggle('on', RAVEN.t > 0); }
};

// ---------- input ----------
addEventListener('keydown', (e) => {
  if (!UI_STATE.started || e.repeat) return;
  if (e.code === 'Space') tryMantle();
  else if (e.code === 'KeyV') blockStart();
  else if (e.code === 'KeyT') toggleLock();
  else if (e.code === 'KeyZ') { if (STANDOFF.on) standoffStrike(); else startStandoff(); }
  else if (e.code === 'KeyR') ravenSight();
});
addEventListener('keyup', (e) => { if (e.code === 'KeyV') blockEnd(); });
(function touchDuel() {
  const hold = (id, down, up) => { const b = $(id); b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); down(); }); for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, (e) => { e.preventDefault(); if (up) up(); }); };
  hold('tbBlock', blockStart, blockEnd); hold('tbLock', toggleLock); hold('tbStand', () => { if (STANDOFF.on) standoffStrike(); else startStandoff(); }); hold('tbSight', ravenSight);
  $('tbJump').addEventListener('pointerdown', () => tryMantle());
})();

// ---------- duel sounds ----------
const _sfxDuel = sfx;
sfx = function (name) {
  if (!AUD.ctx) return;
  if (name === 'block') { tone(260, 0.15, 0.1, 'square', 0.7); noiseBurst(0.12, 0.25, 2800, 'highpass'); }
  else if (name === 'deflect') { tone(1400, 0.6, 0.08, 'triangle', 0.98); tone(2100, 0.45, 0.05, 'sine', 1, 0.02); noiseBurst(0.1, 0.32, 4200, 'highpass'); }
  else if (name === 'guardBreak') { tone(90, 0.5, 0.25, 'sawtooth', 0.5); noiseBurst(0.3, 0.3, 900); }
  else if (name === 'execute') { tone(70, 0.6, 0.3, 'sine', 0.5); noiseBurst(0.25, 0.35, 1500, 'bandpass'); }
  else if (name === 'warnRed') { tone(180, 0.35, 0.12, 'sawtooth', 1.6); tone(240, 0.3, 0.06, 'square', 1.5, 0.05); }
  else if (name === 'warnBlue') tone(880, 0.25, 0.07, 'triangle', 1.25);
  else if (name === 'whoosh') noiseBurst(0.3, 0.16, 1800, 'bandpass');
  else if (name === 'grab') noiseBurst(0.1, 0.14, 600);
  else if (name === 'standoff') { tone(110, 2.5, 0.08, 'sine', 1); noiseBurst(1.8, 0.08, 500); }
  else if (name === 'feint') noiseBurst(0.08, 0.16, 1600, 'bandpass');
  else if (name === 'raven') { tone(330, 1.2, 0.06, 'sine', 0.5); tone(660, 1.0, 0.03, 'triangle', 0.5, 0.1); noiseBurst(0.18, 0.14, 1100, 'bandpass'); setTimeout(() => noiseBurst(0.16, 0.12, 1200, 'bandpass'), 260); }
  else if (name === 'feather') { tone(988, 0.4, 0.05, 'triangle'); tone(1318, 0.5, 0.04, 'triangle', 1, 0.1); }
  else _sfxDuel(name);
};
