/** GLSL for the glowing plasma, its particles and the flowing magnetic field lines. */

export const PLASMA_VERT = /* glsl */ `
uniform float uTime;
uniform float uKink;
varying vec3 vNormal;
varying vec3 vView;
varying vec2 vAng;
void main() {
  vec3 p = position;
  float phi = atan(p.x, p.z);
  float R = length(p.xz);
  float th = atan(p.y, R - 6.2);
  // Kink (m=2, n=1) wobble when the plasma is unstable
  float k = uKink * sin(2.0 * th - phi + uTime * 6.0) * 0.35;
  p += normal * k;
  vAng = vec2(phi, th);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vView = -mv.xyz;
  vNormal = normalize(normalMatrix * normal);
  gl_Position = projectionMatrix * mv;
}`;

export const PLASMA_FRAG = /* glsl */ `
uniform float uTime;
uniform float uHeat;      // 0..1 normalised temperature
uniform float uPower;     // 0..1 fusion brightness
uniform float uFlicker;
uniform vec3 uColA;
uniform vec3 uColB;
uniform vec3 uColC;
varying vec3 vNormal;
varying vec3 vView;
varying vec2 vAng;
void main() {
  vec3 n = normalize(vNormal);
  vec3 v = normalize(vView);
  float fres = pow(1.0 - abs(dot(n, v)), 2.2);
  // Helical striations that flow round the torus
  float helix = sin(vAng.x * 9.0 - vAng.y * 3.0 - uTime * 2.4) * 0.5 + 0.5;
  float helix2 = sin(vAng.x * 23.0 + vAng.y * 5.0 + uTime * 3.7) * 0.5 + 0.5;
  float stripes = mix(0.55, 1.0, helix * 0.7 + helix2 * 0.3);
  vec3 col = mix(uColA, uColB, fres);
  col = mix(col, uColC, pow(helix, 6.0) * uHeat);
  float glow = (0.25 + 0.75 * uHeat) * (0.55 + 0.6 * uPower);
  float a = clamp((0.03 + fres * 0.42) * stripes * glow, 0.0, 1.0);
  a *= 1.0 - uFlicker * (0.5 + 0.5 * sin(uTime * 47.0));
  gl_FragColor = vec4(col * glow * 0.9, a);
}`;

export const PARTICLE_VERT = /* glsl */ `
attribute float aR;
attribute float aTh;
attribute float aPhi;
attribute float aSpeed;
attribute float aKind;
uniform float uTime;
uniform float uHeat;
uniform float uKink;
uniform float uSize;
uniform float uQ0;
uniform float uQa;
uniform float uGap;
varying vec3 vCol;
varying float vAlpha;
void main() {
  float R0 = 6.2; float a = 2.0; float kap = 1.7; float del = 0.33;
  float q = uQ0 + (uQa - uQ0) * aR * aR;
  float phi = aPhi + uTime * aSpeed * (0.35 + 1.2 * uHeat);
  float th = aTh + phi / q;
  float r = aR * a * (1.0 + uKink * 0.12 * sin(2.0 * th - phi + uTime * 6.0));
  float R = R0 + r * cos(th + del * sin(th));
  vec3 p = vec3(R * sin(phi), kap * r * sin(th), R * cos(phi));
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (1.0 + aKind * 0.8) * (18.0 / -mv.z);
  vec3 core = vec3(1.0, 0.95, 0.85);
  vec3 mid = vec3(1.0, 0.25, 0.9);
  vec3 edge = vec3(0.2, 0.75, 1.0);
  vec3 c = mix(core, mid, smoothstep(0.0, 0.5, aR));
  c = mix(c, edge, smoothstep(0.45, 1.0, aR));
  if (aKind > 0.5) c = vec3(1.0, 0.85, 0.25); // alpha particles (helium)
  vCol = mix(vec3(1.0, 0.35, 0.1), c, uHeat);
  vAlpha = (0.3 + 0.6 * uHeat) * (1.0 - 0.45 * aR);
  float pw = mod(phi, 6.28318530718);
  if (pw < uGap || pw > 6.28318530718 - uGap) vAlpha = 0.0;
}`;

export const PARTICLE_FRAG = /* glsl */ `
varying vec3 vCol;
varying float vAlpha;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = length(d);
  if (r > 0.5) discard;
  float g = pow(1.0 - r * 2.0, 2.0);
  gl_FragColor = vec4(vCol * 1.05, g * vAlpha * 0.75);
}`;

export const LINE_VERT = /* glsl */ `
attribute float aU;
varying float vU;
varying float vPhi;
void main() {
  vU = aU;
  vPhi = atan(position.x, position.z);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export const LINE_FRAG = /* glsl */ `
uniform float uTime;
uniform vec3 uColor;
uniform float uOpacity;
uniform float uGap;
varying float vU;
varying float vPhi;
void main() {
  if (abs(vPhi) < uGap) discard;
  float pulse = pow(fract(vU * 40.0 - uTime * 0.6), 6.0);
  gl_FragColor = vec4(uColor * (0.6 + 2.2 * pulse), uOpacity * (0.25 + 0.75 * pulse));
}`;

export const SKY_VERT = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export const SKY_FRAG = /* glsl */ `
varying vec3 vDir;
void main() {
  float y = vDir.y * 0.5 + 0.5;
  vec3 top = vec3(0.02, 0.01, 0.07);
  vec3 bot = vec3(0.0, 0.02, 0.05);
  vec3 c = mix(bot, top, y);
  float neb = smoothstep(0.6, 1.0, sin(vDir.x * 3.0 + vDir.z * 2.0) * 0.5 + 0.5) * 0.08;
  c += vec3(0.35, 0.05, 0.45) * neb + vec3(0.0, 0.2, 0.35) * smoothstep(0.7, 1.0, sin(vDir.z * 4.0 - vDir.y * 2.0) * 0.5 + 0.5) * 0.06;
  gl_FragColor = vec4(c, 1.0);
}`;

/** Glowing plasma cross-section seen on the cut faces: white-hot core to magenta to cyan edge. */
export const CAP_VERT = /* glsl */ `
varying vec2 vRZ;
void main() {
  vRZ = position.xy;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

export const CAP_FRAG = /* glsl */ `
uniform float uTime;
uniform float uHeat;
uniform float uPower;
uniform float uFlicker;
varying vec2 vRZ;
void main() {
  vec2 q = vec2((vRZ.x - 6.2) / 2.0, vRZ.y / 3.4);
  float rho = clamp(length(q), 0.0, 1.0);
  float ang = atan(q.y, q.x);
  float swirl = 0.5 + 0.5 * sin(ang * 3.0 - rho * 9.0 + uTime * 2.5);
  vec3 core = vec3(1.0, 0.85, 0.55);
  vec3 mid = vec3(1.0, 0.12, 0.78);
  vec3 edge = vec3(0.15, 0.75, 1.0);
  vec3 cold = vec3(1.0, 0.35, 0.08);
  vec3 c = mix(core, mid, smoothstep(0.0, 0.55, rho));
  c = mix(c, edge, smoothstep(0.5, 1.0, rho));
  c = mix(cold * (1.0 - rho * 0.6), c, uHeat);
  float glow = (0.2 + 0.5 * uHeat) * (0.5 + 0.4 * uPower) * (0.75 + 0.3 * swirl);
  float a = (1.0 - smoothstep(0.85, 1.0, rho)) * 0.5 + 0.12;
  a *= 1.0 - uFlicker * (0.5 + 0.5 * sin(uTime * 47.0));
  gl_FragColor = vec4(c * glow, a * (0.35 + 0.65 * uHeat));
}`;
