import * as THREE from 'three';
import { FIELD } from './config.js';

// World frame: x = -sx (so screen-right from behind the QB is -x),
// y up, z downfield. The line of scrimmage is z = 0.
export const W = (sx, z, y = 0) => new THREE.Vector3(-sx, y, z);

function textTexture(text, { size = 128, color = '#e8fbff', font = '700 96px "Space Grotesk", system-ui, sans-serif', w = 256, h = 128 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.clearRect(0, 0, w, h);
  g.font = font; g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = 16;
  g.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// A night stadium: dark turf with mowing stripes, glowing holographic yard lines
// and numbers, light banks along both sides, and a haze of crowd lights.
export function buildStadium(scene) {
  const root = new THREE.Group();
  scene.add(root);
  scene.background = new THREE.Color('#03050a');
  scene.fog = new THREE.Fog('#03050a', 70, 150);

  // Turf with 5-yard mowing stripes.
  const c = document.createElement('canvas'); c.width = 64; c.height = 1024;
  const g = c.getContext('2d');
  for (let i = 0; i < 24; i++) { g.fillStyle = i % 2 ? '#0d2a1d' : '#0b2419'; g.fillRect(0, i * (1024 / 24), 64, 1024 / 24); }
  const turfTex = new THREE.CanvasTexture(c); turfTex.colorSpace = THREE.SRGBColorSpace;
  const turf = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.width + 12, 120), new THREE.MeshStandardMaterial({ map: turfTex, roughness: 0.95 }));
  turf.rotation.x = -Math.PI / 2;
  const endLine = -FIELD.losYardLine - 10;   // own end line
  turf.position.set(0, 0, endLine + 60);
  root.add(turf);

  // Yard lines every 5 yards, holographic cyan; the goal lines in magenta.
  const lineMat = new THREE.MeshBasicMaterial({ color: '#4ff0ff', transparent: true, opacity: 0.55 });
  const goalMat = new THREE.MeshBasicMaterial({ color: '#ff4fd8', transparent: true, opacity: 0.8 });
  const half = FIELD.width / 2;
  for (let yard = 0; yard <= 100; yard += 5) {
    const z = yard - FIELD.losYardLine;
    const isGoal = yard === 0 || yard === 100;
    const line = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.width, isGoal ? 0.35 : 0.12), isGoal ? goalMat : lineMat);
    line.rotation.x = -Math.PI / 2; line.position.set(0, 0.01, z);
    root.add(line);
    if (yard % 10 === 0 && yard > 0 && yard < 100) {
      const n = Math.min(yard, 100 - yard);
      for (const side of [-1, 1]) {
        const num = new THREE.Mesh(new THREE.PlaneGeometry(4, 2), new THREE.MeshBasicMaterial({ map: textTexture(String(n)), transparent: true, opacity: 0.8, depthWrite: false }));
        num.rotation.x = -Math.PI / 2;
        num.rotation.z = side > 0 ? Math.PI / 2 : -Math.PI / 2;
        num.position.set(side * (half - 7), 0.02, z);
        root.add(num);
      }
    }
    // Hash marks.
    for (let k = 1; k < 5; k++) {
      for (const hx of [-FIELD.hashX * 3, FIELD.hashX * 3]) {
        const h = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.08), lineMat);
        h.rotation.x = -Math.PI / 2; h.position.set(hx, 0.01, z + k);
        root.add(h);
      }
    }
  }
  // Sidelines.
  for (const side of [-1, 1]) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 120), lineMat);
    s.rotation.x = -Math.PI / 2; s.position.set(side * half, 0.012, endLine + 60);
    root.add(s);
  }
  // End zones tinted.
  for (const [z0, label] of [[endLine, 'COACH COLIN'], [100 - FIELD.losYardLine, 'GRIDIRON IQ']]) {
    const ez = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.width, 10), new THREE.MeshBasicMaterial({ color: '#2a0f4a', transparent: true, opacity: 0.55 }));
    ez.rotation.x = -Math.PI / 2; ez.position.set(0, 0.005, z0 + 5);
    root.add(ez);
    const t = new THREE.Mesh(new THREE.PlaneGeometry(26, 4.5), new THREE.MeshBasicMaterial({ map: textTexture(label, { w: 1024, h: 160, font: '700 110px "Space Grotesk", system-ui, sans-serif', color: '#ff9cf0' }), transparent: true, opacity: 0.85, depthWrite: false }));
    t.rotation.x = -Math.PI / 2; t.rotation.z = z0 < 0 ? 0 : Math.PI;
    t.position.set(0, 0.02, z0 + 5);
    root.add(t);
  }

  // Line of scrimmage (cyan) and first-down line (amber), moved each play.
  const los = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.width, 0.3), new THREE.MeshBasicMaterial({ color: '#3ff3ff', transparent: true, opacity: 0.9 }));
  los.rotation.x = -Math.PI / 2; los.position.y = 0.03;
  const first = new THREE.Mesh(new THREE.PlaneGeometry(FIELD.width, 0.3), new THREE.MeshBasicMaterial({ color: '#ffc14d', transparent: true, opacity: 0.9 }));
  first.rotation.x = -Math.PI / 2; first.position.y = 0.03;
  root.add(los, first);

  // Light banks and crowd.
  const bankMat = new THREE.MeshBasicMaterial({ color: '#fff6e0' });
  for (const side of [-1, 1]) for (let i = 0; i < 4; i++) {
    const bank = new THREE.Mesh(new THREE.BoxGeometry(0.6, 3, 9), bankMat);
    bank.position.set(side * (half + 22), 28, endLine + 15 + i * 28);
    root.add(bank);
  }
  const crowdGeo = new THREE.BufferGeometry();
  const pts = [], cols = [];
  const palette = [new THREE.Color('#3ff3ff'), new THREE.Color('#ff4fd8'), new THREE.Color('#8b5cff'), new THREE.Color('#ffb86b'), new THREE.Color('#ffffff')];
  for (let i = 0; i < 3500; i++) {
    const side = Math.random() < 0.5 ? -1 : 1;
    const tier = Math.random();
    pts.push(side * (half + 8 + tier * 16), 1 + tier * 16, endLine + Math.random() * 120);
    const col = palette[Math.floor(Math.random() * palette.length)].clone().multiplyScalar(0.25 + Math.random() * 0.5);
    cols.push(col.r, col.g, col.b);
  }
  crowdGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  crowdGeo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  root.add(new THREE.Points(crowdGeo, new THREE.PointsMaterial({ size: 0.35, vertexColors: true, transparent: true, opacity: 0.8, depthWrite: false })));

  scene.add(new THREE.HemisphereLight('#6fdcff', '#1a0822', 0.9));
  const key = new THREE.DirectionalLight('#fff1dc', 1.6); key.position.set(-30, 50, -10); scene.add(key);
  const rim = new THREE.DirectionalLight('#c07bff', 0.8); rim.position.set(30, 20, 60); scene.add(rim);

  return {
    root,
    setLines(losZ, firstZ) { los.position.z = losZ; first.position.z = firstZ; first.visible = firstZ < 100 - FIELD.losYardLine; },
  };
}

const TEAM = {
  off: { body: '#0e5a78', glow: '#3ff3ff' },
  def: { body: '#5a0f4d', glow: '#ff4fd8' },
};

// A player: a capsule body and a helmet, glowing in team colour, with a
// floating label. Receivers also get an "openness" ring on the turf.
export function makePlayer(id, team, labelText, isReceiver = false) {
  const g = new THREE.Group();
  const col = TEAM[team];
  const bodyMat = new THREE.MeshStandardMaterial({ color: col.body, emissive: col.glow, emissiveIntensity: 0.35, roughness: 0.4, metalness: 0.2 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.95, 6, 12), bodyMat);
  body.position.y = 0.95;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), new THREE.MeshStandardMaterial({ color: '#dfe8f5', emissive: col.glow, emissiveIntensity: 0.25, metalness: 0.6, roughness: 0.25 }));
  helmet.position.y = 2.05;
  g.add(body, helmet);
  const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: textTexture(labelText, { color: col.glow }), transparent: true, depthWrite: false, depthTest: false }));
  label.scale.set(1.6, 0.8, 1);
  label.position.y = 2.9;
  label.renderOrder = 10;
  g.add(label);
  let ring = null;
  if (isReceiver) {
    ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 40), new THREE.MeshBasicMaterial({ color: '#5dffa8', transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04;
    g.add(ring);
  }
  g.userData = { id, team, body, bodyMat, ring, label };
  body.userData.playerId = id; helmet.userData.playerId = id;
  return g;
}

export function makeBall() {
  const ball = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 10), new THREE.MeshStandardMaterial({ color: '#8a4a22', emissive: '#ffb86b', emissiveIntensity: 0.6, roughness: 0.5 }));
  ball.scale.set(1, 1, 1.7);
  const trailGeo = new THREE.BufferGeometry();
  trailGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(60 * 3), 3));
  const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: '#ffb86b', transparent: true, opacity: 0.8 }));
  trail.frustumCulled = false;
  return { ball, trail };
}
