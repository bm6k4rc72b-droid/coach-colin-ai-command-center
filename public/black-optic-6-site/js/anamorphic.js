/**
 * The lens — what makes a frame look shot rather than rendered.
 *
 * "Anamorphic" is not a colour grade. It is a specific optical system: a
 * cylindrical element squeezes a 2.39:1 field onto a 4:3 negative, and the
 * projector unsqueezes it. Everything people love about the look is a side
 * effect of that squeeze happening to only one axis, and every one of those
 * side effects is reproducible in a shader if you know which axis it acts on:
 *
 * - **Bokeh is a vertical oval.** Out-of-focus highlights are circles on the
 *   negative, so unsqueezing stretches them horizontally — no. The squeeze is
 *   *horizontal* on capture, so a circle in the world lands as a horizontally
 *   compressed ellipse, and unsqueezing restores width while leaving the
 *   highlight taller than it is wide. Getting this backwards is the most common
 *   fake-anamorphic mistake on the internet.
 * - **Flares are horizontal streaks.** The cylindrical element has power in one
 *   axis only, so internal reflections smear along that axis. They are blue
 *   because the anti-reflective coatings on classic anamorphics reflect blue
 *   hardest.
 * - **Focus breathes and the edges distort.** Mustache distortion — barrel in
 *   the middle, pincushion at the corners — plus a horizontal-only softening at
 *   the frame edge.
 *
 * The functions here are the maths. `Backdrop` is a WebGL renderer that uses
 * them, and it degrades to a static gradient rather than failing if the context
 * is refused. The maths is separated out so it can be tested without a GPU.
 *
 * @module black-optic-6-site/anamorphic
 */

import { clamp01 } from './timeline.js';

/** Classic 2× squeeze. Panavision C-series, Lomo, Cooke — all 2×. */
export const SQUEEZE = 2;

/** The blue a coated anamorphic throws. Not cyan, not white. */
export const FLARE_RGB = Object.freeze([0.36, 0.68, 1]);

/**
 * Bokeh axes for an out-of-focus highlight.
 *
 * After desqueeze the highlight is taller than wide by the squeeze factor. A
 * 2× lens turns a 10 px circle into a 10 px tall, 5 px wide oval.
 */
export function bokehAxes(radius, squeeze = SQUEEZE) {
  const r = Math.max(radius, 0);
  return { rx: r / squeeze, ry: r, ratio: squeeze };
}

/**
 * Streak intensity at an offset from a flare source.
 *
 * Exponential falloff along the streak, Gaussian across it. `length` is the
 * half-life of the horizontal falloff in the same units as `dx`; `thickness`
 * is the Gaussian sigma vertically. Normalised so the source itself reads 1.
 */
export function streakIntensity(dx, dy, length = 0.4, thickness = 0.006) {
  if (!(length > 0) || !(thickness > 0)) return 0;
  const along = Math.exp(-Math.abs(dx) / length);
  const across = Math.exp(-(dy * dy) / (2 * thickness * thickness));
  return along * across;
}

/**
 * Mustache distortion: barrel near centre, pincushion at the corners.
 *
 * `k1` is positive for barrel, `k2` negative pulls the corners back out. Acts
 * on normalised coordinates centred on the frame.
 */
export function distort(x, y, k1 = 0.09, k2 = -0.035) {
  const r2 = x * x + y * y;
  const scale = 1 + k1 * r2 + k2 * r2 * r2;
  return { x: x * scale, y: y * scale };
}

/**
 * Chromatic aberration offset in normalised units.
 *
 * Lateral CA grows with distance from the optical axis and is strictly
 * radial — an aberration that is constant across the frame is a filter, not a
 * lens.
 */
export function aberration(x, y, strength = 0.0016) {
  const r = Math.hypot(x, y);
  if (r === 0) return { x: 0, y: 0, magnitude: 0 };
  const magnitude = strength * r * r;
  return { x: (x / r) * magnitude, y: (y / r) * magnitude, magnitude };
}

/**
 * Anamorphic vignette — an ellipse, not a circle.
 *
 * The squeeze means the illumination falloff is wider than it is tall in the
 * unsqueezed frame, so the corners of a 2.39 frame darken less than a round
 * vignette would suggest.
 */
export function vignette(x, y, squeeze = SQUEEZE, strength = 0.72) {
  const r = Math.hypot(x / squeeze, y);
  return clamp01(1 - strength * r * r);
}

/** Halation: bright areas bleed into the emulsion, warm and soft. */
export function halation(luma, threshold = 0.72, gain = 0.6) {
  const over = Math.max(luma - threshold, 0);
  return clamp01((over / Math.max(1 - threshold, 0.0001)) * gain);
}

/**
 * The shader. One full-screen triangle; everything is done in the fragment.
 *
 * Kept in this file rather than a `.glsl` so the whole lens — maths and
 * implementation — reads in one place.
 */
const FRAGMENT = `#version 100
precision highp float;

uniform vec2  uResolution;
uniform float uTime;
uniform float uProgress;   // 0..1 through the whole film
uniform float uScene;      // index of the active scene, for the palette shift
uniform float uEnergy;     // 0..1 how hot the frame should run
uniform vec3  uTint;

const float SQUEEZE = ${SQUEEZE.toFixed(1)};

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
             mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
}

float fbm(vec2 p) {
  float sum = 0.0;
  float amp = 0.5;
  for (int i = 0; i < 5; i++) {
    sum += amp * noise(p);
    p = p * 2.03 + vec2(17.3, 9.1);
    amp *= 0.5;
  }
  return sum;
}

// Horizontal streak: exponential along, gaussian across.
float streak(vec2 d, float len, float thick) {
  return exp(-abs(d.x) / len) * exp(-(d.y * d.y) / (2.0 * thick * thick));
}

void main() {
  vec2 frag = gl_FragCoord.xy / uResolution;
  vec2 uv = (frag - 0.5) * vec2(uResolution.x / uResolution.y, 1.0);

  // --- ground: a cold night with depth, not a flat wash -------------------
  float horizon = 0.02;
  float depth = clamp((horizon - uv.y) * 1.6 + 0.5, 0.0, 1.0);

  // Volumetric haze drifting across the frame. Stretched horizontally because
  // the squeeze stretches everything horizontally.
  vec2 hazeUv = vec2(uv.x * 0.42 + uTime * 0.012, uv.y * 1.1 - uTime * 0.006);
  float haze = fbm(hazeUv * 2.4);
  haze = pow(haze, 1.7);

  vec3 deepSky = vec3(0.012, 0.028, 0.048);
  vec3 nearGround = vec3(0.020, 0.034, 0.045);
  vec3 col = mix(deepSky, nearGround, depth);
  col += uTint * haze * (0.10 + 0.22 * uEnergy) * (1.0 - depth * 0.45);

  // --- practical lights: three sodium/ice sources that drift with scroll ---
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float sway = sin(uTime * (0.09 + fi * 0.035) + fi * 2.2) * 0.14;
    vec2 lp = vec2(-0.62 + fi * 0.64 + sway, horizon + 0.055 + sin(fi * 1.7) * 0.03);
    // Parallax: lights slide as the film advances.
    lp.x -= (uProgress - 0.5) * (0.28 + fi * 0.12);

    vec2 d = uv - lp;
    float core = exp(-dot(d, d) / 0.00022);
    float bloom = exp(-dot(d * vec2(1.0, SQUEEZE), d * vec2(1.0, SQUEEZE)) / 0.012);
    float flare = streak(d, 0.30 + 0.12 * uEnergy, 0.0055);

    vec3 lampTint = mix(vec3(0.36, 0.68, 1.0), vec3(1.0, 0.72, 0.36), step(1.5, fi));
    col += lampTint * (flare * (0.32 + 0.30 * uEnergy));
    col += lampTint * bloom * 0.16;
    col += vec3(1.0) * core * 0.9;
  }

  // --- anamorphic bokeh: vertical ovals, out of focus ---------------------
  for (int i = 0; i < 6; i++) {
    float fi = float(i);
    float seed = hash(vec2(fi, 3.0));
    vec2 bp = vec2(
      -0.8 + fract(seed * 7.13) * 1.6 - (uProgress - 0.5) * (0.5 + seed * 0.7),
      -0.34 + fract(seed * 3.77) * 0.62
    );
    vec2 d = (uv - bp) * vec2(SQUEEZE, 1.0);
    float r = length(d);
    float radius = 0.030 + seed * 0.026;
    // A real defocused highlight has a bright edge, not a soft gaussian.
    float disc = smoothstep(radius, radius * 0.82, r) * (0.55 + 0.45 * smoothstep(radius * 0.5, radius, r));
    col += vec3(0.30, 0.62, 0.95) * disc * (0.055 + 0.05 * uEnergy);
  }

  // --- scanline breath: the console's own refresh, barely there -----------
  col += vec3(0.02, 0.06, 0.08) * 0.35 * sin(frag.y * uResolution.y * 1.6 + uTime * 6.0) * 0.06;

  // --- vignette: elliptical, per the squeeze ------------------------------
  float vig = 1.0 - 0.72 * dot(vec2(uv.x / SQUEEZE, uv.y), vec2(uv.x / SQUEEZE, uv.y));
  col *= clamp(vig, 0.0, 1.0);

  // --- halation on anything already bright --------------------------------
  float luma = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col += vec3(0.28, 0.12, 0.05) * max(luma - 0.72, 0.0) * 0.6;

  // --- grain: per-frame, fine, and stronger in the shadows ----------------
  float grain = hash(frag * uResolution + fract(uTime) * 311.0) - 0.5;
  col += grain * (0.028 + 0.030 * (1.0 - luma));

  // Filmic toe so the blacks sit down instead of clipping.
  col = max(col, 0.0);
  col = col / (col + vec3(0.72)) * 1.18;

  gl_FragColor = vec4(col, 1.0);
}`;

const VERTEX = `#version 100
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`shader: ${log}`);
  }
  return shader;
}

/**
 * The live backdrop.
 *
 * Construct with a canvas; call `render(state)` once per frame. If WebGL is
 * unavailable — refused context, software blocklist, a browser in a locked-down
 * kiosk — `ok` is false and the caller paints the CSS fallback instead. The site
 * must still read at full quality without it, so nothing structural lives here.
 */
export class Backdrop {
  constructor(canvas) {
    this.canvas = canvas;
    this.ok = false;
    this.gl = null;
    try {
      const gl = canvas.getContext('webgl', {
        alpha: false, antialias: false, depth: false, powerPreference: 'high-performance',
      }) || canvas.getContext('experimental-webgl');
      if (!gl) return;
      const program = gl.createProgram();
      gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, VERTEX));
      gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, FRAGMENT));
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return;
      gl.useProgram(program);

      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      // One oversized triangle beats two quad triangles: no diagonal seam.
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(program, 'aPos');
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

      this.gl = gl;
      this.program = program;
      this.uniforms = {
        resolution: gl.getUniformLocation(program, 'uResolution'),
        time: gl.getUniformLocation(program, 'uTime'),
        progress: gl.getUniformLocation(program, 'uProgress'),
        scene: gl.getUniformLocation(program, 'uScene'),
        energy: gl.getUniformLocation(program, 'uEnergy'),
        tint: gl.getUniformLocation(program, 'uTint'),
      };
      this.ok = true;
    } catch {
      this.ok = false;
    }
  }

  resize(width, height, dpr = 1) {
    if (!this.ok) return;
    // Half-resolution is invisible on a full-screen haze field and roughly
    // quarters the fill cost, which is what keeps this at 60 on a phone.
    const scale = Math.min(dpr, 1.5) * 0.65;
    const w = Math.max(Math.round(width * scale), 2);
    const h = Math.max(Math.round(height * scale), 2);
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width = w;
    this.canvas.height = h;
    this.gl.viewport(0, 0, w, h);
  }

  render({ time = 0, progress = 0, scene = 0, energy = 0.4, tint = [0.16, 0.42, 0.62] } = {}) {
    if (!this.ok) return false;
    const gl = this.gl;
    gl.uniform2f(this.uniforms.resolution, this.canvas.width, this.canvas.height);
    gl.uniform1f(this.uniforms.time, time);
    gl.uniform1f(this.uniforms.progress, progress);
    gl.uniform1f(this.uniforms.scene, scene);
    gl.uniform1f(this.uniforms.energy, energy);
    gl.uniform3f(this.uniforms.tint, tint[0], tint[1], tint[2]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    return true;
  }
}
