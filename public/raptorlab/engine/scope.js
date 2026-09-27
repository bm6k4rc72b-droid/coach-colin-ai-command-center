import * as THREE from 'three';

// Turbopump borescope: a look down the pump inlet at the helical inducer.
// The blades turn with the real pump speed (stroboscopically slowed so the eye can
// follow them), and vapour bubbles appear in proportion to the cavitation fraction.
export function buildScope() {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#020308');
  const camera = new THREE.PerspectiveCamera(55, 1, 0.01, 10);
  camera.position.set(0, 0, 1.25); camera.lookAt(0, 0, 0);
  scene.add(new THREE.AmbientLight('#6070a0', 1.6));
  const lamp = new THREE.PointLight('#ffffff', 5, 6, 1.2); lamp.position.set(0.25, 0.35, 1.1); scene.add(lamp);
  const rimL = new THREE.PointLight('#3ff3ff', 3, 4, 1.5); rimL.position.set(-0.5, -0.4, 0.4); scene.add(rimL);

  // Inlet bore.
  const bore = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 2, 64, 1, true), new THREE.MeshStandardMaterial({ color: '#39414f', metalness: 0.4, roughness: 0.45, side: THREE.BackSide }));
  bore.rotation.x = Math.PI / 2; bore.position.z = -0.6; scene.add(bore);
  // Inducer: three swept helical blades on a hub.
  const rotor = new THREE.Group(); scene.add(rotor);
  const bladeMat = new THREE.MeshPhysicalMaterial({ color: '#c9d2e3', metalness: 0.55, roughness: 0.25, clearcoat: 1, side: THREE.DoubleSide, emissive: '#1a2230' });
  for (let b = 0; b < 3; b++) {
    const pts = [], idx = [];
    const N = 40, M = 6;
    for (let i = 0; i <= N; i++) for (let j = 0; j <= M; j++) {
      const u = i / N, r = 0.12 + 0.46 * (j / M);
      const th = b * (Math.PI * 2 / 3) + u * Math.PI * 1.2;
      pts.push(r * Math.cos(th), r * Math.sin(th), -u * 0.9);
    }
    for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) { const a = i * (M + 1) + j, c = a + M + 1; idx.push(a, c, a + 1, c, c + 1, a + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); g.setIndex(idx); g.computeVertexNormals();
    rotor.add(new THREE.Mesh(g, bladeMat));
  }
  const hub = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.35, 32), bladeMat); hub.rotation.x = -Math.PI / 2; hub.position.z = 0.12; rotor.add(hub);
  // Propellant tint and bubbles.
  const fluid = new THREE.Mesh(new THREE.CircleGeometry(0.62, 48), new THREE.MeshBasicMaterial({ color: '#58d8ff', transparent: true, opacity: 0.12, depthWrite: false, blending: THREE.AdditiveBlending }));
  fluid.position.z = 0.3; scene.add(fluid);
  const N = 220, pos = new Float32Array(N * 3), life = new Float32Array(N);
  const bg = new THREE.BufferGeometry(); bg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const c = document.createElement('canvas'); c.width = c.height = 32; const x = c.getContext('2d');
  x.strokeStyle = '#fff'; x.lineWidth = 3; x.beginPath(); x.arc(16, 16, 11, 0, Math.PI * 2); x.stroke();
  const bubbles = new THREE.Points(bg, new THREE.PointsMaterial({ size: 0.05, map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false }));
  bubbles.frustumCulled = false; scene.add(bubbles);
  for (let i = 0; i < N; i++) life[i] = -1;

  let angle = 0;
  return {
    update(dt, { rpm, cav, color }) {
      // Real rotation rate is rpm/60 rev/s; a strobe at 3 % keeps it readable.
      angle += (rpm / 60) * 2 * Math.PI * dt * 0.03;
      rotor.rotation.z = -angle;
      fluid.material.color.set(color);
      const active = Math.round(N * Math.min(1, cav * 1.5));
      for (let i = 0; i < N; i++) {
        if (i >= active) { pos[i * 3 + 2] = 50; continue; }
        life[i] -= dt;
        if (life[i] <= 0) {
          // Bubbles form on the low-pressure suction side near the blade tips.
          const th = Math.random() * Math.PI * 2, r = 0.35 + Math.random() * 0.25;
          pos[i * 3] = r * Math.cos(th); pos[i * 3 + 1] = r * Math.sin(th); pos[i * 3 + 2] = -0.1 - Math.random() * 0.5;
          life[i] = 0.3 + Math.random() * 0.6;
        }
        const th = Math.atan2(pos[i * 3 + 1], pos[i * 3]) - dt * 2, r = Math.hypot(pos[i * 3], pos[i * 3 + 1]);
        pos[i * 3] = r * Math.cos(th); pos[i * 3 + 1] = r * Math.sin(th); pos[i * 3 + 2] -= dt * 0.5;
      }
      bg.attributes.position.needsUpdate = true;
    },
    render(renderer, rect) {
      const W = renderer.domElement.clientWidth, H = renderer.domElement.clientHeight;
      const x = rect.left, y = H - rect.bottom, w = rect.width, h = rect.height;
      if (w < 4 || h < 4) return;
      camera.aspect = w / h; camera.updateProjectionMatrix();
      const auto = renderer.autoClear;
      renderer.autoClear = false;
      renderer.setScissorTest(true); renderer.setScissor(x, y, w, h); renderer.setViewport(x, y, w, h);
      renderer.clear(); renderer.render(scene, camera);
      renderer.setScissorTest(false); renderer.setViewport(0, 0, W, H);
      renderer.autoClear = auto;
    },
  };
}
