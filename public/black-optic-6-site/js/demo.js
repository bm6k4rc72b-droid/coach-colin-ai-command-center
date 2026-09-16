/**
 * The demo — the product in the page, not a film of the product.
 *
 * Everything here imports the console's own modules. The palettes are the
 * console's palettes, the tracker is the console's CAMShift, the gain is the
 * console's auto-gain. If a behaviour changes in the console it changes here,
 * because there is no second copy to forget to update. A demo that reimplements
 * the product is a demo that eventually demonstrates something the product no
 * longer does.
 *
 * Two deliberate choices:
 *
 * - **It runs without a camera.** Most people meet a site like this on a phone,
 *   in a hurry, and will not grant a camera to something they have read two
 *   paragraphs of. So there is a synthetic scene — a procedurally lit vineyard
 *   at night with warm bodies moving through it — and the demo starts on that.
 *   Granting the camera swaps the source and changes nothing else.
 * - **The source badge never lies.** A palette over the synthetic scene or over
 *   your webcam is colouring *brightness*, so the readout says "% of scale" and
 *   the badge says MODELLED. It will say degrees when, and only when, a
 *   radiometric camera is feeding it. That is the console's rule and it is not
 *   relaxed for marketing.
 *
 * @module black-optic-6-site/demo
 */

import { PALETTES, SOURCES, rampTable, autoGain, luminanceField, render, spot, readout } from '../../black-optic-6/js/thermal.js';
import { ColourLock } from '../../black-optic-6/js/lock.js';
import { LOADS, TARGETS, load as loadFor, solve, scoreShot, perfectHold } from './range.js';

/**
 * A procedural night scene: cold ground, a warm engine block, a deer, a person.
 *
 * Generated as a luminance field directly rather than as a picture, because
 * that is what a thermal sensor hands you and it keeps the demo honest about
 * what is being coloured.
 */
export class SyntheticScene {
  constructor(width = 320, height = 180) {
    this.width = width;
    this.height = height;
    this.field = new Float32Array(width * height);
    this.bodies = [
      { x: 0.18, y: 0.72, r: 0.055, heat: 0.92, vx: 0.045, label: 'person', wobble: 0.02 },
      { x: 0.62, y: 0.80, r: 0.040, heat: 0.74, vx: -0.028, label: 'deer', wobble: 0.035 },
      { x: 0.80, y: 0.58, r: 0.070, heat: 0.66, vx: 0, label: 'engine block', wobble: 0 },
    ];
    this.t = 0;
  }

  /** Advance and return `{ field, width, height, source }` in the shape thermal.js wants. */
  step(dt = 1 / 30) {
    this.t += dt;
    const { width, height, field } = this;

    for (let y = 0; y < height; y += 1) {
      const v = y / height;
      // Ground is warmer than sky, and rows of vines run across it.
      const ground = 0.16 + v * 0.20;
      const rows = Math.sin(v * 46) * 0.018 * Math.min(1, v * 2.2);
      for (let x = 0; x < width; x += 1) {
        const u = x / width;
        const drift = Math.sin(u * 7 + this.t * 0.4) * 0.012;
        field[y * width + x] = ground + rows + drift;
      }
    }

    for (const body of this.bodies) {
      body.x += body.vx * dt;
      if (body.x < 0.08) { body.x = 0.08; body.vx = Math.abs(body.vx); }
      if (body.x > 0.92) { body.x = 0.92; body.vx = -Math.abs(body.vx); }
      const bobY = body.y + Math.sin(this.t * 3.1) * body.wobble;
      const cx = body.x * width;
      const cy = bobY * height;
      const r = body.r * height * 1.6;
      const x0 = Math.max(0, Math.floor(cx - r * 2));
      const x1 = Math.min(width, Math.ceil(cx + r * 2));
      const y0 = Math.max(0, Math.floor(cy - r * 3));
      const y1 = Math.min(height, Math.ceil(cy + r * 1.5));
      for (let y = y0; y < y1; y += 1) {
        for (let x = x0; x < x1; x += 1) {
          // Bodies are taller than wide — an isotropic blob reads as a lamp.
          const dx = (x - cx) / r;
          const dy = (y - cy) / (r * 2.1);
          const d2 = dx * dx + dy * dy;
          if (d2 > 4) continue;
          const falloff = Math.exp(-d2 * 1.4);
          const i = y * width + x;
          field[i] = Math.min(1, field[i] + body.heat * falloff);
        }
      }
    }

    return { field, width, height, source: SOURCES.LUMINANCE.id };
  }
}

/**
 * The thermal + tracking demo.
 *
 * Owns two canvases: the palette view and a small ramp strip. Call `attach`
 * with a `<video>` once a camera is granted; until then it draws the synthetic
 * scene. Everything else is identical between the two paths.
 */
export class ThermalDemo {
  constructor(canvas, { width = 320, height = 180 } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { willReadFrequently: true });
    this.width = width;
    this.height = height;
    canvas.width = width;
    canvas.height = height;

    this.scene = new SyntheticScene(width, height);
    this.video = null;
    this.grab = document.createElement('canvas');
    this.grab.width = width;
    this.grab.height = height;
    this.grabCtx = this.grab.getContext('2d', { willReadFrequently: true });

    this.palette = PALETTES[2];
    this.ramp = rampTable(this.palette);
    this.output = this.ctx.createImageData(width, height);
    this.lock = new ColourLock();
    this.locked = null;
    this.lockNote = '';
    this.cursor = null;
    this.last = 0;
    this.sourceId = SOURCES.LUMINANCE.id;
  }

  setPalette(id) {
    this.palette = PALETTES.find((p) => p.id === id) || PALETTES[0];
    this.ramp = rampTable(this.palette);
    return this.palette;
  }

  /** Swap to a live camera. The source stays LUMINANCE — a webcam is not a thermal camera. */
  attach(video) {
    this.video = video;
    this.sourceId = SOURCES.LUMINANCE.id;
  }

  detach() {
    this.video = null;
  }

  /** The current frame as ImageData, from whichever source is live. */
  frame() {
    if (this.video && this.video.readyState >= 2) {
      this.grabCtx.drawImage(this.video, 0, 0, this.width, this.height);
      return this.grabCtx.getImageData(0, 0, this.width, this.height);
    }
    return null;
  }

  /** Lock the colour tracker onto a box in field coordinates. */
  lockOn(box) {
    const visible = this.frame();
    if (!visible) {
      this.lockNote = 'Colour tracking needs a colour image — grant the camera and it locks on anything saturated.';
      return false;
    }
    const result = this.lock.lockOn(visible, box);
    this.lockNote = result.reason;
    this.locked = result.locked ? { ...box } : null;
    return result.locked;
  }

  clearLock() {
    this.lock.histogram = null;
    this.locked = null;
    this.lockNote = '';
  }

  /** One frame. Returns the readout so the caller can print it. */
  step(now = 0) {
    const dt = this.last ? Math.min((now - this.last) / 1000, 0.1) : 1 / 30;
    this.last = now;

    const visible = this.frame();
    const input = visible
      ? luminanceField(visible)
      : this.scene.step(dt);

    const gain = autoGain(input.field, { low: 0.02, high: 0.98 });
    render(input, this.output, { ramp: this.ramp, gain });
    this.ctx.putImageData(this.output, 0, 0);

    // Tracking runs on the visible frame — hue is what CAMShift needs, and the
    // palette view has thrown hue away by construction.
    let track = null;
    if (visible && this.lock.histogram) {
      track = this.lock.track(visible);
      if (track.box) {
        this.locked = track.box;
        this.drawBox(track.box, track.lost ? '#ff3b4e' : '#29e07f', track.confidence);
      }
    } else if (this.locked) {
      this.drawBox(this.locked, '#4fe8ff', 0);
    }

    let reading = null;
    if (this.cursor) {
      const sample = spot(input.field, input.width, Math.round(this.cursor.x), Math.round(this.cursor.y), 2);
      if (sample !== null) {
        // The readout wants where the sample sits on the *current scale*, not
        // the raw field value — that is what makes "% of scale" mean anything.
        reading = readout(this.sourceId, (sample - gain.low) / gain.span);
      }
      this.drawCrosshair(this.cursor);
    }

    return {
      gain,
      reading,
      track,
      source: SOURCES[this.sourceId] || SOURCES.LUMINANCE,
      live: Boolean(visible),
      palette: this.palette,
    };
  }

  drawBox(box, colour, confidence) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    // Corner brackets, not a full rectangle — a closed box hides the subject's edge.
    const c = Math.min(box.w, box.h) * 0.28;
    const corners = [
      [box.x, box.y, 1, 1], [box.x + box.w, box.y, -1, 1],
      [box.x, box.y + box.h, 1, -1], [box.x + box.w, box.y + box.h, -1, -1],
    ];
    for (const [x, y, sx, sy] of corners) {
      ctx.beginPath();
      ctx.moveTo(x + sx * c, y);
      ctx.lineTo(x, y);
      ctx.lineTo(x, y + sy * c);
      ctx.stroke();
    }
    if (confidence > 0) {
      ctx.fillStyle = colour;
      ctx.font = '8px ui-monospace, monospace';
      ctx.fillText(`${Math.round(confidence * 100)}%`, box.x, Math.max(8, box.y - 3));
    }
    ctx.restore();
  }

  drawCrosshair(point) {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(point.x - 6, point.y); ctx.lineTo(point.x - 2, point.y);
    ctx.moveTo(point.x + 2, point.y); ctx.lineTo(point.x + 6, point.y);
    ctx.moveTo(point.x, point.y - 6); ctx.lineTo(point.x, point.y - 2);
    ctx.moveTo(point.x, point.y + 2); ctx.lineTo(point.x, point.y + 6);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * The marksmanship trainer.
 *
 * A downrange view with steel at measured distance. You pick a load, a zero and
 * a wind, hold where you think the hit is, and the trainer tells you where the
 * bullet actually went and *why* — "low, not enough elevation for the drop"
 * rather than "miss". Then it shows the correct hold, which is the only part
 * that teaches anything.
 *
 * Static targets only. This is a range.
 */
export class RangeDemo {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.load = loadFor('308-175');
    this.target = TARGETS[2];
    this.zeroYd = 200;
    this.windMph = 8;
    this.windAngleDeg = 90;
    this.altitudeFt = 600;
    this.tempF = 72;
    this.aim = { x: 0, y: 0 };
    this.shot = null;
    this.revealed = false;
  }

  options() {
    return {
      zeroYd: this.zeroYd,
      windMph: this.windMph,
      windAngleDeg: this.windAngleDeg,
      altitudeFt: this.altitudeFt,
      tempF: this.tempF,
      sightHeight: 1.8,
    };
  }

  firing() {
    return solve(this.load, this.target.yards, this.options());
  }

  /** Inches across the drawn view. Wide enough to contain a bad wind call at 600. */
  viewInches() {
    return Math.max(this.target.diameterIn * 5, 48);
  }

  /** Take the shot at the current hold. */
  fire() {
    this.shot = scoreShot(this.load, this.target, this.aim, this.options());
    this.revealed = false;
    return this.shot;
  }

  reveal() {
    this.revealed = true;
    return perfectHold(this.load, this.target, this.options());
  }

  reset() {
    this.shot = null;
    this.revealed = false;
    this.aim = { x: 0, y: 0 };
  }

  /** Screen → inches at the target. */
  toInches(px, py) {
    const { width, height } = this.canvas;
    const span = this.viewInches();
    const perPx = span / width;
    return { x: (px - width / 2) * perPx, y: -(py - height / 2) * perPx };
  }

  draw() {
    const ctx = this.ctx;
    const { width, height } = this.canvas;
    const span = this.viewInches();
    const pxPerIn = width / span;
    const cx = width / 2;
    const cy = height / 2;

    ctx.clearRect(0, 0, width, height);

    // Sky, then the berm behind the plate. The berm matters: a plate floating
    // on a gradient has nothing to read its size against, and a range is one
    // of the few places where knowing how big the thing is *is* the task.
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#060d16');
    sky.addColorStop(0.58, '#0a151f');
    sky.addColorStop(1, '#060c0c');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    const bermY = height * 0.70;
    ctx.fillStyle = '#0b1410';
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(0, bermY + 10);
    ctx.quadraticCurveTo(width * 0.5, bermY - 14, width, bermY + 8);
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(120, 170, 205, 0.18)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, bermY + 10);
    ctx.quadraticCurveTo(width * 0.5, bermY - 14, width, bermY + 8);
    ctx.stroke();

    // The plate. Struck steel is brighter than anything behind it.
    const r = (this.target.diameterIn / 2) * pxPerIn;
    const face = ctx.createLinearGradient(cx, cy - r, cx, cy + r);
    face.addColorStop(0, '#3d5163');
    face.addColorStop(1, '#22323f');
    ctx.fillStyle = face;
    ctx.strokeStyle = 'rgba(190, 225, 245, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(10, 18, 26, 0.55)';
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.5, 0, Math.PI * 2);
    ctx.stroke();

    // Wind flag: direction and strength, because a number alone never sticks.
    const flagLen = Math.min(width * 0.18, 60) * Math.min(this.windMph / 15, 1.4);
    const dir = Math.sign(Math.sin((this.windAngleDeg * Math.PI) / 180)) || 1;
    ctx.strokeStyle = 'rgba(255,178,61,0.8)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(width * 0.10, height * 0.16);
    ctx.lineTo(width * 0.10 + dir * flagLen, height * 0.16);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,178,61,0.8)';
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(`${this.windMph} mph`, width * 0.10, height * 0.16 - 6);

    // The hold.
    const holdX = cx + this.aim.x * pxPerIn;
    const holdY = cy - this.aim.y * pxPerIn;
    ctx.strokeStyle = '#4fe8ff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(holdX - 10, holdY); ctx.lineTo(holdX + 10, holdY);
    ctx.moveTo(holdX, holdY - 10); ctx.lineTo(holdX, holdY + 10);
    ctx.stroke();

    // The shot.
    if (this.shot) {
      const ix = cx + this.shot.impactIn.x * pxPerIn;
      const iy = cy - this.shot.impactIn.y * pxPerIn;
      ctx.fillStyle = this.shot.hit ? '#29e07f' : '#ff3b4e';
      ctx.beginPath();
      ctx.arc(ix, iy, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = this.shot.hit ? 'rgba(41,224,127,0.5)' : 'rgba(255,59,78,0.45)';
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(holdX, holdY);
      ctx.lineTo(ix, iy);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (this.revealed) {
      const perfect = perfectHold(this.load, this.target, this.options());
      const px = cx + perfect.x * pxPerIn;
      const py = cy - perfect.y * pxPerIn;
      ctx.strokeStyle = '#ffb23d';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(px, py, 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = '#ffb23d';
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillText('correct hold', px + 10, py + 3);
    }

    // Scale bar — an inch reading with nothing to compare it to is a decoration.
    ctx.strokeStyle = 'rgba(150,200,225,0.35)';
    ctx.lineWidth = 1;
    const barIn = 12;
    const barPx = barIn * pxPerIn;
    const by = height - 14;
    ctx.beginPath();
    ctx.moveTo(14, by); ctx.lineTo(14 + barPx, by);
    ctx.moveTo(14, by - 4); ctx.lineTo(14, by + 4);
    ctx.moveTo(14 + barPx, by - 4); ctx.lineTo(14 + barPx, by + 4);
    ctx.stroke();
    ctx.fillStyle = 'rgba(150,200,225,0.6)';
    ctx.font = '9px ui-monospace, monospace';
    ctx.fillText(`${barIn}"`, 16 + barPx, by + 3);
  }
}

/** The loads and targets, re-exported so the page can build its pickers from one place. */
export { LOADS, TARGETS, PALETTES };
