import * as THREE from 'three';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { Lensflare, LensflareElement } from 'three/addons/objects/Lensflare.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { toVec, greatCircle, rangeRing } from './math.js';

// ─────────────────────────────────────────────────────────────────────────────
// JET ATELIER · SCENES
//   studio  a dark hangar studio: mirror floor, softboxes, holographic floor ring
//   flight  golden hour above a cloud deck (Preetham sky), sun flare, contrails
//   globe   a holographic Earth for mission planning (great circles, range ring)
// ─────────────────────────────────────────────────────────────────────────────

const radial = (inner, outer, size = 128) => {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  const grd = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grd.addColorStop(0, inner); grd.addColorStop(1, outer); g.fillStyle = grd; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
};
const textSprite = (text, color = '#e8f6ff') => {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d');
  g.font = '600 30px "JetBrains Mono", monospace'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = 12; g.fillStyle = color; g.fillText(text, 128, 32);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); s.scale.set(0.3, 0.075, 1); return s;
};

export function buildStudio() {
  RectAreaLightUniformsLib.init();
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#030306');
  scene.fog = new THREE.Fog('#030306', 40, 95);
  // Mirror floor, dimmed by a tinted glossy layer so reflections read as polished stone.
  const mirror = new Reflector(new THREE.CircleGeometry(60, 64), { clipBias: 0.003, textureWidth: 1024, textureHeight: 1024, color: 0x6a6f7a });
  mirror.rotation.x = -Math.PI / 2; mirror.position.y = -0.001; scene.add(mirror);
  const tint = new THREE.Mesh(new THREE.CircleGeometry(60, 64), new THREE.MeshPhysicalMaterial({ color: '#05060a', roughness: 0.35, metalness: 0.2, transparent: true, opacity: 0.8, clearcoat: 1 }));
  tint.rotation.x = -Math.PI / 2; tint.position.y = 0.002; scene.add(tint);
  // Cyclorama backdrop.
  const cyc = new THREE.Mesh(new THREE.CylinderGeometry(55, 55, 40, 64, 1, true, Math.PI * 0.15, Math.PI * 1.7), new THREE.MeshStandardMaterial({ color: '#0b0c12', roughness: 1, side: THREE.BackSide }));
  cyc.position.y = 19.9; scene.add(cyc);
  // Softboxes: rectangular area lights with visible emissive panels (long streaks on the clear coat).
  const softbox = (w, h, pos, color, intensity) => {
    const l = new THREE.RectAreaLight(color, intensity, w, h); l.position.copy(pos); l.lookAt(0, 0, 0); scene.add(l);
    // (The softbox panels themselves stay out of frame; their light shows as streaks on the clear coat.)
    return l;
  };
  softbox(24, 2.2, new THREE.Vector3(0, 11, 0), '#ffffff', 3.2);
  softbox(18, 1.4, new THREE.Vector3(0, 7, 13), '#dfe8ff', 2.2);
  softbox(18, 1.4, new THREE.Vector3(0, 7, -13), '#ffe9d6', 1.8);
  // Colour rims: cyan and magenta raking lights for the holographic accent.
  const rimA = new THREE.SpotLight('#3ff3ff', 180, 60, 0.35, 0.6, 1.5); rimA.position.set(-20, 5, 12); scene.add(rimA, rimA.target);
  const rimB = new THREE.SpotLight('#ff4fd8', 180, 60, 0.35, 0.6, 1.5); rimB.position.set(20, 5, -12); scene.add(rimB, rimB.target);
  scene.add(new THREE.HemisphereLight('#8090b0', '#050508', 0.25));
  // Holographic floor ring and grid under the aircraft.
  const ring = new THREE.Mesh(new THREE.RingGeometry(17.5, 17.62, 128), new THREE.MeshBasicMaterial({ color: '#3ff3ff', transparent: true, opacity: 0.8 }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01; scene.add(ring);
  const ring2 = new THREE.Mesh(new THREE.RingGeometry(18.2, 18.26, 128, 1, 0, Math.PI * 1.3), new THREE.MeshBasicMaterial({ color: '#ff4fd8', transparent: true, opacity: 0.7 }));
  ring2.rotation.x = -Math.PI / 2; ring2.position.y = 0.012; scene.add(ring2);
  const grid = new THREE.PolarGridHelper(17, 24, 8, 96, '#1b2a3a', '#1b2a3a'); grid.position.y = 0.006; grid.material.transparent = true; grid.material.opacity = 0.35; scene.add(grid);
  // Floating dust in the light shafts.
  const n = 600, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) pos.set([(Math.random() - 0.5) * 50, Math.random() * 12, (Math.random() - 0.5) * 30], i * 3);
  const dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dust = new THREE.Points(dg, new THREE.PointsMaterial({ size: 0.05, color: '#cfe6ff', map: radial('rgba(255,255,255,1)', 'rgba(255,255,255,0)', 32), transparent: true, opacity: 0.5, depthWrite: false }));
  scene.add(dust);
  return { scene, ring, ring2, dust };
}

export function buildFlight(renderer) {
  const scene = new THREE.Scene();
  const sky = new Sky(); sky.scale.setScalar(20000); scene.add(sky);
  const U = sky.material.uniforms;
  U.turbidity.value = 6; U.rayleigh.value = 2.2; U.mieCoefficient.value = 0.006; U.mieDirectionalG.value = 0.86;
  const sun = new THREE.Vector3();
  const setSun = (elevDeg, azDeg) => { sun.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elevDeg), THREE.MathUtils.degToRad(azDeg)); U.sunPosition.value.copy(sun); };
  setSun(3.5, 205);
  const sunLight = new THREE.DirectionalLight('#ffb070', 3.2); sunLight.position.copy(sun).multiplyScalar(100); scene.add(sunLight);
  scene.add(new THREE.HemisphereLight('#7f9ccc', '#3a2a24', 0.6));
  // Cloud deck: fbm noise lit from the sun side, scrolling to give speed.
  const cloudMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uSun: { value: sun.clone() }, uSpeed: { value: 0.02 } },
    vertexShader: 'varying vec3 vW; varying vec2 vUv; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }',
    fragmentShader: `
      uniform float uTime, uSpeed; uniform vec3 uSun; varying vec3 vW; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float v=0.0, a=0.5; for(int i=0;i<6;i++){ v+=a*n(p); p*=2.03; a*=0.5; } return v; }
      void main(){
        vec2 p = vW.xz * 0.0045 + vec2(uTime * uSpeed, 0.0);
        float d = fbm(p) ; float d2 = fbm(p + vec2(0.13, 0.07));
        float cover = smoothstep(0.42, 0.78, d);
        float shade = clamp((d - d2) * 6.0 + 0.55, 0.0, 1.0);           // sun-facing slopes brighter
        vec3 lit = mix(vec3(0.36,0.30,0.42), vec3(1.0,0.72,0.45), shade);
        vec3 col = mix(vec3(0.18,0.2,0.3), lit, cover);
        float dist = length(vW.xz);
        float fade = 1.0 - smoothstep(3500.0, 9000.0, dist);
        gl_FragColor = vec4(col, (0.35 + 0.65 * cover) * fade);
      }`,
  });
  const clouds = new THREE.Mesh(new THREE.PlaneGeometry(20000, 20000, 1, 1), cloudMat); clouds.rotation.x = -Math.PI / 2; clouds.position.y = -140; scene.add(clouds);
  // Sun lens flare: anamorphic streak plus ghosts.
  const flareTex = radial('rgba(255,236,200,1)', 'rgba(255,160,80,0)', 256);
  const ghost = radial('rgba(120,220,255,.6)', 'rgba(120,220,255,0)', 64);
  const streak = (() => { const c = document.createElement('canvas'); c.width = 512; c.height = 32; const g = c.getContext('2d'); const grd = g.createLinearGradient(0, 0, 512, 0); grd.addColorStop(0, 'rgba(90,180,255,0)'); grd.addColorStop(0.5, 'rgba(160,220,255,.9)'); grd.addColorStop(1, 'rgba(90,180,255,0)'); g.fillStyle = grd; g.fillRect(0, 12, 512, 8); const t = new THREE.CanvasTexture(c); return t; })();
  const lf = new Lensflare();
  lf.addElement(new LensflareElement(flareTex, 700, 0, new THREE.Color('#ffd8a8')));
  lf.addElement(new LensflareElement(streak, 1400, 0, new THREE.Color('#9fd4ff')));
  lf.addElement(new LensflareElement(ghost, 60, 0.4)); lf.addElement(new LensflareElement(ghost, 110, 0.7)); lf.addElement(new LensflareElement(ghost, 50, 1.0));
  const flareLight = new THREE.PointLight('#ffffff', 0); flareLight.position.copy(sun).multiplyScalar(9000); flareLight.add(lf); scene.add(flareLight);
  // Contrails: two fading ribbons of points behind the engines.
  const trailN = 240, trailPos = new Float32Array(trailN * 3 * 2);
  const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(trailPos, 3));
  const trail = new THREE.Points(tg, new THREE.PointsMaterial({ size: 1.3, color: '#ffffff', map: radial('rgba(255,255,255,.9)', 'rgba(255,255,255,0)', 32), transparent: true, opacity: 0.35, depthWrite: false }));
  trail.frustumCulled = false; scene.add(trail);
  return { scene, sky, sun, setSun, sunLight, clouds, cloudMat, trail, trailPos, trailN };
}

export function buildGlobe() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#020308');
  const globe = new THREE.Group(); scene.add(globe);
  // Holographic sphere: dark core, fresnel rim, faint scanlines.
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    vertexShader: 'varying vec3 vN; varying vec3 vP; void main(){ vN = normalize(normalMatrix * normal); vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float uTime; varying vec3 vN; varying vec3 vP;
      void main(){ float fr = pow(1.0 - abs(vN.z), 2.5);
        float scan = 0.5 + 0.5 * sin(vP.y * 120.0 - uTime * 2.0);
        vec3 c = vec3(0.02,0.05,0.09) + vec3(0.25,0.95,1.0) * fr * 0.9 + vec3(0.55,0.3,1.0) * fr * fr * 0.6;
        c += vec3(0.05,0.12,0.18) * scan * 0.05;
        gl_FragColor = vec4(c, 1.0); }`,
  });
  globe.add(new THREE.Mesh(new THREE.SphereGeometry(1, 96, 64), mat));
  // Graticule every 15°.
  const lines = [];
  const pushLine = (arr) => { for (let i = 0; i < arr.length - 1; i++) lines.push(...arr[i], ...arr[i + 1]); };
  for (let lat = -75; lat <= 75; lat += 15) { const a = []; for (let lon = -180; lon <= 180; lon += 3) a.push(toVec({ lat, lon }).map((v) => v * 1.002)); pushLine(a); }
  for (let lon = -180; lon < 180; lon += 15) { const a = []; for (let lat = -90; lat <= 90; lat += 3) a.push(toVec({ lat, lon }).map((v) => v * 1.002)); pushLine(a); }
  const gg = new THREE.BufferGeometry(); gg.setAttribute('position', new THREE.Float32BufferAttribute(lines, 3));
  globe.add(new THREE.LineSegments(gg, new THREE.LineBasicMaterial({ color: '#1f4a66', transparent: true, opacity: 0.55 })));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial('rgba(63,243,255,.35)', 'rgba(63,243,255,0)', 256), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(3.3, 3.3, 1); scene.add(glow);
  // Stars.
  const sN = 1500, sp = new Float32Array(sN * 3);
  for (let i = 0; i < sN; i++) { const v = new THREE.Vector3().randomDirection().multiplyScalar(40 + Math.random() * 20); sp.set([v.x, v.y, v.z], i * 3); }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3));
  scene.add(new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.12, color: '#cfe0ff', transparent: true, opacity: 0.7 })));
  // Route and range ring (rebuilt when the mission changes).
  const route = new THREE.Group(); globe.add(route);
  const cityDots = new THREE.Group(); globe.add(cityDots);
  const plane = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial('rgba(255,255,255,1)', 'rgba(255,79,216,0)', 64), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  plane.scale.set(0.09, 0.09, 1); globe.add(plane);
  return { scene, globe, mat, route, cityDots, plane, textSprite };
}

// Rebuild the route arc (lifted in proportion to sin(πt)) and the reachable range ring.
export function setRoute(G, from, to, rangeKm, feasible) {
  G.route.clear();
  const arc = greatCircle(from, to, 128).map((v, i, a) => { const t = i / (a.length - 1), lift = 1.004 + 0.07 * Math.sin(Math.PI * t) * Math.min(1, a.length); return new THREE.Vector3(v[0] * lift, v[1] * lift, v[2] * lift); });
  G.arcPts = arc;
  const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(arc), 200, 0.006, 8), new THREE.MeshBasicMaterial({ color: feasible ? '#ff4fd8' : '#ff4466' }));
  G.route.add(tube);
  const ring = rangeRing(from, rangeKm).map((v) => new THREE.Vector3(v[0] * 1.003, v[1] * 1.003, v[2] * 1.003));
  const rg = new THREE.BufferGeometry().setFromPoints(ring);
  G.route.add(new THREE.Line(rg, new THREE.LineBasicMaterial({ color: '#5dffa8', transparent: true, opacity: 0.85 })));
  for (const [p, c] of [[from, '#3ff3ff'], [to, feasible ? '#ff4fd8' : '#ff4466']]) {
    const v = toVec(p); const dot = new THREE.Mesh(new THREE.SphereGeometry(0.014, 12, 8), new THREE.MeshBasicMaterial({ color: c })); dot.position.set(v[0] * 1.005, v[1] * 1.005, v[2] * 1.005); G.route.add(dot);
  }
}
