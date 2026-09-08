/**
 * The laboratory renderer.
 *
 * A hand-written WebGL2 scene: a hexagonal vault with a peptide helix on the
 * dais, a plinth of vials, ambient dust, and — when you open the map — the
 * knowledge graph replacing the room entirely. Three shader programs draw all
 * of it: additive point sprites, glowing lines, and a per-node-coloured point
 * program for the graph.
 *
 * The camera is the "travelling between sections" mechanic. Each deck owns a
 * waypoint; changing deck flies the camera there along an eased path rather
 * than cutting, so moving through the platform feels like moving through a
 * building. Drag orbits, pinch or scroll dollies, and device tilt parallaxes
 * the whole scene on top of whatever the camera is doing.
 *
 * The renderer is deliberately forgiving: without WebGL2 it reports failure and
 * the app falls back to a CSS-only backdrop rather than dying, and it watches
 * its own frame rate and drops resolution rather than frames.
 *
 * @module astra/lab
 */

import {
  buildGraphGeometry, buildHelix, buildMolecule, buildMotes, buildVault, buildVials, hexToRgb,
} from './geometry.js';
import {
  approach, clamp, identity, lookAt, multiply, perspective, rotationY, smoothstep, translation,
} from './mathkit.js';

const POINT_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec3 a_pos;
layout(location = 1) in vec2 a_seed;
uniform mat4 u_mvp;
uniform float u_time;
uniform float u_pulse;
uniform float u_size;
uniform float u_dpr;
uniform float u_drift;
out float v_fade;
void main() {
  vec3 p = a_pos;
  float n = a_seed.x * 6.2831;
  // Everything in the vault breathes. The drift uniform decides how much:
  // the helix shimmers, the vault dust barely moves.
  p += u_drift * vec3(
    sin(u_time * 1.3 + n) * 0.06,
    cos(u_time * 0.9 + n * 1.7) * 0.05,
    cos(u_time * 1.5 + n * 0.7) * 0.06);
  vec4 clip = u_mvp * vec4(p, 1.0);
  gl_Position = clip;
  float dist = max(clip.w, 0.4);
  gl_PointSize = clamp(u_size * a_seed.y * u_dpr / dist, 0.7, 34.0);
  float band = 0.72 + 0.28 * sin(p.y * 3.4 - u_time * 1.1);
  float flicker = 0.86 + 0.14 * sin(u_time * 7.0 + n * 12.0);
  v_fade = band * flicker * (1.0 + u_pulse * 0.9);
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
  float core = exp(-r * 13.0);
  outColor = vec4(u_color * (core * 1.4 + 0.1), 1.0) * v_fade * u_alpha * core;
}`;

const NODE_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec3 a_pos;
layout(location = 1) in vec2 a_seed;
layout(location = 2) in vec3 a_color;
uniform mat4 u_mvp;
uniform float u_time;
uniform float u_dpr;
uniform float u_size;
uniform vec3 u_focus;
uniform float u_focusStrength;
out vec3 v_color;
out float v_fade;
void main() {
  vec4 clip = u_mvp * vec4(a_pos, 1.0);
  gl_Position = clip;
  float dist = max(clip.w, 0.4);
  gl_PointSize = clamp(u_size * a_seed.y * u_dpr / dist, 1.2, 46.0);
  // Nodes near the focus point brighten, which is how the map answers
  // "where am I looking" without drawing a cursor.
  float near = 1.0 - smoothstep(0.0, 9.0, distance(a_pos, u_focus));
  v_color = a_color;
  v_fade = 0.55 + 0.45 * sin(u_time * 1.4 + a_seed.x * 20.0) + near * u_focusStrength * 1.6;
}`;

const NODE_FRAG = `#version 300 es
precision highp float;
in vec3 v_color;
in float v_fade;
uniform float u_alpha;
out vec4 outColor;
void main() {
  vec2 d = gl_PointCoord - 0.5;
  float r = dot(d, d);
  if (r > 0.25) discard;
  float core = exp(-r * 11.0);
  outColor = vec4(v_color * (core * 1.5 + 0.14), 1.0) * clamp(v_fade, 0.0, 2.4) * u_alpha * core;
}`;

const LINE_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec3 a_pos;
layout(location = 1) in float a_intensity;
uniform mat4 u_mvp;
uniform float u_time;
uniform float u_sweep;
out float v_i;
void main() {
  gl_Position = u_mvp * vec4(a_pos, 1.0);
  float pulse = 0.84 + 0.16 * sin(u_time * 1.2 + a_pos.y * 1.4 + a_pos.x * 0.25);
  // A slow vertical sweep travels up the room, which is the single cheapest
  // way to make a static wireframe feel powered rather than drawn.
  float sweep = smoothstep(0.4, 0.0, abs(fract(a_pos.y * 0.07 - u_time * 0.06) - 0.5)) * u_sweep;
  v_i = a_intensity * pulse + sweep * 0.5;
}`;

const LINE_FRAG = `#version 300 es
precision highp float;
in float v_i;
uniform vec3 u_color;
uniform float u_alpha;
out vec4 outColor;
void main() {
  outColor = vec4(u_color, 1.0) * clamp(v_i, 0.0, 2.0) * u_alpha;
}`;

/**
 * Compile a shader.
 *
 * @param {WebGL2RenderingContext} gl The context.
 * @param {number} type Shader type.
 * @param {string} source GLSL.
 * @returns {WebGLShader|null} The shader, or null on failure.
 */
function compile(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('[astra/lab] shader failed:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/**
 * Link a program and index its uniforms.
 *
 * @param {WebGL2RenderingContext} gl The context.
 * @param {string} vert Vertex source.
 * @param {string} frag Fragment source.
 * @returns {{ program: WebGLProgram, u: Record<string, WebGLUniformLocation> }|null} The program.
 */
function link(gl, vert, frag) {
  const vertex = compile(gl, gl.VERTEX_SHADER, vert);
  const fragment = compile(gl, gl.FRAGMENT_SHADER, frag);
  if (!vertex || !fragment) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('[astra/lab] link failed:', gl.getProgramInfoLog(program));
    return null;
  }
  const u = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i += 1) {
    const info = gl.getActiveUniform(program, i);
    u[info.name] = gl.getUniformLocation(program, info.name);
  }
  return { program, u };
}

/**
 * Upload a buffer.
 *
 * @param {WebGL2RenderingContext} gl The context.
 * @param {Float32Array} data The data.
 * @returns {WebGLBuffer} The buffer.
 */
function buffer(gl, data) {
  const handle = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, handle);
  gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
  return handle;
}

/**
 * Camera waypoints, one per deck.
 *
 * These are what make deck changes feel like travel. Each is an orbit position
 * around a look-at point; the renderer eases between them.
 */
export const WAYPOINTS = {
  intro: { target: [0, 3.4, 0], distance: 15.5, yaw: 0.5, pitch: 0.12, scene: 'vault' },
  engine: { target: [0, 3.2, 0], distance: 11.5, yaw: 0.2, pitch: 0.1, scene: 'vault' },
  graph: { target: [0, 0, 0], distance: 34, yaw: 0.6, pitch: 0.22, scene: 'graph' },
  compound: { target: [0, 3.6, 0], distance: 7.4, yaw: -0.4, pitch: 0.06, scene: 'molecule' },
  decoder: { target: [-9.5, 2.4, -1], distance: 8.5, yaw: -1.15, pitch: 0.16, scene: 'vault' },
  compare: { target: [9.5, 2.4, -1], distance: 8.5, yaw: 1.15, pitch: 0.16, scene: 'vault' },
  verify: { target: [0, 2.2, 4], distance: 9.5, yaw: 2.6, pitch: 0.2, scene: 'vault' },
  studio: { target: [-6, 3, 5], distance: 12, yaw: 3.3, pitch: 0.18, scene: 'vault' },
  command: { target: [0, 6.2, 0], distance: 17, yaw: 4.1, pitch: 0.44, scene: 'vault' },
};

/**
 * The laboratory.
 */
export class Lab {
  /**
   * @param {HTMLCanvasElement} canvas The canvas to draw into.
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ok = false;
    this.running = false;
    this.scene = 'vault';
    this.accent = hexToRgb('#5fd8ff');
    this.accentTarget = [...this.accent];
    this.pulse = 0;
    this.tilt = { x: 0, y: 0 };
    this.dpr = Math.min(2, globalThis.devicePixelRatio || 1);
    this.quality = 1;
    this.frames = [];
    this.reducedMotion = false;

    this.camera = { yaw: 0.5, pitch: 0.12, distance: 15.5, target: [0, 3.4, 0] };
    this.goal = { ...this.camera, target: [...this.camera.target] };
    // Lateral framing: pans the camera sideways so the subject sits clear of
    // whatever UI is over it — the entrance's copy on the left, the console's
    // panel on the right. Positive pans the camera right, moving the subject
    // left in frame.
    this.framing = 0;
    this.framingGoal = 0;
    this.drag = null;

    const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, powerPreference: 'high-performance' });
    if (!gl) return;
    this.gl = gl;

    this.pointProgram = link(gl, POINT_VERT, POINT_FRAG);
    this.lineProgram = link(gl, LINE_VERT, LINE_FRAG);
    this.nodeProgram = link(gl, NODE_VERT, NODE_FRAG);
    if (!this.pointProgram || !this.lineProgram || !this.nodeProgram) return;

    this.#buildScene();
    this.#bindInput();
    this.ok = true;
  }

  /** Generate and upload every buffer the vault needs. */
  #buildScene() {
    const gl = this.gl;
    const vault = buildVault();
    const helix = buildHelix();
    const vials = buildVials(4);
    const motes = buildMotes(760);
    const molecule = buildMolecule({ seed: 11 });

    this.geo = {
      vault: { buffer: buffer(gl, vault.positions), intensity: buffer(gl, vault.intensities), count: vault.count },
      helix: { buffer: buffer(gl, helix.backbone.positions), intensity: buffer(gl, helix.backbone.intensities), count: helix.backbone.count },
      helixAtoms: { buffer: buffer(gl, helix.atoms.positions), seeds: buffer(gl, helix.atoms.seeds), count: helix.atoms.count },
      vialGlass: { buffer: buffer(gl, vials.glass.positions), intensity: buffer(gl, vials.glass.intensities), count: vials.glass.count },
      vialFill: { buffer: buffer(gl, vials.contents.positions), seeds: buffer(gl, vials.contents.seeds), count: vials.contents.count },
      motes: { buffer: buffer(gl, motes.positions), seeds: buffer(gl, motes.seeds), count: motes.count },
      molecule: {
        atoms: { buffer: buffer(gl, molecule.atoms.positions), seeds: buffer(gl, molecule.atoms.seeds), count: molecule.atoms.count },
        bonds: { buffer: buffer(gl, molecule.bonds.positions), intensity: buffer(gl, molecule.bonds.intensities), count: molecule.bonds.count },
      },
    };
    this.graphGeo = null;
    this.focus = [0, 0, 0];
    this.focusStrength = 0;
  }

  /** Pointer and wheel handling: orbit and dolly. */
  #bindInput() {
    const canvas = this.canvas;
    canvas.style.touchAction = 'none';

    canvas.addEventListener('pointerdown', (event) => {
      this.drag = { x: event.clientX, y: event.clientY, id: event.pointerId };
      canvas.setPointerCapture(event.pointerId);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!this.drag || this.drag.id !== event.pointerId) return;
      const dx = event.clientX - this.drag.x;
      const dy = event.clientY - this.drag.y;
      this.drag.x = event.clientX;
      this.drag.y = event.clientY;
      this.goal.yaw -= dx * 0.005;
      this.goal.pitch = clamp(this.goal.pitch + dy * 0.004, -0.35, 1.1);
      this.userDriven = true;
    });
    const release = (event) => {
      if (this.drag?.id === event.pointerId) this.drag = null;
    };
    canvas.addEventListener('pointerup', release);
    canvas.addEventListener('pointercancel', release);
    canvas.addEventListener('wheel', (event) => {
      event.preventDefault();
      this.goal.distance = clamp(this.goal.distance * (1 + Math.sign(event.deltaY) * 0.08), 4, 60);
      this.userDriven = true;
    }, { passive: false });
  }

  /**
   * Fly the camera to a deck's waypoint.
   *
   * @param {string} deck Deck id, or a waypoint name.
   */
  goTo(deck) {
    const point = WAYPOINTS[deck] || WAYPOINTS.engine;
    this.goal.yaw = point.yaw;
    this.goal.pitch = point.pitch;
    this.goal.distance = point.distance;
    this.goal.target = [...point.target];
    this.userDriven = false;
    this.setScene(point.scene);
  }

  /**
   * Set the lateral framing offset.
   *
   * @param {number} offset World units. Positive moves the subject left in
   *   frame (clear of a right-hand panel); negative moves it right.
   */
  setFraming(offset) {
    this.framingGoal = offset;
  }

  /**
   * Switch what the vault is showing.
   *
   * @param {'vault'|'graph'|'molecule'} scene The scene.
   */
  setScene(scene) {
    this.scene = scene;
  }

  /**
   * Load a knowledge graph for the map scene.
   *
   * @param {{ nodes: Array<object>, edges: Array<object> }} graph A positioned graph.
   */
  setGraph(graph) {
    if (!this.ok) return;
    const gl = this.gl;
    const geometry = buildGraphGeometry(graph);
    this.graphGeo = {
      nodes: {
        buffer: buffer(gl, geometry.nodes.positions),
        seeds: buffer(gl, geometry.nodes.seeds),
        colors: buffer(gl, geometry.colors),
        count: geometry.nodes.count,
      },
      edges: { buffer: buffer(gl, geometry.edges.positions), intensity: buffer(gl, geometry.edges.intensities), count: geometry.edges.count },
    };
  }

  /**
   * Rebuild the centre molecule for a compound.
   *
   * @param {string} id Compound id — used only as a seed, so each compound has
   *   its own consistent shape.
   * @param {string} accent The compound's accent colour.
   */
  setCompound(id, accent) {
    if (!this.ok) return;
    const gl = this.gl;
    let seed = 7;
    for (const char of String(id || '')) seed = (seed * 31 + char.charCodeAt(0)) >>> 0;
    const molecule = buildMolecule({ seed, atoms: 52, scale: 2.7 });
    this.geo.molecule = {
      atoms: { buffer: buffer(gl, molecule.atoms.positions), seeds: buffer(gl, molecule.atoms.seeds), count: molecule.atoms.count },
      bonds: { buffer: buffer(gl, molecule.bonds.positions), intensity: buffer(gl, molecule.bonds.intensities), count: molecule.bonds.count },
    };
    if (accent) this.setAccent(accent);
  }

  /**
   * Set the room's accent colour, eased rather than snapped.
   *
   * @param {string} hex A `#rrggbb` colour.
   */
  setAccent(hex) {
    this.accentTarget = hexToRgb(hex);
  }

  /**
   * Flash the room — used on a rank-up, an unlock or a research drop.
   *
   * @param {number} [strength] How hard.
   */
  flash(strength = 1) {
    this.pulse = Math.min(2.4, this.pulse + strength);
  }

  /**
   * Feed the device tilt in.
   *
   * @param {{ x: number, y: number }} tilt Normalised tilt.
   */
  setTilt(tilt) {
    this.tilt = tilt;
  }

  /**
   * Move the graph's focus highlight.
   *
   * @param {number[]|null} position World position, or null to clear.
   */
  setFocus(position) {
    if (!position) {
      this.focusStrength = 0;
      return;
    }
    this.focus = position;
    this.focusStrength = 1;
  }

  /** Match the drawing buffer to the display, at the current quality. */
  #resize() {
    const width = Math.max(1, Math.floor(this.canvas.clientWidth * this.dpr * this.quality));
    const height = Math.max(1, Math.floor(this.canvas.clientHeight * this.dpr * this.quality));
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.gl.viewport(0, 0, width, height);
  }

  /**
   * Draw a point cloud.
   *
   * @param {object} geo A geometry record with `buffer`, `seeds` and `count`.
   * @param {Float32Array} mvp The matrix.
   * @param {object} options Draw options.
   */
  #drawPoints(geo, mvp, { color, alpha = 1, size = 90, drift = 1 }) {
    const gl = this.gl;
    const { program, u } = this.pointProgram;
    gl.useProgram(program);
    // Attribute 2 belongs to the node program only; leaving it enabled would
    // point this draw at a buffer of the wrong length.
    gl.disableVertexAttribArray(2);
    gl.bindBuffer(gl.ARRAY_BUFFER, geo.buffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, geo.seeds);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(u.u_mvp, false, mvp);
    gl.uniform1f(u.u_time, this.time);
    gl.uniform1f(u.u_pulse, this.pulse);
    gl.uniform1f(u.u_size, size);
    gl.uniform1f(u.u_dpr, this.dpr * this.quality);
    gl.uniform1f(u.u_drift, this.reducedMotion ? drift * 0.25 : drift);
    gl.uniform3fv(u.u_color, color);
    gl.uniform1f(u.u_alpha, alpha);
    gl.drawArrays(gl.POINTS, 0, geo.count);
  }

  /**
   * Draw a line list.
   *
   * @param {object} geo A geometry record with `buffer`, `intensity` and `count`.
   * @param {Float32Array} mvp The matrix.
   * @param {object} options Draw options.
   */
  #drawLines(geo, mvp, { color, alpha = 1, sweep = 1 }) {
    const gl = this.gl;
    const { program, u } = this.lineProgram;
    gl.useProgram(program);
    gl.disableVertexAttribArray(2);
    gl.bindBuffer(gl.ARRAY_BUFFER, geo.buffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, geo.intensity);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 1, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(u.u_mvp, false, mvp);
    gl.uniform1f(u.u_time, this.time);
    gl.uniform1f(u.u_sweep, this.reducedMotion ? 0 : sweep);
    gl.uniform3fv(u.u_color, color);
    gl.uniform1f(u.u_alpha, alpha);
    gl.drawArrays(gl.LINES, 0, geo.count);
  }

  /**
   * Draw the graph's nodes, each in its own colour.
   *
   * @param {Float32Array} mvp The matrix.
   * @param {number} alpha Opacity.
   */
  #drawNodes(mvp, alpha) {
    const gl = this.gl;
    const { program, u } = this.nodeProgram;
    const geo = this.graphGeo.nodes;
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, geo.buffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, geo.seeds);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, geo.colors);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);
    gl.uniformMatrix4fv(u.u_mvp, false, mvp);
    gl.uniform1f(u.u_time, this.time);
    gl.uniform1f(u.u_dpr, this.dpr * this.quality);
    gl.uniform1f(u.u_size, 170);
    gl.uniform3fv(u.u_focus, this.focus);
    gl.uniform1f(u.u_focusStrength, this.focusStrength);
    gl.uniform1f(u.u_alpha, alpha);
    gl.drawArrays(gl.POINTS, 0, geo.count);
  }

  /**
   * Advance and draw one frame.
   *
   * @param {number} dt Seconds since the last frame.
   */
  #frame(dt) {
    const gl = this.gl;
    this.time += dt;
    this.pulse = approach(this.pulse, 0, 2.2, dt);
    this.focusStrength = approach(this.focusStrength, 0, 0.7, dt);
    for (let i = 0; i < 3; i += 1) {
      this.accent[i] = approach(this.accent[i], this.accentTarget[i], 3, dt);
    }

    // Ease the camera toward its waypoint. A slow orbit continues when the
    // user is not dragging, so the room is never completely still.
    if (!this.drag && !this.userDriven && !this.reducedMotion) this.goal.yaw += dt * 0.028;
    this.camera.yaw = approach(this.camera.yaw, this.goal.yaw, 2.4, dt);
    this.camera.pitch = approach(this.camera.pitch, this.goal.pitch, 2.4, dt);
    this.camera.distance = approach(this.camera.distance, this.goal.distance, 2.2, dt);
    for (let i = 0; i < 3; i += 1) {
      this.camera.target[i] = approach(this.camera.target[i], this.goal.target[i], 2.2, dt);
    }

    this.#resize();
    const aspect = this.canvas.width / Math.max(1, this.canvas.height);

    // Tilt parallaxes the eye position rather than rotating the camera, which
    // reads as looking around a real volume instead of as a spinning scene.
    const tiltX = this.tilt.x * (this.reducedMotion ? 0.2 : 1);
    const tiltY = this.tilt.y * (this.reducedMotion ? 0.2 : 1);
    const yaw = this.camera.yaw + tiltX * 0.16;
    const pitch = clamp(this.camera.pitch + tiltY * 0.1, -0.4, 1.2);
    const distance = this.camera.distance;
    const eye = [
      this.camera.target[0] + Math.sin(yaw) * Math.cos(pitch) * distance,
      this.camera.target[1] + Math.sin(pitch) * distance + 1.4,
      this.camera.target[2] + Math.cos(yaw) * Math.cos(pitch) * distance,
    ];

    // Pan both eye and target along the camera's own right vector, which slides
    // the subject across the frame without rotating the scene.
    this.framing = approach(this.framing, this.framingGoal, 2.4, dt);
    const rightX = Math.cos(yaw);
    const rightZ = -Math.sin(yaw);
    const target = [
      this.camera.target[0] + rightX * this.framing,
      this.camera.target[1],
      this.camera.target[2] + rightZ * this.framing,
    ];
    eye[0] += rightX * this.framing;
    eye[2] += rightZ * this.framing;

    const projection = perspective(0.86, aspect, 0.1, 220);
    const view = lookAt(eye, target, [0, 1, 0]);
    const viewProjection = multiply(projection, view);

    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);
    gl.disable(gl.DEPTH_TEST);

    const cool = [0.32, 0.62, 0.95];
    const gold = [0.85, 0.71, 0.34];

    if (this.scene === 'graph' && this.graphGeo) {
      this.#drawLines(this.graphGeo.edges, viewProjection, { color: cool, alpha: 0.42, sweep: 0.4 });
      this.#drawNodes(viewProjection, 0.95);
    } else {
      this.#drawLines(this.geo.vault, viewProjection, { color: cool, alpha: 0.52, sweep: 1 });
      this.#drawPoints(this.geo.motes, viewProjection, { color: cool, alpha: 0.3, size: 46, drift: 0.4 });

      if (this.scene === 'molecule') {
        // The molecule floats where the helix normally stands.
        const model = multiply(translation(0, 3.6, 0), rotationY(this.time * 0.22));
        const mvp = multiply(viewProjection, model);
        this.#drawLines(this.geo.molecule.bonds, mvp, { color: this.accent, alpha: 0.95, sweep: 0.2 });
        // Bloom, the cheap way: the same cloud twice, once wide and soft and
        // once tight and bright. One extra draw call instead of a second
        // framebuffer, and on an additive pipeline it reads as real glow.
        this.#drawPoints(this.geo.molecule.atoms, mvp, { color: this.accent, alpha: 0.34, size: 380, drift: 0.35 });
        this.#drawPoints(this.geo.molecule.atoms, mvp, { color: [1, 1, 1], alpha: 0.8, size: 120, drift: 0.35 });
      } else {
        const spin = multiply(identity(), rotationY(this.time * 0.1));
        const mvp = multiply(viewProjection, spin);
        this.#drawLines(this.geo.helix, mvp, { color: this.accent, alpha: 1.15, sweep: 0.7 });
        this.#drawPoints(this.geo.helixAtoms, mvp, { color: this.accent, alpha: 0.3, size: 300, drift: 0.3 });
        this.#drawPoints(this.geo.helixAtoms, mvp, { color: [1, 1, 1], alpha: 0.7, size: 96, drift: 0.3 });
      }

      this.#drawLines(this.geo.vialGlass, viewProjection, { color: gold, alpha: 0.85, sweep: 0.5 });
      this.#drawPoints(this.geo.vialFill, viewProjection, { color: this.accent, alpha: 0.42, size: 190, drift: 0.5 });
      this.#drawPoints(this.geo.vialFill, viewProjection, { color: this.accent, alpha: 0.7, size: 62, drift: 0.5 });
    }
  }

  /** Start the render loop. */
  start() {
    if (!this.ok || this.running) return;
    this.running = true;
    this.time = 0;
    let last = performance.now();

    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // Adaptive quality: watch the rolling frame time and drop resolution
      // rather than frames, so a mid-range phone stays smooth.
      this.frames.push(dt);
      if (this.frames.length > 48) {
        this.frames.shift();
        const mean = this.frames.reduce((sum, value) => sum + value, 0) / this.frames.length;
        if (mean > 0.026 && this.quality > 0.55) {
          this.quality = Math.max(0.55, this.quality - 0.12);
          this.frames.length = 0;
        } else if (mean < 0.015 && this.quality < 1) {
          this.quality = Math.min(1, this.quality + 0.08);
          this.frames.length = 0;
        }
      }

      try {
        this.#frame(dt);
      } catch (error) {
        console.warn('[astra/lab] frame failed, stopping renderer:', error);
        this.running = false;
        return;
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  /** Stop the render loop. */
  stop() {
    this.running = false;
  }

  /**
   * Honour a reduced-motion preference.
   *
   * @param {boolean} reduced Whether to calm everything down.
   */
  setReducedMotion(reduced) {
    this.reducedMotion = Boolean(reduced);
  }
}

/** Exported for the tests and the intro's fallback backdrop. */
export { smoothstep };
