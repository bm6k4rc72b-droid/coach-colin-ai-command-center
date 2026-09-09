/**
 * Finding players in a frame, without a neural network.
 *
 * The obvious approach — frame differencing, the way a security camera finds
 * intruders — is wrong for sport, and wrong in a way that quietly ruins the
 * numbers. A centre-back standing still for eight seconds is not background;
 * they are the reason the possession figure is what it is. Anything that
 * detects only movement loses every player who is walking, jogging into space,
 * or waiting, and reports possession shares computed from half a team.
 *
 * So this module segments by colour instead. A pitch is the most reliable thing
 * in the picture: tens of thousands of pixels of one hue, spread across the
 * whole frame, in every clip anyone will ever point this at. Model the grass,
 * and everything that is not grass and is the right size to be a person is a
 * player — standing, sprinting or arguing with the referee.
 *
 * Three things make it work rather than half-work:
 *
 * **The model is fitted, not hardcoded.** Grass ranges from the blue-green of a
 * wet winter pitch to the yellow of August, under floodlights that shift the
 * whole frame. A fixed "green" threshold fails on most real footage, so the
 * greenness of the pixels inside the marked pitch is measured every few seconds
 * and the threshold is set from their median and spread.
 *
 * **The painted lines are handled by shape, not by colour.** White lines are
 * emphatically not grass and light up the mask everywhere. They survive as
 * one-to-three-pixel-wide strokes, so an erosion removes them and leaves
 * players intact — which is the entire reason there is a morphology pass here.
 *
 * **Size is judged in metres.** A blob is a player if it is roughly as tall as a
 * person *at that point on the pitch*, which the homography knows and a pixel
 * threshold cannot. This is what rejects the dugout, the ball, a bird, and the
 * spectators behind the far touchline, all of which are the wrong size on the
 * grass even when they are the right size on the screen.
 *
 * What it cannot do is separate two players who overlap in the picture. They
 * are one blob, and the tracker is told so — see `blob.merged` — rather than
 * the app inventing a split that the pixels do not support.
 *
 * @module touchline/segment
 */

import { apply, expectedPixelHeight, onPitch, scaleAt } from './pitch.js';

/** Sampled pixels used to fit the turf model. More is slower, not better. */
const SAMPLE_TARGET = 4000;

/**
 * How green a pixel is, on a scale that survives a change in brightness.
 *
 * Excess green over the average of the other two channels, divided by total
 * intensity. Shadowed grass and sunlit grass differ hugely in brightness and
 * barely at all in this number, which is the point: a tool that loses the pitch
 * in the shade of the stand finds twenty-two "players" in it instead.
 *
 * @param {number} r Red, 0-255.
 * @param {number} g Green, 0-255.
 * @param {number} b Blue, 0-255.
 * @returns {number} Roughly -0.5 (magenta) to 0.5 (pure green).
 */
export function greenness(r, g, b) {
  const total = r + g + b;
  if (total < 24) return 0; // Near-black: no usable hue, and dark is not grass.
  return (g - (r + b) / 2) / total;
}

/**
 * Median and median absolute deviation of a sample.
 *
 * Both are medians rather than means because a quarter of the pixels inside the
 * pitch polygon are players, lines and shadows. A mean threshold drags towards
 * whatever is standing on the grass; a median ignores it.
 *
 * @param {number[]|Float32Array} values Sample; sorted in place if an array.
 * @returns {{median: number, mad: number}} Centre and spread.
 */
export function medianSpread(values) {
  const sorted = Float64Array.from(values).sort();
  const n = sorted.length;
  if (!n) return { median: 0, mad: 0 };
  const median = n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const deviations = Float64Array.from(sorted, (v) => Math.abs(v - median)).sort();
  const mad = n % 2
    ? deviations[(n - 1) / 2]
    : (deviations[n / 2 - 1] + deviations[n / 2]) / 2;
  return { median, mad };
}

/**
 * Fit a turf colour model to the grass inside the marked pitch.
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} frame RGBA.
 * @param {object} options Fitting options.
 * @param {number[]} options.imageToPitch Row-major 3x3 homography.
 * @param {{lengthM: number, widthM: number}} options.dimensions Pitch size.
 * @param {number} [options.tolerance=3.5] Multiples of the spread a pixel may
 *   fall below the median greenness and still count as grass.
 * @returns {{median: number, mad: number, floor: number, coverage: number,
 *   samples: number}} The model, plus the fraction of sampled pixels it calls
 *   grass — low coverage means the marked area is not a pitch, and the app
 *   says so rather than segmenting nonsense.
 */
export function fitTurf(frame, { imageToPitch, dimensions, tolerance = 3.5 }) {
  const { data, width, height } = frame;
  const stride = Math.max(1, Math.floor(Math.sqrt((width * height) / SAMPLE_TARGET)));
  const values = [];
  for (let y = 0; y < height; y += stride) {
    for (let x = 0; x < width; x += stride) {
      const p = apply(imageToPitch, { x, y });
      if (!onPitch(p, dimensions, 0)) continue;
      const i = (y * width + x) * 4;
      values.push(greenness(data[i], data[i + 1], data[i + 2]));
    }
  }
  if (values.length < 32) return { median: 0, mad: 0, floor: -1, coverage: 0, samples: values.length };
  const { median, mad } = medianSpread(values);
  // A pitch that is uniform to within nothing still needs slack for noise, and
  // a floor stops a very mottled pitch from accepting everything.
  const spread = Math.max(mad, 0.004);
  const floor = median - tolerance * spread;
  let grass = 0;
  for (const v of values) if (v >= floor) grass += 1;
  return { median, mad, floor, coverage: grass / values.length, samples: values.length };
}

/**
 * Mark every pixel that is not grass, inside the pitch only.
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} frame RGBA.
 * @param {object} options Masking options.
 * @param {{floor: number}} options.turf Model from {@link fitTurf}.
 * @param {number[]} options.imageToPitch Row-major 3x3 homography.
 * @param {{lengthM: number, widthM: number}} options.dimensions Pitch size.
 * @param {number} [options.marginM=1] Slack outside the lines, metres.
 * @returns {Uint8Array} One byte per pixel: 1 for foreground.
 */
export function turfMask(frame, { turf, imageToPitch, dimensions, marginM = 1 }) {
  const { data, width, height } = frame;
  const mask = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const p = apply(imageToPitch, { x, y });
      if (!onPitch(p, dimensions, marginM)) continue;
      const i = idx * 4;
      if (greenness(data[i], data[i + 1], data[i + 2]) < turf.floor) mask[idx] = 1;
    }
  }
  return mask;
}

/** Width of a painted line, metres. The Laws allow up to 0.12 m. */
export const LINE_WIDTH_M = 0.12;

/**
 * Whether a colour is the white of pitch paint rather than a kit.
 *
 * @param {number} r Red, 0-255.
 * @param {number} g Green, 0-255.
 * @param {number} b Blue, 0-255.
 * @returns {boolean} True for bright, near-neutral pixels.
 */
export function paintWhite(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max > 118 && max - min < max * 0.34;
}

/**
 * Take the painted lines back out of the foreground mask.
 *
 * Lines are not grass, so the turf model correctly calls every one of them
 * foreground — and then the penalty area, the goal area and the goal line
 * become one connected structure that swallows any player standing on it. The
 * blob is the wrong shape to be a person, so it is discarded, and with it the
 * three players inside it. That is not a small loss: it is precisely the
 * players in the box, during precisely the passages of play anyone is watching
 * the video for.
 *
 * Erosion alone cannot fix it, because a line three pixels wide has a spine
 * that survives any kernel small enough to leave a player standing.
 *
 * So lines are removed by what actually distinguishes them: a line is *thin* —
 * paint is 12 cm wide, a player is half a metre — and it is *surrounded by
 * grass*. A pixel is dropped when it is white paint and the pixels a line's
 * width away on both sides, in either axis, are turf. The thickness tested is
 * derived from the homography at that point, so the same rule works on the
 * near touchline and on the far one, where the same line is a third as wide.
 *
 * The second condition is what protects a team playing in white. Their shirt is
 * as bright as the paint, but at a line's distance either side of it there is
 * more shirt, not grass, so nothing about them is suppressed. A player standing
 * on a line keeps their own pixels and loses the paint under their feet, which
 * is the outcome that lets the blob be recognised as a person.
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} frame RGBA.
 * @param {Uint8Array} mask Foreground mask, modified in place.
 * @param {object} options Suppression options.
 * @param {{floor: number}} options.turf Turf model.
 * @param {number[]} options.imageToPitch Row-major 3x3 homography.
 * @returns {Uint8Array} The same mask, with paint removed.
 */
export function suppressLines(frame, mask, { turf, imageToPitch }) {
  const { data, width, height } = frame;
  // "Not paint" rather than "is grass". The two differ in exactly the place it
  // matters: the far touchline has grass on one side and a stand full of
  // spectators on the other, so a grass-on-both-sides test never fires on it
  // and it stays in the mask, welded to whichever player is standing near it.
  // Asking instead whether the white run is *thin* covers that case, covers a
  // line with a player on one side of it, and still leaves a team playing in
  // white untouched — a shirt has more shirt a few pixels away, not turf.
  const isNotPaint = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return true;
    const i = (y * width + x) * 4;
    return !paintWhite(data[i], data[i + 1], data[i + 2]);
  };
  void turf;
  const drop = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      if (!mask[idx]) continue;
      const i = idx * 4;
      if (!paintWhite(data[i], data[i + 1], data[i + 2])) continue;
      const { minM } = scaleAt(imageToPitch, x, y);
      if (!(minM > 1e-9)) continue;
      // The reach has to exceed the paint's real width at this point, which
      // near the camera is a dozen pixels rather than two. Clamping it lower to
      // save work leaves the near lines in the mask, and a near line is the one
      // most likely to have a player standing on it. It stays well inside a
      // player's half-width — paint is 12 cm, a player is half a metre — so
      // widening it costs arithmetic and nothing else.
      const reach = Math.min(20, Math.max(2, Math.round(LINE_WIDTH_M / minM) + 2));
      // Probed in four directions, not two. A line running diagonally across
      // the picture is six pixels wide but nine pixels of horizontal crossing
      // and nine of vertical, so an axis-only test declares it thick and leaves
      // it in — which is how the near edge of the penalty area stayed welded to
      // a player and reported him eight metres from where he stood. With four
      // directions the worst case is a line at 22.5° to all of them, where the
      // best probe still crosses only 8% more paint than its true width.
      const diagonal = Math.max(1, Math.round(reach / Math.SQRT2));
      let thin = 0;
      if (isNotPaint(x - reach, y) && isNotPaint(x + reach, y)) thin += 1;
      if (isNotPaint(x, y - reach) && isNotPaint(x, y + reach)) thin += 1;
      if (isNotPaint(x - diagonal, y - diagonal) && isNotPaint(x + diagonal, y + diagonal)) thin += 1;
      if (isNotPaint(x - diagonal, y + diagonal) && isNotPaint(x + diagonal, y - diagonal)) thin += 1;
      // Thin in every direction is not a line — it is a small round white thing
      // surrounded by grass, which in this sport is the ball. Suppressing it
      // would delete the one object the possession figures depend on. A line is
      // thin across and long along, so it is thin in one or two directions and
      // never in all four.
      if (thin > 0 && thin < 4) drop.push(idx);
    }
  }
  // Collected first, applied after: suppressing as we go would let a dropped
  // pixel change the verdict for its neighbour half a line-width later.
  for (const idx of drop) mask[idx] = 0;
  return mask;
}

/**
 * Erode then dilate a mask with a square kernel.
 *
 * The erosion is what deletes the painted lines: a three-pixel stroke does not
 * survive a radius-1 erosion, and a player forty pixels tall barely notices it.
 * The dilation puts back the edge the erosion cost, so blob areas stay
 * comparable to the raw mask rather than shrinking by a ring.
 *
 * @param {Uint8Array} mask Mask, modified only through the returned copy.
 * @param {number} width Frame width.
 * @param {number} height Frame height.
 * @param {number} [radius=1] Kernel radius in pixels.
 * @returns {Uint8Array} Opened mask.
 */
export function open(mask, width, height, radius = 1) {
  if (radius < 1) return mask.slice();
  const eroded = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let keep = 1;
      for (let dy = -radius; dy <= radius && keep; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) { keep = 0; break; }
        for (let dx = -radius; dx <= radius; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= width || !mask[yy * width + xx]) { keep = 0; break; }
        }
      }
      eroded[y * width + x] = keep;
    }
  }
  const dilated = new Uint8Array(mask.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!eroded[y * width + x]) continue;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -radius; dx <= radius; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          dilated[yy * width + xx] = 1;
        }
      }
    }
  }
  return dilated;
}

/**
 * A connected region of foreground pixels.
 *
 * @typedef {object} Blob
 * @property {number} minX Bounding box, inclusive.
 * @property {number} maxX Bounding box, inclusive.
 * @property {number} minY Bounding box, inclusive.
 * @property {number} maxY Bounding box, inclusive.
 * @property {number} area Foreground pixels in the region.
 * @property {number} cx Centroid column.
 * @property {number} cy Centroid row.
 * @property {number} footU Column of the ground contact point.
 * @property {number} footV Row of the ground contact point.
 */

/**
 * Where a region touches the ground, ignoring anything thin hanging below it.
 *
 * "The middle of the lowest row" is the obvious answer and it is wrong often
 * enough to matter. A player standing near a painted line picks up a couple of
 * pixels of that line — the ridge filter cannot remove paint that has a player
 * on one side of it instead of grass — and the line runs away down the picture.
 * The lowest row of the region is then a piece of the penalty area, the foot
 * point lands on it, and the player is reported eight metres from where they
 * are standing. The same thing happens with a long shadow.
 *
 * A thin tail is exactly what it sounds like: a row far narrower than the
 * region's own rows. So the ground contact is the lowest row that is still at
 * least a third as wide as this region typically is, which is the player's
 * boots and not the paint they are standing beside.
 *
 * @param {Map<number, number>} rowWidth Pixels per row.
 * @param {Map<number, number>} rowSumX Sum of columns per row.
 * @param {number} minY Topmost row.
 * @param {number} maxY Bottommost row.
 * @param {number} fallbackU Column to use if no row qualifies.
 * @returns {{u: number, v: number}} Ground contact point.
 */
export function footPoint(rowWidth, rowSumX, minY, maxY, fallbackU) {
  const widths = [];
  for (let y = minY; y <= maxY; y += 1) widths.push(rowWidth.get(y) ?? 0);
  const sorted = [...widths].sort((a, b) => a - b);
  const typical = sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0;
  const floor = Math.max(1, typical * 0.34);
  for (let y = maxY; y >= minY; y -= 1) {
    const width = rowWidth.get(y) ?? 0;
    if (width >= floor) return { u: (rowSumX.get(y) ?? 0) / width, v: y };
  }
  return { u: fallbackU, v: maxY };
}

/**
 * Label connected foreground regions.
 *
 * Iterative flood fill with an explicit stack: a recursive one blows the call
 * stack on a blob a few thousand pixels large, which is an ordinary size for a
 * near-touchline player.
 *
 * @param {Uint8Array} mask Foreground mask.
 * @param {number} width Frame width.
 * @param {number} height Frame height.
 * @param {number} [minArea=12] Regions smaller than this are dropped.
 * @returns {Blob[]} Regions, unordered.
 */
export function components(mask, width, height, minArea = 12) {
  const seen = new Uint8Array(mask.length);
  const blobs = [];
  const stack = new Int32Array(width * height);
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || seen[start]) continue;
    let top = 0;
    stack[top] = start;
    top += 1;
    seen[start] = 1;
    let area = 0;
    let sumX = 0;
    let sumY = 0;
    let minX = width;
    let maxX = 0;
    let minY = height;
    let maxY = 0;
    const rowWidth = new Map();
    const rowSumX = new Map();
    while (top > 0) {
      top -= 1;
      const idx = stack[top];
      const x = idx % width;
      const y = (idx - x) / width;
      area += 1;
      sumX += x;
      sumY += y;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      rowWidth.set(y, (rowWidth.get(y) ?? 0) + 1);
      rowSumX.set(y, (rowSumX.get(y) ?? 0) + x);
      const push = (next) => {
        if (!mask[next] || seen[next]) return;
        seen[next] = 1;
        stack[top] = next;
        top += 1;
      };
      if (x > 0) push(idx - 1);
      if (x < width - 1) push(idx + 1);
      if (y > 0) push(idx - width);
      if (y < height - 1) push(idx + width);
    }
    if (area < minArea) continue;
    const foot = footPoint(rowWidth, rowSumX, minY, maxY, sumX / area);
    blobs.push({
      minX, maxX, minY, maxY, area,
      cx: sumX / area,
      cy: sumY / area,
      // Ground contact, not the centre of the box: a player leaning or with an
      // arm out has a centre nowhere near their feet, and the feet are the only
      // part of them the homography can turn into a position.
      footU: foot.u,
      footV: foot.v,
    });
  }
  return blobs;
}

/** Tallest a stitched pair may be, as a fraction of an expected player. */
export const REJOIN_HEIGHT_LIMIT = 1.3;

/**
 * Join blobs that are two parts of one player.
 *
 * Shorts the colour of the pitch cut a player into a shirt and a pair of socks.
 * Two regions are joined when they overlap horizontally and the gap between
 * them is a small fraction of how tall a player should be there — which is a
 * statement about metres, so it does not also join a player to the person
 * standing behind them at the far end of the pitch.
 *
 * @param {Blob[]} blobs Regions to consider.
 * @param {number[]} imageToPitch Row-major 3x3 homography.
 * @param {number} [gapFraction=0.35] Permitted gap, as a fraction of expected
 *   player height.
 * @returns {Blob[]} Regions, with mergeable pairs combined.
 */
export function stitch(blobs, imageToPitch, gapFraction = 0.35) {
  const order = [...blobs].sort((a, b) => a.minY - b.minY);
  const out = [];
  const used = new Set();
  for (let i = 0; i < order.length; i += 1) {
    if (used.has(i)) continue;
    let current = order[i];
    for (let j = i + 1; j < order.length; j += 1) {
      if (used.has(j)) continue;
      const other = order[j];
      const overlap =
        Math.min(current.maxX, other.maxX) - Math.max(current.minX, other.minX);
      const narrower = Math.min(current.maxX - current.minX, other.maxX - other.minX) + 1;
      if (overlap < narrower * 0.5) continue;
      const gap = other.minY - current.maxY;
      if (gap < 0) continue;
      const expected = expectedPixelHeight(imageToPitch, other.footU, other.footV);
      if (!expected || gap > expected * gapFraction) continue;
      // The join must produce something that still looks like one player.
      // Without this, two team-mates standing one behind the other — which in a
      // camera behind the goal is most of the defensive line — overlap in the
      // picture, sit a small gap apart, and are welded into a single subject
      // two metres tall. The repair has to be checked against what it repairs.
      const joinedHeight = Math.max(current.maxY, other.maxY) - Math.min(current.minY, other.minY) + 1;
      if (joinedHeight > expected * REJOIN_HEIGHT_LIMIT) continue;
      const area = current.area + other.area;
      current = {
        minX: Math.min(current.minX, other.minX),
        maxX: Math.max(current.maxX, other.maxX),
        minY: Math.min(current.minY, other.minY),
        maxY: Math.max(current.maxY, other.maxY),
        area,
        cx: (current.cx * current.area + other.cx * other.area) / area,
        cy: (current.cy * current.area + other.cy * other.area) / area,
        footU: other.footU,
        footV: other.footV,
      };
      used.add(j);
    }
    out.push(current);
  }
  return out;
}

/**
 * The colour of a player's shirt, sampled where the shirt actually is.
 *
 * Averaging a whole blob gives the average of a shirt, a pair of shorts, two
 * socks, some grass showing between the legs and a head — which for every kit
 * in the league lands in the same muddy middle, and no clustering can pull two
 * teams back out of it. The shirt is the top third below the head: from 55% to
 * 85% of the way up the blob, and the middle 60% of its width.
 *
 * The sample is returned as chromaticity — each channel over the total — so a
 * player in shadow and the same player in sunlight give nearly the same
 * numbers. That is the whole reason team assignment survives a cloud passing
 * over, and it is also why the sample cannot be used to identify anybody: two
 * players in the same kit are, by construction, identical here.
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} frame RGBA.
 * @param {Blob} blob Region to sample.
 * @returns {{r: number, g: number, b: number, luma: number, samples: number}}
 *   Chromaticity in 0-1 per channel, with mean brightness kept separately.
 */
export function sampleKit(frame, blob) {
  const { data, width } = frame;
  const height = blob.maxY - blob.minY + 1;
  const top = Math.round(blob.maxY - height * 0.85);
  const bottom = Math.round(blob.maxY - height * 0.55);
  const inset = Math.max(0, Math.floor((blob.maxX - blob.minX) * 0.2));
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let y = top; y <= bottom; y += 1) {
    if (y < 0 || y >= frame.height) continue;
    for (let x = blob.minX + inset; x <= blob.maxX - inset; x += 1) {
      if (x < 0 || x >= width) continue;
      const i = (y * width + x) * 4;
      const pr = data[i];
      const pg = data[i + 1];
      const pb = data[i + 2];
      // Grass showing between two players is not kit; drop it from the sample
      // rather than let it drag every shirt in the frame towards green.
      if (greenness(pr, pg, pb) > 0.16) continue;
      r += pr;
      g += pg;
      b += pb;
      n += 1;
    }
  }
  if (!n) return { r: 1 / 3, g: 1 / 3, b: 1 / 3, luma: 0, samples: 0 };
  const total = r + g + b || 1;
  return { r: r / total, g: g / total, b: b / total, luma: (r + g + b) / (3 * n), samples: n };
}

/** Bounds on how tall a blob may be, as a fraction of an expected player. */
export const HEIGHT_BAND = Object.freeze({ min: 0.45, max: 2.4 });

/**
 * Keep the blobs that could be players, and say which are probably two.
 *
 * @param {Blob[]} blobs Regions from {@link components}, ideally stitched.
 * @param {object} options Gating options.
 * @param {number[]} options.imageToPitch Row-major 3x3 homography.
 * @param {{lengthM: number, widthM: number}} options.dimensions Pitch size.
 * @param {number} [options.marginM=1] Slack outside the lines, metres.
 * @param {object} [options.frame] RGBA frame; when given, each candidate
 *   carries a kit sample from {@link sampleKit}.
 * @returns {(Blob & {pitch: {x: number, y: number}, heightRatio: number,
 *   widthM: number, merged: boolean, kit?: object})[]} Candidates with their
 *   pitch position.
 */
export function playerCandidates(blobs, { imageToPitch, dimensions, marginM = 1, frame = null }) {
  const out = [];
  for (const blob of blobs) {
    const expected = expectedPixelHeight(imageToPitch, blob.footU, blob.footV);
    if (!expected) continue;
    const pixelHeight = blob.maxY - blob.minY + 1;
    const ratio = pixelHeight / expected;
    if (ratio < HEIGHT_BAND.min || ratio > HEIGHT_BAND.max) continue;
    const foot = apply(imageToPitch, { x: blob.footU, y: blob.footV });
    if (!onPitch(foot, dimensions, marginM)) continue;
    // Density rejects the crowd, netting and long thin artefacts: a person
    // fills roughly a third of their bounding box, a fence fills a twentieth.
    const boxArea = (blob.maxX - blob.minX + 1) * pixelHeight;
    if (blob.area / boxArea < 0.18) continue;
    const pixelWidth = blob.maxX - blob.minX + 1;
    const widthM = (pixelWidth / expected) * 1.8;
    const heightM = ratio * 1.8;
    // A person is taller than they are wide, and so is any huddle of people
    // standing shoulder to shoulder. A stretch of far touchline paint is not:
    // it is two metres of white, thirty centimetres tall. This is the gate that
    // keeps the lines the ridge filter could not remove — the ones with a stand
    // behind them rather than grass — out of the team sheet.
    if (heightM < widthM * 0.9) continue;
    out.push({
      ...blob,
      pitch: { x: foot.x, y: foot.y },
      heightRatio: ratio,
      widthM,
      // Bigger than one person is more than one person. Too wide is two
      // players side by side; too tall is one standing behind another, which a
      // camera low behind the goal produces constantly. Either way the honest
      // report is "this region is more than one player" — the tracker then
      // coasts its identities through it rather than handing both histories to
      // whichever blob happens to be nearest.
      merged: widthM > 1.5 || ratio > 1.35,
      kit: frame ? sampleKit(frame, blob) : null,
    });
  }
  return out;
}

/**
 * Run the whole detection chain over one frame.
 *
 * @param {{data: Uint8ClampedArray, width: number, height: number}} frame RGBA.
 * @param {object} options Detection options.
 * @param {{floor: number}} options.turf Turf model.
 * @param {number[]} options.imageToPitch Row-major 3x3 homography.
 * @param {{lengthM: number, widthM: number}} options.dimensions Pitch size.
 * @param {number} [options.openRadius=0] Morphology radius. Zero by default:
 *   once the paint is removed by shape there is nothing left for an erosion to
 *   clean up, and an erosion large enough to matter deletes the ball, which is
 *   three pixels across. Grainy footage can turn it back on.
 * @param {number} [options.minArea=4] Smallest region kept, pixels. Tuned for
 *   the ball, not for players: a ball is three pixels across in this footage,
 *   and a threshold set for a person deletes it before the ball detector is
 *   ever offered it. Players are gated by size in metres further down.
 * @returns {{candidates: object[], mask: Uint8Array, blobs: Blob[]}} Players,
 *   the opened mask (the ball detector reuses it), and the raw regions.
 */
export function detect(frame, options) {
  const { turf, imageToPitch, dimensions, openRadius = 0, minArea = 4 } = options;
  const raw = turfMask(frame, { turf, imageToPitch, dimensions });
  suppressLines(frame, raw, { turf, imageToPitch });
  const mask = open(raw, frame.width, frame.height, openRadius);
  const blobs = components(mask, frame.width, frame.height, minArea);
  const stitched = stitch(blobs, imageToPitch);
  return {
    candidates: playerCandidates(stitched, { imageToPitch, dimensions, frame }),
    mask,
    blobs,
  };
}
