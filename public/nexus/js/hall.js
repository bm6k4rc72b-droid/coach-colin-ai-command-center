/**
 * The command hall renderer.
 *
 * A hand-written WebGL2 scene: a holographic receptionist standing on a lit
 * dais inside a rotunda of curved display panels, or — in globe mode — a
 * wireframe Earth carrying live markers. Two shader programs do all of it,
 * one for additive point sprites and one for lines, which keeps the whole
 * renderer inside one file and one draw list.
 *
 * The renderer is deliberately forgiving: if WebGL2 is unavailable it reports
 * failure and the app falls back to a CSS-only backdrop rather than dying.
 *
 * @module nexus/hall
 */

import { buildEmitter, buildFigure, buildGlobe, buildHall, buildMotes } from './geometry.js';
import {
  approach, clamp, identity, latLonToVec3, lookAt, multiply,
  perspective, rotationX, rotationY, scaling, translation,
} from './mathkit.js';

const POINT_VERT = `#version 300 es
precision highp float;
in vec3 a_pos;
in vec2 a_seed;
uniform mat4 u_mvp;
uniform float u_time;
uniform float u_amp;
uniform float u_size;
uniform float u_dpr;
uniform float u_mode;
out float v_fade;
void main() {
  vec3 p = a_pos;
  if (u_mode > 0.5) {
    // Holographic instability: points drift along their own noise, harder
    // when the receptionist is speaking.
    float n = a_seed.x * 6.2831;
    float breathe = 1.0 + 0.010 * sin(u_time * 1.6 + p.y * 2.0);
    p.xz *= breathe;
    p += vec3(
      sin(u_time * 1.7 + n) * (0.0016 + u_amp * 0.010),
      cos(u_time * 1.3 + n * 1.7) * (0.0012 + u_amp * 0.006),
      cos(u_time * 1.9 + n * 0.7) * (0.0016 + u_amp * 0.010));
    p.y += sin(u_time * 0.9) * 0.012;
  }
  vec4 clip = u_mvp * vec4(p, 1.0);
  gl_Position = clip;
  float dist = max(clip.w, 0.3);
  gl_PointSize = clamp(u_size * u_dpr / dist, 0.6, 26.0);
  // Horizontal scan bands sweeping up the body, plus per-point flicker.
  float band = 0.74 + 0.26 * sin(p.y * 34.0 - u_time * 2.4);
  float sweep = smoothstep(0.32, 0.0, abs(fract(p.y * 0.30 - u_time * 0.11) - 0.5));
  float flicker = 0.82 + 0.18 * sin(u_time * 9.0 + a_seed.x * 40.0);
  v_fade = u_mode > 0.5
    ? clamp(band * 0.62 + sweep * 0.8 + 0.34, 0.0, 1.6) * flicker * (1.0 + u_amp * 0.7)
    : 0.55 + 0.45 * sin(u_time * 0.7 + a_seed.x * 20.0) * a_seed.y;
}`;

const POINT_FRAG = `#version 300 es
precision highp float;
in float v_fade;
uniform vec3 u_color;
uniform float u_alpha;
out vec4 outColor;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d);
  if (r > 0.25) discard;
  float core = exp(-r * 14.0);
  outColor = vec4(u_color * (core * 1.35 + 0.12), 1.0) * v_fade * u_alpha * core;
}`;

const LINE_VERT = `#version 300 es
precision highp float;
in vec3 a_pos;
in float a_intensity;
uniform mat4 u_mvp;
uniform float u_time;
out float v_i;
void main() {
  gl_Position = u_mvp * vec4(a_pos, 1.0);
  float pulse = 0.86 + 0.14 * sin(u_time * 1.4 + a_pos.y * 1.7 + a_pos.x * 0.3);
  v_i = a_intensity * pulse;
}`;

const LINE_FRAG = `#version 300 es
precision highp float;
in float v_i;
uniform vec3 u_color;
uniform float u_alpha;
out vec4 outColor;
void main() {
  outColor = vec4(u_color, 1.0) * v_i * u_alpha;
}`;

/**
 * Compile one shader stage.
 *
 * @param {WebGL2RenderingContext} gl Context.
 * @param {number} type `gl.VERTEX_SHADER` or `gl.FRAGMENT_SHADER`.
 * @param {string} source GLSL source.
 * @returns {WebGLShader} Compiled shader.
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
 * Link a program and index its uniforms.
 *
 * @param {WebGL2RenderingContext} gl Context.
 * @param {string} vert Vertex source.
 * @param {string} frag Fragment source.
 * @returns {{ program: WebGLProgram, u: Record<string, WebGLUniformLocation> }} Program handle.
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
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i += 1) {
    const info = gl.getActiveUniform(program, i);
    u[info.name] = gl.getUniformLocation(program, info.name);
  }
  const a = {};
  const attrs = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
  for (let i = 0; i < attrs; i += 1) {
    const info = gl.getActiveAttrib(program, i);
    a[info.name] = gl.getAttribLocation(program, info.name);
  }
  return { program, u, a };
}

/**
 * Upload a static float buffer.
 *
 * @param {WebGL2RenderingContext} gl Context.
 * @param {Float32Array} data Vertex data.
 * @param {number} usage Buffer usage hint.
 * @returns {WebGLBuffer} Buffer.
 */
function buffer(gl, data, usage) {
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, data, usage);
  return buf;
}

/** Marker palette, keyed by feed category. */
const MARKER_COLORS = {
  quake: [1.0, 0.42, 0.30],
  aircraft: [0.42, 0.92, 1.0],
  satellite: [0.72, 0.78, 1.0],
  launch: [1.0, 0.83, 0.38],
  threat: [1.0, 0.28, 0.42],
  station: [0.55, 1.0, 0.72],
};

/**
 * The hall scene.
 */
export class Hall {
  /**
   * @param {HTMLCanvasElement} canvas Target canvas.
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.gl = canvas.getContext('webgl2', {
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    this.ok = Boolean(this.gl);
    /** Camera and animation state. */
    this.state = {
      yaw: 0,
      pitch: 0.12,
      targetYaw: 0,
      targetPitch: 0.12,
      dist: 9.2,
      targetDist: 9.2,
      amp: 0,
      targetAmp: 0,
      mode: 'avatar',
      blend: 1,
      spin: 0,
      alert: 0,
      quality: 1,
    };
    this.markers = new Map();
    this.arcs = null;
    this.running = false;
    this.frameCount = 0;
    this.fps = 0;
    if (this.ok) this.#init();
  }

  /**
   * Build every static buffer and the two programs.
   */
  #init() {
    const gl = this.gl;
    const mobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent || '');
    const figureCount = mobile ? 8000 : 16000;
    this.state.quality = mobile ? 0.85 : 1;

    this.pointProgram = link(gl, POINT_VERT, POINT_FRAG);
    this.lineProgram = link(gl, LINE_VERT, LINE_FRAG);

    const figure = buildFigure(figureCount);
    this.figure = {
      pos: buffer(gl, figure.position, gl.STATIC_DRAW),
      seed: buffer(gl, figure.seed, gl.STATIC_DRAW),
      count: figure.count,
      height: figure.height,
    };

    const motes = buildMotes(mobile ? 900 : 2200);
    this.motes = {
      pos: buffer(gl, motes.position, gl.STATIC_DRAW),
      seed: buffer(gl, motes.seed, gl.STATIC_DRAW),
      count: motes.count,
    };

    const emitter = buildEmitter(mobile ? 1600 : 3200);
    this.emitter = {
      pos: buffer(gl, emitter.position, gl.STATIC_DRAW),
      seed: buffer(gl, emitter.seed, gl.STATIC_DRAW),
      count: emitter.count,
    };

    const hall = buildHall();
    this.hall = {
      pos: buffer(gl, hall.position, gl.STATIC_DRAW),
      intensity: buffer(gl, hall.intensity, gl.STATIC_DRAW),
      count: hall.count,
    };

    const globe = buildGlobe(2.35);
    this.globe = {
      pos: buffer(gl, globe.position, gl.STATIC_DRAW),
      intensity: buffer(gl, globe.intensity, gl.STATIC_DRAW),
      count: globe.count,
    };

    this.dynamicPos = gl.createBuffer();
    this.dynamicSeed = gl.createBuffer();
    this.arcPos = gl.createBuffer();
    this.arcIntensity = gl.createBuffer();

    gl.clearColor(0.012, 0.02, 0.031, 1);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.disable(gl.DEPTH_TEST);
    this.#bindInput();
  }

  /**
   * Wire pointer, wheel and gyroscope parallax.
   */
  #bindInput() {
    const canvas = this.canvas;
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    let pinch = 0;

    const down = (x, y) => { dragging = true; lastX = x; lastY = y; };
    const move = (x, y) => {
      if (!dragging) return;
      this.state.targetYaw += (x - lastX) * 0.006;
      this.state.targetPitch = clamp(this.state.targetPitch - (y - lastY) * 0.004, -0.35, 0.75);
      lastX = x;
      lastY = y;
    };
    const up = () => { dragging = false; };

    canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); down(e.clientX, e.clientY); });
    canvas.addEventListener('pointermove', (e) => move(e.clientX, e.clientY));
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.state.targetDist = clamp(this.state.targetDist + e.deltaY * 0.006, 3.2, 15);
    }, { passive: false });

    canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length !== 2) return;
      e.preventDefault();
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY,
      );
      if (pinch) this.state.targetDist = clamp(this.state.targetDist - (d - pinch) * 0.012, 3.2, 15);
      pinch = d;
    }, { passive: false });
    canvas.addEventListener('touchend', () => { pinch = 0; });

    // Gyroscope parallax, once permission has been granted by the shell.
    this.onOrientation = (e) => {
      if (dragging || e.gamma == null) return;
      this.state.targetYaw += clamp(e.gamma, -30, 30) * 0.00016;
      this.state.targetPitch = clamp(0.12 + clamp((e.beta ?? 45) - 45, -30, 30) * 0.004, -0.2, 0.6);
    };
  }

  /**
   * Enable device-orientation parallax (iOS needs an explicit grant).
   *
   * @returns {Promise<boolean>} Whether motion input is now active.
   */
  async enableMotion() {
    const api = window.DeviceOrientationEvent;
    if (!api) return false;
    try {
      if (typeof api.requestPermission === 'function') {
        const granted = await api.requestPermission();
        if (granted !== 'granted') return false;
      }
      window.addEventListener('deviceorientation', this.onOrientation);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Switch the centrepiece between the receptionist and the Earth.
   *
   * @param {'avatar'|'globe'} mode Scene mode.
   */
  setMode(mode) {
    if (mode === this.state.mode) return;
    this.state.mode = mode;
    this.state.targetDist = mode === 'globe' ? 9.6 : 9.2;
  }

  /**
   * Set the hologram's speaking energy, which drives brightness and jitter.
   *
   * @param {number} amp Amplitude in [0, 1].
   */
  setAmplitude(amp) {
    this.state.targetAmp = clamp(amp, 0, 1);
  }

  /**
   * Flash the room red — used when a live feed reports something severe.
   *
   * @param {number} [level] Intensity in [0, 1].
   */
  alert(level = 1) {
    this.state.alert = clamp(level, 0, 1);
  }

  /**
   * Replace the live marker set plotted on the globe.
   *
   * @param {Array<{ lat: number, lon: number, category: string, weight?: number }>} points Markers.
   */
  setMarkers(points) {
    const groups = new Map();
    for (const p of points) {
      if (!Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
      const key = MARKER_COLORS[p.category] ? p.category : 'threat';
      if (!groups.has(key)) groups.set(key, { pos: [], seed: [] });
      const g = groups.get(key);
      const alt = 2.35 * (1 + 0.012 + (p.weight ?? 0.3) * 0.10);
      const v = latLonToVec3(p.lat, p.lon, alt);
      g.pos.push(v[0], v[1], v[2]);
      g.seed.push(Math.random(), 0.6 + (p.weight ?? 0.4) * 0.4);
    }
    // Markers are replaced on every feed refresh, so the buffers behind the
    // previous set have to go back to the driver rather than be orphaned.
    for (const group of this.markers.values()) {
      if (!group.buffers) continue;
      this.gl.deleteBuffer(group.buffers.pos);
      this.gl.deleteBuffer(group.buffers.seed);
    }
    this.markers = groups;
  }

  /**
   * Draw great-circle arcs between marker pairs (attack paths, orbits).
   *
   * @param {Array<{ from: number[], to: number[] }>} pairs `[lat, lon]` pairs.
   */
  setArcs(pairs) {
    const pos = [];
    const tint = [];
    for (const { from, to } of pairs) {
      const steps = 24;
      let prev = null;
      for (let i = 0; i <= steps; i += 1) {
        const k = i / steps;
        const lat = from[0] + (to[0] - from[0]) * k;
        const lon = from[1] + (to[1] - from[1]) * k;
        const lift = 2.35 * (1 + 0.30 * Math.sin(k * Math.PI));
        const v = latLonToVec3(lat, lon, lift);
        if (prev) {
          pos.push(prev[0], prev[1], prev[2], v[0], v[1], v[2]);
          const glow = 0.35 + 0.65 * Math.sin(k * Math.PI);
          tint.push(glow, glow);
        }
        prev = v;
      }
    }
    this.arcs = pos.length
      ? { position: new Float32Array(pos), intensity: new Float32Array(tint), count: tint.length }
      : null;
    this.arcsDirty = true;
  }

  /**
   * Bind a points draw and issue it.
   *
   * @param {WebGLBuffer} posBuf Position buffer.
   * @param {WebGLBuffer} seedBuf Seed buffer.
   * @param {number} count Vertex count.
   * @param {number[]} color RGB.
   * @param {number} size Base point size.
   * @param {number} alpha Opacity multiplier.
   * @param {number} mode 1 for hologram behaviour, 0 for ambient.
   * @param {Float32Array} mvp Model-view-projection.
   */
  #drawPoints(posBuf, seedBuf, count, color, size, alpha, mode, mvp) {
    const gl = this.gl;
    const { program, u, a } = this.pointProgram;
    gl.useProgram(program);
    const aPos = a.a_pos;
    const aSeed = a.a_seed;
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, seedBuf);
    gl.enableVertexAttribArray(aSeed);
    gl.vertexAttribPointer(aSeed, 2, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(u.u_mvp, false, mvp);
    gl.uniform1f(u.u_time, this.time);
    gl.uniform1f(u.u_amp, this.state.amp);
    gl.uniform1f(u.u_size, size);
    gl.uniform1f(u.u_dpr, this.dpr);
    gl.uniform1f(u.u_mode, mode);
    gl.uniform3fv(u.u_color, color);
    gl.uniform1f(u.u_alpha, alpha);
    gl.drawArrays(gl.POINTS, 0, count);
  }

  /**
   * Bind a line-list draw and issue it.
   *
   * @param {WebGLBuffer} posBuf Position buffer.
   * @param {WebGLBuffer} intensityBuf Intensity buffer.
   * @param {number} count Vertex count.
   * @param {number[]} color RGB.
   * @param {number} alpha Opacity multiplier.
   * @param {Float32Array} mvp Model-view-projection.
   */
  #drawLines(posBuf, intensityBuf, count, color, alpha, mvp) {
    if (!count || alpha <= 0.001) return;
    const gl = this.gl;
    const { program, u, a } = this.lineProgram;
    gl.useProgram(program);
    const aPos = a.a_pos;
    const aI = a.a_intensity;
    gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, intensityBuf);
    gl.enableVertexAttribArray(aI);
    gl.vertexAttribPointer(aI, 1, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(u.u_mvp, false, mvp);
    gl.uniform1f(u.u_time, this.time);
    gl.uniform3fv(u.u_color, color);
    gl.uniform1f(u.u_alpha, alpha);
    gl.drawArrays(gl.LINES, 0, count);
  }

  /**
   * Resize the drawing buffer to the display size, with a DPR cap so phones
   * stay above 30 fps.
   */
  #resize() {
    const cap = window.innerWidth < 820 ? 2 : 2.5;
    this.dpr = Math.min(window.devicePixelRatio || 1, cap) * this.state.quality;
    const w = Math.floor(this.canvas.clientWidth * this.dpr);
    const h = Math.floor(this.canvas.clientHeight * this.dpr);
    if (w && h && (this.canvas.width !== w || this.canvas.height !== h)) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
  }

  /**
   * Render one frame.
   *
   * @param {number} dt Seconds since the previous frame.
   */
  #frame(dt) {
    const gl = this.gl;
    const s = this.state;
    this.#resize();

    s.yaw = approach(s.yaw, s.targetYaw, 4, dt);
    s.pitch = approach(s.pitch, s.targetPitch, 4, dt);
    s.dist = approach(s.dist, s.targetDist, 4, dt);
    s.amp = approach(s.amp, s.targetAmp, 12, dt);
    s.targetAmp *= Math.exp(-2.4 * dt);
    s.blend = approach(s.blend, s.mode === 'avatar' ? 1 : 0, 3, dt);
    s.spin += dt * 0.06;
    s.alert = Math.max(0, s.alert - dt * 0.35);
    s.targetYaw += dt * 0.012;

    const aspect = this.canvas.width / Math.max(1, this.canvas.height);
    const proj = perspective(0.85, aspect, 0.1, 120);
    const eyeY = 1.55 + Math.sin(s.pitch) * s.dist;
    const eye = [
      Math.sin(s.yaw) * Math.cos(s.pitch) * s.dist,
      eyeY,
      Math.cos(s.yaw) * Math.cos(s.pitch) * s.dist,
    ];
    const view = lookAt(eye, [0, 1.85, 0], [0, 1, 0]);
    const viewProj = multiply(proj, view, identity());

    gl.clear(gl.COLOR_BUFFER_BIT);

    const alertTint = s.alert;
    const roomColor = [0.83 * (1 - alertTint) + alertTint, 0.68 * (1 - alertTint) + 0.16 * alertTint, 0.28 * (1 - alertTint) + 0.22 * alertTint];
    this.#drawLines(this.hall.pos, this.hall.intensity, this.hall.count, roomColor, 0.62, viewProj);

    this.#drawPoints(this.motes.pos, this.motes.seed, this.motes.count,
      [0.55, 0.78, 0.95], 34, 0.30, 0, viewProj);

    // The dais emitter — the light the receptionist is standing in. It brightens
    // with her voice, which is what ties the figure to the room.
    if (s.blend > 0.01) {
      this.#drawPoints(this.emitter.pos, this.emitter.seed, this.emitter.count,
        [0.30, 0.72, 1.0], 90, 0.30 * s.blend * (1 + s.amp * 1.6), 0, viewProj);
    }

    // Receptionist: two passes — a wide soft halo, then a tight core. That
    // fakes bloom without a second framebuffer.
    if (s.blend > 0.01) {
      const model = multiply(
        translation(0, 0.34, 0),
        multiply(rotationY(Math.sin(this.time * 0.25) * 0.22), scaling(1.5, 1.5, 1.5), identity()),
        identity(),
      );
      const mvp = multiply(viewProj, model, identity());
      const glow = [0.35, 0.78, 1.0];
      this.#drawPoints(this.figure.pos, this.figure.seed, this.figure.count,
        glow, 210, 0.10 * s.blend * (1 + s.amp), 1, mvp);
      this.#drawPoints(this.figure.pos, this.figure.seed, this.figure.count,
        [0.66, 0.93, 1.0], 62, 0.42 * s.blend, 1, mvp);
    }

    // Earth: spins slowly, carrying whatever the feeds last reported.
    if (s.blend < 0.99) {
      const model = multiply(
        translation(0, 2.4, 0),
        multiply(rotationY(s.spin), rotationX(0.32), identity()),
        identity(),
      );
      const mvp = multiply(viewProj, model, identity());
      const alpha = (1 - s.blend) * 0.85;
      this.#drawLines(this.globe.pos, this.globe.intensity, this.globe.count,
        [0.30, 0.72, 0.95], alpha, mvp);

      if (this.arcsDirty && this.arcs) {
        gl.bindBuffer(gl.ARRAY_BUFFER, this.arcPos);
        gl.bufferData(gl.ARRAY_BUFFER, this.arcs.position, gl.DYNAMIC_DRAW);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.arcIntensity);
        gl.bufferData(gl.ARRAY_BUFFER, this.arcs.intensity, gl.DYNAMIC_DRAW);
        this.arcsDirty = false;
      }
      if (this.arcs) {
        this.#drawLines(this.arcPos, this.arcIntensity, this.arcs.count,
          [1.0, 0.35, 0.45], alpha * (0.55 + 0.45 * Math.sin(this.time * 2)), mvp);
      }

      for (const [category, group] of this.markers) {
        if (!group.buffers) {
          group.buffers = {
            pos: buffer(gl, new Float32Array(group.pos), gl.DYNAMIC_DRAW),
            seed: buffer(gl, new Float32Array(group.seed), gl.DYNAMIC_DRAW),
          };
        }
        this.#drawPoints(group.buffers.pos, group.buffers.seed, group.pos.length / 3,
          MARKER_COLORS[category], 150, alpha * 0.9, 0, mvp);
      }
    }

    this.frameCount += 1;
  }

  /**
   * Start the render loop. Pauses automatically while the tab is hidden.
   */
  start() {
    if (!this.ok || this.running) return;
    this.running = true;
    this.time = 0;
    let last = performance.now();
    let fpsAccum = 0;
    let fpsFrames = 0;
    const tick = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!document.hidden) {
        this.time += dt;
        try {
          this.#frame(dt);
        } catch (err) {
          this.running = false;
          console.error('hall render failed', err);
          return;
        }
        fpsAccum += dt;
        fpsFrames += 1;
        if (fpsAccum >= 0.5) {
          this.fps = Math.round(fpsFrames / fpsAccum);
          fpsAccum = 0;
          fpsFrames = 0;
          // Drop resolution rather than frames on weak hardware.
          if (this.fps < 26 && this.state.quality > 0.6) this.state.quality -= 0.1;
        }
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  /** Stop the render loop. */
  stop() {
    this.running = false;
  }
}
