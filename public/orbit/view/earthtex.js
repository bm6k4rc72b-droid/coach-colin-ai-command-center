import * as THREE from 'three';
import { fbm, glowTexture } from './holo.js';

// Procedural Earth: continents from folded fractal noise on the sphere (no
// downloaded imagery), a separate cloud layer, and an atmosphere rim shader.
// Stylised on purpose: the physics, not the coastlines, is the point.

let cache = null;
export function earthTextures() {
  if (cache) return cache;
  const W = 1024, H = 512;
  const land = document.createElement('canvas'); land.width = W; land.height = H;
  const cl = document.createElement('canvas'); cl.width = W; cl.height = H;
  const g = land.getContext('2d'), gc = cl.getContext('2d');
  const img = g.createImageData(W, H), ci = gc.createImageData(W, H);
  for (let j = 0; j < H; j++) {
    const lat = (0.5 - j / H) * Math.PI, cy = Math.cos(lat), sy = Math.sin(lat);
    for (let i = 0; i < W; i++) {
      const lon = (i / W) * Math.PI * 2, x = cy * Math.cos(lon), z = cy * Math.sin(lon), y = sy;
      const n = fbm(x * 1.6 + 7, y * 1.6 + 3, z * 1.6 + 11, 5), k = (j * W + i) * 4;
      const ice = Math.abs(lat) > 1.2 ? 1 : Math.abs(lat) > 1.08 ? (Math.abs(lat) - 1.08) / 0.12 : 0;
      let r, gg, b;
      if (n > 0.52) {
        const e = Math.min(1, (n - 0.52) / 0.25), dry = fbm(x * 4, y * 4 + 5, z * 4, 3), desert = Math.max(0, 1 - Math.abs(lat) / 0.55) * (dry > 0.5 ? 1 : 0);
        r = 60 + 90 * e + 100 * desert; gg = 95 + 50 * e + 60 * desert; b = 45 + 40 * e + 20 * desert;
      } else {
        const d = Math.max(0, (0.52 - n) / 0.2);
        r = 8 + 10 * (1 - d); gg = 40 + 40 * (1 - d); b = 90 + 60 * (1 - d);
      }
      r = r + (235 - r) * ice; gg = gg + (240 - gg) * ice; b = b + (250 - b) * ice;
      img.data[k] = r; img.data[k + 1] = gg; img.data[k + 2] = b; img.data[k + 3] = 255;
      const c = fbm(x * 3 + 20, y * 5, z * 3 - 9, 5), band = 0.5 + 0.5 * Math.cos(lat * 6);
      const a = Math.max(0, Math.min(1, (c - 0.5 + 0.12 * band) * 3.2));
      ci.data[k] = ci.data[k + 1] = ci.data[k + 2] = 255; ci.data[k + 3] = a * 235;
    }
  }
  g.putImageData(img, 0, 0); gc.putImageData(ci, 0, 0);
  const tLand = new THREE.CanvasTexture(land), tCloud = new THREE.CanvasTexture(cl);
  tLand.colorSpace = tCloud.colorSpace = THREE.SRGBColorSpace;
  tLand.anisotropy = tCloud.anisotropy = 4;
  return (cache = { tLand, tCloud });
}

// Earth group of radius R (in scene units): surface, clouds and atmosphere rim.
export function buildEarth(R, { sun = new THREE.Vector3(1, 0.3, 0.6) } = {}) {
  const { tLand, tCloud } = earthTextures();
  const grp = new THREE.Group();
  const surf = new THREE.Mesh(new THREE.SphereGeometry(R, 128, 64), new THREE.MeshStandardMaterial({ map: tLand, roughness: 0.85, metalness: 0.0 }));
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(R * 1.006, 96, 48), new THREE.MeshStandardMaterial({ map: tCloud, transparent: true, opacity: 0.78, color: '#dfe6f0', depthWrite: false, roughness: 1 }));
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(R * 1.025, 96, 48), new THREE.ShaderMaterial({
    uniforms: { uSun: { value: sun.clone().normalize() } },
    vertexShader: `#include <common>
#include <logdepthbuf_pars_vertex>
varying vec3 vN; varying vec3 vV; varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.); vW = normalize(w.xyz - (modelMatrix*vec4(0.,0.,0.,1.)).xyz); vN = normalize(mat3(modelMatrix)*normal); vV = normalize(cameraPosition - w.xyz); gl_Position = projectionMatrix*viewMatrix*w; 
#include <logdepthbuf_vertex>
 }`,
    fragmentShader: `#include <logdepthbuf_pars_fragment>
uniform vec3 uSun; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){
#include <logdepthbuf_fragment>
 float f = pow(1.0 - abs(dot(vN, vV)), 3.0); float day = smoothstep(-0.25, 0.4, dot(vW, uSun));
        vec3 c = mix(vec3(0.25,0.5,1.0), vec3(1.0,0.55,0.3), smoothstep(0.1, -0.2, dot(vW,uSun)) * 0.6);
        gl_FragColor = vec4(c * f * (0.25 + 1.4 * day), 1.0); }`,
    transparent: true, blending: THREE.AdditiveBlending, side: THREE.BackSide, depthWrite: false,
  }));
  const rim = new THREE.Mesh(new THREE.SphereGeometry(R * 1.012, 96, 48), new THREE.ShaderMaterial({
    uniforms: { uSun: atmo.material.uniforms.uSun },
    vertexShader: atmo.material.vertexShader,
    fragmentShader: `#include <logdepthbuf_pars_fragment>
uniform vec3 uSun; varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main(){
#include <logdepthbuf_fragment>
 float f = pow(1.0 - abs(dot(vN, vV)), 2.0); float day = smoothstep(-0.2, 0.5, dot(vW, uSun));
        gl_FragColor = vec4(vec3(0.3,0.6,1.0) * f * 0.9 * (0.15 + day), 1.0); }`,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  grp.add(surf, clouds, rim, atmo);
  return { group: grp, surf, clouds, rim, atmo };
}

export function starfield(n = 4000, r = 900) {
  const p = new Float32Array(n * 3), c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const u = Math.random() * 2 - 1, a = Math.random() * Math.PI * 2, s = Math.sqrt(1 - u * u);
    p[i * 3] = r * s * Math.cos(a); p[i * 3 + 1] = r * u; p[i * 3 + 2] = r * s * Math.sin(a);
    const w = 0.6 + Math.random() * 0.4, tint = Math.random();
    c[i * 3] = w * (tint > 0.8 ? 1 : 0.85); c[i * 3 + 1] = w * 0.9; c[i * 3 + 2] = w * (tint < 0.2 ? 1 : 0.95);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  pts.frustumCulled = false; return pts;
}
