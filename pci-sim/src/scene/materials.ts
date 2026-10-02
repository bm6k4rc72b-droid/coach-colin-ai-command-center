/**
 * Materials: X-ray attenuation (multiplicative, order-independent), contrast-filled vessels,
 * fluoro post-processing, and heartbeat injection for lit 3D materials.
 */
import * as THREE from 'three';
import { ATTENUATION, HEART } from '../config/anatomy';

/** Shared uniforms updated once per frame. */
export const sharedUniforms = {
  uBeatK: { value: 0 },
  uCentre: { value: new THREE.Vector3(...HEART.centre) },
  uClock: { value: 1e6 },
};

const XRAY_VERT = /* glsl */ `
uniform float uBeatK;
uniform vec3 uCentre;
#ifdef BEAT
attribute float aBeatW;
#endif
#ifdef VESSEL
attribute float aRadius;
attribute float aArrive;
attribute float aTail;
varying float vRadius;
varying float vArrive;
varying float vTail;
#endif
varying vec3 vN;
varying vec3 vV;
void main() {
  vec3 p = position;
  #ifdef BEAT
  p = uCentre + (p - uCentre) * (1.0 + uBeatK * aBeatW);
  #endif
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  vN = normalize(normalMatrix * normal);
  vV = normalize(-mv.xyz);
  #ifdef VESSEL
  vRadius = aRadius;
  vArrive = aArrive;
  vTail = aTail;
  #endif
  gl_Position = projectionMatrix * mv;
}
`;

const XRAY_FRAG = /* glsl */ `
uniform float uMu;
uniform float uSize;
uniform float uClock;
uniform float uIntensity;
uniform float uContrastMu;
uniform float uLinger;
varying vec3 vN;
varying vec3 vV;
#ifdef VESSEL
varying float vRadius;
varying float vArrive;
varying float vTail;
#endif
void main() {
  float c = abs(dot(normalize(vN), normalize(vV)));
  float path;
  #ifdef SHELL
  path = uSize / max(c, 0.14);
  #else
  path = uSize * c;
  #endif
  float mu = uMu;
  #ifdef VESSEL
  path = vRadius * c;
  float fill = smoothstep(vArrive - 0.05, vArrive + 0.06, uClock) *
               (1.0 - smoothstep(vTail + uLinger, vTail + uLinger + 0.7, uClock));
  mu += uContrastMu * uIntensity * fill;
  #endif
  float T = exp(-mu * path);
  gl_FragColor = vec4(vec3(T), 1.0);
}
`;

export interface XrayOptions {
  mu: number;
  /** Characteristic half-thickness (mm) for non-vessel shapes. */
  size?: number;
  beat?: boolean;
  vessel?: boolean;
  shell?: boolean;
}

export function xrayMaterial(o: XrayOptions): THREE.ShaderMaterial {
  const defines: Record<string, string> = {};
  if (o.beat) defines.BEAT = '';
  if (o.vessel) defines.VESSEL = '';
  if (o.shell) defines.SHELL = '';
  return new THREE.ShaderMaterial({
    vertexShader: XRAY_VERT,
    fragmentShader: XRAY_FRAG,
    defines,
    uniforms: {
      uBeatK: sharedUniforms.uBeatK,
      uCentre: sharedUniforms.uCentre,
      uClock: sharedUniforms.uClock,
      uMu: { value: o.mu },
      uSize: { value: o.size ?? 1 },
      uIntensity: { value: 0 },
      uContrastMu: { value: ATTENUATION.contrast },
      uLinger: { value: 0 },
    },
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.ZeroFactor,
    blendDst: THREE.SrcColorFactor,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
    transparent: true,
  });
}

/** Inject heartbeat displacement (attribute aBeatW) into a built-in lit material. */
export function withBeat<T extends THREE.Material>(m: T): T {
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uBeatK = sharedUniforms.uBeatK;
    shader.uniforms.uCentre = sharedUniforms.uCentre;
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        '#include <common>\nuniform float uBeatK;\nuniform vec3 uCentre;\nattribute float aBeatW;',
      )
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\ntransformed = uCentre + (transformed - uCentre) * (1.0 + uBeatK * aBeatW);',
      );
  };
  m.customProgramCacheKey = () => 'beat';
  return m;
}

/** Fluoro post-process: blur, gamma, quantum noise, vignette, square collimation. */
export function postMaterial(src: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      tSrc: { value: src },
      uSeed: { value: 0 },
      uNoise: { value: 0.05 },
      uTexel: { value: new THREE.Vector2(1 / 512, 1 / 512) },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tSrc;
      uniform float uSeed;
      uniform float uNoise;
      uniform vec2 uTexel;
      varying vec2 vUv;
      float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233)) + uSeed * 17.13) * 43758.5453); }
      void main() {
        float I = 0.0;
        I += texture2D(tSrc, vUv).r * 0.36;
        I += texture2D(tSrc, vUv + vec2(uTexel.x, 0.0)).r * 0.12;
        I += texture2D(tSrc, vUv - vec2(uTexel.x, 0.0)).r * 0.12;
        I += texture2D(tSrc, vUv + vec2(0.0, uTexel.y)).r * 0.12;
        I += texture2D(tSrc, vUv - vec2(0.0, uTexel.y)).r * 0.12;
        I += texture2D(tSrc, vUv + uTexel).r * 0.04;
        I += texture2D(tSrc, vUv - uTexel).r * 0.04;
        I += texture2D(tSrc, vUv + vec2(uTexel.x, -uTexel.y)).r * 0.04;
        I += texture2D(tSrc, vUv + vec2(-uTexel.x, uTexel.y)).r * 0.04;
        float g = 0.05 + 0.88 * pow(clamp(I, 0.0, 1.0), 0.8);
        float n = (hash(floor(vUv * 512.0)) - 0.5) * uNoise * (0.5 + 0.9 * sqrt(g));
        g += n;
        vec2 d = vUv - 0.5;
        float r = length(d);
        g *= 1.0 - smoothstep(0.33, 0.72, r) * 0.6;
        float edge = max(abs(d.x), abs(d.y));
        g = mix(g, 0.02, smoothstep(0.468, 0.472, edge));
        gl_FragColor = vec4(vec3(clamp(g, 0.0, 1.0)), 1.0);
      }
    `,
    depthTest: false,
    depthWrite: false,
  });
}

/** Plain textured screen quad (draws the held fluoro image into a viewport). */
export function blitMaterial(src: THREE.Texture): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { tSrc: { value: src }, uTint: { value: new THREE.Color(1, 1, 1) } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tSrc;
      uniform vec3 uTint;
      varying vec2 vUv;
      void main() { gl_FragColor = vec4(texture2D(tSrc, vUv).rgb * uTint, 1.0); }
    `,
    depthTest: false,
    depthWrite: false,
  });
}

/** Procedural stent strut alpha map (diamond cells). */
export function strutTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = '#fff';
  g.lineWidth = 7;
  g.lineJoin = 'round';
  for (let k = -1; k <= 1; k++) {
    g.beginPath();
    for (let i = 0; i <= 4; i++) {
      const x = i * 32 + k * 0;
      const y = i % 2 === 0 ? 8 : 56;
      if (i === 0) g.moveTo(x, y + k * 64);
      else g.lineTo(x, y + k * 64);
    }
    g.stroke();
  }
  // connectors
  g.lineWidth = 5;
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.moveTo(i * 32 + 16, 56);
    g.lineTo(i * 32 + 16, 72);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(3, 1);
  return tex;
}
