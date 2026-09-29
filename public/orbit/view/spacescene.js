import * as THREE from 'three';
import { buildEarth, starfield } from './earthtex.js';
import { buildVolta } from './models.js';
import { pointCloud } from './holo.js';
import { RE, OMEGA_E } from '../sim/atmos.js';

// Ascent scene, vehicle-centred (metres): VOLTA sits at the origin with local
// "up" = +y and east = −z; the Earth is placed at −(R⊕ + h) below it and turned
// by the downrange angle, so curvature, sky colour and stars all follow the
// real altitude.

export function buildSpaceScene() {
  const scene = new THREE.Scene(); scene.environmentIntensity = 0.2;
  scene.background = new THREE.Color('#6fa8dc');
  const cam = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.5, 5e7);
  const sunDir = new THREE.Vector3(0.6, 0.45, -0.65).normalize();
  const sun = new THREE.DirectionalLight('#fff4e0', 1.1); sun.position.copy(sunDir).multiplyScalar(100); scene.add(sun);
  const amb = new THREE.HemisphereLight('#bcd6ff', '#223344', 0.6); scene.add(amb);
  const earthPivot = new THREE.Group(); scene.add(earthPivot);
  const E = buildEarth(RE, { sun: sunDir }); earthPivot.add(E.group);
  E.group.rotation.z = Math.PI / 2;                                     // put the equator under the flight path (east = −z)
  // Runway strip on the surface at the start point (it scrolls away downrange).
  const runway = new THREE.Mesh(new THREE.BoxGeometry(80, 4, 4200), new THREE.MeshStandardMaterial({ color: '#2d3036', roughness: 0.9 }));
  runway.position.set(0, RE + 1, 1600); earthPivot.add(runway);
  const stars = starfield(5000, 4e7); scene.add(stars);
  const V = buildVolta(); scene.add(V.group);
  // Speed streaks (air molecules / condensation) that fade out with altitude.
  const streaks = pointCloud(600, 0.35, '#dff1ff'); scene.add(streaks);
  const sp = Array.from({ length: 600 }, () => [(Math.random() - 0.5) * 120, (Math.random() - 0.5) * 70, (Math.random() - 0.5) * 300]);
  // Heat glow on the nose and leading edges in hypersonic flight.
  const heat = new THREE.PointLight('#ff7a2a', 0, 60, 2); heat.position.set(0, 0, -17); V.group.add(heat);
  const cam0 = { yaw: 2.3, pitch: 0.22, r: 95, drag: null, last: 0 };
  return {
    scene, cam, V, E, earthPivot, stars, cam0,
    update(A, dt, t) {
      const n = A.now, h = Math.max(0, n.h), f = A.last;
      // Earth below: centre at −(R+h) along y, rotated back by the downrange angle about x.
      const down = Math.atan2(A.y, A.x) - OMEGA_E * A.t;               // downrange angle over the rotating ground
      earthPivot.position.set(0, -(RE + h), 0);
      earthPivot.rotation.set(down, 0, 0);
      E.clouds.rotation.y += dt * 0.0005;
      E.atmo.visible = false; E.rim.visible = false;       // limb shells are for distant views; near the planet the sky gradient does the job
      // Vehicle attitude: pitch above the local horizontal.
      const pitch = f ? f.pitch : 0;
      V.group.rotation.set(pitch, 0, 0);
      // Sky: blue near the ground, black above ~60 km; stars fade in.
      const k = Math.min(1, h / 60000);
      scene.background.setRGB(0.44 * (1 - k) ** 2, 0.66 * (1 - k) ** 1.6, 0.86 * (1 - k) ** 1.2);
      stars.material.opacity = Math.max(0, (h - 25000) / 35000);
      amb.intensity = 0.6 - 0.45 * k;
      // Plumes: air-breathing (orange, shock diamonds) and rocket (blue; widens as ambient pressure falls).
      const air = f && f.mdotAir > 0, rocket = f && f.mdotOx > 0;
      for (const p of V.airs) p.visible = !!air;
      V.aMat.uniforms.uPow.value = air ? 0.9 : 0; V.aMat.uniforms.uTime.value = t;
      V.rocket.visible = !!rocket;
      const pa = n.atm.p / 101325;
      V.rocket.scale.set(1 + 1.8 * (1 - pa), 1 + 1.8 * (1 - pa), 0.7 + 0.5 * (1 - pa) + 0.3 * A.throttle);
      V.rMat.uniforms.uPow.value = rocket ? 0.3 + 0.35 * pa + 0.25 * A.throttle : 0;       // vacuum plumes are faint V.rMat.uniforms.uDiamonds.value = pa; V.rMat.uniforms.uTime.value = t;
      // Streaks move past at a rate that suggests the air speed.
      const P = streaks.geometry.attributes.position.array, vis = Math.max(0, 1 - h / 45000), spd = Math.min(900, n.vRel) * dt * 0.35;
      for (let i = 0; i < 600; i++) { const s = sp[i]; s[2] += spd; if (s[2] > 150) s[2] -= 300; P[i * 3] = s[0]; P[i * 3 + 1] = s[1]; P[i * 3 + 2] = s[2]; }
      streaks.geometry.attributes.position.needsUpdate = true; streaks.material.opacity = vis * 0.7;
      heat.intensity = Math.min(40, (n.q / 1000) * (n.M / 5) ** 3 * 0.8);
      // Deployment: doors open, payload rises and unfolds its panels.
      const dep = A.depT ?? -1;
      for (const d of V.doors) d.rotation.z = d.userData.s * Math.min(1.4, Math.max(0, dep) * 0.7);
      if (A.phase === 'deployed') { const u = Math.max(0, dep - 2); V.payload.position.y = 0.9 + u * 1.2; V.payload.rotation.y = u * 0.2; V.payload.userData.panel.visible = u > 1.5; }
      else { V.payload.position.set(0, 0.9, -1); V.payload.userData.panel.visible = false; V.payload.visible = A.payload > 0 || A.phase === 'deployed'; }
      if (A.depT !== undefined) A.depT += dt;
      // Camera orbit (drag to look around).
      const c = cam0; if (!c.drag && performance.now() - c.last > 4000) c.yaw += dt * 0.05;
      cam.position.set(Math.sin(c.yaw) * Math.cos(c.pitch) * c.r, Math.sin(c.pitch) * c.r, Math.cos(c.yaw) * Math.cos(c.pitch) * c.r);
      cam.lookAt(0, 0, 0);
      sun.position.copy(sunDir).multiplyScalar(100);
    },
  };
}
