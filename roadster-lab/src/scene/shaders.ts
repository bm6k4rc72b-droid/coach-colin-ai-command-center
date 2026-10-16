/** Shaders for VOLTFORGE: sky dome, x-ray rim, energy particles, thruster plume, anamorphic grade. */
import * as THREE from 'three';

export const SKY_VERT = /* glsl */ `
varying vec3 vP;
void main() { vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

export const SKY_FRAG = /* glsl */ `
uniform float uTime;
varying vec3 vP;
void main() {
  float h = vP.y;
  vec3 top = vec3(0.012, 0.012, 0.03);
  vec3 hz = vec3(0.09, 0.03, 0.08);
  vec3 col = mix(hz, top, smoothstep(-0.05, 0.6, h));
  // warm horizon band and a cold rim on the other side: studio cyclorama
  float ang = atan(vP.z, vP.x);
  col += vec3(0.5, 0.08, 0.12) * pow(max(0.0, 1.0 - abs(h) * 6.0), 3.0) * (0.5 + 0.5 * cos(ang));
  col += vec3(0.05, 0.25, 0.4) * pow(max(0.0, 1.0 - abs(h) * 7.0), 3.0) * (0.5 - 0.5 * cos(ang));
  gl_FragColor = vec4(col, 1.0);
}`;

/** Fresnel rim used for the x-ray view: edges glow, faces vanish. */
export function rimMaterial(color: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uAmount: { value: 0 }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main() {
        vec4 w = modelMatrix * vec4(position, 1.0);
        vW = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor; uniform float uAmount, uTime;
      varying vec3 vN; varying vec3 vV; varying vec3 vW;
      void main() {
        float f = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.4);
        float scan = smoothstep(0.03, 0.0, abs(fract(vW.x * 0.35 - uTime * 0.4) - 0.5) - 0.47);
        float grid = smoothstep(0.012, 0.0, abs(fract(vW.x * 4.0) - 0.5) - 0.488) + smoothstep(0.012, 0.0, abs(fract(vW.y * 4.0) - 0.5) - 0.488);
        float a = uAmount * (f * 0.42 + grid * 0.03 + scan * 0.18);
        gl_FragColor = vec4(uColor * a, 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.FrontSide,
  });
}

export const FLOW_VERT = /* glsl */ `
attribute float aSeed;
uniform float uTime, uSpeed, uSize;
varying float vA;
void main() {
  vA = 0.5 + 0.5 * sin(aSeed * 40.0 + uTime * 8.0);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = uSize * (1.0 + vA) * (10.0 / -mv.z);
}`;

export const FLOW_FRAG = /* glsl */ `
uniform vec3 uColor; uniform float uAmount;
varying float vA;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float d = dot(q, q);
  if (d > 0.25) discard;
  gl_FragColor = vec4(uColor * uAmount * (1.0 - d * 4.0) * (0.6 + vA), 1.0);
}`;

/** Cold-gas plume: a cone that brightens toward the nozzle and flickers. */
export function plumeMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { uAmount: { value: 0 }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uAmount, uTime; varying vec2 vUv;
      void main() {
        float along = vUv.y;                 // 1 at nozzle, 0 at the tip
        float ring = sin(along * 40.0 - uTime * 60.0) * 0.5 + 0.5;
        float edge = 1.0 - abs(vUv.x - 0.5) * 2.0;
        float a = uAmount * pow(along, 1.6) * (0.55 + 0.45 * ring) * smoothstep(0.0, 0.6, edge);
        vec3 c = mix(vec3(0.55, 0.75, 1.0), vec3(1.0), pow(along, 4.0));
        gl_FragColor = vec4(c * a, 1.0);
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/** Final grade: anamorphic streaks, chromatic fringe, teal/red split tone, vignette, grain, letterbox. */
export const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(1, 1) },
    uTime: { value: 0 },
    uBars: { value: 0 },
    uSpeed: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uTime, uBars, uSpeed;
    varying vec2 vUv;
    float lum(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      float aspect = uRes.x / uRes.y;
      vec2 d = vUv - 0.5;
      float r = length(d * vec2(aspect, 1.0));
      // radial speed blur at the edges when moving fast
      vec3 col = vec3(0.0);
      float blur = uSpeed * 0.018 * smoothstep(0.2, 0.9, r);
      for (int i = 0; i < 6; i++) {
        float k = float(i) / 5.0;
        vec2 uv = 0.5 + d * (1.0 - blur * k);
        float ca = 0.0025 * smoothstep(0.25, 0.9, r);
        col += vec3(texture2D(tDiffuse, uv + d * ca).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - d * ca).b);
      }
      col /= 6.0;
      // anamorphic blue streaks on highlights
      float s = 0.0;
      for (int i = -14; i <= 14; i++) {
        float fi = float(i);
        s += max(lum(texture2D(tDiffuse, vUv + vec2(fi * 0.013, 0.0)).rgb) - 0.75, 0.0) * exp(-abs(fi) * 0.17);
      }
      col += s * vec3(0.35, 0.65, 1.0) * 0.32;
      // split tone: teal shadows, warm-red highlights
      float l = lum(col);
      col += vec3(-0.01, 0.025, 0.04) * (1.0 - smoothstep(0.0, 0.4, l)) * smoothstep(0.0, 0.05, l);
      col *= mix(vec3(1.0), vec3(1.07, 0.97, 0.95), smoothstep(0.4, 1.0, l));
      col = mix(vec3(lum(col)), col, 1.12);
      col *= mix(1.0, 0.4, smoothstep(0.42, 0.95, r));
      col += (hash(vUv * uRes + fract(uTime) * 91.0) - 0.5) * 0.03;
      float barH = uBars * max(0.0, (1.0 - aspect / 2.39) * 0.5);
      col *= step(barH, vUv.y) * step(vUv.y, 1.0 - barH);
      gl_FragColor = vec4(col, 1.0);
    }`,
};
