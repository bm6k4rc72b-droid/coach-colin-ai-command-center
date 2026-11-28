// ===== Kaye's Realm: core, noise, painted textures, materials =====
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
let _seed = 1337;
const rand = () => { _seed = (_seed * 16807) % 2147483647; return (_seed - 1) / 2147483646; };
const rr = (a, b) => a + (b - a) * rand();
const pick = (a) => a[Math.floor(rand() * a.length)];
const TAU = Math.PI * 2;

function hash2(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, p = 0) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  let x0 = ix, x1 = ix + 1, y0 = iy, y1 = iy + 1;
  if (p) { x0 = ((x0 % p) + p) % p; x1 = ((x1 % p) + p) % p; y0 = ((y0 % p) + p) % p; y1 = ((y1 % p) + p) % p; }
  const a = hash2(x0, y0), b = hash2(x1, y0), c = hash2(x0, y1), d = hash2(x1, y1);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uy) * 2 - 1;
}
function fbm(x, y, o = 4, p = 0) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < o; i++) { s += a * vnoise(x * f, y * f, p ? p * f : 0); f *= 2; a *= 0.5; }
  return s;
}

// ---------- Renderer / scene ----------
const LITE = /lite/.test(location.search);
const IS_TOUCH = /touch/.test(location.search) || (matchMedia('(pointer: coarse)').matches && navigator.maxTouchPoints > 0);
const MAX_PR = IS_TOUCH ? Math.min(window.devicePixelRatio, 1.35) : Math.min(window.devicePixelRatio, 1.75);
const renderer = new THREE.WebGLRenderer({ antialias: !LITE, powerPreference: 'high-performance' });
let PIXEL_RATIO = LITE ? 0.6 : IS_TOUCH ? Math.min(MAX_PR, 1.1) : MAX_PR;
renderer.setPixelRatio(PIXEL_RATIO);
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.9;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
$('game').appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xb8cfe0, 0.0011);
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 6000);
const maxAniso = renderer.capabilities.getMaxAnisotropy();

// ---------- Painted procedural textures (tileable) ----------
function makeCanvas(S) { const c = document.createElement('canvas'); c.width = c.height = S; return c; }
function toTex(c, srgb = true, rep = true) {
  const t = new THREE.CanvasTexture(c);
  if (rep) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Math.min(8, maxAniso);
  return t;
}
function paintPixels(g, S, fn) {
  const img = g.createImageData(S, S), d = img.data;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const c = fn(x / S, y / S, x, y), i = (y * S + x) * 4;
    d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
}
function wrapDraw(g, S, x, y, m, fn) {
  for (const ox of [-S, 0, S]) for (const oy of [-S, 0, S]) {
    if (x + ox < -m || x + ox > S + m || y + oy < -m || y + oy > S + m) continue;
    fn(x + ox, y + oy);
  }
}
const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
function strokeField(g, S, n, colors, len, wid, ang, angJ, alpha = 0.55) {
  g.lineCap = 'round';
  for (let i = 0; i < n; i++) {
    const x = rand() * S, y = rand() * S, a = ang + rr(-angJ, angJ), l = len * rr(0.6, 1.4);
    const c = pick(colors), cc = mixc(c, [255, 255, 255], rr(-0.08, 0.12));
    g.strokeStyle = rgba(cc, alpha * rr(0.6, 1)); g.lineWidth = wid * rr(0.6, 1.4);
    wrapDraw(g, S, x, y, l, (px, py) => { g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); g.stroke(); });
  }
}
function voronoiCell(u, v, N) { // jittered grid voronoi, periodic
  const gx = u * N, gy = v * N, ix = Math.floor(gx), iy = Math.floor(gy);
  let f1 = 9, f2 = 9, id = 0;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = ix + i, cy = iy + j, wx = ((cx % N) + N) % N, wy = ((cy % N) + N) % N;
    const px = cx + 0.15 + 0.7 * hash2(wx, wy * 7 + 3), py = cy + 0.15 + 0.7 * hash2(wx * 5 + 1, wy);
    const d = Math.hypot(gx - px, gy - py);
    if (d < f1) { f2 = f1; f1 = d; id = wx * 131 + wy; } else if (d < f2) f2 = d;
  }
  return [f1, f2, id];
}

const TEX = {};
function buildTextures() {
  const S = 512;
  { // meadow grass
    const c = makeCanvas(S), g = c.getContext('2d');
    paintPixels(g, S, (u, v) => { const n = fbm(u * 8, v * 8, 4, 8) * 0.5 + 0.5, m = fbm(u * 3 + 9, v * 3, 3, 3) * 0.5 + 0.5; return mixc(mixc([58, 104, 38], [112, 158, 58], n), [138, 160, 70], m * 0.35); });
    strokeField(g, S, 3200, [[70, 120, 40], [96, 150, 52], [130, 172, 70], [52, 92, 34], [150, 180, 80]], 10, 2.2, -Math.PI / 2, 0.6, 0.5);
    for (let i = 0; i < 70; i++) { const x = rand() * S, y = rand() * S, col = pick([[250, 250, 240], [250, 220, 90], [200, 150, 230]]); g.fillStyle = rgba(col, 0.85); wrapDraw(g, S, x, y, 4, (px, py) => { g.beginPath(); g.arc(px, py, rr(1, 2.2), 0, TAU); g.fill(); }); }
    TEX.grass = toTex(c);
  }
  { // dirt path
    const c = makeCanvas(S), g = c.getContext('2d');
    paintPixels(g, S, (u, v) => { const n = fbm(u * 10, v * 10, 4, 10) * 0.5 + 0.5; return mixc([112, 86, 60], [158, 128, 92], n); });
    for (let i = 0; i < 900; i++) { const x = rand() * S, y = rand() * S, r = rr(1.5, 5), col = pick([[90, 72, 55], [170, 150, 120], [130, 115, 95]]); g.fillStyle = rgba(col, 0.7); wrapDraw(g, S, x, y, 6, (px, py) => { g.beginPath(); g.ellipse(px, py, r, r * 0.7, rand() * 3, 0, TAU); g.fill(); }); }
    strokeField(g, S, 600, [[95, 75, 50], [140, 115, 85]], 14, 1.5, 0, 0.3, 0.3);
    TEX.dirt = toTex(c);
  }
  { // rock
    const c = makeCanvas(S), g = c.getContext('2d');
    paintPixels(g, S, (u, v) => { const n = fbm(u * 6, v * 6, 5, 6) * 0.5 + 0.5; const r = 1 - Math.abs(fbm(u * 4 + 3, v * 4, 3, 4)); const m = smooth(0.55, 0.8, fbm(u * 3 + 5, v * 3 + 1, 3, 3) * 0.5 + 0.5); let col = mixc([92, 92, 98], [158, 154, 148], n); col = mixc(col, [60, 60, 66], smooth(0.85, 1, r) * 0.8); return mixc(col, [92, 112, 70], m * 0.45); });
    strokeField(g, S, 500, [[120, 120, 125], [80, 80, 86], [170, 165, 160]], 26, 3, 0.3, 0.5, 0.25);
    TEX.rock = toTex(c);
  }
  { // snow
    const c = makeCanvas(S), g = c.getContext('2d');
    paintPixels(g, S, (u, v) => { const n = fbm(u * 6, v * 6, 4, 6) * 0.5 + 0.5; return mixc([206, 218, 238], [252, 253, 255], n); });
    strokeField(g, S, 400, [[220, 230, 248], [255, 255, 255]], 30, 4, 0.1, 0.3, 0.35);
    TEX.snow = toTex(c);
  }
  { // cobblestone
    const c = makeCanvas(S), g = c.getContext('2d');
    paintPixels(g, S, (u, v) => { const [f1, f2, id] = voronoiCell(u, v, 10); const e = f2 - f1; const base = mixc([118, 112, 104], [172, 164, 150], hash2(id, 9)); const shade = 0.82 + 0.25 * (1 - f1) + fbm(u * 30, v * 30, 2, 30) * 0.08; let col = base.map((x) => x * shade); return mixc([70, 66, 58], col, smooth(0.02, 0.1, e)); });
    TEX.cobble = toTex(c);
  }
  { // castle / foundation stone bricks
    const c = makeCanvas(S), g = c.getContext('2d');
    paintPixels(g, S, (u, v) => { const n = fbm(u * 12, v * 12, 3, 12) * 0.5 + 0.5; return mixc([150, 144, 134], [196, 190, 178], n); });
    const rows = 8, rh = S / rows;
    for (let r = 0; r < rows; r++) {
      const off = (r % 2) * rh * 0.9; let x = -off;
      while (x < S) {
        const w = rh * rr(1.5, 2.4), col = mixc([138, 132, 122], [205, 198, 186], rand());
        g.fillStyle = rgba(col, 0.55); g.fillRect(x + 2, r * rh + 2, w - 4, rh - 4);
        if (x < 0) g.fillRect(x + S + 2, r * rh + 2, w - 4, rh - 4);
        g.strokeStyle = 'rgba(70,64,58,0.85)'; g.lineWidth = 3; g.strokeRect(x + 1, r * rh + 1, w - 2, rh - 2);
        if (x < 0) g.strokeRect(x + S + 1, r * rh + 1, w - 2, rh - 2);
        x += w;
      }
    }
    strokeField(g, S, 700, [[110, 105, 98], [215, 210, 200]], 8, 1.5, 0, 3, 0.25);
    TEX.brick = toTex(c);
  }
  { // plaster (neutral, tinted per house)
    const c = makeCanvas(S), g = c.getContext('2d');
    paintPixels(g, S, (u, v) => { const n = fbm(u * 5, v * 5, 5, 5) * 0.5 + 0.5; const s = smooth(0.6, 0.9, fbm(u * 3 + 7, v * 2, 3, 3) * 0.5 + 0.5); return mixc(mixc([228, 222, 208], [250, 246, 236], n), [196, 186, 166], s * 0.5); });
    strokeField(g, S, 900, [[235, 230, 218], [215, 206, 190]], 18, 5, 0.2, 0.8, 0.18);
    TEX.plaster = toTex(c);
  }
  { // wood planks (neutral warm, tinted)
    const c = makeCanvas(S), g = c.getContext('2d');
    const pw = S / 6;
    paintPixels(g, S, (u, v, x, y) => { const p = Math.floor(y / pw), k = hash2(p, 4); const grain = Math.sin((u * 40 + fbm(u * 4 + p, v * 20, 3) * 3) * 3) * 0.5 + 0.5; let col = mixc([150, 118, 84], [205, 170, 125], k * 0.6 + grain * 0.4); const edge = Math.min(y % pw, pw - (y % pw)); if (edge < 2) col = col.map((q) => q * 0.55); return col; });
    TEX.wood = toTex(c);
  }
  { // roof tiles (neutral, tinted)
    const c = makeCanvas(S), g = c.getContext('2d');
    g.fillStyle = '#8a8078'; g.fillRect(0, 0, S, S);
    const rows = 16, rh = S / rows, tw = S / 12;
    for (let r = rows; r >= -1; r--) for (let i = -1; i <= 12; i++) {
      const x = i * tw + (r % 2) * tw * 0.5, y = r * rh, k = rand();
      const grd = g.createLinearGradient(0, y, 0, y + rh * 1.4);
      const cc = mixc([210, 200, 190], [245, 238, 230], k);
      grd.addColorStop(0, rgba(cc, 1)); grd.addColorStop(1, rgba(cc.map((q) => q * 0.62), 1));
      g.fillStyle = grd; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + rh); g.arc(x + tw / 2, y + rh, tw / 2, Math.PI, 0, true); g.lineTo(x + tw, y); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(60,50,45,0.5)'; g.lineWidth = 1.5; g.stroke();
    }
    TEX.roof = toTex(c);
  }
  { // thatch
    const c = makeCanvas(S), g = c.getContext('2d');
    g.fillStyle = '#a8894e'; g.fillRect(0, 0, S, S);
    strokeField(g, S, 5000, [[200, 165, 95], [160, 125, 70], [225, 195, 125], [130, 100, 55]], 34, 2, Math.PI / 2, 0.15, 0.6);
    TEX.thatch = toTex(c);
  }
  { // bark
    const c = makeCanvas(S), g = c.getContext('2d');
    paintPixels(g, S, (u, v) => { const n = fbm(u * 16, v * 3, 4, 16) * 0.5 + 0.5; const r = Math.abs(Math.sin(u * TAU * 9 + fbm(u * 4, v * 4, 3, 4) * 4)); return mixc([62, 46, 34], [128, 104, 80], n * 0.6 + r * 0.4); });
    strokeField(g, S, 900, [[50, 38, 30], [140, 118, 92], [92, 110, 64]], 30, 2.5, Math.PI / 2, 0.12, 0.35);
    TEX.bark = toTex(c);
  }
  { // leaves
    const c = makeCanvas(S), g = c.getContext('2d');
    g.fillStyle = '#3d6a2a'; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 4200; i++) {
      const x = rand() * S, y = rand() * S, a = rand() * TAU, l = rr(7, 14), col = pick([[52, 96, 36], [78, 128, 46], [110, 158, 62], [40, 76, 30], [140, 176, 74]]);
      g.fillStyle = rgba(mixc(col, [0, 0, 0], rr(0, 0.25)), 0.9);
      wrapDraw(g, S, x, y, 16, (px, py) => { g.beginPath(); g.ellipse(px, py, l, l * 0.42, a, 0, TAU); g.fill(); });
    }
    TEX.leaves = toTex(c);
  }
  { // fabric weave, near white
    const c = makeCanvas(256), g = c.getContext('2d');
    paintPixels(g, 256, (u, v, x, y) => { const w = ((x >> 1) + (y >> 1)) % 2 ? 0.94 : 1; const n = 0.92 + 0.08 * (fbm(u * 16, v * 16, 2, 16) * 0.5 + 0.5); const k = 236 * w * n; return [k, k, k]; });
    TEX.fabric = toTex(c);
  }
  { // water normal map
    const N = 256, c = makeCanvas(N), g = c.getContext('2d'), H = new Float32Array(N * N);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) H[y * N + x] = fbm(x / N * 8, y / N * 8, 4, 8);
    paintPixels(g, N, (u, v, x, y) => { const hx = H[y * N + ((x + 1) % N)] - H[y * N + ((x + N - 1) % N)], hy = H[((y + 1) % N) * N + x] - H[((y + N - 1) % N) * N + x]; const s = 3.5; const nx = -hx * s, ny = -hy * s, nz = 1, l = Math.hypot(nx, ny, nz); return [(nx / l * 0.5 + 0.5) * 255, (ny / l * 0.5 + 0.5) * 255, (nz / l * 0.5 + 0.5) * 255]; });
    TEX.waterN = toTex(c, false);
  }
  { // window glass (lead panes, emissive warm)
    const c = makeCanvas(128), g = c.getContext('2d');
    const grd = g.createRadialGradient(64, 70, 10, 64, 64, 90); grd.addColorStop(0, '#ffe7a8'); grd.addColorStop(1, '#d68a3a');
    g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#3b2a1c'; g.lineWidth = 6; g.strokeRect(0, 0, 128, 128);
    g.lineWidth = 3; for (let i = 1; i < 3; i++) { g.beginPath(); g.moveTo(i * 42.6, 0); g.lineTo(i * 42.6, 128); g.stroke(); g.beginPath(); g.moveTo(0, i * 42.6); g.lineTo(128, i * 42.6); g.stroke(); }
    TEX.window = toTex(c, true, false);
  }
  { // royal banner
    const c = document.createElement('canvas'); c.width = 128; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#1f3c7a'; g.fillRect(0, 0, 128, 256);
    g.fillStyle = '#d9a93a'; g.fillRect(0, 0, 128, 10); g.fillRect(8, 0, 6, 230); g.fillRect(114, 0, 6, 230);
    g.beginPath(); g.moveTo(0, 220); g.lineTo(64, 256); g.lineTo(128, 220); g.lineTo(128, 256); g.lineTo(0, 256); g.fillStyle = '#000000'; g.globalCompositeOperation = 'destination-out'; g.fill(); g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#e9c25a'; g.beginPath(); // stylised white dragon crest: a star sun above a peak
    g.arc(64, 90, 22, 0, TAU); g.fill();
    for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.beginPath(); g.moveTo(64 + Math.cos(a) * 26, 90 + Math.sin(a) * 26); g.lineTo(64 + Math.cos(a + 0.13) * 40, 90 + Math.sin(a + 0.13) * 40); g.lineTo(64 + Math.cos(a - 0.13) * 40, 90 + Math.sin(a - 0.13) * 40); g.fill(); }
    g.fillStyle = '#f4f6ff'; g.beginPath(); g.moveTo(24, 190); g.lineTo(64, 132); g.lineTo(104, 190); g.fill();
    g.fillStyle = '#1f3c7a'; g.beginPath(); g.moveTo(50, 190); g.lineTo(64, 168); g.lineTo(78, 190); g.fill();
    TEX.banner = toTex(c, true, false);
  }
  { // pub sign
    const c = document.createElement('canvas'); c.width = 512; c.height = 192; const g = c.getContext('2d');
    g.fillStyle = '#5b3a22'; g.fillRect(0, 0, 512, 192);
    for (let i = 0; i < 60; i++) { g.strokeStyle = rgba([90, 60, 36], 0.6); g.lineWidth = rr(1, 3); g.beginPath(); const y = rand() * 192; g.moveTo(0, y); g.bezierCurveTo(170, y + rr(-6, 6), 340, y + rr(-6, 6), 512, y); g.stroke(); }
    g.strokeStyle = '#d9a93a'; g.lineWidth = 8; g.strokeRect(10, 10, 492, 172);
    g.fillStyle = '#f0c75e'; g.font = 'bold 54px Georgia, serif'; g.textAlign = 'center'; g.fillText('The Gilded Acorn', 256, 92);
    g.font = 'italic 28px Georgia, serif'; g.fillText('tavern  ·  café  ·  rooms', 256, 140);
    TEX.sign = toTex(c, true, false);
  }
  { // soft glow sprite
    const c = makeCanvas(64), g = c.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32); grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64); TEX.glow = toTex(c, true, false);
  }
  { // god ray gradient
    const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d');
    const grd = g.createLinearGradient(0, 0, 0, 256); grd.addColorStop(0, 'rgba(255,240,200,0)'); grd.addColorStop(0.25, 'rgba(255,240,200,0.9)'); grd.addColorStop(1, 'rgba(255,240,200,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 256);
    const gx = g.createLinearGradient(0, 0, 64, 0); gx.addColorStop(0, 'rgba(0,0,0,1)'); gx.addColorStop(0.5, 'rgba(0,0,0,0)'); gx.addColorStop(1, 'rgba(0,0,0,1)');
    g.globalCompositeOperation = 'destination-out'; g.fillStyle = gx; g.fillRect(0, 0, 64, 256);
    TEX.ray = toTex(c, true, false);
  }
  { // Zzz / heart / text sprite helpers are drawn on demand
  }
}
buildTextures();

// ---------- Materials ----------
const std = (map, color, rough = 0.9, extra = {}) => new THREE.MeshStandardMaterial({ map, color, roughness: rough, metalness: 0, ...extra });
const MAT = {
  plasterCream: std(TEX.plaster, 0xf3e6c8), plasterWhite: std(TEX.plaster, 0xfbf8f0), plasterOchre: std(TEX.plaster, 0xe9cf96), plasterRose: std(TEX.plaster, 0xeec9b8), plasterSky: std(TEX.plaster, 0xc9dbe6),
  timber: std(TEX.wood, 0x5b3d26), darkWood: std(TEX.wood, 0x4a3020), wood: std(TEX.wood, 0xa47a50), lightWood: std(TEX.wood, 0xd7b483),
  roofRed: std(TEX.roof, 0xbf5a3c), roofSlate: std(TEX.roof, 0x6d7c94), roofMoss: std(TEX.roof, 0x7b9356), roofBrown: std(TEX.roof, 0x9a6a48), thatch: std(TEX.thatch, 0xffffff),
  stone: std(TEX.brick, 0xc7bdaf), castle: std(TEX.brick, 0xd8d0c2), castleDark: std(TEX.brick, 0x9c958a), cobble: std(TEX.cobble, 0xffffff), rock: std(TEX.rock, 0xffffff),
  bark: std(TEX.bark, 0xffffff), leaves: std(TEX.leaves, 0xffffff, 0.85), hedge: std(TEX.leaves, 0x6f9a55, 0.9), elfRoof: std(TEX.leaves, 0x9fd07a, 0.8),
  metal: new THREE.MeshStandardMaterial({ color: 0x8a8d92, metalness: 0.85, roughness: 0.35 }), gold: new THREE.MeshStandardMaterial({ color: 0xd9a640, metalness: 0.95, roughness: 0.28 }),
  red: std(TEX.fabric, 0x9e2430, 0.95), blue: std(TEX.fabric, 0x24427e, 0.95), green: std(TEX.fabric, 0x3d6b3a, 0.95), cream: std(TEX.fabric, 0xeadfc6, 0.95), purple: std(TEX.fabric, 0x5c3a78, 0.95),
  window: new THREE.MeshStandardMaterial({ map: TEX.window, emissiveMap: TEX.window, emissive: 0xffc070, emissiveIntensity: 0.1, roughness: 0.2 }),
  flame: new THREE.MeshBasicMaterial({ color: 0xffb84a }), ember: new THREE.MeshStandardMaterial({ color: 0x331100, emissive: 0xff5a10, emissiveIntensity: 2 }),
  banner: new THREE.MeshStandardMaterial({ map: TEX.banner, side: THREE.DoubleSide, roughness: 0.9, alphaTest: 0.5, transparent: false }),
  sign: std(TEX.sign, 0xffffff, 0.7), white: std(TEX.fabric, 0xffffff), black: new THREE.MeshStandardMaterial({ color: 0x1b1714, roughness: 0.6 }),
  glassBottle: new THREE.MeshStandardMaterial({ color: 0x3e8a5a, roughness: 0.1, metalness: 0.1, emissive: 0x0b2a14 }), glassAmber: new THREE.MeshStandardMaterial({ color: 0xb5651d, roughness: 0.1, emissive: 0x2a1204 }), glassBlue: new THREE.MeshStandardMaterial({ color: 0x3a5fb0, roughness: 0.1, emissive: 0x0a1430 }),
  lantern: new THREE.MeshStandardMaterial({ color: 0xffd58a, emissive: 0xffb050, emissiveIntensity: 1.2, roughness: 0.4 }),
  flowerR: std(null, 0xd8414f, 0.8), flowerY: std(null, 0xf2cf3e, 0.8), flowerW: std(null, 0xf4f1ea, 0.8), flowerP: std(null, 0xa36bd8, 0.8),
  carpet: std(TEX.fabric, 0x8e1d26, 1), rug: std(TEX.fabric, 0x7a4b2a, 1), rugBlue: std(TEX.fabric, 0x2f4f7a, 1),
  snowRock: std(TEX.snow, 0xffffff),
};
for (const m of Object.values(MAT)) { if (m.map && m.map.wrapS === THREE.RepeatWrapping) m.map.needsUpdate = true; }
MAT.leaves.side = THREE.FrontSide;

// ---------- Geometry helpers ----------
const _m4 = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
function scaleUV(geo, su, sv) { const uv = geo.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * su, uv.getY(i) * sv); return geo; }
function boxGeo(sx, sy, sz, ts = 2) { // box with world-scaled UVs per face
  const g = new THREE.BoxGeometry(sx, sy, sz), uv = g.attributes.uv;
  const dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] / ts, uv.getY(i) * dims[f][1] / ts); }
  return g;
}
function normGeo(g) {
  let ng = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(ng.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) ng.deleteAttribute(k);
  if (!ng.attributes.uv) ng.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(ng.attributes.position.count * 2), 2));
  if (!ng.attributes.normal) ng.computeVertexNormals();
  ng.morphAttributes = {};
  return ng;
}
function xform(x, y, z, ry = 0, rx = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
  _e.set(rx, ry, rz, 'YXZ'); _q.setFromEuler(_e); return new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), _q.clone(), new THREE.Vector3(sx, sy, sz));
}
class Batch { // merges static geometry per material
  constructor(name) { this.name = name; this.lists = new Map(); }
  add(mat, geo, m4) { const g = geo.clone(); if (m4) g.applyMatrix4(m4); if (!this.lists.has(mat)) this.lists.set(mat, []); this.lists.get(mat).push(normGeo(g)); }
  build(parent, shadows = true) {
    const meshes = [];
    for (const [mat, list] of this.lists) {
      const merged = mergeGeometries(list, false); if (!merged) continue;
      merged.computeBoundingSphere();
      const mesh = new THREE.Mesh(merged, mat); mesh.castShadow = shadows && !mat.transparent && mat !== MAT.window && mat !== MAT.flame && mat !== MAT.lantern; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false;
      parent.add(mesh); meshes.push(mesh);
    }
    this.lists.clear(); return meshes;
  }
}
