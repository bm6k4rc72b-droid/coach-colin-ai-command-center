/**
 * Drawing — four panes, each showing one thing and admitting what it omits.
 *
 * The flight pane is a side elevation rather than a 3D view. That is a choice
 * about honesty as much as effort: a 3D render of a drone hovering is exactly the
 * image this app exists to be sceptical of, and a side elevation with the
 * commanded altitude drawn as a line makes the error visible as a distance
 * instead of as a vibe.
 *
 * All four panes are drawn from the same snapshot in the same frame, so nothing
 * on screen is ever from a different moment than anything else beside it.
 *
 * @module makecns-fly/render
 */

const COLOURS = {
  sensory: '#ffb457',
  proprio: '#58c6ff',
  inter: '#7c89a3',
  motor: '#c77dff',
  ink: '#e8edf6',
  dim: '#93a0b6',
  faint: '#64718a',
  line: '#1c2230',
  good: '#4ade80',
  bad: '#ff6b6b',
  accent: '#58c6ff',
};

/**
 * Size a canvas to its box at device resolution.
 *
 * @param {HTMLCanvasElement} canvas Target.
 * @returns {{ctx: CanvasRenderingContext2D, w: number, h: number}|null} Context and CSS-pixel size.
 */
export function prepare(canvas) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width < 2 || rect.height < 2) return null;
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const w = Math.round(rect.width);
  const h = Math.round(rect.height);
  if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
    canvas.width = w * dpr;
    canvas.height = h * dpr;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, w, h);
  return { ctx, w, h };
}

/**
 * Side elevation of the craft, its commanded altitude and its tilt.
 *
 * @param {HTMLCanvasElement} canvas Target.
 * @param {object} snapshot Loop snapshot.
 * @param {number} ceilingM Top of the drawn volume.
 */
export function drawFlight(canvas, snapshot, ceilingM = 2.2) {
  const prepared = prepare(canvas);
  if (!prepared) return;
  const { ctx, w, h } = prepared;
  const pad = 22;
  const groundY = h - pad;
  const topY = pad;
  const toY = (z) => groundY - (Math.max(0, Math.min(ceilingM, z)) / ceilingM) * (groundY - topY);

  // Altitude grid.
  ctx.font = '10px ui-monospace, monospace';
  ctx.textBaseline = 'middle';
  for (let z = 0; z <= ceilingM; z += 0.5) {
    const y = toY(z);
    ctx.strokeStyle = COLOURS.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad + 20, y);
    ctx.lineTo(w - pad, y);
    ctx.stroke();
    ctx.fillStyle = COLOURS.faint;
    ctx.textAlign = 'right';
    ctx.fillText(`${z.toFixed(1)}`, pad + 15, y);
  }

  // Ground.
  ctx.strokeStyle = COLOURS.dim;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(pad + 20, groundY);
  ctx.lineTo(w - pad, groundY);
  ctx.stroke();

  // Commanded altitude.
  const targetY = toY(snapshot.target);
  ctx.strokeStyle = COLOURS.accent;
  ctx.setLineDash([5, 4]);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(pad + 20, targetY);
  ctx.lineTo(w - pad, targetY);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = COLOURS.accent;
  ctx.textAlign = 'left';
  ctx.fillText(`commanded ${snapshot.target.toFixed(2)} m`, pad + 24, targetY - 9);

  // The craft.
  const state = snapshot.state;
  const cx = w * 0.55;
  const cy = toY(state.pos.z);
  const arm = Math.min(46, w * 0.13);
  const tilt = state.att.roll;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);

  ctx.strokeStyle = state.crashed ? COLOURS.bad : COLOURS.ink;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-arm, 0);
  ctx.lineTo(arm, 0);
  ctx.stroke();

  // Rotor thrust, drawn at the throttle actually commanded.
  const [front, right, back, left] = snapshot.command;
  const sides = [
    { x: -arm, u: left },
    { x: arm, u: right },
  ];
  for (const side of sides) {
    ctx.fillStyle = COLOURS.motor;
    ctx.fillRect(side.x - 9, -3, 18, 3);
    const lift = Math.max(0, Math.min(1, side.u)) * 26;
    const grad = ctx.createLinearGradient(0, -3, 0, -3 - lift);
    grad.addColorStop(0, 'rgba(199, 125, 255, 0.55)');
    grad.addColorStop(1, 'rgba(199, 125, 255, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(side.x - 5, -3 - lift, 10, lift);
  }
  ctx.fillStyle = state.crashed ? COLOURS.bad : COLOURS.ink;
  ctx.fillRect(-6, -5, 12, 10);
  ctx.restore();

  // The front/back pair cannot be drawn in a side elevation, so their throttles
  // are labelled rather than implied.
  ctx.textAlign = 'left';
  ctx.fillStyle = COLOURS.faint;
  // On its own line: at phone width this and the readout opposite would collide.
  ctx.fillText(`front ${front.toFixed(2)}  back ${back.toFixed(2)} (not shown side-on)`, pad + 24, topY + 20);

  ctx.textAlign = 'right';
  ctx.fillStyle = state.crashed ? COLOURS.bad : COLOURS.dim;
  const tiltDeg = (state.tiltRad * 57.2958).toFixed(0);
  ctx.fillText(
    state.crashed ? `crashed — ${state.crashReason}` : `${state.pos.z.toFixed(2)} m   tilt ${tiltDeg}°`,
    w - pad,
    topY + 6,
  );
}

/**
 * Raster plot of spikes, coloured by population, scrolling left.
 *
 * Rows are neurons, grouped by pool; columns are time. Only a subset of neurons
 * is drawn when the network is larger than the pane is tall, and the pane says so
 * rather than silently showing one neuron in eight.
 *
 * @param {HTMLCanvasElement} canvas Target.
 * @param {object} history Raster history from {@link createRasterBuffer}.
 */
export function drawRaster(canvas, history) {
  const prepared = prepare(canvas);
  if (!prepared) return;
  const { ctx, w, h } = prepared;
  const { columns, rows, pools } = history;
  if (!columns.length) return;

  const colW = w / history.capacity;
  const rowH = h / rows;
  ctx.globalAlpha = 0.95;
  for (let c = 0; c < columns.length; c += 1) {
    const x = c * colW;
    const column = columns[c];
    for (let i = 0; i < column.length; i += 1) {
      const row = column[i];
      ctx.fillStyle = COLOURS[pools[row]] ?? COLOURS.inter;
      ctx.fillRect(x, row * rowH, Math.max(1, colW), Math.max(1, rowH));
    }
  }
  ctx.globalAlpha = 1;

  // Pool boundaries, so the dark band of a silent pool is readable as a pool.
  ctx.strokeStyle = 'rgba(255,255,255,0.07)';
  ctx.lineWidth = 1;
  let previous = pools[0];
  for (let row = 1; row < rows; row += 1) {
    if (pools[row] === previous) continue;
    previous = pools[row];
    ctx.beginPath();
    ctx.moveTo(0, row * rowH);
    ctx.lineTo(w, row * rowH);
    ctx.stroke();
  }
}

/**
 * A scrolling raster buffer that samples neurons down to the rows available.
 *
 * @param {import('./connectome.js').Connectome} connectome Source network.
 * @param {number} [rows] How many neurons to display.
 * @param {number} [capacity] How many columns of history to keep.
 * @returns {object} A buffer with `push` and the fields {@link drawRaster} needs.
 */
export function createRasterBuffer(connectome, rows = 120, capacity = 260) {
  const index = new Int32Array(rows);
  const pools = new Array(rows);
  const rowOf = new Map();
  let cursor = 0;
  for (const name of ['sensory', 'proprio', 'inter', 'motor']) {
    const range = connectome.range(name);
    // Every pool gets at least a few rows, so an empty one is visibly empty.
    const share = Math.max(4, Math.round((range.size / connectome.count) * rows));
    const end = Math.min(rows, cursor + share);
    const stride = Math.max(1, Math.floor(range.size / Math.max(1, end - cursor)));
    for (let r = cursor; r < end; r += 1) {
      const neuron = range.start + (r - cursor) * stride;
      index[r] = Math.min(range.end - 1, neuron);
      pools[r] = name;
      rowOf.set(index[r], r);
    }
    cursor = end;
  }
  for (let r = cursor; r < rows; r += 1) {
    index[r] = index[cursor - 1] ?? 0;
    pools[r] = pools[cursor - 1] ?? 'inter';
  }

  return {
    rows,
    capacity,
    pools,
    columns: [],
    sampledFraction: rows / connectome.count,
    /**
     * Add one column from a set of spiking indices.
     *
     * @param {Int32Array} spikes Neurons that fired.
     */
    push(spikes) {
      const column = [];
      for (let i = 0; i < spikes.length; i += 1) {
        const row = rowOf.get(spikes[i]);
        if (row !== undefined) column.push(row);
      }
      this.columns.push(column);
      if (this.columns.length > capacity) this.columns.shift();
    },
    /** Empty the buffer. */
    clear() {
      this.columns = [];
    },
  };
}

/**
 * Altitude against command over time, with the phase shaded.
 *
 * @param {HTMLCanvasElement} canvas Target.
 * @param {Array<object>} history Loop history samples.
 * @param {number} ceilingM Top of the plot.
 */
export function drawTrace(canvas, history, ceilingM = 2.2) {
  const prepared = prepare(canvas);
  if (!prepared) return;
  const { ctx, w, h } = prepared;
  if (history.length < 2) return;
  const pad = 6;
  const toY = (z) => h - pad - (Math.max(0, Math.min(ceilingM, z)) / ceilingM) * (h - pad * 2);
  const toX = (i) => (i / (history.length - 1)) * w;

  // Phase bands — a result that includes supervised flight is not a result, so
  // the supervised part of the trace is shaded out.
  let start = 0;
  for (let i = 1; i <= history.length; i += 1) {
    const phase = history[Math.min(i, history.length - 1)].phase;
    if (i === history.length || phase !== history[start].phase) {
      const fill = history[start].phase === 'flying'
        ? 'rgba(74, 222, 128, 0.05)'
        : history[start].phase === 'training'
          ? 'rgba(255, 180, 87, 0.07)'
          : 'rgba(124, 137, 163, 0.06)';
      ctx.fillStyle = fill;
      ctx.fillRect(toX(start), 0, toX(i) - toX(start), h);
      start = i;
    }
  }

  ctx.lineWidth = 1.4;
  ctx.strokeStyle = COLOURS.accent;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  history.forEach((s, i) => (i ? ctx.lineTo(toX(i), toY(s.target)) : ctx.moveTo(toX(i), toY(s.target))));
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.strokeStyle = COLOURS.ink;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  history.forEach((s, i) => (i ? ctx.lineTo(toX(i), toY(s.z)) : ctx.moveTo(toX(i), toY(s.z))));
  ctx.stroke();
}

/**
 * Throttle bars: what the readout commanded, against what the teacher would have.
 *
 * Drawing both is the point. A readout that tracks the teacher is imitating a PD
 * controller well, which is a different achievement from flying.
 *
 * @param {HTMLCanvasElement} canvas Target.
 * @param {object} snapshot Loop snapshot.
 */
export function drawThrottles(canvas, snapshot) {
  const prepared = prepare(canvas);
  if (!prepared) return;
  const { ctx, w, h } = prepared;
  const names = ['front', 'right', 'back', 'left'];
  const pad = 10;
  const barH = (h - pad * 2) / 4;
  ctx.font = '10px ui-monospace, monospace';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < 4; i += 1) {
    const y = pad + i * barH;
    const track = w - 96;
    ctx.fillStyle = 'rgba(255,255,255,0.045)';
    ctx.fillRect(56, y + barH * 0.22, track, barH * 0.4);

    const teacher = Math.max(0, Math.min(1, snapshot.teacher[i] ?? 0));
    ctx.fillStyle = 'rgba(255, 180, 87, 0.5)';
    ctx.fillRect(56 + teacher * track - 1, y + barH * 0.12, 2, barH * 0.6);

    const value = Math.max(0, Math.min(1, snapshot.command[i] ?? 0));
    ctx.fillStyle = COLOURS.motor;
    ctx.fillRect(56, y + barH * 0.22, value * track, barH * 0.4);

    ctx.fillStyle = COLOURS.faint;
    ctx.textAlign = 'left';
    ctx.fillText(names[i], 8, y + barH * 0.42);
    ctx.fillStyle = COLOURS.ink;
    ctx.textAlign = 'right';
    ctx.fillText(value.toFixed(3), w - 6, y + barH * 0.42);
  }
}

/**
 * Paint the segmentation mask over the camera preview.
 *
 * @param {HTMLCanvasElement} canvas Target.
 * @param {object} masked Output of {@link module:makecns-fly/vision.skinMask}.
 * @param {object} metrics Output of {@link module:makecns-fly/vision.handMetrics}.
 */
export function drawMask(canvas, masked, metrics) {
  const prepared = prepare(canvas);
  if (!prepared) return;
  const { ctx, w, h } = prepared;
  const { mask, width, height } = masked;
  const sx = w / width;
  const sy = h / height;

  ctx.fillStyle = 'rgba(88, 198, 255, 0.55)';
  for (let y = 0; y < height; y += 1) {
    const row = y * width;
    let runStart = -1;
    for (let x = 0; x <= width; x += 1) {
      const on = x < width && mask[row + x] === 1;
      if (on && runStart < 0) runStart = x;
      else if (!on && runStart >= 0) {
        ctx.fillRect(runStart * sx, y * sy, (x - runStart) * sx, Math.max(1, sy));
        runStart = -1;
      }
    }
  }

  if (metrics?.box) {
    ctx.strokeStyle = metrics.confidence > 0.35 ? COLOURS.good : COLOURS.bad;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(metrics.box.x * sx, metrics.box.y * sy, metrics.box.width * sx, metrics.box.height * sy);
  }
}
