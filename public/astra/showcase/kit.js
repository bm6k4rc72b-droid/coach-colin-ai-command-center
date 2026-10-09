/**
 * Small shared pieces for the chamber's builders: colours, a seeded PRNG,
 * glow materials, sprite text and instanced atoms.
 *
 * @module astra/showcase/kit
 */

import * as THREE from 'three';

export const GOLD = new THREE.Color('#f0b75a');
export const ICE = new THREE.Color('#6fd3ff');

/** Seeded PRNG so every visitor sees the same protein. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A colour pushed past 1 so the bloom pass picks it up. */
export const hot = (color, gain) => color.clone().multiplyScalar(gain);

/** Additive glow material. */
export const glow = (color, opacity = 1) => new THREE.MeshBasicMaterial({
  color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false,
});

/** A soft radial sprite texture, for light pools and particles. */
export function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(1, outer);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export const DOT = radialTexture();

/** Text on a transparent canvas, as a sprite. */
export function label(text, { color = '#f3d08a', size = 46, width = 512 } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = 96;
  const ctx = canvas.getContext('2d');
  ctx.font = `600 ${size}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.fillStyle = color;
  ctx.fillText(text, width / 2, 48);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(width / 96 * 0.16, 0.16, 1);
  return sprite;
}

/** Glass-and-light material for instanced atoms. */
export function atomMaterial(envMap, { metal = 0.2, rough = 0.12, emissive = 0.55 } = {}) {
  const material = new THREE.MeshStandardMaterial({
    color: 0xffffff, metalness: metal, roughness: rough, envMap, envMapIntensity: 0.45,
    transparent: true, opacity: 0.9, emissive: 0xffffff, emissiveIntensity: emissive * 0.6,
  });
  // Drive emissive from the instance colour so each atom glows its own hue.
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\n totalEmissiveRadiance *= vColor;\n#endif',
    );
  };
  return material;
}

/** Instanced spheres at given positions, one colour each. */
export function atoms(points, radius, colors, material) {
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 18, 14), material, points.length);
  const m = new THREE.Matrix4();
  points.forEach((p, i) => {
    const r = Array.isArray(radius) ? radius[i] : radius;
    m.makeScale(r, r, r).setPosition(p);
    mesh.setMatrixAt(i, m);
    mesh.setColorAt(i, colors[i]);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor.needsUpdate = true;
  return mesh;
}
