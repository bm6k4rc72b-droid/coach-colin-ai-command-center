/**
 * Courtroom Sector 7, in 3D: a live, animated court for the courtroom card.
 *
 * Marble and gold hall, an elevated walnut bench with Judge Colin on it (his
 * video feed on the wall monitor behind him, his 3D figure at the bench with
 * the gavel), the Defence and the Prosecution at their tables, a witness
 * stand where exhibits rise as holograms, and a jury box of twelve whose
 * seats light up in the colour of their vote. The trial drives it: counsel
 * stand to argue, objections flash SUSTAINED or OVERRULED over the bench,
 * the gavel lands on the beat of the knock, and the verdict dims the room
 * and puts a spotlight on the winner. A camera director cuts between shots.
 *
 * Reads `state.court` (court.js) every frame and takes one-off events from
 * cards3.js through `courtroom.event()`. Renders only while the card is on
 * screen.
 *
 * @module astra/showcase/courtroom3d
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { judge } from './judge.js';

const GOLD = 0xf0b75a;
const GOLD_HI = 0xffd998;
const SIDE_COLOR = { a: 0x3fe6dc, b: 0xff5c8a };
const SIDE_NAME = { a: 'DEFENCE', b: 'PROSECUTION' };

/* ------------------------------------------------------------ textures */

function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** Black marble with gold and grey veins (seeded, so it is the same every visit). */
function marble(seed = 7) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const t = canvasTexture(1024, 1024, (g, w, h) => {
    g.fillStyle = '#07080c'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 42; i++) {
      const gold = rnd() < 0.22;
      g.strokeStyle = gold ? `rgba(240,183,90,${0.18 + rnd() * 0.3})` : `rgba(170,180,200,${0.04 + rnd() * 0.09})`;
      g.lineWidth = gold ? 0.8 + rnd() * 1.4 : 0.6 + rnd() * 3;
      g.beginPath();
      let x = rnd() * w, y = rnd() * h;
      g.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        const nx = x + (rnd() - 0.4) * 320, ny = y + (rnd() - 0.5) * 220;
        g.quadraticCurveTo(x + (rnd() - 0.5) * 200, y + (rnd() - 0.5) * 200, nx, ny);
        x = nx; y = ny;
      }
      g.stroke();
    }
    // tiles
    g.strokeStyle = 'rgba(240,183,90,0.35)'; g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * w / 4, 0); g.lineTo(i * w / 4, h); g.stroke(); g.beginPath(); g.moveTo(0, i * h / 4); g.lineTo(w, i * h / 4); g.stroke(); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function walnut() {
  return canvasTexture(512, 512, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, '#2a140a'); grad.addColorStop(0.5, '#3b1d0e'); grad.addColorStop(1, '#24110a');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) {
      g.strokeStyle = `rgba(${90 + Math.random() * 40},${45 + Math.random() * 20},20,${0.15 + Math.random() * 0.25})`;
      g.lineWidth = Math.random() * 2;
      const y = Math.random() * h;
      g.beginPath(); g.moveTo(0, y);
      g.bezierCurveTo(w * 0.3, y + Math.random() * 30 - 15, w * 0.6, y + Math.random() * 30 - 15, w, y + Math.random() * 20 - 10);
      g.stroke();
    }
  });
}

/** The court seal: scales of justice in a gold ring. */
function seal() {
  return canvasTexture(512, 512, (g, w) => {
    const c = w / 2;
    g.clearRect(0, 0, w, w);
    const ring = (r, lw, a) => { g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.lineWidth = lw; g.strokeStyle = `rgba(255,217,152,${a})`; g.stroke(); };
    g.fillStyle = 'rgba(10,8,6,0.92)'; g.beginPath(); g.arc(c, c, 250, 0, Math.PI * 2); g.fill();
    ring(244, 8, 1); ring(222, 2, 0.8); ring(150, 2, 0.6);
    g.fillStyle = '#ffd998'; g.font = '600 30px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    const text = '· COLIN BIOMEDICAL · COURTROOM SECTOR 7 ';
    for (let i = 0; i < text.length; i++) {
      const a = (i / text.length) * Math.PI * 2 - Math.PI / 2;
      g.save(); g.translate(c + Math.cos(a) * 186, c + Math.sin(a) * 186); g.rotate(a + Math.PI / 2); g.fillText(text[i], 0, 0); g.restore();
    }
    // scales
    g.strokeStyle = '#f0b75a'; g.lineWidth = 7; g.lineCap = 'round';
    g.beginPath(); g.moveTo(c, c - 95); g.lineTo(c, c + 85); g.moveTo(c - 85, c - 60); g.lineTo(c + 85, c - 60); g.moveTo(c - 40, c + 85); g.lineTo(c + 40, c + 85); g.stroke();
    for (const s of [-1, 1]) {
      g.beginPath(); g.moveTo(c + s * 85, c - 60); g.lineTo(c + s * 60, c + 5); g.moveTo(c + s * 85, c - 60); g.lineTo(c + s * 110, c + 5); g.stroke();
      g.beginPath(); g.arc(c + s * 85, c + 5, 27, 0, Math.PI); g.stroke();
    }
    g.fillStyle = '#ffd998'; g.beginPath(); g.arc(c, c - 100, 11, 0, Math.PI * 2); g.fill();
  });
}

/** A text card for holograms and banners. */
function label(text, { color = '#ffd998', sub = '', w = 1024, h = 256, glow = color, font = 'Georgia, serif' } = {}) {
  return canvasTexture(w, h, (g) => {
    g.clearRect(0, 0, w, h);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = glow; g.shadowBlur = 28;
    g.fillStyle = color; g.font = `700 ${sub ? h * 0.42 : h * 0.55}px ${font}`;
    g.fillText(text, w / 2, sub ? h * 0.38 : h / 2);
    if (sub) { g.shadowBlur = 10; g.font = `500 ${h * 0.17}px ui-monospace, Menlo, monospace`; g.fillStyle = 'rgba(255,255,255,0.85)'; g.fillText(sub, w / 2, h * 0.78); }
  });
}

/* --------------------------------------------------------------- figures */

/**
 * A figure: a stylised mannequin in a dark suit with a gold collar and a
 * glowing visor. Arms hang from shoulder pivots so they can gesture.
 */
function figure({ robe = false, accent = GOLD, scale = 1 } = {}) {
  const g = new THREE.Group();
  const suit = new THREE.MeshPhysicalMaterial({ emissive: accent, emissiveIntensity: 0.035, color: robe ? 0x16141c : 0x262a36, roughness: robe ? 0.55 : 0.38, metalness: 0.1, clearcoat: 0.6, clearcoatRoughness: 0.3, sheen: 0.6, sheenColor: new THREE.Color(0x404060) });
  const skin = new THREE.MeshPhysicalMaterial({ color: 0x1b1d24, roughness: 0.2, metalness: 0.6, clearcoat: 1 });
  const gold = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1, roughness: 0.22, emissive: GOLD, emissiveIntensity: 0.12 });
  const visorMat = new THREE.MeshBasicMaterial({ color: accent, transparent: true, opacity: 0.95 });

  const body = robe
    ? new THREE.Mesh(new THREE.LatheGeometry([[0, 0], [0.42, 0], [0.36, 0.5], [0.28, 0.95], [0.2, 1.18], [0, 1.22]].map(([x, y]) => new THREE.Vector2(x, y)), 32), suit)
    : new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.62, 6, 18), suit);
  body.position.y = robe ? 0 : 0.72;
  if (!robe) body.scale.set(1.05, 1, 0.72);
  g.add(body);

  const chest = new THREE.Group(); chest.position.y = robe ? 1.12 : 1.06; g.add(chest);
  const collar = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.022, 10, 32), gold);
  collar.rotation.x = Math.PI / 2; collar.position.y = 0.04; chest.add(collar);
  if (robe) {
    const stole = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.018, 8, 40, Math.PI), gold);
    stole.rotation.set(Math.PI / 2.4, 0, Math.PI); stole.position.set(0, -0.1, 0.08); chest.add(stole);
  }
  const head = new THREE.Group(); head.position.y = 0.26; chest.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.15, 32, 24), skin);
  skull.scale.set(0.92, 1.12, 1); head.add(skull);
  const visor = new THREE.Mesh(new THREE.CapsuleGeometry(0.03, 0.15, 4, 12), visorMat);
  visor.rotation.z = Math.PI / 2; visor.position.set(0, 0.03, 0.128); head.add(visor);

  const arm = (side) => {
    const shoulder = new THREE.Group(); shoulder.position.set(side * (robe ? 0.25 : 0.24), robe ? 1.06 : 1.0, 0); g.add(shoulder);
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.055, 0.28, 4, 10), suit); upper.position.y = -0.2; shoulder.add(upper);
    const elbow = new THREE.Group(); elbow.position.y = -0.38; shoulder.add(elbow);
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.048, 0.26, 4, 10), suit); fore.position.y = -0.17; elbow.add(fore);
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.012, 6, 16), gold); cuff.rotation.x = Math.PI / 2; cuff.position.y = -0.3; elbow.add(cuff);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.05, 14, 10), skin); hand.position.y = -0.36; elbow.add(hand);
    shoulder.rotation.x = 0.15; elbow.rotation.x = -0.5;
    return { shoulder, elbow, hand };
  };
  const left = arm(-1), right = arm(1);
  g.scale.setScalar(scale);
  return { group: g, head, chest, left, right, visor: visorMat, body };
}

/* ------------------------------------------------------------- the court */

class Courtroom {
  constructor() {
    this.ready = false;
    this.active = false;
    this.fx = [];
    this.shot = 'wide';
    this.shotUntil = 0;
    this.gavelSeen = null;
    this.strikeAt = -1;
    this.verdict = null;
    this.argue = { a: -9, b: -9 };
    this.objectAt = { a: -9, b: -9 };
    this.voted = -9;
    this.t = 0;
    this.reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  /** The card element: the 3D canvas, the judge cam inset and the live labels. */
  element({ onTap } = {}) {
    if (this.wrap) return this.wrap;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'court3d-canvas';
    this.canvas.setAttribute('aria-label', 'Courtroom Sector 7: live 3D court');
    this.status = document.createElement('span');
    this.status.className = 'cam-status';
    this.status.textContent = 'IN SESSION';
    const live = document.createElement('span');
    live.className = 'cam-live'; live.textContent = '● LIVE · COURTROOM SECTOR 7';
    const inset = document.createElement('div');
    inset.className = 'court3d-inset';
    inset.append(judge.camera());
    const tag = document.createElement('span'); tag.className = 'court3d-inset-tag'; tag.textContent = 'JUDGE CAM'; inset.append(tag);
    this.wrap = document.createElement('figure');
    this.wrap.className = 'judge-cam-wrap court3d';
    this.wrap.title = 'Tap for order in court';
    this.wrap.append(this.canvas, inset, live, this.status);
    this.wrap.addEventListener('click', () => onTap?.());
    return this.wrap;
  }

  build() {
    if (this.ready) return;
    this.ready = true;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 1.05;
    r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = this.scene = new THREE.Scene();
    scene.background = new THREE.Color(0x030305);
    scene.fog = new THREE.FogExp2(0x05040a, 0.018);
    this.camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 60);
    this.camPos = new THREE.Vector3(0, 2.6, 8); this.camLook = new THREE.Vector3(0, 1.3, -2);
    this.camera.position.copy(this.camPos);

    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 256), 0.42, 0.55, 0.9);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.buildHall();
    this.buildBench();
    this.buildFloorPieces();
    this.buildPeople();
    this.buildLights();
    this.buildDust();
    this.resize();
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => this.resize()).observe(this.wrap);
  }

  resize() {
    if (!this.renderer || !this.wrap) return;
    const w = this.wrap.clientWidth || 640, h = this.wrap.clientHeight || 300;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.fov = w / h < 1.2 ? 55 : 42;
    this.camera.updateProjectionMatrix();
  }

  buildHall() {
    const s = this.scene;
    // Mirror floor under a glossy marble skin.
    const mirror = new Reflector(new THREE.PlaneGeometry(30, 30), { textureWidth: 1024, textureHeight: 1024, color: 0x777777 });
    mirror.rotation.x = -Math.PI / 2; mirror.position.y = -0.002; s.add(mirror);
    const tex = marble(); tex.repeat.set(3, 3);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.MeshPhysicalMaterial({ map: tex, transparent: true, opacity: 0.86, roughness: 0.25, metalness: 0.2, clearcoat: 1, clearcoatRoughness: 0.08 }));
    floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; s.add(floor);
    // Back wall: dark lacquer panels with gold pilasters.
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x0c0a0d, roughness: 0.45, metalness: 0.3 });
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(16, 8), wallMat); wall.position.set(0, 4, -6.2); s.add(wall);
    const goldMat = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1, roughness: 0.25, emissive: GOLD, emissiveIntensity: 0.25 });
    for (let i = -3; i <= 3; i++) {
      if (i === 0) continue;
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 7, 0.05), goldMat); strip.position.set(i * 1.6, 3.5, -6.15); s.add(strip);
    }
    // Columns.
    const stone = new THREE.MeshPhysicalMaterial({ color: 0x15141a, roughness: 0.3, clearcoat: 0.8, map: marble(3) });
    for (const x of [-5.2, 5.2]) for (const z of [-4.8, -1.5, 1.8]) {
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 6.5, 28), stone); col.position.set(x, 3.25, z); col.castShadow = true; s.add(col);
      for (const y of [0.15, 6.35]) { const cap = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.3, 0.95), goldMat); cap.position.set(x, y, z); s.add(cap); }
    }
    // Judge cam monitor above the bench, framed in gold.
    const frame = new THREE.Mesh(new THREE.BoxGeometry(3.3, 1.95, 0.08), goldMat); frame.position.set(0, 4.55, -6.05); s.add(frame);
    this.monitorMat = new THREE.MeshBasicMaterial({ color: 0xffffff, map: canvasTexture(64, 64, (g) => { g.fillStyle = '#0a0a10'; g.fillRect(0, 0, 64, 64); }) });
    this.monitor = new THREE.Mesh(new THREE.PlaneGeometry(3.15, 1.8), this.monitorMat); this.monitor.position.set(0, 4.55, -6.0); s.add(this.monitor);
    this.posterTex = new THREE.TextureLoader().load('../assets/showcase/judge-frame.jpg', (t) => { t.colorSpace = THREE.SRGBColorSpace; if (!this.monitorLive) { this.monitorMat.map = t; this.monitorMat.needsUpdate = true; } });
    const sealMesh = new THREE.Mesh(new THREE.CircleGeometry(0.85, 64), new THREE.MeshBasicMaterial({ map: seal(), transparent: true }));
    sealMesh.position.set(0, 3.0, -6.08); this.sealMesh = sealMesh;
    // The seal sits between monitor and bench on wide screens; on the bench front otherwise.
    s.add(sealMesh);
  }

  buildBench() {
    const s = this.scene;
    const wood = new THREE.MeshPhysicalMaterial({ map: walnut(), roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.12 });
    const goldMat = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1, roughness: 0.2, emissive: GOLD, emissiveIntensity: 0.3 });
    const dais = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.5, 2.4), new THREE.MeshPhysicalMaterial({ color: 0x0b0b0f, roughness: 0.2, clearcoat: 1, map: marble(11) }));
    dais.position.set(0, 0.25, -4.6); dais.receiveShadow = true; s.add(dais);
    const bench = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.35, 0.7), wood); bench.position.set(0, 1.17, -3.9); bench.castShadow = true; s.add(bench);
    const top = new THREE.Mesh(new THREE.BoxGeometry(3.8, 0.07, 0.9), goldMat); top.position.set(0, 1.88, -3.95); s.add(top);
    for (const y of [0.55, 1.2]) { const trim = new THREE.Mesh(new THREE.BoxGeometry(3.62, 0.03, 0.02), goldMat); trim.position.set(0, y, -3.54); s.add(trim); }
    const front = new THREE.Mesh(new THREE.CircleGeometry(0.42, 48), new THREE.MeshBasicMaterial({ map: seal(), transparent: true }));
    front.position.set(0, 1.12, -3.54); s.add(front);
    // Sound block and gavel.
    const block = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.13, 0.05, 32), wood); block.position.set(0.55, 1.94, -3.75); s.add(block);
    this.blockPos = block.position.clone().add(new THREE.Vector3(0, 0.05, 0));
    this.ring = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.13, 48), new THREE.MeshBasicMaterial({ color: GOLD_HI, transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2; this.ring.position.copy(this.blockPos); s.add(this.ring);
    // Chair back.
    const chair = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.7, 0.12), new THREE.MeshPhysicalMaterial({ color: 0x3a0d14, roughness: 0.5, sheen: 1, sheenColor: new THREE.Color(0x802030) }));
    chair.position.set(0, 2.15, -5.0); s.add(chair);
    const crest = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.025, 8, 40, Math.PI), goldMat); crest.position.set(0, 3.05, -4.95); s.add(crest);
  }

  buildFloorPieces() {
    const s = this.scene;
    const wood = new THREE.MeshPhysicalMaterial({ map: walnut(), roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.15 });
    const goldMat = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1, roughness: 0.22, emissive: GOLD, emissiveIntensity: 0.25 });
    this.tables = {};
    for (const [side, x] of [['a', -1.75], ['b', 1.75]]) {
      const t = new THREE.Group(); t.position.set(x, 0, 0.4); t.rotation.y = side === 'a' ? 0.28 : -0.28; s.add(t);
      const top = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 0.75), wood); top.position.y = 0.78; top.castShadow = true; t.add(top);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(1.66, 0.74, 0.05), wood); panel.position.set(0, 0.4, -0.33); t.add(panel);
      const edge = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.015, 0.77), goldMat); edge.position.y = 0.815; t.add(edge);
      // banker's lamp in the side's colour
      const lampMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(SIDE_COLOR[side]).multiplyScalar(0.55) });
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.13, 0.12, 20, 1, true), lampMat); shade.position.set(0.55, 1.02, -0.15); t.add(shade);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.2, 8), goldMat); stem.position.set(0.55, 0.9, -0.15); t.add(stem);
      const glow = new THREE.PointLight(SIDE_COLOR[side], 0.9, 2.4, 2); glow.position.set(0.55, 0.95, -0.15); t.add(glow);
      const plaque = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), new THREE.MeshBasicMaterial({ map: label(SIDE_NAME[side], { color: side === 'a' ? '#7ff6ee' : '#ff9cb8', h: 200 }), transparent: true }));
      plaque.position.set(0, 0.55, -0.36); plaque.rotation.y = Math.PI; t.add(plaque);
      // floor ring that lights up when this side has the floor
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.46, 64), new THREE.MeshBasicMaterial({ color: SIDE_COLOR[side], transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.01, 0.75); t.add(ring);
      this.tables[side] = { group: t, glow, ring, lampMat };
    }
    // Witness stand.
    const stand = new THREE.Group(); stand.position.set(2.9, 0, -3.0); stand.rotation.y = -0.6; s.add(stand);
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.05, 0.8), wood); box.position.y = 0.52; box.castShadow = true; stand.add(box);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(1.04, 0.04, 0.84), goldMat); rail.position.y = 1.06; stand.add(rail);
    const pad = new THREE.Mesh(new THREE.CircleGeometry(0.42, 48), new THREE.MeshBasicMaterial({ color: 0x5fd6ff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false }));
    pad.rotation.x = -Math.PI / 2; pad.position.y = 1.09; stand.add(pad);
    this.exhibit = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 0.8), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.exhibit.position.set(0, 1.75, 0); stand.add(this.exhibit);
    this.exhibitBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.2, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0x5fd6ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.exhibitBeam.position.y = 1.7; stand.add(this.exhibitBeam);
    this.stand = stand;
    // Jury box: two rows of six along the left wall.
    const jury = new THREE.Group(); jury.position.set(-4.0, 0, -1.6); jury.rotation.y = 1.15; s.add(jury);
    const jb = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.8, 0.08), wood); jb.position.set(0, 0.4, 0.75); jury.add(jb);
    const jr = new THREE.Mesh(new THREE.BoxGeometry(3.64, 0.03, 0.1), goldMat); jr.position.set(0, 0.81, 0.75); jury.add(jr);
    const tier = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.3, 0.8), new THREE.MeshPhysicalMaterial({ color: 0x0d0c10, clearcoat: 1, roughness: 0.3 })); tier.position.set(0, 0.15, -0.55); jury.add(tier);
    this.jurors = [];
    for (let i = 0; i < 12; i++) {
      const row = i < 6 ? 0 : 1, col = i % 6;
      const f = figure({ accent: 0x8a90a6, scale: 0.78 });
      f.group.position.set(-1.45 + col * 0.58, row ? 0.3 : 0, row ? -0.55 : 0.15);
      jury.add(f.group);
      const seat = new THREE.PointLight(0xffffff, 0, 1.1, 2); seat.position.set(0, 1.2, 0.3); f.group.add(seat);
      this.jurors.push({ ...f, seat, vote: null, hand: 0, phase: Math.random() * 6 });
    }
    this.jury = jury;
  }

  buildPeople() {
    // Judge Colin at the bench.
    this.judge = figure({ robe: true, accent: GOLD_HI, scale: 1.08 });
    this.judge.group.position.set(0, 0.92, -4.45);
    this.scene.add(this.judge.group);
    const gavelMat = new THREE.MeshPhysicalMaterial({ color: 0x3b1d0e, roughness: 0.3, clearcoat: 1 });
    const gavel = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.34, 10), gavelMat); handle.rotation.x = Math.PI / 2; handle.position.z = 0.12; gavel.add(handle);
    const head = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.17, 18), gavelMat); head.position.z = 0.3; gavel.add(head);
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.025, 18), new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1, roughness: 0.2 })); band.position.z = 0.3; gavel.add(band);
    gavel.position.set(0, -0.36, 0); gavel.rotation.x = -0.3;
    this.judge.right.elbow.add(gavel);
    this.judge.right.shoulder.rotation.set(-0.6, 0, -0.25);
    this.judge.right.elbow.rotation.x = -1.1;
    this.judge.left.shoulder.rotation.set(-0.5, 0, 0.2);
    this.judge.left.elbow.rotation.x = -1.2;
    this.judge.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    this.judgeHalo = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.215, 64), new THREE.MeshBasicMaterial({ color: GOLD_HI, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    this.judgeHalo.position.set(0, 0.28, 0); this.judge.chest.add(this.judgeHalo);

    // Counsel.
    this.counsel = {};
    for (const side of ['a', 'b']) {
      const f = figure({ accent: SIDE_COLOR[side] });
      const t = this.tables[side].group;
      f.group.position.set(0, 0, 0.75); f.group.rotation.y = Math.PI;
      t.add(f.group);
      f.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      this.counsel[side] = f;
    }
    // Bailiff by the stand, for scale.
    const bailiff = figure({ accent: 0x9aa3b8 });
    bailiff.group.position.set(3.7, 0, -1.6); bailiff.group.rotation.y = -1.9; this.scene.add(bailiff.group);
    this.bailiff = bailiff;
  }

  buildLights() {
    const s = this.scene;
    s.add(new THREE.HemisphereLight(0x8a84a8, 0x140e08, 1.1));
    const fill = new THREE.DirectionalLight(0xffe6c4, 1.8); fill.position.set(2.5, 5, 8); s.add(fill);
    const rim = new THREE.DirectionalLight(0x8fb8ff, 1.2); rim.position.set(-3, 4, -6); s.add(rim);
    const key = this.key = new THREE.SpotLight(0xffe2b0, 60, 18, 0.42, 0.55, 1.6);
    key.position.set(0, 7.5, -1.2); key.target.position.set(0, 1.5, -4.2); key.castShadow = true; key.shadow.mapSize.set(1024, 1024);
    s.add(key, key.target);
    this.spots = {};
    for (const side of ['a', 'b']) {
      const sp = new THREE.SpotLight(SIDE_COLOR[side], 25, 14, 0.34, 0.6, 1.5);
      const x = side === 'a' ? -1.75 : 1.75;
      sp.position.set(x * 1.4, 6.5, 2.5); sp.target.position.set(x, 0.8, 0.8); sp.castShadow = true;
      s.add(sp, sp.target); this.spots[side] = sp;
    }
    const warm = new THREE.PointLight(0xffc27a, 6, 14, 2); warm.position.set(0, 5.5, 0); s.add(warm);
    this.verdictSpot = new THREE.SpotLight(0xfff1d0, 0, 16, 0.22, 0.4, 1.2);
    this.verdictSpot.position.set(0, 8, 3); this.verdictSpot.castShadow = true; s.add(this.verdictSpot, this.verdictSpot.target);
    // Chandeliers: gold rings with glowing bulbs.
    const goldMat = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1, roughness: 0.25, emissive: GOLD, emissiveIntensity: 0.4 });
    const bulb = new THREE.MeshBasicMaterial({ color: 0xfff0c8 });
    this.chandeliers = [];
    for (const [x, z] of [[-2.6, -1], [2.6, -1], [0, 1.6]]) {
      const c = new THREE.Group(); c.position.set(x, 5.4, z); s.add(c);
      c.add(new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.025, 8, 48), goldMat));
      c.children[0].rotation.x = Math.PI / 2;
      for (let i = 0; i < 10; i++) { const a = (i / 10) * Math.PI * 2; const b = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), bulb); b.position.set(Math.cos(a) * 0.55, 0.05, Math.sin(a) * 0.55); c.add(b); }
      const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 2, 6), goldMat); chain.position.y = 1; c.add(chain);
      this.chandeliers.push(c);
    }
    // Light shafts: soft cones from the high windows.
    const beamMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uColor: { value: new THREE.Color(0xffd9a0) }, uAlpha: { value: 0.12 } },
      vertexShader: 'varying float vY; varying vec3 vN; varying vec3 vV; void main(){ vY = uv.y; vec4 mv = modelViewMatrix*vec4(position,1.); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 uColor; uniform float uAlpha; varying float vY; varying vec3 vN; varying vec3 vV; void main(){ float rim = pow(abs(dot(vN,vV)),1.5); gl_FragColor = vec4(uColor, uAlpha*vY*rim); }',
    });
    this.beamMat = beamMat;
    for (const [x, z, r] of [[-3, -2.5, 0.3], [3, -2.5, -0.3], [0, -3.8, 0]]) {
      const cone = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 1.4, 7, 32, 1, true), beamMat);
      cone.position.set(x, 3.5, z); cone.rotation.z = r; s.add(cone);
    }
  }

  buildDust() {
    const n = 500, pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 10; pos[i * 3 + 1] = Math.random() * 6; pos[i * 3 + 2] = (Math.random() - 0.5) * 9 - 1; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffe2b0, size: 0.025, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.scene.add(this.dust);
  }

  /* ---------------------------------------------------------- effects */

  /** A billboard of text that rises and fades. */
  banner(text, { color = '#ffd998', sub = '', at = new THREE.Vector3(0, 3.2, -3.6), life = 2.6, size = 2.4, rise = 0.25 } = {}) {
    if (!this.ready) return;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: label(text, { color, sub }), transparent: true, depthWrite: false, depthTest: false }));
    sprite.scale.set(size * 1.35, size * 1.35 / 4, 1); sprite.position.copy(at); sprite.renderOrder = 10;
    this.scene.add(sprite);
    this.fx.push({ obj: sprite, born: this.t, life, rise, from: at.y, size });
  }

  confetti(color = GOLD_HI) {
    const n = 260, pos = new Float32Array(n * 3), vel = [];
    for (let i = 0; i < n; i++) { pos.set([(Math.random() - 0.5) * 4, 5.5 + Math.random(), (Math.random() - 0.5) * 3], i * 3); vel.push([(Math.random() - 0.5) * 0.6, -0.6 - Math.random() * 0.8, (Math.random() - 0.5) * 0.6]); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.06, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.scene.add(pts);
    this.fx.push({ obj: pts, born: this.t, life: 6, vel, confetti: true });
  }

  cut(shot, hold = 3) { this.shot = shot; this.shotUntil = this.t + hold; }

  /**
   * Something happened in court.
   *
   * @param {'open'|'argue'|'objection'|'witness'|'vote'|'verdict'|'order'} type
   * @param {object} [data]
   */
  event(type, data = {}) {
    if (!this.ready) return;
    const t = this.t;
    if (type === 'open') {
      this.verdict = null;
      for (const j of this.jurors) j.vote = null;
      this.cut('bench', 3.5);
      this.banner('COURT IS IN SESSION', { sub: data.number ? `CASE No. ${data.number}` : '', life: 3.4, size: 2.8 });
    } else if (type === 'argue') {
      this.argue[data.side] = t;
      this.cut(data.side, 3.2);
      const at = this.tables[data.side].group.position.clone().add(new THREE.Vector3(0, 2.3, 0.6));
      this.banner(`${data.points >= 0 ? '+' : ''}${data.points} PTS`, { color: data.side === 'a' ? '#7ff6ee' : '#ff9cb8', sub: SIDE_NAME[data.side], at, size: 1.5, life: 2.4, rise: 0.5 });
    } else if (type === 'objection') {
      this.objectAt[data.side] = t;
      this.cut(data.side, 1.4);
      const at = this.tables[data.side].group.position.clone().add(new THREE.Vector3(0, 2.4, 0.6));
      this.banner('OBJECTION!', { color: '#ffffff', glow: '#ff3060', at, size: 1.9, life: 1.6 });
      setTimeout(() => {
        this.cut('bench', 2.4);
        this.banner(data.sustained ? 'SUSTAINED' : 'OVERRULED', { color: data.sustained ? '#8dffb0' : '#ff7a7a', sub: data.label ? data.label.toUpperCase() : '', life: 2.4 });
      }, 1100);
    } else if (type === 'witness') {
      this.exhibitAt = t;
      this.exhibit.material.map = label(`EXHIBIT ${data.letter}`, { color: '#9be8ff', glow: '#5fd6ff', sub: (data.tier || '').toUpperCase(), w: 1024, h: 640 });
      this.exhibit.material.needsUpdate = true;
      this.cut('witness', 4.5);
    } else if (type === 'vote') {
      this.voted = t;
      this.cut('jury', 1.8);
    } else if (type === 'verdict') {
      this.verdict = { side: data.winner, at: t };
      this.cut('bench', 2.2);
      setTimeout(() => {
        if (!this.verdict) return;
        if (data.winner) {
          this.cut(data.winner, 4);
          this.banner(`VERDICT · ${SIDE_NAME[data.winner]}`, { sub: data.jury ? `JURY ${data.jury.a}–${data.jury.b}` : '', life: 5, size: 3, at: new THREE.Vector3(0, 3.4, -2.8) });
          this.confetti(SIDE_COLOR[data.winner]);
          this.confetti(GOLD_HI);
        } else {
          this.cut('wide', 4);
          this.banner('NO MAJORITY · A DRAW', { life: 4.5, size: 3 });
        }
      }, 2200);
    }
  }

  /** The gavel lands at `at` (seconds on the page clock). */
  strike(at) { this.strikeAt = at; }

  /* -------------------------------------------------------------- frame */

  setActive(on) {
    this.active = on;
    if (on && !this.ready && this.wrap) this.build();
  }

  update(dt, t, state) {
    if (!this.ready || !this.active || document.hidden || !this.wrap.isConnected) return;
    this.t = t;
    const court = state.court;
    const speak = state.speak || 0;

    // The gavel, on the same clock as the knock.
    if (court && court.gavelAt != null && court.gavelAt !== this.gavelSeen) { this.gavelSeen = court.gavelAt; this.strike(court.gavelAt); }
    this.animateJudge(t, speak);
    this.animateCounsel(t, court);
    this.animateJury(t, court);
    this.animateFx(dt, t);

    // The wall monitor shows the judge's live clip when it has a frame.
    const f = judge.frame();
    if (f && f.to) { if (this.monitorMat.map !== f.to) { this.monitorMat.map = f.to; this.monitorMat.needsUpdate = true; this.monitorLive = true; } }
    else if (this.monitorLive && this.posterTex) { this.monitorMat.map = this.posterTex; this.monitorMat.needsUpdate = true; this.monitorLive = false; }

    // Who has the floor.
    for (const side of ['a', 'b']) {
      const floor = court && !court.done && !court.closed && court.turn === side;
      const ring = this.tables[side].ring.material;
      ring.opacity += ((floor ? 0.55 + Math.sin(t * 3) * 0.2 : 0) - ring.opacity) * Math.min(1, dt * 4);
      const sp = this.spots[side];
      const winner = this.verdict && this.verdict.side === side && t - this.verdict.at > 2.2;
      const target = winner ? 70 : floor ? 38 : 16;
      sp.intensity += (target - sp.intensity) * Math.min(1, dt * 3);
    }
    // Verdict: house lights down, spot on the winner.
    const v = this.verdict && t - this.verdict.at > 2.2 ? Math.min(1, (t - this.verdict.at - 2.2) / 0.8) : 0;
    this.key.intensity = 60 * (1 - v * 0.6);
    this.verdictSpot.intensity = v * 140;
    if (this.verdict && this.verdict.side) this.verdictSpot.target.position.copy(this.tables[this.verdict.side].group.position).add(new THREE.Vector3(0, 1, 0.7));
    this.beamMat.uniforms.uAlpha.value = 0.1 + speak * 0.06 - v * 0.05;
    this.dust.rotation.y = t * 0.01;
    this.dust.position.y = Math.sin(t * 0.2) * 0.05;

    this.directCamera(dt, t);
    this.composer.render(dt);
    this.status.textContent = this.verdict ? 'VERDICT' : t - this.strikeAt < 1 && t >= this.strikeAt ? 'ORDER!' : speak > 0.25 ? 'THE BENCH SPEAKS' : court && !court.done ? `ROUND ${court.round} · ${SIDE_NAME[court.turn] || ''}` : 'IN SESSION';
  }

  animateJudge(t, speak) {
    const j = this.judge;
    j.chest.position.y = 1.12 + Math.sin(t * 1.4) * 0.008;
    j.head.rotation.x = -0.05 + Math.sin(t * 9) * speak * 0.06;
    j.head.rotation.y = Math.sin(t * 0.5) * 0.18;
    j.visor.opacity = 0.7 + speak * 0.3;
    this.judgeHalo.material.opacity = speak * 0.8;
    this.judgeHalo.scale.setScalar(1 + speak * 0.4 + Math.sin(t * 6) * 0.05);
    // Left hand gestures while he speaks.
    j.left.shoulder.rotation.x = -0.5 - speak * (0.35 + Math.sin(t * 3.1) * 0.25);
    // Gavel: wind-up 0.32 s before the strike, slam, recoil.
    const d = t - this.strikeAt;
    let raise = 0;
    if (d > -0.32 && d < 0) raise = Math.sin(((d + 0.32) / 0.32) * Math.PI * 0.5) * 1.3;
    else if (d >= 0 && d < 0.06) raise = 1.3 * (1 - d / 0.06) - 0.15;
    else if (d >= 0.06 && d < 0.5) raise = -0.15 * (1 - (d - 0.06) / 0.44);
    j.right.shoulder.rotation.x = -0.6 - raise * 0.9;
    j.right.elbow.rotation.x = -1.1 - raise * 0.5;
    // Impact: shockwave on the block, flash, camera shake.
    const ring = this.ring.material;
    if (d >= 0 && d < 0.7) {
      const k = d / 0.7;
      ring.opacity = 1 - k; this.ring.scale.setScalar(1 + k * 6);
      this.shake = this.reduced ? 0 : (1 - k) * 0.05;
      this.key.color.setRGB(1, 0.89 + (1 - k) * 0.1, 0.69 + (1 - k) * 0.3);
    } else { ring.opacity = 0; this.shake = 0; }
  }

  animateCounsel(t, court) {
    for (const side of ['a', 'b']) {
      const c = this.counsel[side];
      const sinceArgue = t - this.argue[side];
      const sinceObject = t - this.objectAt[side];
      const arguing = sinceArgue < 3.2;
      const objecting = sinceObject < 1.6;
      const stand = arguing || objecting ? 1 : 0;
      c.group.position.y += ((stand ? 0.05 : 0) - c.group.position.y) * 0.15;
      c.chest.rotation.x = stand ? -0.05 : 0.18;
      c.head.rotation.y = Math.sin(t * 0.7 + (side === 'a' ? 0 : 2)) * 0.25;
      c.visor.opacity = 0.6 + (arguing ? 0.4 * (0.5 + 0.5 * Math.sin(t * 10)) : 0);
      // Arms: idle on the table; arguing → open-hand gestures; objecting → arm thrust up.
      if (objecting) {
        c.right.shoulder.rotation.x += (-2.6 - c.right.shoulder.rotation.x) * 0.3;
        c.right.elbow.rotation.x += (-0.1 - c.right.elbow.rotation.x) * 0.3;
      } else if (arguing) {
        c.right.shoulder.rotation.x = -0.9 - Math.sin(t * 4.2) * 0.4;
        c.right.elbow.rotation.x = -0.7 - Math.sin(t * 4.2 + 1) * 0.3;
        c.left.shoulder.rotation.x = -0.6 - Math.sin(t * 3.3 + 2) * 0.3;
      } else {
        c.right.shoulder.rotation.x += (-0.55 - c.right.shoulder.rotation.x) * 0.1;
        c.right.elbow.rotation.x += (-1.0 - c.right.elbow.rotation.x) * 0.1;
        c.left.shoulder.rotation.x += (-0.55 - c.left.shoulder.rotation.x) * 0.1;
      }
      const winner = this.verdict && this.verdict.side === side && t - this.verdict.at > 2.2;
      if (winner) { c.right.shoulder.rotation.x = -2.8 + Math.sin(t * 5) * 0.15; c.left.shoulder.rotation.x = -2.8 + Math.cos(t * 5) * 0.15; }
    }
  }

  animateJury(t, court) {
    const votes = court ? court.jury : [];
    this.jurors.forEach((j, i) => {
      const v = votes[i] || null;
      if (v !== j.vote) { j.vote = v; j.hand = t; }
      const col = v ? SIDE_COLOR[v] : 0x8a90a6;
      j.visor.color.setHex(col);
      j.seat.color.setHex(col);
      j.seat.intensity += ((v ? 1.4 : 0) - j.seat.intensity) * 0.1;
      const since = t - j.hand;
      const up = v && since < 1.8 ? Math.sin(Math.min(1, since / 0.3) * Math.PI / 2) * (since > 1.3 ? (1.8 - since) / 0.5 : 1) : 0;
      j.right.shoulder.rotation.x = -0.4 - up * 2.4;
      j.head.rotation.y = Math.sin(t * 0.6 + j.phase) * 0.3;
      j.head.rotation.x = Math.sin(t * 0.9 + j.phase) * 0.05;
    });
  }

  animateFx(dt, t) {
    this.fx = this.fx.filter((f) => {
      const age = t - f.born, k = age / f.life;
      if (k >= 1) { this.scene.remove(f.obj); f.obj.material.map?.dispose?.(); f.obj.material.dispose(); f.obj.geometry?.dispose?.(); return false; }
      if (f.confetti) {
        const p = f.obj.geometry.attributes.position;
        for (let i = 0; i < f.vel.length; i++) { p.array[i * 3] += f.vel[i][0] * dt + Math.sin(t * 3 + i) * 0.003; p.array[i * 3 + 1] += f.vel[i][1] * dt; p.array[i * 3 + 2] += f.vel[i][2] * dt; }
        p.needsUpdate = true; f.obj.material.opacity = 1 - Math.max(0, k - 0.7) / 0.3;
      } else {
        const pop = Math.min(1, age / 0.18);
        const s = 1.35 * f.size * (0.6 + 0.4 * (1 - Math.pow(1 - pop, 3)) + (pop < 1 ? 0.15 * Math.sin(pop * Math.PI) : 0));
        f.obj.scale.set(s, s / 4, 1);
        f.obj.position.y = f.from + f.rise * k;
        f.obj.material.opacity = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
      }
      return true;
    });
    // Exhibit hologram.
    const ea = this.exhibitAt != null ? t - this.exhibitAt : 99;
    const on = ea < 6 ? Math.min(1, ea / 0.4) * (ea > 5.4 ? (6 - ea) / 0.6 : 1) : 0;
    this.exhibit.material.opacity = on * (0.85 + Math.sin(t * 14) * 0.08);
    this.exhibit.position.y = 1.5 + on * 0.35 + Math.sin(t * 1.6) * 0.03;
    this.exhibit.rotation.y = Math.sin(t * 0.8) * 0.25;
    this.exhibitBeam.material.opacity = on * 0.22;
  }

  directCamera(dt, t) {
    if (t > this.shotUntil) this.shot = 'wide';
    const wide = this.reduced ? 0 : Math.sin(t * 0.12) * 1.4;
    const tbl = (side) => this.tables[side].group.position;
    const shots = {
      wide: [[wide, 2.35, 6.0], [wide * 0.3, 1.55, -2.6]],
      bench: [[0.3, 2.5, 0.4], [0, 2.3, -4.4]],
      a: [[tbl('a').x + 1.6, 1.75, 3.0], [tbl('a').x, 1.35, 0.9]],
      b: [[tbl('b').x - 1.6, 1.75, 3.0], [tbl('b').x, 1.35, 0.9]],
      jury: [[-0.6, 2.0, 1.2], [-3.9, 1.0, -1.7]],
      witness: [[0.8, 2.1, 0.5], [2.9, 1.8, -3.0]],
    };
    const [p, l] = shots[this.shot] || shots.wide;
    const ease = 1 - Math.exp(-dt * (this.shot === 'wide' ? 1.2 : 2.6));
    this.camPos.lerp(new THREE.Vector3(...p), ease);
    this.camLook.lerp(new THREE.Vector3(...l), ease);
    this.camera.position.copy(this.camPos);
    if (this.shake) this.camera.position.add(new THREE.Vector3((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake, 0));
    this.camera.lookAt(this.camLook);
  }
}

export const courtroom = new Courtroom();
