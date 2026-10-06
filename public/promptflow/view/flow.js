import * as THREE from 'three';
import { glowSprite } from './holo.js';

// PROMPTFLOW · the world: your phone, the road to the data centre, the GPU hall, and a transformer laid out in
// space — token cubes, the layer stack, attention arcs and the next-token bar chart.

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const TF = { x0: 26, layers: 8, y0: 2.2, dy: 1.6 };

export function textSprite(text, { color = '#e8f0ff', size = 0.8, bg = null, font = 600 } = {}) {
  const c = document.createElement('canvas'), g = c.getContext('2d'); g.font = `${font} 44px "JetBrains Mono", monospace`; const w = Math.max(64, Math.ceil(g.measureText(text).width) + 28); c.width = w; c.height = 64;
  if (bg) { g.fillStyle = bg; g.beginPath(); g.roundRect(2, 4, w - 4, 56, 12); g.fill(); }
  g.font = `${font} 44px "JetBrains Mono", monospace`; g.fillStyle = color; g.textBaseline = 'middle'; g.fillText(text, 14, 34);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false })); s.scale.set((size * w) / 64, size, 1); return s;
}
export const tokColor = (id) => new THREE.Color().setHSL(((id * 0.61803) % 1), 0.75, 0.6);

export function buildWorld(scene) {
  const W = {};
  // Starry dark backdrop.
  { const n = 1500, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const r = 200 + Math.random() * 300, a = Math.random() * Math.PI * 2, b = Math.acos(2 * Math.random() - 1); p.set([r * Math.sin(b) * Math.cos(a), r * Math.cos(b), r * Math.sin(b) * Math.sin(a)], i * 3); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: '#8fa8ff', size: 1.2, sizeAttenuation: false, transparent: true, opacity: 0.6 }))); }
  const grid = new THREE.GridHelper(300, 100, '#1a2a50', '#0e1630'); grid.position.y = -4; scene.add(grid);
  // Phone with a live screen.
  const phone = new THREE.Group(); phone.position.set(-72, 2, 0); scene.add(phone);
  phone.add(new THREE.Mesh(new THREE.BoxGeometry(3.4, 6.8, 0.36), new THREE.MeshStandardMaterial({ color: '#15171f', metalness: 0.7, roughness: 0.3 })));
  const sc = document.createElement('canvas'); sc.width = 320; sc.height = 640; W.screenCv = sc; W.screenTex = new THREE.CanvasTexture(sc); W.screenTex.colorSpace = THREE.SRGBColorSpace;
  const scr = new THREE.Mesh(new THREE.PlaneGeometry(3.1, 6.3), new THREE.MeshBasicMaterial({ map: W.screenTex })); scr.position.z = 0.19; phone.add(scr); phone.rotation.y = 0.5; W.phone = phone;
  // The road: Wi-Fi → ISP → backbone fibre → data centre.
  W.stations = [V(-72, 2, 0), V(-56, 3, -6), V(-40, 5, 5), V(-22, 1, -3), V(-4, 2, 0)];
  W.route = new THREE.CatmullRomCurve3([W.stations[0], V(-64, 4, -5), W.stations[1], V(-48, 6, 2), W.stations[2], V(-31, 2, 6), W.stations[3], V(-12, 0, -4), W.stations[4]]);
  scene.add(new THREE.Mesh(new THREE.TubeGeometry(W.route, 300, 0.12, 8, false), new THREE.MeshBasicMaterial({ color: '#2a6cff', transparent: true, opacity: 0.55 })));
  W.labels = ['YOU', 'WI-FI', 'ISP', 'BACKBONE FIBRE', 'DATA CENTRE'].map((k, i) => { const s = textSprite(k, { color: '#9fd0ff', size: 1.1 }); s.position.copy(W.stations[i]).add(V(0, 4.6, 0)); scene.add(s); const gl = glowSprite('#5ab4ff', 2.4, 0.8); gl.position.copy(W.stations[i]); scene.add(gl); return s; });
  W.packets = [...Array(24)].map(() => { const s = glowSprite('#9fe8ff', 0.9, 0); scene.add(s); return { s, t: -1 }; });
  // Data centre: a hall of GPU racks.
  const dc = new THREE.Group(); dc.position.set(2, -4, 0); scene.add(dc); W.dc = dc;
  const floor = new THREE.Mesh(new THREE.BoxGeometry(18, 0.3, 14), new THREE.MeshStandardMaterial({ color: '#1c2030', metalness: 0.5, roughness: 0.4 })); dc.add(floor);
  const rackG = new THREE.BoxGeometry(1.2, 4, 1.4), rackM = new THREE.MeshStandardMaterial({ color: '#10131c', metalness: 0.7, roughness: 0.35 }), ledM = new THREE.MeshBasicMaterial({ color: '#58e0ff' });
  W.leds = [];
  for (let r = 0; r < 4; r++) for (let i = 0; i < 8; i++) { const x = -6.5 + i * 1.8, z = -4.5 + r * 3; const k = new THREE.Mesh(rackG, rackM); k.position.set(x, 2.15, z); dc.add(k); const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 3.4, 0.02), ledM.clone()); l.position.set(x + 0.45, 2.15, z + 0.72); dc.add(l); W.leds.push(l); }
  // Transformer: token cubes, layer slabs, residual lines, attention arcs, output bars.
  W.tf = new THREE.Group(); scene.add(W.tf); W.tokens = []; W.arcs = new THREE.Group(); W.tf.add(W.arcs); W.bars = new THREE.Group(); W.tf.add(W.bars);
  W.slabs = [...Array(TF.layers)].map((_, i) => { const m = new THREE.Mesh(new THREE.BoxGeometry(1, 0.08, 4), new THREE.MeshStandardMaterial({ color: '#4a6aff', emissive: '#2a3aaa', emissiveIntensity: 0.4, transparent: true, opacity: 0.18, metalness: 0.2, roughness: 0.3, depthWrite: false })); m.position.y = TF.y0 + i * TF.dy; W.tf.add(m); return m; });
  W.layerLabel = textSprite('× N layers', { color: '#9fb0ff', size: 0.9 }); W.tf.add(W.layerLabel);
  W.pulse = glowSprite('#ffffff', 1.4, 0); W.tf.add(W.pulse);
  return W;
}

// Lay the prompt's tokens out as cubes along x.
export function setTokens(W, toks) {
  for (const o of W.tokens) { W.tf.remove(o.cube, o.label, o.res); }
  W.tokens = []; const n = toks.length, sp = Math.min(1.7, 64 / Math.max(1, n));
  toks.forEach((t, i) => {
    const x = TF.x0 + i * sp, col = tokColor(t.id);
    const cube = new THREE.Mesh(new THREE.BoxGeometry(sp * 0.82, 0.9, 0.9), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.35, metalness: 0.2, roughness: 0.4 })); cube.position.set(x, 0, 0);
    const label = textSprite(t.s.replace(/ /g, '␣'), { color: '#ffffff', size: Math.min(0.7, sp * 0.55) }); label.position.set(x, -1.0, 0.6); label.material.rotation = 0;
    const res = new THREE.Line(new THREE.BufferGeometry().setFromPoints([V(x, 0.5, 0), V(x, TF.y0 + (TF.layers - 1) * TF.dy + 0.4, 0)]), new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: 0.35 }));
    W.tf.add(cube, label, res); W.tokens.push({ cube, label, res, x, t });
  });
  const w = Math.max(4, n * sp + 1);
  W.slabs.forEach((s) => { s.scale.x = w; s.position.x = TF.x0 + ((n - 1) * sp) / 2; });
  W.layerLabel.position.set(TF.x0 - 3.2, TF.y0 + 3.5 * TF.dy, 0); W.span = { sp, w, mid: TF.x0 + ((n - 1) * sp) / 2, n };
}
// Attention arcs from query token q back to each key j, thickness ∝ weight.
export function setArcs(W, A, q) {
  for (const c of [...W.arcs.children]) { W.arcs.remove(c); c.geometry.dispose(); }
  if (!A || q == null || !W.tokens[q]) return;
  const y = TF.y0 + 4 * TF.dy, row = A[q];
  row.forEach((w, j) => { if (w < 0.02) return; const a = V(W.tokens[q].x, y, 0), b = V(W.tokens[j].x, y, 0), h = 1 + Math.abs(a.x - b.x) * 0.35;
    const cur = new THREE.QuadraticBezierCurve3(a, V((a.x + b.x) / 2, y + h, 0.3), b), m = new THREE.Mesh(new THREE.TubeGeometry(cur, 40, 0.03 + 0.22 * w, 8, false), new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(0.55 - 0.45 * w, 1, 0.6), transparent: true, opacity: 0.35 + 0.6 * w, blending: THREE.AdditiveBlending, depthWrite: false }));
    W.arcs.add(m); });
}
// Next-token candidates as bars above the last token.
export function setBars(W, cands) {
  for (const c of [...W.bars.children]) W.bars.remove(c);
  if (!W.span) return; const top = TF.y0 + TF.layers * TF.dy + 1.6, x0 = W.span.mid - 6;
  cands.slice(0, 8).forEach(([s, p, chosen], i) => {
    const h = Math.max(0.05, p * 9), x = x0 + i * 1.7, col = chosen ? '#7cff9e' : '#ffb347';
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.1, h, 0.6), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.5 })); bar.position.set(x, top + h / 2, 0); W.bars.add(bar);
    const lb = textSprite(s.replace(/ /g, '␣'), { color: col, size: 0.55 }); lb.position.set(x, top - 0.6, 0.4); W.bars.add(lb);
    const pv = textSprite((p * 100).toFixed(0) + '%', { color: '#ffffff', size: 0.45 }); pv.position.set(x, top + h + 0.5, 0.4); W.bars.add(pv);
  });
}
export function drawScreen(W, text, reply = '') {
  const g = W.screenCv.getContext('2d'); g.fillStyle = '#0b0f1a'; g.fillRect(0, 0, 320, 640);
  g.fillStyle = '#1e2a4a'; g.fillRect(0, 0, 320, 54); g.fillStyle = '#9fd0ff'; g.font = '600 22px sans-serif'; g.fillText('Assistant', 18, 35);
  const wrap = (s, x, y, w, col, bg) => { g.font = '18px sans-serif'; const words = s.split(' '); let line = '', yy = y; const lines = []; for (const wd of words) { const tl = line ? line + ' ' + wd : wd; if (g.measureText(tl).width > w) { lines.push(line); line = wd; } else line = tl; } if (line) lines.push(line); const hgt = lines.length * 24 + 16; g.fillStyle = bg; g.beginPath(); g.roundRect(x - 10, yy - 22, w + 20, hgt, 14); g.fill(); g.fillStyle = col; for (const l of lines.slice(0, 14)) { g.fillText(l, x, yy); yy += 24; } return yy + 20; };
  let y = 100; y = wrap(text || '…', 60, y, 230, '#ffffff', '#2a5cff'); if (reply) wrap(reply, 28, y + 10, 240, '#e8eefc', '#24283a');
  W.screenTex.needsUpdate = true;
}
