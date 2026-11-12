/**
 * Colin Cook reveal: a scroll-driven 3D film. The page text is ordinary HTML (for people, search
 * engines and AI answer engines); this script flies a 65 mm-format camera through the set behind it.
 * @module colin-cook/app
 */
import * as THREE from '../../vision-kit/vendor/three.module.min.js';
import { GATE, verticalFov, cameraAt, sceneIndex, timecode, CREDENTIALS } from './film.js';

const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const canvas = document.getElementById('stage');
document.getElementById('yr').textContent = new Date().getFullYear();

let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); } catch { document.body.classList.add('no-gl'); }

if (renderer) {
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x050505);
  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050505, 0.028);
  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 400);
  camera.filmGauge = GATE.width;

  const GOLD = 0xe8b84a;
  scene.add(new THREE.AmbientLight(0x8899aa, 0.5));
  const key = new THREE.PointLight(0xffc878, 260, 60); key.position.set(6, 5, 8); scene.add(key);
  const rim = new THREE.PointLight(0x3fa2ff, 180, 50); rim.position.set(-7, -2, -4); scene.add(rim);

  /* Gyroscope rings: the title object, and again over the beauty scene. */
  const goldMat = new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.85, roughness: 0.28, emissive: 0x2a1c04 });
  function rig(z, scale) {
    const g = new THREE.Group();
    [3.2, 2.5, 1.8].forEach((r, i) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035 + i * 0.012, 16, 160), goldMat);
      m.rotation.set(i * 1.1, i * 0.7, 0); m.userData.spin = [0.11 + i * 0.05, 0.07 + i * 0.09];
      g.add(m);
    });
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 1), new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 1, roughness: 0.15, emissive: GOLD, emissiveIntensity: 0.25, flatShading: true }));
    g.add(core);
    const l = new THREE.PointLight(0xffc878, 120, 30); g.add(l);
    g.position.set(0, 0, z); g.scale.setScalar(scale); scene.add(g);
    return g;
  }
  const rigs = [rig(0, 1), rig(-97, 1.25)];

  /* Framed pictures. */
  const loader = new THREE.TextureLoader();
  function picture(src, w, h, pos, rotY) {
    const g = new THREE.Group();
    const tex = loader.load(src); tex.colorSpace = THREE.SRGBColorSpace;
    g.add(new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex })));
    const frame = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.14, h + 0.14), new THREE.MeshStandardMaterial({ color: GOLD, metalness: 0.9, roughness: 0.3, emissive: 0x3a2806 }));
    frame.position.z = -0.02; g.add(frame);
    g.position.set(...pos); g.rotation.y = rotY; scene.add(g);
    return g;
  }
  const pics = [
    picture('media/rooftop.webp', 4.2, 9.17, [0, 0.3, -20], -0.12),
    picture('media/profile.webp', 4.4, 9.6, [0, 0, -68], 0.14),
  ];

  /* The credential wall: one plaque per certification, on a gentle arc. */
  function plaque(issuer, title) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 360;
    const x = c.getContext('2d');
    const bg = x.createLinearGradient(0, 0, 0, 360); bg.addColorStop(0, '#17130a'); bg.addColorStop(1, '#0a0906');
    x.fillStyle = bg; x.fillRect(0, 0, 512, 360);
    x.strokeStyle = '#e8b84a'; x.lineWidth = 6; x.strokeRect(10, 10, 492, 340);
    x.lineWidth = 1.5; x.strokeRect(24, 24, 464, 312);
    x.textAlign = 'center'; x.fillStyle = '#e8b84a';
    x.font = '600 26px "JetBrains Mono", monospace'; x.fillText(issuer ? issuer.split('').join(' ') : '·', 256, 78);
    x.fillStyle = '#f3ede0'; x.font = '44px "Bebas Neue", Impact, sans-serif';
    const words = title.toUpperCase().split(' '); const lines = [''];
    for (const w of words) { const t = `${lines.at(-1)} ${w}`.trim(); if (x.measureText(t).width > 410 && lines.at(-1)) lines.push(w); else lines[lines.length - 1] = t; }
    lines.forEach((l, i) => x.fillText(l, 256, 180 - (lines.length - 1) * 25 + i * 50));
    x.fillStyle = '#b3a892'; x.font = '500 20px Inter, sans-serif'; x.fillText('Colin Cook', 256, 304);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    return new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.83), new THREE.MeshBasicMaterial({ map: tex }));
  }
  const wall = new THREE.Group();
  const buildWall = () => {
    wall.clear();
    CREDENTIALS.forEach(([issuer, title], i) => {
      const col = i % 5; const row = Math.floor(i / 5);
      const m = plaque(issuer, title);
      const a = (col - 2) * 0.2;
      m.position.set(Math.sin(a) * 15, (1.5 - row) * 2.15, -Math.cos(a) * 15 + 15);
      m.rotation.y = -a; m.userData.phase = i * 0.7;
      wall.add(m);
    });
  };
  wall.position.set(0, 0.2, -48); scene.add(wall);
  buildWall(); document.fonts?.ready.then(buildWall); // redraw once the display face has loaded

  /* Dust in the projector beam. */
  const N = innerWidth < 760 ? 1400 : 3200;
  const pts = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pts[i * 3] = (Math.random() - 0.5) * 44; pts[i * 3 + 1] = (Math.random() - 0.5) * 24; pts[i * 3 + 2] = 14 - Math.random() * 175; }
  const dustGeo = new THREE.BufferGeometry(); dustGeo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({ color: 0xffdf9e, size: 0.055, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false }));
  scene.add(dust);

  /* Sunrise at the end of the track. */
  const sunC = document.createElement('canvas'); sunC.width = sunC.height = 256;
  const sx = sunC.getContext('2d'); const sg = sx.createRadialGradient(128, 128, 0, 128, 128, 128);
  sg.addColorStop(0, 'rgba(255,225,160,1)'); sg.addColorStop(0.25, 'rgba(255,150,60,.75)'); sg.addColorStop(0.6, 'rgba(40,110,120,.25)'); sg.addColorStop(1, 'rgba(0,0,0,0)');
  sx.fillStyle = sg; sx.fillRect(0, 0, 256, 256);
  const sun = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(sunC), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  sun.position.set(0, -2, -175); scene.add(sun);

  /* Scroll → scene index. */
  const sceneEls = [...document.querySelectorAll('.scene')];
  let sections = [];
  const measure = () => { sections = sceneEls.map((el) => ({ top: el.offsetTop, height: el.offsetHeight })); };
  const resize = () => {
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight; measure();
  };
  addEventListener('resize', resize); resize();
  new ResizeObserver(measure).observe(document.body);

  const mouse = { x: 0, y: 0 };
  addEventListener('pointermove', (e) => { mouse.x = e.clientX / innerWidth - 0.5; mouse.y = e.clientY / innerHeight - 0.5; });

  let f = 0; const look = new THREE.Vector3(); const lensEl = document.getElementById('lens'); const tcEl = document.getElementById('tc');
  const clock = new THREE.Clock();
  function frame() {
    const t = clock.getElapsedTime();
    const target = sceneIndex(sections, scrollY);
    f += (target - f) * (reduce ? 1 : 0.07); // the damping is the dolly's weight
    const cam = cameraAt(f, camera.aspect > 1);
    const breathe = reduce ? 0 : 1;
    camera.position.set(cam.pos[0] + mouse.x * 0.6 + Math.sin(t * 0.31) * 0.08 * breathe, cam.pos[1] - mouse.y * 0.4 + Math.cos(t * 0.23) * 0.06 * breathe, cam.pos[2]);
    look.set(cam.look[0], cam.look[1], cam.look[2]); camera.lookAt(look);
    camera.fov = verticalFov(cam.focal, camera.aspect); camera.updateProjectionMatrix();
    lensEl.textContent = `${Math.round(cam.focal)} mm`; tcEl.textContent = timecode(t);

    if (!reduce) {
      for (const g of rigs) g.children.forEach((m) => { if (m.userData.spin) { m.rotation.x += m.userData.spin[0] * 0.01; m.rotation.y += m.userData.spin[1] * 0.01; } else if (m.isMesh) m.rotation.y += 0.004; });
      wall.children.forEach((m) => { m.position.y += Math.sin(t * 0.6 + m.userData.phase) * 0.0009; });
      dust.rotation.z = t * 0.004;
      pics[0].rotation.y = -0.12 + Math.sin(t * 0.2) * 0.03; pics[1].rotation.y = 0.14 + Math.sin(t * 0.17) * 0.03;
    }
    // Each set piece is lit only while the camera is near it, so nothing shows through from the next scene.
    for (const g of [...pics, wall, rigs[1]]) g.visible = Math.abs(g.position.z - camera.position.z) < 30;
    key.position.z = camera.position.z + 4; rim.position.z = camera.position.z - 10;
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  frame();
}

/* Text panels ease up as they enter; product cards tilt toward the pointer. They are visible without this. */
if (!reduce && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver((es) => es.forEach((e) => e.target.style.setProperty('--in', e.isIntersecting ? 1 : 0)), { threshold: 0.12 });
  document.querySelectorAll('.copy').forEach((el, i) => { if (i) { el.style.setProperty('--in', 0); io.observe(el); } });
  document.querySelectorAll('.tilt').forEach((el) => {
    el.addEventListener('pointermove', (e) => { const r = el.getBoundingClientRect(); el.style.setProperty('--ry', ((e.clientX - r.left) / r.width - 0.5) * 14); el.style.setProperty('--rx', -((e.clientY - r.top) / r.height - 0.5) * 10); });
    el.addEventListener('pointerleave', () => { el.style.setProperty('--ry', 0); el.style.setProperty('--rx', 0); });
  });
}
