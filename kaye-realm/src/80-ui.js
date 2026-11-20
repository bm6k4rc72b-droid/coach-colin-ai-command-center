// ===== HUD, minimap, world map, location names, main loop =====
const MAPIMG = { c: null, scale: 2 }; // 2 world metres per map pixel
const LABELS = [['Willowmere', 0, -8], ['Castle Aurelion', -470, -150], ['Skyreach Tower', TOWER.x, TOWER.z - 14], ['Silverrun River', 175, -200], ['Silverrun Bridge', 166, 18], ['Eldergrove Forest', 330, -160], ['Elvenhollow', ELVES.x, ELVES.z + 50], ['The Gilded Acorn', PUB.x, PUB.z + 20], ['Frostpeak Mountains', 640, -220], ["Dragon's Rest", LAIR.x, LAIR.z - 40], ['Greenvale Meadows', -180, 240]];
function buildMapImage() {
  const W = (WORLD.maxX - WORLD.minX) / MAPIMG.scale, H = (WORLD.maxZ - WORLD.minZ) / MAPIMG.scale;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) {
    const x = WORLD.minX + px * MAPIMG.scale, z = WORLD.minZ + py * MAPIMG.scale, h = terrainH(x, z);
    const hx = terrainH(x + 2, z) - h, hz = terrainH(x, z + 2) - h, shade = clamp(1 - hx * 0.25 + hz * 0.12, 0.55, 1.25);
    let col;
    if ((h < WATER_Y - 0.05 && Math.abs(x - riverX(z)) < 26) || (Math.hypot(x - ELVES.x - 4, z - ELVES.z - 4) < 13 && h < 3.3)) col = [92, 150, 170];
    else if (h > 42 && x > 450) col = [236, 240, 248];
    else if (Math.abs(hx) + Math.abs(hz) > 2.4) col = [128, 124, 118];
    else { const forest = x > 196 && x < 478 && Math.hypot(x - ELVES.x, z - ELVES.z) > ELVES.r - 4 && Math.abs(z) > 9; col = forest ? [74, 112, 58] : [128, 168, 88]; const rm = roadMask(x, z), cm = cobbleMask(x, z); if (rm > 0.3) col = [196, 170, 120]; if (cm > 0.4) col = [176, 170, 160]; }
    const i = (py * W + px) * 4; d[i] = col[0] * shade; d[i + 1] = col[1] * shade; d[i + 2] = col[2] * shade; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tx = (x) => (x - WORLD.minX) / MAPIMG.scale, tz = (z) => (z - WORLD.minZ) / MAPIMG.scale;
  for (const cc of COLL) {
    if (cc.y1 - cc.y0 < 1.6) continue;
    g.save(); g.translate(tx(cc.cx), tz(cc.cz)); g.rotate(-Math.atan2(cc.sin, cc.cos));
    if (cc.tag === 1) { g.fillStyle = 'rgba(38,70,34,0.9)'; g.beginPath(); g.arc(0, 0, 1.3, 0, TAU); g.fill(); }
    else { g.fillStyle = cc.cx < -300 ? '#cfc6b4' : '#b0643f'; g.fillRect(-cc.hx / MAPIMG.scale, -cc.hz / MAPIMG.scale, Math.max(1, (cc.hx * 2) / MAPIMG.scale), Math.max(1, (cc.hz * 2) / MAPIMG.scale)); }
    g.restore();
  }
  MAPIMG.c = c;
  // full map labels canvas
  const fm = $('mapCanvas'); fm.width = W * 2; fm.height = H * 2; const fg = fm.getContext('2d'); fg.imageSmoothingEnabled = true; fg.drawImage(c, 0, 0, W * 2, H * 2);
  fg.font = '600 26px "Cinzel", Georgia, serif'; fg.textAlign = 'center';
  for (const [t, x, z] of LABELS) { fg.lineWidth = 6; fg.strokeStyle = 'rgba(20,16,10,0.75)'; fg.strokeText(t, tx(x) * 2, tz(z) * 2); fg.fillStyle = '#f6e7c1'; fg.fillText(t, tx(x) * 2, tz(z) * 2); }
  MAPIMG.full = fm.getContext('2d').getImageData(0, 0, fm.width, fm.height);
}
function drawMinimap() {
  const cv = $('minimap'), g = cv.getContext('2d'), S = cv.width, R = S / 2, zoom = 2.6 * (S / 180);
  g.clearRect(0, 0, S, S); g.save(); g.beginPath(); g.arc(R, R, R - 3, 0, TAU); g.clip();
  g.fillStyle = '#2b3a2a'; g.fillRect(0, 0, S, S);
  const bearing = -cam.yaw;
  g.translate(R, R); g.rotate(-bearing);
  const mx = (player.pos.x - WORLD.minX) / MAPIMG.scale, mz = (player.pos.z - WORLD.minZ) / MAPIMG.scale;
  g.scale(zoom, zoom); g.drawImage(MAPIMG.c, -mx, -mz);
  // townsfolk dots
  g.fillStyle = '#ffe7a0'; for (const n of NPCS) { const dx = (n.pos.x - player.pos.x) / MAPIMG.scale, dz = (n.pos.z - player.pos.z) / MAPIMG.scale; if (Math.abs(dx) < 40 && Math.abs(dz) < 40) { g.beginPath(); g.arc(dx, dz, 1.4, 0, TAU); g.fill(); } }
  if (BOB) { g.fillStyle = '#ff9a3c'; g.beginPath(); g.arc((BOB.pos.x - player.pos.x) / MAPIMG.scale, (BOB.pos.z - player.pos.z) / MAPIMG.scale, 1.8, 0, TAU); g.fill(); }
  g.restore();
  // player arrow (facing relative to camera)
  g.save(); g.translate(R, R); g.rotate(player.yaw === undefined ? 0 : -(Math.PI - player.yaw) - bearing + Math.PI * 0 + 0);
  g.restore();
  g.save(); g.translate(R, R); const rel = angDiff(bearing, Math.atan2(Math.sin(player.yaw), -Math.cos(player.yaw))); g.rotate(rel);
  g.fillStyle = '#ffffff'; g.strokeStyle = '#7a2230'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -9); g.lineTo(6.5, 7); g.lineTo(0, 3.5); g.lineTo(-6.5, 7); g.closePath(); g.fill(); g.stroke(); g.restore();
  // ring and north marker
  g.lineWidth = 3; g.strokeStyle = 'rgba(232,206,140,0.9)'; g.beginPath(); g.arc(R, R, R - 2, 0, TAU); g.stroke();
  const na = -bearing - Math.PI / 2; g.fillStyle = '#c23a3a'; g.font = '700 13px Cinzel, Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N', R + Math.cos(na) * (R - 13), R + Math.sin(na) * (R - 13));
  // compass strip
  const cs = $('compass'), cg = cs.getContext('2d'), CW = cs.width, CH = cs.height; cg.clearRect(0, 0, CW, CH);
  const dirs = [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]];
  const bdeg = ((bearing * 180) / Math.PI + 360) % 360;
  cg.textAlign = 'center'; cg.textBaseline = 'middle';
  for (let deg = 0; deg < 360; deg += 15) { let dd = deg - bdeg; while (dd > 180) dd -= 360; while (dd < -180) dd += 360; if (Math.abs(dd) > 75) continue; const x = CW / 2 + (dd / 75) * (CW / 2 - 10); const lab = dirs.find((q) => q[1] === deg); cg.fillStyle = lab ? (lab[0] === 'N' ? '#ff7b6b' : '#f6e7c1') : 'rgba(246,231,193,0.45)'; if (lab) { cg.font = `700 ${lab[0].length === 1 ? 15 : 11}px Cinzel, Georgia, serif`; cg.fillText(lab[0], x, CH / 2 + 1); } else cg.fillRect(x - 0.75, CH / 2 - 4, 1.5, 8); }
  cg.fillStyle = '#e8ce8c'; cg.beginPath(); cg.moveTo(CW / 2 - 5, 0); cg.lineTo(CW / 2 + 5, 0); cg.lineTo(CW / 2, 6); cg.fill();
}
function drawFullMap() {
  const fm = $('mapCanvas'), g = fm.getContext('2d'); g.putImageData(MAPIMG.full, 0, 0);
  const x = ((player.pos.x - WORLD.minX) / MAPIMG.scale) * 2, z = ((player.pos.z - WORLD.minZ) / MAPIMG.scale) * 2;
  g.save(); g.translate(x, z); g.rotate(Math.atan2(Math.sin(player.yaw), -Math.cos(player.yaw)));
  g.fillStyle = '#fff'; g.strokeStyle = '#7a2230'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, -16); g.lineTo(11, 12); g.lineTo(0, 6); g.lineTo(-11, 12); g.closePath(); g.fill(); g.stroke(); g.restore();
  if (BOB) { const bx = ((BOB.pos.x - WORLD.minX) / MAPIMG.scale) * 2, bz = ((BOB.pos.z - WORLD.minZ) / MAPIMG.scale) * 2; g.fillStyle = '#ff9a3c'; g.beginPath(); g.arc(bx, bz, 5, 0, TAU); g.fill(); }
}
function toggleMap() { UI_STATE.map = !UI_STATE.map; $('mapOverlay').hidden = !UI_STATE.map; if (UI_STATE.map) { drawFullMap(); if (document.pointerLockElement) document.exitPointerLock(); } }
function locationAt(x, z, y) {
  if (x > KEEP.x0 && x < KEEP.x1 && z > KEEP.z0 && z < KEEP.z1) return Math.abs(z) < 14 && y < CASTLE.y + 4 ? 'Throne Hall of Aurelion' : 'Aurelion Keep';
  if (Math.hypot(x - TOWER.x, z - TOWER.z) < TOWER.r + 1.5) return y > CASTLE.y + TOWER.h - 2 ? 'Skyreach Tower Summit' : 'Skyreach Tower';
  if (x > CASTLE.x0 && x < CASTLE.x1 + 3 && z > CASTLE.z0 && z < CASTLE.z1) return 'Castle Aurelion';
  if (Math.hypot(x - PUB.x, z - PUB.z) < 14) return 'The Gilded Acorn';
  if (Math.hypot(x - LAIR.x, z - LAIR.z) < 60) return "Dragon's Rest";
  if (x > 480) return 'Frostpeak Mountains';
  if (Math.abs(x - riverX(z)) < 24) return Math.abs(z) < 8 ? 'Silverrun Bridge' : 'Silverrun River';
  if (Math.hypot(x - ELVES.x, z - ELVES.z) < ELVES.r + 4) return 'Elvenhollow';
  if (x > 190 && x < 480) return 'Eldergrove Forest';
  if (Math.hypot(x, z) < 120) return Math.hypot(x, z) < 26 ? 'Willowmere Square' : 'Willowmere';
  return x < -150 ? 'Royal Road' : 'Greenvale Meadows';
}
let curLoc = '', locTimer = 0;
function updateLocation(dt) {
  const l = locationAt(player.pos.x, player.pos.z, player.pos.y);
  if (l !== curLoc) { curLoc = l; $('locName').textContent = l; const el = $('location'); el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); locTimer = 4; }
  locTimer -= Math.max(dt, 1 / 30); if (locTimer < 0) $('location').classList.remove('show');
}
let toastT = 0;
function toast(msg) { $('toast').textContent = msg; $('toast').classList.add('show'); toastT = 3; }
function updateHudButtons() {
  $('btnSunny').setAttribute('aria-pressed', ENV.weather === 'sunny'); $('btnRain').setAttribute('aria-pressed', ENV.weather === 'rain');
  $('btnDay').setAttribute('aria-pressed', !isNight()); $('btnNight').setAttribute('aria-pressed', isNight());
}
function updateHud(dt) {
  const hh = Math.floor(ENV.hour), mm = Math.floor((ENV.hour - hh) * 60);
  $('clock').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  $('dayNum').textContent = `Day ${ENV.day}`;
  const night = isNight(); $('wxIcon').textContent = ENV.weather === 'rain' ? '☂' : night ? '☾' : '☀';
  $('wxText').textContent = ENV.weather === 'rain' ? 'Rain' : night ? 'Clear night' : 'Sunny';
  toastT -= dt; if (toastT < 0) $('toast').classList.remove('show');
  PROMPT_TARGET = UI_STATE.dialog ? null : findInteract();
  const pr = $('prompt');
  if (player.mode === 'sit' && !UI_STATE.dialog) { pr.hidden = false; $('promptText').textContent = 'Stand up'; }
  else if (PROMPT_TARGET) { pr.hidden = false; $('promptText').textContent = PROMPT_TARGET.label; }
  else pr.hidden = true;
  updateTouchHud();
}
for (const [id, fn] of [['btnSunny', () => setWeather('sunny')], ['btnRain', () => setWeather('rain')], ['btnDay', () => setTimeOfDay('day')], ['btnNight', () => setTimeOfDay('night')], ['mapClose', () => toggleMap()]]) $(id).addEventListener('click', (e) => { e.stopPropagation(); fn(); });

// ---------- dragon ambience ----------
const ZZZ = [];
function makeZ() { const c = makeCanvas(64), g = c.getContext('2d'); g.font = 'bold 44px Georgia'; g.fillStyle = '#eef4ff'; g.strokeStyle = '#5a6a8a'; g.lineWidth = 3; g.textAlign = 'center'; g.strokeText('Z', 32, 46); g.fillText('Z', 32, 46); return toTex(c, true, false); }
function updateDragon(dt, time) {
  if (!DRAGON.obj) return;
  const s = DRAGON.s, pr = DRAGON.purr > 0 ? 1 : 0; DRAGON.purr -= dt;
  const b = Math.sin(time * (0.9 + pr * 2.2)) * (0.012 + pr * 0.01);
  DRAGON.obj.scale.set(s * (1 + b * 0.3), s * (1 + b), s * (1 + b * 0.6));
  if (!ZZZ.length) { const t = makeZ(); for (let i = 0; i < 4; i++) { const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); sp.userData.t = i * 1.2; scene.add(sp); ZZZ.push(sp); } }
  for (const z of ZZZ) { z.userData.t = (z.userData.t + dt) % 4.8; const k = z.userData.t / 4.8; z.position.copy(DRAGON.snout).add(_v.set(Math.sin(k * 6 + time) * 0.6, 1 + k * 5, -k * 1.5)); z.scale.setScalar(0.5 + k * 1.2); z.material.opacity = Math.sin(k * Math.PI) * 0.9; }
}

// ---------- main loop ----------
let HUD_EL = 0, HUD_WALL = performance.now() / 1000;
const clock = new THREE.Clock(); let TIME = 0, fpsAcc = 0, fpsN = 0, hudT = 0;
function tick() {
  requestAnimationFrame(tick);
  const dt = Math.min(clock.getDelta(), 0.05); TIME += dt;
  if (!window.__game.ready) { renderer.render(scene, camera); return; }
  if (UI_STATE.started) updatePlayer(dt);
  else { player.ch.setState('idle'); player.ch.animate(dt); player.pos.y = groundAt(player.pos.x, player.pos.z, player.pos.y + 1); player.visY = player.pos.y; player.ch.root.position.copy(player.pos); cam.yaw += dt * 0.08; }
  player.ch.updateCloth(dt, groundAt(player.pos.x, player.pos.z, player.pos.y), ENV.wind);
  for (const n of NPCS) n.update(dt, n.pos.distanceToSquared(player.pos) < 900);
  if (BOB) BOB.update(dt, TIME);
  for (const p of PIGEONS) p.update(dt, player.pos);
  updateDragon(dt, TIME);
  updateEnv(dt, TIME); updateTorches(dt, TIME);
  updateRays(ENV.sunDir, ENV.daylight, ENV.rain, player.pos.x, player.pos.z, TIME);
  updateGrass(player.pos.x, player.pos.z);
  updateCamera(dt); updateDialog(dt); updateLocation(dt); updateAudio(dt, TIME);
  hudT -= dt; HUD_EL += dt; if (hudT < 0) { hudT = 1 / 20; updateHud(Math.max(HUD_EL, performance.now() / 1000 - HUD_WALL)); HUD_EL = 0; HUD_WALL = performance.now() / 1000; drawMinimap(); if (UI_STATE.map) drawFullMap(); }
  renderer.render(scene, camera);
  fpsAcc += dt; fpsN++; if (fpsAcc > 1.5) { const fps = (window.__game.fps = fpsN / fpsAcc); fpsAcc = 0; fpsN = 0; if (UI_STATE.started && !LITE) { const pr = fps < 28 ? Math.max(IS_TOUCH ? 0.5 : 0.6, PIXEL_RATIO - 0.2) : fps > 55 ? Math.min(MAX_PR, PIXEL_RATIO + 0.1) : PIXEL_RATIO; if (Math.abs(pr - PIXEL_RATIO) > 0.01) { PIXEL_RATIO = pr; renderer.setPixelRatio(pr); } } }
}
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

window.__game = {
  ready: false, fps: 0,
  teleport(x, z, y) { standUp(); player.pos.set(x, y ?? groundAt(x, z, terrainH(x, z) + 0.6), z); player.visY = player.pos.y; player.vy = 0; cam.target.set(x, player.pos.y + 1.5, z); for (let i = 0; i < 30; i++) updateGrass(x, z); },
  look(yaw, pitch, dist) { cam.yaw = yaw; if (pitch !== undefined) cam.pitch = pitch; if (dist !== undefined) { cam.dist = dist; cam.cur = dist; } player.yaw = yaw + Math.PI; },
  interact: () => interact(), prompt: () => (PROMPT_TARGET ? PROMPT_TARGET.label : null), dialog: () => (UI_STATE.dialog ? { who: UI_STATE.dialog.lines[UI_STATE.dialog.i].who, text: UI_STATE.dialog.full } : null),
  setTime: setTimeOfDay, setWeather, key: (code, down) => onKey({ code, preventDefault() {}, repeat: false }, down), state: () => ({ pos: player.pos.toArray().map((v) => +v.toFixed(2)), mode: player.mode, onGround: player.onGround, anim: player.ch.target, loc: curLoc, npcs: NPCS.length, hour: +ENV.hour.toFixed(2) }),
  _t: () => ({ sun, renderer, scene, camera, THREE, cam, player }), hero: (id) => selectHero(id), start: () => startGame(), npc: (name) => NPCS.find((n) => n.name.includes(name)), bob: () => BOB, dragon: () => DRAGON, info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, colliders: COLL.length, torches: TORCHES.length }),
};

function startGame() {
  if (UI_STATE.started) return;
  UI_STATE.started = true; $('title').hidden = true; $('hud').hidden = false;
  cam.yaw = player.yaw + Math.PI; initAudio(); try { AUD.ctx && AUD.ctx.resume(); } catch (e) { /* ignore */ }
  if (IS_TOUCH) { document.body.classList.add('touch'); $('touchUI').hidden = false; } else try { const p = canvasEl.requestPointerLock && canvasEl.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* drag fallback */ }
  toast(`Welcome to Willowmere, ${HERO.name}.${IS_TOUCH ? '' : ' Press H for controls.'}`);
}
$('startBtn').addEventListener('click', startGame);
for (const b of document.querySelectorAll('.hero-pick button')) b.addEventListener('click', () => { if (window.__game.ready) selectHero(b.dataset.hero); });

async function boot() {
  camera.position.set(40, 30, 60); camera.lookAt(0, 5, 0);
  const steps = [
    ['Shaping the land', () => { buildTerrain(); buildWater(); }],
    ['Raising Willowmere', buildTown],
    ['Building the bridge, the Gilded Acorn and Elvenhollow', () => { buildBridge(); buildPub(); buildElvenHomes(); }],
    ['Raising Castle Aurelion', buildCastle],
    ['Finishing stonework', () => { for (const b of Object.values(BATCH)) b.build(scene); }],
    ['Growing Eldergrove Forest', () => { placeTrees(); placeRocks(); buildRays(); buildSkyProps(); initGrass(); buildGlows(); }],
    ['Waking the townsfolk', () => { buildTownGraph(); HERO.chars.kaye = makeKaye(); HERO.chars.foxtrot = makeFoxtrot(); for (const c of Object.values(HERO.chars)) scene.add(c.root); selectHero(/hero=kaye/.test(location.search) ? 'kaye' : 'foxtrot'); spawnNPCs(); BOB = new Cat(); const ps = PERCHES.filter((p) => Math.hypot(p.x, p.z) < 110); for (let i = 0; i < 34; i++) PIGEONS.push(new Pigeon(pick(ps).clone())); }],
    ['Finding the sleeping dragon', () => new Promise((r) => loadDragon(r))],
    ['Drawing the map', buildMapImage],
  ];
  let i = 0;
  for (const [label, fn] of steps) { $('loadText').textContent = label + '…'; $('loadBar').style.width = `${(i / steps.length) * 100}%`; await new Promise((r) => setTimeout(r, 30)); await fn(); i++; }
  player.pos.y = groundAt(player.pos.x, player.pos.z, 50); player.visY = player.pos.y;
  for (let k = 0; k < 40; k++) updateGrass(player.pos.x, player.pos.z);
  cam.target.set(player.pos.x, player.pos.y + 1.5, player.pos.z); cam.yaw = player.yaw + Math.PI + 0.6; cam.pitch = 0.18;
  scene.traverse((o) => { if (o.material && o.material.isMeshStandardMaterial && !WATERS.some((w) => w.m === o.material) && !o.material.isMeshPhysicalMaterial) o.material.envMapIntensity = 0.4; });
  updateEnv(0, 0); updateHudButtons();
  $('loadBar').style.width = '100%'; $('loading').hidden = true; $('startBtn').hidden = false;
  window.__game.ready = true;
}
tick();
boot().catch((e) => { console.error(e); $('loadText').textContent = 'Something went wrong while building the world: ' + e.message; });
