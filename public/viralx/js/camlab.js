/**
 * ViralX Camera Lab: a 3D previs set that performs each technique.
 *
 * The big view is the lens: what the audience sees through that focal length, roll and
 * height. The inset is the set from above, with the camera rig, its frustum and the 180° line,
 * so you can see where the camera is while watching what it shoots.
 *
 * @module viralx/camlab
 */
import * as THREE from 'three';
import { TECHNIQUES, fov, A, B } from './techniques.js';

const PINK = '#ff4fd8', LILAC = '#c9a7ff';

function mannequin(color, facing) {
  const g = new THREE.Group();
  const skin = new THREE.MeshStandardMaterial({ color, metalness: 0.75, roughness: 0.22, emissive: color, emissiveIntensity: 0.06 });
  const dark = new THREE.MeshStandardMaterial({ color: '#141018', metalness: 0.4, roughness: 0.5 });
  const cap = (r, l, y, x = 0, rz = 0) => { const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, l, 6, 16), skin); m.position.set(x, y, 0); m.rotation.z = rz; g.add(m); return m; };
  cap(0.19, 0.42, 1.18); // torso
  cap(0.075, 0.7, 0.45, -0.1); cap(0.075, 0.7, 0.45, 0.1); // legs
  cap(0.055, 0.5, 1.12, -0.27, 0.12); cap(0.055, 0.5, 1.12, 0.27, -0.12); // arms
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.12, 12), skin); neck.position.y = 1.5; g.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.115, 32, 24), skin); head.scale.set(1, 1.22, 1.05); head.position.y = 1.64; g.add(head);
  for (const x of [-0.042, 0.042]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.019, 16, 12), dark); eye.position.set(x, 1.655, 0.1); g.add(eye);
    const iris = new THREE.Mesh(new THREE.TorusGeometry(0.011, 0.0035, 8, 24), new THREE.MeshBasicMaterial({ color: PINK })); iris.position.set(x, 1.655, 0.118); g.add(iris);
  }
  g.rotation.y = facing; // local +z is the face
  return g;
}

export function mountLab(canvas, hudEl, onTick = () => {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setScissorTest(true);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#07040a');
  scene.fog = new THREE.Fog('#07040a', 8, 22);

  // Floor.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), new THREE.MeshStandardMaterial({ color: '#0d0912', metalness: 0.7, roughness: 0.35 }));
  floor.rotation.x = -Math.PI / 2; scene.add(floor);
  const grid = new THREE.GridHelper(40, 80, PINK, '#3a1f3a'); grid.material.transparent = true; grid.material.opacity = 0.18; grid.position.y = 0.002; scene.add(grid);

  // Pillars with neon edges, for depth and parallax.
  const pillarMat = new THREE.MeshStandardMaterial({ color: '#16101c', metalness: 0.5, roughness: 0.4 });
  const neon = new THREE.MeshBasicMaterial({ color: PINK });
  const neon2 = new THREE.MeshBasicMaterial({ color: LILAC });
  const pillar = (x, z, h = 4.2, m = neon) => {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.5, h, 0.5), pillarMat); p.position.set(x, h / 2, z); scene.add(p);
    for (const dx of [-0.26, 0.26]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.02, h, 0.02), m); s.position.set(x + dx, h / 2, z + 0.26); scene.add(s); }
  };
  for (let x = -8; x <= 8; x += 2) { pillar(x, -3.5, 4.2, neon); pillar(x + 1, -6.5, 5.5, neon2); }
  for (let x = -9; x <= 9; x += 3) pillar(x, 8, 5, neon2);
  // Corridor for the symmetry shot.
  for (let z = -2; z >= -12; z -= 2.5) { pillar(-2.2, z, 4.5, neon); pillar(2.2, z, 4.5, neon); }

  // Actors and the 180° line.
  const actorA = mannequin('#f2b8de', Math.PI / 2); actorA.position.set(...A); scene.add(actorA);
  const actorB = mannequin('#cdb8f2', -Math.PI / 2); actorB.position.set(...B); scene.add(actorB);
  const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-6, 0.01, 0), new THREE.Vector3(6, 0.01, 0)]);
  const line = new THREE.Line(lineGeo, new THREE.LineDashedMaterial({ color: PINK, dashSize: 0.18, gapSize: 0.12 }));
  line.computeLineDistances(); line.layers.set(1); scene.add(line);

  scene.add(new THREE.HemisphereLight('#ffd6f4', '#120814', 0.6));
  const key = new THREE.SpotLight('#ffffff', 40, 20, Math.PI / 5, 0.6); key.position.set(-1, 5, 4); key.target.position.set(0, 1.4, 0); scene.add(key, key.target);
  const rimA = new THREE.PointLight(PINK, 12, 8); rimA.position.set(-2, 2.2, -1.5); scene.add(rimA);
  const rimB = new THREE.PointLight(LILAC, 12, 8); rimB.position.set(2, 2.2, -1.5); scene.add(rimB);

  // Cameras.
  const lens = new THREE.PerspectiveCamera(30, 16 / 9, 0.02, 60);
  lens.layers.set(0);
  const over = new THREE.PerspectiveCamera(40, 4 / 3, 0.1, 80);
  over.layers.enable(0); over.layers.enable(1);
  const rig = new THREE.Group(); rig.layers.set(1);
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.14, 0.26), new THREE.MeshStandardMaterial({ color: '#2a2230', metalness: 0.8, roughness: 0.3 }));
  const glassL = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.16, 20), new THREE.MeshStandardMaterial({ color: PINK, emissive: PINK, emissiveIntensity: 0.6 }));
  glassL.rotation.x = Math.PI / 2; glassL.position.z = -0.2;
  body.layers.set(1); glassL.layers.set(1); rig.add(body, glassL); scene.add(rig);
  const frust = new THREE.PerspectiveCamera(30, 16 / 9, 0.05, 1.6);
  const helper = new THREE.CameraHelper(frust); helper.layers.set(1);
  helper.setColors(new THREE.Color(PINK), new THREE.Color(PINK), new THREE.Color(LILAC), new THREE.Color(PINK), new THREE.Color(LILAC));
  scene.add(helper);

  let tech = TECHNIQUES[0], t = 0, playing = true, speed = 1, lastFocal = null, swapFlash = 0;
  const DUR = 7; // seconds per pass

  const size = () => { const w = canvas.clientWidth, h = canvas.clientHeight; renderer.setSize(w, h, false); };
  addEventListener('resize', size); size();

  const apply = () => {
    const s = tech.shot(t);
    lens.position.set(...s.pos);
    lens.up.set(0, 1, 0);
    lens.lookAt(...s.look);
    lens.rotateZ((-s.roll * Math.PI) / 180);
    lens.fov = fov(s.focal); lens.updateProjectionMatrix();
    rig.position.copy(lens.position); rig.quaternion.copy(lens.quaternion);
    frust.position.copy(lens.position); frust.quaternion.copy(lens.quaternion); frust.fov = lens.fov; frust.updateProjectionMatrix(); frust.updateMatrixWorld(); helper.update();
    if (lastFocal != null && Math.abs(lastFocal - s.focal) > 8 && t > 0.02) swapFlash = 1; // a real swap, not a zoom
    lastFocal = s.focal;
    const dir = new THREE.Vector3(...s.look).sub(lens.position);
    const pitch = (Math.atan2(dir.y, Math.hypot(dir.x, dir.z)) * 180) / Math.PI;
    hudEl.innerHTML = `<b>${tech.name}</b><span>${tech.feeling}</span>`
      + `<i>LENS ${Math.round(s.focal)}mm</i><i>FOV ${lens.fov.toFixed(1)}°</i><i>HEIGHT ${s.pos[1].toFixed(2)} m</i>`
      + `<i>TILT ${pitch >= 0 ? '+' : ''}${pitch.toFixed(0)}°</i><i>ROLL ${s.roll.toFixed(0)}°</i><i>180° ${s.pos[2] >= -0.001 ? 'KEPT' : 'CROSSED'}</i>`
      + `<i class="tc">${(t * DUR).toFixed(2)}s</i>${swapFlash > 0.05 ? `<em style="opacity:${swapFlash}">LENS SWAP · ${Math.round(s.focal)}mm</em>` : ''}`;
    return s;
  };

  let visible = true, raf = 0, prev = performance.now();
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; if (visible && !raf) { prev = performance.now(); loop(); } }).observe(canvas);
  const render = (now) => {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    // Lens view fills the stage: 16:9 on wide screens, a portrait frame on phones (the
    // vertical lens the shot would be for). The focal length still sets the vertical FOV.
    const lw = w, lh = h, lx = 0, ly = 0;
    lens.aspect = w / h; lens.updateProjectionMatrix();
    frust.aspect = lens.aspect;
    renderer.setViewport(lx, ly, lw, lh); renderer.setScissor(lx, ly, lw, lh); renderer.render(scene, lens);
    // Set view inset (bottom-right).
    const iw = Math.round(Math.min(Math.max(140, lw * 0.3), 360)), ih = Math.round(iw * 0.75);
    const ix = Math.round(lx + lw - iw - 12), iy = Math.round(ly + 64); // above the controls
    const a = now * 0.00012;
    over.position.set(Math.cos(a) * 9, 7.5, Math.sin(a) * 9 + 2); over.lookAt(0, 0.8, 0.5);
    rig.visible = helper.visible = true;
    renderer.setScissor(ix - 1, iy - 1, iw + 2, ih + 2); renderer.setClearColor(PINK); renderer.clear();
    renderer.setViewport(ix, iy, iw, ih); renderer.setScissor(ix, iy, iw, ih); renderer.render(scene, over);
    onTick({ inset: { x: ix, y: h - iy - ih, w: iw, h: ih }, frame: { x: lx, y: ly, w: lw, h: lh } });
  };
  const busy = () => document.body.dataset.busy === '1';
  new MutationObserver(() => { if (!busy() && visible && !raf) { prev = performance.now(); loop(); } }).observe(document.body, { attributes: true, attributeFilter: ['data-busy'] });
  const loop = () => {
    raf = 0; if (!visible || busy()) return;
    const now = performance.now(), dt = Math.min(0.1, (now - prev) / 1000); prev = now;
    if (playing) t = (t + (dt * speed) / DUR) % 1;
    swapFlash *= 0.94;
    apply(); render(now);
    raf = requestAnimationFrame(loop);
  };
  loop();

  return {
    select(id) { tech = TECHNIQUES.find((x) => x.id === id) || TECHNIQUES[0]; t = 0; lastFocal = null; swapFlash = 0; },
    get technique() { return tech; },
    get t() { return t; },
    seek(v) { t = Math.min(0.999, Math.max(0, v)); },
    play(p) { playing = p ?? !playing; return playing; },
    speed(s) { speed = s; },
  };
}
