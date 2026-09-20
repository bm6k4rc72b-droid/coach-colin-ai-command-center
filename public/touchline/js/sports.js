/**
 * The fields this app knows how to measure, and what differs between them.
 *
 * Almost none of Touchline is about football. The homography, the tracker, the
 * noise floors, the coverage accounting — all of that is "a flat rectangle of
 * known size, seen by one camera", and a gridiron is as flat as a pitch. What
 * genuinely differs is small and specific, and this module is the list of it:
 *
 * - **The markings**, because they are what a person clicks to calibrate and
 *   what the app draws back over the footage to prove the fit is right.
 * - **The paint**, because a soccer pitch is thin white lines and a gridiron
 *   adds six-foot numbers every ten yards. A number is exactly the size and
 *   shape of a standing player, and without a model of where they are the app
 *   reports a phantom on every one of them.
 * - **The ball**, because one is white and the other is brown, and a colour
 *   test tuned for a football finds nothing at all on a gridiron.
 * - **What can honestly be said about possession.** Soccer's ball spends most
 *   of a match on the grass near somebody's feet. A gridiron's spends most of a
 *   play inside a player's hands, invisible. Proximity possession is a real
 *   measurement in one sport and a fiction in the other, so one model reports
 *   it and the other declines to.
 *
 * Everything here is a measurement of a real field. The numbers are the ones
 * the sport's own rulebook specifies, in metres, with the yard conversions
 * done once and written down rather than sprinkled through the code.
 *
 * @module touchline/sports
 */

import { FULL_PITCH, landmarks as soccerLandmarks, pitchLines as soccerLines } from './pitch.js';

/** Metres in a yard. Exact by definition since 1959. */
export const YARD_M = 0.9144;

/** Metres in a foot. */
export const FOOT_M = 0.3048;

/**
 * A gridiron, in metres.
 *
 * 100 yards of playing field plus two 10-yard end zones, by 53 1/3 yards wide.
 * The hash marks are the one number that differs by code — the NFL's are much
 * closer to the middle than college's — so the model carries the inset rather
 * than assuming a league.
 */
export const GRIDIRON = Object.freeze({
  lengthM: 120 * YARD_M,
  // 160 feet, which is 53 1/3 yards. Written in feet because that is how the
  // rulebook states it, and because stating it in yards invites exactly the
  // slip that divided it by three and produced a field 16 m wide.
  widthM: 160 * FOOT_M,
  endZoneM: 10 * YARD_M,
  /** NFL: 70 feet 9 inches from each sideline. */
  hashInsetM: (70 + 9 / 12) * FOOT_M,
  /** Yard-line numbers are 6 ft tall and 4 ft wide. */
  numberHeightM: 6 * FOOT_M,
  numberWidthM: 4 * FOOT_M,
  /** Nearest edge of the painted numbers, from the sideline. */
  numberInsetM: 12 * YARD_M,
  /** Painted stroke of a yard-line number, far wider than a boundary line. */
  numberStrokeM: FOOT_M,
});

/** Hash-mark insets for the codes that differ, metres from each sideline. */
export const HASH_INSETS = Object.freeze({
  nfl: (70 + 9 / 12) * FOOT_M,
  ncaa: 60 * FOOT_M,
  highSchool: (53 + 4 / 12) * FOOT_M,
});

/** Build a line segment in field metres. */
const seg = (x1, y1, x2, y2) => ({ a: { x: x1, y: y1 }, b: { x: x2, y: y2 } });

/**
 * Every painted line on a gridiron.
 *
 * Yard lines every five yards, goal lines, end lines, sidelines, and the hash
 * marks — which matter more than they look, because a hash mark is a short
 * stroke at a known distance from a known yard line, and that makes it the best
 * calibration target in either sport. A penalty-box corner is two long lines
 * meeting at a shallow angle and can be clicked a metre out without looking
 * wrong; a hash mark is a stub you either hit or miss.
 *
 * @param {object} [dimensions=GRIDIRON] Field dimensions.
 * @returns {{a: {x: number, y: number}, b: {x: number, y: number}}[]} Segments.
 */
export function gridironLines(dimensions = GRIDIRON) {
  const d = { ...GRIDIRON, ...dimensions };
  const { lengthM: L, widthM: W, endZoneM: E } = d;
  const lines = [
    seg(0, 0, L, 0),
    seg(0, W, L, W),
    seg(0, 0, 0, W),
    seg(L, 0, L, W),
  ];
  // Yard lines every five yards between the goal lines, the goal lines
  // included. The end zones carry no yard lines.
  for (let yard = 0; yard <= 100; yard += 5) {
    const x = E + yard * YARD_M;
    lines.push(seg(x, 0, x, W));
  }
  // Hash marks: a one-yard stroke on every yard, on both hash rows.
  const hashHalf = YARD_M / 2;
  for (const inset of [d.hashInsetM, W - d.hashInsetM]) {
    for (let yard = 1; yard < 100; yard += 1) {
      if (yard % 5 === 0) continue; // The five-yard marks are full lines.
      const x = E + yard * YARD_M;
      lines.push(seg(x, inset - hashHalf, x, inset + hashHalf));
    }
  }
  // Sideline yard ticks, the same stroke a yard in from each touchline.
  for (const inset of [YARD_M, W - YARD_M]) {
    for (let yard = 1; yard < 100; yard += 1) {
      if (yard % 5 === 0) continue;
      const x = E + yard * YARD_M;
      lines.push(seg(x, inset - hashHalf, x, inset + hashHalf));
    }
  }
  return lines;
}

/**
 * Where the yard-line numbers are painted.
 *
 * Returned as rectangles in field metres. This is the model that keeps a
 * six-foot "4" from being reported as a six-foot player: the app knows the
 * numbers are there, so a blob that sits on one *and* is made almost entirely
 * of paint is scenery. Both halves are needed. A player standing on a number
 * must still be found, and they are, because a player is not made of paint —
 * they have a helmet, a face, pants and a shadow.
 *
 * @param {object} [dimensions=GRIDIRON] Field dimensions.
 * @returns {{minX: number, maxX: number, minY: number, maxY: number}[]} Regions.
 */
export function gridironPaintedRegions(dimensions = GRIDIRON) {
  const d = { ...GRIDIRON, ...dimensions };
  const { widthM: W, endZoneM: E } = d;
  const regions = [];
  // Numbers sit beside the 10, 20, 30, 40 and 50 yard lines, on both sides of
  // the field, each a two-digit pair straddling its line.
  for (let yard = 10; yard <= 90; yard += 10) {
    const centreX = E + yard * YARD_M;
    for (const nearSideline of [true, false]) {
      const minY = nearSideline ? d.numberInsetM : W - d.numberInsetM - d.numberHeightM;
      regions.push({
        // A two-digit number plus the gap between the digits, generously
        // bounded: this is a region to be suspicious in, not a hitbox.
        minX: centreX - d.numberWidthM * 1.4,
        maxX: centreX + d.numberWidthM * 1.4,
        minY,
        maxY: minY + d.numberHeightM,
      });
    }
  }
  return regions;
}

/**
 * The gridiron landmarks a person can actually find and click.
 *
 * Ordered by how well they can be hit. Goal-line and hash intersections come
 * first: a hash mark is a one-yard stub crossing a known yard line, so the
 * crossing is unambiguous to within a pixel or two. Corners of the field come
 * last — they are the easiest to name and among the worst to click, because two
 * lines meeting at a right angle in heavy perspective have a corner that is a
 * smear rather than a point.
 *
 * @param {object} [dimensions=GRIDIRON] Field dimensions.
 * @returns {{id: string, label: string, x: number, y: number}[]} Landmarks.
 */
export function gridironLandmarks(dimensions = GRIDIRON) {
  const d = { ...GRIDIRON, ...dimensions };
  const { lengthM: L, widthM: W, endZoneM: E } = d;
  const near = d.hashInsetM;
  const far = W - d.hashInsetM;
  const marks = [];
  const at = (id, label, x, y) => marks.push({ id, label, x, y });

  at('goal-near-left', 'Left goal line — near hash', E, near);
  at('goal-far-left', 'Left goal line — far hash', E, far);
  at('goal-near-right', 'Right goal line — near hash', L - E, near);
  at('goal-far-right', 'Right goal line — far hash', L - E, far);
  at('fifty-near', '50 yard line — near hash', L / 2, near);
  at('fifty-far', '50 yard line — far hash', L / 2, far);
  for (const yard of [20, 40, 60, 80]) {
    const x = E + yard * YARD_M;
    const shown = yard <= 50 ? yard : 100 - yard;
    at(`yard-${yard}-near`, `${shown} yard line — near hash`, x, near);
    at(`yard-${yard}-far`, `${shown} yard line — far hash`, x, far);
  }
  at('goal-sideline-near-left', 'Left goal line — near sideline', E, 0);
  at('goal-sideline-far-left', 'Left goal line — far sideline', E, W);
  at('goal-sideline-near-right', 'Right goal line — near sideline', L - E, 0);
  at('goal-sideline-far-right', 'Right goal line — far sideline', L - E, W);
  at('corner-near-left', 'Corner — near left', 0, 0);
  at('corner-far-left', 'Corner — far left', 0, W);
  return marks;
}

/**
 * Whether a colour is the white of field paint rather than a kit.
 *
 * Shared by both sports; the soccer module owns the implementation because the
 * line filter needs it, and it is re-exported here so a field model can name
 * its own ball test without importing across the app.
 *
 * @param {number} r Red, 0-255.
 * @param {number} g Green, 0-255.
 * @param {number} b Blue, 0-255.
 * @returns {boolean} True for bright, near-neutral pixels.
 */
export function whiteBall(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max > 118 && max - min < max * 0.34;
}

/**
 * Whether a colour is the leather brown of an American football.
 *
 * Brown is a dark, desaturated orange: red clearly ahead of green, green
 * clearly ahead of blue, and none of it bright. The test is deliberately narrow
 * because the alternative is worse — a loose "warm colour" rule finds every
 * patch of infield dirt, every tan glove and half the crowd, and a possession
 * figure built on those is worse than no possession figure.
 *
 * It will still fail on a muddy field, against a brown uniform, and in the
 * shade. That is in the app's list of what it cannot do rather than papered
 * over: the ball is reported as unseen, and the possession panel says so.
 *
 * @param {number} r Red, 0-255.
 * @param {number} g Green, 0-255.
 * @param {number} b Blue, 0-255.
 * @returns {boolean} True for leather-brown pixels.
 */
export function brownBall(r, g, b) {
  if (r < 48 || r > 205) return false;
  if (r <= g * 1.18) return false; // Clearly warmer than neutral.
  if (g < b * 1.05) return false; // Brown, not purple.
  if (g > r) return false; // Grass is green and a football is not.
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  // Saturation is what separates leather from skin, and it has to be strict.
  // Bare arms and faces are the same hue as a football and a good deal paler:
  // leather runs about 60% saturated, skin about 30-40%. Without this the
  // detector finds a ball on every forearm in the frame.
  //
  // It does not separate leather from the darkest skin tones, which sit close
  // to this line. What saves it in practice is the size gate rather than the
  // colour: an arm is part of a player's own region, so it is never offered to
  // the ball detector as a small isolated blob. Where that fails, the app
  // reports a ball it should not have — which is why possession is not
  // reported for this sport at all.
  return max - min >= max * 0.42;
}

/**
 * The field models the app can measure.
 *
 * Each one answers the same questions, which is what lets the rest of the app
 * stay sport-agnostic: how big is the field, where is its paint, what can be
 * clicked, what does the ball look like, and what may honestly be claimed about
 * who has it.
 */
export const SPORTS = Object.freeze({
  soccer: Object.freeze({
    id: 'soccer',
    label: 'Football (soccer)',
    fieldWord: 'pitch',
    dimensions: FULL_PITCH,
    lines: soccerLines,
    landmarks: soccerLandmarks,
    paintedRegions: () => [],
    calibrationIds: Object.freeze([
      'box-left-near',
      'box-left-far',
      'box-left-goal-near',
      'box-left-goal-far',
      'six-left-near',
      'six-left-far',
      'halfway-near',
      'halfway-far',
      'corner-near-left',
      'corner-far-left',
      'box-right-near',
      'box-right-far',
    ]),
    lineWidthM: 0.12,
    ball: Object.freeze({
      diameterM: 0.22,
      isBall: whiteBall,
      label: 'ball',
      note: 'A football is 22 cm across — one or two pixels at the far end of a pitch.',
    }),
    /**
     * Proximity possession is a real measurement here: the ball spends most of
     * a match on the grass, near somebody's feet, in view.
     */
    possession: 'proximity',
    passLanes: true,
    sprintMps: 7,
    highIntensityMps: 5.5,
  }),
  gridiron: Object.freeze({
    id: 'gridiron',
    label: 'American football',
    fieldWord: 'field',
    dimensions: GRIDIRON,
    lines: gridironLines,
    landmarks: gridironLandmarks,
    paintedRegions: gridironPaintedRegions,
    calibrationIds: Object.freeze([
      'goal-near-left',
      'goal-far-left',
      'fifty-near',
      'fifty-far',
      'yard-20-near',
      'yard-20-far',
      'yard-40-near',
      'yard-40-far',
      'goal-near-right',
      'goal-far-right',
      'goal-sideline-near-left',
      'goal-sideline-far-left',
    ]),
    lineWidthM: 4 * 0.0254,
    ball: Object.freeze({
      diameterM: 0.17,
      isBall: brownBall,
      label: 'ball',
      note:
        'An American football is brown, 17 cm across its short axis, and spends most of a play inside a player’s hands.',
    }),
    /**
     * Not reported. Possession in this sport is a matter of downs and drives,
     * not of who is standing nearest the ball, and the ball itself is hidden
     * for most of every play. A proximity figure here would be a number with no
     * referent — the worst kind, because it would still add up to 100%.
     */
    possession: 'none',
    passLanes: false,
    /** 22 mph, the usual broadcast threshold for a gridiron sprint. */
    sprintMps: 9.83,
    highIntensityMps: 6.7,
  }),
});

/**
 * Look a field model up by id, falling back to football.
 *
 * @param {string} id Sport identifier.
 * @returns {object} The field model.
 */
export function sportById(id) {
  return SPORTS[id] ?? SPORTS.soccer;
}
