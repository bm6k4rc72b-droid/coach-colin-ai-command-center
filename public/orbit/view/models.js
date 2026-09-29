import * as THREE from 'three';

// Vehicle models built from primitives (metres, forward = −z, up = +y).

const lathe = (pts, seg = 48) => new THREE.LatheGeometry(pts.map(([r, z]) => new THREE.Vector2(r, z)), seg);
const alongZ = (g) => { g.rotateX(Math.PI / 2); return g; };        // lathe axis y → z (profile z stays z)

// Exhaust plume: an open cone with a shader for core, shock diamonds and fade.
export function plumeMaterial(core = '#bfe4ff', edge = '#3f7bff') {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uCore: { value: new THREE.Color(core) }, uEdge: { value: new THREE.Color(edge) }, uPow: { value: 1 }, uDiamonds: { value: 1 } },
    vertexShader: `#include <common>
#include <logdepthbuf_pars_vertex>
varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 w = modelMatrix*vec4(position,1.); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix*viewMatrix*w; 
#include <logdepthbuf_vertex>
 }`,
    fragmentShader: `#include <logdepthbuf_pars_fragment>
uniform float uTime, uPow, uDiamonds; uniform vec3 uCore, uEdge; varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){
#include <logdepthbuf_fragment>
 float along = 1.0 - vUv.y; float facing = abs(dot(normalize(vN), normalize(vV)));
        float diamonds = 0.65 + 0.35 * pow(abs(sin(along * 22.0 - uTime * 3.0)), 6.0) * uDiamonds;
        float fade = pow(1.0 - along, 1.6) * smoothstep(0.0, 0.05, along);
        float flick = 0.9 + 0.1 * sin(uTime * 53.0 + along * 30.0);
        vec3 c = mix(uEdge, uCore, facing * facing) * diamonds * flick;
        float a = fade * (0.25 + 0.75 * facing) * uPow;
        gl_FragColor = vec4(c * a * 1.1, 1.0); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
}
export function plume(len, r0, r1, mat) {
  const g = new THREE.CylinderGeometry(r0, r1, len, 32, 24, true); g.translate(0, -len / 2, 0); g.rotateX(-Math.PI / 2);  // nozzle at z = 0, extends toward +z
  const m = new THREE.Mesh(g, mat); m.frustumCulled = false; return m;
}

export function buildFighter() {
  const g = new THREE.Group();
  const grey = new THREE.MeshStandardMaterial({ color: '#7c8591', metalness: 0.55, roughness: 0.42 });
  const dark = new THREE.MeshStandardMaterial({ color: '#2b3038', metalness: 0.6, roughness: 0.5 });
  const fus = new THREE.Mesh(alongZ(lathe([[0, -8], [0.35, -6.8], [0.62, -5], [0.8, -2.5], [0.85, 0], [0.82, 3.5], [0.62, 6.2], [0.55, 7]])), grey); g.add(fus);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.55, 24, 16, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: '#c9a456', metalness: 0.9, roughness: 0.05, transparent: true, opacity: 0.75 }));
  canopy.scale.set(0.9, 0.8, 2.6); canopy.position.set(0, 0.55, -4.2); g.add(canopy);
  const wingShape = new THREE.Shape(); wingShape.moveTo(0, -1.5); wingShape.lineTo(4.9, 2.2); wingShape.lineTo(4.9, 3.1); wingShape.lineTo(0, 3.6);
  const wg = new THREE.ExtrudeGeometry(wingShape, { depth: 0.12, bevelEnabled: false }); wg.rotateX(Math.PI / 2);
  for (const s of [1, -1]) { const w = new THREE.Mesh(wg, grey); w.scale.x = s; w.position.set(0, -0.05, 0); g.add(w); }
  const stab = new THREE.Shape(); stab.moveTo(0, 4.8); stab.lineTo(2.8, 6.6); stab.lineTo(2.8, 7.2); stab.lineTo(0, 7.2);
  const sg = new THREE.ExtrudeGeometry(stab, { depth: 0.08, bevelEnabled: false }); sg.rotateX(Math.PI / 2);
  for (const s of [1, -1]) { const w = new THREE.Mesh(sg, grey); w.scale.x = s; w.position.y = -0.1; g.add(w); }
  const fin = new THREE.Shape(); fin.moveTo(3.2, 0); fin.lineTo(6.6, 3.6); fin.lineTo(7.3, 3.6); fin.lineTo(7.2, 0);
  const fg = new THREE.ExtrudeGeometry(fin, { depth: 0.1, bevelEnabled: false }); fg.rotateY(-Math.PI / 2); fg.translate(0.05, 0.6, 0);
  g.add(new THREE.Mesh(fg, grey));
  const intake = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.8, 3.2), dark); intake.position.set(0, -0.85, -1.4); g.add(intake);
  const nozzle = new THREE.Mesh(alongZ(lathe([[0.55, 6.9], [0.62, 7.6], [0.5, 7.9]])), dark); g.add(nozzle);
  const abMat = plumeMaterial('#fff1c4', '#ff7a2a');
  const ab = plume(7, 0.5, 0.15, abMat); ab.position.z = 7.9; g.add(ab);
  return { group: g, ab, abMat };
}

export function buildVolta() {
  const g = new THREE.Group();
  const white = new THREE.MeshPhysicalMaterial({ color: '#d9dee6', metalness: 0.3, roughness: 0.34, clearcoat: 0.5, clearcoatRoughness: 0.3 });
  const graphite = new THREE.MeshStandardMaterial({ color: '#23272e', metalness: 0.5, roughness: 0.45 });
  const glow = new THREE.MeshBasicMaterial({ color: '#4fb6ff' });
  // Fuselage 32 m with an ogive nose.
  const prof = [[0, -16], [0.6, -14.5], [1.25, -12], [1.7, -8], [1.9, -3], [1.95, 6], [1.8, 12], [1.55, 15], [1.4, 16]];
  const fus = new THREE.Mesh(alongZ(lathe(prof, 64)), white); fus.scale.y = 0.72; g.add(fus);
  // Cranked delta wing (blended, graphite leading edges).
  const w = new THREE.Shape();
  w.moveTo(0, -9); w.lineTo(2.6, -4); w.lineTo(9.8, 9.5); w.lineTo(10.2, 12.5); w.lineTo(0, 13.5);
  const wg = new THREE.ExtrudeGeometry(w, { depth: 0.35, bevelEnabled: true, bevelThickness: 0.18, bevelSize: 0.25, bevelSegments: 4 }); wg.rotateX(Math.PI / 2);
  for (const s of [1, -1]) { const m = new THREE.Mesh(wg, white); m.scale.x = s; m.position.y = -0.55; g.add(m); }
  const le = new THREE.Shape(); le.moveTo(2.6, -4); le.lineTo(9.8, 9.5); le.lineTo(9.3, 9.8); le.lineTo(2.2, -3.4);
  const leg = new THREE.ExtrudeGeometry(le, { depth: 0.4, bevelEnabled: false }); leg.rotateX(Math.PI / 2);
  for (const s of [1, -1]) { const m = new THREE.Mesh(leg, graphite); m.scale.x = s; m.position.y = -0.5; g.add(m); }
  // Twin canted fins.
  const fin = new THREE.Shape(); fin.moveTo(9, 0); fin.lineTo(13.5, 4.2); fin.lineTo(15.2, 4.2); fin.lineTo(15.5, 0);
  const fg = new THREE.ExtrudeGeometry(fin, { depth: 0.18, bevelEnabled: false }); fg.rotateY(-Math.PI / 2);
  for (const s of [1, -1]) { const m = new THREE.Mesh(fg, white); m.position.set(s * 1.5, 0.6, 0); m.rotation.z = -s * 0.32; g.add(m); }
  // Cockpit window band and electric-blue trim.
  const win = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.35, 2.2), new THREE.MeshPhysicalMaterial({ color: '#0b1426', metalness: 0.9, roughness: 0.05 })); win.position.set(0, 0.95, -10.5); win.rotation.x = 0.28; g.add(win);
  for (const s of [1, -1]) { const t = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 24), glow); t.position.set(s * 1.72, 0.2, 1); g.add(t); }
  const wingTrim = new THREE.Mesh(new THREE.BoxGeometry(20, 0.05, 0.08), glow); wingTrim.position.set(0, -0.5, 12.9); g.add(wingTrim);
  // Four combined-cycle intakes under the wing roots.
  for (const x of [-2.6, -1.1, 1.1, 2.6]) { const b = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.8, 9), graphite); b.position.set(x, -1.3, 6); g.add(b); }
  // Rocket bell and air-breathing nozzles.
  const bell = new THREE.Mesh(alongZ(lathe([[0.55, 15.6], [0.7, 16.2], [1.25, 17.6], [1.45, 18.3]], 40)), new THREE.MeshStandardMaterial({ color: '#40362f', metalness: 0.7, roughness: 0.35, side: THREE.DoubleSide }));
  g.add(bell);
  const rMat = plumeMaterial('#e8f2ff', '#5a6dff'), aMat = plumeMaterial('#fff0c8', '#ff8a3a');
  const rocket = plume(40, 1.3, 1.1, rMat); rocket.position.z = 18.3; g.add(rocket);
  const airs = [];
  for (const x of [-2.6, -1.1, 1.1, 2.6]) { const p = plume(12, 0.5, 0.2, aMat); p.position.set(x, -1.3, 10.6); g.add(p); airs.push(p); }
  // Payload bay doors (open on deploy) and the payload.
  const doors = [];
  for (const s of [1, -1]) { const d = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 7), white); d.position.set(s * 0.7, 1.42, -1); d.userData.s = s; g.add(d); doors.push(d); }
  const payload = new THREE.Group();
  const pb = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.1, 2.6), new THREE.MeshStandardMaterial({ color: '#d7b25b', metalness: 0.8, roughness: 0.35 }));
  const panel = new THREE.Mesh(new THREE.BoxGeometry(6, 0.04, 1.4), new THREE.MeshStandardMaterial({ color: '#16264d', metalness: 0.6, roughness: 0.3, emissive: '#0a1a40' })); panel.visible = false;
  payload.add(pb, panel); payload.position.set(0, 0.9, -1); payload.userData.panel = panel; g.add(payload);
  return { group: g, rocket, rMat, airs, aMat, doors, payload };
}
