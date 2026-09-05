/**
 * A worked example.
 *
 * Two situations need one. Someone opening the app for the first time has no
 * survey, so the plan, the model and the report are all empty and there is
 * nothing to judge the tool by until they have walked a house. And the app is
 * often opened somewhere the camera is unavailable — an embedded frame, a
 * locked-down browser, a desktop with the lens covered — where the pointing
 * survey cannot run at all.
 *
 * So this is a real property, measured the way the app measures: rooms with
 * plausible dimensions and a low ceiling, a dated condition, and a market with
 * genuine headroom above it. Nothing here is presented as a survey the
 * operator took — the address says what it is.
 *
 * @module housewright/demo
 */

import * as plan from './plan.js';

/**
 * Build a rectangular room with a door and a window on it.
 *
 * @param {string} name Room name.
 * @param {string} type Room type key.
 * @param {number} w Width in metres.
 * @param {number} d Depth in metres.
 * @param {number} ceiling Ceiling height in metres.
 * @param {number} [windows=1] How many windows to place.
 * @returns {object} A built room.
 */
function makeRoom(name, type, w, d, ceiling, windows = 1) {
  const base = plan.buildRoom({
    name,
    type,
    ceiling,
    points: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: d }, { x: 0, y: d }],
  });
  const openings = [plan.makeOpening(base, 0, w * 0.5, 'door')];
  for (let i = 0; i < windows; i += 1) {
    openings.push(plan.makeOpening(base, 1, d * (i + 1) / (windows + 1), 'window'));
  }
  return plan.buildRoom({ name, type, ceiling, points: base.points, openings });
}

/**
 * A complete example survey, ready to hand to the plan, model and report.
 *
 * @returns {object} A survey record in the ledger's shape.
 */
export function exampleSurvey() {
  const rooms = [
    makeRoom('Great room', 'living', 6.1, 4.6, 2.44, 2),
    makeRoom('Kitchen', 'kitchen', 3.4, 2.9, 2.44, 1),
    makeRoom('Dining', 'dining', 3.8, 3.2, 2.44, 1),
    makeRoom('Primary bedroom', 'bedroom', 4.4, 3.9, 2.44, 1),
    makeRoom('Primary bath', 'bathroom', 2.6, 2.3, 2.44, 1),
  ];
  // The camera signals a dim, yellow-lit, low-ceilinged interior would
  // actually produce — the condition this kind of property is usually in.
  const signals = [
    { id: 'warm-cast', label: 'Yellow-cast lighting', confidence: 0.82, room: 'Great room', evidence: 'red channel runs 38% hotter than blue — the signature of aged warm-white lamps' },
    { id: 'dim', label: 'Reads dark on camera', confidence: 0.74, room: 'Great room', evidence: 'mean brightness 19%, with 6% of the frame crushed to black' },
    { id: 'low-ceiling', label: 'Ceiling below the market expectation', confidence: 0.68, room: 'Great room', evidence: 'measured 2.44 m — buyers in an elevated tier read anything under 2.7 m as builder-grade' },
    { id: 'busy', label: 'Busy sightlines', confidence: 0.55, room: 'Kitchen', evidence: '58% edge density across the frame' },
  ];
  for (const room of rooms) {
    room.signals = signals.filter((s) => s.room === room.name);
    room.presentation = { score: 0.41, band: 'needs light and styling work before listing' };
  }

  return {
    id: 'example',
    address: '1490 Aspen Court (worked example)',
    created: new Date().toISOString(),
    holdHeight: 1.45,
    tier: 'elevated',
    condition: 'dated',
    pricePerSqft: 420,
    ceilingPricePerSqft: 640,
    totalSqft: 2100,
    hasGarage: true,
    rooms,
    stats: [],
    example: true,
  };
}
