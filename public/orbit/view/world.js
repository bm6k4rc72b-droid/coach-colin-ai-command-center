import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { terrain } from '../sim/fighter.js';

// The fighter's world: physical sky, a coastline with hills and a ridge, the
// sea, drifting cloud banks and the launch site on the coast. Metres.

const SIZE = 60000, SEG = 220;

function colourFor(h, slope) {
  if (h < 2) return [0.76, 0.7, 0.52];                                    // beach
  if (h > 1500) return [0.92, 0.94, 0.97];                                 // snow on the ridge
  if (slope > 0.45) return [0.42, 0.4, 0.38];                              // rock
  const t = Math.min(1, h / 1400);
  return [0.18 + 0.2 * t, 0.36 + 0.08 * t, 0.16 + 0.1 * t];
}

export function buildWorld() {
  const scene = new THREE.Scene(); scene.environmentIntensity = 0.3;
  scene.fog = new THREE.FogExp2('#8fa9c4', 0.000012);
  const sky = new Sky(); sky.scale.setScalar(450000);
  const U = sky.material.uniforms; U.turbidity.value = 2.2; U.rayleigh.value = 1.1; U.mieCoefficient.value = 0.003; U.mieDirectionalG.value = 0.82;
  const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(72), THREE.MathUtils.degToRad(110));
  U.sunPosition.value.copy(sun); scene.add(sky);
  const hemi = new THREE.HemisphereLight('#cfe3ff', '#40502e', 0.9); scene.add(hemi);
  const dir = new THREE.DirectionalLight('#fff1d8', 2.4); dir.position.copy(sun).multiplyScalar(1000); scene.add(dir);

  // Terrain tile that re-centres under the jet.
  const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG); geo.rotateX(-Math.PI / 2);
  geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 3), 3));
  const dc = document.createElement('canvas'); dc.width = dc.height = 512; const dg = dc.getContext('2d');
  dg.fillStyle = '#b8b8b8'; dg.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 140; i++) { const w = 20 + Math.random() * 90, h = 20 + Math.random() * 90, v = 150 + Math.random() * 90; dg.fillStyle = `rgb(${v},${v + Math.random() * 20},${v - 10})`; dg.save(); dg.translate(Math.random() * 512, Math.random() * 512); dg.rotate(Math.random() * 0.4 - 0.2); dg.fillRect(-w / 2, -h / 2, w, h); dg.restore(); }
  const id = dg.getImageData(0, 0, 512, 512); for (let i = 0; i < id.data.length; i += 4) { const n = (Math.random() - 0.5) * 34; id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n; } dg.putImageData(id, 0, 0);
  const detail = new THREE.CanvasTexture(dc); detail.wrapS = detail.wrapT = THREE.RepeatWrapping; detail.repeat.set(90, 90); detail.anisotropy = 8; detail.colorSpace = THREE.SRGBColorSpace;
  const ground = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, map: detail, roughness: 0.95, metalness: 0 }));
  scene.add(ground);
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(400000, 400000), new THREE.MeshStandardMaterial({ color: '#10324f', roughness: 0.22, metalness: 0.35 }));
  sea.rotation.x = -Math.PI / 2; sea.position.y = 0.5; scene.add(sea);
  const base = geo.attributes.position.array.slice();
  let cx = NaN, cz = NaN;
  function recentre(x, z) {
    const nx = Math.round(x / 8000) * 8000, nz = Math.round(z / 8000) * 8000;
    if (nx === cx && nz === cz) return;
    cx = nx; cz = nz;
    const P = geo.attributes.position.array, C = geo.attributes.color.array;
    for (let i = 0; i < P.length; i += 3) {
      const wx = base[i] + cx, wz = base[i + 2] + cz, h = terrain(wx, wz);
      P[i] = wx; P[i + 1] = h; P[i + 2] = wz;
      const sl = Math.min(1, Math.abs(terrain(wx + 200, wz) - h) / 200 + Math.abs(terrain(wx, wz + 200) - h) / 200);
      const c = colourFor(h, sl); C[i] = c[0]; C[i + 1] = c[1]; C[i + 2] = c[2];
    }
    geo.attributes.position.needsUpdate = geo.attributes.color.needsUpdate = true; geo.computeVertexNormals(); geo.computeBoundingSphere();
  }
  // Clouds: soft billboard puffs in a few banks.
  const cvs = document.createElement('canvas'); cvs.width = cvs.height = 128;
  const g = cvs.getContext('2d');
  for (let k = 0; k < 14; k++) { const x = 30 + Math.random() * 68, y = 44 + Math.random() * 40, r = 18 + Math.random() * 26, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
  const ctex = new THREE.CanvasTexture(cvs); ctex.colorSpace = THREE.SRGBColorSpace;
  const clouds = new THREE.Group(); scene.add(clouds);
  for (let i = 0; i < 90; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctex, transparent: true, depthWrite: false, opacity: 0.85, fog: true }));
    const a = Math.random() * Math.PI * 2, r = 4000 + Math.random() * 40000;
    s.position.set(Math.cos(a) * r, 1500 + Math.random() * 700, Math.sin(a) * r); s.scale.setScalar(2000 + Math.random() * 3000);
    clouds.add(s);
  }
  // Launch site on the coast: pad, tower, a rocket, and the radar dome.
  const site = new THREE.Group(); site.position.set(-4200, 0, 2000);
  const concrete = new THREE.MeshStandardMaterial({ color: '#b9bcc2', roughness: 0.8 });
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(120, 120, 6, 32), concrete); site.add(pad);
  const tower = new THREE.Mesh(new THREE.BoxGeometry(14, 90, 14), new THREE.MeshStandardMaterial({ color: '#8f2b20', roughness: 0.6, metalness: 0.4 })); tower.position.set(-24, 45, 0); site.add(tower);
  const rocket = new THREE.Mesh(new THREE.CylinderGeometry(3.7, 3.7, 70, 24), new THREE.MeshStandardMaterial({ color: '#f1f2f4', roughness: 0.4 })); rocket.position.y = 38; site.add(rocket);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(18, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: '#f4f4f0', roughness: 0.5 })); dome.position.set(900, 0, -600); site.add(dome);
  const runway = new THREE.Mesh(new THREE.BoxGeometry(60, 1, 3200), new THREE.MeshStandardMaterial({ color: '#2d3036', roughness: 0.9 })); runway.position.set(-1800, 2, 600); site.add(runway);
  site.position.y = Math.max(3, terrain(-4200, 2000)); scene.add(site);
  return { scene, sky, sun, recentre, clouds, site, dir };
}
