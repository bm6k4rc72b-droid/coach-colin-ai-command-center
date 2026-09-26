import * as THREE from 'three';
import { COLORS } from '../config/anatomy.js';
import { fbm } from './noise.js';

// Shared arterial waveform (0 = diastole, 1 = systolic peak), written each frame
// by the heart model. Every pulsating material reads it.
export const pulseUniform = { value: 0 };

// Adds pulsation to a material: vertices push outward along their normals by
// `amp` mm × the arterial waveform. It is a cheap stand-in for vessel compliance.
export function withPulse(mat, amp) {
  const uAmp = { value: amp };
  mat.userData.pulseAmp = uAmp;
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uPulse = pulseUniform;
    shader.uniforms.uPulseAmp = uAmp;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uPulse;\nuniform float uPulseAmp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += objectNormal * (uPulse * uPulseAmp);');
  };
  mat.customProgramCacheKey = () => 'pulse';
  return mat;
}

// A small procedural normal map that breaks up specular highlights so the
// tissue glistens as if wet with CSF.
let wetNormal = null;
function wetNormalMap() {
  if (wetNormal) return wetNormal;
  const N = 256, h = new Float32Array(N * N), data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    // Tileable by sampling on a torus.
    const a = (x / N) * Math.PI * 2, b = (y / N) * Math.PI * 2;
    h[y * N + x] = fbm(Math.cos(a) * 2 + 7, Math.sin(a) * 2, Math.cos(b) * 2 + Math.sin(b) * 2, 4);
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const hx = h[y * N + ((x + 1) % N)] - h[y * N + ((x - 1 + N) % N)];
    const hy = h[((y + 1) % N) * N + x] - h[((y - 1 + N) % N) * N + x];
    const v = new THREE.Vector3(-hx * 3, -hy * 3, 1).normalize();
    const i = (y * N + x) * 4;
    data[i] = (v.x * 0.5 + 0.5) * 255; data[i + 1] = (v.y * 0.5 + 0.5) * 255; data[i + 2] = (v.z * 0.5 + 0.5) * 255; data[i + 3] = 255;
  }
  wetNormal = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  wetNormal.wrapS = wetNormal.wrapT = THREE.RepeatWrapping;
  wetNormal.needsUpdate = true;
  return wetNormal;
}

function wet(params, repeat = [6, 2], normalStrength = 0.35) {
  const n = wetNormalMap().clone();
  n.repeat.set(repeat[0], repeat[1]);
  n.needsUpdate = true;
  return new THREE.MeshPhysicalMaterial({
    roughness: 0.42,
    clearcoat: 1,
    clearcoatRoughness: 0.07,
    normalMap: n,
    normalScale: new THREE.Vector2(normalStrength, normalStrength),
    envMapIntensity: 0.55,
    ...params,
  });
}

export const Materials = {
  cortex: (amp) => withPulse(wet({
    vertexColors: true, color: '#ffffff', roughness: 0.5, sheen: 0.6, sheenColor: new THREE.Color('#ff9d9d'), sheenRoughness: 0.5,
  }, [10, 5], 0.5), amp),
  artery: (amp) => withPulse(wet({ color: COLORS.artery, roughness: 0.32, sheen: 0.4, sheenColor: new THREE.Color('#ff6070') }, [14, 1]), amp),
  aneurysm: (amp) => withPulse(wet({ color: COLORS.aneurysm, roughness: 0.28, sheen: 0.7, sheenColor: new THREE.Color('#ff8fa0'), emissive: '#3a0508' }, [3, 2], 0.25), amp),
  bleb: (amp) => withPulse(wet({ color: COLORS.bleb, roughness: 0.25, emissive: '#2a0418' }, [1, 1], 0.2), amp),
  vein: () => wet({ color: COLORS.vein, roughness: 0.3 }, [14, 1]),
  nerve: () => wet({ color: COLORS.nerve, roughness: 0.5, clearcoat: 0.7, sheen: 0.3, sheenColor: new THREE.Color('#fff6dd') }, [18, 1], 0.6),
  floor: () => wet({ vertexColors: true, color: '#ffffff', roughness: 0.8, clearcoat: 0.25, clearcoatRoughness: 0.35, envMapIntensity: 0.2 }, [8, 8], 0.25),
  arachnoid: (opacity, fiberMap = null) => new THREE.MeshPhysicalMaterial({
    color: COLORS.arachnoid, transparent: true, opacity, map: fiberMap, alphaMap: fiberMap, roughness: 0.25, metalness: 0,
    iridescence: 0.7, iridescenceIOR: 1.3, iridescenceThicknessRange: [180, 620],
    clearcoat: 1, clearcoatRoughness: 0.1, side: THREE.DoubleSide, depthWrite: false,
    envMapIntensity: 0.7,
  }),
  metal: () => new THREE.MeshPhysicalMaterial({ color: COLORS.spatula, metalness: 0.55, roughness: 0.3, clearcoat: 0.6, envMapIntensity: 4 }),
};
