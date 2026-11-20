// ===== RPG combat: melee combos, heavy attack, dodge, enemies, XP and the Breach quest =====
const COMBAT = { hp: 120, maxHp: 120, st: 100, maxSt: 100, level: 1, xp: 0, atk: null, queued: null, combo: 0, dash: null, iframes: 0, lastHurt: -99, lastSt: -99, dead: false, deadT: 0, drawn: false, drawT: 0, inFight: false, sword: null, quest: { stage: 0, kills: 0, need: 12 }, now: 0 };
const ATK = {
  slash1: { dur: 0.5, hit: 0.2, range: 3.0, arc: 1.3, mult: 1.0, st: 9, lunge: 3.4 },
  slash2: { dur: 0.5, hit: 0.2, range: 3.0, arc: 1.3, mult: 1.15, st: 9, lunge: 3.4 },
  slash3: { dur: 0.75, hit: 0.36, range: 3.3, arc: 1.5, mult: 1.8, st: 13, lunge: 4.5 },
  heavy: { dur: 1.0, hit: 0.55, range: 3.7, arc: Math.PI, mult: 2.7, st: 26, lunge: 1.5 },
};
const xpNeed = (lv) => 100 + (lv - 1) * 70;

// ---------- extra animation poses on the shared rig ----------
const _basePose = Char.prototype.pose, _baseAction = Char.prototype.actionPose;
Char.prototype.pose = function (state, v) {
  _basePose.call(this, state, v);
  const g = this.guard || 0;
  if (g > 0.01 && state !== 'sit' && state !== 'lie') { v[C.sRX] = lerp(v[C.sRX], -0.55, g); v[C.eRX] = lerp(v[C.eRX], -1.05, g); v[C.sRZ] = lerp(v[C.sRZ], -0.2, g); v[C.sLX] = lerp(v[C.sLX], -0.25, g); v[C.eLX] = lerp(v[C.eLX], -0.5, g); }
};
Char.prototype.actionPose = function (name, t, v) {
  const P = COMBAT_POSES[name]; if (P) P(t, v, this); else _baseAction.call(this, name, t, v);
};
const COMBAT_POSES = {
  slash1(t, v) { const k = t / ATK.slash1.dur, e = smooth(0.18, 0.5, k); v[C.sRX] = -1.35; v[C.sRZ] = lerp(-1.75, 0.55, e); v[C.eRX] = lerp(-1.0, -0.15, e); v[C.chYaw] = lerp(-0.85, 0.75, e); v[C.hipYaw] = lerp(-0.25, 0.25, e); v[C.spX] = 0.15; v[C.sLX] = -0.4; v[C.sLZ] = 0.5; v[C.tLX] = -0.45; v[C.kLX] = 0.45; v[C.tRX] = 0.35; v[C.kRX] = 0.2; v[C.hipY] = 0.86; },
  slash2(t, v) { const k = t / ATK.slash2.dur, e = smooth(0.18, 0.5, k); v[C.sRX] = -1.25; v[C.sRZ] = lerp(0.6, -1.7, e); v[C.eRX] = lerp(-1.6, -0.2, e); v[C.chYaw] = lerp(0.8, -0.8, e); v[C.hipYaw] = lerp(0.25, -0.25, e); v[C.spX] = 0.2; v[C.sLX] = -0.3; v[C.sLZ] = 0.6; v[C.tRX] = -0.45; v[C.kRX] = 0.45; v[C.tLX] = 0.35; v[C.hipY] = 0.86; },
  slash3(t, v) { const k = t / ATK.slash3.dur, up = smooth(0, 0.3, k), dn = smooth(0.3, 0.5, k); v[C.sRX] = lerp(-0.6, -2.95, up) + dn * 2.4; v[C.eRX] = lerp(-0.3, -1.0, up) + dn * 0.85; v[C.sRZ] = -0.1; v[C.sLX] = v[C.sRX] * 0.9; v[C.sLZ] = 0.2; v[C.eLX] = v[C.eRX]; v[C.spX] = lerp(-0.12, 0, up) + dn * 0.55; v[C.chX] = dn * 0.2; v[C.hipY] = 0.92 - dn * 0.18; v[C.tLX] = -0.6 * dn; v[C.kLX] = 0.7 * dn; v[C.tRX] = 0.4 * dn; v[C.kRX] = 0.6 * dn; },
  heavy(t, v) { const k = t / ATK.heavy.dur, w = smooth(0, 0.35, k), sp = smooth(0.35, 0.75, k); v[C.hipY] = 0.82; v[C.tLX] = -0.5; v[C.kLX] = 0.7; v[C.tRX] = 0.4; v[C.kRX] = 0.5; v[C.sRX] = -1.45; v[C.sRZ] = lerp(-0.4, -1.5, w); v[C.eRX] = -0.2; v[C.sLX] = -1.2; v[C.sLZ] = 0.4; v[C.chYaw] = -0.9 * w; v[C.hipYaw] = -0.4 * w + sp * TAU; v[C.spX] = 0.25; },
  dodge(t, v) { const k = t / 0.42; v[C.hipY] = 0.55 + 0.25 * smooth(0.6, 1, k); v[C.spX] = 0.75; v[C.tLX] = v[C.tRX] = -1.3; v[C.kLX] = v[C.kRX] = 1.9; v[C.sLX] = v[C.sRX] = 0.6; v[C.eLX] = v[C.eRX] = -1.2; v[C.nkX] = 0.3; },
  hurt(t, v) { const k = Math.sin(clamp(t / 0.4, 0, 1) * Math.PI); v[C.spX] -= 0.35 * k; v[C.nkX] -= 0.3 * k; v[C.sLZ] += 0.5 * k; v[C.sRZ] -= 0.5 * k; v[C.hipY] -= 0.05 * k; },
  eStrike(t, v, ch) { const wind = ch.windup || 0.55, up = smooth(0, wind, t), dn = smooth(wind, wind + 0.15, t); v[C.sRX] = lerp(-0.3, -2.7, up) + dn * 2.5; v[C.eRX] = lerp(-0.2, -1.1, up) + dn * 1.0; v[C.sRZ] = -0.15; v[C.spX] = -0.15 * up + 0.5 * dn; v[C.tLX] = -0.5 * dn; v[C.kLX] = 0.6 * dn; v[C.sLX] = -0.5; },
  slam(t, v, ch) { const wind = ch.windup || 0.9, up = smooth(0, wind, t), dn = smooth(wind, wind + 0.12, t); v[C.sRX] = v[C.sLX] = lerp(-0.2, -3.0, up) + dn * 2.9; v[C.eRX] = v[C.eLX] = -0.3; v[C.sRZ] = -0.2; v[C.sLZ] = 0.2; v[C.spX] = -0.2 * up + 0.8 * dn; v[C.hipY] = 0.92 - 0.3 * dn; v[C.tLX] = v[C.tRX] = -0.9 * dn; v[C.kLX] = v[C.kRX] = 1.3 * dn; },
};

// ---------- player side ----------
const TRAIL = { n: 14, tip: [], base: [], mesh: null, on: 0 };
function setupHeroCombat() {
  const sw = (COMBAT.sword = makeSword());
  sheathe(true);
  const g = new THREE.BufferGeometry(), N = TRAIL.n;
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3)); g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(N * 2 * 3), 3));
  const idx = []; for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } g.setIndex(idx);
  TRAIL.mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false }));
  TRAIL.mesh.frustumCulled = false; scene.add(TRAIL.mesh);
  for (let i = 0; i < N; i++) { TRAIL.tip.push(new THREE.Vector3()); TRAIL.base.push(new THREE.Vector3()); }
  void sw;
}
function sheathe(on) {
  const sw = COMBAT.sword, J = player.ch.J; COMBAT.drawn = !on;
  if (on) { J.chest.add(sw); sw.position.set(-0.14, 0.32, -0.19); sw.rotation.set(0.12, 0, Math.PI + 0.55); }
  else { J.faR.add(sw); sw.position.set(0, -0.275, 0.02); sw.rotation.set(Math.PI / 2, 0, 0); }
}
function nearestEnemy(maxD, cone) {
  const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw); let best = null, bd = maxD;
  for (const e of ENEMIES) { if (e.dead || !e.active) continue; const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z, d = Math.hypot(dx, dz); if (d > bd) continue; if (cone && (dx * fx + dz * fz) / (d || 1) < Math.cos(cone)) continue; bd = d; best = e; }
  return best;
}
function attack(kind) {
  if (COMBAT.dead || !UI_STATE.started || UI_STATE.map || player.mode === 'sit') return;
  if (UI_STATE.dialog) return;
  if (player.mode !== 'stand') player.mode = 'stand';
  if (COMBAT.atk || COMBAT.dash) { const a = COMBAT.atk; if (a && kind === 'light' && a.t > ATK[a.name].dur * 0.4 && a.name !== 'heavy') COMBAT.queued = 'light'; return; }
  startAttack(kind === 'heavy' ? 'heavy' : COMBAT.combo === 1 ? 'slash2' : COMBAT.combo === 2 ? 'slash3' : 'slash1');
}
function startAttack(name) {
  const A = ATK[name]; if (COMBAT.st < A.st * 0.6) { toast('Too tired. Wait for stamina to recover.'); return; }
  COMBAT.st = Math.max(0, COMBAT.st - A.st); COMBAT.lastSt = COMBAT.now;
  if (!COMBAT.drawn) sheathe(false);
  COMBAT.drawT = COMBAT.now;
  COMBAT.atk = { name, t: 0, hit: false }; COMBAT.combo = name === 'slash1' ? 1 : name === 'slash2' ? 2 : 0;
  const tgt = nearestEnemy(7, 1.3);
  COMBAT.faceYaw = tgt ? Math.atan2(tgt.pos.x - player.pos.x, tgt.pos.z - player.pos.z) : cam.yaw + Math.PI;
  player.ch.play(name, A.dur); setTimeout(() => sfx('swing'), A.hit * 800);
}
function dodge() {
  if (COMBAT.dead || COMBAT.dash || !UI_STATE.started || COMBAT.st < 15) return;
  COMBAT.st -= 18; COMBAT.lastSt = COMBAT.now; COMBAT.atk = null; COMBAT.queued = null; COMBAT.combo = 0;
  const f = (KEYS.KeyW ? 1 : 0) - (KEYS.KeyS ? 1 : 0) + (TOUCHIN.mag > 0.2 ? -TOUCHIN.y : 0), r = (KEYS.KeyD ? 1 : 0) - (KEYS.KeyA ? 1 : 0) + (TOUCHIN.mag > 0.2 ? TOUCHIN.x : 0);
  const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw); let dx = fx * f - fz * r, dz = fz * f + fx * r;
  if (Math.hypot(dx, dz) < 0.1) { dx = -Math.sin(player.yaw); dz = -Math.cos(player.yaw); } const l = Math.hypot(dx, dz);
  COMBAT.dash = { x: dx / l, z: dz / l, t: 0 }; COMBAT.iframes = 0.38; player.yaw = Math.atan2(dx, dz); player.ch.play('dodge', 0.42); sfx('dodge');
}
// called from updatePlayer: overrides movement while attacking, dodging or dead
function combatMove() {
  if (COMBAT.dead) return { x: 0, z: 0, speed: 0, lock: true };
  if (COMBAT.dash) { const k = COMBAT.dash.t / 0.42; return { x: COMBAT.dash.x, z: COMBAT.dash.z, speed: 12 * (1 - k * 0.7), lock: true }; }
  if (COMBAT.atk) { const A = ATK[COMBAT.atk.name], k = COMBAT.atk.t / A.dur, lunge = k > 0.1 && k < 0.45 ? A.lunge : 0; return { x: Math.sin(COMBAT.faceYaw), z: Math.cos(COMBAT.faceYaw), speed: lunge, lock: true }; }
  return null;
}
function updateHeroCombat(dt) {
  COMBAT.now += dt; const ch = player.ch;
  if (COMBAT.atk) {
    const a = COMBAT.atk, A = ATK[a.name]; a.t += dt;
    player.yaw += angDiff(player.yaw, COMBAT.faceYaw) * Math.min(1, dt * 18);
    if (!a.hit && a.t >= A.hit) { a.hit = true; resolveHit(A, a.name); }
    if (a.t >= A.dur) { COMBAT.atk = null; if (COMBAT.queued) { COMBAT.queued = null; startAttack(COMBAT.combo === 1 ? 'slash2' : COMBAT.combo === 2 ? 'slash3' : 'slash1'); } else COMBAT.combo = 0; }
  }
  if (COMBAT.dash) { COMBAT.dash.t += dt; if (COMBAT.dash.t > 0.42) COMBAT.dash = null; }
  COMBAT.iframes = Math.max(0, COMBAT.iframes - dt);
  // regen
  if (!COMBAT.atk && !COMBAT.dash && COMBAT.now - COMBAT.lastSt > 0.5) COMBAT.st = Math.min(COMBAT.maxSt, COMBAT.st + 30 * dt);
  if (!COMBAT.dead && COMBAT.now - COMBAT.lastHurt > 5) COMBAT.hp = Math.min(COMBAT.maxHp, COMBAT.hp + (player.mode === 'sit' ? 20 : 5) * dt);
  COMBAT.inFight = ENEMIES.some((e) => e.aggro && !e.dead);
  if (COMBAT.drawn && !COMBAT.atk && !COMBAT.inFight && COMBAT.now - COMBAT.drawT > 6) sheathe(true);
  if (COMBAT.inFight || COMBAT.atk) COMBAT.drawT = Math.max(COMBAT.drawT, COMBAT.now - 1);
  ch.guard = lerp(ch.guard || 0, COMBAT.drawn && !COMBAT.atk && player.mode === 'stand' ? 1 : 0, Math.min(1, dt * 8));
  // death & respawn
  if (COMBAT.dead) { COMBAT.deadT += dt; ch.setState('lie'); if (COMBAT.deadT > 3.5) respawn(); }
  updateTrail(dt);
}
function resolveHit(A, name) {
  const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw); let hits = 0;
  for (const e of ENEMIES) {
    if (e.dead || !e.active) continue;
    const dx = e.pos.x - player.pos.x, dz = e.pos.z - player.pos.z, d = Math.hypot(dx, dz), reach = A.range + e.radius;
    if (d > reach || Math.abs(e.pos.y - player.pos.y) > 2.5) continue;
    if (A.arc < Math.PI && Math.acos(clamp((dx * fx + dz * fz) / (d || 1), -1, 1)) > A.arc) continue;
    const crit = rand() < 0.12, dmg = Math.round((14 + 5 * (COMBAT.level - 1)) * A.mult * rr(0.9, 1.1) * (crit ? 1.6 : 1));
    e.hurt(dmg, dx / (d || 1), dz / (d || 1), name === 'heavy' ? 1.6 : 0.6, crit, name === 'heavy' || name === 'slash3'); hits++;
  }
  if (hits) { sfx('hit'); shake(name === 'heavy' ? 0.35 : 0.18); hitstop(name === 'heavy' ? 0.09 : 0.05); }
}
function heroHurt(dmg, fromX, fromZ) {
  if (COMBAT.dead || COMBAT.iframes > 0) return;
  COMBAT.hp -= dmg; COMBAT.lastHurt = COMBAT.now; COMBAT.atk = null; COMBAT.queued = null; COMBAT.combo = 0;
  dmgNumber(player.pos.clone().add(_v.set(0, 2, 0)), dmg, 'hurt');
  player.ch.play('hurt', 0.4); sfx('hurt'); shake(0.3); $('vignette').classList.remove('hit'); void $('vignette').offsetWidth; $('vignette').classList.add('hit');
  const d = Math.hypot(player.pos.x - fromX, player.pos.z - fromZ) || 1; player.pos.x += (player.pos.x - fromX) / d * 0.5; player.pos.z += (player.pos.z - fromZ) / d * 0.5;
  if (COMBAT.hp <= 0) { COMBAT.hp = 0; COMBAT.dead = true; COMBAT.deadT = 0; player.mode = 'stand'; $('death').hidden = false; sfx('die'); for (const e of ENEMIES) e.aggro = false; }
}
function respawn() {
  COMBAT.dead = false; COMBAT.hp = COMBAT.maxHp; COMBAT.st = COMBAT.maxSt; $('death').hidden = true;
  window.__game.teleport(0, 24); player.yaw = Math.PI; toast('You wake at the Rotunda, fully healed.');
}
function gainXP(n) {
  COMBAT.xp += n; floatText(player.pos.clone().add(_v.set(0, 2.4, 0)), `+${n} XP`, 'xp');
  while (COMBAT.xp >= xpNeed(COMBAT.level)) { COMBAT.xp -= xpNeed(COMBAT.level); COMBAT.level++; COMBAT.maxHp += 18; COMBAT.hp = COMBAT.maxHp; COMBAT.maxSt += 6; toast(`Level ${COMBAT.level}! Health and strength increased.`); sfx('levelup'); }
}
// sword trail
const _tw = new THREE.Vector3(), _bw = new THREE.Vector3();
function updateTrail() {
  const sw = COMBAT.sword; if (!sw) return; TRAIL.on = lerp(TRAIL.on, COMBAT.atk ? 1 : 0, 0.35);
  sw.updateMatrixWorld(true); _tw.copy(sw.userData.tip).applyMatrix4(sw.matrixWorld); _bw.copy(sw.userData.base).applyMatrix4(sw.matrixWorld);
  TRAIL.tip.pop(); TRAIL.base.pop(); TRAIL.tip.unshift(_tw.clone()); TRAIL.base.unshift(_bw.clone());
  const P = TRAIL.mesh.geometry.attributes.position, Cc = TRAIL.mesh.geometry.attributes.color;
  for (let i = 0; i < TRAIL.n; i++) { P.setXYZ(i * 2, TRAIL.tip[i].x, TRAIL.tip[i].y, TRAIL.tip[i].z); P.setXYZ(i * 2 + 1, TRAIL.base[i].x, TRAIL.base[i].y, TRAIL.base[i].z); const a = (1 - i / TRAIL.n) * TRAIL.on; Cc.setXYZ(i * 2, 0.45 * a, 0.95 * a, 1.0 * a); Cc.setXYZ(i * 2 + 1, 0.05 * a, 0.2 * a, 0.3 * a); }
  P.needsUpdate = true; Cc.needsUpdate = true; TRAIL.mesh.visible = TRAIL.on > 0.02;
}
// feel: screen shake and hitstop
const FEEL = { shake: 0, stop: 0 };
function shake(a) { FEEL.shake = Math.max(FEEL.shake, a); }
function hitstop(t) { FEEL.stop = Math.max(FEEL.stop, t); }

// ---------- enemies ----------
const ENEMIES = [];
const ETYPES = {
  sentinel: { name: 'Sentinel', height: 1.9, hp: 60, dmg: 10, speed: 3.6, reach: 2.0, windup: 0.55, xp: 30, radius: 0.4, aggro: 15, look: { top: 0x3a3f47, sleeve: 0x2a2e34, pants: 0x2a2e34, trim: 0xd02838 } },
  brute: { name: 'Sentinel Brute', height: 2.5, hp: 190, dmg: 19, speed: 2.7, reach: 2.6, windup: 0.75, xp: 75, radius: 0.6, aggro: 16, look: { top: 0x4a3a2a, sleeve: 0x3a3f47, pants: 0x2a2e34, trim: 0xff8a1a } },
  boss: { name: 'Sentinel Prime', height: 3.3, hp: 1100, dmg: 24, speed: 3.0, reach: 3.2, windup: 0.7, xp: 450, radius: 0.9, aggro: 30, boss: true, look: { top: 0x1c1d22, sleeve: 0x8a6a2a, pants: 0x1c1d22, trim: 0xffc040 } },
};
class Enemy {
  constructor(type, spawn) {
    const T = (this.T = ETYPES[type]); this.type = type; this.spawn = spawn.clone(); this.pos = spawn.clone(); this.yaw = rand() * TAU; this.radius = T.radius;
    const L = T.look;
    this.ch = new Char({ name: T.name, height: T.height, skin: 0x8d939b, hair: null, eyes: 0xff2030, top: L.top, sleeve: L.sleeve, pants: L.pants, boots: 0x18191c, trim: L.trim, belt: 0x111214, cuffs: L.trim, gloves: 0x5a6068, spear: true,
      parts(BK, mk, pg, G) {
        BK.head.push(pg(G.box(0.2, 0.035, 0.03), 0xff2a3a, 0, 0.086, 0.106), pg(G.box(0.24, 0.24, 0.22), 0x5a6068, 0, 0.08, -0.01), pg(G.cone(0.03, 0.14, 4), L.trim, 0, 0.25, -0.02));
        BK.chest.push(pg(G.box(0.34, 0.26, 0.06), 0x6b7078, 0, 0.13, 0.1), pg(G.box(0.08, 0.08, 0.02), L.trim, 0, 0.14, 0.135));
        for (const s of [1, -1]) BK['ua' + (s > 0 ? 'L' : 'R')].push(pg(G.cone(0.08, 0.16, 6), 0x6b7078, s * 0.03, 0.06, 0, 0, 0, s * -0.4));
      } });
    this.mat = CHAR_MAT.clone(); this.mat.emissive = new THREE.Color(0, 0, 0); this.ch.mesh.material = this.mat; this.ch.windup = T.windup;
    scene.add(this.ch.root);
    this.maxHp = T.hp; this.hp = T.hp; this.state = 'idle'; this.timer = rr(1, 4); this.cool = 0; this.flash = 0; this.dead = false; this.active = true; this.aggro = false; this.visY = this.pos.y; this.slamT = 6;
    const bar = document.createElement('div'); bar.className = 'ebar'; bar.innerHTML = '<i></i>'; bar.hidden = true; $('ebars').appendChild(bar); this.bar = bar;
    ENEMIES.push(this);
  }
  hurt(dmg, dx, dz, push, crit, heavy) {
    if (this.dead) return;
    this.hp -= dmg; this.flash = 1; this.aggro = true; dmgNumber(this.pos.clone().add(_v.set(0, this.T.height + 0.2, 0)), dmg, crit ? 'crit' : 'dmg');
    this.pos.x += dx * push * (this.T.boss ? 0.2 : 1); this.pos.z += dz * push * (this.T.boss ? 0.2 : 1);
    if (!this.T.boss || heavy) { if (this.state === 'windup' && !this.T.boss) this.ch.action = null; if (!this.T.boss) { this.state = 'stagger'; this.timer = heavy ? 0.6 : 0.35; this.ch.play('hurt', 0.4); } }
    if (this.hp <= 0) this.die();
  }
  die() {
    this.dead = true; this.hp = 0; this.state = 'dead'; this.timer = 0; this.ch.action = null; this.bar.hidden = true; sfx('enemyDie');
    gainXP(this.T.xp); questKill(this);
  }
  revive() { this.dead = false; this.hp = this.maxHp; this.pos.copy(this.spawn); this.state = 'idle'; this.aggro = false; this.ch.root.visible = true; this.mat.opacity = 1; this.mat.transparent = false; this.sink = 0; }
  update(dt) {
    const ch = this.ch, T = this.T;
    if (!this.active) { ch.root.visible = false; this.bar.hidden = true; return; }
    const dx = player.pos.x - this.pos.x, dz = player.pos.z - this.pos.z, d = Math.hypot(dx, dz), toP = Math.atan2(dx, dz);
    ch.root.visible = d < 140 && !(this.dead && this.sink > 2.2);
    this.flash = Math.max(0, this.flash - dt * 6); this.mat.emissive.setRGB(this.flash, this.flash * 0.9, this.flash * 0.8);
    if (this.dead) {
      this.timer += dt; ch.setState('lie'); this.sink = this.timer > 1.5 ? this.timer - 1.5 : 0;
      if (this.timer > 30 && !T.boss && d > 25) this.revive();
    } else if (d > 140 && !this.aggro) { return; }
    else {
      const home = Math.hypot(this.pos.x - this.spawn.x, this.pos.z - this.spawn.z);
      if (!COMBAT.dead && d < T.aggro) this.aggro = true;
      if (this.aggro && (COMBAT.dead || home > 55 || d > T.aggro * 2.2)) { this.aggro = false; this.state = 'idle'; }
      this.cool -= dt; this.timer -= dt;
      let move = 0, want = this.yaw;
      if (this.state === 'stagger') { if (this.timer <= 0) this.state = 'idle'; }
      else if (this.state === 'windup') { want = toP; if (this.timer <= 0) { this.state = 'recover'; this.timer = 0.55; this.strike(d, toP); } }
      else if (this.state === 'recover') { if (this.timer <= 0) this.state = 'idle'; }
      else if (this.aggro) {
        want = toP;
        if (T.boss && (this.slamT -= dt) <= 0 && d < 9) { this.slamT = rr(6, 9); this.state = 'windup'; this.special = 'slam'; ch.windup = 0.95; this.timer = 0.95; ch.play('slam', 1.5); telegraph(this.pos, 5.5, 0.95); }
        else if (d < T.reach + 0.4 && this.cool <= 0) { this.state = 'windup'; this.special = null; ch.windup = T.windup; this.timer = T.windup; this.cool = rr(0.7, 1.5) + T.windup; ch.play('eStrike', T.windup + 0.45); }
        else if (d > T.reach * 0.8) move = T.speed;
      } else {
        if (home > 3) { want = Math.atan2(this.spawn.x - this.pos.x, this.spawn.z - this.pos.z); move = 1.4; }
        else if (this.timer < 0) { this.timer = rr(2, 5); this.yaw += rr(-1, 1); }
      }
      this.yaw += angDiff(this.yaw, want) * Math.min(1, dt * (this.state === 'windup' ? 3 : 7));
      if (move) { this.pos.x += Math.sin(this.yaw) * move * dt; this.pos.z += Math.cos(this.yaw) * move * dt; ch.phase += move * dt / (1.6 * T.height / 1.9) * TAU; }
      for (const o of ENEMIES) { if (o === this || o.dead) continue; const ox = this.pos.x - o.pos.x, oz = this.pos.z - o.pos.z, od = Math.hypot(ox, oz), m = this.radius + o.radius + 0.3; if (od < m && od > 0.01) { this.pos.x += ox / od * (m - od) * 0.5; this.pos.z += oz / od * (m - od) * 0.5; } }
      if (d < this.radius + 0.45 && d > 0.01) { this.pos.x -= dx / d * (this.radius + 0.45 - d); this.pos.z -= dz / d * (this.radius + 0.45 - d); }
      collideCircle(this.pos, this.radius, T.height);
      ch.setState(move > 2 ? 'run' : move > 0 ? 'walk' : 'idle');
    }
    this.pos.y = groundAt(this.pos.x, this.pos.z, this.pos.y + 0.4);
    this.visY += (this.pos.y - this.visY) * Math.min(1, dt * 12);
    ch.root.position.set(this.pos.x, this.visY - (this.sink || 0) * 0.5, this.pos.z); ch.root.rotation.y = this.yaw;
    if (d < 70) ch.animate(dt);
  }
  strike(d, toP) {
    const T = this.T;
    if (this.special === 'slam') { shake(0.45); sfx('slam'); if (d < 5.5) heroHurt(Math.round(T.dmg * 1.4), this.pos.x, this.pos.z); return; }
    sfx('eswing');
    if (d < T.reach + 0.9 && Math.abs(angDiff(this.yaw, toP)) < 1.2) heroHurt(Math.round(T.dmg * rr(0.9, 1.1)), this.pos.x, this.pos.z);
  }
}
const SPAWNS = [];
function spawnEnemies() {
  const put = (type, x, z) => { const e = new Enemy(type, new THREE.Vector3(x, PROM_Y, z)); SPAWNS.push(e); return e; };
  for (let i = 0; i < 9; i++) put('sentinel', rr(312, 372), rr(-32, 32));
  put('brute', 350, 18); put('brute', 335, -20);
  for (let i = 0; i < 5; i++) put('sentinel', rr(-385, -310), pick([1, -1]) * rr(18, 36));
  put('brute', -360, 26);
  // a few patrols at the ends of the promenades
  for (const [x, z] of [[275, 30], [270, -30], [-280, 28], [-285, -26]]) put('sentinel', x, z);
  const boss = put('boss', 372, 0); boss.active = false; COMBAT.boss = boss;
}
function questKill(e) {
  const q = COMBAT.quest;
  if (q.stage === 0 && e.type !== 'boss') { q.kills++; if (q.kills >= q.need) { q.stage = 1; COMBAT.boss.active = true; COMBAT.boss.revive(); toast('The portal flares. Sentinel Prime steps out of the Breach!'); sfx('boss'); } }
  else if (e.type === 'boss') { q.stage = 2; toast('Sentinel Prime is destroyed. The Gilded Circuit is safe!'); gainXP(200); }
  updateQuest();
}
function updateQuest() {
  const q = COMBAT.quest, el = $('questText');
  el.innerHTML = q.stage === 0 ? `Clear the Breach<br><span>Sentinels defeated: ${Math.min(q.kills, q.need)} / ${q.need}</span><span class="qhint">East plaza, past the canal's end. More at the west docks.</span>`
    : q.stage === 1 ? 'Defeat Sentinel Prime<br><span class="qhint">At the Breach portal in the east plaza</span>' : 'The Gilded Circuit is safe<br><span class="qhint">Free roam. Sentinels still rebuild at the docks.</span>';
}

// ---------- floating combat text, boss bar, telegraphs ----------
const FLOATS = [];
function floatText(pos, text, cls) { const el = document.createElement('div'); el.className = 'ftxt ' + cls; el.textContent = text; $('dmg').appendChild(el); FLOATS.push({ el, pos: pos.clone(), t: 0, dx: rr(-0.4, 0.4) }); }
function dmgNumber(pos, n, cls) { floatText(pos, cls === 'crit' ? `${n}!` : String(n), cls); }
const TELE = [];
function telegraph(pos, r, dur) { const m = new THREE.Mesh(new THREE.RingGeometry(r * 0.2, r, 48), new THREE.MeshBasicMaterial({ color: 0xff3040, transparent: true, opacity: 0.4, depthWrite: false, side: THREE.DoubleSide })); m.rotation.x = -Math.PI / 2; m.position.set(pos.x, PROM_Y + 0.05, pos.z); scene.add(m); TELE.push({ m, t: 0, dur }); }
const _sp = new THREE.Vector3();
function project(p) { _sp.copy(p).project(camera); return { x: (_sp.x * 0.5 + 0.5) * innerWidth, y: (-_sp.y * 0.5 + 0.5) * innerHeight, on: _sp.z < 1 && _sp.z > -1 }; }
function updateCombatHud(dt) {
  for (let i = FLOATS.length - 1; i >= 0; i--) { const f = FLOATS[i]; f.t += dt; f.pos.y += dt * 1.2; f.pos.x += f.dx * dt; const s = project(f.pos); f.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%) scale(${1 + Math.max(0, 0.3 - f.t)})`; f.el.style.opacity = s.on ? String(1 - smooth(0.6, 1.0, f.t)) : '0'; if (f.t > 1.0) { f.el.remove(); FLOATS.splice(i, 1); } }
  for (let i = TELE.length - 1; i >= 0; i--) { const t = TELE[i]; t.t += dt; t.m.material.opacity = 0.25 + 0.35 * (t.t / t.dur); if (t.t > t.dur + 0.15) { scene.remove(t.m); TELE.splice(i, 1); } }
  for (const e of ENEMIES) {
    if (e.T.boss || e.dead || !e.active || !(e.aggro || e.hp < e.maxHp)) { e.bar.hidden = true; continue; }
    const s = project(_v.set(e.pos.x, e.visY + e.T.height + 0.35, e.pos.z)); const d = e.pos.distanceTo(player.pos);
    if (!s.on || d > 35) { e.bar.hidden = true; continue; }
    e.bar.hidden = false; e.bar.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%)`; e.bar.firstChild.style.width = `${(e.hp / e.maxHp) * 100}%`;
  }
  const b = COMBAT.boss, showBoss = b && b.active && !b.dead && b.aggro;
  $('bossBar').hidden = !showBoss; if (showBoss) $('bossFill').style.width = `${(b.hp / b.maxHp) * 100}%`;
  $('hpFill').style.width = `${(COMBAT.hp / COMBAT.maxHp) * 100}%`; $('hpText').textContent = `${Math.ceil(COMBAT.hp)} / ${COMBAT.maxHp}`;
  $('stFill').style.width = `${(COMBAT.st / COMBAT.maxSt) * 100}%`;
  $('xpFill').style.width = `${(COMBAT.xp / xpNeed(COMBAT.level)) * 100}%`; $('lvl').textContent = `Lv ${COMBAT.level}`;
}

// ---------- input ----------
addEventListener('keydown', (e) => { if (!UI_STATE.started || e.repeat) return; if (e.code === 'KeyF') attack('light'); else if (e.code === 'KeyG') attack('heavy'); else if (e.code === 'KeyQ') dodge(); });
renderer.domElement.addEventListener('mousedown', (e) => { if (!UI_STATE.started || !cam.locked) return; if (e.button === 0) attack('light'); else if (e.button === 2) attack('heavy'); });
renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

// ---------- combat sounds ----------
const _sfxBase = sfx;
sfx = function (name) {
  if (!AUD.ctx) return;
  if (name === 'swing') noiseBurst(0.18, 0.18, 2400, 'bandpass');
  else if (name === 'hit') { tone(180, 0.12, 0.12, 'square', 0.5); noiseBurst(0.1, 0.22, 3000, 'highpass'); tone(1200, 0.18, 0.04, 'triangle', 0.6); }
  else if (name === 'hurt') { tone(110, 0.25, 0.2, 'sawtooth', 0.6); noiseBurst(0.15, 0.15, 600); }
  else if (name === 'dodge') noiseBurst(0.22, 0.1, 1200, 'bandpass');
  else if (name === 'eswing') noiseBurst(0.16, 0.12, 1600, 'bandpass');
  else if (name === 'enemyDie') { tone(420, 0.5, 0.08, 'sawtooth', 0.25); noiseBurst(0.3, 0.15, 900); }
  else if (name === 'levelup') { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.35, 0.07, 'triangle', 1, i * 0.09)); }
  else if (name === 'slam') { tone(55, 0.8, 0.35, 'sawtooth', 0.5); noiseBurst(0.5, 0.3, 300); }
  else if (name === 'boss') { tone(70, 1.6, 0.25, 'sawtooth', 0.7); tone(105, 1.6, 0.12, 'square', 0.7, 0.2); }
  else if (name === 'die') tone(220, 1.2, 0.12, 'triangle', 0.3);
  else _sfxBase(name);
};
