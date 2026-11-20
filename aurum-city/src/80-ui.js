// ===== HUD, maps, location names, post-processing, main loop =====
const MAPIMG = { c: null, scale: 1 };
const LABELS = [['Gilded Canal', 0, 2], ['Promenade of Lights', -60, 30], ['Arcade Row', -60, -30], ['Starbridge West', -150, -20], ['Starbridge East', 150, -20], ['The Breach', 350, -38], ['West Docks', -345, -38]];
function mapColor(x, z) {
  if (inCanal(x, z)) return [40, 150, 170];
  if (Math.abs(z) > FACADE_Z) return [150, 118, 60];
  if (x > CANAL.x1) return Math.hypot(x - 388, z) < 14 ? [190, 60, 70] : [196, 184, 160];
  return [222, 212, 190];
}
function buildMapImage() {
  const W = (WORLD.maxX - WORLD.minX) / MAPIMG.scale, H = (WORLD.maxZ - WORLD.minZ) / MAPIMG.scale;
  const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  for (let py = 0; py < H; py++) for (let px = 0; px < W; px++) { const col = mapColor(WORLD.minX + px * MAPIMG.scale, WORLD.minZ + py * MAPIMG.scale), i = (py * W + px) * 4; d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  const tx = (x) => (x - WORLD.minX) / MAPIMG.scale, tz = (z) => (z - WORLD.minZ) / MAPIMG.scale;
  for (const cc of COLL) { if (cc.y1 - cc.y0 < 1.6 || cc.hx > 60) continue; g.save(); g.translate(tx(cc.cx), tz(cc.cz)); g.rotate(-Math.atan2(cc.sin, cc.cos)); g.fillStyle = 'rgba(120,90,40,0.9)'; g.fillRect(-cc.hx / MAPIMG.scale, -cc.hz / MAPIMG.scale, Math.max(1, (cc.hx * 2) / MAPIMG.scale), Math.max(1, (cc.hz * 2) / MAPIMG.scale)); g.restore(); }
  for (const bx of BRIDGES) { g.fillStyle = '#efe4c8'; g.fillRect(tx(bx - 6), tz(-CANAL.half - 1), 12 / MAPIMG.scale, (CANAL.half * 2 + 2) / MAPIMG.scale); }
  MAPIMG.c = c;
  const fm = $('mapCanvas'), K = 2; fm.width = W * K; fm.height = H * K; const fg = fm.getContext('2d'); fg.drawImage(c, 0, 0, W * K, H * K);
  fg.font = '600 18px "Cinzel", Georgia, serif'; fg.textAlign = 'center';
  for (const [t, x, z] of LABELS) { fg.lineWidth = 5; fg.strokeStyle = 'rgba(20,16,10,0.8)'; fg.strokeText(t, tx(x) * K, tz(z) * K); fg.fillStyle = '#f6e7c1'; fg.fillText(t, tx(x) * K, tz(z) * K); }
  MAPIMG.full = fg.getImageData(0, 0, fm.width, fm.height); MAPIMG.K = K;
}
function drawMinimap() {
  const cv = $('minimap'), g = cv.getContext('2d'), S = cv.width, R = S / 2, zoom = 1.5 * (S / 180);
  g.clearRect(0, 0, S, S); g.save(); g.beginPath(); g.arc(R, R, R - 3, 0, TAU); g.clip();
  g.fillStyle = '#5a4520'; g.fillRect(0, 0, S, S);
  const bearing = -cam.yaw; g.translate(R, R); g.rotate(-bearing);
  g.scale(zoom, zoom); g.drawImage(MAPIMG.c, -(player.pos.x - WORLD.minX) / MAPIMG.scale, -(player.pos.z - WORLD.minZ) / MAPIMG.scale);
  const dot = (x, z, col, r) => { const dx = (x - player.pos.x) / MAPIMG.scale, dz = (z - player.pos.z) / MAPIMG.scale; if (Math.abs(dx) < 70 && Math.abs(dz) < 70) { g.fillStyle = col; g.beginPath(); g.arc(dx, dz, r, 0, TAU); g.fill(); } };
  for (const n of NPCS) dot(n.pos.x, n.pos.z, '#fff2b0', 1.3);
  for (const e of ENEMIES) if (!e.dead && e.active) dot(e.pos.x, e.pos.z, e.T.boss ? '#ff3040' : '#ff6a5a', e.T.boss ? 3.5 : 1.9);
  g.restore();
  g.save(); g.translate(R, R); g.rotate(angDiff(bearing, Math.atan2(Math.sin(player.yaw), -Math.cos(player.yaw))));
  g.fillStyle = '#ffffff'; g.strokeStyle = '#1f6a6a'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -9); g.lineTo(6.5, 7); g.lineTo(0, 3.5); g.lineTo(-6.5, 7); g.closePath(); g.fill(); g.stroke(); g.restore();
  g.lineWidth = 3; g.strokeStyle = 'rgba(232,206,140,0.9)'; g.beginPath(); g.arc(R, R, R - 2, 0, TAU); g.stroke();
  const na = -bearing - Math.PI / 2; g.fillStyle = '#c23a3a'; g.font = '700 13px Cinzel, Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('N', R + Math.cos(na) * (R - 13), R + Math.sin(na) * (R - 13));
  const cs = $('compass'), cg = cs.getContext('2d'), CW = cs.width, CH = cs.height; cg.clearRect(0, 0, CW, CH);
  const dirs = [['N', 0], ['NE', 45], ['E', 90], ['SE', 135], ['S', 180], ['SW', 225], ['W', 270], ['NW', 315]], bdeg = ((bearing * 180) / Math.PI + 360) % 360;
  cg.textAlign = 'center'; cg.textBaseline = 'middle';
  for (let deg = 0; deg < 360; deg += 15) { let dd = deg - bdeg; while (dd > 180) dd -= 360; while (dd < -180) dd += 360; if (Math.abs(dd) > 75) continue; const x = CW / 2 + (dd / 75) * (CW / 2 - 10), lab = dirs.find((q) => q[1] === deg); cg.fillStyle = lab ? (lab[0] === 'N' ? '#ff7b6b' : '#f6e7c1') : 'rgba(246,231,193,0.45)'; if (lab) { cg.font = `700 ${lab[0].length === 1 ? 15 : 11}px Cinzel, Georgia, serif`; cg.fillText(lab[0], x, CH / 2 + 1); } else cg.fillRect(x - 0.75, CH / 2 - 4, 1.5, 8); }
  cg.fillStyle = '#e8ce8c'; cg.beginPath(); cg.moveTo(CW / 2 - 5, 0); cg.lineTo(CW / 2 + 5, 0); cg.lineTo(CW / 2, 6); cg.fill();
}
function drawFullMap() {
  const fm = $('mapCanvas'), g = fm.getContext('2d'), K = MAPIMG.K; g.putImageData(MAPIMG.full, 0, 0);
  const P = (x, z) => [((x - WORLD.minX) / MAPIMG.scale) * K, ((z - WORLD.minZ) / MAPIMG.scale) * K];
  for (const e of ENEMIES) if (!e.dead && e.active) { const [x, z] = P(e.pos.x, e.pos.z); g.fillStyle = e.T.boss ? '#ff2030' : '#ff6a5a'; g.beginPath(); g.arc(x, z, e.T.boss ? 9 : 4, 0, TAU); g.fill(); }
  const [x, z] = P(player.pos.x, player.pos.z); g.save(); g.translate(x, z); g.rotate(Math.atan2(Math.sin(player.yaw), -Math.cos(player.yaw)));
  g.fillStyle = '#fff'; g.strokeStyle = '#1f6a6a'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, -14); g.lineTo(10, 11); g.lineTo(0, 5); g.lineTo(-10, 11); g.closePath(); g.fill(); g.stroke(); g.restore();
}
function toggleMap() { UI_STATE.map = !UI_STATE.map; $('mapOverlay').hidden = !UI_STATE.map; if (UI_STATE.map) { drawFullMap(); if (document.pointerLockElement) document.exitPointerLock(); } }
function locationAt(x, z) {
  if (x > CANAL.x1 + 2) return 'The Breach';
  if (x < -292) return 'West Docks';
  if (BRIDGES.some((bx) => Math.abs(x - bx) < 7) && Math.abs(z) < CANAL.half + 2) return x < 0 ? 'Starbridge West' : 'Starbridge East';
  if (inCanal(x, z)) return 'Gilded Canal';
  if (Math.abs(z) > FACADE_Z - 1) return 'Gilded Arcades';
  return z > 0 ? 'Promenade of Lights' : 'Arcade Row';
}
let curLoc = '', locTimer = 0;
function updateLocation(dt) {
  const l = locationAt(player.pos.x, player.pos.z);
  if (l !== curLoc) { curLoc = l; $('locName').textContent = l; const el = $('location'); el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); locTimer = 4; }
  locTimer -= Math.max(dt, 1 / 30); if (locTimer < 0) $('location').classList.remove('show');
}
let toastT = 0;
function toast(msg) { $('toast').textContent = msg; $('toast').classList.add('show'); toastT = 3.2; }
function updateHudButtons() { $('btnSunny').setAttribute('aria-pressed', ENV.weather === 'sunny'); $('btnRain').setAttribute('aria-pressed', ENV.weather === 'rain'); $('btnDay').setAttribute('aria-pressed', !isNight()); $('btnNight').setAttribute('aria-pressed', isNight()); }
function updateHud(dt) {
  const hh = Math.floor(ENV.hour), mm = Math.floor((ENV.hour - hh) * 60);
  $('clock').textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; $('dayNum').textContent = `Day ${ENV.day}`;
  const night = isNight(); $('wxIcon').textContent = ENV.weather === 'rain' ? '☂' : night ? '☾' : '☀'; $('wxText').textContent = ENV.weather === 'rain' ? 'Rain' : night ? 'Clear night' : 'Sunny';
  toastT -= dt; if (toastT < 0) $('toast').classList.remove('show');
  PROMPT_TARGET = UI_STATE.dialog || COMBAT.dead ? null : findInteract();
  const pr = $('prompt');
  if (player.mode === 'sit' && !UI_STATE.dialog) { pr.hidden = false; $('promptText').textContent = 'Stand up'; }
  else if (PROMPT_TARGET) { pr.hidden = false; $('promptText').textContent = PROMPT_TARGET.label; }
  else pr.hidden = true;
  updateTouchHud();
}
for (const [id, fn] of [['btnSunny', () => setWeather('sunny')], ['btnRain', () => setWeather('rain')], ['btnDay', () => setTimeOfDay('day')], ['btnNight', () => setTimeOfDay('night')], ['mapClose', () => toggleMap()]]) $(id).addEventListener('click', (e) => { e.stopPropagation(); fn(); });

// ---------- post-processing: bloom ----------
let composer = null, bloom = null;
function setupComposer() {
  const rt = new THREE.WebGLRenderTarget(innerWidth * PIXEL_RATIO, innerHeight * PIXEL_RATIO, { type: THREE.HalfFloatType, samples: IS_TOUCH || LITE ? 0 : 4 });
  composer = new EffectComposer(renderer, rt); composer.setPixelRatio(PIXEL_RATIO); composer.setSize(innerWidth, innerHeight);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.42, 0.5, 1.05); composer.addPass(bloom);
  composer.addPass(new OutputPass());
}
function setPR(pr) { PIXEL_RATIO = pr; renderer.setPixelRatio(pr); if (composer) composer.setPixelRatio(pr); }

// ---------- main loop ----------
let HUD_EL = 0;
const clock = new THREE.Clock(); let TIME = 0, fpsAcc = 0, fpsN = 0, hudT = 0;
function tick() {
  requestAnimationFrame(tick);
  const rdt = Math.min(clock.getDelta(), 0.05); TIME += rdt;
  if (!window.__game.ready) { renderer.render(scene, camera); return; }
  let dt = rdt; if (FEEL.stop > 0) { FEEL.stop -= rdt; dt = rdt * 0.08; }
  if (UI_STATE.started) { updatePlayer(dt); updateHeroCombat(dt); }
  else { player.ch.setState('idle'); player.ch.animate(dt); player.pos.y = groundAt(player.pos.x, player.pos.z, player.pos.y + 1); player.visY = player.pos.y; player.ch.root.position.copy(player.pos); cam.yaw += dt * 0.06; }
  player.ch.updateCloth(dt, groundAt(player.pos.x, player.pos.z, player.pos.y), ENV.wind);
  for (const n of NPCS) n.update(dt);
  for (const e of ENEMIES) e.update(dt);
  updateVehicles(dt, TIME);
  updateEnv(dt, TIME); updateTorches(dt, TIME);
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
  teleport(x, z, y) { standUp(); player.pos.set(x, y ?? groundAt(x, z, PROM_Y + 0.6), z); player.visY = player.pos.y; player.vy = 0; cam.target.set(x, player.pos.y + 1.5, z); },
  look(yaw, pitch, dist) { cam.yaw = yaw; if (pitch !== undefined) cam.pitch = pitch; if (dist !== undefined) { cam.dist = dist; cam.cur = dist; } player.yaw = yaw + Math.PI; },
  interact: () => interact(), prompt: () => (PROMPT_TARGET ? PROMPT_TARGET.label : null), dialog: () => (UI_STATE.dialog ? { who: UI_STATE.dialog.lines[UI_STATE.dialog.i].who, text: UI_STATE.dialog.full } : null),
  setTime: setTimeOfDay, setWeather, key: (code, down) => onKey({ code, preventDefault() {}, repeat: false }, down),
  attack: (k) => attack(k || 'light'), dodge: () => dodge(), combat: () => ({ hp: Math.round(COMBAT.hp), st: Math.round(COMBAT.st), level: COMBAT.level, xp: COMBAT.xp, quest: { ...COMBAT.quest }, dead: COMBAT.dead, drawn: COMBAT.drawn }),
  enemies: () => ENEMIES.filter((e) => e.active).map((e) => ({ type: e.type, hp: e.hp, dead: e.dead, aggro: e.aggro, d: +e.pos.distanceTo(player.pos).toFixed(1) })),
  state: () => ({ pos: player.pos.toArray().map((v) => +v.toFixed(2)), mode: player.mode, onGround: player.onGround, anim: player.ch.target, loc: curLoc, npcs: NPCS.length, enemies: ENEMIES.length, hour: +ENV.hour.toFixed(2) }),
  _t: () => ({ sun, renderer, scene, camera, THREE, cam, player, COMBAT, ENEMIES, resolveHit, ATK }), start: () => startGame(), npc: (name) => NPCS.find((n) => n.name.includes(name)),
  info: () => ({ calls: renderer.info.render.calls, tris: renderer.info.render.triangles, colliders: COLL.length, torches: TORCHES.length }),
};
function startGame() {
  if (UI_STATE.started) return;
  UI_STATE.started = true; $('title').hidden = true; $('hud').hidden = false;
  cam.yaw = player.yaw + Math.PI; initAudio(); try { AUD.ctx && AUD.ctx.resume(); } catch (e) { /* ignore */ }
  if (IS_TOUCH) { document.body.classList.add('touch'); $('touchUI').hidden = false; } else try { const p = canvasEl.requestPointerLock && canvasEl.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* drag fallback */ }
  toast(`Welcome to the Gilded Circuit, ${HERO.name}.${IS_TOUCH ? '' : ' Press H for controls.'}`);
}
$('startBtn').addEventListener('click', startGame);

async function boot() {
  camera.position.set(-20, 12, 40); camera.lookAt(0, 4, 0);
  const steps = [
    ['Laying the canal circuitry', buildGround],
    ['Raising the golden arcades', buildFacades],
    ['Building Starbridges and cafés', () => { buildBridges(); buildPromenades(); buildBreachAndDocks(); }],
    ['Lighting the skyline', buildSkyline],
    ['Finishing stone and gold', () => { for (const b of Object.values(BATCH)) b.build(scene); }],
    ['Launching hover traffic', () => { buildVehicles(); buildSkyProps(); buildGlows(); }],
    ['Waking the city', () => { player.ch = makeHero(); scene.add(player.ch.root); setupHeroCombat(); spawnCitizens(); spawnEnemies(); updateQuest(); }],
    ['Drawing the map', buildMapImage],
    ['Tuning the lenses', setupComposer],
  ];
  let i = 0;
  for (const [label, fn] of steps) { $('loadText').textContent = label + '…'; $('loadBar').style.width = `${(i / steps.length) * 100}%`; await new Promise((r) => setTimeout(r, 30)); await fn(); i++; }
  player.pos.set(-6, PROM_Y, 24); player.yaw = Math.PI / 2; player.pos.y = groundAt(player.pos.x, player.pos.z, 50); player.visY = player.pos.y;
  cam.target.set(player.pos.x, player.pos.y + 1.5, player.pos.z); cam.yaw = player.yaw + Math.PI + 0.5; cam.pitch = 0.16;
  scene.traverse((o) => { if (o.material && o.material.isMeshStandardMaterial && !o.material.isMeshPhysicalMaterial && o.material.metalness < 0.5) o.material.envMapIntensity = 0.5; });
  updateEnv(0, 0); updateHudButtons();
  $('loadBar').style.width = '100%'; $('loading').hidden = true; $('startBtn').hidden = false;
  window.__game.ready = true;
}
tick();
boot().catch((e) => { console.error(e); $('loadText').textContent = 'Something went wrong while building the city: ' + e.message; });
