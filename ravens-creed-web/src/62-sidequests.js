// ===== Side quests: "Wolves at the Door" (Ivar) and "Feathers for the Völva" (Ulfhild, teaches Raven Sight) =====
const SIDE = { track: 'main', feathers: [], givers: [] };
const SQ_NAMES = { wolves: 'Wolves at the Door', feathers: 'Feathers for the Völva' };
function sqState(q) { return flag(q === 'wolves' ? 'SQ_WOLVES' : 'SQ_FEATHERS'); }
function wolvesObjectives() {
  return [['Find the wolf-head camp in the western wood', flag('SQ_W_CAMP')], ['Defeat their chief, Hrolf the Red', flag('SQ_W_HROLF')], ['Recover the stolen arm-ring from their plunder', flag('SQ_W_RING')], ['Return the arm-ring to Ivar at the hall door', flag('SQ_WOLVES') >= 2]];
}
function feathersObjectives() {
  const n = flag('SQ_FEATHERS_GOT');
  return [[`Collect raven feathers from the high places (${n}/3)`, n >= 3], ['Bring the feathers to Ulfhild', flag('SQ_FEATHERS') >= 2]];
}
const sqObjectives = (q) => (q === 'wolves' ? wolvesObjectives() : feathersObjectives());
function sqCurrent(q) { const o = sqObjectives(q).find((x) => !x[1]); return o ? o[0] : 'Done'; }

// ---------- climbing routes for the feathers ----------
function buildClimbs() {
  const b = BATCH.misc;
  // harbour cargo stack: three steps of crates
  const hx = -160, hz = 78, hg = terrainH(hx, hz);
  for (let i = 0; i < 3; i++) for (let j = 0; j <= i; j++) B(b, MAT.lightWood, hx + i * 1.45, hg + j * 1.3, hz, 1.4, 1.3, 1.4, 0.04 * (j - i), true);
  SIDE.featherSpots = [[hx + 2.9, hg + 3.9 + 1.0, hz]];
  // plateau cairn: stepped standing stones
  const cx = 118, cz = -64, cg = terrainH(cx, cz);
  [[0, 1.5, 2.2], [1.9, 3.0, 2.0], [3.6, 4.5, 1.8]].forEach(([dx, h, s], i) => B(b, MATS.stone, cx + dx, cg - 0.3, cz + i * 0.2, s, h + 0.3, s, 0.1 * i, true));
  SIDE.featherSpots.push([cx + 3.6, cg + 4.5 + 1.0, cz + 0.4]);
  // watchtower platform, beside the brazier
  const ty = groundAt(TOWER.x + 1.9, TOWER.z, TOWER.top.y + 1); SIDE.featherSpots.push([TOWER.x + 1.9, ty + 1.0, TOWER.z]);
}
function featherTexture() {
  const c = makeCanvas(128), g = c.getContext('2d');
  g.translate(64, 64); g.rotate(-0.6);
  const grd = g.createLinearGradient(0, -50, 0, 50); grd.addColorStop(0, '#1b1d24'); grd.addColorStop(1, '#3a3f52');
  g.fillStyle = grd; g.beginPath(); g.moveTo(0, -54); g.quadraticCurveTo(22, -10, 6, 46); g.lineTo(-6, 46); g.quadraticCurveTo(-22, -10, 0, -54); g.fill();
  g.strokeStyle = '#d9b860'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(0, -50); g.lineTo(0, 58); g.stroke();
  g.strokeStyle = 'rgba(160,180,255,0.35)'; g.lineWidth = 1; for (let y = -40; y < 40; y += 6) { g.beginPath(); g.moveTo(0, y); g.lineTo(14 - Math.abs(y) * 0.12, y - 8); g.moveTo(0, y); g.lineTo(-14 + Math.abs(y) * 0.12, y - 8); g.stroke(); }
  return toTex(c, true, false);
}
function setupSideQuests() {
  // Ivar becomes the hall-guard posted at the hall door
  const iv = PEOPLE.Town9; if (iv) { iv.name = 'Ivar the hall-guard'; iv.graph = 'Ivar'; iv.mode = 'stay'; iv.place(V(HALL.x + HALL.w / 2 + 2.5, HALL.z - 4), Math.PI / 2); iv.pos.copy(iv.anchor); PEOPLE.Ivar = iv; }
  const tex = featherTexture();
  for (const [x, y, z] of SIDE.featherSpots) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })); s.scale.set(0.7, 0.7, 1);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color: 0xffd27a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); glow.scale.setScalar(1.8);
    const grp = new THREE.Group(); grp.add(glow, s); grp.position.set(x, y, z); grp.visible = false; scene.add(grp);
    SIDE.feathers.push({ grp, glow, base: y, got: false });
  }
  for (const id of ['Ivar', 'Ulfhild']) { const el = document.createElement('div'); el.className = 'qgiver'; el.hidden = true; $('ebars').appendChild(el); SIDE.givers.push({ id, el }); }
}
function updateSideQuests(dt) {
  if (!SIDE.feathers.length) return;
  if (!flag('SQ_W_CAMP') && Math.hypot(player.pos.x - CAMP.x, player.pos.z - CAMP.z) < 35) { FLAGS.SQ_W_CAMP = 1; if (flag('SQ_WOLVES') === 1) toast('The wolf-head camp. Smoke, bones, and a big man with red hair.'); }
  const active = flag('SQ_FEATHERS') === 1;
  for (const f of SIDE.feathers) {
    f.grp.visible = active && !f.got; if (!f.grp.visible) continue;
    f.grp.position.y = f.base + Math.sin(COMBAT.now * 2 + f.base) * 0.15; f.glow.material.opacity = 0.55 + 0.35 * Math.sin(COMBAT.now * 3) + (RAVEN.t > 0 ? 0.5 : 0);
    if (f.grp.position.distanceTo(_v.set(player.pos.x, player.pos.y + 1, player.pos.z)) < 1.8) {
      f.got = true; FLAGS.SQ_FEATHERS_GOT = flag('SQ_FEATHERS_GOT') + 1; sfx('feather'); sparks(f.grp.position, 20, [1, 0.85, 0.45]);
      toast(flag('SQ_FEATHERS_GOT') >= 3 ? 'Three raven feathers. Take them to Ulfhild.' : `A raven feather (${flag('SQ_FEATHERS_GOT')}/3).`);
    }
  }
  // quest-giver markers
  for (const g of SIDE.givers) {
    const n = PEOPLE[g.id]; let mark = '';
    if (g.id === 'Ivar') mark = !flag('SQ_WOLVES') ? '!' : flag('SQ_WOLVES') === 1 && flag('SQ_W_RING') ? '?' : '';
    else mark = !flag('SQ_FEATHERS') ? '!' : flag('SQ_FEATHERS') === 1 && flag('SQ_FEATHERS_GOT') >= 3 ? '?' : '';
    if (!n || !n.alive || n.gone || !mark || n.pos.distanceTo(player.pos) > 60 || UI_STATE.dialog) { g.el.hidden = true; continue; }
    const s = project(_v.set(n.pos.x, n.visY + 2.35, n.pos.z)); if (!s.on) { g.el.hidden = true; continue; }
    g.el.hidden = false; g.el.textContent = mark; g.el.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -50%)`;
  }
}
function sideTarget(q) {
  if (q === 'wolves' && flag('SQ_WOLVES') === 1) {
    if (!flag('SQ_W_CAMP')) return new THREE.Vector3(CAMP.x, 0, CAMP.z);
    if (!flag('SQ_W_HROLF')) { const b = ENEMIES.find((e) => e.type === 'berserker'); return b ? b.pos : new THREE.Vector3(CAMP.x, 0, CAMP.z); }
    if (!flag('SQ_W_RING')) { const it = INTERACT.find((i) => i.id === 'camploot'); return it ? it.pos : null; }
    return PEOPLE.Ivar ? PEOPLE.Ivar.pos : null;
  }
  if (q === 'feathers' && flag('SQ_FEATHERS') === 1) {
    if (flag('SQ_FEATHERS_GOT') >= 3) return PEOPLE.Ulfhild.pos;
    let best = null, bd = 1e9; for (const f of SIDE.feathers) if (!f.got) { const d = f.grp.position.distanceTo(player.pos); if (d < bd) { bd = d; best = f.grp.position; } } return best;
  }
  return null;
}
const _questTargetSide = questTarget;
questTarget = function () {
  if (SIDE.track !== 'main') { const t = sideTarget(SIDE.track); if (t) return t; }
  return _questTargetSide() || sideTarget('wolves') || sideTarget('feathers');
};
// hooks into the existing systems
const _scriptEventSide = scriptEvent;
scriptEvent = function (key, npc) {
  if (key === 'SQ_Start_Wolves') { FLAGS.SQ_WOLVES = 1; SIDE.track = 'wolves'; QUEST.log.push('Started: Wolves at the Door.'); toast('New quest: Wolves at the Door'); sfx('quest'); if (flag('SQ_W_HROLF') && flag('SQ_W_RING')) toast('You already have the arm-ring. Give it to Ivar.'); }
  else if (key === 'SQ_Done_Wolves') { FLAGS.SQ_WOLVES = 2; SIDE.track = 'main'; gainXP(150); FLAGS.SILVER = flag('SILVER') + 60; alignDelta('Honor', 4); sfx('saga'); toast('Quest complete: Wolves at the Door. +150 XP, 60 silver.'); }
  else if (key === 'SQ_Start_Feathers') { FLAGS.SQ_FEATHERS = 1; SIDE.track = 'feathers'; toast('New quest: Feathers for the Völva. Climb with Space against a ledge.'); sfx('quest'); }
  else if (key === 'SQ_Done_Feathers') { FLAGS.SQ_FEATHERS = 2; FLAGS.RAVEN_SIGHT = 1; SIDE.track = 'main'; alignDelta('Piety', 6); gainXP(100); sfx('raven'); toast('Raven Sight learned. Press R (or tap Sight) to see foes and secrets through the storm.'); }
  else _scriptEventSide(key, npc);
};
const _useThingSide = useThing;
useThing = function (it) { const before = it.used; _useThingSide(it); if (it.id === 'camploot' && it.used && !before) { FLAGS.SQ_W_RING = 1; if (flag('SQ_WOLVES') === 1) toast('Among the plunder: Ivar\'s brother\'s arm-ring, silver twisted like a serpent.'); } };
const _onEnemyKilledSide = onEnemyKilled;
onEnemyKilled = function (e) { _onEnemyKilledSide(e); if (e.type === 'berserker') FLAGS.SQ_W_HROLF = 1; };
const _updateHudSide = updateHud;
updateHud = function (dt) {
  _updateHudSide(dt);
  const q = SIDE.track !== 'main' ? SIDE.track : flag('SQ_WOLVES') === 1 ? 'wolves' : flag('SQ_FEATHERS') === 1 ? 'feathers' : null;
  $('questSide').hidden = !q; if (q) $('questSide').textContent = `${SQ_NAMES[q]}: ${sqCurrent(q)}`;
};
const _toggleJournalSide = toggleJournal;
toggleJournal = function () {
  _toggleJournalSide(); if (!UI_STATE.journal) return;
  const box = $('jSide'); box.innerHTML = '';
  const list = [['main', 'The Drowned Oath', QUEST.done ? 2 : 1], ['wolves', SQ_NAMES.wolves, flag('SQ_WOLVES')], ['feathers', SQ_NAMES.feathers, flag('SQ_FEATHERS')]];
  for (const [id, name, st] of list) {
    if (!st) continue;
    const li = document.createElement('li'); li.className = 'sq' + (st >= 2 ? ' done' : '');
    const head = document.createElement('div'); head.className = 'sqh'; head.textContent = name + (st >= 2 ? ' · complete' : '');
    li.appendChild(head);
    if (id !== 'main') { const ul = document.createElement('ul'); for (const [t, ok] of sqObjectives(id)) { const o = document.createElement('li'); o.textContent = (ok ? '✓ ' : '○ ') + t; o.className = ok ? 'ok' : ''; ul.appendChild(o); } li.appendChild(ul); }
    if (st === 1) { const b = document.createElement('button'); b.className = 'trk'; b.textContent = SIDE.track === id ? 'Tracked' : 'Track'; b.disabled = SIDE.track === id; b.addEventListener('click', (e) => { e.stopPropagation(); SIDE.track = id; toggleJournal(); toggleJournal(); }); li.appendChild(b); }
    box.appendChild(li);
  }
};
const _updateQuestLogicSide = updateQuestLogic;
updateQuestLogic = function (dt) { _updateQuestLogicSide(dt); updateSideQuests(dt); };

// ---------- dialogue ----------
GRAPHS.Ivar = { Id: 'Ivar', Entries: [
  { Node: 'I_DONE', Conditions: [C_('FlagAtLeast', 'SQ_WOLVES', 2)] },
  { Node: 'I_TURN', Conditions: [C_('FlagAtLeast', 'SQ_WOLVES', 1), C_('FlagAtLeast', 'SQ_W_RING', 1)] },
  { Node: 'I_ACTIVE', Conditions: [C_('FlagAtLeast', 'SQ_WOLVES', 1)] },
  { Node: 'I0', Conditions: [] }], Nodes: [
  { Id: 'I0', Speaker: 'NPC', Line: 'Raven. The wolf-heads in the west wood took three of our sheep-folds this month, and my brother\'s arm-ring with them. Their chief is Hrolf the Red, a berserker who bites his shield. The jarl won\'t send men on the oath night.',
    Choices: [
      { Text: 'I\'ll bring your brother\'s ring home.', Tone: 'Oath', Next: 'I_YES', Effects: [{ Type: 'Alignment', Axis: 'Honor', Value: 1 }, C_('Opinion', null, 10)] },
      { Text: 'Wolf-heads carry plunder. What\'s left over is mine.', Tone: 'Crown', Next: 'I_YES', Effects: [{ Type: 'Alignment', Axis: 'Ambition', Value: 2 }] },
      { Text: 'Not tonight.', Tone: 'Neutral', Next: '' }] },
  { Id: 'I_YES', Speaker: 'NPC', Line: 'Then listen. Wolf-heads are proud. Stand in the open and call them out (Z), and they come at you one at a time. Strike only when they move, never before. And watch Hrolf\'s axe: when it flashes red, don\'t block. Roll.', OnEnter: [C_('Event', 'SQ_Start_Wolves')], Next: '' },
  { Id: 'I_ACTIVE', Speaker: 'NPC', Line: 'Past Cliff Town, keep going west into the pines. Blue flash: catch the blow on your axe just as it lands. Red flash: get out of the way.', Next: '' },
  { Id: 'I_TURN', Speaker: 'NPC', Line: 'That\'s it. That\'s his ring. Gods, I thought it was melted down in some Hedeby forge. Take this silver, and my sword arm, if you ever need it.', OnEnter: [C_('Event', 'SQ_Done_Wolves'), C_('Opinion', null, 25)], Next: '' },
  { Id: 'I_DONE', Speaker: 'NPC', Line: 'The west wood is quiet. My brother drank to your name, raven.', Next: '' }] };
// Ulfhild offers the feather quest and teaches Raven Sight
(function extendUlfhild() {
  const g = GRAPHS.Ulfhild; if (!g) return;
  g.Entries.unshift({ Node: 'U_FDONE', Conditions: [C_('FlagAtLeast', 'SQ_FEATHERS_GOT', 3), C_('FlagBelow', 'SQ_FEATHERS', 2)] });
  const ask = { Text: 'Is there something you need, seeress?', Tone: 'Rune', Next: 'U_FQ', Conditions: [C_('FlagBelow', 'SQ_FEATHERS', 1)] };
  for (const id of ['U0', 'U_PARTY']) { const n = g.Nodes.find((x) => x.Id === id); if (n) n.Choices.splice(n.Choices.length - 1, 0, { ...ask }); }
  g.Nodes.push(
    { Id: 'U_FQ', Speaker: 'NPC', Line: 'Odin\'s ravens drop feathers in the high places, where the wind can reach them: the watchtower\'s crown, the cargo stacked in the harbour, the old cairn on the plateau. Bring me three, and I will teach you to see as they see.',
      Choices: [{ Text: 'I\'ll climb for them.', Tone: 'Rune', Next: 'U_FQ_YES', Effects: [{ Type: 'Alignment', Axis: 'Piety', Value: 1 }] }, { Text: 'Another time.', Tone: 'Neutral', Next: '' }] },
    { Id: 'U_FQ_YES', Speaker: 'NPC', Line: 'Run at a ledge and jump: your hands will find the edge. Go.', OnEnter: [C_('Event', 'SQ_Start_Feathers')], Next: '' },
    { Id: 'U_FDONE', Speaker: 'NPC', Line: 'Three black feathers, still warm from the wind. Close your eyes, raven-son. Now open them, and look with Huginn\'s eye. Foes burn red through rain and wall alike.', OnEnter: [C_('Event', 'SQ_Done_Feathers')], Next: '' });
})();
