// ===== HUD, maps, location names, quest panel, post-processing, main loop, boot =====
const MAPIMG = { c: null, scale: 1.5 };
const LABELS = [['Valdrheim Hall', HALL.x, HALL.z - 12], ['Oath-Stone', STONE.x, STONE.z + 10], ['Watchtower', TOWER.x, TOWER.z + 9], ['Cliff Town', -86, 14], ['Harbour', -128, 84], ['Boathouse', BOATHOUSE.x, BOATHOUSE.z + 12], ['Wolf-head Wood', CAMP.x, CAMP.z + 16], ['The Fjord', 40, 160]];
function mapColor(x, z) {
  const h = terrainH(x, z);
  if (h < SEA_Y + 0.2) { const d = clamp(-h / 9, 0, 1); return [lerp(52, 22, d), lerp(92, 52, d), lerp(112, 78, d)]; }
  if (pathMask(x, z) > 0.5) return [128, 108, 82];
  if (h > 70) return [214, 218, 224];
  if (h > 45) return [118, 120, 116];
  const sl = Math.abs(terrainH(x + 1.5, z) - h) + Math.abs(terrainH(x, z + 1.5) - h); if (sl > 2.2) return [96, 92, 86];
  const wood = x < -150 || z < -95; return wood ? [52, 76, 52] : [92, 112, 74];
}
function buildMapImage() {
  const W = Math.round((WORLD.maxX - WORLD.minX) / MAPIMG.scale), H = Math.round((WORLD.maxZ - WORLD.minZ) / MAPIMG.scale);
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) { const col = mapColor(WORLD.minX + px * MAPIMG.scale, WORLD.minZ + py * MAPIMG.scale), i = (py * W + px) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  const tx = (x) => (x - WORLD.minX) / MAPIMG.scale, tz = (z) => (z - WORLD.minZ) / MAPIMG.scale;
  for (const cc of COLL) { if (cc.y1 - cc.y0 < 1.6 || cc.hx > 40) continue; g.save(); g.translate(tx(cc.cx), tz(cc.cz)); g.rotate(-Math.atan2(cc.sin, cc.cos)); g.fillStyle = 'rgba(60,40,28,0.9)'; g.fillRect(-cc.hx / MAPIMG.scale, -cc.hz / MAPIMG.scale, Math.max(1, (cc.hx * 2) / MAPIMG.scale), Math.max(1, (cc.hz * 2) / MAPIMG.scale)); g.restore(); }
  MAPIMG.c = c;
  const fm = $('mapCanvas'), K = 2; fm.width = W * K; fm.height = H * K; const fg = fm.getContext('2d'); fg.drawImage(c, 0, 0, W * K, H * K);
  fg.font = '600 18px "Cinzel", Georgia, serif'; fg.textAlign = 'center';
  for (const [t, x, z] of LABELS) { fg.lineWidth = 5; fg.strokeStyle = 'rgba(16,14,12,0.85)'; fg.strokeText(t, tx(x) * K, tz(z) * K); fg.fillStyle = '#eef0ea'; fg.fillText(t, tx(x) * K, tz(z) * K); }
  MAPIMG.full = fg.getImageData(0, 0, fm.width, fm.height); MAPIMG.K = K;
}
function drawDiamond(g, x, y, r) { g.fillStyle = '#e8ce8c'; g.strokeStyle = '#1b140a'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, y - r); g.lineTo(x + r, y); g.lineTo(x, y + r); g.lineTo(x - r, y); g.closePath(); g.fill(); g.stroke(); }
function drawMinimap() {
  const cv = $('minimap'), g = cv.getContext('2d'), S = cv.width, R = S / 2, zoom = 1.6 * (S / 180);
  g.clearRect(0, 0, S, S); g.save(); g.beginPath(); g.arc(R, R, R - 3, 0, TAU); g.clip();
  g.fillStyle = '#26323a'; g.fillRect(0, 0, S, S);
  const bearing = -cam.yaw; g.translate(R, R); g.rotate(-bearing);
  g.scale(zoom, zoom); g.drawImage(MAPIMG.c, -(player.pos.x - WORLD.minX) / MAPIMG.scale, -(player.pos.z - WORLD.minZ) / MAPIMG.scale);
  const rel = (x, z) => [(x - player.pos.x) / MAPIMG.scale, (z - player.pos.z) / MAPIMG.scale];
  const dot = (x, z, col, r) => { const [dx, dz] = rel(x, z); if (Math.abs(dx) < 80 && Math.abs(dz) < 80) { g.fillStyle = col; g.beginPath(); g.arc(dx, dz, r, 0, TAU); g.fill(); } };
  for (const n of NPCS) if (n.alive && !n.gone) dot(n.pos.x, n.pos.z, n.graph ? '#ffe08a' : '#d8d2c0', n.graph ? 1.8 : 1.1);
  for (const e of ENEMIES) if (!e.dead && e.active && (e.aggro || e.pos.distanceTo(player.pos) < 60)) dot(e.pos.x, e.pos.z, e.aggro ? '#ff3040' : '#ff8a6a', e.T.boss ? 3.5 : 1.8);
  const qt = questTarget(); if (qt) { let [dx, dz] = rel(qt.x, qt.z); const l = Math.hypot(dx, dz), lim = (R - 10) / zoom; if (l > lim) { dx *= lim / l; dz *= lim / l; } g.save(); g.translate(dx, dz); g.rotate(bearing); drawDiamond(g, 0, 0, 4.5 / zoom * 2); g.restore(); }
  g.restore();
  g.save(); g.translate(R, R); g.rotate(angDiff(bearing, Math.atan2(Math.sin(player.yaw), -Math.cos(player.yaw))));
  g.fillStyle = '#ffffff'; g.strokeStyle = '#1b140a'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -9); g.lineTo(6.5, 7); g.lineTo(0, 3.5); g.lineTo(-6.5, 7); g.closePath(); g.fill(); g.stroke(); g.restore();
  g.lineWidth = 3; g.strokeStyle = 'rgba(232,206,140,0.9)'; g.beginPath(); g.arc(R, R, R - 2, 0, TAU); g.stroke();
  const na = -bearing - Math.PI / 2; g.fillStyle = '#c23a3a'; g.font = '700 13px Cinzel, Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N', R + Math.cos(na) * (R - 13), R + Math.sin(na) * (R - 13));
  const cs = $('compass'), cg = cs.getContext('2d'), CW = cs.width, CH = cs.height; cg.clearRect(0, 0, CW, CH);
  const dirs = [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]], bdeg = ((bearing * 180) / Math.PI + 360) % 360;
  cg.textAlign = 'center'; cg.textBaseline = 'middle';
  for (let deg = 0; deg < 360; deg += 15) { let dd = deg - bdeg; while (dd > 180) dd -= 360; while (dd < -180) dd += 360; if (Math.abs(dd) > 75) continue; const x = CW / 2 + (dd / 75) * (CW / 2 - 10), lab = dirs.find((q) => q[1] === deg); cg.fillStyle = lab ? (lab[0] === 'N' ? '#ff7b6b' : '#f6e7c1') : 'rgba(246,231,193,0.45)'; if (lab) { cg.font = `700 ${lab[0].length === 1 ? 15 : 11}px Cinzel, Georgia, serif`; cg.fillText(lab[0], x, CH / 2 + 1); } else cg.fillRect(x - 0.75, CH / 2 - 4, 1.5, 8); }
  if (qt) { const qa = Math.atan2(qt.x - player.pos.x, -(qt.z - player.pos.z)); let dd = ((qa * 180) / Math.PI + 360) % 360 - bdeg; while (dd > 180) dd -= 360; while (dd < -180) dd += 360; const x = CW / 2 + (clamp(dd, -75, 75) / 75) * (CW / 2 - 10); drawDiamond(cg, x, CH / 2, 7); }
  cg.fillStyle = '#e8ce8c'; cg.beginPath(); cg.moveTo(CW / 2 - 5, 0); cg.lineTo(CW / 2 + 5, 0); cg.lineTo(CW / 2, 6); cg.fill();
}
function drawFullMap() {
  const fm = $('mapCanvas'), g = fm.getContext('2d'), K = MAPIMG.K; g.putImageData(MAPIMG.full, 0, 0);
  const P = (x, z) => [((x - WORLD.minX) / MAPIMG.scale) * K, ((z - WORLD.minZ) / MAPIMG.scale) * K];
  for (const n of NPCS) if (n.alive && !n.gone && n.graph) { const [x, z] = P(n.pos.x, n.pos.z); g.fillStyle = '#ffe08a'; g.beginPath(); g.arc(x, z, 4, 0, TAU); g.fill(); }
  for (const e of ENEMIES) if (!e.dead && e.active) { const [x, z] = P(e.pos.x, e.pos.z); g.fillStyle = e.T.boss ? '#ff2030' : '#ff6a5a'; g.beginPath(); g.arc(x, z, e.T.boss ? 8 : 3.5, 0, TAU); g.fill(); }
  const qt = questTarget(); if (qt) { const [x, z] = P(qt.x, qt.z); drawDiamond(g, x, z, 10); }
  const [x, z] = P(player.pos.x, player.pos.z); g.save(); g.translate(x, z); g.rotate(Math.atan2(Math.sin(player.yaw), -Math.cos(player.yaw)));
  g.fillStyle = '#fff'; g.strokeStyle = '#1b140a'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, -14); g.lineTo(10, 11); g.lineTo(0, 5); g.lineTo(-10, 11); g.closePath(); g.fill(); g.stroke(); g.restore();
}
function toggleMap() { UI_STATE.map = !UI_STATE.map; $('mapOverlay').hidden = !UI_STATE.map; if (UI_STATE.map) { drawFullMap(); if (document.pointerLockElement) document.exitPointerLock(); } }
function locationAt(x, z) {
  if (Math.abs(x - HALL.x) < HALL.w / 2 + 1 && Math.abs(z - HALL.z) < HALL.d / 2 + 1) return 'Valdrheim Hall';
  if (inRect(BOATHOUSE.inside || { x0: 0, x1: 0, z0: 0, z1: 0 }, x, z, 1)) return 'The Boathouse';
  if (Math.hypot(x - STONE.x, z - STONE.z) < 16) return 'The Oath-Stone';
  if (Math.hypot(x - TOWER.x, z - TOWER.z) < 12) return 'The Watchtower';
  if (Math.hypot(x - CAMP.x, z - CAMP.z) < 40) return 'Wolf-head Camp';
  if (terrainH(x, z) < SEA_Y - 0.4) return 'The Fjord';
  if (inRect(HARBOR, x, z, 4)) return 'Valdrheim Harbour';
  if (inRect(TERRACE, x, z, 4)) return 'Cliff Town';
  if (inRect(PLATEAU, x, z, 4)) return 'Valdrheim';
  if (x < -150 || z < -95) return 'The Western Wood';
  return 'The Fjord Coast';
}
let curLoc = '', locTimer = 0;
function updateLocation(dt) {
  const l = locationAt(player.pos.x, player.pos.z);
  if (l !== curLoc) { curLoc = l; $('locName').textContent = l; const el = $('location'); el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); locTimer = 4; }
  locTimer -= Math.max(dt, 1 / 30); if (locTimer < 0) $('location').classList.remove('show');
}
let toastT = 0;
function toast(msg) { $('toast').textContent = msg; $('toast').classList.add('show'); toastT = 2.2 + Math.min(4, msg.length / 28); }
function updateHudButtons() { for (const [id, w] of [['btnClear', 'clear'], ['btnRain', 'rain'], ['btnStorm', 'storm']]) $(id).setAttribute('aria-pressed', ENV.weather === w || (w === 'clear' && ENV.weather === 'fog')); $('btnDay').setAttribute('aria-pressed', !isNight()); $('btnNight').setAttribute('aria-pressed', isNight()); }
function updateHud(dt) {
  const hh = Math.floor(ENV.hour), mm = Math.floor((ENV.hour - hh) * 60);
  $('clock').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; $('dayNum').textContent = `Day ${ENV.day}`;
  const night = isNight(), w = ENV.weather; $('wxIcon').textContent = w === 'storm' ? '⚡' : w === 'rain' ? '☂' : w === 'fog' ? '≋' : night ? '☾' : '☀'; $('wxText').textContent = { storm: 'Thunderstorm', rain: 'Rain', fog: 'Fog' }[w] || (night ? (ENV.aurora > 0.5 ? 'Aurora' : 'Clear night') : 'Clear');
  toastT -= dt; if (toastT < 0) $('toast').classList.remove('show');
  PROMPT_TARGET = UI_STATE.dialog || UI_STATE.saga || COMBAT.dead ? null : findInteract();
  const pr = $('prompt');
  if (player.mode === 'sit' && !UI_STATE.dialog) { pr.hidden = false; $('promptText').textContent = 'Stand up'; }
  else if (PROMPT_TARGET) { pr.hidden = false; $('promptText').textContent = PROMPT_TARGET.label; pr.classList.toggle('noact', !!PROMPT_TARGET.none); }
  else pr.hidden = true;
  // quest panel
  const st = QUEST.done ? [(OUTCOMES[QUEST.outcome] || [QUEST.outcome])[0], 'The saga is told. Roam the fjord; wolf-heads still haunt the west wood.'] : STAGE_TEXT[QUEST.stage];
  let hint = st[1]; if (OVER.active && player.pos.distanceTo(BOATHOUSE.meet) < 12) hint = player.mode === 'crouch' ? `Listening… ${Math.min(100, Math.round(OVER.t / (2.4 * OVER.lines.length + 0.8) * 100))}%` : 'Crouch (C) to listen without being seen.';
  if (HOLM.active) hint = 'Holmgang: defeat Thorvald in the ring.';
  if (QUEST.stage === 3 && ENV.blackout > 0 && !QUEST.done) hint = 'The torches are out! Now is the moment.';
  $('questTitle').textContent = 'The Drowned Oath'; $('questText').textContent = st[0]; $('questHint').textContent = hint;
  $('stealth').hidden = player.mode !== 'crouch'; if (player.mode === 'crouch') { const top = ENEMIES.reduce((m, e) => (e.active && !e.dead && !e.aggro ? Math.max(m, e.aware) : m), 0); $('stealth').textContent = top > 0.05 ? `Hidden · ${top > 0.6 ? 'they are close to seeing you' : 'something stirs'}` : 'Hidden'; $('stealth').classList.toggle('warn', top > 0.6); }
  updateTouchHud();
}
for (const [id, fn] of [['btnClear', () => setWeather('clear')], ['btnRain', () => setWeather('rain')], ['btnStorm', () => setWeather('storm')], ['btnDay', () => setTimeOfDay('day')], ['btnNight', () => setTimeOfDay('night')], ['mapClose', () => toggleMap()], ['sagaClose', () => closeSaga()], ['journalClose', () => toggleJournal()]]) $(id).addEventListener('click', (e) => { e.stopPropagation(); fn(); });
$('quest').addEventListener('click', (e) => { e.stopPropagation(); toggleJournal(); });
for (const id of ['saga', 'journal']) $(id).addEventListener('pointerdown', (e) => e.stopPropagation());

// ---------- post-processing: bloom ----------
let composer = null, bloom = null;
function setupComposer() {
  const rt = new THREE.WebGLRenderTarget(innerWidth * PIXEL_RATIO, innerHeight * PIXEL_RATIO, { type: THREE.HalfFloatType, samples: IS_TOUCH || LITE ? 0 : 4 });
  composer = new EffectComposer(renderer, rt); composer.setPixelRatio(PIXEL_RATIO); composer.setSize(innerWidth, innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.38, 0.5, 1.0); composer.addPass(bloom);
  composer.addPass(new OutputPass());
}
function setPR(pr) { PIXEL_RATIO = pr; renderer.setPixelRatio(pr); if (composer) composer.setPixelRatio(pr); }

// ---------- main loop ----------
let HUD_EL = 0;
const clock = new THREE.Clock(); let TIME = 0, fpsAcc = 0, fpsN = 0, hudT = 0, qT = 0;
function tick() {
  requestAnimationFrame(tick);
  const rdt = Math.min(clock.getDelta(), 0.05); TIME += rdt;
  if (!window.__game.ready) { renderer.render(scene, camera); return; }
  let dt = rdt; if (FEEL.stop > 0) { FEEL.stop -= rdt; dt = rdt * 0.08; }
  const paused = UI_STATE.saga || UI_STATE.journal;
  if (UI_STATE.started && !paused) { updatePlayer(dt); updateHeroCombat(dt); }
  else if (!UI_STATE.started) { player.ch.setState('idle'); player.ch.animate(dt); player.pos.y = groundAt(player.pos.x, player.pos.z, player.pos.y + 1); player.visY = player.pos.y; player.ch.root.position.copy(player.pos); cam.yaw += dt * 0.05; }
  player.ch.updateCloth(dt, groundAt(player.pos.x, player.pos.z, player.pos.y), ENV.wind);
  if (!paused) { for (const n of NPCS) n.update(dt); for (const e of ENEMIES) e.update(dt); qT -= dt; if (qT < 0 && UI_STATE.started) { qT = 0.1; updateQuestLogic(0.1); } }
  updateShips(TIME, ENV.wind); updateGrass(player.pos.x, player.pos.z);
  updateEnv(paused ? 0 : dt, TIME); updateTorches(dt, TIME);
  if (HALL.horn) HALL.horn.visible = !(QUEST.done && flag('DO_OUTCOME') !== 3);
  updateCamera(rdt);
  if (FEEL.shake > 0.001) { camera.position.x += (Math.random() - 0.5) * FEEL.shake * 0.35; camera.position.y += (Math.random() - 0.5) * FEEL.shake * 0.35; FEEL.shake *= Math.pow(0.002, rdt); }
  updateDialog(rdt); updateLocation(rdt); updateAudio(rdt, TIME); updateCombatHud(rdt);
  hudT -= rdt; HUD_EL += rdt; if (hudT < 0) { hudT = 1 / 20; updateHud(HUD_EL); HUD_EL = 0; drawMinimap(); if (UI_STATE.map) drawFullMap(); }
  if (composer && bloom.enabled !== false) composer.render(); else renderer.render(scene, camera);
  fpsAcc += rdt; fpsN++;
  if (fpsAcc > 1.5) { const fps = (window.__game.fps = fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; if (UI_STATE.started && !LITE) { const pr = fps < 28 ? Math.max(IS_TOUCH ? 0.5 : 0.6, PIXEL_RATIO - 0.2) : fps > 55 ? Math.min(MAX_PR, PIXEL_RATIO + 0.1) : PIXEL_RATIO; if (Math.abs(pr - PIXEL_RATIO) > 0.01) setPR(pr); if (fps < 20 && PIXEL_RATIO <= 0.65 && bloom) bloom.enabled = false; } }
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); if (composer) composer.setSize(innerWidth, innerHeight); });

window.__game = {
  ready: false, fps: 0,
  teleport(x, z, y) { standUp(); player.pos.set(x, y ?? groundAt(x, z, terrainH(x, z) + 40), z); player.visY = player.pos.y; player.vy = 0; cam.target.set(x, player.pos.y + 1.5, z); for (let i = 0; i < 30; i++) updateGrass(x, z); },
  look(yaw, pitch, dist) { cam.yaw = yaw; if (pitch !== undefined) cam.pitch = pitch; if (dist !== undefined) { cam.dist = dist; cam.cur = dist; } player.yaw = yaw + Math.PI; },
  interact: () => interact(), prompt: () => (PROMPT_TARGET ? PROMPT_TARGET.label : null),
  dialog: () => (UI_STATE.dialog ? { who: $('dlgName').textContent, node: UI_STATE.dialog.node.Id, text: UI_STATE.dialog.full, choices: UI_STATE.dialog.choices.map((q) => ({ text: q.c.Text, tone: q.c.Tone, ok: q.ok })) } : null),
  choose: (i) => chooseOption(i), talk: (id) => talkTo(PEOPLE[id]), advance: () => advanceDialog(), closeSaga: () => closeSaga(), journal: () => toggleJournal(),
  setTime: setTimeOfDay, setWeather, setHour: (h) => { ENV.hour = h; }, strike: (x, z) => lightningStrike(x === undefined ? pickStrike() : new THREE.Vector3(x, groundAt(x, z, 99), z)), key: (code, down) => onKey({ code, preventDefault() {}, repeat: false }, down),
  attack: (k) => attack(k || 'light'), dodge: () => dodge(), combat: () => ({ hp: Math.round(COMBAT.hp), st: Math.round(COMBAT.st), level: COMBAT.level, xp: COMBAT.xp, dead: COMBAT.dead, drawn: COMBAT.drawn }),
  enemies: () => ENEMIES.filter((e) => e.active).map((e) => ({ type: e.type, hp: e.hp, dead: e.dead, aggro: e.aggro, aware: +e.aware.toFixed(2), d: +e.pos.distanceTo(player.pos).toFixed(1), pos: e.pos.toArray().map((v) => +v.toFixed(1)), yaw: e.yaw })),
  quest: () => ({ stage: QUEST.stage, done: QUEST.done, outcome: QUEST.outcome, saga: !!UI_STATE.saga, flags: { ...FLAGS }, align: { ...ALIGN }, overhear: OVER.active, overT: OVER.t, blackout: ENV.blackout, holmgang: HOLM.active }),
  people: () => NPCS.filter((n) => n.graph).map((n) => ({ id: n.id, alive: n.alive, gone: n.gone, pos: n.pos.toArray().map((v) => +v.toFixed(1)), yaw: +n.yaw.toFixed(2), opinion: n.opinion, mem: [...n.mem] })),
  state: () => ({ pos: player.pos.toArray().map((v) => +v.toFixed(2)), mode: player.mode, onGround: player.onGround, anim: player.ch.target, loc: curLoc, npcs: NPCS.length, enemies: ENEMIES.length, hour: +ENV.hour.toFixed(2), weather: ENV.weather }),
  force: FORCE, places: () => ({ HALL: { x: HALL.x, z: HALL.z, thing: HALL.thingSpot.toArray(), horn: HALL.hornPos.toArray() }, STONE: { x: STONE.x, z: STONE.z }, BOATHOUSE: { meet: BOATHOUSE.meet.toArray(), listen: BOATHOUSE.listen.toArray() }, CAMP, TOWER: TOWER.top.toArray() }),
  _t: () => ({ sun, renderer, scene, camera, THREE, cam, player, COMBAT, ENEMIES, NPCS, PEOPLE, FLAGS, ALIGN, QUEST, ENV, resolveHit, ATK, setStage, scriptEvent, feastToast, completeQuest }), start: () => startGame(),
  info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, colliders: COLL.length, torches: TORCHES.length }),
};
function startGame() {
  if (UI_STATE.started) return;
  UI_STATE.started = true; $('title').hidden = true; $('hud').hidden = false;
  cam.yaw = player.yaw + Math.PI; initAudio(); try { AUD.ctx && AUD.ctx.resume(); } catch (e) { /* ignore */ }
  if (IS_TOUCH) { document.body.classList.add('touch'); $('touchUI').hidden = false; } else try { const p = canvasEl.requestPointerLock && canvasEl.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* drag fallback */ }
  toast(`Rain over Valdrheim on the oath night. Jarl Eirik waits at the oath-stone.${IS_TOUCH ? '' : ' Press H for controls, J for the journal.'}`);
}
$('startBtn').addEventListener('click', startGame);

async function boot() {
  camera.position.set(STONE.x + 30, 60, STONE.z + 60); camera.lookAt(STONE.x, 30, STONE.z);
  const steps = [
    ['Raising the fjord and the mountains', () => { buildTerrain(); buildSea(); }],
    ['Cutting the stave hall', () => { initMats(); staveHall(); }],
    ['Setting the oath-stone and the watchtower', () => { watchtower(); plateauProps(); }],
    ['Building Cliff Town and the stairs', () => { terraceTown(); stairways(); }],
    ['Caulking the longships', () => { harbor(); wolfCamp(); }],
    ['Growing pine and birch', () => { placeTrees(); placeRocks(); initGrass(); buildSkyProps(); }],
    ['Finishing wood and stone', () => { for (const b of Object.values(BATCH)) b.build(scene); buildGlows(); }],
    ['Waking Valdrheim', () => { player.ch = makeHero(); scene.add(player.ch.root); setupHeroCombat(); spawnPeople(); spawnEnemies(); }],
    ['Drawing the map', buildMapImage],
    ['Tuning the lenses', setupComposer],
  ];
  let i = 0;
  for (const [label, fn] of steps) { $('loadText').textContent = label + '…'; $('loadBar').style.width = `${(i / steps.length) * 100}%`; await new Promise((r) => setTimeout(r, 30)); await fn(); i++; }
  const sx = STONE.x + 12, sz = STONE.z + 16; player.pos.set(sx, groundAt(sx, sz, 99), sz); player.yaw = Math.atan2(STONE.x - sx, STONE.z - sz); player.visY = player.pos.y;
  cam.target.set(player.pos.x, player.pos.y + 1.5, player.pos.z); cam.yaw = player.yaw + Math.PI + 0.4; cam.pitch = 0.18;
  scene.traverse((o) => { if (o.material && o.material.isMeshStandardMaterial && !o.material.isMeshPhysicalMaterial && o.material.metalness < 0.5) o.material.envMapIntensity = 0.45; });
  for (let k = 0; k < 40; k++) updateGrass(player.pos.x, player.pos.z);
  updateEnv(0, 0); updateHudButtons();
  $('loadBar').style.width = '100%'; $('loading').hidden = true; $('startBtn').hidden = false;
  window.__game.ready = true;
}
tick();
boot().catch((e) => { console.error(e); $('loadText').textContent = 'Something went wrong while building Valdrheim: ' + e.message; });
