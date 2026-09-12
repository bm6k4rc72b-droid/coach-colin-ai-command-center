/**
 * Finding a smoke column in a camera frame, on the device, without a model.
 *
 * There is no trained detector in this file and it does not pretend otherwise.
 * What it has is the set of properties that distinguish a smoke column from the
 * rest of a landscape, measured directly: smoke is **grey** (it has almost no
 * colour saturation), it is **soft** (its edges have low gradient energy — it
 * has no texture of its own and blurs what is behind it), it **persists** (it
 * is in the same part of the frame ten seconds later, unlike a bird or a
 * vehicle), and it **rises and grows** (its region extends upward over time).
 *
 * Each of those is individually weak. A grey wall is grey. A fog bank is soft.
 * A cloud persists. Taken together and required simultaneously they are much
 * stronger, and — this is the part that matters — each one can be *reported
 * separately*, so when the app raises a candidate it can say which properties
 * it found and which it did not. "Grey and soft and persistent, but not rising"
 * is a sentence an operator can weigh. A confidence score of 0.71 is not.
 *
 * ## The failure that eats naive smoke detectors
 *
 * Automatic exposure. The moment anything bright or dark enters frame — the sun
 * off a windscreen, a cloud crossing, the fire itself — the camera re-exposes
 * and *every pixel in the frame changes at once*. A detector built on frame
 * differencing sees the entire image light up and reports smoke everywhere,
 * usually at exactly the moment something real is happening. So the first thing
 * {@link analyseFrame} does is estimate and remove the global brightness shift,
 * and if the shift is large it says so and lowers its own confidence rather
 * than reporting the artefact.
 *
 * ## What this is for
 *
 * A bearing. Not a detection, not an alarm, not a fire. The output feeds
 * {@link module:emberline/triangulate}, where two of these from two positions
 * become a location — and where the fact that a camera sees *smoke*, which
 * leans downwind of the fire that made it, is handled explicitly.
 *
 * @module emberline/smoke
 */

/** Cell size of the analysis grid, pixels. Coarse on purpose: smoke has no fine detail. */
export const CELL = 16;

/** Global brightness shift past which a frame is treated as an exposure event. */
export const EXPOSURE_SHIFT_LIMIT = 12;

/**
 * Reduce a frame to a grid of cell statistics.
 *
 * Working on a grid rather than on pixels is not only for speed. A single pixel
 * cannot be soft or textureless — those are properties of a neighbourhood — and
 * the smallest smoke column worth acting on covers many cells at any useful
 * range.
 *
 * @param {{data: Uint8ClampedArray|number[], width: number, height: number}} frame RGBA image data.
 * @param {number} [cell=CELL] Cell size in pixels.
 * @returns {{cols: number, rows: number, cell: number, luma: Float64Array,
 *   saturation: Float64Array, gradient: Float64Array, meanLuma: number}}
 *   Per-cell mean luminance, mean saturation and mean gradient magnitude.
 */
export function gridStats(frame, cell = CELL) {
  const { data, width, height } = frame;
  const cols = Math.max(1, Math.floor(width / cell));
  const rows = Math.max(1, Math.floor(height / cell));
  const luma = new Float64Array(cols * rows);
  const saturation = new Float64Array(cols * rows);
  const gradient = new Float64Array(cols * rows);

  for (let cy = 0; cy < rows; cy += 1) {
    for (let cx = 0; cx < cols; cx += 1) {
      let sumL = 0;
      let sumS = 0;
      let sumG = 0;
      let count = 0;
      const x0 = cx * cell;
      const y0 = cy * cell;
      for (let y = y0; y < y0 + cell && y < height; y += 1) {
        for (let x = x0; x < x0 + cell && x < width; x += 1) {
          const i = (y * width + x) * 4;
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];
          const l = 0.299 * r + 0.587 * g + 0.114 * b;
          const max = Math.max(r, g, b);
          const min = Math.min(r, g, b);
          sumL += l;
          // Saturation as (max - min) / max: the fraction of the brightness
          // that is colour. Smoke sits near zero at any brightness, which is
          // what makes it separable from vegetation, sky and rock.
          sumS += max > 0 ? (max - min) / max : 0;
          if (x + 1 < width && y + 1 < height) {
            const ix = ((y * width) + x + 1) * 4;
            const iy = (((y + 1) * width) + x) * 4;
            const lx = 0.299 * data[ix] + 0.587 * data[ix + 1] + 0.114 * data[ix + 2];
            const ly = 0.299 * data[iy] + 0.587 * data[iy + 1] + 0.114 * data[iy + 2];
            sumG += Math.abs(lx - l) + Math.abs(ly - l);
          }
          count += 1;
        }
      }
      const index = cy * cols + cx;
      luma[index] = count ? sumL / count : 0;
      saturation[index] = count ? sumS / count : 0;
      gradient[index] = count ? sumG / count : 0;
    }
  }

  let meanLuma = 0;
  for (let i = 0; i < luma.length; i += 1) meanLuma += luma[i];
  meanLuma /= Math.max(1, luma.length);

  return { cols, rows, cell, luma, saturation, gradient, meanLuma };
}

/**
 * Compare a frame against a reference, and mark the cells that look like smoke.
 *
 * @param {object} current Grid from {@link gridStats} for the live frame.
 * @param {object} reference Grid from {@link gridStats} for the background.
 * @returns {{cells: Array<{cx: number, cy: number, score: number, dLuma: number}>,
 *   exposureShift: number, exposureSuspect: boolean, changedFraction: number}}
 *   Candidate cells with the exposure diagnosis that qualifies them.
 */
export function markCandidates(current, reference) {
  // The global brightness shift is the median of the per-cell changes, not the
  // mean: a real smoke column changes a minority of cells a lot, and a mean
  // would let the column itself contaminate the estimate of the shift being
  // removed — the detector would subtract away the thing it is looking for.
  const deltas = new Float64Array(current.luma.length);
  for (let i = 0; i < deltas.length; i += 1) deltas[i] = current.luma[i] - reference.luma[i];
  const exposureShift = median(deltas);
  const exposureSuspect = Math.abs(exposureShift) > EXPOSURE_SHIFT_LIMIT;

  const cells = [];
  let changed = 0;
  for (let cy = 0; cy < current.rows; cy += 1) {
    for (let cx = 0; cx < current.cols; cx += 1) {
      const i = cy * current.cols + cx;
      const dLuma = current.luma[i] - reference.luma[i] - exposureShift;
      if (Math.abs(dLuma) < 6) continue;
      changed += 1;

      // Grey: smoke has almost no saturation, and it drops the saturation of
      // whatever it is in front of.
      const greyness = 1 - Math.min(1, current.saturation[i] / 0.30);
      const desaturated = Math.max(0, reference.saturation[i] - current.saturation[i]);
      // Soft: smoke has no texture and veils the texture behind it, so cell
      // gradient energy falls where a column crosses a detailed background.
      const softened = Math.max(0, reference.gradient[i] - current.gradient[i]);
      const softness = Math.min(1, softened / 8) * 0.5 + (current.gradient[i] < 6 ? 0.5 : 0);
      // Mid-tone: smoke brightens dark ground and darkens bright sky, but it is
      // neither black nor blown out.
      const midtone = current.luma[i] > 25 && current.luma[i] < 245 ? 1 : 0;

      const score =
        0.40 * greyness +
        0.20 * Math.min(1, desaturated / 0.15) +
        0.30 * softness +
        0.10 * midtone;
      if (score > 0.5) cells.push({ cx, cy, score, dLuma });
    }
  }

  return {
    cells,
    exposureShift,
    exposureSuspect,
    changedFraction: changed / Math.max(1, current.luma.length),
  };
}

/**
 * The median of a numeric array, without mutating it.
 *
 * @param {ArrayLike<number>} values Numbers.
 * @returns {number} The median, or 0 for an empty input.
 */
function median(values) {
  if (!values.length) return 0;
  const sorted = Array.from(values).sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Group candidate cells into columns, and describe each one.
 *
 * @param {Array<{cx: number, cy: number, score: number}>} cells Candidate cells.
 * @param {number} cols Grid width in cells.
 * @param {number} rows Grid height in cells.
 * @returns {Array<{cells: number, minX: number, maxX: number, minY: number, maxY: number,
 *   centroidX: number, topY: number, score: number, aspect: number}>} Regions,
 *   largest first.
 */
export function groupColumns(cells, cols, rows) {
  const key = (cx, cy) => cy * cols + cx;
  const lookup = new Map(cells.map((c) => [key(c.cx, c.cy), c]));
  const seen = new Set();
  const regions = [];

  for (const cell of cells) {
    const start = key(cell.cx, cell.cy);
    if (seen.has(start)) continue;
    const queue = [cell];
    seen.add(start);
    const members = [];
    while (queue.length) {
      const node = queue.pop();
      members.push(node);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = node.cx + dx;
          const ny = node.cy + dy;
          if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
          const id = key(nx, ny);
          if (seen.has(id)) continue;
          const neighbour = lookup.get(id);
          if (!neighbour) continue;
          seen.add(id);
          queue.push(neighbour);
        }
      }
    }
    if (members.length < 4) continue;
    const xs = members.map((m) => m.cx);
    const ys = members.map((m) => m.cy);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    regions.push({
      cells: members.length,
      minX,
      maxX,
      minY,
      maxY,
      centroidX: xs.reduce((a, b) => a + b, 0) / xs.length,
      // Screen y counts down, so the top of a column is the smallest y.
      topY: minY,
      bottomY: maxY,
      score: members.reduce((a, b) => a + b.score, 0) / members.length,
      aspect: (maxY - minY + 1) / (maxX - minX + 1),
    });
  }

  return regions.sort((a, b) => b.cells - a.cells);
}

/**
 * Turn a region's position in frame into a bearing and an elevation angle.
 *
 * The camera model is a pinhole with a stated horizontal field of view, which
 * is what a phone or a fixed camera can actually tell you about itself. Lens
 * distortion is not corrected, and near the edge of a wide lens that is worth a
 * degree or two — which is folded into the returned uncertainty rather than
 * left for the triangulator to discover.
 *
 * @param {object} region A region from {@link groupColumns}.
 * @param {object} camera Camera pose.
 * @param {number} camera.headingDeg Direction the camera centre points, true north.
 * @param {number} camera.fovDeg Horizontal field of view, degrees.
 * @param {number} [camera.tiltDeg=0] Camera tilt above horizontal, degrees.
 * @param {number} cols Grid width in cells.
 * @param {number} rows Grid height in cells.
 * @returns {{bearingDeg: number, offAxisDeg: number, elevationDeg: number,
 *   bearingSigmaDeg: number}} Where the column is, and how well that is known.
 */
export function regionBearing(region, camera, cols, rows) {
  const centre = (cols - 1) / 2;
  const offAxis = ((region.centroidX - centre) / Math.max(1, cols)) * camera.fovDeg;
  const bearing = ((camera.headingDeg + offAxis) % 360 + 360) % 360;
  const vfov = camera.fovDeg * (rows / Math.max(1, cols));
  const elevation = (camera.tiltDeg ?? 0) + (((rows - 1) / 2 - region.topY) / Math.max(1, rows)) * vfov;
  // Half a cell of quantisation, plus a degree of lens distortion, plus a
  // degree for the fact that a column's centroid is not its source.
  const quantisation = (camera.fovDeg / Math.max(1, cols)) / 2;
  return {
    bearingDeg: bearing,
    offAxisDeg: offAxis,
    elevationDeg: elevation,
    bearingSigmaDeg: Math.hypot(quantisation, 1, 1),
  };
}

/**
 * The whole analysis for one frame.
 *
 * @param {object} frame Current RGBA frame.
 * @param {object} referenceGrid Grid from {@link gridStats} for the background.
 * @param {object} camera Camera pose, as {@link regionBearing} takes it.
 * @returns {{candidates: Array<object>, exposureSuspect: boolean, exposureShift: number,
 *   grid: object, note: string}} Candidate columns with their bearings.
 */
export function analyseFrame(frame, referenceGrid, camera) {
  const grid = gridStats(frame, referenceGrid.cell);
  const marked = markCandidates(grid, referenceGrid);
  const regions = groupColumns(marked.cells, grid.cols, grid.rows);

  const candidates = regions.slice(0, 4).map((region) => {
    const geometry = regionBearing(region, camera, grid.cols, grid.rows);
    return {
      ...geometry,
      cells: region.cells,
      score: region.score,
      aspect: region.aspect,
      // A column is taller than it is wide near its base. A wide, flat region is
      // much more likely to be a fog bank, a cloud shadow or an exposure change
      // than a plume, and saying so is more use than folding it into a number.
      shape: region.aspect >= 1.2 ? 'column-like' : region.aspect >= 0.6 ? 'blob' : 'layer',
      properties: {
        grey: region.score > 0.6,
        persistent: false,
        rising: false,
      },
    };
  });

  let note;
  if (marked.exposureSuspect) {
    note = `The whole frame changed brightness by ${marked.exposureShift.toFixed(0)} levels between the reference and now — the camera has re-exposed. Anything found in this frame may be that and not smoke. Re-take the reference.`;
  } else if (marked.changedFraction > 0.5) {
    note = 'More than half the frame changed. That is weather, a moved camera or a lighting change, not a plume.';
  } else if (!candidates.length) {
    note = 'Nothing in this frame has the greyness and softness of a smoke column. That is not the same as there being no fire — a column below the horizon, behind a ridge, or thinner than a cell will not show here.';
  } else {
    note = `${candidates.length} candidate${candidates.length === 1 ? '' : 's'}. Each still needs to persist across frames and grow upward before it is worth a bearing.`;
  }

  return { candidates, exposureSuspect: marked.exposureSuspect, exposureShift: marked.exposureShift, grid, note };
}

/**
 * Confirm a candidate across time — the test that removes most false alarms.
 *
 * A bird crosses in one frame. A vehicle's dust settles. A cloud shadow moves
 * across and away. A smoke column stays in the same bearing and grows upward,
 * and it does that for minutes. Requiring persistence costs a delay of tens of
 * seconds and removes most of what a single-frame test gets wrong, which is a
 * trade worth making explicitly rather than by tuning a threshold until the
 * demo looks good.
 *
 * @param {Array<{atMs: number, bearingDeg: number, elevationDeg: number, cells: number}>} history
 *   Observations of one candidate over time, oldest first.
 * @param {number} [minSpanMs=30000] How long it must hold.
 * @returns {{confirmed: boolean, persistent: boolean, rising: boolean, growing: boolean,
 *   spanMs: number, bearingDriftDeg: number, note: string}} The verdict and why.
 */
export function confirmOverTime(history, minSpanMs = 30000) {
  if (!Array.isArray(history) || history.length < 3) {
    return {
      confirmed: false,
      persistent: false,
      rising: false,
      growing: false,
      spanMs: 0,
      bearingDriftDeg: 0,
      note: 'Not enough observations yet — three at least, spread over half a minute.',
    };
  }
  const first = history[0];
  const last = history[history.length - 1];
  const spanMs = last.atMs - first.atMs;
  const bearings = history.map((h) => h.bearingDeg);
  const drift = Math.max(...bearings) - Math.min(...bearings);
  const persistent = spanMs >= minSpanMs && drift < 6;
  const rising = last.elevationDeg > first.elevationDeg + 0.5;
  const growing = last.cells > first.cells * 1.15;
  const confirmed = persistent && (rising || growing);

  let note;
  if (!persistent && spanMs < minSpanMs) {
    note = `Only ${(spanMs / 1000).toFixed(0)} s of observation so far. Holding.`;
  } else if (!persistent) {
    note = `The bearing wandered ${drift.toFixed(1)}° across the observation. Smoke from a fixed source does not do that; something moving across the view does.`;
  } else if (!rising && !growing) {
    note = 'Grey, soft and in the same place for the whole window — but it is neither rising nor spreading. A fog bank or a low cloud does exactly this.';
  } else {
    note = `Held the same bearing for ${(spanMs / 1000).toFixed(0)} s${rising ? ', rising' : ''}${growing ? ', growing' : ''}. That is a plume signature.`;
  }

  return { confirmed, persistent, rising, growing, spanMs, bearingDriftDeg: drift, note };
}

/**
 * What this detector gets wrong, in the words it should be shown in.
 *
 * Kept as data rather than prose in a document, because it belongs on screen
 * beside the candidate rather than in a file nobody opens during an incident.
 *
 * @returns {Array<{name: string, tell: string}>} Confusers and how to tell them apart.
 */
export function knownConfusers() {
  return [
    { name: 'Fog and low cloud', tell: 'Grey and soft like smoke, but it does not rise from a point and its bearing wanders as it drifts.' },
    { name: 'Dust from a vehicle or a field', tell: 'Rises from a point and is grey, but it is short-lived and moves along a road.' },
    { name: 'Automatic exposure change', tell: 'The whole frame shifts at once. The app measures this and refuses the frame.' },
    { name: 'Rain and snow', tell: 'Reduces contrast everywhere rather than in one region.' },
    { name: 'A moved or knocked camera', tell: 'Everything changes at once and the bearing to every landmark shifts with it.' },
    { name: 'Steam from a cooling tower or a vent', tell: 'A genuine rising grey column that is not a fire. Only local knowledge tells these apart, so the app lets you mark and mask them.' },
    { name: 'Sunrise and sunset', tell: 'Slow global brightness and colour change, and long shadows that soften texture.' },
  ];
}
