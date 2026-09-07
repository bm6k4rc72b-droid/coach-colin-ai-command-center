/**
 * Vera, drawn.
 *
 * A volumetric hologram of a standing woman on a lit dais, rendered as
 * horizontal scan strips through a silhouette profile rather than as a sprite
 * or a model. The technique is chosen for three reasons and they are all
 * practical: strips are what a projected hologram actually looks like, they
 * cost almost nothing to draw, and — because the silhouette is a function
 * rather than an image — her posture can be driven continuously by what the
 * console is doing, which a video loop of a presenter cannot be.
 *
 * That last point is the whole reason she is here rather than being a face in
 * a corner. When the belief rises she straightens and turns toward the
 * picture. When she asks whether somebody is all right she leans in. When she
 * speaks her light follows the real energy of the audio. None of that is
 * decoration: a person glancing at this console from across a room should be
 * able to read its state off her posture before they read a single number, and
 * that is the one job a receptionist has that a status chip cannot do.
 *
 * Her attire is drawn into the profile — a tailored blazer with structured
 * shoulders, a notched collar and a hairline gathered up — because at this
 * resolution clothing is silhouette. The only saturated colour that is not the
 * hologram's own is the champagne gold at her collar, which is the same gold
 * used everywhere in this interface to mean *this is the thing to look at*.
 *
 * @module aegis/hologram
 */

import { clamp, lerp } from './mathkit.js';

/**
 * Her silhouette, as half-widths up the body.
 *
 * Height runs 0 at the floor to 1 at the crown. The numbers are fractions of
 * her standing height, and the shape they describe is a tailored jacket: the
 * shoulder is squared rather than sloped, the waist is taken in, and the
 * jacket flares slightly at the hip where it is cut to.
 */
const PROFILE = Object.freeze([
  [0.000, 0.048], [0.018, 0.058], [0.040, 0.044], [0.130, 0.038],
  [0.250, 0.044], [0.360, 0.050], [0.440, 0.058], [0.500, 0.068],
  [0.545, 0.074], [0.585, 0.063], [0.635, 0.058], [0.690, 0.066],
  [0.745, 0.080], [0.785, 0.092], [0.812, 0.099], [0.828, 0.094],
  [0.842, 0.052], [0.862, 0.036], [0.882, 0.035], [0.898, 0.042],
  [0.928, 0.050], [0.958, 0.048], [0.978, 0.038], [0.992, 0.024],
  [1.000, 0.000],
]);

/** Where the shoulders are, in body height. */
const SHOULDER_Y = 0.812;

/** Where the collar sits. */
const COLLAR_Y = 0.845;

/** Below this height the silhouette is two legs, not one column. */
const HEM_Y = 0.455;

/** The poses she takes, as hand targets in body coordinates. */
const GESTURES = Object.freeze({
  idle: { left: [-0.115, 0.435], right: [0.115, 0.435], lean: 0, spread: 0 },
  greet: { left: [-0.125, 0.45], right: [0.215, 0.685], lean: 0.02, spread: 0.08 },
  explain: { left: [-0.215, 0.565], right: [0.215, 0.565], lean: 0.01, spread: 0.16 },
  point: { left: [-0.12, 0.45], right: [0.325, 0.645], lean: 0.03, spread: 0.12 },
  attend: { left: [-0.135, 0.44], right: [0.135, 0.44], lean: 0.06, spread: 0.04 },
  reassure: { left: [-0.075, 0.655], right: [0.145, 0.50], lean: 0.04, spread: 0.04 },
  alert: { left: [-0.255, 0.625], right: [0.255, 0.625], lean: 0.08, spread: 0.26 },
});

/** The palettes she can be lit in, by console level. */
const MOODS = Object.freeze({
  calm: { core: [176, 232, 255], edge: [126, 152, 255], glow: [46, 138, 200] },
  watching: { core: [206, 232, 255], edge: [150, 160, 255], glow: [70, 140, 210] },
  checking: { core: [255, 228, 176], edge: [255, 178, 96], glow: [190, 130, 40] },
  alarm: { core: [255, 202, 206], edge: [255, 110, 128], glow: [190, 46, 70] },
});

/** Champagne gold, the one accent colour in the whole interface. */
const GOLD = [232, 198, 106];

/**
 * Interpolate the silhouette's half-width at a height.
 *
 * @param {number} t Height up the body, 0–1.
 * @returns {number} Half-width as a fraction of standing height.
 */
export function halfWidth(t) {
  const y = clamp(t, 0, 1);
  for (let i = 1; i < PROFILE.length; i += 1) {
    if (y > PROFILE[i][0]) continue;
    const [y0, w0] = PROFILE[i - 1];
    const [y1, w1] = PROFILE[i];
    const span = y1 - y0;
    return span > 0 ? lerp(w0, w1, (y - y0) / span) : w1;
  }
  return 0;
}

/** A drifting mote of light in the hologram's field. */
class Mote {
  /** @param {() => number} random A source of randomness. */
  constructor(random) {
    this.reset(random, true);
    this.random = random;
  }

  /**
   * Place the mote.
   *
   * @param {() => number} random A source of randomness.
   * @param {boolean} anywhere Whether it may start part-way up.
   */
  reset(random, anywhere = false) {
    this.x = (random() - 0.5) * 0.9;
    this.y = anywhere ? random() * 1.25 : -0.05;
    this.speed = 0.03 + random() * 0.09;
    this.size = 0.6 + random() * 1.9;
    this.phase = random() * Math.PI * 2;
  }

  /**
   * Advance the mote.
   *
   * @param {number} dt Seconds since the last frame.
   */
  step(dt) {
    this.y += this.speed * dt;
    if (this.y > 1.28) this.reset(this.random);
  }
}

/**
 * The hologram, bound to a canvas.
 */
export class Hologram {
  /** @param {HTMLCanvasElement} canvas The canvas to draw into. */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.gesture = 'idle';
    this.target = GESTURES.idle;
    this.current = { ...GESTURES.idle, left: [...GESTURES.idle.left], right: [...GESTURES.idle.right] };
    this.mood = 'calm';
    this.palette = MOODS.calm;
    this.blend = { ...MOODS.calm };
    this.amplitude = 0;
    this.smoothAmplitude = 0;
    this.running = false;
    this.lastMs = 0;
    this.raf = 0;
    let seed = 20260907;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    this.motes = Array.from({ length: 44 }, () => new Mote(random));
    this.dpr = 1;
    this.width = 0;
    this.height = 0;
  }

  /**
   * Set her pose.
   *
   * @param {string} name One of the gesture names.
   */
  setGesture(name) {
    if (!GESTURES[name]) return;
    this.gesture = name;
    this.target = GESTURES[name];
  }

  /**
   * Set the light she is standing in.
   *
   * @param {string} level One of the console levels.
   */
  setMood(level) {
    this.mood = MOODS[level] ? level : 'calm';
    this.palette = MOODS[this.mood];
  }

  /**
   * Set how loudly she is speaking.
   *
   * @param {number} value Amplitude, 0–1.
   */
  setAmplitude(value) {
    this.amplitude = clamp(value, 0, 1);
  }

  /** Match the canvas to its box and the device pixel ratio. */
  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * dpr));
    const height = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.canvas.width = width;
    this.canvas.height = height;
    this.dpr = dpr;
    this.width = width;
    this.height = height;
  }

  /** Begin animating. */
  start() {
    if (this.running) return;
    this.running = true;
    this.lastMs = performance.now();
    const loop = (now) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.lastMs) / 1000);
      this.lastMs = now;
      this.render(now, dt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  /** Stop animating. */
  stop() {
    this.running = false;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
  }

  /**
   * Draw one frame.
   *
   * @param {number} nowMs The clock.
   * @param {number} dt Seconds since the previous frame.
   */
  render(nowMs, dt) {
    this.resize();
    const { ctx } = this;
    const w = this.width;
    const h = this.height;
    if (!w || !h) return;
    const t = nowMs / 1000;

    // Pose and palette are approached rather than snapped, so she moves
    // between states instead of teleporting between them.
    const ease = 1 - Math.exp(-dt * 4.5);
    for (const side of ['left', 'right']) {
      this.current[side][0] += (this.target[side][0] - this.current[side][0]) * ease;
      this.current[side][1] += (this.target[side][1] - this.current[side][1]) * ease;
    }
    this.current.lean += (this.target.lean - this.current.lean) * ease;
    this.current.spread += (this.target.spread - this.current.spread) * ease;
    for (const key of ['core', 'edge', 'glow']) {
      this.blend[key] = this.blend[key].map((value, i) => value + (this.palette[key][i] - value) * ease);
    }
    this.smoothAmplitude += (this.amplitude - this.smoothAmplitude) * (1 - Math.exp(-dt * 14));

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';

    // Layout: she stands on a dais near the bottom, about three quarters of
    // the panel's height.
    const floorY = h * 0.90;
    const bodyH = h * 0.74;
    const cx = w * 0.5;
    const speak = this.smoothAmplitude;
    const breathe = 1 + 0.006 * Math.sin(t * 1.05);
    const sway = Math.sin(t * 0.42) * bodyH * 0.004;

    this.paintGround(ctx, cx, floorY, bodyH, t, speak);
    ctx.globalCompositeOperation = 'lighter';
    this.paintBeam(ctx, cx, floorY, bodyH, speak);
    this.paintMotes(ctx, cx, floorY, bodyH, dt);
    this.paintFigure(ctx, cx + sway, floorY, bodyH * breathe, t, speak);
    ctx.globalCompositeOperation = 'source-over';
    this.paintScanlines(ctx, w, h, t);
  }

  /**
   * The dais and its pool of light.
   *
   * @param {CanvasRenderingContext2D} ctx The context.
   * @param {number} cx Centre column.
   * @param {number} floorY The floor row.
   * @param {number} bodyH Her height in pixels.
   * @param {number} t Seconds.
   * @param {number} speak Speech amplitude.
   */
  paintGround(ctx, cx, floorY, bodyH, t, speak) {
    const [gr, gg, gb] = this.blend.glow;
    const radius = bodyH * 0.34;
    const pool = ctx.createRadialGradient(cx, floorY, 0, cx, floorY, radius * 1.5);
    pool.addColorStop(0, `rgba(${gr | 0}, ${gg | 0}, ${gb | 0}, ${0.42 + speak * 0.22})`);
    pool.addColorStop(0.45, `rgba(${gr | 0}, ${gg | 0}, ${gb | 0}, 0.13)`);
    pool.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.save();
    ctx.translate(cx, floorY);
    ctx.scale(1, 0.26);
    ctx.translate(-cx, -floorY);
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.arc(cx, floorY, radius * 1.5, 0, Math.PI * 2);
    ctx.fill();
    // Three rings, breathing outward, one of them gold.
    for (let i = 0; i < 3; i += 1) {
      const phase = (t * 0.26 + i / 3) % 1;
      const r = radius * (0.55 + phase * 0.75);
      const fade = (1 - phase) * 0.5;
      const gold = i === 1;
      const [r0, g0, b0] = gold ? GOLD : this.blend.core;
      ctx.strokeStyle = `rgba(${r0 | 0}, ${g0 | 0}, ${b0 | 0}, ${fade * (gold ? 0.5 : 0.32)})`;
      ctx.lineWidth = Math.max(1, this.dpr * (gold ? 1.4 : 1));
      ctx.beginPath();
      ctx.arc(cx, floorY, r, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * The projection beam she stands in.
   *
   * @param {CanvasRenderingContext2D} ctx The context.
   * @param {number} cx Centre column.
   * @param {number} floorY The floor row.
   * @param {number} bodyH Her height in pixels.
   * @param {number} speak Speech amplitude.
   */
  paintBeam(ctx, cx, floorY, bodyH, speak) {
    const [r, g, b] = this.blend.glow;
    const top = floorY - bodyH * 1.22;
    const beam = ctx.createLinearGradient(0, top, 0, floorY);
    beam.addColorStop(0, `rgba(${r | 0}, ${g | 0}, ${b | 0}, 0)`);
    beam.addColorStop(1, `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${0.10 + speak * 0.05})`);
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(cx - bodyH * 0.10, top);
    ctx.lineTo(cx + bodyH * 0.10, top);
    ctx.lineTo(cx + bodyH * 0.42, floorY);
    ctx.lineTo(cx - bodyH * 0.42, floorY);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * The drifting field of light.
   *
   * @param {CanvasRenderingContext2D} ctx The context.
   * @param {number} cx Centre column.
   * @param {number} floorY The floor row.
   * @param {number} bodyH Her height in pixels.
   * @param {number} dt Seconds since the previous frame.
   */
  paintMotes(ctx, cx, floorY, bodyH, dt) {
    const [r, g, b] = this.blend.core;
    for (const mote of this.motes) {
      mote.step(dt);
      const x = cx + mote.x * bodyH * 0.5 + Math.sin(mote.phase + mote.y * 6) * bodyH * 0.012;
      const y = floorY - mote.y * bodyH;
      const fade = Math.sin(Math.min(1, mote.y / 1.28) * Math.PI) * 0.5;
      ctx.fillStyle = `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${fade})`;
      ctx.beginPath();
      ctx.arc(x, y, mote.size * this.dpr * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * Her, in scan strips.
   *
   * @param {CanvasRenderingContext2D} ctx The context.
   * @param {number} cx Centre column.
   * @param {number} floorY The floor row.
   * @param {number} bodyH Her height in pixels.
   * @param {number} t Seconds.
   * @param {number} speak Speech amplitude.
   */
  paintFigure(ctx, cx, floorY, bodyH, t, speak) {
    const step = Math.max(1.6, this.dpr * 1.9);
    const [cr, cg, cb] = this.blend.core;
    const [er, eg, eb] = this.blend.edge;
    const lean = this.current.lean;
    // The sweep is a brighter band travelling up her, which is the single
    // detail that makes a stack of strips read as a projection rather than as
    // a striped drawing.
    const sweep = (t * 0.19) % 1.35 - 0.15;

    for (let y = 0; y <= bodyH; y += step) {
      const body = y / bodyH;
      const half = halfWidth(body) * bodyH;
      if (half <= 0.2) continue;
      // Leaning pitches the upper body forward about the hip.
      const pitch = body > 0.5 ? (body - 0.5) * lean * bodyH * 1.6 : 0;
      const px = cx + pitch;
      const py = floorY - y;
      // Instability: each strip wanders a little, and harder while speaking.
      const wobble = Math.sin(t * 2.1 + body * 22) * (0.6 + speak * 2.6) * this.dpr * 0.5;
      const band = 0.74 + 0.26 * Math.sin(body * 90 - t * 2.6);
      const near = Math.exp(-((body - sweep) ** 2) / 0.004);
      const alpha = clamp(band * 0.30 + near * 0.55 + speak * 0.18, 0, 0.95);
      const mix = clamp(body * 1.1, 0, 1);
      const r = lerp(er, cr, mix);
      const g = lerp(eg, cg, mix);
      const b = lerp(eb, cb, mix);
      const top = py - step * 0.55;
      const tall = step * 0.9;
      const paint = (left, span) => {
        if (span <= 0.3) return;
        // Chromatic split, two strips a hair apart. Cheap, and it is what
        // stops the figure looking like flat vector art.
        ctx.fillStyle = `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${alpha})`;
        ctx.fillRect(left, top, span, tall);
        ctx.fillStyle = `rgba(${cr | 0}, ${cg | 0}, ${cb | 0}, ${alpha * 0.22})`;
        ctx.fillRect(left - this.dpr * 0.9, top, span, tall);
      };
      if (body < HEM_Y) {
        // Below the hem there are two legs. Drawn as one column she reads as a
        // pillar in a gown — which is a perfectly good hologram and the wrong
        // one: this console is watched by people judging whether somebody is
        // standing, and the receptionist should be legibly standing too.
        const gap = (1 - body / HEM_Y) ** 1.4 * half * 0.62;
        const legHalf = (half - gap) / 2;
        paint(px - half + wobble, legHalf * 2);
        paint(px + gap + wobble, legHalf * 2);
      } else {
        paint(px - half + wobble, half * 2);
      }
    }

    this.paintArms(ctx, cx, floorY, bodyH, t, speak);
    this.paintCollar(ctx, cx, floorY, bodyH, lean);
    this.paintFace(ctx, cx, floorY, bodyH, t, speak, lean);
  }

  /**
   * Her arms, which are what carry a gesture.
   *
   * @param {CanvasRenderingContext2D} ctx The context.
   * @param {number} cx Centre column.
   * @param {number} floorY The floor row.
   * @param {number} bodyH Her height in pixels.
   * @param {number} t Seconds.
   * @param {number} speak Speech amplitude.
   */
  paintArms(ctx, cx, floorY, bodyH, t, speak) {
    const [r, g, b] = this.blend.core;
    const shoulderHalf = halfWidth(SHOULDER_Y) * bodyH;
    for (const side of ['left', 'right']) {
      const sign = side === 'left' ? -1 : 1;
      const [hx, hy] = this.current[side];
      const sx = cx + sign * shoulderHalf * 0.80;
      const sy = floorY - SHOULDER_Y * bodyH;
      // Hands drift a little while she is talking, as people's do.
      const gesture = speak * Math.sin(t * 3.1 + (sign > 0 ? 0 : 1.7)) * 0.012;
      const ex = cx + (hx + gesture) * bodyH;
      const ey = floorY - (hy + gesture * 0.6) * bodyH;
      // The elbow is placed outboard of the straight line, which is the whole
      // difference between an arm and a stick.
      const mx = (sx + ex) / 2 + sign * bodyH * (0.035 + this.current.spread * 0.1);
      // Only a little droop. More than this and the elbow bows outward far
      // enough that the arm reads as hanging from a coat hook.
      const my = (sy + ey) / 2 + bodyH * 0.012;
      ctx.strokeStyle = `rgba(${r | 0}, ${g | 0}, ${b | 0}, 0.40)`;
      ctx.lineWidth = bodyH * 0.019;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(mx, my, ex, ey);
      ctx.stroke();
      ctx.fillStyle = `rgba(${r | 0}, ${g | 0}, ${b | 0}, 0.5)`;
      ctx.beginPath();
      ctx.arc(ex, ey, bodyH * 0.013, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /**
   * The notched collar and the one gold thing she wears.
   *
   * @param {CanvasRenderingContext2D} ctx The context.
   * @param {number} cx Centre column.
   * @param {number} floorY The floor row.
   * @param {number} bodyH Her height in pixels.
   * @param {number} lean How far forward she is leaning.
   */
  paintCollar(ctx, cx, floorY, bodyH, lean) {
    const y = floorY - COLLAR_Y * bodyH;
    const pitch = (COLLAR_Y - 0.5) * lean * bodyH * 1.6;
    const half = halfWidth(SHOULDER_Y) * bodyH;
    const [r, g, b] = this.blend.core;
    ctx.strokeStyle = `rgba(${r | 0}, ${g | 0}, ${b | 0}, 0.55)`;
    ctx.lineWidth = Math.max(1, this.dpr);
    ctx.beginPath();
    ctx.moveTo(cx + pitch - half * 0.72, y - bodyH * 0.012);
    ctx.lineTo(cx + pitch, y + bodyH * 0.055);
    ctx.lineTo(cx + pitch + half * 0.72, y - bodyH * 0.012);
    ctx.stroke();
    ctx.fillStyle = `rgba(${GOLD[0]}, ${GOLD[1]}, ${GOLD[2]}, 0.9)`;
    ctx.beginPath();
    ctx.arc(cx + pitch + half * 0.44, y + bodyH * 0.004, Math.max(1.4, bodyH * 0.009), 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * Not a face — a suggestion of one.
   *
   * Rendering eyes and a mouth at this scale lands squarely in the uncanny
   * valley and, worse, invites the viewer to read an expression that the
   * system has no business implying. What is drawn is the light that falls
   * where a face is, plus a band at the mouth that moves with the audio, so
   * she reads as speaking without ever appearing to emote.
   *
   * @param {CanvasRenderingContext2D} ctx The context.
   * @param {number} cx Centre column.
   * @param {number} floorY The floor row.
   * @param {number} bodyH Her height in pixels.
   * @param {number} t Seconds.
   * @param {number} speak Speech amplitude.
   * @param {number} lean How far forward she is leaning.
   */
  paintFace(ctx, cx, floorY, bodyH, t, speak, lean) {
    const faceY = floorY - 0.905 * bodyH;
    const pitch = (0.905 - 0.5) * lean * bodyH * 1.6;
    const x = cx + pitch;
    const [r, g, b] = this.blend.core;
    const glow = ctx.createRadialGradient(x, faceY, 0, x, faceY, bodyH * 0.075);
    glow.addColorStop(0, `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${0.30 + speak * 0.18})`);
    glow.addColorStop(1, `rgba(${r | 0}, ${g | 0}, ${b | 0}, 0)`);
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, faceY, bodyH * 0.075, 0, Math.PI * 2);
    ctx.fill();
    const mouth = bodyH * (0.004 + speak * 0.016);
    ctx.fillStyle = `rgba(${r | 0}, ${g | 0}, ${b | 0}, ${0.25 + speak * 0.45})`;
    ctx.fillRect(x - bodyH * 0.016, faceY + bodyH * 0.018 - mouth / 2, bodyH * 0.032, mouth);
  }

  /**
   * The scan grille over everything, and the vignette.
   *
   * @param {CanvasRenderingContext2D} ctx The context.
   * @param {number} w Canvas width.
   * @param {number} h Canvas height.
   * @param {number} t Seconds.
   */
  paintScanlines(ctx, w, h, t) {
    const gap = Math.max(2, this.dpr * 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.20)';
    const offset = (t * 14) % gap;
    for (let y = -gap + offset; y < h; y += gap * 2) ctx.fillRect(0, y, w, gap);
    const vignette = ctx.createRadialGradient(w / 2, h * 0.55, h * 0.16, w / 2, h * 0.55, h * 0.78);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.52)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
  }
}
