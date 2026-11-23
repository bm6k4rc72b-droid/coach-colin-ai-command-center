// ===== Input, Kaye's controller, third-person camera =====
const KEYS = {};
const TOUCHIN = { x: 0, y: 0, mag: 0, run: false };
const player = { pos: new THREE.Vector3(7, 0, 24), vel: new THREE.Vector3(), vy: 0, yaw: Math.PI * 0.85, onGround: true, air: 0, mode: 'stand', seat: null, ch: null, visY: 0, inWater: false, lastStep: 0 };
const cam = { yaw: Math.PI * 0.85 + Math.PI, pitch: 0.28, dist: 5.2, cur: 5.2, target: new THREE.Vector3(), locked: false, drag: false };
const UI_STATE = { map: false, started: false, dialog: null };

function playerHeight() { return player.mode === 'lie' ? 0.5 : player.mode === 'crouch' ? 1.15 : 1.7; }
function standUp() { if (player.seat) { player.seat.taken = null; const s = player.seat; player.seat = null; player.pos.x += Math.sin(s.rot) * 0.6; player.pos.z += Math.cos(s.rot) * 0.6; } player.mode = 'stand'; }

function onKey(e, down) {
  if (!UI_STATE.started) return;
  if (['Tab', 'Space', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
  KEYS[e.code] = down;
  if (!down || e.repeat) return;
  switch (e.code) {
    case 'Space': if (player.mode === 'sit' || player.mode === 'lie') { standUp(); break; } if (player.onGround) { player.mode = 'stand'; player.vy = 7.6; player.onGround = false; sfx('jump'); } break;
    case 'KeyC': if (player.mode === 'sit') standUp(); player.mode = player.mode === 'crouch' ? 'stand' : 'crouch'; break;
    case 'KeyX': if (player.mode === 'sit') standUp(); player.mode = player.mode === 'lie' ? 'stand' : 'lie'; break;
    case 'KeyE': interact(); break;
    case 'Tab': toggleMap(); break;
    case 'KeyN': setTimeOfDay(isNight() ? 'day' : 'night'); break;
    case 'KeyR': setWeather({ clear: 'rain', rain: 'storm', storm: 'clear', fog: 'clear' }[ENV.weather]); break;
    case 'KeyM': toggleMute(); break;
    case 'KeyH': $('help').hidden = !$('help').hidden; break;
    case 'Escape': if (UI_STATE.map) toggleMap(); if (UI_STATE.journal) toggleJournal(); if (UI_STATE.saga) closeSaga(); if (UI_STATE.dialog && !UI_STATE.dialog.choices.some((q) => q.c.bPointOfNoReturn)) closeDialog(); break;
  }
}
addEventListener('keydown', (e) => onKey(e, true));
addEventListener('keyup', (e) => onKey(e, false));
addEventListener('blur', () => { for (const k in KEYS) KEYS[k] = false; });
const canvasEl = renderer.domElement;
canvasEl.addEventListener('click', () => { if (UI_STATE.started && !cam.locked && !UI_STATE.map) { try { const p = canvasEl.requestPointerLock && canvasEl.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (err) { /* drag fallback */ } } });
document.addEventListener('pointerlockchange', () => { cam.locked = document.pointerLockElement === canvasEl; });
canvasEl.addEventListener('mousedown', () => { cam.drag = true; });
addEventListener('mouseup', () => { cam.drag = false; });
addEventListener('mousemove', (e) => {
  if (!UI_STATE.started || UI_STATE.map) return;
  if (cam.locked || cam.drag) { cam.yaw -= e.movementX * 0.0026; cam.pitch = clamp(cam.pitch + e.movementY * 0.0022, -0.55, 1.25); }
});
canvasEl.addEventListener('wheel', (e) => { cam.dist = clamp(cam.dist + Math.sign(e.deltaY) * 0.6, 1.6, 14); e.preventDefault(); }, { passive: false });

function updatePlayer(dt) {
  const ch = player.ch, k = ch.k;
  let f = (KEYS.KeyW || KEYS.ArrowUp ? 1 : 0) - (KEYS.KeyS || KEYS.ArrowDown ? 1 : 0), r = (KEYS.KeyD || KEYS.ArrowRight ? 1 : 0) - (KEYS.KeyA || KEYS.ArrowLeft ? 1 : 0), stick = 1;
  if (TOUCHIN.mag > 0.12) { f = -TOUCHIN.y; r = TOUCHIN.x; stick = TOUCHIN.mag; }
  const blocked = UI_STATE.map;
  let mx = 0, mz = 0;
  if ((f || r) && !blocked) {
    const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw);
    mx = fx * f + -fz * r; mz = fz * f + fx * r; const l = Math.hypot(mx, mz); mx /= l; mz /= l;
    if (player.mode === 'sit' || player.mode === 'lie') standUp();
    if (UI_STATE.dialog && UI_STATE.dialog.autoClose) closeDialog();
  }
  if (player.mode === 'sit' && player.seat) {
    const s = player.seat; player.pos.set(s.p.x, s.p.y - 0.5 * k, s.p.z); player.yaw = s.rot; player.vel.set(0, 0, 0); player.vy = 0; player.onGround = true;
    ch.sitH = 0.6; ch.setState(s.kind === 'throne' ? 'throne' : 'sit');
  } else {
    const run = (KEYS.ShiftLeft || KEYS.ShiftRight || TOUCHIN.run || stick > 0.92 && TOUCHIN.mag > 0) && player.mode === 'stand';
    let speed = player.mode === 'crouch' ? 1.7 : run ? 7.4 : 3.1 * clamp(stick * 1.25, 0.4, 1);
    if (player.mode === 'lie') speed = 0;
    if (player.inWater) speed *= 0.55;
    const ov = combatMove(); if (ov) { mx = ov.x; mz = ov.z; speed = ov.speed; }
    const acc = player.onGround ? 11 : 2.5;
    player.vel.x += (mx * speed - player.vel.x) * Math.min(1, dt * acc);
    player.vel.z += (mz * speed - player.vel.z) * Math.min(1, dt * acc);
    if ((mx || mz) && !ov) player.yaw += angDiff(player.yaw, Math.atan2(mx, mz)) * Math.min(1, dt * 11);
    const ox = player.pos.x, oz = player.pos.z, oldG = groundAt(ox, oz, player.pos.y);
    player.pos.x += player.vel.x * dt; player.pos.z += player.vel.z * dt;
    const H = playerHeight();
    const ceil = collideCircle(player.pos, 0.32, H);
    // slope limit on raw terrain
    const tg = terrainH(player.pos.x, player.pos.z), dist = Math.hypot(player.pos.x - ox, player.pos.z - oz);
    if (player.onGround && tg > player.pos.y + 0.05 && dist > 1e-4 && (tg - Math.max(oldG, terrainH(ox, oz))) / dist > 1.25) { player.pos.x = ox; player.pos.z = oz; player.vel.x *= 0.3; player.vel.z *= 0.3; }
    player.pos.x = clamp(player.pos.x, WORLD.minX + 8, WORLD.maxX - 8); player.pos.z = clamp(player.pos.z, WORLD.minZ + 8, WORLD.maxZ - 8);
    // vertical
    player.vy -= 22 * dt; player.pos.y += player.vy * dt;
    const g = groundAt(player.pos.x, player.pos.z, Math.max(player.pos.y, player.pos.y - player.vy * dt));
    if (player.pos.y <= g) { if (!player.onGround && player.air > 0.35) sfx('land'); player.pos.y = g; player.vy = 0; player.onGround = true; }
    else if (player.onGround && player.vy <= 0 && player.pos.y - g < 0.65) { player.pos.y = g; player.vy = 0; }
    else player.onGround = false;
    if (player.pos.y + H > ceil) { player.pos.y = Math.max(g, ceil - H); player.vy = Math.min(player.vy, 0); }
    player.air = player.onGround ? 0 : player.air + dt;
    player.inWater = g === terrainH(player.pos.x, player.pos.z) && g < WATER_Y - 0.25;
    const hs = Math.hypot(player.vel.x, player.vel.z);
    if (!player.onGround && player.air > 0.12) ch.setState(player.vy > 0 ? 'jump' : 'fall');
    else if (player.mode === 'lie') ch.setState('lie');
    else if (player.mode === 'crouch') ch.setState(hs > 0.25 ? 'crouchWalk' : 'crouch');
    else ch.setState(hs < 0.2 ? 'idle' : hs > 4.6 ? 'run' : 'walk');
    const stride = player.mode === 'crouch' ? 1.0 : lerp(1.55, 2.7, clamp((hs - 3) / 4, 0, 1));
    const prev = Math.sin(ch.phase);
    ch.phase += hs * dt / stride * TAU;
    if (player.onGround && hs > 0.5 && Math.sign(Math.sin(ch.phase)) !== Math.sign(prev)) sfx(player.inWater ? 'splash' : 'step');
  }
  ch.capeZ = player.mode === 'lie' ? 50 : -0.14;
  // smooth visual height for stairs
  const dy = player.pos.y - player.visY; player.visY = Math.abs(dy) > 0.9 ? player.pos.y : player.visY + dy * Math.min(1, dt * 16);
  ch.root.position.set(player.pos.x, player.visY, player.pos.z);
  ch.root.rotation.y = player.yaw;
  ch.animate(dt);
}

const _camDir = new THREE.Vector3(), _ct = new THREE.Vector3();
function updateCamera(dt) {
  const k = player.ch.k;
  const h = player.mode === 'lie' ? 0.45 : player.mode === 'crouch' ? 1.05 : player.mode === 'sit' ? 1.25 : 1.5;
  _ct.set(player.pos.x, player.visY + h * k, player.pos.z);
  cam.target.lerp(_ct, Math.min(1, dt * 12));
  if (cam.target.distanceTo(_ct) > 3) cam.target.copy(_ct);
  _camDir.set(Math.sin(cam.yaw) * Math.cos(cam.pitch), Math.sin(cam.pitch), Math.cos(cam.yaw) * Math.cos(cam.pitch));
  let allowed = cam.dist;
  for (let d = 0.35; d <= cam.dist; d += 0.2) {
    const x = cam.target.x + _camDir.x * d, y = cam.target.y + _camDir.y * d, z = cam.target.z + _camDir.z * d;
    if (pointBlocked(x, y, z)) { allowed = Math.max(0.45, d - 0.3); break; }
  }
  cam.cur = allowed < cam.cur ? allowed : lerp(cam.cur, allowed, Math.min(1, dt * 2.5));
  camera.position.copy(cam.target).addScaledVector(_camDir, cam.cur);
  const ty = terrainH(camera.position.x, camera.position.z) + 0.3; if (camera.position.y < ty) camera.position.y = ty;
  camera.lookAt(cam.target);
  player.ch.mesh.visible = cam.cur > 0.7;
}
