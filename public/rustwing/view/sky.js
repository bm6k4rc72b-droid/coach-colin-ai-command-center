import * as THREE from 'three';

// RUSTWING · the sky. A full-screen ray tracer drawn behind the 3D scene. Every pixel's ray is bent by a
// Schwarzschild black hole (units of r_s, the null-geodesic acceleration a = −1.5·h²·r̂/r⁴ with h = |r × v|),
// crosses a thin accretion disk (temperature ∝ r^−3/4, Doppler-beamed by its Keplerian speed and dimmed by
// gravitational redshift), or escapes to a procedural star field. A second mode bends light around a binary
// pair, and a third streaks the stars into a hyperspace tunnel.

const vert = `varying vec2 vNdc; void main(){ vNdc = position.xy; gl_Position = vec4(position.xy, 1.0, 1.0); }`;
const frag = `
precision highp float;
varying vec2 vNdc;
uniform mat4 uInvProj, uCamWorld; uniform vec3 uCam;
uniform vec3 uBH; uniform float uRs, uMode, uDisk, uWarp, uTime, uSpin;
uniform vec3 uB1, uB2; uniform float uR1, uR2;
float hash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x), mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y), mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x), mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z); }
vec3 sky(vec3 d){
  vec3 col = vec3(0.0);
  // Stars: one candidate per cell on a few scales.
  for (int s = 0; s < 3; s++) {
    float sc = 90.0 + float(s) * 110.0; vec3 q = d * sc, id = floor(q), f = fract(q) - 0.5;
    float h = hash(id + float(s) * 13.1); if (h > 0.965) { vec3 o = vec3(hash(id + 1.7), hash(id + 2.9), hash(id + 4.3)) - 0.5; float r = length(f - o * 0.7);
      float b = smoothstep(0.08, 0.0, r) * (h - 0.965) * 38.0; vec3 tint = mix(vec3(0.7, 0.8, 1.0), vec3(1.0, 0.85, 0.65), hash(id + 7.7)); col += tint * b; }
  }
  // Nebula and the band of the galaxy.
  float n = noise(d * 3.0) * 0.6 + noise(d * 7.0) * 0.3 + noise(d * 15.0) * 0.1;
  float band = exp(-pow(dot(d, normalize(vec3(0.2, 1.0, 0.35))) * 3.2, 2.0));
  col += vec3(0.16, 0.08, 0.22) * pow(n, 2.2) * 1.3 + vec3(0.12, 0.13, 0.2) * band * (0.4 + n);
  col += vec3(0.25, 0.12, 0.06) * pow(noise(d * 4.0 + 9.0), 4.0) * 1.2;
  return col;
}
vec3 diskColor(float r, vec3 p, vec3 v){
  // r in units of r_s. Temperature ∝ r^(−3/4); colour ramp from white-hot to deep orange.
  float T = pow(3.0 / r, 0.75);
  vec3 hot = mix(vec3(1.0, 0.38, 0.08), vec3(1.0, 0.9, 0.7), clamp(T, 0.0, 1.0));
  vec3 vel = normalize(cross(vec3(0.0, 1.0, 0.0), p)) * uSpin;
  float beta = sqrt(0.5 / max(r - 1.0, 0.2)); float g = 1.0 / sqrt(1.0 - beta * beta);
  float cosT = dot(vel, -normalize(v)); float D = 1.0 / (g * (1.0 - beta * cosT));
  float grav = sqrt(max(0.0, 1.0 - 1.0 / r));
  float swirl = 0.6 + 0.4 * noise(vec3(r * 3.0, atan(p.z, p.x) * 4.0 + uTime * 0.6 / pow(r, 1.5) * 6.0, 0.0));
  return hot * T * pow(D * grav, 3.0) * swirl * 2.2;
}
void main(){
  vec4 vp = uInvProj * vec4(vNdc, 1.0, 1.0); vec3 dir = normalize((uCamWorld * vec4(vp.xyz / vp.w, 0.0)).xyz);
  vec3 col = vec3(0.0); float alpha = 0.0;
  if (uMode < 0.5) { col = sky(dir); }
  else if (uMode < 1.5) {
    vec3 p = (uCam - uBH) / uRs, v = dir; vec3 hv = cross(p, v); float h2 = dot(hv, hv); bool hit = false;
    for (int i = 0; i < 220; i++) {
      float r = length(p); if (r < 1.0) { hit = true; break; }
      float dt = clamp(0.06 * r, 0.015, 2.5);
      vec3 pn = p + v * dt; v += -1.5 * h2 * p / pow(r, 5.0) * dt;
      if (uDisk > 0.5 && p.y * pn.y < 0.0) { float t = p.y / (p.y - pn.y); vec3 x = mix(p, pn, t); float rr = length(x);
        if (rr > 3.0 && rr < 16.0) { float a = smoothstep(16.0, 11.0, rr) * smoothstep(3.0, 3.4, rr) * 0.85; col += (1.0 - alpha) * diskColor(rr, x, v) * a; alpha += (1.0 - alpha) * a; } }
      p = pn; if (r > 90.0 && dot(p, v) > 0.0) break;
    }
    if (!hit) col += (1.0 - alpha) * sky(normalize(v));
    // Faint photon-ring glow.
    col += vec3(1.0, 0.75, 0.45) * 0.04 * exp(-pow((sqrt(h2) - 2.598) * 3.0, 2.0)) * uDisk;
  } else if (uMode < 2.5) {
    // Binary: weak-field deflection from both holes, with their shadows.
    vec3 p = uCam, v = dir; bool hit = false;
    for (int i = 0; i < 160; i++) {
      vec3 d1 = p - uB1, d2 = p - uB2; float r1 = length(d1), r2 = length(d2);
      if (r1 < uR1 || r2 < uR2) { hit = true; break; }
      float dt = clamp(0.08 * min(r1 / uR1, r2 / uR2) * min(uR1, uR2), 0.02, 3.0);
      vec3 h1 = cross(d1 / uR1, v), h2v = cross(d2 / uR2, v);
      v += (-1.5 * dot(h1, h1) * (d1 / uR1) / pow(r1 / uR1, 5.0) / uR1 - 1.5 * dot(h2v, h2v) * (d2 / uR2) / pow(r2 / uR2, 5.0) / uR2) * dt;
      p += v * dt; if (length(p) > 400.0) break;
    }
    if (!hit) col = sky(normalize(v));
  }
  if (uWarp > 0.001) {
    // Hyperspace: stars smear along the direction of travel into a rushing tunnel.
    vec3 f = normalize((uCamWorld * vec4(0.0, 0.0, -1.0, 0.0)).xyz); float ct = dot(dir, f);
    vec3 side = normalize(dir - f * ct); float ang = atan(dot(side, normalize(cross(f, vec3(0, 1, 0)))), dot(side, vec3(0, 1, 0)));
    float lanes = 140.0, id = floor(ang / 6.2832 * lanes); float h = hash(vec3(id, 3.1, 7.7));
    float rad = acos(clamp(ct, -1.0, 1.0)); float z = 1.0 / max(0.02, tan(rad * 0.5));
    float s = fract(z * 0.08 * (0.6 + h) - uTime * (1.2 + h * 1.5));
    float streak = smoothstep(0.0, 0.03, s) * smoothstep(0.35 + h * 0.4, 0.0, s) * step(0.55, h) * smoothstep(0.05, 0.4, rad);
    vec3 tun = vec3(0.55, 0.75, 1.0) * streak * 2.2 + vec3(0.08, 0.14, 0.32) * smoothstep(1.2, 0.0, rad) * 0.8 + vec3(0.9, 0.95, 1.0) * exp(-rad * rad * 60.0) * 1.5;
    col = mix(col, tun, clamp(uWarp, 0.0, 1.0));
  }
  gl_FragColor = vec4(col, 1.0);
}`;

export function buildSky(scene) {
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
  const U = {
    uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uCam: { value: new THREE.Vector3() },
    uBH: { value: new THREE.Vector3() }, uRs: { value: 1 }, uMode: { value: 0 }, uDisk: { value: 1 }, uWarp: { value: 0 }, uTime: { value: 0 }, uSpin: { value: 1 },
    uB1: { value: new THREE.Vector3() }, uB2: { value: new THREE.Vector3() }, uR1: { value: 1 }, uR2: { value: 1 },
  };
  const m = new THREE.ShaderMaterial({ vertexShader: vert, fragmentShader: frag, uniforms: U, depthTest: false, depthWrite: false });
  const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = -100; scene.add(mesh);
  return { mesh, U, sync(cam, t) { cam.updateMatrixWorld(); U.uInvProj.value.copy(cam.projectionMatrixInverse); U.uCamWorld.value.copy(cam.matrixWorld); U.uCam.value.setFromMatrixPosition(cam.matrixWorld); U.uTime.value = t; } };
}
