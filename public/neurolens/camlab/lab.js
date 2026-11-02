// NEUROLENS · Camera lab — operate a cinema camera on a 3D film set. by Coach Colin
//
// The main view shows the set from the operator's side: the camera rig, its
// frustum, the plane of focus and the depth-of-field slab, and floor marks
// every metre. The monitor shows what the camera sees, rendered through the
// lens: per-pixel defocus from the exact thin-lens blur disc (oval for
// anamorphics), exposure from the EV equation, white balance from colour
// temperature, natural cos⁴ vignetting from the real angle of view, ISO grain,
// shutter-angle motion blur, and the operator's tools — zebras, false colour,
// focus peaking, thirds and delivery frame lines. Drop in your own photo,
// video or webcam and it stands on the set like an actor.

import * as THREE from 'three';
import {
  airyDisk, blurDisc, circleOfConfusion, cropFactor, depthOfField, diffractionLimitN, dollyZoomFocal, equivalentFocal,
  exposureOffset, exposureValue, fieldOfView, fieldWidthAt, fmtDistance, fmtShutter, frameFill, shutterTime, tStop, whiteBalanceGains,
} from './optics.js';
import { ASPECTS, BODIES, LENSES, LIGHTS, MOVES, STOPS, bodyById, lensById } from './rigs.js';

const $ = (s) => document.querySelector(s);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => t * t * (3 - 2 * t);
const SUBJECT = new THREE.Vector3(0.45, 0, -3); // the actor's mark
const HEAD_Y = 1.62;

/* ------------------------------------------------------------------ shaders */

const QUAD_VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

const LENS_FS = `
precision highp float;
uniform sampler2D tColor; uniform sampler2D tDepth;
uniform vec2 uRes; uniform float uNear, uFar;
uniform float uF, uN, uS, uSensorH, uSqueeze, uMaxR;
uniform float uGain; uniform vec3 uWB; uniform float uTanH, uTanV, uVig;
uniform float uGrain, uTime, uFlare;
uniform float uZebra, uFalse, uPeak; uniform vec2 uMatte;
varying vec2 vUv;

float linDepth(float d){ float z = d * 2.0 - 1.0; return (2.0 * uNear * uFar) / (uFar + uNear - z * (uFar - uNear)); }
// Blur radius in pixels (x, y) from the thin-lens blur disc b = f²|d−s| / (N d (s−f)).
vec2 coc(vec2 uv){
  float dmm = linDepth(texture2D(tDepth, uv).r) * 1000.0;
  float b = (uF * uF * abs(dmm - uS)) / (uN * dmm * max(uS - uF, 1e-3));
  float rv = min(0.5 * b / uSensorH * uRes.y, uMaxR);
  return vec2(uSqueeze > 1.0 ? rv / uSqueeze : rv, rv);
}
vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

void main(){
  vec2 px = 1.0 / uRes;
  vec2 r0 = coc(vUv);
  vec3 col = texture2D(tColor, vUv).rgb;
  if (max(r0.x, r0.y) > 0.6) {
    // Gather over the blur disc; a neighbour counts when its own disc reaches this pixel,
    // so a sharp subject does not smear into the bokeh behind it. Bright points bloom into discs.
    vec3 acc = col; float wsum = 1.0;
    for (int i = 0; i < 56; i++) {
      float fi = float(i);
      float rr = sqrt((fi + 0.5) / 56.0);
      float th = fi * 2.39996323;
      vec2 o = vec2(cos(th), sin(th)) * rr;
      vec2 uv = vUv + o * r0 * px;
      vec2 rs = coc(uv);
      float dist = length(o * r0);
      float reach = smoothstep(dist - 1.0, dist + 0.5, max(rs.x, rs.y) + 0.5);
      vec3 c = texture2D(tColor, uv).rgb;
      float w = reach * (1.0 + 3.0 * max(0.0, luma(c) - 0.9));
      acc += c * w; wsum += w;
    }
    col = acc / wsum;
  }
  // Anamorphic streak flare: horizontal smear of the brightest highlights, tinted blue.
  if (uFlare > 0.0) {
    vec3 s = vec3(0.0);
    for (int k = -12; k <= 12; k++) { vec3 c = texture2D(tColor, vUv + vec2(float(k) * 0.012, 0.0)).rgb; s += max(c - 1.2, 0.0) * exp(-abs(float(k)) * 0.22); }
    col += s * vec3(0.25, 0.45, 1.0) * 0.18 * uFlare;
  }
  col *= uGain * uWB;
  // Natural vignetting: illumination falls as cos⁴ of the angle off the optical axis.
  vec2 nd = vUv * 2.0 - 1.0;
  float tan2 = (nd.x * uTanH) * (nd.x * uTanH) + (nd.y * uTanV) * (nd.y * uTanV);
  float c4 = 1.0 / ((1.0 + tan2) * (1.0 + tan2));
  col *= mix(1.0, c4, uVig);
  col = aces(col);
  col = pow(col, vec3(1.0 / 2.2));
  float y = luma(col);
  if (uFalse > 0.5) {
    vec3 fc = col * 0.25 + vec3(y * 0.5);
    if (y < 0.04) fc = vec3(0.45, 0.1, 0.65); else if (y < 0.2) fc = vec3(0.1, 0.35, 0.95);
    else if (y > 0.42 && y < 0.5) fc = vec3(0.2, 0.85, 0.35); else if (y > 0.58 && y < 0.66) fc = vec3(1.0, 0.55, 0.7);
    else if (y > 0.94) fc = vec3(1.0, 0.15, 0.1);
    col = fc;
  }
  if (uZebra > 0.5 && y > 0.95 && mod(gl_FragCoord.x + gl_FragCoord.y + uTime * 40.0, 10.0) < 5.0) col = vec3(0.1);
  if (uPeak > 0.5 && max(r0.x, r0.y) < 0.75) {
    float e = abs(luma(texture2D(tColor, vUv + vec2(px.x, 0.0)).rgb) - luma(texture2D(tColor, vUv - vec2(px.x, 0.0)).rgb))
            + abs(luma(texture2D(tColor, vUv + vec2(0.0, px.y)).rgb) - luma(texture2D(tColor, vUv - vec2(0.0, px.y)).rgb));
    if (e > 0.18) col = mix(col, vec3(1.0, 0.12, 0.25), 0.85);
  }
  float g = fract(sin(dot(vUv * uRes + uTime * 61.7, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  col += g * uGrain;
  if (abs(nd.y) > 1.0 - 2.0 * uMatte.y || abs(nd.x) > 1.0 - 2.0 * uMatte.x) col *= 0.12;
  gl_FragColor = vec4(col, 1.0);
}`;

// Shutter-angle motion blur: blend with the previous frame in proportion to the open shutter.
const BLEND_FS = `
uniform sampler2D tCur; uniform sampler2D tPrev; uniform float uKeep; varying vec2 vUv;
void main(){ gl_FragColor = vec4(mix(texture2D(tCur, vUv).rgb, texture2D(tPrev, vUv).rgb, uKeep), 1.0); }`;
const COPY_FS = 'uniform sampler2D t; varying vec2 vUv; void main(){ gl_FragColor = texture2D(t, vUv); }';

/* -------------------------------------------------------------------- set */

function label(text, color = '#e9c27a') {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const g = c.getContext('2d');
  g.font = '600 34px "JetBrains Mono", monospace'; g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(text, 128, 32);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false }));
  s.scale.set(0.8, 0.2, 1);
  return s;
}

function posterTexture() {
  // A placeholder "your content" card until the visitor loads their own.
  const c = document.createElement('canvas'); c.width = 512; c.height = 640;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 640); gr.addColorStop(0, '#2a1830'); gr.addColorStop(1, '#0d0910'); g.fillStyle = gr; g.fillRect(0, 0, 512, 640);
  g.strokeStyle = '#e9c27a'; g.lineWidth = 6; g.strokeRect(14, 14, 484, 612);
  g.fillStyle = '#f6dfb2'; g.font = '500 54px "Cormorant Garamond", Georgia, serif'; g.textAlign = 'center';
  g.fillText('YOUR', 256, 270); g.fillText('CONTENT', 256, 335);
  g.font = '500 22px "JetBrains Mono", monospace'; g.fillStyle = '#ff4fa3'; g.fillText('load a photo, a video', 256, 420); g.fillText('or your webcam', 256, 452);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function buildSet() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#06060a');
  scene.fog = new THREE.Fog('#06060a', 18, 40);
  const g = new THREE.Group(); scene.add(g);

  // Floor with metre marks along the camera axis.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: '#141017', roughness: 0.55, metalness: 0.2 }));
  floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; g.add(floor);
  const grid = new THREE.GridHelper(40, 40, '#3a2c22', '#1f1820'); grid.position.y = 0.002; g.add(grid);
  for (let m = 1; m <= 14; m++) {
    const tape = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.03), new THREE.MeshBasicMaterial({ color: '#e9c27a' }));
    tape.rotation.x = -Math.PI / 2; tape.position.set(-1.6, 0.004, -m); g.add(tape);
    const l = label(`${m} m`); l.position.set(-2.2, 0.12, -m); l.layers.set(1); g.add(l); // operator view only
  }

  // Cyclorama wall with lit windows at 14 m.
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 9), new THREE.MeshStandardMaterial({ color: '#1b1420', roughness: 0.9 }));
  wall.position.set(0, 4.5, -14); g.add(wall);
  for (let i = -5; i <= 5; i++) for (let j = 0; j < 2; j++) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.6), new THREE.MeshBasicMaterial({ color: (i + j) % 3 ? '#ffcf8a' : '#8fd3ff' }));
    w.position.set(i * 2.4, 2.2 + j * 2.6, -13.95); w.material.color.multiplyScalar(2.2); g.add(w);
  }
  // Neon sign far back (bright: makes bokeh and anamorphic flares).
  const neon = new THREE.Mesh(new THREE.TorusGeometry(0.9, 0.05, 12, 64, Math.PI * 1.6), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ff4fa3').multiplyScalar(4) }));
  neon.position.set(-2.8, 3.4, -11); neon.rotation.z = 0.4; g.add(neon);
  const neon2 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.08, 0.05), new THREE.MeshBasicMaterial({ color: new THREE.Color('#7fe8ff').multiplyScalar(4) }));
  neon2.position.set(3.2, 2.6, -10); g.add(neon2);

  // String lights from 5 to 10 m: the classic bokeh test.
  const bulbs = [];
  for (let i = 0; i < 26; i++) {
    const t = i / 25;
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color('#ffd28a').multiplyScalar(6) }));
    b.position.set(lerp(-4, 4, t), 2.5 + Math.sin(t * Math.PI) * -0.5, lerp(-5, -10, (i % 2) * 0.5 + t * 0.5));
    g.add(b); bulbs.push(b);
  }

  // Foreground pillar at 1.2 m and a backdrop column at 7 m: depth cues.
  const stone = new THREE.MeshStandardMaterial({ color: '#3b3036', roughness: 0.7 });
  for (const [x, z, h] of [[-1.15, -1.2, 2.6], [2.4, -7, 3.2], [-3.5, -6, 3.0]]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, h, 24), stone); p.position.set(x, h / 2, z); p.castShadow = true; g.add(p);
  }

  // The actor: a stylised mannequin on its mark at 3 m (1.8 m tall).
  const skin = new THREE.MeshStandardMaterial({ color: '#d9a07f', roughness: 0.55 });
  const cloth = new THREE.MeshStandardMaterial({ color: '#1d1a24', roughness: 0.6, metalness: 0.1 });
  const actor = new THREE.Group();
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.75, 6, 16), cloth); body.position.y = 1.05; actor.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 32, 24), skin); head.position.y = HEAD_Y; actor.add(head);
  const legs = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.1, 0.7, 16), cloth); legs.position.y = 0.35; actor.add(legs);
  actor.traverse((o) => { o.castShadow = true; });
  actor.position.copy(SUBJECT); g.add(actor);
  const mark = new THREE.Mesh(new THREE.RingGeometry(0.28, 0.32, 40), new THREE.MeshBasicMaterial({ color: '#ff4fa3' }));
  mark.rotation.x = -Math.PI / 2; mark.position.set(SUBJECT.x, 0.006, SUBJECT.z); g.add(mark);

  // "Your content" card beside the actor.
  const card = new THREE.Mesh(new THREE.PlaneGeometry(1, 1.25), new THREE.MeshStandardMaterial({ map: posterTexture(), roughness: 0.4, emissive: '#ffffff', emissiveIntensity: 0.25, emissiveMap: null }));
  card.material.emissiveMap = card.material.map;
  card.position.set(-0.75, 1.15, -3.4); card.castShadow = true; g.add(card);

  // Light: key, fill and back.
  const amb = new THREE.HemisphereLight('#b9a7ff', '#1a1210', 0.35); scene.add(amb);
  const key = new THREE.SpotLight('#ffffff', 40, 14, 0.6, 0.5, 1.6); key.position.set(2.6, 3.6, -0.8); key.target.position.set(SUBJECT.x, 1.2, SUBJECT.z);
  key.castShadow = true; key.shadow.mapSize.set(1024, 1024); scene.add(key, key.target);
  const back = new THREE.SpotLight('#ffffff', 26, 12, 0.7, 0.6, 1.6); back.position.set(-1.8, 3.2, -6); back.target.position.set(SUBJECT.x, 1.4, SUBJECT.z); scene.add(back, back.target);
  const fill = new THREE.PointLight('#ffffff', 3, 8, 1.6); fill.position.set(-2, 1.6, -0.5); scene.add(fill);

  return { scene, actor, head, card, key, back, fill, amb, bulbs };
}

/* -------------------------------------------------------------------- lab */

export class CameraLab {
  constructor() {
    this.built = false; this.active = false;
    this.s = {
      body: 'ff', lens: 'p50', focal: 50, N: 2, focusM: 3.1, angle: 180, fps: 24, iso: 800, nd: 0, wbK: 4300,
      light: 'neon', aspect: '2.39', dist: 3.1, orbit: 0, height: 1.55, pan: 0, tilt: 0, roll: 0,
      thirds: true, zebra: false, falseColour: false, peaking: false, slab: true, move: 'dolly', moveSec: 6,
    };
    this.focusTarget = this.s.focusM;
    this.take = null; this.recorder = null; this.media = null;
  }

  /* ---- construction ---- */
  build(vfCanvas) {
    if (this.built) return;
    this.built = true;
    const set = buildSet();
    Object.assign(this, set);
    this.cine = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 60);
    this.opCam = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.05, 120);
    this.opCam.layers.enable(1);
    this.op = { yaw: 0.85, pitch: 0.42, r: 8.5, drag: null };
    this.rig = this.buildRig(); this.scene.add(this.rig.group);

    this.vf = vfCanvas;
    this.r = new THREE.WebGLRenderer({ canvas: vfCanvas, antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
    this.r.shadowMap.enabled = true; this.r.shadowMap.type = THREE.PCFSoftShadowMap;
    this.r.outputColorSpace = THREE.LinearSRGBColorSpace; // the lens shader does its own tone mapping and gamma
    this.r.toneMapping = THREE.NoToneMapping;
    const mk = () => new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType });
    this.rtScene = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthTexture: new THREE.DepthTexture(4, 4) });
    this.rtLens = mk(); this.rtA = mk(); this.rtB = mk();
    this.quadCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const quad = (fs, uniforms) => { const m = new THREE.ShaderMaterial({ vertexShader: QUAD_VS, fragmentShader: fs, uniforms, depthTest: false, depthWrite: false }); const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), m); const sc = new THREE.Scene(); sc.add(q); return { m, sc }; };
    this.lensQ = quad(LENS_FS, {
      tColor: { value: null }, tDepth: { value: null }, uRes: { value: new THREE.Vector2() }, uNear: { value: 0.05 }, uFar: { value: 60 },
      uF: { value: 50 }, uN: { value: 2 }, uS: { value: 3000 }, uSensorH: { value: 24 }, uSqueeze: { value: 1 }, uMaxR: { value: 24 },
      uGain: { value: 1 }, uWB: { value: new THREE.Vector3(1, 1, 1) }, uTanH: { value: 0.4 }, uTanV: { value: 0.2 }, uVig: { value: 1 },
      uGrain: { value: 0.02 }, uTime: { value: 0 }, uFlare: { value: 0 }, uZebra: { value: 0 }, uFalse: { value: 0 }, uPeak: { value: 0 }, uMatte: { value: new THREE.Vector2() },
    });
    this.blendQ = quad(BLEND_FS, { tCur: { value: null }, tPrev: { value: null }, uKeep: { value: 0 } });
    this.copyQ = quad(COPY_FS, { t: { value: null } });
    this.time = 0;
    this.applyLight();
    this.bindViewfinder();
  }

  buildRig() {
    const group = new THREE.Group();
    const gold = new THREE.MeshStandardMaterial({ color: '#e9c27a', metalness: 1, roughness: 0.3 });
    const dark = new THREE.MeshStandardMaterial({ color: '#16131a', metalness: 0.6, roughness: 0.4 });
    const bodyM = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.16, 0.24), dark); group.add(bodyM);
    const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.16, 24), gold); lens.rotation.x = Math.PI / 2; lens.position.z = -0.2; group.add(lens);
    const mon = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.1, 0.01), dark); mon.position.set(0.12, 0.1, 0.05); group.add(mon);
    const frustum = new THREE.LineSegments(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#e9c27a', transparent: true, opacity: 0.55 }));
    const focusPlane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ color: '#e9c27a', transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false }));
    const slab = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: '#ff4fa3', transparent: true, opacity: 0.06, depthWrite: false }));
    const tripod = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 1, 8), dark);
    const world = new THREE.Group(); world.add(frustum, focusPlane, slab, tripod);
    // The rig and its helpers live on layer 1: the operator sees them, the lens never does
    // (and tap-to-focus rays, which test layer 0, pass straight through them).
    for (const o of [group, world]) o.traverse((x) => x.layers.set(1));
    this.scene.add(world);
    return { group, frustum, focusPlane, slab, tripod, world };
  }

  /* ---- derived optics ---- */
  get body() { return bodyById(this.s.body); }
  get lensDef() { return lensById(this.s.lens); }
  optics() {
    const body = this.body; const lens = this.lensDef; const sensor = body.sensor;
    const f = this.s.focal; const N = lens.fixedN ?? this.s.N; const sq = lens.squeeze;
    const c = circleOfConfusion(sensor);
    const sMm = Math.max(this.s.focusM * 1000, f * 1.05);
    const dof = depthOfField(f, N, sMm, c);
    const T = tStop(N, lens.transmission);
    const t = shutterTime(this.s.angle, this.s.fps);
    const ev = exposureValue(T, t, this.s.iso);
    const light = LIGHTS.find((l) => l.id === this.s.light) ?? LIGHTS[0];
    const offset = exposureOffset(light.ev, ev, this.s.nd);
    return { body, lens, sensor, f, N, sq, c, sMm, dof, T, t, ev, light, offset, fov: fieldOfView(sensor, f, sq), crop: cropFactor(sensor), eq: equivalentFocal(sensor, f) };
  }

  /* ---- camera pose ---- */
  pose() {
    const s = this.s; const a = s.orbit * Math.PI / 180;
    const pos = new THREE.Vector3(SUBJECT.x + Math.sin(a) * s.dist, s.height, SUBJECT.z + Math.cos(a) * s.dist);
    // Aim a little below the eyes so the head sits on the upper third, as an operator frames a single.
    const target = new THREE.Vector3(SUBJECT.x, HEAD_Y - 0.3, SUBJECT.z);
    const m = new THREE.Matrix4().lookAt(pos, target, new THREE.Vector3(0, 1, 0));
    const q = new THREE.Quaternion().setFromRotationMatrix(m);
    q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(s.tilt * Math.PI / 180, -s.pan * Math.PI / 180, -s.roll * Math.PI / 180, 'YXZ')));
    return { pos, q };
  }

  /** Distance along the optical axis to a world point. */
  axisDistance(p) {
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.cine.quaternion);
    return p.clone().sub(this.cine.position).dot(fwd);
  }

  focusOnSubject() { this.focusTarget = clamp(this.axisDistance(this.head.getWorldPosition(new THREE.Vector3())), this.lensDef.minFocusM, 200); }

  /* ---- viewfinder input: tap to focus, drag to pan/tilt ---- */
  bindViewfinder() {
    const vf = this.vf; let down = null;
    vf.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, pan: this.s.pan, tilt: this.s.tilt, moved: false }; vf.setPointerCapture?.(e.pointerId); });
    vf.addEventListener('pointermove', (e) => {
      if (!down) return;
      const dx = e.clientX - down.x; const dy = e.clientY - down.y;
      if (Math.hypot(dx, dy) > 4) down.moved = true;
      if (down.moved) { this.s.pan = clamp(down.pan + dx * 0.08, -40, 40); this.s.tilt = clamp(down.tilt - dy * 0.08, -30, 30); this.syncInputs?.(); }
    });
    vf.addEventListener('pointerup', (e) => {
      if (down && !down.moved) {
        const r = vf.getBoundingClientRect();
        const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
        const ray = new THREE.Raycaster(); ray.setFromCamera(ndc, this.cine);
        const hit = ray.intersectObjects(this.scene.children, true).find((h) => h.object.visible && h.object.isMesh);
        if (hit) { this.focusTarget = clamp(this.axisDistance(hit.point), this.lensDef.minFocusM, 200); this.tapMark = { u: (ndc.x + 1) / 2, v: (1 - ndc.y) / 2, t: 1.2 }; }
      }
      down = null;
    });
  }

  /* ---- light & content ---- */
  applyLight() {
    // The set's lamps render white; their colour temperature enters through the camera's
    // white balance (whiteBalanceGains(light K, camera K)), which is where a real cast comes from.
    this.lightK = (LIGHTS.find((l) => l.id === this.s.light) ?? LIGHTS[0]).K;
  }

  async loadMedia(file) {
    const url = URL.createObjectURL(file);
    if (file.type.startsWith('video/')) {
      const v = document.createElement('video'); v.src = url; v.loop = true; v.muted = true; v.playsInline = true; await v.play().catch(() => {});
      await new Promise((r) => (v.readyState >= 1 ? r() : (v.onloadedmetadata = r)));
      this.setCardTexture(new THREE.VideoTexture(v), v.videoWidth / v.videoHeight); this.media = v;
    } else {
      const tex = await new THREE.TextureLoader().loadAsync(url);
      this.setCardTexture(tex, tex.image.width / tex.image.height);
    }
  }

  async useWebcam() {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    const v = document.createElement('video'); v.srcObject = stream; v.muted = true; v.playsInline = true; await v.play();
    this.setCardTexture(new THREE.VideoTexture(v), (v.videoWidth || 16) / (v.videoHeight || 9)); this.media = v;
  }

  setCardTexture(tex, aspect) {
    tex.colorSpace = THREE.SRGBColorSpace;
    const h = 1.35; const w = h * aspect;
    this.card.geometry.dispose(); this.card.geometry = new THREE.PlaneGeometry(w, h);
    this.card.position.y = 0.2 + h / 2;
    this.card.position.x = -0.35 - w / 2;
    this.card.material.map = tex; this.card.material.emissiveMap = tex; this.card.material.needsUpdate = true;
  }

  /* ---- moves and takes ---- */
  startMove(record = false) {
    const s = this.s; const from = { ...s };
    if (s.move === 'vertigo' && !(this.lensDef.focals.length > 1)) { s.lens = 'z2470'; s.focal = clamp(s.focal, 24, 70); from.lens = s.lens; from.focal = s.focal; this.onLensChange?.(); }
    this.take = { t: 0, dur: s.moveSec, from, move: s.move };
    if (record) this.startRecording();
  }

  updateMove(dt) {
    const k = this.take; if (!k) return;
    k.t += dt; const u = ease(clamp(k.t / k.dur, 0, 1)); const s = this.s; const f = k.from;
    if (k.move === 'dolly') { s.dist = lerp(f.dist, Math.max(0.9, f.dist * 0.5), u); this.focusOnSubject(); }
    if (k.move === 'orbit') { s.orbit = lerp(f.orbit - 30, f.orbit + 30, u); this.focusOnSubject(); }
    if (k.move === 'crane') { s.height = lerp(0.6, 3.2, u); s.tilt = 0; this.focusOnSubject(); }
    if (k.move === 'vertigo') {
      const lens = this.lensDef; const d2 = lerp(f.dist, f.dist * 2, u);
      const fz = clamp(dollyZoomFocal(f.focal, f.dist, d2), lens.focals[0], lens.focals[lens.focals.length - 1]);
      s.dist = d2; s.focal = fz; this.focusOnSubject();
    }
    if (k.move === 'rack') {
      const near = 1.2; const subject = this.axisDistance(this.head.getWorldPosition(new THREE.Vector3()));
      this.focusTarget = u < 0.5 ? lerp(near, subject, ease(u * 2)) : lerp(subject, 10, ease((u - 0.5) * 2));
    }
    this.syncInputs?.();
    if (k.t >= k.dur) { this.take = null; this.stopRecording(); }
  }

  startRecording() {
    if (!this.vf.captureStream || typeof MediaRecorder === 'undefined') { this.onNote?.('This browser cannot record a canvas. Use "Still" for frames.'); return; }
    const mime = ['video/mp4;codecs=avc1.42E01E', 'video/webm;codecs=vp9', 'video/webm'].find((m) => MediaRecorder.isTypeSupported?.(m)) || '';
    const chunks = [];
    this.recorder = new MediaRecorder(this.vf.captureStream(30), mime ? { mimeType: mime, videoBitsPerSecond: 8e6 } : undefined);
    this.recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    this.recorder.onstop = () => {
      const blob = new Blob(chunks, { type: this.recorder.mimeType || 'video/webm' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = `neurolens-take-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.${(this.recorder.mimeType || '').includes('mp4') ? 'mp4' : 'webm'}`;
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      this.recorder = null; this.onNote?.('Take saved to your downloads.');
    };
    this.recorder.start();
  }

  stopRecording() { if (this.recorder?.state === 'recording') this.recorder.stop(); }

  still() {
    const a = document.createElement('a'); a.href = this.vf.toDataURL('image/png');
    a.download = `neurolens-still-${Date.now()}.png`; a.click();
  }

  /* ---- operator view input (main canvas) ---- */
  pointerDown(e) { this.op.drag = { x: e.clientX, y: e.clientY }; }
  pointerMove(e) { const o = this.op; if (!o.drag) return; o.yaw -= (e.clientX - o.drag.x) * 0.006; o.pitch = clamp(o.pitch + (e.clientY - o.drag.y) * 0.004, 0.05, 1.3); o.drag = { x: e.clientX, y: e.clientY }; }
  pointerUp() { this.op.drag = null; }
  wheel(e) { this.op.r = clamp(this.op.r * Math.exp(e.deltaY * 0.001), 3, 22); }

  /* ---- per frame ---- */
  update(dt) {
    if (!this.built || !this.active) return;
    this.time += dt;
    this.updateMove(dt);
    const s = this.s; const o = this.optics();
    // Focus pulls smoothly, like a focus puller's hand.
    s.focusM += (this.focusTarget - s.focusM) * Math.min(1, dt * 6);
    // Cinema camera from the optics.
    const { pos, q } = this.pose();
    this.cine.position.copy(pos); this.cine.quaternion.copy(q);
    this.cine.fov = o.fov.v; this.cine.aspect = (o.sensor.w * o.sq) / o.sensor.h; this.cine.updateProjectionMatrix(); this.cine.updateMatrixWorld();
    this.rig.group.position.copy(pos); this.rig.group.quaternion.copy(q);
    this.updateRigHelpers(o);
    // Operator camera.
    const op = this.op; const c = new THREE.Vector3(0, 1.1, -3.2);
    this.opCam.position.set(c.x + Math.sin(op.yaw) * Math.cos(op.pitch) * op.r, c.y + Math.sin(op.pitch) * op.r, c.z + Math.cos(op.yaw) * Math.cos(op.pitch) * op.r);
    this.opCam.lookAt(c); this.opCam.aspect = innerWidth / innerHeight; this.opCam.updateProjectionMatrix();
    this.renderViewfinder(o, dt);
    this.drawOverlay(o);
  }

  updateRigHelpers(o) {
    const { frustum, focusPlane, slab, tripod } = this.rig;
    frustum.visible = focusPlane.visible = slab.visible = this.s.slab;
    const th = Math.tan((o.fov.v * Math.PI) / 360); const tw = th * this.cine.aspect;
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.cine.quaternion);
    const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.cine.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.cine.quaternion);
    const P = this.cine.position; const dF = this.s.focusM; const dFar = Math.min(o.dof.farMm / 1000, 30); const dNear = o.dof.nearMm / 1000;
    const corner = (d, sx, sy) => P.clone().addScaledVector(fwd, d).addScaledVector(right, sx * tw * d).addScaledVector(up, sy * th * d);
    const pts = [];
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) pts.push(P, corner(dF, sx, sy));
    const ring = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => corner(dF, sx, sy));
    for (let i = 0; i < 4; i++) pts.push(ring[i], ring[(i + 1) % 4]);
    frustum.geometry.setFromPoints(pts);
    focusPlane.position.copy(P).addScaledVector(fwd, dF); focusPlane.quaternion.copy(this.cine.quaternion);
    focusPlane.scale.set(2 * tw * dF, 2 * th * dF, 1);
    const mid = (dNear + dFar) / 2; const len = Math.max(0.01, dFar - dNear);
    slab.position.copy(P).addScaledVector(fwd, mid); slab.quaternion.copy(this.cine.quaternion);
    slab.scale.set(2 * tw * mid, 2 * th * mid, len);
    tripod.position.set(P.x, P.y / 2, P.z); tripod.scale.set(1, Math.max(0.1, P.y - 0.1), 1);
  }

  resizeVf() {
    const r = this.vf.getBoundingClientRect();
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    const w = Math.max(64, Math.round(r.width * dpr)); const h = Math.max(36, Math.round(r.height * dpr));
    if (this.vf.width !== w || this.vf.height !== h) {
      this.r.setSize(w, h, false);
      for (const rt of [this.rtScene, this.rtLens, this.rtA, this.rtB]) rt.setSize(w, h);
    }
    return { w, h };
  }

  renderViewfinder(o, dt) {
    const { w, h } = this.resizeVf();
    const U = this.lensQ.m.uniforms;
    // Scene through the lens.
    this.r.setRenderTarget(this.rtScene); this.r.render(this.scene, this.cine);
    U.tColor.value = this.rtScene.texture; U.tDepth.value = this.rtScene.depthTexture;
    U.uRes.value.set(w, h); U.uNear.value = this.cine.near; U.uFar.value = this.cine.far;
    U.uF.value = o.f; U.uN.value = o.N; U.uS.value = o.sMm; U.uSensorH.value = o.sensor.h; U.uSqueeze.value = o.sq;
    U.uMaxR.value = Math.max(6, h * 0.045);
    U.uGain.value = 2 ** clamp(o.offset, -8, 8);
    const g = whiteBalanceGains(this.lightK ?? 4300, this.s.wbK); U.uWB.value.set(g[0], g[1], g[2]);
    U.uTanH.value = Math.tan((o.fov.h * Math.PI) / 360); U.uTanV.value = Math.tan((o.fov.v * Math.PI) / 360);
    U.uGrain.value = 0.012 * Math.sqrt(this.s.iso / 400) * (o.sensor.h < 10 ? 1.8 : o.sensor.h < 16 ? 1.3 : 1);
    U.uTime.value = this.time; U.uFlare.value = o.sq > 1 ? 1 : 0;
    U.uZebra.value = this.s.zebra ? 1 : 0; U.uFalse.value = this.s.falseColour ? 1 : 0; U.uPeak.value = this.s.peaking ? 1 : 0;
    const A = ASPECTS.find((a) => a.id === this.s.aspect); const native = this.cine.aspect;
    U.uMatte.value.set(A?.r && A.r < native ? (1 - A.r / native) / 2 : 0, A?.r && A.r > native ? (1 - native / A.r) / 2 : 0);
    this.r.setRenderTarget(this.rtLens); this.r.render(this.lensQ.sc, this.quadCam);
    // Shutter-angle motion blur while the camera moves: keep part of the last frame.
    const moving = Boolean(this.take) || this._lastPos?.distanceTo(this.cine.position) > 1e-4;
    this._lastPos = this.cine.position.clone();
    const keep = moving ? clamp((this.s.angle / 360) * 0.9, 0, 0.88) : 0;
    const B = this.blendQ.m.uniforms; B.tCur.value = this.rtLens.texture; B.tPrev.value = this.rtA.texture; B.uKeep.value = keep;
    this.r.setRenderTarget(this.rtB); this.r.render(this.blendQ.sc, this.quadCam);
    [this.rtA, this.rtB] = [this.rtB, this.rtA];
    this.copyQ.m.uniforms.t.value = this.rtA.texture;
    this.r.setRenderTarget(null); this.r.render(this.copyQ.sc, this.quadCam);
    void dt;
  }

  drawOverlay(o) {
    const ov = $('#vf-ov'); if (!ov) return;
    const r = ov.getBoundingClientRect(); const d = Math.min(2, devicePixelRatio || 1);
    if (ov.width !== Math.round(r.width * d) || ov.height !== Math.round(r.height * d)) { ov.width = Math.round(r.width * d); ov.height = Math.round(r.height * d); }
    const g = ov.getContext('2d'); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, r.width, r.height);
    const W = r.width; const H = r.height;
    if (this.s.thirds) {
      g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 1;
      for (const k of [1, 2]) { g.beginPath(); g.moveTo((W * k) / 3, 0); g.lineTo((W * k) / 3, H); g.moveTo(0, (H * k) / 3); g.lineTo(W, (H * k) / 3); g.stroke(); }
    }
    // Centre mark and the tap-to-focus box.
    g.strokeStyle = 'rgba(233,194,122,.7)'; g.beginPath(); g.moveTo(W / 2 - 8, H / 2); g.lineTo(W / 2 + 8, H / 2); g.moveTo(W / 2, H / 2 - 8); g.lineTo(W / 2, H / 2 + 8); g.stroke();
    if (this.tapMark && this.tapMark.t > 0) {
      this.tapMark.t -= 1 / 60;
      g.strokeStyle = `rgba(233,194,122,${Math.min(1, this.tapMark.t)})`; g.lineWidth = 2;
      g.strokeRect(this.tapMark.u * W - 22, this.tapMark.v * H - 22, 44, 44);
    }
    // Monitor status line, like a real camera's.
    g.font = '600 11px "JetBrains Mono", monospace'; g.textBaseline = 'top';
    const line = `${o.body.name.toUpperCase()}  ${o.f.toFixed(0)}mm  T${o.T.toFixed(1)}  ${fmtShutter(o.t)} (${this.s.angle}°)  ${this.s.fps}fps  ISO ${this.s.iso}  ND${this.s.nd}  ${this.s.wbK}K`;
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, 0, W, 20);
    g.fillStyle = '#f6dfb2'; g.fillText(line, 8, 4);
    g.textAlign = 'right'; g.fillStyle = this.recorder ? '#ff3b4e' : '#9b8f86';
    g.fillText(this.recorder ? '● REC' : 'STBY', W - 8, 4); g.textAlign = 'left';
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, H - 20, W, 20);
    g.fillStyle = '#f6dfb2';
    g.fillText(`FOCUS ${fmtDistance(o.sMm)}   DOF ${fmtDistance(o.dof.nearMm)} – ${fmtDistance(o.dof.farMm)}   EXP ${o.offset >= 0 ? '+' : ''}${o.offset.toFixed(1)}`, 8, H - 16);
    // Exposure meter bar.
    const mx = W - 128; const my = H - 14; g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(mx, my + 3, 120, 2);
    for (let k = -3; k <= 3; k++) g.fillRect(mx + 60 + k * 20, my, 1, 8);
    g.fillStyle = Math.abs(o.offset) < 0.5 ? '#3dff8a' : Math.abs(o.offset) < 1.5 ? '#e9c27a' : '#ff3b4e';
    g.fillRect(mx + 60 + clamp(o.offset, -3, 3) * 20 - 3, my - 2, 6, 12);
  }

  /** Numbers for the side panel. */
  readouts() {
    const o = this.optics(); const s = this.s;
    const headD = this.built ? this.axisDistance(this.head.getWorldPosition(new THREE.Vector3())) : 3;
    const bgPx = (blurDisc(o.f, o.N, o.sMm, 12000) / o.sensor.h) * 1080;
    const airy = airyDisk(o.N); const nd = diffractionLimitN(o.c);
    const fill = frameFill(o.sensor, o.f, 1.8, Math.max(0.3, headD));
    const notes = [];
    if (o.offset > 1) notes.push(['Overexposed', `${o.offset.toFixed(1)} stops hot. Add ${Math.ceil(o.offset)} stops of ND to keep this aperture and shutter, or close down.`]);
    if (o.offset < -1) notes.push(['Underexposed', `${(-o.offset).toFixed(1)} stops dark. Raise ISO (more grain) or open up (less depth of field).`]);
    if (o.N > nd) notes.push(['Diffraction', `At f/${o.N} the Airy disk (${(airy * 1000).toFixed(1)} µm) is bigger than the circle of confusion (${(o.c * 1000).toFixed(1)} µm): the whole image softens. Open to f/${Math.floor(nd)} or wider.`]);
    if (s.angle !== 180) notes.push(['Shutter', s.angle > 180 ? `${s.angle}° smears motion more than the 180° film look; good for dreamy, low light.` : `${s.angle}° makes motion staccato and crisp — action, rain, Saving-Private-Ryan-style jitter.`]);
    if (o.lens.fixedN) notes.push(['Phone optics', 'A phone lens has one aperture and a tiny sensor: almost everything is in focus. Portrait-mode blur is software; this is what the glass alone does.']);
    if (o.sq > 1) notes.push(['Anamorphic', `A ${o.sq}× squeeze: the ${o.f} mm sees as wide as a ${(o.f / o.sq).toFixed(0)} mm spherical lens across, with tall oval bokeh and horizontal streak flares.`]);
    if (bgPx > 40) notes.push(['Background', `Lights at 12 m blur to ${bgPx.toFixed(0)} px discs on a 1080p frame — creamy separation.`]);
    else if (bgPx < 4) notes.push(['Background', `Background stays nearly sharp (${bgPx.toFixed(1)} px blur at 1080p). For separation use a longer lens, a wider aperture, a bigger sensor or get closer.`]);
    return { o, headD, bgPx, airy, nd, fill, notes, width: fieldWidthAt(o.sensor, o.f, Math.max(0.3, headD), o.sq) };
  }
}

export { BODIES, LENSES, STOPS, ASPECTS, LIGHTS, MOVES };
