// ===== Citizens, interaction and dialogue =====
const NPCS = [];
const CIT_NAMES = [
  ['Seraphine Aldous', 'sky-pilot'], ['Theo Marchetti', 'canal engineer'], ['Imara Solano', 'café owner'], ['Caspian Reyes', 'courier'], ['Lucia Fenwright', 'archivist'], ['Odell Okafor', 'circuit-smith'],
  ['Mirela Voss', 'gondola driver'], ['Jun Takeda', 'street musician'], ['Priya Anand', 'architect'], ['Felix Moreau', 'pastry chef'], ['Amara Bello', 'city guard captain'], ['Hugo Lindqvist', 'drone mechanic'],
  ['Noor Haddad', 'perfumer'], ['Elias Brandt', 'tram conductor'], ['Valentina Cruz', 'painter'], ['Sasha Petrov', 'retired duelist'], ['Leila Navarro', 'florist'], ['Marcus Hale', 'banker'],
  ['Yuki Sato', 'student'], ['Bastien Roux', 'tailor'], ['Zara Okonkwo', 'hover-car dealer'], ['Ivo Kalnins', 'night watchman'], ['Celeste Duval', 'singer'], ['Ravi Mehta', 'chess master'],
  ['Ines Ferraz', 'glass artist'], ['Tobias Wren', 'cartographer'], ['Mei Lin', 'tea merchant'], ['Anselm Grey', 'clockmaker'], ['Dalia Haro', 'botanist'], ['Kofi Mensah', 'canal diver'],
  ['Nadia Kovac', 'reporter'], ['Rafael Ortega', 'chef'], ['Elsa Bergman', 'pilot trainer'], ['Omar Sayegh', 'jeweller'], ['Aurelie Blanc', 'historian'], ['Gideon Shaw', 'bodyguard'],
];
const CITY_LINES = [
  'Sentinels keep pouring out of the Breach in the east plaza. Someone has to close it.',
  'They say the old guardians forged blades that sing when they cut. Yours has that glow.',
  'Take the Starbridges over the canal. The view of the circuitry below is unreal at night.',
  'The west docks have gone quiet. Rogue machines took them last week.',
  'Rest on a bench if you are hurt. You heal fast when nothing is trying to kill you.',
  'Watch the saucers. When they circle low, the weather is about to turn.',
  'Hover cars along the canal never stop. The circuitry below powers them all.',
];
const LOOKS = { robe: [0xf2efe8, 0xe9dcc0, 0xd8c9a8], suit: [0x2a2d33, 0x1f2a44, 0x3b3f47, 0x5a3a2a], accent: [0xc9a24a, 0x2aa39c, 0x9e2430, 0x6b4aa0] };
const SKINS = [0xf3d1b0, 0xe8b98f, 0xd29a6c, 0xb47a4e, 0x8c5a36, 0x6a4128];
const HAIRS = [0x1a1412, 0x3b2418, 0x6b4a2a, 0xb5763a, 0xd8c08a, 0xa8a8a8, 0x2a1a30];
function citizenLook(name) {
  const robe = rand() < 0.45, acc = pick(LOOKS.accent);
  return { name, height: rr(1.62, 1.88), skin: pick(SKINS), hair: rand() < 0.08 ? null : pick(HAIRS), hairStyle: pick(['short', 'long', 'bun', 'short']), top: robe ? pick(LOOKS.robe) : pick(LOOKS.suit), sleeve: null, trim: acc, cuffs: rand() < 0.5 ? acc : null, pants: robe ? 0xe0d6c0 : 0x24272c, boots: 0x1a1612, belt: acc, dress: robe ? pick(LOOKS.robe) : null, dressLen: rr(0.75, 0.9), dressFlare: 0.3, beard: rand() < 0.15 ? pick(HAIRS) : null, cheerful: rand() < 0.5 };
}
class Citizen {
  constructor(def) {
    Object.assign(this, def);
    this.ch = new Char(def.look); scene.add(this.ch.root);
    this.pos = def.start.clone(); this.yaw = rand() * TAU; this.target = null; this.timer = rr(0.5, 6); this.state = 'idle'; this.seat = null; this.stuck = 0; this.lastPos = this.pos.clone(); this.visY = this.pos.y;
    NPCS.push(this);
  }
  plan() {
    const r = rand();
    if (r < 0.25) { const free = SEATS.filter((s) => !s.taken && Math.sign(s.p.z) === this.side && Math.abs(s.p.x - this.pos.x) < 60); if (free.length) { this.wantSeat = pick(free); this.target = new THREE.Vector3(this.wantSeat.p.x + Math.sin(this.wantSeat.rot) * 0.6, PROM_Y, this.wantSeat.p.z + Math.cos(this.wantSeat.rot) * 0.6); this.state = 'walk'; return; } }
    if (r < 0.8) { const pts = CIT_POINTS.filter((q) => q.side === this.side && Math.abs(q.p.x - this.pos.x) < 70); this.target = pick(pts).p.clone(); this.state = 'walk'; return; }
    this.state = 'idle'; this.timer = rr(3, 9);
  }
  sitAt(s) { s.taken = this; this.seat = s; this.state = 'sit'; this.timer = rr(10, 30); this.pos.set(s.p.x, s.p.y - 0.5 * this.ch.k, s.p.z); this.yaw = s.rot; }
  leaveSeat() { if (this.seat) { const s = this.seat; s.taken = null; this.seat = null; this.pos.set(s.p.x + Math.sin(s.rot) * 0.6, PROM_Y, s.p.z + Math.cos(s.rot) * 0.6); } }
  greet() { this.leaveSeat(); this.state = 'greet'; this.timer = 5; this.ch.play('bow', 1.8); setTimeout(() => this.state === 'greet' && this.ch.play('talk', 2.6), 1800); sfx('greet'); }
  lines() { const first = this.name.split(' ')[0]; return [`Good ${ENV.hour < 12 ? 'morning' : ENV.hour < 18 ? 'afternoon' : 'evening'}, ${HERO.name}. I'm ${first}, ${this.occ}.`, pick(CITY_LINES)]; }
  update(dt) {
    const ch = this.ch, dp = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    ch.root.visible = dp < 120; if (dp > 120) return;
    if (this.state === 'greet') { const ty = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z); this.yaw += angDiff(this.yaw, ty) * Math.min(1, dt * 6); ch.setState('idle'); this.timer -= dt; if (this.timer < 0 && !(UI_STATE.dialog && UI_STATE.dialog.npc === this)) { this.state = 'idle'; this.timer = 2; } }
    else if (this.state === 'walk') {
      const dx = this.target.x - this.pos.x, dz = this.target.z - this.pos.z, d = Math.hypot(dx, dz);
      if (d < 0.5) { if (this.wantSeat && !this.wantSeat.taken) { const s = this.wantSeat; this.wantSeat = null; this.sitAt(s); } else { this.wantSeat = null; this.state = 'idle'; this.timer = rr(2, 8); } }
      else {
        const ty = Math.atan2(dx, dz); this.yaw += angDiff(this.yaw, ty) * Math.min(1, dt * 5); const f = Math.max(0, Math.cos(angDiff(this.yaw, ty))), sp = 1.3;
        this.pos.x += Math.sin(this.yaw) * sp * f * dt; this.pos.z += Math.cos(this.yaw) * sp * f * dt;
        const px = this.pos.x - player.pos.x, pz = this.pos.z - player.pos.z, pd = Math.hypot(px, pz); if (pd < 0.75 && pd > 0.01) { this.pos.x += px / pd * (0.75 - pd); this.pos.z += pz / pd * (0.75 - pd); }
        collideCircle(this.pos, 0.3, 1.6); ch.phase += sp * f * dt / 1.55 * TAU; ch.setState('walk');
        this.stuck += dt; if (this.stuck > 1) { if (this.pos.distanceTo(this.lastPos) < 0.3) { this.state = 'idle'; this.timer = 1; } this.lastPos.copy(this.pos); this.stuck = 0; }
      }
    } else if (this.state === 'sit') { ch.sitH = 0.6; ch.setState('sit'); this.timer -= dt; if (this.timer < 0) { this.leaveSeat(); this.plan(); } }
    else { ch.setState('idle'); this.timer -= dt; if (this.timer < 0) this.plan(); }
    if (this.state !== 'sit') this.pos.y = groundAt(this.pos.x, this.pos.z, this.pos.y + 0.3);
    const dy = this.pos.y - this.visY; this.visY = Math.abs(dy) > 0.9 ? this.pos.y : this.visY + dy * Math.min(1, dt * 14);
    const toP = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z); ch.look = angDiff(this.yaw, toP); ch.lookOn = dp < 4.5 && Math.abs(ch.look) < 1.6;
    ch.root.position.set(this.pos.x, this.visY, this.pos.z); ch.root.rotation.y = this.yaw;
    if (dp < 60) ch.animate(dt); else if ((this.skip = (this.skip || 0) + 1) % 3 === 0) ch.animate(dt * 3);
  }
}
function spawnCitizens() {
  CIT_NAMES.forEach(([name, occ], i) => {
    const side = i % 2 ? 1 : -1, pts = CIT_POINTS.filter((q) => q.side === side);
    const c = new Citizen({ name, occ, side, look: citizenLook(name), start: pick(pts).p.clone() });
    if (i < 10) { const seats = SEATS.filter((s) => !s.taken && s.kind === 'cafe'); if (seats.length && side < 0) c.sitAt(pick(seats)); }
  });
}

// ---------- interactions & dialogue ----------
let PROMPT_TARGET = null;
function findInteract() {
  const p = player.pos, fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
  let best = null, bs = 1e9;
  const consider = (pos, r, item, bonus = 0) => { const dx = pos.x - p.x, dz = pos.z - p.z, d = Math.hypot(dx, dz); if (d > r || Math.abs(pos.y - p.y) > 2.2) return; const s = d - 0.6 * (dx * fx + dz * fz) / (d || 1) - bonus; if (s < bs) { bs = s; best = item; } };
  for (const n of NPCS) if (n.ch.root.visible) consider(n.pos, 3.0, { label: `Talk to ${n.name}`, npc: n }, 1.2);
  if (!COMBAT.inFight) for (const s of SEATS) if (!s.taken && player.mode !== 'sit') consider(s.p, 1.6, { label: 'Sit down', seat: s });
  return best;
}
function interact() {
  if (UI_STATE.dialog) { advanceDialog(); return; }
  if (player.mode === 'sit') { standUp(); return; }
  const it = PROMPT_TARGET; if (!it) return;
  if (it.npc) { const n = it.npc; n.greet(); player.yaw = Math.atan2(n.pos.x - player.pos.x, n.pos.z - player.pos.z); player.ch.play('talk', 2); openDialog(n.lines().map((t) => ({ who: n.name, text: t })), n); }
  else if (it.seat) { const s = it.seat; s.taken = 'player'; player.seat = s; player.mode = 'sit'; sfx('sit'); }
}
function openDialog(lines, npc) { UI_STATE.dialog = { lines, i: 0, npc, autoClose: false }; showLine(); }
function showLine() { const d = UI_STATE.dialog, l = d.lines[d.i]; $('dlgName').textContent = l.who; $('dlgText').textContent = ''; d.full = l.text; d.typed = 0; $('dialog').hidden = false; $('dlgHint').textContent = d.i < d.lines.length - 1 ? 'E  Next' : 'E  Close'; }
function advanceDialog() { const d = UI_STATE.dialog; if (d.typed < d.full.length) { d.typed = d.full.length; $('dlgText').textContent = d.full; return; } d.i++; if (d.i >= d.lines.length) closeDialog(); else showLine(); }
function closeDialog() { UI_STATE.dialog = null; $('dialog').hidden = true; }
function updateDialog(dt) {
  const d = UI_STATE.dialog; if (!d) return;
  if (d.typed < d.full.length) { d.typed = Math.min(d.full.length, d.typed + dt * 55); $('dlgText').textContent = d.full.slice(0, Math.floor(d.typed)); }
  if (d.npc && d.npc.pos && d.npc.pos.distanceTo(player.pos) > 6) closeDialog();
}
