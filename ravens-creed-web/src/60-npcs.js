// ===== People of Valdrheim, the dialogue engine (same data format as the Unreal FRCDialogueGraph JSON) and The Drowned Oath =====
const DLG_DATA = /*__DLG__*/ {};
const FLAGS = { SILVER: 20 };
const ALIGN = { Honor: 10, Cunning: 15, Piety: 10, Ambition: 5 };
const WIND_NAME = { Honor: 'Oath', Cunning: 'Shadow', Piety: 'Rune', Ambition: 'Crown' };
const REP = {};
const QUEST = { stage: 0, done: false, outcome: null, pendingSaga: false, sagaShown: false, log: [] };
const STAGE_TEXT = [
  ['Speak with Jarl Eirik at the oath-stone.', 'He waits on the plateau beside the rune-stone.'],
  ['The lawspeaker hasn\'t slept since a Hedeby merchant came. Find out why.', 'Help Hild at the harbour · crouch (C) near the boathouse to overhear · pickpocket Thorvald from behind'],
  ['Thorvald plans to poison the oath-horn. Stop him, or use it.', 'Confront him alone in the boathouse, or tell Eirik to call the thing.'],
  ['The horn goes round at the next thunder.', 'Speak to Thorvald or Eirik in the hall. In a lightning blackout you could swap the horn.'],
];
const OUTCOMES = {
  Exposed: ['Exposed', 'You named the poisoner before both clans. Two fleets sail as one, and the lawspeaker\'s name is cut from the stones.'],
  Confessed: ['Confessed', 'Thorvald spoke his own guilt when the horn came round. The jarls judged him, and the oath was sworn clean. The skalds call it the best night\'s work in a generation.'],
  Turned: ['Turned', 'The lawspeaker lives, and now he lies to the Gullbrand Circle for you. The oath held, and nobody but you knows the price.'],
  Omen: ['The Omen', 'Lightning split the oath-stone and the lawspeaker broke with it. Men will swear for a hundred winters that Odin\'s eye opened over Valdrheim.'],
  FalseAccusation: ['Words Without Proof', 'You accused the lawspeaker with nothing in your hands. Sigrid\'s ships left on the tide, and the Circle now knows your face.'],
  Exploited: ['The Poisoned Horn', 'You let the horn go round. Sigrid fell at the feast, the clans are at each other\'s throats, and a war-band looks to you.'],
  Swapped: ['The Gods\' Judgment', 'In the dark between two lightning strokes you swapped the cups. Thorvald drank his own poison, and the hall called it the gods\' judgment.'],
  Assassinated: ['The Silent Blade', 'The lawspeaker died with no word spoken. The oath was sworn, but someone in Valdrheim will remember the raven\'s shadow.'],
  Fled: ['The Drowned Man', 'Thorvald "drowned" in the storm and rowed west before dawn. The oath held; the debts went with him.'],
  Poisoned: ['The Horn Went Round', 'You waited, and the poison did its work. Sigrid fell at the feast, and the alliance died with her.'],
};

// ---------- people ----------
const NPCS = [], PEOPLE = {};
const TOWNS = [['Gunnhild', 'weaver'], ['Orm', 'smith'], ['Ragna', 'fishwife'], ['Ketil', 'net-mender'], ['Asa', 'brewer'], ['Halfdan', 'old raider'], ['Tove', 'shepherd'], ['Sven', 'shipwright'], ['Bodil', 'herb-woman'], ['Ivar', 'hall-guard'], ['Freydis', 'trader'], ['Arne', 'boy who wants to be a skald']];
const TOWN_LINES = [
  'Rain on the oath night. My grandmother would call that a warning.',
  'The wolf-heads camp in the west wood. Nobody goes there after dark.',
  'They say you came out of the ash of a burned village, raven. Is it true?',
  'Leave an offering at the oath-stone. The gods remember who feeds them.',
  'The lawspeaker walks the harbour at night. Never used to.',
  'Sigrid of the Ylfings brought twenty ships. Twenty! The fjord has never seen the like.',
  'When the lightning comes, the hall torches go out. Old Halfdan says that is when the gods choose.',
  'A Hedeby merchant tied up at the boathouse. Pays in silver, asks too many questions.',
];
const SKINS = [0xf0cdb0, 0xe8b98f, 0xd8a88a, 0xc99a78];
const HAIRS = [0x2a1a10, 0x6b4a2a, 0xb5763a, 0xd8c08a, 0xe0d2a8, 0x8a8a82];
class Person {
  constructor(id, name, look, pos, opts = {}) {
    Object.assign(this, { id, name, mode: 'stay', anchor: pos.clone(), anchorYaw: opts.yaw ?? 0, graph: opts.graph || null, killable: !!opts.killable, alive: true, gone: false, mem: new Set(), opinion: opts.opinion ?? 0, fear: 0, trust: 0, occ: opts.occ, zone: opts.zone });
    this.ch = new Char(look); scene.add(this.ch.root);
    this.pos = pos.clone(); this.pos.y = groundAt(pos.x, pos.z, pos.y + 2); this.yaw = this.anchorYaw; this.visY = this.pos.y; this.timer = rr(1, 5); this.state = 'idle'; this.target = null; this.stuck = 0; this.lastPos = this.pos.clone(); this.idleAnim = opts.idle || 'idle';
    NPCS.push(this); PEOPLE[id] = this;
  }
  place(p, yaw) { this.anchor.copy(p); this.anchorYaw = yaw ?? this.anchorYaw; this.mode = 'stay'; this.target = null; this.walkTime = 0; const pd = this.pos.distanceTo(player.pos); if ((pd > 45 && p.distanceTo(player.pos) > 45) || (this.pos.distanceTo(p) > 40 && pd > 20)) { this.pos.copy(p); this.pos.y = groundAt(p.x, p.z, p.y + 2); this.visY = this.pos.y; this.yaw = this.anchorYaw; } else { this.target = p.clone(); this.walkT = 0; } }
  hide() { this.gone = true; this.ch.root.visible = false; }
  die() { this.alive = false; this.state = 'dead'; this.ch.action = null; FLAGS['DEAD_' + this.id] = 1; }
  update(dt) {
    const ch = this.ch; if (this.gone) { ch.root.visible = false; return; }
    const dp = Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
    ch.root.visible = dp < 130; if (dp > 130 && !this.target) return;
    if (!this.alive) { ch.setState('lie'); }
    else if (UI_STATE.dialog && UI_STATE.dialog.npc === this) { const ty = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z); this.yaw += angDiff(this.yaw, ty) * Math.min(1, dt * 6); ch.setState('idle'); }
    else if (this.mode === 'follow') this.follow(dt, dp);
    else if (this.target) this.walk(dt, this.target, 1.5, () => { this.target = null; });
    else if (this.mode === 'wander') {
      if (this.state === 'walk') this.walk(dt, this.wp, 1.25, () => { this.state = 'idle'; this.timer = rr(3, 9); });
      else { ch.setState('idle'); this.timer -= dt; if (this.timer < 0) { const pts = TOWN_POINTS.filter((q) => q.zone === this.zone && q.p.distanceTo(this.pos) < 40); if (pts.length) { const q = pick(pts).p; this.wp = new THREE.Vector3(q.x, 0, q.z); this.state = 'walk'; } else this.timer = 3; } }
    } else { this.yaw += angDiff(this.yaw, this.anchorYaw) * Math.min(1, dt * 2); ch.setState(this.idleAnim); if (this.pos.distanceTo(this.anchor) > 2.5) this.target = this.anchor.clone(); }
    if (this.alive) this.pos.y = groundAt(this.pos.x, this.pos.z, this.pos.y + 0.4);
    const dy = this.pos.y - this.visY; this.visY = Math.abs(dy) > 0.9 ? this.pos.y : this.visY + dy * Math.min(1, dt * 14);
    const toP = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z); ch.look = angDiff(this.yaw, toP); ch.lookOn = this.alive && dp < 5 && Math.abs(ch.look) < 1.6;
    ch.root.position.set(this.pos.x, this.visY, this.pos.z); ch.root.rotation.y = this.yaw;
    if (dp < 60) ch.animate(dt); else if ((this.skip = (this.skip || 0) + 1) % 3 === 0) ch.animate(dt * 3);
  }
  walk(dt, t, sp, done) {
    const dx = t.x - this.pos.x, dz = t.z - this.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.6) { done(); return; }
    this.walkTime = (this.walkTime || 0) + dt; if (this.walkTime > 10 && this.mode !== 'follow' && Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z) > 18) { this.pos.set(t.x, groundAt(t.x, t.z, (t.y || 0) + 2), t.z); this.visY = this.pos.y; this.walkTime = 0; done(); return; }
    const ty = Math.atan2(dx, dz); this.yaw += angDiff(this.yaw, ty) * Math.min(1, dt * 5); const f = Math.max(0, Math.cos(angDiff(this.yaw, ty)));
    this.pos.x += Math.sin(this.yaw) * sp * f * dt; this.pos.z += Math.cos(this.yaw) * sp * f * dt;
    const px = this.pos.x - player.pos.x, pz = this.pos.z - player.pos.z, pd = Math.hypot(px, pz); if (pd < 0.75 && pd > 0.01) { this.pos.x += px / pd * (0.75 - pd); this.pos.z += pz / pd * (0.75 - pd); }
    collideCircle(this.pos, 0.3, 1.6); this.ch.phase += sp * f * dt / 1.55 * TAU; this.ch.setState(sp > 2.5 ? 'run' : 'walk');
    this.stuck += dt; if (this.stuck > 1.2) { if (this.pos.distanceTo(this.lastPos) < 0.35) { this.walkT = (this.walkT || 0) + 1; if (this.walkT > 2 && Math.hypot(player.pos.x - this.pos.x, player.pos.z - this.pos.z) > 25) { this.pos.set(t.x, groundAt(t.x, t.z, 99), t.z); this.visY = this.pos.y; } } this.lastPos.copy(this.pos); this.stuck = 0; }
  }
  follow(dt, dp) {
    if (dp > 35) { const b = _v.set(-Math.sin(player.yaw) * 2, 0, -Math.cos(player.yaw) * 2); this.pos.set(player.pos.x + b.x, player.pos.y, player.pos.z + b.z); this.visY = this.pos.y; return; }
    if (dp > 3.2) { const sp = dp > 9 ? 5.2 : 2.2; this.walk(dt, player.pos, sp, () => {}); }
    else { this.ch.setState('idle'); this.yaw += angDiff(this.yaw, Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z)) * Math.min(1, dt * 3); }
  }
}
const V = (x, z, y = 99) => new THREE.Vector3(x, groundAt(x, z, y), z);
function spawnPeople() {
  const hallDoorX = HALL.x + HALL.w / 2 + 3;
  new Person('Eirik', 'Jarl Eirik Hrafnsson', { name: 'Eirik', height: 1.86, skin: 0xe2b896, hair: 0x9a5a2a, hairStyle: 'long', beard: 0x9a5a2a, top: 0x5a1a22, sleeve: 0x3a2a1e, trim: 0xb8913f, pants: 0x2a2420, belt: 0x3a2618, tabard: 0x9e2430,
    parts(BK, mk, pg, G) { BK.chest.push(pg(G.sph, 0x6e6a63, 0, 0.25, -0.01, 0, 0, 0, 0.27, 0.1, 0.2)); BK.head.push(pg(G.cyl(0.115, 0.115, 0.03, 14), 0xd9a640, 0, 0.16, 0)); } }, V(STONE.x - 3.5, STONE.z + 3.5), { graph: 'Eirik', yaw: Math.PI * 0.75 });
  new Person('Thorvald', 'Thorvald Grimsson, lawspeaker', { name: 'Thorvald', height: 1.8, skin: 0xe2b896, hair: 0x9a9a92, hairStyle: 'long', beard: 0x9a9a92, top: 0x3a4a5a, trim: 0xb8913f, dress: 0x2e3a48, dressLen: 0.9, dressFlare: 0.25, pants: 0x2a2a30 }, V(HALL.x - 6, HALL.z + 2.5, HALL.floor + 1), { graph: 'DLG_DrownedOath_Thorvald', killable: true, yaw: -Math.PI / 2 });
  new Person('Hild', 'Hild Thorvaldsdottir', { name: 'Hild', height: 1.66, skin: 0xf0cdb0, hair: 0xc9a060, hairStyle: 'long', top: 0x6a7a5a, trim: 0x9e2430, dress: 0x5a6a4a, dressLen: 0.88, dressFlare: 0.3, apron: 0xd8ccb0 }, V(-62, 73, 5), { graph: 'DLG_DrownedOath_Hild', yaw: 0, idle: 'tend' });
  new Person('Sigrid', 'Jarl Sigrid of the Ylfings', { name: 'Sigrid', height: 1.78, skin: 0xf0cdb0, hair: 0xd8c08a, hairStyle: 'bun', top: 0x24427e, trim: 0xb8913f, dress: 0x1f2a44, dressLen: 0.85, dressFlare: 0.3, cuffs: 0xb8913f }, V(hallDoorX + 4, HALL.z + 6), { graph: 'Sigrid', yaw: -Math.PI / 2 });
  new Person('Ulfhild', 'Ulfhild the völva', { name: 'Ulfhild', height: 1.7, skin: 0xe8c4a8, hair: 0xe8e0d0, hairStyle: 'long', top: 0x2a2a3a, trim: 0x6a5aa0, dress: 0x22222e, dressLen: 0.92, dressFlare: 0.35, spear: true,
    parts(BK, mk, pg, G) { BK.head.push(pg(G.hairCap, 0x1c1c26, 0, 0.06, -0.02, -0.3, 0, 0, 0.14, 0.155, 0.15)); for (let i = 0; i < 5; i++) BK.chest.push(pg(G.sph, i % 2 ? 0xb8913f : 0x9fd0e0, -0.1 + i * 0.05, 0.2 - Math.abs(i - 2) * 0.03, 0.12, 0, 0, 0, 0.018, 0.018, 0.018)); } }, V(STONE.x + 4, STONE.z - 3), { graph: 'Ulfhild', yaw: -Math.PI / 2 });
  new Person('Grani', 'Grani of Hedeby, merchant', { name: 'Grani', height: 1.74, skin: 0xd29a6c, hair: 0x1a1412, hairStyle: 'short', beard: 0x1a1412, top: 0x5c3a78, trim: 0xd9a640, pants: 0x2a2420, belt: 0xd9a640 }, V(-120, 92, 5), { graph: 'Grani', killable: true, yaw: Math.PI });
  TOWNS.forEach(([name, occ], i) => {
    const zone = i < 5 ? 'terrace' : i < 9 ? 'plateau' : 'terrace', pts = TOWN_POINTS.filter((q) => q.zone === zone), start = pick(pts).p, fem = /a$|ild|hild|il$|is$|ve$/.test(name) && name !== 'Halfdan';
    const look = { name, height: rr(1.62, 1.86), skin: pick(SKINS), hair: pick(HAIRS), hairStyle: fem ? pick(['long', 'bun']) : 'short', beard: fem ? null : rand() < 0.7 ? pick(HAIRS) : null, top: pick([0x5a4a3a, 0x6a5a48, 0x4a5a6a, 0x7a3a2a, 0x5a6a4a]), trim: pick([0x9e2430, 0xb8913f, 0x24427e]), pants: 0x3a3028, boots: 0x241c16, belt: 0x3a2618, dress: fem ? pick([0x6a5a48, 0x4a5a6a, 0x7a5a3a]) : null, dressLen: 0.86, dressFlare: 0.3, apron: fem && rand() < 0.5 ? 0xd8ccb0 : null };
    const p = new Person('Town' + i, name, look, V(start.x, start.z), { occ, zone }); p.mode = 'wander';
  });
  for (const id of ['Ulfhild', 'Grani']) PEOPLE[id].ch.setState('idle');
}

// ---------- flags, alignment and memory ----------
const flag = (k) => FLAGS[k] || 0;
function alignDelta(axis, v) {
  if (!v) return; ALIGN[axis] = clamp((ALIGN[axis] || 0) + v, 0, 100);
  const el = $('alignPop'); if (!el) return; const s = document.createElement('div'); s.className = 'apop ' + axis; s.textContent = `${v > 0 ? '+' : ''}${Math.round(v * 10) / 10} ${WIND_NAME[axis]}`; el.appendChild(s); setTimeout(() => s.remove(), 2600);
}
function setStage(n) {
  if (n <= QUEST.stage || QUEST.done) return; QUEST.stage = n; FLAGS.Q_DrownedOath = n;
  if (n === 3 && !flag('DO_AT_THING')) { FLAGS.DO_AT_THING = 1; setWeather('storm', true); }
  QUEST.log.push(STAGE_TEXT[n][0]); toast(`Journal updated: ${STAGE_TEXT[n][0]}`); sfx('quest'); placeForStage();
}
function evalCond(c, npc) {
  let r = true;
  switch (c.Type) {
    case 'FlagAtLeast': r = flag(c.Key) >= (c.Value ?? 1); break;
    case 'FlagBelow': r = flag(c.Key) < (c.Value ?? 1); break;
    case 'AlignmentAtLeast': r = (ALIGN[c.Axis] || 0) >= c.Value; break;
    case 'AlignmentBelow': r = (ALIGN[c.Axis] || 0) < c.Value; break;
    case 'OpinionAtLeast': r = ((c.Key ? PEOPLE[c.Key] : npc) || {}).opinion >= (c.Value ?? 1); break;
    case 'NPCAlive': r = !!(PEOPLE[c.Key] && PEOPLE[c.Key].alive); break;
    case 'NPCDead': r = !!(PEOPLE[c.Key] && !PEOPLE[c.Key].alive) || flag('DEAD_' + c.Key) > 0; break;
    case 'Remembers': r = !!(npc && npc.mem.has(c.Memory)); break;
    case 'WeatherIs': r = ENV.weather === (c.Weather === 'Thunderstorm' ? 'storm' : (c.Weather || '').toLowerCase()); break;
    case 'IsNight': r = isNight(); break;
    case 'SilverAtLeast': r = flag('SILVER') >= c.Value; break;
    default: r = true;
  }
  return c.bNot ? !r : r;
}
const allTrue = (cs, npc) => (cs || []).every((c) => evalCond(c, npc));
function applyEffect(e, npc) {
  const who = e.Key && PEOPLE[e.Key] ? PEOPLE[e.Key] : npc;
  switch (e.Type) {
    case 'SetFlag': FLAGS[e.Key] = e.Value ?? 1; break;
    case 'AddFlag': FLAGS[e.Key] = flag(e.Key) + (e.Value ?? 1); break;
    case 'Alignment': alignDelta(e.Axis, e.Value); break;
    case 'Opinion': if (who) who.opinion += e.Value; break;
    case 'Fear': if (who) who.fear += e.Value; break;
    case 'Trust': if (who) who.trust += e.Value; break;
    case 'Remember': if (who) who.mem.add(e.Memory); break;
    case 'FactionRep': REP[e.Key] = (REP[e.Key] || 0) + e.Value; break;
    case 'CompanionApproval': if (flag('PARTY_' + e.Key)) { FLAGS['APPROVAL_' + e.Key] = flag('APPROVAL_' + e.Key) + e.Value; toast(`${e.Key} ${e.Value > 0 ? 'approves' : 'disapproves'}.`); } break;
    case 'SetCompanion': FLAGS['COMPANION_' + e.Key] = 1; break;
    case 'SetQuestStage': setStage(e.Value); break;
    case 'CompleteQuest': completeQuest(e.Victim); break;
    case 'Silver': FLAGS.SILVER = flag('SILVER') + e.Value; break;
    case 'Event': scriptEvent(e.Key, npc); break;
    case 'Weather': setWeather('storm', true); break;
  }
}

// ---------- dialogue ----------
const GRAPHS = {};
function lineGraph(npc, lines) { return { Id: 'lines', Entries: [{ Node: 'L0', Conditions: [] }], Nodes: lines.map((t, i) => ({ Id: 'L' + i, Speaker: 'NPC', Line: t, Next: i < lines.length - 1 ? 'L' + (i + 1) : '' })) }; }
function speakerName(sp, npc) { if (!sp || sp === 'NPC') return npc.name; const p = PEOPLE[sp]; return p ? p.name : sp; }
function openGraph(npc, graph, startNode) {
  if (!graph) return;
  let id = startNode; if (!id) { const en = graph.Entries.find((e) => allTrue(e.Conditions, npc)); id = en ? en.Node : graph.Nodes[0].Id; }
  UI_STATE.dialog = { npc, graph, node: null, full: '', typed: 0, choices: [] };
  if (npc.ch) { npc.ch.play('talk', 3); } player.ch.play('talk', 2); sfx('greet');
  showNode(id);
}
function showNode(id) {
  const d = UI_STATE.dialog; if (!d) return;
  const n = d.graph.Nodes.find((q) => q.Id === id); if (!n) { closeDialog(); return; }
  d.node = n; for (const e of n.OnEnter || []) applyEffect(e, d.npc);
  if (!UI_STATE.dialog) return; // an effect closed it
  document.body.classList.add('dlg');
  $('dlgName').textContent = speakerName(n.Speaker, d.npc); d.full = n.Line; d.typed = 0; $('dlgText').textContent = ''; $('dialog').hidden = false;
  if (d.npc.ch && n.Speaker === 'NPC') d.npc.ch.play('talk', Math.min(4, 1 + n.Line.length / 40));
  d.choices = (n.Choices || []).map((c) => ({ c, ok: allTrue(c.Conditions, d.npc) })).filter((q) => q.ok || q.c.bShowWhenLocked);
  const box = $('dlgChoices'); box.innerHTML = '';
  d.choices.forEach((q, i) => {
    const b = document.createElement('button'); b.className = 'choice tone-' + (q.c.Tone || 'Neutral'); b.disabled = !q.ok;
    b.innerHTML = `<span class="ck">${i + 1}</span><span class="ti" aria-hidden="true">${TONE_ICON[q.c.Tone || 'Neutral']}</span><span class="ct"></span>${q.c.bPointOfNoReturn ? '<span class="pnr" title="No turning back">✦</span>' : ''}${q.ok ? '' : `<span class="lock">${q.c.RequirementHint || 'Locked'}</span>`}`;
    b.querySelector('.ct').textContent = q.c.Text;
    b.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); chooseOption(i); });
    box.appendChild(b);
  });
  box.hidden = !d.choices.length;
  $('dlgHint').textContent = d.choices.length ? (IS_TOUCH ? 'Tap a reply' : '1–' + d.choices.length + '  Reply') : n.Next ? 'E  Continue' : 'E  Close';
}
const TONE_ICON = { Neutral: '•', Oath: '⚖', Shadow: '☾', Rune: 'ᚱ', Crown: '♛', Threat: '⚔' };
function chooseOption(i) {
  const d = UI_STATE.dialog; if (!d) return; const q = d.choices[i]; if (!q || !q.ok) return;
  if (d.typed < d.full.length) { d.typed = d.full.length; $('dlgText').textContent = d.full; }
  sfx('choice');
  for (const e of q.c.Effects || []) applyEffect(e, d.npc);
  if (!UI_STATE.dialog) return;
  if (q.c.Next) showNode(q.c.Next); else { if (d.node.Id === 'T0') FEAST.t = Math.max(FEAST.t, 146); closeDialog(); }
}
function advanceDialog() {
  const d = UI_STATE.dialog; if (!d) return;
  if (d.typed < d.full.length) { d.typed = d.full.length; $('dlgText').textContent = d.full; return; }
  if (d.choices.length) return;
  if (d.node.Next) showNode(d.node.Next); else closeDialog();
}
function closeDialog() { document.body.classList.remove('dlg'); UI_STATE.dialog = null; $('dialog').hidden = true; $('dlgChoices').innerHTML = ''; }
function updateDialog(dt) {
  const d = UI_STATE.dialog; if (!d) return;
  if (d.typed < d.full.length) { d.typed = Math.min(d.full.length, d.typed + dt * 60); $('dlgText').textContent = d.full.slice(0, Math.floor(d.typed)); }
  if (d.npc && d.npc.pos && d.npc.pos.distanceTo(player.pos) > 7) closeDialog();
}
addEventListener('keydown', (e) => {
  if (!UI_STATE.started) return;
  if (UI_STATE.dialog && /^Digit[1-6]$/.test(e.code)) { chooseOption(+e.code.slice(5) - 1); e.preventDefault(); }
  else if (e.code === 'KeyJ' && !e.repeat) toggleJournal();
});

// ---------- who stands where, by quest stage ----------
function placeForStage() {
  const P = PEOPLE, s = QUEST.stage, hd = HALL.thingSpot;
  if (s >= 1 && s < 3) {
    if (P.Thorvald.alive && !P.Thorvald.gone) P.Thorvald.place(BOATHOUSE.meet.clone(), Math.PI / 2);
    if (P.Grani.alive && !P.Grani.gone && !flag('DO_MEETING_OVER')) P.Grani.place(BOATHOUSE.merchant.clone(), -Math.PI / 2);
  }
  if (s >= 3) {
    if (P.Eirik.alive) P.Eirik.place(V(hd.x - 1, hd.z - 1.5, HALL.floor + 1), Math.PI / 2);
    if (P.Thorvald.alive && !P.Thorvald.gone) P.Thorvald.place(V(hd.x + 1.5, hd.z - 3, HALL.floor + 1), 0);
    if (P.Sigrid.alive && !P.Sigrid.gone) P.Sigrid.place(V(hd.x + 1.5, hd.z + 2.5, HALL.floor + 1), Math.PI);
    if (P.Hild.alive && !P.Hild.gone) { P.Hild.idleAnim = 'idle'; P.Hild.place(V(HALL.hornPos.x + 1, HALL.hornPos.z + 1.2, HALL.floor + 1), Math.PI); }
    if (P.Grani.alive && !P.Grani.gone) P.Grani.hide();
    for (const n of NPCS) if (n.mode === 'wander' && n.zone === 'plateau' && rand() < 0.75) { n.mode = 'stay'; n.place(V(HALL.x + rr(-8, 12), HALL.z + rr(-4, 4), HALL.floor + 1), rr(0, TAU)); }
  }
}

// ---------- interactions ----------
let PROMPT_TARGET = null;
const behind = (n, maxD) => { const dx = player.pos.x - n.pos.x, dz = player.pos.z - n.pos.z, d = Math.hypot(dx, dz); if (d > maxD) return false; return Math.abs(angDiff(n.yaw, Math.atan2(dx, dz))) > 1.9; };
function findInteract() {
  const p = player.pos, fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
  let best = null, bs = 1e9;
  const consider = (pos, r, item, bonus = 0) => { const dx = pos.x - p.x, dz = pos.z - p.z, d = Math.hypot(dx, dz); if (d > r || Math.abs(pos.y - p.y) > 2.4) return; const s = d - 0.6 * (dx * fx + dz * fz) / (d || 1) - bonus; if (s < bs) { bs = s; best = item; } };
  const crouch = player.mode === 'crouch';
  const T = PEOPLE.Thorvald;
  if (T && T.alive && !T.gone && crouch && QUEST.stage >= 1 && !flag('DO_PROOF_VIAL') && !flag('DO_PICK_FAILED') && !QUEST.done && behind(T, 1.9)) return { label: 'Pickpocket the vial', pick: T };
  for (const n of NPCS) if (n.alive && !n.gone && n.ch.root.visible && !(crouch && n.killable && behind(n, 2.4))) consider(n.pos, 3.0, { label: `Talk to ${n.name.split(',')[0]}`, npc: n }, 1.2);
  if (crouch) for (const n of NPCS) if (n.alive && !n.gone && n.killable && behind(n, 2.4)) return { label: `Assassinate ${n.name.split(',')[0]} (Attack)`, none: true };
  if (crouch || !COMBAT.inFight) { const v = assassinTarget(); if (v && v.enemy) return { label: `Silent kill: ${v.enemy.T.name} (${IS_TOUCH ? '⚔' : 'Attack'})`, none: true }; }
  for (const it of INTERACT) if (!it.used) consider(it.pos, it.r, { label: it.label, it });
  if (QUEST.stage === 3 && !QUEST.done && !flag('DO_CUP_SWAPPED')) consider(HALL.hornPos, 2.6, { label: ENV.blackout > 0 ? 'Swap the oath-horn (dark!)' : 'Swap the horn (wait for the dark)', horn: true }, 3);
  if (!COMBAT.inFight) for (const s of SEATS) if (!s.taken && player.mode !== 'sit') consider(s.p, 1.6, { label: s.kind === 'throne' ? 'Sit in the high seat' : 'Sit down', seat: s });
  return best;
}
function interact() {
  if (UI_STATE.dialog) { advanceDialog(); return; }
  if (UI_STATE.saga || UI_STATE.journal) return;
  if (player.mode === 'sit') { standUp(); return; }
  const it = PROMPT_TARGET; if (!it || it.none) return;
  if (it.npc) talkTo(it.npc);
  else if (it.pick) tryPickpocket(it.pick);
  else if (it.horn) trySwap();
  else if (it.it) useThing(it.it);
  else if (it.seat) { const s = it.seat; s.taken = 'player'; player.seat = s; player.mode = 'sit'; sfx('sit'); if (s.kind === 'throne' && !flag('SAT_HIGH_SEAT')) { FLAGS.SAT_HIGH_SEAT = 1; alignDelta('Ambition', 4); toast('You sit in the jarl\'s high seat. Heads turn along the benches.'); } }
}
function talkTo(n) {
  player.yaw = Math.atan2(n.pos.x - player.pos.x, n.pos.z - player.pos.z);
  if (n.id === 'Thorvald') FLAGS.DO_PRIVATE = inRect(BOATHOUSE.inside, n.pos.x, n.pos.z, 3) && (flag('DO_MEETING_OVER') || !PEOPLE.Grani.alive || PEOPLE.Grani.gone || PEOPLE.Grani.pos.distanceTo(n.pos) > 10) && !NPCS.some((o) => o !== n && o !== PEOPLE.Grani && o.alive && !o.gone && o.mode !== 'follow' && o.pos.distanceTo(n.pos) < 8) ? 1 : 0;
  if (n.id === 'Eirik' && flag('DO_AT_THING') && !flag('DO_OUTCOME') && PEOPLE.Thorvald.alive && !PEOPLE.Thorvald.gone) { openGraph(n, GRAPHS.DLG_DrownedOath_Thorvald, 'T0'); return; }
  if (n.graph && GRAPHS[n.graph]) { openGraph(n, GRAPHS[n.graph]); return; }
  const first = n.name; openGraph(n, lineGraph(n, [`${ENV.hour < 12 && ENV.hour > 5 ? 'Morning' : 'Evening'}, raven. I'm ${first}, the ${n.occ}.`, TOWN_LINES[(NPCS.indexOf(n) + ENV.day) % TOWN_LINES.length]]));
}
function useThing(it) {
  if (it.id === 'offering') {
    const k = flag('OFFERINGS'); if (k >= 3) { toast('The stone is heaped with offerings. The gods have heard you.'); return; }
    FLAGS.OFFERINGS = k + 1; player.ch.play('bow', 1.8); sfx('rune'); alignDelta('Piety', 4); toast(['You pour mead on the oath-stone. A raven lands on its crown.', 'You cut your palm and mark the runes. The wind drops for a breath.', 'You lay an arm-ring on the stone. Thunder answers, far off.'][k]);
  } else if (it.id === 'camploot') {
    if (ENEMIES.some((e) => !e.dead && e.active && e.pos.distanceTo(it.pos) < 20)) { toast('Not with wolf-heads still standing guard.'); return; }
    it.used = true; FLAGS.SILVER = flag('SILVER') + 80; alignDelta('Ambition', 6); sfx('quest'); toast('Plunder: 80 silver, a jarl\'s arm-ring, and a Gullbrand Circle tally-stick.');
  }
}
function tryPickpocket(T) {
  const seen = NPCS.some((n) => n !== T && n.alive && !n.gone && n.pos.distanceTo(player.pos) < 6 && Math.abs(angDiff(n.yaw, Math.atan2(player.pos.x - n.pos.x, player.pos.z - n.pos.z))) < 1.1);
  const chance = clamp(0.5 + ENV.rain * 0.3 + (PEOPLE.Grani.pos.distanceTo(T.pos) < 4 ? 0.15 : 0) - (seen ? 0.35 : 0), 0.1, 0.95);
  player.ch.play('gesture', 0.8);
  if (FORCE.pick ?? Math.random() < chance) {
    FLAGS.DO_PROOF_VIAL = 1; FLAGS.DO_PROOF_COUNT = flag('DO_PROOF_COUNT') + 1; alignDelta('Cunning', 4); sfx('quest');
    toast(`You lift a little clay vial from his belt (${Math.round(chance * 100)}% chance). It smells of bitter almonds.`);
  } else {
    FLAGS.DO_PICK_FAILED = 1; FLAGS.DO_SUSPICION = flag('DO_SUSPICION') + 1; T.mem.add('Stole'); T.opinion -= 12; T.trust -= 15; alignDelta('Honor', -2);
    T.yaw = Math.atan2(player.pos.x - T.pos.x, player.pos.z - T.pos.z); T.ch.play('gesture', 1.5);
    toast('Thorvald catches your wrist. "Thief!" He will hide the vial where you cannot reach it.');
  }
}
function trySwap() {
  if (ENV.blackout <= 0) { toast('Too many eyes in the torchlight. Wait for the lightning to blow out the torches.'); return; }
  FLAGS.DO_CUP_SWAPPED = 1; alignDelta('Cunning', 6); sfx('rune'); player.ch.play('gesture', 0.8);
  const H = PEOPLE.Hild; if (H.alive && H.pos.distanceTo(player.pos) < 2.2 && Math.abs(angDiff(H.yaw, Math.atan2(player.pos.x - H.pos.x, player.pos.z - H.pos.z))) < 1) { FLAGS.HILD_SAW_SWAP = 1; PEOPLE.Hild.mem.add('SawSwap'); }
  toast('In the dark you swap the oath-horn for Thorvald\'s own cup. Nobody saw. You hope.');
}
const FORCE = {}; // test hooks

// ---------- stealth: overhearing the boathouse handoff ----------
const OVER = { t: 0, active: false, lines: ['"…the Circle wants it done at the toast. Sigrid first."', '"And my debts?" "Burned, the moment she drinks."', '"The horn passes through your daughter\'s hands. Make sure it\'s the right one."', '"Here. Seal it in the horn\'s lining. Tell no one."'] };
function updateOverhear(dt) {
  const T = PEOPLE.Thorvald, G = PEOPLE.Grani;
  OVER.active = QUEST.stage >= 1 && !QUEST.done && !flag('DO_MEETING_OVER') && T.alive && !T.gone && G.alive && !G.gone && T.pos.distanceTo(BOATHOUSE.meet) < 3 && G.pos.distanceTo(BOATHOUSE.merchant) < 3;
  if (!OVER.active) return;
  const d = Math.hypot(player.pos.x - BOATHOUSE.meet.x, player.pos.z - BOATHOUSE.meet.z), crouch = player.mode === 'crouch' || player.mode === 'lie';
  const guardsAlerted = (COMBAT.boatGuards || []).some((e) => e.aggro && !e.dead);
  if (d < 6 && !crouch && !guardsAlerted) { endMeeting(false); toast('Thorvald sees you. "Who\'s there? Grani, go!" The merchant hurries off.'); FLAGS.DO_SUSPICION = flag('DO_SUSPICION') + 1; return; }
  if (guardsAlerted && d < 25) { endMeeting(false); toast('Shouts outside! Grani bolts from the boathouse.'); return; }
  if (d < 9.5 && crouch) {
    const before = Math.floor(OVER.t / 2.4); OVER.t += dt * (1 + ENV.rain * 0.3) * (FORCE.listenRate || 1); const now = Math.floor(OVER.t / 2.4);
    if (now !== before && now <= OVER.lines.length) toast(OVER.lines[now - 1]);
    if (OVER.t >= 2.4 * OVER.lines.length + 0.8) { FLAGS.DO_PROOF_LETTER = 1; FLAGS.DO_LEAD_MERCHANT = 1; FLAGS.DO_PROOF_COUNT = flag('DO_PROOF_COUNT') + 1; alignDelta('Cunning', 4); endMeeting(true); toast('You heard everything: the Circle paid Thorvald to poison the oath-horn.'); sfx('quest'); }
  }
}
function endMeeting(heard) {
  FLAGS.DO_MEETING_OVER = 1; const G = PEOPLE.Grani; if (!G.alive || G.gone) return;
  G.anchor.set(-60, groundAt(-60, 146, 5), 146); G.target = G.anchor.clone(); G.walkT = 0; setTimeout(() => { if (G.alive && G.pos.distanceTo(player.pos) > 20) G.hide(); }, 40000);
  if (!heard) PEOPLE.Thorvald.anchorYaw = 0;
}

// ---------- assassination of people ----------
function npcAssassinTarget() {
  if (player.mode !== 'crouch') return null;
  for (const n of NPCS) if (n.alive && !n.gone && n.killable && behind(n, 2.4)) return n;
  return null;
}
function witnesses(victim) { return NPCS.filter((n) => n !== victim && n.alive && !n.gone && n.pos.distanceTo(victim.pos) < 22 * ENV_VIS() && lineOfSight(new THREE.Vector3(n.pos.x, n.pos.y + 1.6, n.pos.z), new THREE.Vector3(victim.pos.x, victim.pos.y + 1.0, victim.pos.z))); }
function npcAssassinated(n) {
  const seen = witnesses(n); n.die(); dmgNumber(n.pos.clone().add(_v.set(0, 2, 0)), 'Silent kill', 'crit');
  for (const w of seen) { w.mem.add('Killed'); w.opinion -= 25; w.fear += 30; }
  if (seen.length) toast(`${seen[0].name.split(',')[0]} saw it.`);
  if (n.id === 'Thorvald') killThorvald('blade', seen);
  else if (n.id === 'Grani') { if (!flag('DO_PROOF_LETTER')) { FLAGS.DO_PROOF_LETTER = 1; FLAGS.DO_PROOF_COUNT = flag('DO_PROOF_COUNT') + 1; } FLAGS.DO_MEETING_OVER = 1; toast('On the merchant you find a letter sealed with the Gullbrand Circle\'s mark: payment for "the horn".'); alignDelta('Honor', -3); }
}
function killThorvald(how, seen = []) {
  const T = PEOPLE.Thorvald; if (T.alive) T.die();
  if (how === 'blade' && (seen.some((w) => w.id === 'Hild') || PEOPLE.Hild.pos.distanceTo(T.pos) < 8)) PEOPLE.Hild.mem.add('Killed');
  if (!flag('DO_OUTCOME') && !QUEST.done) { FLAGS.DO_OUTCOME = 7; FLAGS.CLANS_UNITED = 1; FLAGS.FLEET_SIZE = 10; FLAGS.HILD_FATE = 2; alignDelta('Honor', -11); alignDelta('Cunning', 4); completeQuest('Assassinated'); }
}
function onEnemyKilled(e) {
  FLAGS.KILLS = flag('KILLS') + 1;
  if (e === COMBAT.champion) { HOLM.active = false; COMBAT.boss = null; killThorvald('duel'); PEOPLE.Thorvald.gone = false; PEOPLE.Thorvald.pos.copy(e.pos); PEOPLE.Thorvald.alive = false; toast('Thorvald falls in the holmgang ring. The law is satisfied.'); alignDelta('Honor', 4); }
  else if (e.type === 'berserker') { alignDelta('Ambition', 4); toast('The berserker falls. Your name will be shouted in the hall tonight.'); }
  else alignDelta('Ambition', 1);
}

// ---------- scripted events (DrownedOath_*) ----------
const HOLM = { active: false };
function fade(ms, text, mid) { const f = $('fade'); f.textContent = text || ''; f.classList.add('on'); setTimeout(() => { if (mid) mid(); setTimeout(() => f.classList.remove('on'), 250); }, ms); }
function scriptEvent(key, npc) {
  const P = PEOPLE;
  switch (key) {
    case 'DrownedOath_DrownThorvald': setTimeout(() => fade(1600, 'The fjord keeps no oaths.', () => { if (P.Hild.pos.distanceTo(P.Thorvald.pos) < 25) P.Hild.mem.add('Killed'); P.Thorvald.die(); P.Thorvald.hide(); sfx('splash'); }), 400); break;
    case 'DrownedOath_ThorvaldFlees': setTimeout(() => fade(1400, 'A skiff slips out under the north rocks.', () => { P.Thorvald.hide(); FLAGS.DEAD_Thorvald = 0; }), 400); break;
    case 'DrownedOath_Holmgang': setTimeout(() => startHolmgang(), 600); break;
    case 'DrownedOath_HildJoinsSettlement': toast('Hild will sail with you to Hrafnssted.'); break;
    case 'DrownedOath_LightningOathStone': lightningStrike(STONE.top.clone(), true); setTimeout(() => splitStone(), 120); break;
    case 'DrownedOath_SigridLeaves': setTimeout(() => fade(1400, 'The Ylfing ships leave on the tide.', () => { P.Sigrid.hide(); scheduleAmbush(); }), 500); break;
    case 'DrownedOath_LetPoisonWork': setTimeout(() => feastToast(), 1200); break;
    case 'DrownedOath_CarryCasks': setTimeout(() => fade(1500, 'You haul the mead casks up the cliff stairs in the rain.', () => { P.Hild.opinion += 25; P.Hild.trust += 10; alignDelta('Honor', 2); }), 300); break;
    case 'DrownedOath_CallThing': setWeather('storm', true); setTimeout(() => fade(1500, 'Eirik calls the thing. The clans crowd into the stave hall.', () => { placeForStage(); }), 300); break;
    case 'Ulfhild_Join': P.Ulfhild.mode = 'follow'; break;
    case 'Ulfhild_Wait': P.Ulfhild.place(V(STONE.x + 4, STONE.z - 3), -Math.PI / 2); break;
  }
}
function splitStone() {
  const m = STONE.mesh; if (!m || STONE.split) return; STONE.split = true;
  const half = m.clone(); scene.add(half); m.rotation.z = 0.22; half.rotation.z = -0.22; m.position.x -= 0.35; half.position.x += 0.35; m.scale.x = half.scale.x = 0.55;
}
function startHolmgang() {
  const T = PEOPLE.Thorvald, c = COMBAT.champion; if (!T.alive || !c) return;
  fade(1300, 'Holmgang. The ring is marked with hazel rods around the oath-stone.', () => {
    T.hide(); HOLM.active = true; c.active = true; c.dead = false; c.hp = c.maxHp; c.pos.set(STONE.x, 0, STONE.z + 9); c.pos.y = groundAt(c.pos.x, c.pos.z, 99); c.spawn.copy(c.pos); c.ch.root.visible = true; c.aggro = true; c.aware = 1; COMBAT.boss = c;
    window.__game.teleport(STONE.x, STONE.z - 7); player.yaw = 0; cam.yaw = Math.PI; setWeather('storm', true);
    for (const n of NPCS) if (n.alive && !n.gone && n.id !== 'Ulfhild' && (n.zone === 'plateau' || ['Eirik', 'Sigrid', 'Hild'].includes(n.id))) { const a = rand() * TAU; n.place(V(STONE.x + Math.cos(a) * 15, STONE.z + Math.sin(a) * 15), a + Math.PI); n.pos.copy(n.anchor); }
  });
}
function holmgangRespawn() { if (!HOLM.active) return false; const c = COMBAT.champion; c.hp = c.maxHp; c.pos.copy(c.spawn); window.__game.teleport(STONE.x, STONE.z - 7); toast('You rise in the ring. Thorvald waits. The duel is not over.'); return true; }
function scheduleAmbush() {
  setTimeout(() => {
    const a = player.yaw + Math.PI; toast('Circle cutthroats! They followed you out of the hall.');
    for (let i = 0; i < 3; i++) { const x = player.pos.x + Math.sin(a + i * 0.5 - 0.5) * 14, z = player.pos.z + Math.cos(a + i * 0.5 - 0.5) * 14; const e = new Enemy('cutthroat', new THREE.Vector3(x, groundAt(x, z, player.pos.y + 6), z)); e.alertNow(); }
  }, 25000);
}
function feastToast() {
  if (FEAST.done) return; FEAST.done = true; const P = PEOPLE;
  toast('Thunder rolls. Hild raises the oath-horn: "To one fleet and one fjord!"'); if (P.Hild.alive) P.Hild.ch.play('gesture', 2);
  setTimeout(() => {
    if (flag('DO_CUP_SWAPPED') && P.Thorvald.alive) {
      P.Thorvald.die(); FLAGS.DO_OUTCOME = 6; FLAGS.CLANS_UNITED = 1; FLAGS.FLEET_SIZE = 12; FLAGS.BJORN_WARLEADER = 0; FLAGS.HILD_FATE = flag('HILD_SAW_SWAP') ? 4 : 2; alignDelta('Cunning', 6);
      toast('Thorvald drinks from his own cup, clutches his throat and falls. "The gods have judged him!"'); QUEST.done = false; completeQuest('Swapped', true);
    } else {
      if (P.Sigrid.alive && !P.Sigrid.gone) P.Sigrid.die(); FLAGS.DEAD_Sigrid = 1;
      toast('Sigrid drinks first. She coughs, staggers, and falls among the benches. Ylfing swords come out.');
      if (!flag('DO_OUTCOME')) { FLAGS.DO_OUTCOME = 5; FLAGS.DO_PASSIVE = 1; FLAGS.CLANS_UNITED = 0; FLAGS.FLEET_SIZE = 6; FLAGS.HILD_FATE = 4; completeQuest('Poisoned'); }
    }
  }, 3200);
}
const FEAST = { t: 0, done: false };
function updateQuestLogic(dt) {
  if (QUEST.stage === 1 && flag('DO_PROOF_COUNT') >= 1) setStage(2);
  if (QUEST.stage >= 1 && QUEST.stage < 2 && flag('DO_LEAD_MERCHANT') && flag('DO_PROOF_COUNT') >= 1) setStage(2);
  updateOverhear(dt);
  if (QUEST.stage === 3 && !QUEST.done && !FEAST.done && !flag('DO_OUTCOME')) {
    if (inRect({ x0: HALL.x - HALL.w / 2, x1: HALL.x + HALL.w / 2, z0: HALL.z - HALL.d / 2, z1: HALL.z + HALL.d / 2 }, player.pos.x, player.pos.z, 1)) FEAST.t += dt;
    if (FEAST.t > 150 && !UI_STATE.dialog) feastToast();
  }
  if (QUEST.pendingSaga && !UI_STATE.dialog && !HOLM.active && !$('fade').classList.contains('on')) { QUEST.sagaDelay = (QUEST.sagaDelay || 0) + dt; if (QUEST.sagaDelay > (FORCE.fastSaga ? 0.1 : 4)) showSaga(); }
}
function completeQuest(name, force) {
  if (QUEST.done && !force) return; QUEST.done = true; QUEST.outcome = name; QUEST.pendingSaga = true; QUEST.sagaDelay = 0;
  QUEST.log.push(`Resolved: ${OUTCOMES[name] ? OUTCOMES[name][0] : name}.`);
}
// the saga card and the dawn epilogue
function showSaga() {
  QUEST.pendingSaga = false; QUEST.sagaShown = true; UI_STATE.saga = true; if (document.pointerLockElement) document.exitPointerLock();
  const o = OUTCOMES[QUEST.outcome] || [QUEST.outcome, ''];
  $('sagaTitle').textContent = o[0]; $('sagaText').textContent = o[1];
  const hild = ['Unharmed', 'Free; sails with you', 'Grieving her father', 'Left with her father\'s debts', 'Vows revenge on the raven'][flag('HILD_FATE')] || 'Unharmed';
  $('sagaFacts').innerHTML = '';
  for (const [k, v] of [['The clans', flag('CLANS_UNITED') ? 'United' : 'Divided'], ['Ships that sail with you', String(flag('FLEET_SIZE'))], ['Thorvald', !PEOPLE.Thorvald.alive ? 'Dead' : PEOPLE.Thorvald.gone ? 'Gone west' : 'Alive'], ['Hild', hild]]) { const li = document.createElement('li'); li.innerHTML = '<b></b><span></span>'; li.querySelector('b').textContent = k; li.querySelector('span').textContent = v; $('sagaFacts').appendChild(li); }
  renderWinds($('sagaWinds'));
  $('saga').hidden = false; sfx('saga');
}
function closeSaga() {
  if (!UI_STATE.saga) return; UI_STATE.saga = false; $('saga').hidden = true;
  fade(1600, flag('CLANS_UNITED') ? 'Before dawn the sky over Valdrheim burns green.' : 'Fog comes in off the fjord.', () => {
    ENV.hour = 4.6; ENV.day++; ENV.rain = 0; ENV.storm = 0; if (flag('CLANS_UNITED')) { ENV.auroraUntil = 7; setWeather('clear', true); } else setWeather('fog', true);
    if (UI_STATE.started && !IS_TOUCH) try { canvasEl.requestPointerLock(); } catch (e) { /* ignore */ }
  });
}
function renderWinds(el) {
  el.innerHTML = '';
  for (const ax of ['Honor', 'Cunning', 'Piety', 'Ambition']) { const r = document.createElement('div'); r.className = 'wind ' + ax; r.innerHTML = `<span class="wn">${TONE_ICON[{ Honor: 'Oath', Cunning: 'Shadow', Piety: 'Rune', Ambition: 'Crown' }[ax]]} ${WIND_NAME[ax]}</span><span class="wb"><i style="width:${ALIGN[ax]}%"></i></span><span class="wv">${Math.round(ALIGN[ax])}</span>`; el.appendChild(r); }
}
function toggleJournal() {
  if (UI_STATE.saga) return; UI_STATE.journal = !UI_STATE.journal; $('journal').hidden = !UI_STATE.journal;
  if (!UI_STATE.journal) return; if (document.pointerLockElement) document.exitPointerLock();
  const st = QUEST.done ? ['Saga told: ' + (OUTCOMES[QUEST.outcome] || [QUEST.outcome])[0], 'Wolf-heads still haunt the west wood. The fjord is yours to roam.'] : STAGE_TEXT[QUEST.stage];
  $('jObjective').textContent = st[0]; $('jHint').textContent = st[1];
  const clues = [];
  if (flag('DO_KNOWS_CUP_ORDER')) clues.push('Sigrid drinks first from the horn, then Eirik. Hild carries it.');
  if (flag('DO_LEAD_MERCHANT')) clues.push('A Hedeby merchant, Grani, meets Thorvald in the boathouse.');
  if (flag('DO_PROOF_LETTER')) clues.push('Proof: the Gullbrand Circle paid Thorvald to poison the horn.');
  if (flag('DO_PROOF_VIAL')) clues.push('Proof: Thorvald\'s vial of poison.');
  if (flag('DO_HILD_TESTIMONY')) clues.push('Proof: Hild saw her father with the vial and will say so.');
  if (flag('DO_PICK_FAILED')) clues.push('Thorvald caught you stealing. The vial is hidden in the horn\'s lining.');
  if (flag('PARTY_Ulfhild')) clues.push('Ulfhild the völva walks with you.');
  if (flag('DO_CUP_SWAPPED')) clues.push('You swapped the oath-horn for Thorvald\'s cup.');
  $('jClues').innerHTML = ''; for (const c of clues.length ? clues : ['Nothing yet. Ask around Valdrheim.']) { const li = document.createElement('li'); li.textContent = c; $('jClues').appendChild(li); }
  $('jProof').textContent = `Proof gathered: ${flag('DO_PROOF_COUNT')} · Silver: ${flag('SILVER')}`;
  renderWinds($('jWinds'));
}
function questTarget() {
  if (QUEST.done) return null; const P = PEOPLE;
  if (QUEST.stage === 0) return P.Eirik.pos;
  if (QUEST.stage === 1) return OVER.active ? BOATHOUSE.meet : P.Hild.alive ? P.Hild.pos : BOATHOUSE.meet;
  if (QUEST.stage === 2) return P.Thorvald.alive && !P.Thorvald.gone ? P.Thorvald.pos : P.Eirik.pos;
  return HALL.thingSpot;
}

// ---------- authored graphs for Eirik, Sigrid, Ulfhild and Grani (same schema as the Unreal JSON) ----------
const C_ = (Type, Key, Value, extra = {}) => ({ Type, Key, Value, ...extra });
GRAPHS.Eirik = { Id: 'Eirik', Entries: [
  { Node: 'E_DONE', Conditions: [C_('FlagAtLeast', 'DO_OUTCOME', 1)] },
  { Node: 'E_READY', Conditions: [C_('FlagAtLeast', 'Q_DrownedOath', 1), C_('FlagBelow', 'DO_AT_THING', 1)] },
  { Node: 'E0', Conditions: [] }],
  Nodes: [
    { Id: 'E0', Speaker: 'NPC', Line: 'Bjorn Vargrsson! Hrafnsson\'s raven comes in on the storm. Sigrid of the Ylfings has brought twenty ships, and tonight we swear one fleet on the oath-horn. But my lawspeaker Thorvald hasn\'t slept since a Hedeby merchant tied up in the harbour. Keep your eyes open for me.', OnEnter: [C_('SetQuestStage', 'DrownedOath', 1)],
      Choices: [
        { Text: 'I\'ll watch the lawspeaker. Quietly.', Tone: 'Oath', Next: 'E_OATH', Effects: [{ Type: 'Alignment', Axis: 'Honor', Value: 2 }, C_('Opinion', null, 5)] },
        { Text: 'A jarl\'s share of that fleet, and I\'ll find your rat.', Tone: 'Crown', Next: 'E_CROWN', Effects: [{ Type: 'Alignment', Axis: 'Ambition', Value: 8 }, C_('Opinion', null, -5)] },
        { Text: 'Where is Thorvald now?', Tone: 'Neutral', Next: 'E_WHERE' }] },
    { Id: 'E_OATH', Speaker: 'NPC', Line: 'Good. Your word is worth more than most men\'s silver.', Next: 'E_WHERE' },
    { Id: 'E_CROWN', Speaker: 'NPC', Line: 'Ha! The raven wants to be an eagle. Find me the truth and we will talk about ships.', Next: 'E_WHERE' },
    { Id: 'E_WHERE', Speaker: 'NPC', Line: 'Down at the boathouse in the harbour, he says, counting casks with his daughter Hild. Take the cliff stairs west of the hall. When you are ready, come back and I will call the thing.', Next: '' },
    { Id: 'E_READY', Speaker: 'NPC', Line: 'Well, raven? The clans grow restless. Say the word and I call the thing. Once the horn goes round, there is no unsaying anything.',
      Choices: [
        { Text: 'Call the thing. I\'m ready.', Tone: 'Oath', Next: 'E_CALL', bPointOfNoReturn: true },
        { Text: 'Tell me about Sigrid.', Tone: 'Neutral', Next: 'E_SIGRID' },
        { Text: 'Not yet.', Tone: 'Neutral', Next: '' }] },
    { Id: 'E_SIGRID', Speaker: 'NPC', Line: 'Proud, sharp, and quick to take offence. If anything goes wrong at the feast, her ships leave on the tide and they will not come back.', Next: 'E_READY' },
    { Id: 'E_CALL', Speaker: 'NPC', Line: 'Then let the gods listen. Ring the hall bell! The thing is called!', OnEnter: [C_('SetFlag', 'DO_AT_THING', 1), C_('SetQuestStage', 'DrownedOath', 3), C_('Event', 'DrownedOath_CallThing')], Next: '' },
    { Id: 'E_DONE', Speaker: 'NPC', Line: 'The night is told and done, raven. The skalds will argue for a hundred winters about what you did in my hall.', Next: '' }] };
GRAPHS.Sigrid = { Id: 'Sigrid', Entries: [{ Node: 'S_AFTER', Conditions: [C_('FlagAtLeast', 'DO_OUTCOME', 1)] }, { Node: 'S0', Conditions: [] }], Nodes: [
  { Id: 'S0', Speaker: 'NPC', Line: 'Sigrid of the Ylfings. I came with twenty ships and a long memory. If Eirik\'s oath is rotten, I will smell it before I drink it.',
    Choices: [{ Text: 'Your ships are safe in this fjord. I\'ll see to it.', Tone: 'Oath', Next: 'S_SAFE', Effects: [C_('Opinion', null, 8), { Type: 'Alignment', Axis: 'Honor', Value: 1 }] }, { Text: 'Twenty ships. Imagine what one man could do with them.', Tone: 'Crown', Next: 'S_CROWN', Effects: [{ Type: 'Alignment', Axis: 'Ambition', Value: 3 }, C_('Opinion', null, -4)] }, { Text: 'Fair winds, jarl.', Tone: 'Neutral', Next: '' }] },
  { Id: 'S_SAFE', Speaker: 'NPC', Line: 'Brave words. We will see if they float.', Next: '' },
  { Id: 'S_CROWN', Speaker: 'NPC', Line: 'Careful, raven. Ambitious men drown in this fjord every winter.', Next: '' },
  { Id: 'S_AFTER', Speaker: 'NPC', Line: 'So. Now I know what Valdrheim\'s oaths are worth.', Next: '' }] };
GRAPHS.Ulfhild = { Id: 'Ulfhild', Entries: [{ Node: 'U_PARTY', Conditions: [C_('FlagAtLeast', 'PARTY_Ulfhild', 1)] }, { Node: 'U0', Conditions: [] }], Nodes: [
  { Id: 'U0', Speaker: 'NPC', Line: 'Ulfhild, who reads the threads. Three ravens sat on the oath-stone at noon, raven-son, and the third one was blind. Let me walk with you tonight.',
    Choices: [{ Text: 'Walk with me, seeress.', Tone: 'Rune', Next: 'U_JOIN', Effects: [C_('SetFlag', 'PARTY_Ulfhild', 1), { Type: 'Alignment', Axis: 'Piety', Value: 3 }] }, { Text: 'I trust steel, not birds.', Tone: 'Neutral', Next: 'U_NO' }] },
  { Id: 'U_JOIN', Speaker: 'NPC', Line: 'Good. The gods like to watch you. Feed them at the stone, and they may answer when you need it.', OnEnter: [C_('Event', 'Ulfhild_Join')], Next: '' },
  { Id: 'U_NO', Speaker: 'NPC', Line: 'Steel breaks. Birds remember. I will be here.', Next: '' },
  { Id: 'U_PARTY', Speaker: 'NPC', Line: 'The storm is thick with omens tonight. What do you need?',
    Choices: [{ Text: 'Read the threads for me.', Tone: 'Rune', Next: 'U_READ', Conditions: [C_('FlagBelow', 'U_READ', 1)] }, { Text: 'Wait for me at the stone.', Tone: 'Neutral', Next: 'U_WAIT', Effects: [C_('SetFlag', 'PARTY_Ulfhild', 0)] }, { Text: 'Walk on.', Tone: 'Neutral', Next: '' }] },
  { Id: 'U_READ', Speaker: 'NPC', Line: 'I see a horn that is two horns, and a stone split by fire. The man with the grey beard has bitter almonds on his breath. Ask him in the dark, where no one else listens.', OnEnter: [C_('SetFlag', 'U_READ', 1), { Type: 'Alignment', Axis: 'Piety', Value: 3 }, C_('AddFlag', 'DO_SUSPICION', 1)], Next: '' },
  { Id: 'U_WAIT', Speaker: 'NPC', Line: 'The stone and I will keep each other company.', OnEnter: [C_('Event', 'Ulfhild_Wait')], Next: '' }] };
GRAPHS.Grani = { Id: 'Grani', Entries: [{ Node: 'M0', Conditions: [] }], Nodes: [
  { Id: 'M0', Speaker: 'NPC', Line: 'Grani of Hedeby. Amber, silk, Frankish glass. Nothing a northman can afford.',
    Choices: [{ Text: 'Who are you meeting in the boathouse?', Tone: 'Threat', Next: 'M_THREAT', Effects: [C_('AddFlag', 'DO_SUSPICION', 1), C_('SetFlag', 'DO_LEAD_MERCHANT', 1), C_('Fear', null, 10)] }, { Text: '[Bribe, 20 silver] Tell me what you sell the lawspeaker.', Tone: 'Crown', Next: 'M_BRIBE', Conditions: [C_('SilverAtLeast', null, 20)], bShowWhenLocked: true, RequirementHint: 'Requires 20 silver', Effects: [C_('Silver', null, -20), C_('SetFlag', 'DO_LEAD_MERCHANT', 1), { Type: 'Alignment', Axis: 'Ambition', Value: 2 }] }, { Text: 'Safe travels.', Tone: 'Neutral', Next: '' }] },
  { Id: 'M_THREAT', Speaker: 'NPC', Line: 'Nobody! Business is business. Go and drink your mead, raven.', Next: '' },
  { Id: 'M_BRIBE', Speaker: 'NPC', Line: 'Silver loosens the tongue. A little remedy for his sleeplessness. From friends in the east. That is all I say, even for silver.', Next: '' }] };
for (const [k, g] of Object.entries(DLG_DATA)) GRAPHS[k] = g;
