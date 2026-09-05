/**
 * The hero renderer.
 *
 * A hand-written WebGL2 scene: a holographic estate that assembles itself as
 * the page is scrolled, standing over a wireframe ocean, ringed with
 * instrument ticks and lit by drifting motes. Two programs do all of it — one
 * for additive lines, one for additive point sprites — which keeps the whole
 * renderer inside one file and one draw list.
 *
 * The camera is a pure function of scroll: `render(t)` places it, so scrubbing
 * up the page runs the shot backwards exactly. Nothing here holds animation
 * state except the clock used for shimmer.
 *
 * If WebGL2 is missing the stage reports failure and the page falls back to a
 * CSS gradient, which is why `start()` returns a boolean rather than throwing.
 *
 * @module jose-montes/stage
 */

import { buildEstate, buildMotes, buildOcean, buildRing } from './geometry.js';
import { approach, clamp, lookAt, mix, multiply, perspective, rotationY, smoothstep } from './mathkit.js';

const LINE_VERT = `#version 300 es
precision highp float;
in vec3 a_pos;
in vec2 a_meta;          // x: assembly order, y: intensity
uniform mat4 u_mvp;
uniform float u_time;
uniform float u_build;   // 0 = nothing drawn, 1 = fully assembled
uniform float u_swell;   // vertical amplitude of the water
uniform float u_glitch;
out float v_alpha;
void main() {
  vec3 p = a_pos;
  // Water rides a slow swell; the estate breathes a fraction of a millimetre.
  p.y += sin(p.x * 0.20 + u_time * 0.55) * u_swell
       + cos(p.z * 0.14 - u_time * 0.42) * u_swell * 0.6;
  p += u_glitch * vec3(
      sin(u_time * 13.0 + p.y * 5.0),
      cos(u_time * 11.0 + p.x * 4.0),
      sin(u_time * 17.0 + p.z * 3.0)) * 0.03;
  gl_Position = u_mvp * vec4(p, 1.0);

  // An edge appears once the build has passed its order, with a bright
  // leading crest so the assembly reads as drawing rather than fading in.
  float lead = clamp((u_build - a_meta.x) * 9.0, 0.0, 1.0);
  float crest = exp(-pow((u_build - a_meta.x) * 12.0 - 1.0, 2.0));
  float scan = 0.82 + 0.18 * sin(p.y * 2.6 - u_time * 1.7);
  v_alpha = a_meta.y * lead * scan + crest * 0.9;
}`;

const LINE_FRAG = `#version 300 es
precision highp float;
in float v_alpha;
uniform vec3 u_color;
uniform float u_opacity;
out vec4 outColor;
void main() {
  outColor = vec4(u_color, 1.0) * v_alpha * u_opacity;
}`;

const POINT_VERT = `#version 300 es
precision highp float;
in vec3 a_pos;
in vec2 a_seed;
uniform mat4 u_mvp;
uniform float u_time;
uniform float u_dpr;
uniform float u_size;
out float v_fade;
void main() {
  vec3 p = a_pos;
  float n = a_seed.x * 6.2831;
  p.x += sin(u_time * 0.20 + n) * 1.6;
  p.y += sin(u_time * 0.13 + n * 1.7) * 0.9 + mod(u_time * 0.25 * a_seed.y, 6.0) - 3.0;
  p.z += cos(u_time * 0.17 + n * 0.7) * 1.6;
  vec4 clip = u_mvp * vec4(p, 1.0);
  gl_Position = clip;
  float dist = max(clip.w, 0.5);
  gl_PointSize = clamp(u_size * u_dpr / dist, 0.7, 9.0);
  v_fade = (0.35 + 0.65 * sin(u_time * 0.9 + n * 4.0) * 0.5 + 0.5) * a_seed.y;
}`;

const POINT_FRAG = `#version 300 es
precision highp float;
in float v_fade;
uniform vec3 u_color;
uniform float u_opacity;
out vec4 outColor;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d);
  if (r > 0.25) discard;
  float core = exp(-r * 13.0);
  outColor = vec4(u_color, 1.0) * core * v_fade * u_opacity;
}`;

/**
 * Compile one shader stage.
 *
 * @param {WebGL2RenderingContext} gl Context.
 * @param {number} type Stage constant.
 * @param {string} source GLSL.
 * @returns {WebGLShader} The shader.
 */
function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`shader: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

/**
 * Link a program and index its uniforms and attributes.
 *
 * @param {WebGL2RenderingContext} gl Context.
 * @param {string} vert Vertex source.
 * @param {string} frag Fragment source.
 * @returns {{ program: WebGLProgram, u: Record<string, WebGLUniformLocation>, a: Record<string, number> }}
 *   The linked program with its locations.
 */
function link(gl, vert, frag) {
  const program = gl.createProgram();
  gl.attachShader(program, compile(gl, gl.VERTEX_SHADER, vert));
  gl.attachShader(program, compile(gl, gl.FRAGMENT_SHADER, frag));
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`link: ${gl.getProgramInfoLog(program)}`);
  }
  const u = {};
  const uniforms = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < uniforms; i += 1) {
    const name = gl.getActiveUniform(program, i).name;
    u[name] = gl.getUniformLocation(program, name);
  }
  const a = {};
  const attribs = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
  for (let i = 0; i < attribs; i += 1) {
    const name = gl.getActiveAttrib(program, i).name;
    a[name] = gl.getAttribLocation(program, name);
  }
  return { program, u, a };
}

/**
 * The holographic estate.
 */
export class Stage {
  /**
   * @param {HTMLCanvasElement} canvas Target canvas.
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = null;
    this.ok = false;
    this.time = 0;
    this.build = 0;
    this.target = { build: 0, orbit: 0, height: 0, dolly: 0 };
    this.camera = { orbit: 0, height: 0, dolly: 0 };
    this.pointer = { x: 0, y: 0 };
    this.tilt = { x: 0, y: 0 };
    this.quality = 1;
  }

  /**
   * Whether this browser can run the stage at all.
   *
   * @returns {boolean} Support flag.
   */
  static get supported() {
    try {
      const probe = document.createElement('canvas');
      return Boolean(probe.getContext('webgl2'));
    } catch {
      return false;
    }
  }

  /**
   * Build the scene. Safe to call once; returns false when unsupported.
   *
   * @returns {boolean} Whether the stage is running.
   */
  start() {
    const gl = this.canvas.getContext('webgl2', {
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
      failIfMajorPerformanceCaveat: false,
    });
    if (!gl) return false;
    this.gl = gl;

    try {
      this.lines = link(gl, LINE_VERT, LINE_FRAG);
      this.points = link(gl, POINT_VERT, POINT_FRAG);
    } catch {
      return false;
    }

    // A phone with a small logical viewport gets fewer motes; the geometry is
    // cheap but fill rate is not.
    const dense = Math.min(window.innerWidth, window.innerHeight) > 620;
    this.estate = this.#upload(buildEstate());
    this.ocean = this.#upload(buildOcean(dense ? 26 : 18, dense ? 30 : 20));
    this.ring = this.#upload(buildRing());
    this.motes = this.#uploadPoints(buildMotes(dense ? 900 : 420));

    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.disable(gl.DEPTH_TEST);
    this.ok = true;
    this.resize();
    return true;
  }

  /**
   * Upload a line list.
   *
   * @param {{ positions: Float32Array, order: Float32Array, count: number }} geo Geometry.
   * @returns {object} The VAO and count.
   */
  #upload(geo) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, geo.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this.lines.a.a_pos);
    gl.vertexAttribPointer(this.lines.a.a_pos, 3, gl.FLOAT, false, 0, 0);
    const metaBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, metaBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, geo.order, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this.lines.a.a_meta);
    gl.vertexAttribPointer(this.lines.a.a_meta, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return { vao, count: geo.count };
  }

  /**
   * Upload a point cloud.
   *
   * @param {{ positions: Float32Array, seeds: Float32Array, count: number }} geo Geometry.
   * @returns {object} The VAO and count.
   */
  #uploadPoints(geo) {
    const gl = this.gl;
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const posBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, geo.positions, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this.points.a.a_pos);
    gl.vertexAttribPointer(this.points.a.a_pos, 3, gl.FLOAT, false, 0, 0);
    const seedBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, seedBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, geo.seeds, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(this.points.a.a_seed);
    gl.vertexAttribPointer(this.points.a.a_seed, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return { vao, count: geo.count };
  }

  /**
   * Match the drawing buffer to the element, capped for fill rate.
   */
  resize() {
    if (!this.ok) return;
    const dpr = Math.min(window.devicePixelRatio || 1, this.quality > 0.7 ? 2 : 1.25);
    const width = Math.max(Math.round(this.canvas.clientWidth * dpr), 1);
    const height = Math.max(Math.round(this.canvas.clientHeight * dpr), 1);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.gl.viewport(0, 0, width, height);
    this.dpr = dpr;
  }

  /**
   * Set the scene from the scroll timeline.
   *
   * @param {number} t Scene progress, 0–1.
   */
  setProgress(t) {
    const p = clamp(t, 0, 1);
    // The estate assembles across the first two thirds; the camera keeps
    // moving after that, so the last third is a slow reveal of the whole.
    this.target.build = smoothstep(0, 0.68, p);
    this.target.orbit = mix(-0.62, 0.48, smoothstep(0, 1, p));
    this.target.height = mix(2.4, 9.5, smoothstep(0.1, 1, p));
    this.target.dolly = mix(46, 30, smoothstep(0, 0.85, p));
  }

  /**
   * Record where the pointer is, for the parallax lean.
   *
   * @param {number} x Normalised −1…1.
   * @param {number} y Normalised −1…1.
   */
  setPointer(x, y) {
    this.pointer.x = clamp(x, -1, 1);
    this.pointer.y = clamp(y, -1, 1);
  }

  /**
   * Record device tilt, for the same lean on a phone.
   *
   * @param {number} x Normalised −1…1.
   * @param {number} y Normalised −1…1.
   */
  setTilt(x, y) {
    this.tilt.x = clamp(x, -1, 1);
    this.tilt.y = clamp(y, -1, 1);
  }

  /**
   * Draw one frame.
   *
   * @param {number} dt Seconds since the previous frame.
   */
  render(dt) {
    if (!this.ok) return;
    const gl = this.gl;
    this.time += dt;

    this.build = approach(this.build, this.target.build, 0.999, dt);
    this.camera.orbit = approach(this.camera.orbit, this.target.orbit, 0.99, dt);
    this.camera.height = approach(this.camera.height, this.target.height, 0.99, dt);
    this.camera.dolly = approach(this.camera.dolly, this.target.dolly, 0.99, dt);

    const aspect = this.canvas.width / Math.max(this.canvas.height, 1);
    const lean = {
      x: this.pointer.x * 0.16 + this.tilt.x * 0.2,
      y: this.pointer.y * 0.1 + this.tilt.y * 0.12,
    };
    const angle = this.camera.orbit + lean.x;
    const eye = [
      Math.sin(angle) * this.camera.dolly,
      this.camera.height + 4 + lean.y * 4,
      Math.cos(angle) * this.camera.dolly,
    ];
    const view = lookAt(eye, [-2.5, 3.2, 0], [0, 1, 0]);
    const proj = perspective((aspect < 0.8 ? 62 : 46) * Math.PI / 180, aspect, 0.4, 400);
    const vp = multiply(proj, view);
    const mvp = multiply(vp, rotationY(this.time * 0.008));

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Water first, then the ring, then the building: back to front, because
    // additive blending has no depth test to sort it for us.
    this.#drawLines(this.ocean, mvp, [0.13, 0.58, 0.84], 1, 0.8, 0.16, 0);
    this.#drawLines(this.ring, mvp, [0.85, 0.68, 0.36], 1, 0.62, 0, 0);
    this.#drawLines(this.estate, mvp, [0.42, 0.86, 1.0], this.build, 0.95, 0.004, 0);

    gl.useProgram(this.points.program);
    gl.uniformMatrix4fv(this.points.u.u_mvp, false, mvp);
    gl.uniform1f(this.points.u.u_time, this.time);
    gl.uniform1f(this.points.u.u_dpr, this.dpr || 1);
    gl.uniform1f(this.points.u.u_size, 190);
    gl.uniform3f(this.points.u.u_color, 0.98, 0.86, 0.6);
    gl.uniform1f(this.points.u.u_opacity, 0.5);
    gl.bindVertexArray(this.motes.vao);
    gl.drawArrays(gl.POINTS, 0, this.motes.count);
    gl.bindVertexArray(null);
  }

  /**
   * Draw a frame and count the lit pixels in it.
   *
   * A drawing buffer is cleared once it has been presented, so reading it
   * from outside the frame returns nothing whatever was drawn. Reading it
   * here — immediately after the draw calls, inside the same frame — is the
   * only way a test can tell a working renderer from a blank one.
   *
   * @param {number} [threshold] Summed RGB above which a pixel counts as lit.
   * @returns {number} How many pixels are lit, or 0 when the stage is down.
   */
  probe(threshold = 40) {
    if (!this.ok) return 0;
    this.render(1 / 60);
    const gl = this.gl;
    const { width, height } = this.canvas;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let count = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i] + pixels[i + 1] + pixels[i + 2] > threshold) count += 1;
    }
    return count;
  }

  /**
   * Draw one line list.
   *
   * @param {object} mesh The uploaded mesh.
   * @param {Float32Array} mvp Model-view-projection.
   * @param {number[]} color RGB, 0–1.
   * @param {number} build Assembly progress for this mesh.
   * @param {number} opacity Overall opacity.
   * @param {number} swell Vertical displacement amplitude.
   * @param {number} glitch Holographic instability.
   */
  #drawLines(mesh, mvp, color, build, opacity, swell, glitch) {
    const gl = this.gl;
    gl.useProgram(this.lines.program);
    gl.uniformMatrix4fv(this.lines.u.u_mvp, false, mvp);
    gl.uniform1f(this.lines.u.u_time, this.time);
    gl.uniform1f(this.lines.u.u_build, build);
    gl.uniform1f(this.lines.u.u_swell, swell);
    gl.uniform1f(this.lines.u.u_glitch, glitch);
    gl.uniform3f(this.lines.u.u_color, color[0], color[1], color[2]);
    gl.uniform1f(this.lines.u.u_opacity, opacity);
    gl.bindVertexArray(mesh.vao);
    gl.drawArrays(gl.LINES, 0, mesh.count);
    gl.bindVertexArray(null);
  }
}
