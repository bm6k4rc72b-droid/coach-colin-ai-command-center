// ===== Sky, sun & moon, day/night, rain, thunderstorms with lightning, fog, aurora, torch lights, sound =====
const ENV = { hour: 17.3, day: 1, weather: 'rain', rain: 1, storm: 0, fog: 0, flash: 0, blackout: 0, aurora: 0, auroraUntil: 0, nextBolt: 6, daylight: 1, sunDir: new THREE.Vector3(), lastEnvHour: -99, lastEnvRain: -1, wind: new THREE.Vector3(1.2, 0, 0.6) };
const sky = new Sky(); sky.scale.setScalar(3000); scene.add(sky);
const envScene = new THREE.Scene(); const envSky = new Sky(); envSky.scale.setScalar(50); envScene.add(envSky);
const pmrem = new THREE.PMREMGenerator(renderer); let envRT = null;
const overcast = new THREE.Mesh(new THREE.SphereGeometry(2500, 24, 12), new THREE.MeshBasicMaterial({ color: 0x8a939c, side: THREE.BackSide, transparent: true, opacity: 0, fog: false, depthWrite: false }));
scene.add(overcast);
const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x6b5a3a, 0.6); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
sun.castShadow = true; sun.shadow.mapSize.set(IS_TOUCH ? 1024 : 2048, IS_TOUCH ? 1024 : 2048); const SH = 75;
Object.assign(sun.shadow.camera, { left: -SH, right: SH, top: SH, bottom: -SH, near: 1, far: 400 });
sun.shadow.camera.updateProjectionMatrix(); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04; scene.add(sun); scene.add(sun.target);
// stars + moon
const starGeo = new THREE.BufferGeometry(); { const a = new Float32Array(2500 * 3); for (let i = 0; i < 2500; i++) { const u = rand() * TAU, v = Math.acos(rr(0.05, 1)); a[i * 3] = Math.sin(v) * Math.cos(u) * 2700; a[i * 3 + 1] = Math.cos(v) * 2700; a[i * 3 + 2] = Math.sin(v) * Math.sin(u) * 2700; } starGeo.setAttribute('position', new THREE.BufferAttribute(a, 3)); }
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
scene.add(stars);
const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.glow, color: 0xe8eeff, transparent: true, fog: false, depthWrite: false })); moon.scale.setScalar(260); scene.add(moon);
const moonCore = new THREE.Mesh(new THREE.CircleGeometry(38, 32), new THREE.MeshBasicMaterial({ color: 0xf4f6ff, fog: false, transparent: true })); scene.add(moonCore);
// torch light pool
const LIGHTS = []; for (let i = 0; i < (IS_TOUCH ? 4 : 10); i++) { const l = new THREE.PointLight(0xffa04a, 0, 15, 1.7); scene.add(l); LIGHTS.push(l); }
let glowPts = null;
function buildGlows() {
  const a = new Float32Array(TORCHES.length * 3); TORCHES.forEach((t, i) => { a[i * 3] = t.p.x; a[i * 3 + 1] = t.p.y; a[i * 3 + 2] = t.p.z; });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(a, 3));
  glowPts = new THREE.Points(g, new THREE.PointsMaterial({ map: TEX.glow, color: 0xffb060, size: 1.4, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(glowPts);
}
// rain + snow
const RAIN_N = 6000, rainPos = new Float32Array(RAIN_N * 6);
for (let i = 0; i < RAIN_N; i++) { const x = rr(-40, 40), y = rr(0, 40), z = rr(-40, 40); rainPos.set([x, y, z, x + 0.05, y + 0.7, z + 0.02], i * 6); }
const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rain = new THREE.LineSegments(rainGeo, new THREE.LineBasicMaterial({ color: 0xa8b8c8, transparent: true, opacity: 0, depthWrite: false })); rain.frustumCulled = false; scene.add(rain);
const SNOW_N = 2000, snowPos = new Float32Array(SNOW_N * 3); for (let i = 0; i < SNOW_N; i++) snowPos.set([rr(-40, 40), rr(0, 30), rr(-40, 40)], i * 3);
const snowGeo = new THREE.BufferGeometry(); snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPos, 3));
const snow = new THREE.Points(snowGeo, new THREE.PointsMaterial({ map: TEX.glow, color: 0xffffff, size: 0.22, transparent: true, opacity: 0, depthWrite: false })); snow.frustumCulled = false; scene.add(snow);

function isNight() { return ENV.hour < 6 || ENV.hour > 19.5; }
function setTimeOfDay(which) { ENV.hour = which === 'night' ? 22.5 : 10; updateHudButtons(); toast(which === 'night' ? 'Night falls over the fjord.' : 'Grey morning light over the fjord.'); }
function setWeather(w, silent) { if (w === 'sunny') w = 'clear'; ENV.weather = w; updateHudButtons(); if (!silent) toast({ clear: 'The clouds break.', rain: 'Cold rain sweeps in off the fjord.', storm: 'Thunder rolls down the mountains.', fog: 'Fog comes in off the water.' }[w]); }
// visibility and noise for stealth: rain and fog hide you, storms drown out footsteps, night darkens everything
function ENV_VIS() { return clamp((1 - ENV.rain * 0.3 - ENV.storm * 0.15 - ENV.fog * 0.4) * lerp(0.6, 1, ENV.daylight) + (ENV.flash > 0.3 ? 0.5 : 0) - (ENV.blackout > 0 ? 0.3 : 0), 0.25, 1.2); }
function ENV_NOISE() { return clamp(1 - ENV.rain * 0.4 - ENV.storm * 0.25, 0.3, 1); }
// ---------- lightning ----------
const boltMat = new THREE.MeshBasicMaterial({ color: 0xe8efff, transparent: true, opacity: 0, fog: false, depthWrite: false, toneMapped: false, blending: THREE.AdditiveBlending });
let boltMesh = null; const flashLight = new THREE.PointLight(0xcfdcff, 0, 260, 1.2); scene.add(flashLight);
function lightningStrike(target, forced) {
  const pts = [], top = target.clone().add(new THREE.Vector3(rr(-40, 40), 230, rr(-40, 40)));
  for (let i = 0; i <= 14; i++) { const t = i / 14, p = top.clone().lerp(target, t); if (i > 0 && i < 14) p.add(new THREE.Vector3(rr(-1, 1), rr(-0.4, 0.4), rr(-1, 1)).multiplyScalar(9 * Math.sin(t * Math.PI))); pts.push(p); }
  const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.1), 60, forced ? 0.55 : 0.4, 4, false);
  const br = pts[5].clone(), bp = [br]; for (let i = 1; i <= 5; i++) bp.push(bp[i - 1].clone().add(new THREE.Vector3(rr(-6, 6), -rr(6, 12), rr(-6, 6))));
  const g2 = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(bp), 20, 0.22, 4, false);
  if (boltMesh) { scene.remove(boltMesh); boltMesh.children.forEach((c) => c.geometry.dispose()); }
  boltMesh = new THREE.Group(); boltMesh.add(new THREE.Mesh(geo, boltMat), new THREE.Mesh(g2, boltMat)); scene.add(boltMesh);
  ENV.flash = 1; ENV.boltT = 0.32; flashLight.position.copy(target).add(_v.set(0, 20, 0));
  const d = target.distanceTo(player.pos); setTimeout(() => sfx(d < 120 ? 'thunderNear' : 'thunder'), Math.min(4000, d / 0.34));
  if (Math.hypot(target.x - HALL.x, target.z - HALL.z) < 95) ENV.blackout = 3.2;
  if (Math.hypot(target.x - player.pos.x, target.z - player.pos.z) < 3.5 && !COMBAT.dead && typeof heroHurt === 'function') heroHurt(35, target.x, target.z);
  ENV.lastStrike = target.clone();
}
function pickStrike() {
  const r = rand(), nearHall = Math.hypot(player.pos.x - HALL.x, player.pos.z - HALL.z) < 90;
  if (TOWER.top && r < 0.28) return TOWER.top.clone();
  if (nearHall && r < 0.6) { const x = HALL.x + rr(-30, 30), z = HALL.z + rr(-25, 25); return new THREE.Vector3(x, groundAt(x, z, 99), z); }
  const a = rand() * TAU, R = rr(40, 220), x = player.pos.x + Math.cos(a) * R, z = player.pos.z + Math.sin(a) * R; return new THREE.Vector3(x, Math.max(0, terrainH(x, z)), z);
}
// ---------- aurora ----------
const auroraMat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, uniforms: { t: { value: 0 }, k: { value: 0 } },
  vertexShader: 'varying vec2 vUv; uniform float t; void main(){ vUv=uv; vec3 p=position; p.z += sin(p.x*0.004+t*0.15)*120.0 + sin(p.x*0.011-t*0.23)*40.0; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0); }',
  fragmentShader: 'varying vec2 vUv; uniform float t; uniform float k; void main(){ float curtain = smoothstep(0.0,0.25,vUv.y)*(1.0-smoothstep(0.35,1.0,vUv.y)); float rays = 0.55+0.45*sin(vUv.x*140.0+t*0.9+sin(vUv.x*31.0+t*0.4)*3.0); float wave = 0.6+0.4*sin(vUv.x*9.0-t*0.3); vec3 c = mix(vec3(0.15,1.0,0.55), vec3(0.55,0.25,0.95), smoothstep(0.45,1.0,vUv.y)); gl_FragColor=vec4(c*curtain*rays*wave*k*0.9, 1.0); }' });
const aurora = new THREE.Group(); for (const [y, z, ry] of [[520, -1300, 0.1], [600, -1500, -0.25], [480, -1100, 0.45]]) { const m = new THREE.Mesh(new THREE.PlaneGeometry(2600, 420, 128, 1), auroraMat); m.position.set(0, y, z); m.rotation.y = ry; m.rotation.x = 0.25; aurora.add(m); } aurora.visible = false; scene.add(aurora);

const fogDay = new THREE.Color(0xa8b4bc), fogSet = new THREE.Color(0xb08a78), fogNight = new THREE.Color(0x0a1018), fogRain = new THREE.Color(0x5d6870), fogFog = new THREE.Color(0x9aa4aa), FLASHC = new THREE.Color(0xbfcbf2), _fc = new THREE.Color();
function updateEnv(dt, time) {
  ENV.hour += dt / 60; if (ENV.hour >= 24) { ENV.hour -= 24; ENV.day++; }
  const wet = ENV.weather === 'rain' || ENV.weather === 'storm';
  ENV.rain += ((wet ? 1 : 0) - ENV.rain) * Math.min(1, dt * 0.6); ENV.storm += ((ENV.weather === 'storm' ? 1 : 0) - ENV.storm) * Math.min(1, dt * 0.5); ENV.fog += ((ENV.weather === 'fog' ? 1 : 0) - ENV.fog) * Math.min(1, dt * 0.4);
  WETU.value = ENV.rain;
  // lightning
  ENV.flash = Math.max(0, ENV.flash - dt * 3.2); ENV.blackout = Math.max(0, ENV.blackout - dt); if (ENV.boltT > 0) ENV.boltT -= dt;
  boltMat.opacity = ENV.boltT > 0 ? (0.6 + 0.4 * Math.sin(time * 90)) : 0; if (boltMesh) boltMesh.visible = ENV.boltT > 0; flashLight.intensity = ENV.flash * 1600;
  if (UI_STATE.started && (ENV.storm > 0.5 || ENV.rain > 0.9)) { ENV.nextBolt -= dt; if (ENV.nextBolt <= 0) { ENV.nextBolt = ENV.storm > 0.5 ? rr(7, 15) : rr(35, 80); lightningStrike(pickStrike()); } }
  // aurora (clear nights; strongest in the dawn epilogue after a united oath)
  const auroraWant = ENV.weather === 'clear' ? (ENV.hour < ENV.auroraUntil && ENV.hour > 2 ? 1 : 0.3) : 0; ENV.aurora += (auroraWant - ENV.aurora) * Math.min(1, dt * 0.4);
  const az = (ENV.hour - 6) / 12 * Math.PI;
  const sd = ENV.sunDir.set(Math.cos(az), Math.sin(az) * 0.92, 0.38).normalize();
  const daylight = (ENV.daylight = smooth(-0.1, 0.22, sd.y)), rainK = ENV.rain, low = smooth(0.45, 0.05, sd.y) * smooth(-0.12, 0.05, sd.y);
  const u = sky.material.uniforms; u.sunPosition.value.copy(sd); u.turbidity.value = 3 + rainK * 10; u.rayleigh.value = 1.4 + low * 1.2; u.mieCoefficient.value = 0.004 + rainK * 0.01; u.mieDirectionalG.value = 0.82;
  overcast.material.opacity = rainK * 0.88; overcast.material.color.setRGB(0.5 * daylight + 0.06, 0.55 * daylight + 0.07, 0.6 * daylight + 0.09);
  overcast.position.copy(camera.position);
  // light
  const moonDir = _v.set(-sd.x, Math.max(0.35, -sd.y), -sd.z * 0.6).normalize().clone();
  const useMoon = sd.y < -0.04;
  const ld = useMoon ? moonDir : sd;
  sun.position.copy(player.pos).addScaledVector(ld, 160); sun.target.position.copy(player.pos);
  const texel = (2 * SH) / sun.shadow.mapSize.x; sun.target.position.x = Math.round(sun.target.position.x / texel) * texel; sun.target.position.z = Math.round(sun.target.position.z / texel) * texel; sun.position.x = sun.target.position.x + ld.x * 160; sun.position.z = sun.target.position.z + ld.z * 160;
  if (useMoon) { sun.color.setRGB(0.6, 0.7, 1.0); sun.intensity = 0.55 * (1 - rainK * 0.7) * smooth(-0.04, -0.2, sd.y); }
  else { sun.color.setRGB(1, lerp(0.95, 0.68, low), lerp(0.86, 0.45, low)); sun.intensity = 3.4 * smooth(-0.04, 0.12, sd.y) * (1 - rainK * 0.75); }
  hemi.intensity = 0.16 + daylight * 0.34 + rainK * 0.12; hemi.color.setRGB(lerp(0.35, 0.82, daylight), lerp(0.42, 0.9, daylight), lerp(0.7, 1.0, daylight)); hemi.groundColor.setRGB(lerp(0.1, 0.42, daylight), lerp(0.1, 0.36, daylight), lerp(0.14, 0.24, daylight));
  renderer.toneMappingExposure = lerp(1.3, 0.72, daylight) + ENV.flash * 0.9;
  hemi.intensity += ENV.flash * 1.6;
  _fc.copy(fogNight).lerp(fogDay, daylight).lerp(fogSet, low * 0.6 * (1 - rainK)).lerp(fogRain.clone().multiplyScalar(0.2 + daylight * 0.8), rainK * 0.85).lerp(fogFog.clone().multiplyScalar(0.15 + daylight * 0.85), ENV.fog * 0.9);
  _fc.lerp(FLASHC, ENV.flash * 0.5);
  scene.fog.color.copy(_fc); scene.fog.density = 0.0018 + rainK * 0.0035 + ENV.storm * 0.001 + ENV.fog * 0.012;
  renderer.setClearColor(_fc);
  stars.material.opacity = (1 - daylight) * (1 - rainK) * (1 - ENV.fog) * 0.95;
  aurora.visible = ENV.aurora > 0.01; auroraMat.uniforms.k.value = ENV.aurora * (1 - daylight * 0.85); auroraMat.uniforms.t.value = time; aurora.position.set(camera.position.x, 0, camera.position.z); stars.position.copy(camera.position); stars.rotation.y = time * 0.003;
  moon.position.copy(camera.position).addScaledVector(moonDir, 2600); moonCore.position.copy(moon.position); moonCore.lookAt(camera.position);
  moon.material.opacity = (1 - daylight) * (1 - rainK) * 0.8; moonCore.material.opacity = (1 - daylight * 0.85) * (1 - rainK);
  for (const c of CLOUDS) { c.material.opacity = (0.55 + rainK * 0.4) * (0.25 + daylight * 0.75); c.material.color.setRGB(lerp(0.25, 1, daylight) * (1 - rainK * 0.4), lerp(0.28, low > 0.3 ? 0.85 : 1, daylight) * (1 - rainK * 0.4), lerp(0.38, low > 0.3 ? 0.78 : 1, daylight) * (1 - rainK * 0.35)); c.position.x += dt * 2.5; if (c.position.x > 1800) c.position.x = -1800; }
  // night emissives
  const night = 1 - daylight, glowK = clamp(night * 1.2 + rainK * 0.4, 0, 1);
  MAT.window.emissiveIntensity = (0.25 + glowK * 1.8) * (ENV.blackout > 0 ? 0.15 : 1); MAT.lantern.emissiveIntensity = 0.4 + glowK * 2.2;
  // env map refresh
  if (Math.abs(ENV.hour - ENV.lastEnvHour) > 0.35 || Math.abs(ENV.rain - ENV.lastEnvRain) > 0.15) {
    const eu = envSky.material.uniforms; for (const k of ['turbidity', 'rayleigh', 'mieCoefficient', 'mieDirectionalG']) eu[k].value = u[k].value; eu.sunPosition.value.copy(sd);
    const rt = pmrem.fromScene(envScene, 0, 0.1, 100); if (envRT) envRT.dispose(); envRT = rt; scene.environment = rt.texture;
    ENV.lastEnvHour = ENV.hour; ENV.lastEnvRain = ENV.rain;
    for (const m of [MAT.window]) m.envMapIntensity = 1;
  }
  // water
  for (const w of WATERS) { w.nm.offset.x += w.flow[0] * dt; w.nm.offset.y += w.flow[1] * dt; if (w.keep) { w.m.envMapIntensity = 0.25 + daylight * 0.35; continue; } w.m.color.setRGB(lerp(0.01, 0.03, daylight), lerp(0.02, 0.12, daylight), lerp(0.04, 0.13, daylight)); w.m.envMapIntensity = 0.25 + daylight * 0.55; }
  // wind
  const gust = 0.6 + 0.4 * Math.sin(time * 0.37) * Math.sin(time * 0.13);
  ENV.wind.set(1.4 * gust * (1 + rainK), 0, 0.7 * gust);
  WIND.t.value = time; WIND.player.value.copy(player.pos);
  // rain & snow follow camera
  rain.material.opacity = rainK * 0.55; rain.visible = rainK > 0.02;
  if (rain.visible) { const a = rainGeo.attributes.position.array, fall = 26 * dt; for (let i = 0; i < RAIN_N; i++) { const o = i * 6; a[o + 1] -= fall; a[o + 4] -= fall; a[o] -= fall * 0.08; a[o + 3] -= fall * 0.08; if (a[o + 1] < -2) { const x = rr(-40, 40), z = rr(-40, 40), y = rr(30, 42); a[o] = x; a[o + 1] = y; a[o + 2] = z; a[o + 3] = x + 0.05; a[o + 4] = y + 0.7; a[o + 5] = z + 0.02; } } rainGeo.attributes.position.needsUpdate = true; rain.position.set(camera.position.x, camera.position.y - 15, camera.position.z); }
  const snowK = smooth(70, 110, player.pos.y); snow.material.opacity = snowK * 0.9; snow.visible = snowK > 0.02;
  if (snow.visible) { const a = snowGeo.attributes.position.array; for (let i = 0; i < SNOW_N; i++) { a[i * 3 + 1] -= dt * 1.4; a[i * 3] += Math.sin(time + i) * dt * 0.4; if (a[i * 3 + 1] < -5) a[i * 3 + 1] = 28; } snowGeo.attributes.position.needsUpdate = true; snow.position.set(camera.position.x, camera.position.y - 10, camera.position.z); }
}
let lightTimer = 0;
function updateTorches(dt, time) {
  const night = 1 - ENV.daylight;
  const fl = 0.85 + Math.sin(time * 13) * 0.07 + Math.sin(time * 23.7) * 0.05 + Math.sin(time * 5.3) * 0.04;
  MAT.flame.color.setRGB(1, 0.62 + fl * 0.12, 0.22);
  if (glowPts) glowPts.material.opacity = 0.35 + night * 0.55 + (fl - 0.85) * 2;
  lightTimer -= dt;
  if (lightTimer < 0) {
    lightTimer = 0.3;
    const p = player.pos, cand = [];
    for (const t of TORCHES) { const d = t.p.distanceToSquared(p); if (d < 45 * 45) cand.push([d, t]); }
    cand.sort((a, b) => a[0] - b[0]);
    LIGHTS.forEach((l, i) => { const c = cand[i]; l.userData.t = c ? c[1] : null; if (c) l.position.copy(c[1].p); });
  }
  for (const l of LIGHTS) {
    const t = l.userData.t; if (!t) { l.intensity = 0; continue; }
    const dark = ENV.blackout > 0 && Math.abs(t.p.x - HALL.x) < HALL.w / 2 + 6 && Math.abs(t.p.z - HALL.z) < HALL.d / 2 + 6;
    const on = dark ? 0 : t.interior || t.hearth ? 1 : clamp(night * 1.3 + ENV.rain * 0.3, 0, 1);
    l.intensity = (t.hearth ? 9 : t.lantern ? 5 : 7) * on * fl * (t.interior ? 1 : 1.2); l.distance = t.hearth ? 10 : 14;
  }
}

// ---------- procedural audio ----------
const AUD = { ctx: null, muted: false };
function initAudio() {
  if (AUD.ctx) return;
  try {
    const ctx = (AUD.ctx = new (window.AudioContext || window.webkitAudioContext)());
    const master = (AUD.master = ctx.createGain()); master.gain.value = 0.7; master.connect(ctx.destination);
    const buf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    AUD.noise = buf;
    const loop = (freq, type, q) => { const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q; const g = ctx.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(master); s.start(); return g; };
    AUD.wind = loop(420, 'lowpass', 0.5); AUD.rain = loop(1500, 'bandpass', 0.6); AUD.water = loop(700, 'bandpass', 1.2); AUD.fire = loop(300, 'lowpass', 0.8);
    AUD.nextBird = 0; AUD.nextNote = 0; AUD.nextCricket = 0;
  } catch (e) { AUD.ctx = null; }
}
function toggleMute() { AUD.muted = !AUD.muted; if (AUD.master) AUD.master.gain.value = AUD.muted ? 0 : 0.7; toast(AUD.muted ? 'Sound off' : 'Sound on'); }
function tone(freq, dur, vol, type = 'sine', slide = 0, delay = 0) {
  const ctx = AUD.ctx; if (!ctx || AUD.muted) return; const t = ctx.currentTime + delay;
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + Math.min(0.02, dur / 4)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); o.connect(g); g.connect(AUD.master); o.start(t); o.stop(t + dur + 0.05);
}
function noiseBurst(dur, vol, freq, type = 'lowpass') {
  const ctx = AUD.ctx; if (!ctx || AUD.muted) return; const t = ctx.currentTime;
  const s = ctx.createBufferSource(); s.buffer = AUD.noise; const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur); s.connect(f); f.connect(g); g.connect(AUD.master); s.start(t, Math.random()); s.stop(t + dur + 0.05);
}
function sfx(name) {
  if (!AUD.ctx) return;
  if (name === 'step') noiseBurst(0.09, player.mode === 'crouch' ? 0.05 : 0.12, ENV.rain > 0.5 ? 1400 : 700);
  else if (name === 'splash') noiseBurst(0.25, 0.2, 2000, 'bandpass');
  else if (name === 'jump') noiseBurst(0.12, 0.08, 900);
  else if (name === 'land') noiseBurst(0.16, 0.18, 500);
  else if (name === 'greet') { tone(660, 0.18, 0.05, 'triangle'); tone(880, 0.25, 0.05, 'triangle', 0, 0.1); }
  else if (name === 'sit') noiseBurst(0.15, 0.08, 400);
  else if (name === 'purr') { for (let i = 0; i < 16; i++) noiseBurstDelayed(i * 0.09, 0.07, 0.12, 180); }
  else if (name === 'thunder') { noiseBurst(2.8, 0.35, 160); tone(38, 2.5, 0.25, 'sawtooth', 0.6); }
  else if (name === 'thunderNear') { noiseBurst(0.4, 0.6, 2500, 'highpass'); noiseBurst(3.2, 0.55, 220); tone(45, 2.8, 0.35, 'sawtooth', 0.5); }
  else if (name === 'quest') { [392, 523, 659].forEach((f, i) => tone(f, 0.5, 0.05, 'triangle', 1, i * 0.12)); }
  else if (name === 'choice') tone(330, 0.12, 0.04, 'triangle');
  else if (name === 'rune') { tone(196, 1.6, 0.07, 'sine', 1); tone(294, 1.6, 0.04, 'sine', 1, 0.2); }
  else if (name === 'saga') { [196, 247, 294, 392].forEach((f, i) => tone(f, 2.2, 0.05, 'triangle', 1, i * 0.35)); }
  else if (name === 'rumble') { tone(48, 2.6, 0.35, 'sawtooth', 0.8); tone(72, 2.2, 0.15, 'sine', 0.7, 0.3); }
}
function noiseBurstDelayed(delay, dur, vol, freq) { setTimeout(() => noiseBurst(dur, vol, freq), delay * 1000); }
const PENTA = [261.6, 293.7, 329.6, 392, 440, 523.3, 587.3, 659.3];
function updateAudio(dt, time) {
  const ctx = AUD.ctx; if (!ctx) return; const now = ctx.currentTime, p = player.pos;
  const set = (g, v) => g.gain.setTargetAtTime(v, now, 0.4);
  const height = clamp((p.y - 20) / 50, 0, 1);
  set(AUD.wind, 0.06 + height * 0.12 + ENV.rain * 0.05 + ENV.storm * 0.08); set(AUD.rain, ENV.rain * 0.22 + ENV.storm * 0.08);
  set(AUD.water, clamp(1 - Math.abs(p.z - coastZ(p.x)) / 40, 0, 1) * 0.18);
  let fire = 0; for (const l of LIGHTS) if (l.userData.t && l.userData.t.hearth) fire = Math.max(fire, clamp(1 - l.position.distanceTo(p) / 8, 0, 1)); set(AUD.fire, fire * 0.12);
  if (time > AUD.nextBird) { AUD.nextBird = time + rr(1.5, 5); if (ENV.daylight > 0.5 && ENV.rain < 0.3) { const f = rr(2200, 3800); for (let i = 0; i < 2 + Math.floor(rand() * 3); i++) tone(f * rr(0.9, 1.15), 0.09, 0.025, 'sine', rr(1.1, 1.4), i * 0.12); } }
  if (time > AUD.nextCricket && ENV.daylight < 0.3 && ENV.rain < 0.3) { AUD.nextCricket = time + rr(0.6, 1.6); for (let i = 0; i < 3; i++) tone(4400, 0.04, 0.012, 'square', 1, i * 0.06); }
  if (time > AUD.nextNote) { AUD.nextNote = time + rr(2.4, 5); const base = 0.5; const n = pick(PENTA) * base; tone(n, 2.2, 0.03, 'triangle'); if (rand() < 0.4) tone(n * 1.5, 2.6, 0.018, 'sine', 1, 0.3); }
}
