import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// CHRONOS · relativistic starfield. Every star is a direction; the vertex shader
// applies the aberration of light for the ship's speed β along +fwd, and shifts
// each star's colour temperature and brightness by the Doppler factor
//   cos θ' = (cos θ + β)/(1 + β cos θ),   D = 1/(γ(1 − β cos θ')),   T' = D·T,   I' ∝ D⁴
// so at 0.9c the sky crowds forward into a blue-white tunnel, red and dim behind.
// ─────────────────────────────────────────────────────────────────────────────

export function buildStarfield(n = 9000) {
  const pos = new Float32Array(n * 3), temp = new Float32Array(n), mag = new Float32Array(n);
  let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    let x, y, z;
    // A third of the stars hug a galactic band.
    if (i % 3 === 0) { const a = r() * Math.PI * 2, h = (r() - 0.5) * 0.25; x = Math.cos(a); z = Math.sin(a); y = h; const l = Math.hypot(x, y, z); x /= l; y /= l; z /= l; const tilt = 0.5; const y2 = y * Math.cos(tilt) - z * Math.sin(tilt); z = y * Math.sin(tilt) + z * Math.cos(tilt); y = y2; }
    else { const u = r() * 2 - 1, a = r() * Math.PI * 2; x = Math.sqrt(1 - u * u) * Math.cos(a); y = u; z = Math.sqrt(1 - u * u) * Math.sin(a); }
    pos.set([x, y, z], i * 3); temp[i] = 3000 + Math.pow(r(), 2.2) * 25000; mag[i] = Math.pow(r(), 6);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('temp', new THREE.BufferAttribute(temp, 1)); g.setAttribute('mag', new THREE.BufferAttribute(mag, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uBeta: { value: 0 }, uFwd: { value: new THREE.Vector3(0, 0, -1) }, uR: { value: 900 }, uPix: { value: 1 } },
    vertexShader: `
      attribute float temp; attribute float mag; uniform float uBeta, uR, uPix; uniform vec3 uFwd; varying vec3 vCol; varying float vI;
      vec3 bb(float T){ // blackbody → sRGB-ish (fit, 1000–40000 K)
        float t = T / 100.0; vec3 c;
        c.r = t <= 66.0 ? 1.0 : clamp(1.293 * pow(t - 60.0, -0.1332), 0.0, 1.0);
        c.g = t <= 66.0 ? clamp(0.390 * log(t) - 0.631, 0.0, 1.0) : clamp(1.129 * pow(t - 60.0, -0.0755), 0.0, 1.0);
        c.b = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : clamp(0.543 * log(t - 10.0) - 1.196, 0.0, 1.0));
        return c; }
      void main(){
        vec3 d = normalize(position); float ct = dot(d, uFwd);
        float b = uBeta, g = inversesqrt(max(1e-6, 1.0 - b*b));
        float ct2 = (ct + b) / (1.0 + b * ct);                         // aberration
        vec3 perp = d - uFwd * ct; float pl = length(perp); perp = pl > 1e-5 ? perp / pl : vec3(1.0, 0.0, 0.0);
        vec3 d2 = uFwd * ct2 + perp * sqrt(max(0.0, 1.0 - ct2*ct2));
        float D = 1.0 / (g * (1.0 - b * ct2));                          // Doppler factor
        vCol = bb(clamp(temp * D, 1000.0, 40000.0));
        vI = clamp((0.25 + 0.75 * mag) * pow(D, 2.0), 0.0, 6.0);
        vec4 mv = modelViewMatrix * vec4(d2 * uR, 1.0); gl_Position = projectionMatrix * mv;
        gl_PointSize = clamp((1.1 + 3.2 * mag) * sqrt(max(0.05, vI)) * uPix, 0.6, 9.0);
      }`,
    fragmentShader: `varying vec3 vCol; varying float vI;
      void main(){ vec2 q = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(q)); gl_FragColor = vec4(vCol * min(vI, 3.0), a * min(1.0, vI)); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false;
  return pts;
}

// A sleek ring-hulled starship in brass, titanium and light.
export function buildShip() {
  const g = new THREE.Group();
  const hullM = new THREE.MeshStandardMaterial({ color: '#c9ced6', metalness: 0.85, roughness: 0.25 });
  const brass = new THREE.MeshStandardMaterial({ color: '#c9a35a', metalness: 1, roughness: 0.28 });
  const glow = new THREE.MeshBasicMaterial({ color: '#7fe8ff' });
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 4.2, 24), hullM); spine.rotation.x = Math.PI / 2; g.add(spine);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.9, 24), hullM); nose.rotation.x = -Math.PI / 2; nose.position.z = -2.55; g.add(nose);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.09, 16, 96), brass); ring.position.z = 0.4; g.add(ring);
  const ringGlow = new THREE.Mesh(new THREE.TorusGeometry(1.15, 0.025, 8, 96), glow); ringGlow.position.z = 0.4; g.add(ringGlow);
  for (let k = 0; k < 4; k++) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.1, 0.06), brass); sp.position.z = 0.4; sp.rotation.z = (k / 4) * Math.PI; g.add(sp); }
  const mod = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.0, 24), hullM); mod.rotation.x = Math.PI / 2; mod.position.z = -1.2; g.add(mod);
  const drive = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.5, 0.6, 24, 1, true), brass); drive.rotation.x = Math.PI / 2; drive.position.z = 2.3; g.add(drive);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.42, 3.2, 24, 1, true), new THREE.MeshBasicMaterial({ color: '#bfefff', transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  flame.rotation.x = -Math.PI / 2; flame.position.z = 4.1; g.add(flame);
  g.userData = { flame, ringGlow };
  return g;
}

// Ray-traced Schwarzschild black hole (units of r_s). Photon paths in the plane of their angular
// momentum obey  d²x/dλ² = −(3/2)·h²·x/|x|⁵  (rantonels' form of the null geodesic), integrated per
// pixel. A thin accretion disk (r = 3–14 r_s) glows with T ∝ r^(−3/4), Doppler-beamed by its Keplerian
// rotation, and dimmed by gravitational redshift √(1 − 1/r). A cyan ring marks the probe's orbit radius.
export function buildBlackHole() {
  const mat = new THREE.ShaderMaterial({
    uniforms: { uCam: { value: new THREE.Vector3(0, 2, -22) }, uInvProj: { value: new THREE.Matrix4() }, uCamRot: { value: new THREE.Matrix4() }, uTime: { value: 0 }, uProbe: { value: 6 }, uDisk: { value: 1 } },
    vertexShader: `varying vec2 vNdc; void main(){ vNdc = position.xy; gl_Position = vec4(position.xy, 0.9999, 1.0); }`,
    fragmentShader: `
      uniform vec3 uCam; uniform mat4 uInvProj, uCamRot; uniform float uTime, uProbe, uDisk; varying vec2 vNdc;
      float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
      vec3 sky(vec3 d){
        vec3 c = vec3(0.0); vec3 q = d * 160.0; vec3 id = floor(q); float h = hash(id);
        if (h > 0.985) { vec3 f = fract(q) - 0.5; float s = smoothstep(0.32, 0.0, length(f)); c += vec3(0.8 + 0.2*h, 0.85, 1.0) * s * (h - 0.985) * 60.0; }
        float band = exp(-pow((d.y * 0.9 + d.z * 0.35) * 4.0, 2.0)); c += vec3(0.12, 0.09, 0.16) * band + vec3(0.05, 0.07, 0.12) * band * hash(floor(d * 40.0));
        return c; }
      vec3 bb(float T){ float t = T / 100.0; vec3 c;
        c.r = t <= 66.0 ? 1.0 : clamp(1.293 * pow(t - 60.0, -0.1332), 0.0, 1.0);
        c.g = t <= 66.0 ? clamp(0.390 * log(t) - 0.631, 0.0, 1.0) : clamp(1.129 * pow(t - 60.0, -0.0755), 0.0, 1.0);
        c.b = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : clamp(0.543 * log(t - 10.0) - 1.196, 0.0, 1.0)); return c; }
      void main(){
        vec4 v = uInvProj * vec4(vNdc, 1.0, 1.0); vec3 dir = normalize((uCamRot * vec4(normalize(v.xyz / v.w), 0.0)).xyz);
        vec3 p = uCam, vel = dir; vec3 hv = cross(p, vel); float h2 = dot(hv, hv);
        vec3 col = vec3(0.0); float alpha = 1.0; bool captured = false;
        for (int i = 0; i < 220; i++) {
          float r2 = dot(p, p), r = sqrt(r2);
          float dt = clamp(0.06 * r, 0.02, 1.2);
          vec3 acc = -1.5 * h2 * p / pow(r2, 2.5);
          vec3 pn = p + vel * dt; vel += acc * dt; vec3 prev = p; p = pn;
          if (dot(p, p) < 1.0) { captured = true; break; }
          if (prev.y * p.y < 0.0) {
            vec3 x = mix(prev, p, prev.y / (prev.y - p.y)); float rr = length(x.xz);
            if (uDisk > 0.5 && rr > 3.0 && rr < 14.0) {
              float T = 9000.0 * pow(rr / 3.0, -0.75);
              vec3 vd = normalize(vec3(-x.z, 0.0, x.x)) * sqrt(0.5 / rr);           // Keplerian, c = 1
              float b = length(vd), g = 1.0 / sqrt(1.0 - b*b);
              float D = 1.0 / (g * (1.0 + dot(vd, normalize(vel))));                // beaming toward the camera ray
              float grav = sqrt(1.0 - 1.0 / rr);
              float swirl = 0.65 + 0.35 * sin(atan(x.z, x.x) * 7.0 + rr * 1.3 - uTime * 0.6 / pow(rr / 3.0, 1.5));
              float edge = smoothstep(3.0, 3.6, rr) * smoothstep(14.0, 10.0, rr);
              vec3 dc = bb(T * D * grav) * min(pow(D, 3.0), 4.0) * grav * swirl * edge * 0.5;
              col += dc * alpha; alpha *= 0.35;
            }
            if (abs(rr - uProbe) < 0.06) { col += vec3(0.25, 0.95, 1.0) * alpha * 1.5; }
          }
          if (r > 60.0 && dot(p, vel) > 0.0) break;
        }
        if (!captured) col += sky(normalize(vel)) * alpha;
        gl_FragColor = vec4(col, 1.0);
      }`,
    depthWrite: false, depthTest: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat); mesh.frustumCulled = false; mesh.renderOrder = -10;
  return mesh;
}

// Wormhole embedding diagram: z(r) = ±b·arccosh(r/b), two sheets joined at the throat, drawn as a
// glowing coordinate grid; each sheet is one region of space, and each mouth carries a clock.
export function buildWormhole(b = 1) {
  const g = new THREE.Group();
  const rMax = 7, segR = 60, segA = 96, verts = [];
  const lines = [];
  for (const side of [1, -1]) {
    for (let i = 0; i <= 12; i++) { const r = b + ((rMax - b) * i) / 12, pts = []; for (let k = 0; k <= segA; k++) { const a = (k / segA) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * r, side * b * Math.acosh(r / b), Math.sin(a) * r)); } lines.push(pts); }
    for (let k = 0; k < 32; k++) { const a = (k / 32) * Math.PI * 2, pts = []; for (let i = 0; i <= segR; i++) { const r = b + (rMax - b) * (i / segR) ** 1.6; pts.push(new THREE.Vector3(Math.cos(a) * r, side * b * Math.acosh(r / b), Math.sin(a) * r)); } lines.push(pts); }
  }
  void verts;
  const mat = new THREE.LineBasicMaterial({ color: '#7fe8ff', transparent: true, opacity: 0.45, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const pts of lines) g.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat));
  const throat = new THREE.Mesh(new THREE.TorusGeometry(b, 0.04, 12, 96), new THREE.MeshBasicMaterial({ color: '#ffcc66' })); throat.rotation.x = Math.PI / 2; g.add(throat);
  const surf = new THREE.Mesh(new THREE.LatheGeometry(Array.from({ length: 80 }, (_, i) => { const y = -2.6 + (5.2 * i) / 79; return new THREE.Vector2(b * Math.cosh(y / b), y); }), 96), new THREE.MeshBasicMaterial({ color: '#1a3a66', transparent: true, opacity: 0.18, side: THREE.DoubleSide, depthWrite: false }));
  g.add(surf);
  g.userData = { mat, throat };
  return g;
}
