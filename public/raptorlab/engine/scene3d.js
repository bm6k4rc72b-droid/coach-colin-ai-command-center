import * as THREE from 'three';
import { GEOM, nozzleContour } from './thermo.js';

// ─────────────────────────────────────────────────────────────────────────────
// RAPTOR LAB · 3D SCENE
// A night test stand with a generic full-flow methalox engine hanging nozzle-down.
// World units are metres; the engine axis is vertical (y). The nozzle wall is the
// Rao contour from thermo.js, so what you see is the geometry the maths uses.
// ─────────────────────────────────────────────────────────────────────────────

export const THROAT_Y = 1.95;                       // world height of the throat
const axialToY = (x) => THROAT_Y - x;               // contour x runs downstream

// Soft round sprite texture for particles.
function dotTexture(soft = 0.5) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(soft, 'rgba(255,255,255,.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// Frost: a noisy white alpha texture.
function frostTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d'); const img = g.createImageData(256, 64);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.random();
    img.data[i] = img.data[i + 1] = 240; img.data[i + 2] = 255;
    img.data[i + 3] = v > 0.55 ? 255 * (v - 0.35) : 90 * v;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(6, 1); return t;
}
// Heat map for the nozzle and chamber: hottest at the throat.
function heatTexture() {
  const c = document.createElement('canvas'); c.width = 4; c.height = 256;
  const g = c.getContext('2d'), grd = g.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#000'); grd.addColorStop(0.18, '#ff5a1a'); grd.addColorStop(0.3, '#ffd08a'); grd.addColorStop(0.42, '#ff6a20'); grd.addColorStop(0.75, '#5a0d00'); grd.addColorStop(1, '#000');
  g.fillStyle = grd; g.fillRect(0, 0, 4, 256);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
// Regenerative-cooling channels as a subtle normal-ish stripe texture.
function channelTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 8;
  const g = c.getContext('2d');
  for (let x = 0; x < 512; x++) { const v = 128 + 70 * Math.sin(x / 512 * Math.PI * 2 * 96); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(x, 0, 1, 8); }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; return t;
}

// ── Plume shader: supersonic core with Mach diamonds ───────────
const PlumeShader = {
  uniforms: {
    uTime: { value: 0 }, uLen: { value: 12 }, uCell: { value: 1.5 }, uPower: { value: 0 }, uR0: { value: GEOM.Re },
    uGreen: { value: 0 }, uSep: { value: 0 }, uMR: { value: 3.6 }, uFlick: { value: 0 }, uCam: { value: new THREE.Vector3(0, 0, 10) }, uRb: { value: GEOM.Re * 2.6 }, uH: { value: 14 },
  },
  vertexShader: `
    varying vec3 vPos; varying vec2 vUv;
    void main(){ vUv = uv; vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `
    uniform float uTime, uLen, uCell, uPower, uR0, uGreen, uSep, uMR, uFlick, uRb, uH; uniform vec3 uCam;
    varying vec3 vPos; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
    void main(){
      // Treat the plume as a volume: for this pixel's view ray (object space, axis = y),
      // find its closest approach to the jet axis (impact parameter d) and the height there.
      vec3 dir = normalize(vPos - uCam);
      vec2 dxz = dir.xz; float dl = max(dot(dxz, dxz), 1e-5);
      float tc = -dot(vPos.xz, dxz) / dl;
      vec3 pc = vPos + dir * tc;
      float s = clamp(-pc.y, 0.0, uH);                     // distance downstream of the exit plane (m)
      float a = s / uLen;                                  // 0 … 1 along the visible plume
      float d = abs(vPos.x * dxz.y - vPos.z * dxz.x) / sqrt(dl);
      float rMax = uR0 + (uRb - uR0) * (s / uH);           // jet boundary radius at this station
      float rn = clamp(d / rMax, 0.0, 1.0);
      float chord = sqrt(max(0.0, 1.0 - rn * rn));         // path length through the column (normalised)
      float rad = d;
      // Turbulent flicker, stronger when the flow is separated inside the nozzle.
      float n = noise(vec2(atan(vPos.z, vPos.x) * 3.0, s * 2.2 - uTime * 14.0));
      float n2 = noise(vec2(atan(vPos.z, vPos.x) * 7.0 + 3.0, s * 5.0 - uTime * 23.0));
      // Supersonic core: a tight, bright jet that thins downstream.
      float core = exp(-rn * rn * (4.2 - 1.5 * a)) * (1.0 - smoothstep(0.4, 1.0, a));
      float hot = exp(-s * 1.6) * exp(-rn * rn * 6.0);        // white-hot region right at the exit plane
      // Mach diamonds: shock intersections every uCell metres (Prandtl–Pack), fading downstream.
      float cellPos = s / uCell;
      float tri = 1.0 - abs(fract(cellPos) * 2.0 - 1.0);
      float width = 0.55 * (1.0 - 0.5 * tri);
      float diamond = smoothstep(0.78, 1.0, tri) * smoothstep(width, 0.0, rn) * exp(-cellPos * 0.35);
      float sheath = exp(-pow((rn - 0.8) * 3.5, 2.0)) * (0.3 + 0.7 * n) * (1.0 - a) * (1.0 - a);
      // Methalox exhaust: a violet-blue core, pink-white diamonds, a faint amber mixing layer.
      vec3 coreCol = mix(vec3(0.36, 0.5, 1.0), vec3(0.72, 0.32, 1.0), a);
      vec3 diaCol = vec3(1.0, 0.78, 0.96);
      vec3 sheathCol = mix(vec3(1.0, 0.5, 0.2), vec3(0.95, 0.3, 0.75), clamp(uMR - 3.0, 0.0, 1.0));
      vec3 col = coreCol * core * (0.7 + 0.4 * n) + diaCol * diamond * 3.2 + vec3(0.95, 0.95, 1.0) * hot * 2.2 + sheathCol * sheath * 0.35;
      // Burning copper turns the plume green.
      col = mix(col, vec3(0.2, 1.0, 0.45) * (core + diamond + hot + 0.3 * sheath) * 1.4, uGreen);
      float alpha = (core * 0.55 + diamond * 0.95 + hot * 0.8 + sheath * 0.14) * uPower * (0.35 + 0.65 * chord);
      alpha *= 1.0 - uSep * 0.5 * n2 - uFlick * 0.3 * n2;
      if (alpha < 0.003) discard;
      gl_FragColor = vec4(col * alpha, alpha);
    }`,
};

export function buildScene() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#03040a');
  scene.fog = new THREE.FogExp2('#03040a', 0.009);
  const root = new THREE.Group(); scene.add(root);
  const dot = dotTexture();

  // ── Sky, stars, horizon glow ─────────────────────
  const skyGeo = new THREE.SphereGeometry(180, 32, 16);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {},
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec3 vP; void main(){ float h = normalize(vP).y;
      vec3 top = vec3(0.004,0.005,0.014), mid = vec3(0.015,0.012,0.035), hor = vec3(0.11,0.04,0.08);
      vec3 c = mix(hor, mid, smoothstep(-0.02, 0.12, h)); c = mix(c, top, smoothstep(0.12, 0.6, h));
      c += vec3(0.02,0.05,0.09) * exp(-abs(h) * 30.0);
      gl_FragColor = vec4(c, 1.0); }`,
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));
  {
    const n = 1800, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const u = Math.random(), v = Math.random() * 0.45 + 0.05; const th = u * Math.PI * 2, ph = Math.acos(v); pos.set([170 * Math.sin(ph) * Math.cos(th), 170 * Math.cos(ph), 170 * Math.sin(ph) * Math.sin(th)], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 0.9, map: dot, color: '#cfe6ff', transparent: true, opacity: 0.75, depthWrite: false, fog: false })));
  }

  // ── Test stand ──────────────────────────────────
  const steel = new THREE.MeshStandardMaterial({ color: '#2a3140', metalness: 0.75, roughness: 0.45 });
  const accent = new THREE.MeshStandardMaterial({ color: '#ffb86b', emissive: '#ff8a3d', emissiveIntensity: 0.25, metalness: 0.4, roughness: 0.5 });
  const concrete = new THREE.MeshStandardMaterial({ color: '#1b1d24', roughness: 0.95 });
  const stand = new THREE.Group(); root.add(stand);
  const deckY = -0.35;
  // Open grated platform around the plume opening (so the plume reads from any angle).
  const grate = new THREE.MeshStandardMaterial({ color: '#232834', metalness: 0.7, roughness: 0.55 });
  for (const [x, z, w, d] of [[0, -3.4, 9, 2.4], [0, 3.4, 9, 2.4], [-3.4, 0, 2.4, 4.4], [3.4, 0, 2.4, 4.4]]) {
    const slab = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), grate); slab.position.set(x, deckY, z); stand.add(slab);
  }
  // Hazard edge glow around the opening.
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(4.4, 0.02, 4.4)), new THREE.LineBasicMaterial({ color: '#ff4fd8' }));
  edge.position.y = deckY + 0.01; stand.add(edge);
  // Columns and beams.
  for (const [x, z] of [[-2.6, -2.6], [2.6, -2.6], [-2.6, 2.6], [2.6, 2.6]]) {
    const col = new THREE.Mesh(new THREE.BoxGeometry(0.28, 7.6, 0.28), steel); col.position.set(x, deckY + 3.8, z); stand.add(col);
  }
  for (const y of [3.45, 6.8]) for (const [a, b, w, d] of [[0, -2.6, 5.5, 0.22], [0, 2.6, 5.5, 0.22], [-2.6, 0, 0.22, 5.5], [2.6, 0, 0.22, 5.5]]) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(w, 0.26, d), steel); beam.position.set(a, y, b); stand.add(beam);
  }
  // Thrust-take-out structure and diagonal bracing.
  const thrustBeam = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.4, 0.5), steel); thrustBeam.position.set(0, 3.75, 0); stand.add(thrustBeam);
  for (const s of [-1, 1]) for (const z of [-2.6, 2.6]) {
    const br = new THREE.Mesh(new THREE.BoxGeometry(0.1, 4.6, 0.1), steel); br.position.set(s * 1.3, deckY + 1.9, z); br.rotation.z = s * 0.52; stand.add(br);
  }
  // Catwalk with glowing rails.
  const walk = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.06, 1.0), steel); walk.position.set(0, 2.2, -3.2); stand.add(walk);
  const rail = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.04, 0.04), accent); rail.position.set(0, 3.2, -3.7); stand.add(rail);
  // Flame deflector below the deck.
  const deflector = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 5, 2.2, 32, 1, true), new THREE.MeshStandardMaterial({ color: '#221a1a', roughness: 0.8, metalness: 0.3, side: THREE.DoubleSide }));
  deflector.position.y = -9; stand.add(deflector);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(160, 48), new THREE.MeshStandardMaterial({ color: '#050609', roughness: 0.95, metalness: 0.1 }));
  ground.rotation.x = -Math.PI / 2; ground.position.y = -10; root.add(ground);
  // Tanks in the distance.
  for (const [x, z, h, col] of [[-22, -30, 16, '#1d2d44'], [-14, -34, 13, '#2a1d3a'], [26, -28, 18, '#1d2d44']]) {
    const tank = new THREE.Mesh(new THREE.CapsuleGeometry(2.4, h, 8, 24), new THREE.MeshStandardMaterial({ color: col, metalness: 0.6, roughness: 0.35 }));
    tank.position.set(x, -10 + h / 2 + 2.4, z); root.add(tank);
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.18, 12, 8), new THREE.MeshBasicMaterial({ color: '#ff3355' })); beacon.position.set(x, -10 + h + 5, z); root.add(beacon);
  }

  // Floodlights with volumetric cones.
  const lights = new THREE.Group(); root.add(lights);
  lights.add(new THREE.HemisphereLight('#6d7cff', '#12060e', 0.12));
  const key = new THREE.SpotLight('#bcd8ff', 30, 40, 0.38, 0.7, 1.6); key.position.set(8, 9, 9); key.target.position.set(0, 2, 0); lights.add(key, key.target);
  const rim = new THREE.SpotLight('#ff7ad9', 26, 40, 0.42, 0.7, 1.6); rim.position.set(-9, 7, -6); rim.target.position.set(0, 2.2, 0); lights.add(rim, rim.target);
  const plumeLight = new THREE.PointLight('#8aa4ff', 0, 26, 2); plumeLight.position.set(0, -0.8, 0); root.add(plumeLight);
  const trenchLight = new THREE.PointLight('#ff9a55', 0, 40, 1.4); trenchLight.position.set(0, -7, 0); root.add(trenchLight);

  // ── Engine ──────────────────────────────────────
  const engine = new THREE.Group(); root.add(engine);
  engine.position.y = 0;
  const gimbalPivot = new THREE.Group(); gimbalPivot.position.y = 3.55; engine.add(gimbalPivot);
  const body = new THREE.Group(); body.position.y = -3.55; gimbalPivot.add(body);
  const parts = {};                                   // named groups for the exploded view
  const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 0);
  const clipped = [];                                 // materials that honour the cutaway
  const mat = (m) => { clipped.push(m); return m; };

  const copper = mat(new THREE.MeshPhysicalMaterial({ color: '#c98a5a', metalness: 1, roughness: 0.28, clearcoat: 0.4, side: THREE.DoubleSide }));
  const heatMap = heatTexture();
  const chan = channelTexture();
  const nozzleMat = mat(new THREE.MeshPhysicalMaterial({ color: '#8d93a1', metalness: 0.95, roughness: 0.32, bumpMap: chan, bumpScale: 0.6, emissive: '#ffffff', emissiveMap: heatMap, emissiveIntensity: 0, side: THREE.DoubleSide, clearcoat: 0.3 }));
  const dark = mat(new THREE.MeshStandardMaterial({ color: '#3a4150', metalness: 0.85, roughness: 0.38 }));
  const fuelTint = mat(new THREE.MeshPhysicalMaterial({ color: '#7d6a78', metalness: 0.9, roughness: 0.32, clearcoat: 0.4, emissive: '#ff4fd8', emissiveIntensity: 0.04 }));
  const oxTint = mat(new THREE.MeshPhysicalMaterial({ color: '#627787', metalness: 0.9, roughness: 0.32, clearcoat: 0.4, emissive: '#3ff3ff', emissiveIntensity: 0.04 }));

  // Nozzle + chamber from the Rao contour (lathe about the axis).
  const C = nozzleContour(GEOM, 72);
  const wall = C.pts.map(([x, r]) => new THREE.Vector2(r, axialToY(x)));
  const nozGeo = new THREE.LatheGeometry(wall, 96);
  // UV v follows the wall so the heat map lines up with the throat.
  { const uv = nozGeo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i)); }
  const nozzle = new THREE.Mesh(nozGeo, nozzleMat);
  parts.nozzle = new THREE.Group(); parts.nozzle.add(nozzle); body.add(parts.nozzle);
  // Nozzle lip ring and the chamber/manifold ring.
  const lip = new THREE.Mesh(new THREE.TorusGeometry(GEOM.Re + 0.01, 0.025, 12, 96), dark); lip.rotation.x = Math.PI / 2; lip.position.y = axialToY(C.pts.at(-1)[0]); parts.nozzle.add(lip);
  const chamberTopY = axialToY(C.pts[0][0]);
  parts.chamber = new THREE.Group(); body.add(parts.chamber);
  const manifold = new THREE.Mesh(new THREE.TorusGeometry(GEOM.Rc + 0.05, 0.05, 16, 64), copper); manifold.rotation.x = Math.PI / 2; manifold.position.y = THROAT_Y + 0.05; parts.chamber.add(manifold);
  // Injector dome and hot-gas manifolds (fuel-rich and ox-rich).
  const dome = new THREE.Mesh(new THREE.SphereGeometry(GEOM.Rc + 0.02, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), dark);
  dome.position.y = chamberTopY; dome.scale.y = 0.55; parts.chamber.add(dome);
  const hgF = new THREE.Mesh(new THREE.TorusGeometry(GEOM.Rc + 0.07, 0.07, 16, 64), fuelTint); hgF.rotation.x = Math.PI / 2; hgF.position.y = chamberTopY - 0.02; parts.chamber.add(hgF);
  const hgO = new THREE.Mesh(new THREE.TorusGeometry(GEOM.Rc + 0.07, 0.07, 16, 64), oxTint); hgO.rotation.x = Math.PI / 2; hgO.position.y = chamberTopY + 0.14; parts.chamber.add(hgO);
  // Gimbal block and thrust puck.
  const puck = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.3, 32), dark); puck.position.y = chamberTopY + 0.5; parts.chamber.add(puck);
  const cross = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.12), accent); cross.position.y = chamberTopY + 0.68; parts.chamber.add(cross);
  const cross2 = cross.clone(); cross2.rotation.y = Math.PI / 2; parts.chamber.add(cross2);

  // Turbopumps (fuel at +x, ox at −x) and preburners above them.
  const buildTP = (side, tint) => {
    const g = new THREE.Group();
    const x = side * 0.62;
    const pumpY = THROAT_Y + 0.35;
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.17, 0.5, 40), dark); housing.position.set(x, pumpY, 0); g.add(housing);
    const volute = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.065, 16, 48), tint); volute.rotation.x = Math.PI / 2; volute.position.set(x, pumpY - 0.18, 0); g.add(volute);
    const inducer = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 0.22, 24), tint); inducer.position.set(x, pumpY - 0.38, 0); g.add(inducer);
    const turbine = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.16, 0.24, 40), copper); turbine.position.set(x, pumpY + 0.35, 0); g.add(turbine);
    const pb = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.42, 8, 24), tint); pb.position.set(x, pumpY + 0.78, 0); g.add(pb);
    const pbRing = new THREE.Mesh(new THREE.TorusGeometry(0.125, 0.018, 8, 32), accent); pbRing.rotation.x = Math.PI / 2; pbRing.position.set(x, pumpY + 0.62, 0); g.add(pbRing);
    // Hot-gas duct from the turbine to the injector manifold.
    const duct = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([new THREE.Vector3(x, pumpY + 0.35, 0), new THREE.Vector3(x * 0.8, pumpY + 0.3, 0.12), new THREE.Vector3(side * (GEOM.Rc + 0.1), side > 0 ? chamberTopY - 0.02 : chamberTopY + 0.14, 0.05)]), 24, 0.06, 12), tint);
    g.add(duct);
    return { g, pumpY, x, turbine, pb };
  };
  const tpF = buildTP(1, fuelTint), tpO = buildTP(-1, oxTint);
  parts.tpF = tpF.g; parts.tpO = tpO.g; body.add(tpF.g, tpO.g);

  // Propellant lines (curves shared by pipes, frost, and flow particles).
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const curves = {
    ch4In: new THREE.CatmullRomCurve3([V(1.9, 5.6, 0.9), V(1.4, 4.4, 0.6), V(0.9, 3.4, 0.25), V(0.62, tpF.pumpY - 0.5, 0.05), V(0.62, tpF.pumpY - 0.42, 0)]),
    loxIn: new THREE.CatmullRomCurve3([V(-1.9, 5.6, -0.9), V(-1.4, 4.4, -0.6), V(-0.9, 3.4, -0.25), V(-0.62, tpO.pumpY - 0.5, -0.05), V(-0.62, tpO.pumpY - 0.42, 0)]),
    ch4Dis: new THREE.CatmullRomCurve3([V(0.8, tpF.pumpY - 0.18, 0), V(0.95, tpF.pumpY + 0.2, 0.22), V(0.78, tpF.pumpY + 0.62, 0.18), V(0.66, tpF.pumpY + 0.7, 0.05)]),
    loxDis: new THREE.CatmullRomCurve3([V(-0.8, tpO.pumpY - 0.18, 0), V(-0.95, tpO.pumpY + 0.2, -0.22), V(-0.78, tpO.pumpY + 0.62, -0.18), V(-0.66, tpO.pumpY + 0.7, -0.05)]),
    // Cross-feeds: a little LOX to the fuel-rich preburner, a little CH4 to the ox-rich one.
    xOx: new THREE.CatmullRomCurve3([V(-0.8, tpO.pumpY - 0.1, 0.1), V(-0.3, tpO.pumpY + 0.95, 0.35), V(0.3, tpF.pumpY + 0.95, 0.35), V(0.6, tpF.pumpY + 0.8, 0.1)]),
    xFu: new THREE.CatmullRomCurve3([V(0.8, tpF.pumpY - 0.1, -0.1), V(0.3, tpF.pumpY + 1.05, -0.35), V(-0.3, tpO.pumpY + 1.05, -0.35), V(-0.6, tpO.pumpY + 0.8, -0.1)]),
    hotF: new THREE.CatmullRomCurve3([V(0.62, tpF.pumpY + 0.35, 0), V(0.48, tpF.pumpY + 0.3, 0.12), V(0.27, chamberTopY - 0.02, 0.05), V(0, chamberTopY - 0.1, 0), V(0, THROAT_Y + 0.1, 0)]),
    hotO: new THREE.CatmullRomCurve3([V(-0.62, tpO.pumpY + 0.35, 0), V(-0.48, tpO.pumpY + 0.3, -0.12), V(-0.27, chamberTopY + 0.14, -0.05), V(0, chamberTopY - 0.1, 0), V(0, THROAT_Y + 0.1, 0)]),
  };
  const pipeMat = mat(new THREE.MeshPhysicalMaterial({ color: '#aab2c2', metalness: 0.9, roughness: 0.25, clearcoat: 0.5 }));
  const frostMat = { F: new THREE.MeshStandardMaterial({ color: '#b9cfe2', roughness: 0.95, envMapIntensity: 0.25, transparent: true, opacity: 0, alphaMap: frostTexture(), depthWrite: false }), O: null };
  frostMat.O = frostMat.F.clone(); frostMat.O.alphaMap = frostTexture();
  parts.lines = new THREE.Group(); body.add(parts.lines);
  const radii = { ch4In: 0.075, loxIn: 0.085, ch4Dis: 0.05, loxDis: 0.055, xOx: 0.022, xFu: 0.022 };
  const frostMeshes = [];
  for (const [k, r] of Object.entries(radii)) {
    const pipe = new THREE.Mesh(new THREE.TubeGeometry(curves[k], 64, r, 16), pipeMat); parts.lines.add(pipe);
    if (k.endsWith('In') || k.endsWith('Dis')) {
      const side = k.startsWith('ch4') ? 'F' : 'O';
      const fm = new THREE.Mesh(new THREE.TubeGeometry(curves[k], 64, r * 1.35, 16), frostMat[side]); fm.userData.side = side; parts.lines.add(fm); frostMeshes.push(fm);
    }
  }
  // Tank-side flanges glowing at the top (where the lines leave the frame).
  for (const [x, z, c] of [[1.9, 0.9, '#ff4fd8'], [-1.9, -0.9, '#3ff3ff']]) { const fl = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.02, 8, 24), new THREE.MeshBasicMaterial({ color: c })); fl.position.set(x, 5.6, z); fl.rotation.x = Math.PI / 2; body.add(fl); }

  // ── Flow particles along the curves ──────────────
  const flows = [];
  const addFlow = (curveKey, color, count, size) => {
    const pos = new Float32Array(count * 3), phase = new Float32Array(count);
    for (let i = 0; i < count; i++) phase[i] = Math.random();
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(g, new THREE.PointsMaterial({ color, size, map: dot, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
    pts.frustumCulled = false; body.add(pts);
    const f = { curve: curves[curveKey], pts, phase, speed: 0, level: 0, key: curveKey };
    flows.push(f); return f;
  };
  const flow = {
    ch4In: addFlow('ch4In', '#ff6fd8', 70, 0.05), loxIn: addFlow('loxIn', '#58d8ff', 70, 0.05),
    ch4Dis: addFlow('ch4Dis', '#ff6fd8', 40, 0.06), loxDis: addFlow('loxDis', '#58d8ff', 40, 0.06),
    xOx: addFlow('xOx', '#8ff0ff', 26, 0.045), xFu: addFlow('xFu', '#ffa6ea', 26, 0.045),
    hotF: addFlow('hotF', '#ffb86b', 60, 0.08), hotO: addFlow('hotO', '#ff7a9a', 60, 0.08),
  };

  // Cold vapour shed by frosted lines (sinks, because cold gas is dense).
  const vapN = 260, vapPos = new Float32Array(vapN * 3), vapLife = new Float32Array(vapN), vapVel = new Float32Array(vapN * 3);
  const vapGeo = new THREE.BufferGeometry(); vapGeo.setAttribute('position', new THREE.BufferAttribute(vapPos, 3));
  const vapor = new THREE.Points(vapGeo, new THREE.PointsMaterial({ color: '#dff2ff', size: 0.35, map: dot, transparent: true, opacity: 0, depthWrite: false }));
  vapor.frustumCulled = false; body.add(vapor);

  // ── Plume ───────────────────────────────────────
  const exitY = axialToY(C.pts.at(-1)[0]);
  const plumeLen = 14;
  const plumeGeo = new THREE.CylinderGeometry(GEOM.Re * 0.96, GEOM.Re * 2.6, plumeLen, 64, 64, true);
  plumeGeo.translate(0, -plumeLen / 2, 0);
  const plumeMat = new THREE.ShaderMaterial({ uniforms: THREE.UniformsUtils.clone(PlumeShader.uniforms), vertexShader: PlumeShader.vertexShader, fragmentShader: PlumeShader.fragmentShader, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.FrontSide });
  const plume = new THREE.Mesh(plumeGeo, plumeMat); plume.position.y = exitY; plume.renderOrder = 5;
  parts.nozzle.add(plume);
  // Exit glow and chamber glow sprites.
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: '#9fb2ff', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(4, 4, 1); glow.position.y = exitY - 0.3; parts.nozzle.add(glow);
  const throatGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: '#ffd9a8', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  throatGlow.scale.set(0.9, 0.9, 1); throatGlow.position.y = THROAT_Y; body.add(throatGlow);
  // Preburner sparks (ignition).
  const spark = (x, y) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: '#fff2c4', transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending })); s.scale.set(0.5, 0.5, 1); s.position.set(x, y, 0.12); body.add(s); return s; };
  const sparks = { F: spark(0.62, tpF.pumpY + 0.78), O: spark(-0.62, tpO.pumpY + 0.78), M: spark(0, chamberTopY - 0.05) };

  // Steam clouds billowing out of the flame trench: large soft billboards, lit by the plume.
  const cloudTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
    for (let i = 0; i < 26; i++) {
      const x = 64 + (Math.random() - 0.5) * 60, y = 64 + (Math.random() - 0.5) * 50, r = 18 + Math.random() * 30;
      const grd = g.createRadialGradient(x, y, 0, x, y, r); grd.addColorStop(0, 'rgba(255,255,255,.22)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const clouds = [];
  for (let i = 0; i < 18; i++) {
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, color: '#9a8fc0', transparent: true, opacity: 0, depthWrite: false }));
    sp.userData = { life: -Math.random() * 5, max: 4 + Math.random() * 3, ang: Math.random() * Math.PI * 2, spd: 2 + Math.random() * 4, rot: (Math.random() - 0.5) * 0.4 };
    root.add(sp); clouds.push(sp);
  }

  return {
    scene, root, engine, gimbalPivot, body, parts, curves, flow, flows, frostMat, frostMeshes, clipPlane, clipped,
    plume, plumeMat, glow, throatGlow, sparks, plumeLight, trenchLight, nozzleMat, exitY, chamberTopY,
    vapor: { pts: vapor, pos: vapPos, life: vapLife, vel: vapVel, n: vapN },
    clouds,
    tp: { F: tpF, O: tpO },
  };
}

// Exploded-view offsets for each named group.
export const EXPLODE = { nozzle: [0, -1.6, 0], chamber: [0, 0.9, 0], tpF: [1.4, 0.3, 0.4], tpO: [-1.4, 0.3, -0.4], lines: [0, 1.1, 0] };
