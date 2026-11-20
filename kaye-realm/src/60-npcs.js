// ===== NPCs: town graph, schedules, greetings, dialogue, interactions =====
const NPCS = [];
let BOB = null; const PIGEONS = [];

// ---------- Town walking graph ----------
const TG = { nodes: [], adj: [] };
function tgAdd(p) { TG.nodes.push(p.clone ? p.clone() : p); TG.adj.push([]); return TG.nodes.length - 1; }
function tgLink(a, b) { if (a === b || TG.adj[a].includes(b)) return; TG.adj[a].push(b); TG.adj[b].push(a); }
const polar = (r, a) => { const x = Math.cos(a) * r, z = Math.sin(a) * r; return new THREE.Vector3(x, terrainH(x, z), z); };
function nearestNode(p, filter) { let best = -1, bd = 1e9; TG.nodes.forEach((n, i) => { if (filter && !filter(i)) return; const d = Math.hypot(n.x - p.x, n.z - p.z); if (d < bd) { bd = d; best = i; } }); return best; }
function buildTownGraph() {
  const P15 = [], R30 = [], R66 = [];
  for (let i = 0; i < 10; i++) P15.push(tgAdd(polar(15, i / 10 * TAU + 0.31)));
  for (let i = 0; i < 20; i++) R30.push(tgAdd(polar(30, i / 20 * TAU)));
  for (let i = 0; i < 20; i++) R66.push(tgAdd(polar(66, i / 20 * TAU)));
  for (const ring of [P15, R30, R66]) ring.forEach((n, i) => tgLink(n, ring[(i + 1) % ring.length]));
  P15.forEach((n, i) => { const a = i / 10 * TAU + 0.31; tgLink(n, R30[Math.round(a / TAU * 20) % 20]); });
  for (let i = 0; i < 20; i += 2) { const mid = tgAdd(polar(48, i / 20 * TAU)); tgLink(R30[i], mid); tgLink(mid, R66[i]); }
  TG.plaza = P15; TG.r30 = R30; TG.r66 = R66;
  for (const h of HOUSES) {
    const d = Math.hypot(h.doorOut.x, h.doorOut.z), ring = d < 55 ? R30 : R66;
    h.nOut = tgAdd(h.doorOut); tgLink(h.nOut, nearestNode(h.doorOut, (i) => ring.includes(i)));
    h.nIn = tgAdd(h.doorIn); tgLink(h.nOut, h.nIn);
    const sp = h.seat.p.clone(); sp.y = h.g; h.nSeat = tgAdd(sp); tgLink(h.nIn, h.nSeat);
  }
  TG.benches = [];
  for (const s of SEATS) if (Math.hypot(s.p.x, s.p.z) < 100 && s.kind === 'bench') {
    const p = s.p.clone(); p.x -= Math.sin(s.rot) * -0.0; const n = tgAdd(new THREE.Vector3(s.p.x + Math.sin(s.rot) * 0.55, terrainH(s.p.x, s.p.z), s.p.z + Math.cos(s.rot) * 0.55));
    const near = Math.hypot(s.p.x, s.p.z) < 20 ? P15 : Math.hypot(s.p.x, s.p.z) < 55 ? R30 : R66;
    tgLink(n, nearestNode(TG.nodes[n], (i) => near.includes(i))); TG.benches.push({ n, seat: s });
  }
  TG.stalls = TOWN_POINTS.slice(0, 6).map((p) => { const n = tgAdd(p); tgLink(n, nearestNode(p, (i) => P15.includes(i) || R30.includes(i))); return n; });
}
function tgPath(a, b) {
  const N = TG.nodes.length, dist = new Float32Array(N).fill(1e9), prev = new Int32Array(N).fill(-1), done = new Uint8Array(N);
  dist[a] = 0;
  for (;;) { let u = -1, bd = 1e9; for (let i = 0; i < N; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; u = i; } if (u < 0 || u === b) break; done[u] = 1; for (const v of TG.adj[u]) { const d = bd + TG.nodes[u].distanceTo(TG.nodes[v]); if (d < dist[v]) { dist[v] = d; prev[v] = u; } } }
  const path = []; for (let u = b; u >= 0; u = prev[u]) path.unshift(TG.nodes[u].clone()); return path;
}

// ---------- Looks ----------
const SKINS = [0xf3d1b0, 0xe8b98f, 0xd29a6c, 0xb47a4e, 0x8c5a36, 0x6a4128];
const HAIRS = [0x2a1a10, 0x4a2e1a, 0x7a4a26, 0xb5763a, 0xd8b56a, 0x9a3a1e, 0xb0aaa0, 0x1a1412];
const CLOTH = [0x7a3b2a, 0x3d5a7a, 0x5a7a3d, 0x8a6a2a, 0x6a3d6a, 0x2f6a6a, 0xa0522d, 0x4a4a6a, 0x8a2a3a, 0x556b2f];
function townLook(name, occ) {
  const dress = rand() < 0.5, hat = rand() < 0.4 ? pick(['cap', 'straw']) : null;
  return { name, height: rr(1.6, 1.86), skin: pick(SKINS), hair: rand() < 0.08 ? null : pick(HAIRS), hairStyle: dress ? pick(['long', 'bun', 'long']) : pick(['short', 'short', 'long']), top: pick(CLOTH), sleeve: rand() < 0.4 ? 0xe8dcc4 : null, pants: pick([0x4b3a2c, 0x3a3a46, 0x5a4a3a, 0x6b5b45]), dress: dress ? pick(CLOTH) : null, dressLen: rr(0.5, 0.72), beard: !dress && rand() < 0.35 ? pick(HAIRS) : null, hat, hatCol: pick(CLOTH), apron: ['baker', 'blacksmith', 'tanner', 'potter', 'glassblower', 'cooper'].includes(occ) ? 0xe8e0d0 : null, belt: pick([0x5b3a22, 0x3a2a1a, 0x8a6a3a]) };
}
const OCC_LINES = {
  baker: 'The honey loaves come out of the oven at dawn. Follow your nose!', blacksmith: 'Mind the sparks. I\'m shoeing the castle horses this week.', weaver: 'This wool is dyed with river madder. Lovely red, isn\'t it?', farmer: 'Good rain this year. The barley\'s up to my knees already.',
  herbalist: 'Elvenhollow moss cures a cough in a day. The elves trade it at the Gilded Acorn.', carpenter: 'I built half these benches. Sit on any you like!', fisherman: 'Silverrun trout bite best just after sunrise, under the old bridge.', seamstress: 'Your cape has lovely drape. Crimson suits you.',
  cooper: 'Every barrel at the Gilded Acorn is one of mine.', shepherd: 'My flock grazes the meadows toward the castle.', beekeeper: 'Bees are calm today. Must be the sunshine.', scribe: 'I copy letters for the castle. The steward writes far too much.',
  milkmaid: 'Fresh milk, still warm. Bob the cat always finds me first.', potter: 'Clay from the riverbank makes the finest pots in the realm.', florist: 'These are from the castle gardens. The gardeners spoil me.', cartographer: 'Press Tab and you\'ll see my finest map of the realm.',
  midwife: 'Three babies this week! Willowmere is growing.', miller: 'The mill wheel turns slow in summer. Rain will help.', 'innkeeper\'s sister': 'My sister runs a little inn in the next valley. The elves\' pub is fancier.', mason: 'I helped repair the castle walls. Two hundred tons of stone!',
  chandler: 'Candles for the castle chandeliers. Ten dozen a week!', tanner: 'Leather for boots, belts and saddles. Fine work on your boots, by the way.', healer: 'Rest when you need it. Even heroes lie down sometimes.', fletcher: 'The guards practise archery behind the keep every morning.',
  juggler: 'Watch this! Well, maybe later. My pins are at home.', tailor: 'If you need a new tunic, come by my shop on the ring road.', glassblower: 'I made the windows that glow in every house at night.', 'bell-ringer': 'The bell rings at noon and at dusk. Lovely sound across the valley.',
  gardener: 'Roses love the morning sun. So do I.', 'retired knight': 'I once rode to the Frostpeaks. The white dragon there is gentle. Pet her if you dare!',
};
const GENERIC_LINES = ['Have you met Bob? That cat thinks he owns Willowmere.', 'The view from Skyreach Tower is worth every single step.', 'Try the honey cake at the Gilded Acorn, just past the bridge.', 'They say a white dragon sleeps up in the Frostpeaks. Gentle as a lamb.', 'Lovely day for a stroll, Kaye.'];

class NPC {
  constructor(def) {
    Object.assign(this, def);
    this.ch = new Char(def.look); scene.add(this.ch.root);
    this.pos = def.start.clone(); this.yaw = def.yaw ?? rand() * TAU; this.path = []; this.timer = rr(0.5, 6); this.state = 'idle'; this.greetT = 0; this.seat = null; this.stuck = 0; this.lastPos = this.pos.clone(); this.visY = this.pos.y;
    this.patrolI = 0;
    NPCS.push(this);
  }
  setPath(p) { this.path = p; this.state = 'walk'; this.stuck = 0; }
  leaveSeat() { if (this.seat) { this.seat.taken = null; this.seat = null; } }
  goTownNode(target) { const from = nearestNode(this.pos); this.setPath(tgPath(from, target)); this.dest = target; }
  plan() {
    const night = ENV.hour < 6.5 || ENV.hour > 20.5;
    if (this.kind === 'resident') {
      if (night) { if (this.atHome) { this.sitAt(this.home.seat, true); this.timer = 30; return; } this.goTownNode(this.home.nSeat); this.goingHome = true; return; }
      this.atHome = false; this.goingHome = false;
      const r = rand();
      if (r < 0.3) { const free = TG.benches.filter((b) => !b.seat.taken); if (free.length) { const b = pick(free); this.goTownNode(b.n); this.wantSeat = b.seat; return; } }
      if (r < 0.75) { this.goTownNode(pick([...TG.plaza, ...TG.stalls, ...TG.r30, ...TG.r66])); return; }
      this.state = 'idle'; this.timer = rr(4, 10); return;
    }
    if (this.kind === 'guard' || this.kind === 'servant') {
      if (this.route) { this.patrolI = (this.patrolI + 1) % this.route.length; this.setPath([this.route[this.patrolI].clone()]); return; }
      this.state = 'idle'; this.timer = rr(5, 12); return;
    }
    if (this.kind === 'worker') { if (this.state === 'work') { this.setPath([pick(CASTLE_PTS.garden).clone()]); return; } this.state = 'work'; this.timer = rr(8, 16); return; }
    if (this.kind === 'elf') {
      const r = rand(); const logs = SEATS.filter((s) => s.kind === 'log' && !s.taken);
      if (r < 0.3 && logs.length) { const s = pick(logs); this.setPath([new THREE.Vector3(s.p.x + Math.sin(s.rot) * 0.7, s.p.y, s.p.z + Math.cos(s.rot) * 0.7)]); this.wantSeat = s; return; }
      if (r < 0.8) { this.setPath([pick(ELF_POINTS).clone()]); return; }
      this.state = 'idle'; this.timer = rr(4, 9); return;
    }
    this.state = 'idle'; this.timer = rr(5, 10);
  }
  sitAt(seat, home) { this.leaveSeat(); seat.taken = this; this.seat = seat; this.state = 'sit'; this.timer = home ? 20 : rr(12, 30); this.pos.set(seat.p.x, seat.p.y - 0.5 * this.ch.k, seat.p.z); this.yaw = seat.rot; }
  greet() {
    this.leaveSeat(); this.state = 'greet'; this.greetT = 5.5; this.path = [];
    const ch = this.ch;
    if (this.kind === 'elf' || this.kind === 'bartender') { ch.play(ch.hat ? 'doff' : 'wave', ch.hat ? 2.3 : 2); setTimeout(() => this.state === 'greet' && ch.play('gesture', 2.4), 2300); }
    else if (this.kind === 'worker' && rand() < 0.3) ch.play('wave', 1.8);
    else { ch.play('bow', 1.8); setTimeout(() => this.state === 'greet' && ch.play('talk', 2.8), 1800); }
    sfx('greet');
  }
  update(dt, near) {
    const ch = this.ch, k = ch.k;
    const dp = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    ch.root.visible = dp < 130;
    if (!near && dp > 130) return;
    if (this.state === 'greet') {
      this.greetT -= dt; const ty = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z); this.yaw += angDiff(this.yaw, ty) * Math.min(1, dt * 6);
      ch.setState('idle'); if (this.greetT <= 0) { this.state = 'idle'; this.timer = rr(1, 3); }
    } else if (this.state === 'walk') {
      const tgt = this.path[0];
      if (!tgt) { this.arrive(); }
      else {
        const dx = tgt.x - this.pos.x, dz = tgt.z - this.pos.z, d = Math.hypot(dx, dz);
        if (d < 0.45) { this.path.shift(); if (!this.path.length) this.arrive(); }
        else {
          const ty = Math.atan2(dx, dz); this.yaw += angDiff(this.yaw, ty) * Math.min(1, dt * 6);
          const sp = this.walkSpeed || 1.35, f = Math.max(0, Math.cos(angDiff(this.yaw, ty)));
          this.pos.x += Math.sin(this.yaw) * sp * f * dt; this.pos.z += Math.cos(this.yaw) * sp * f * dt;
          // separation from player and other folk
          const px = this.pos.x - player.pos.x, pz = this.pos.z - player.pos.z, pd = Math.hypot(px, pz); if (pd < 0.75 && pd > 0.01) { this.pos.x += px / pd * (0.75 - pd); this.pos.z += pz / pd * (0.75 - pd); }
          collideCircle(this.pos, 0.3, 1.6, 0);
          ch.phase += sp * f * dt / 1.55 * TAU; ch.setState('walk');
          this.stuck += dt; if (this.stuck > 0.8) { if (this.pos.distanceTo(this.lastPos) < 0.3) { this.path.shift(); if (!this.path.length) this.arrive(); } this.lastPos.copy(this.pos); this.stuck = 0; }
        }
      }
    } else if (this.state === 'sit') {
      ch.sitH = 0.6; ch.setState('sit'); this.timer -= dt;
      if (this.timer < 0) { const night = ENV.hour < 6.5 || ENV.hour > 20.5; if (this.kind === 'resident' && this.atHome && night) this.timer = 20; else { const s = this.seat; this.leaveSeat(); this.pos.x += Math.sin(s.rot) * 0.6; this.pos.z += Math.cos(s.rot) * 0.6; this.plan(); } }
    } else if (this.state === 'work') { ch.setState('work'); this.timer -= dt; if (this.timer < 0) this.plan(); }
    else { // idle
      ch.setState(this.idlePose || 'idle'); this.timer -= dt; if (this.facing !== undefined) this.yaw += angDiff(this.yaw, this.facing) * Math.min(1, dt * 3);
      if (this.timer < 0 && !this.stationary) this.plan(); else if (this.timer < 0) this.timer = 10;
    }
    if (this.state !== 'sit') this.pos.y = groundAt(this.pos.x, this.pos.z, this.pos.y + 0.3);
    const dy = this.pos.y - this.visY; this.visY = Math.abs(dy) > 0.9 ? this.pos.y : this.visY + dy * Math.min(1, dt * 14);
    // look at Kaye when she is close
    const toP = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z); ch.look = angDiff(this.yaw, toP); ch.lookOn = dp < 4.5 && Math.abs(ch.look) < 1.6;
    ch.root.position.set(this.pos.x, this.visY, this.pos.z); ch.root.rotation.y = this.yaw;
    if (near || dp < 60) ch.animate(dt); else if ((this.skip = (this.skip || 0) + 1) % 3 === 0) ch.animate(dt * 3);
  }
  arrive() {
    if (this.wantSeat && !this.wantSeat.taken && this.pos.distanceTo(this.wantSeat.p) < 2.2) { const s = this.wantSeat; this.wantSeat = null; this.sitAt(s); return; }
    this.wantSeat = null;
    if (this.kind === 'resident' && this.goingHome) { this.atHome = true; this.goingHome = false; this.sitAt(this.home.seat, true); return; }
    if (this.kind === 'worker') { this.state = 'work'; this.timer = rr(8, 16); return; }
    this.state = 'idle'; this.timer = this.kind === 'guard' ? rr(3, 7) : rr(2, 7);
  }
  lines() {
    const night = ENV.hour < 6.5 || ENV.hour > 20.5, first = this.name.split(' ')[0];
    if (this.kind === 'resident') { const a = [`Good ${ENV.hour < 12 ? 'morning' : ENV.hour < 18 ? 'afternoon' : 'evening'}, Kaye! I'm ${first}, the town ${this.occ}.`, OCC_LINES[this.occ] || pick(GENERIC_LINES), night ? 'It\'s late. The lanterns will guide you home.' : pick(GENERIC_LINES)]; return a; }
    return this.say;
  }
}

function spawnNPCs() {
  HOUSES.forEach((h, i) => {
    const [name, occ] = RESIDENT_NAMES[i];
    const start = pick([...TG.plaza, ...TG.r30, ...TG.r66, ...TG.stalls]);
    const n = new NPC({ name, occ, kind: 'resident', look: townLook(name, occ), start: TG.nodes[start].clone(), home: h });
    h.owner = n;
  });
  const G = CASTLE.y;
  const guardLook = (name) => ({ name, height: rr(1.78, 1.9), skin: pick(SKINS), hair: pick(HAIRS), hairStyle: 'short', top: 0x6b6f78, sleeve: 0x6b6f78, pants: 0x3a3a46, tabard: 0x1f3c7a, hat: 'helmet', spear: true, beard: rand() < 0.4 ? pick(HAIRS) : null, boots: 0x2a2018 });
  const GL = ['Welcome to Castle Aurelion, traveller.', 'The throne hall is open to visitors today. The queen is away on a royal tour, so go on, try the throne!', 'Skyreach Tower is in the south courtyard. Seventy metres of stairs, and the best view in the realm.'];
  const guards = [
    ['Captain Aldric Vane', new THREE.Vector3(CASTLE.x1 + 6, G, 8), Math.PI / 2, null], ['Guard Hilde Marrow', new THREE.Vector3(CASTLE.x1 + 6, G, -8), Math.PI / 2, null],
    ['Guard Odo Fenn', new THREE.Vector3(KEEP.x1 + 4, G, 6.5), Math.PI / 2, null], ['Guard Rowan Pike', new THREE.Vector3(KEEP.x1 + 4, G, -6.5), Math.PI / 2, null],
    ['Guard Tamsin Reeve', new THREE.Vector3(-335, G, 3), 0, [[-335, 3], [-368, 11], [-392, 11], [-430, 3], [-392, 11], [-368, 11]]], ['Guard Bram Holloway', new THREE.Vector3(-430, G, -3), 0, [[-430, -3], [-392, -11], [-368, -11], [-335, -3], [-368, -11], [-392, -11]]],
    ['Guard Elric Stone', new THREE.Vector3(TOWER.x + 4, G, TOWER.z + 12), 0, null],
  ];
  for (const [name, p, yaw, route] of guards) new NPC({ name, kind: 'guard', look: guardLook(name), start: p, yaw, facing: route ? undefined : yaw, stationary: !route, route: route ? route.map(([x, z]) => new THREE.Vector3(x, G, z)) : null, say: name.startsWith('Captain') ? ['Captain Aldric Vane, at your service.', ...GL.slice(1)] : name.includes('Elric') ? ['This is Skyreach Tower. Up you go! Two hundred steps, give or take.', 'From the top you can see from the castle to the dragon\'s peak.'] : GL, walkSpeed: 1.2 });
  const workers = [['Wilmot Thatch', 'head gardener'], ['Pell Ashgrove', 'gardener'], ['Greta Lark', 'gardener']];
  for (const [name, occ] of workers) new NPC({ name, kind: 'worker', look: { name, height: rr(1.65, 1.8), skin: pick(SKINS), hair: pick(HAIRS), hairStyle: 'short', top: 0x5a7a3d, pants: 0x5a4a3a, hat: 'straw', hatCol: 0x5a7a3d, apron: 0x8a6a3a, beard: rand() < 0.5 ? pick(HAIRS) : null }, start: pick(CASTLE_PTS.garden).clone(), say: [`I'm ${name.split(' ')[0]}, ${occ} of Castle Aurelion.`, 'These roses took three summers to bloom like this.', 'Careful of the tulips, they bruise if you look at them wrong.'] });
  const sv = (name, side, route, tray) => new NPC({ name, kind: 'servant', look: { name, height: rr(1.6, 1.78), skin: pick(SKINS), hair: pick(HAIRS), hairStyle: pick(['bun', 'short']), top: 0x2a2a34, sleeve: 0xeeeae0, pants: 0x2a2a34, dress: 0x2a2a34, dressLen: 0.72, apron: 0xf4f1ea, tray }, start: route[0].clone(), route, say: ['Welcome to the keep, miss.', 'Supper is served at sundown in the great hall.', 'The library is upstairs on the north side. Mind the stairs in the corridor.'] });
  for (const s of [1, -1]) {
    sv(s > 0 ? 'Maud Penrose' : 'Edwin Hartley', s, [[-470, s * 11], [-490, s * 11], [-490, s * 16.2], [-520, s * 16.2], [-550, s * 16.2], [-550, s * 11], [-562, s * 3.5], [-470, s * 3.5]].map(([x, z]) => new THREE.Vector3(x, G, z)), true);
  }
  sv('Rosalind Fairweather', 1, [[-400, 14], [-350, 16], [-350, 40], [-400, 40]].map(([x, z]) => new THREE.Vector3(x, G, z)), false);
  new NPC({ name: 'Steward Amberly Quill', kind: 'servant', look: { name: 'Steward Amberly Quill', height: 1.74, skin: pick(SKINS), hair: 0xb0aaa0, hairStyle: 'short', top: 0x5c3a78, trim: 0xd9a640, pants: 0x2a2a34, dress: 0x5c3a78, dressLen: 0.8, dressFlare: 0.34, beard: 0xb0aaa0 }, start: new THREE.Vector3(-563, G, -7), yaw: Math.PI / 2, facing: Math.PI / 2, stationary: true, say: ['Steward Amberly Quill. I keep this castle running.', 'The throne? Her Majesty would not mind. Go ahead and sit, but don\'t get used to it!', 'Skyreach Tower overlooks the whole realm, from Willowmere to the Frostpeaks.'] });
  // elves
  const elf = (name, look, extra) => new NPC({ name, kind: 'elf', look: { name, elf: true, slim: true, height: rr(1.82, 1.92), cheerful: true, ...look }, ...extra });
  elf('Elarion Sunleaf', { skin: 0xf0d6bc, hair: 0xe8d8a0, hairStyle: 'long', top: 0x3d7a4a, trim: 0xd9a640, pants: 0x4a5a3a, hat: 'elf', hatCol: 0x2f6a3a }, { start: ELF_POINTS[0].clone(), say: ['Mae govannen, Kaye! Welcome to Elvenhollow.', 'Our homes grow with the old trees. We ask before we build.', 'Thalindra pours the finest elderflower wine at the Gilded Acorn.'] });
  elf('Sylwen Mistvale', { skin: 0xd8b494, hair: 0x2a1a30, hairStyle: 'long', top: 0x5a4a8a, trim: 0xc0c8d8, pants: 0x3a3a5a, dress: 0x5a4a8a, dressLen: 0.75, hat: 'elf', hatCol: 0x6a5aa0, hatBand: 0xc0c8d8 }, { start: ELF_POINTS[2].clone(), say: ['The stars over the pond are brighter here. Come back at night.', 'I weave moonlight into thread. Well, nearly.'] });
  elf('Faelar Thornbrook', { skin: 0xa77a52, hair: 0x6a3a1a, hairStyle: 'short', top: 0x8a5a2a, pants: 0x4a3a2a, hat: 'elf', hatCol: 0x7a4a1a, hatBand: 0x3d7a3a }, { start: ELF_POINTS[4].clone(), say: ['Greetings! I keep the forest paths clear.', 'The light falls through the canopy like honey in the afternoon.'] });
  elf('Lirael Dawnwhisper', { skin: 0xf3e0cc, hair: 0xd8d8e8, hairStyle: 'long', top: 0x2f6a7a, trim: 0xd9a640, pants: 0x3a4a5a, dress: 0x2f6a7a, dressLen: 0.75, hat: 'elf', hatCol: 0x9fd07a }, { start: ELF_POINTS[6].clone(), say: ['Hello, Kaye! The pond spirits say you are kind.', 'Have you seen the white dragon? She dreams of snow and starlight.'] });
  const bt = new NPC({ name: 'Thalindra Goldleaf', kind: 'bartender', look: { name: 'Thalindra Goldleaf', elf: true, slim: true, height: 1.84, cheerful: true, skin: 0xe8c8a8, hair: 0xb5501e, hairStyle: 'bun', top: 0x6a2f2f, sleeve: 0xeee4cc, trim: 0xd9a640, apron: 0xf4ecd8, pants: 0x3a2a2a, dress: 0x6a2f2f, dressLen: 0.7, hat: 'elf', hatCol: 0x7a3a2a }, start: PUB.bartenderSpot.clone(), yaw: PUB.rot, facing: PUB.rot, stationary: true, idlePose: 'tend', say: ['Welcome to the Gilded Acorn! I\'m Thalindra.', 'Acorn ale, elderflower tea or warm honey cake? On the house for you, Kaye.', 'Pull up a stool, or sit by the fire. Press E near any seat.'] });
  void bt;
}

// ---------- Interactions ----------
let PROMPT_TARGET = null;
function findInteract() {
  const p = player.pos, fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
  let best = null, bs = 1e9;
  const consider = (pos, r, item) => { const dx = pos.x - p.x, dz = pos.z - p.z, d = Math.hypot(dx, dz); if (d > r || Math.abs(pos.y - p.y) > 2.2) return; const s = d - 0.6 * (dx * fx + dz * fz) / (d || 1); if (s < bs) { bs = s; best = item; } };
  for (const n of NPCS) if (n.ch.root.visible) { const d0 = bs; consider(n.pos, 3.0, { label: `Greet ${n.name}`, npc: n }); if (bs < d0) bs -= 1.2; }
  if (BOB) consider(BOB.pos, 2.2, { label: 'Pet Bob the Cat', cat: true });
  if (DRAGON.obj) for (const q of DRAGON.pts) consider(q, 6.5, { label: 'Pet Snowmane the White Dragon', dragon: true });
  for (const s of SEATS) if (!s.taken && player.mode !== 'sit') consider(s.p, s.kind === 'throne' ? 3.4 : 1.6, { label: s.kind === 'throne' ? 'Sit on the throne' : 'Sit down', seat: s });
  return best;
}
function interact() {
  if (UI_STATE.dialog) { advanceDialog(); return; }
  if (player.mode === 'sit') { standUp(); return; }
  const it = PROMPT_TARGET; if (!it) return;
  const ch = player.ch;
  if (it.npc) {
    const n = it.npc; n.greet(); player.yaw = Math.atan2(n.pos.x - player.pos.x, n.pos.z - player.pos.z); ch.play('wave', 1.6);
    openDialog(n.lines().map((t) => ({ who: n.name, text: t })), n);
  } else if (it.cat) {
    player.yaw = Math.atan2(BOB.pos.x - player.pos.x, BOB.pos.z - player.pos.z); player.mode = 'stand'; ch.play('petLow', 2.8); BOB.purr = 5; BOB.lookAt = player.pos; setTimeout(() => (BOB.lookAt = null), 5000);
    say('Hello, darling!'); sfx('purr');
    openDialog([{ who: 'Kaye', text: 'Hello, darling!' }, { who: 'Bob the Cat', text: 'Mrrrow... *Bob purrs and bumps his head against your hand.*' }], BOB);
  } else if (it.dragon) {
    const h = DRAGON.head; player.yaw = Math.atan2(h.x - player.pos.x, h.z - player.pos.z); ch.play('pet', 3.2); DRAGON.purr = 4; sfx('rumble');
    openDialog([{ who: 'Snowmane the White Dragon', text: '*A deep, warm rumble rolls through the snow. The great dragon sighs, still fast asleep, and curls a little tighter.*' }, { who: 'Kaye', text: 'Sweet dreams, big one.' }], { pos: DRAGON.head, far: 16 });
  } else if (it.seat) {
    const s = it.seat; s.taken = 'player'; player.seat = s; player.mode = 'sit'; sfx('sit');
    if (s.kind === 'throne') toast('You sit upon the throne of Aurelion. Press E or move to stand.');
  }
}
// dialogue
function openDialog(lines, npc) { UI_STATE.dialog = { lines, i: 0, npc, t: 0, autoClose: false }; showLine(); }
function showLine() { const d = UI_STATE.dialog, l = d.lines[d.i]; $('dlgName').textContent = l.who; $('dlgText').textContent = ''; d.full = l.text; d.typed = 0; $('dialog').hidden = false; $('dlgHint').textContent = d.i < d.lines.length - 1 ? 'E  Next' : 'E  Close'; }
function advanceDialog() { const d = UI_STATE.dialog; if (d.typed < d.full.length) { d.typed = d.full.length; $('dlgText').textContent = d.full; return; } d.i++; if (d.i >= d.lines.length) closeDialog(); else showLine(); }
function closeDialog() { UI_STATE.dialog = null; $('dialog').hidden = true; }
function updateDialog(dt) {
  const d = UI_STATE.dialog; if (!d) return;
  if (d.typed < d.full.length) { d.typed = Math.min(d.full.length, d.typed + dt * 55); $('dlgText').textContent = d.full.slice(0, Math.floor(d.typed)); }
  if (d.npc) { if (d.npc.pos.distanceTo(player.pos) > (d.npc.far || 6)) closeDialog(); else if (d.npc.state === 'greet') d.npc.greetT = Math.max(d.npc.greetT, 1); }
}
function say(text) { try { const u = new SpeechSynthesisUtterance(text); u.pitch = 1.25; u.rate = 1.0; const v = speechSynthesis.getVoices().find((x) => /female|samantha|victoria|zira|karen|moira|serena/i.test(x.name)); if (v) u.voice = v; speechSynthesis.speak(u); } catch (e) { /* speech unavailable */ } }
