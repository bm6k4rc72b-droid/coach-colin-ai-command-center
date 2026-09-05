/**
 * Unit tests for the parts that produce advice: the fingertip tracker, the
 * frame analyser, and the improvement report.
 *
 * The report tests are the important ones. An engine that recommends
 * everything is worthless, and an engine that reports a profit on every line
 * is worse than worthless, so most of what follows checks that it says no.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

const hand = await import('../../public/housewright/js/hand.js');
const finish = await import('../../public/housewright/js/finish.js');
const plan = await import('../../public/housewright/js/plan.js');
const report = await import('../../public/housewright/js/report.js');

/* --- helpers ------------------------------------------------------------ */

/**
 * A synthetic frame: a flat background with an optional skin-toned finger
 * poking in from the bottom edge.
 *
 * @param {object} options Frame contents.
 * @returns {{data: Uint8ClampedArray, width: number, height: number}} The frame.
 */
function frame({ bg = [40, 42, 48], finger = null, width = 96, height = 128 } = {}) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    data[i * 4] = bg[0];
    data[i * 4 + 1] = bg[1];
    data[i * 4 + 2] = bg[2];
    data[i * 4 + 3] = 255;
  }
  if (finger) {
    const { tipY, x0 = 42, w = 12, colour = [205, 150, 125] } = finger;
    for (let y = tipY; y < height; y += 1) {
      for (let x = x0; x < x0 + w; x += 1) {
        const i = (y * width + x) * 4;
        data[i] = colour[0];
        data[i + 1] = colour[1];
        data[i + 2] = colour[2];
      }
    }
  }
  return { data, width, height };
}

/**
 * A room of the given size, for feeding the report engine.
 *
 * @param {string} name Room name.
 * @param {string} type Room type.
 * @param {number} w Width in metres.
 * @param {number} d Depth in metres.
 * @param {number} [clg=2.44] Ceiling height.
 * @returns {object} A built room.
 */
function room(name, type, w, d, clg = 2.44) {
  return plan.buildRoom({
    name,
    type,
    ceiling: clg,
    points: [{ x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: d }, { x: 0, y: d }],
    openings: [{ wall: 1, along: 1, width: 1.2, height: 1.4, sill: 0.9, kind: 'window' }],
  });
}

/** A representative four-room walk. */
const HOUSE = [
  room('Kitchen', 'kitchen', 3.2, 2.6),
  room('Living', 'living', 5.2, 4.4),
  room('Primary', 'bedroom', 4.2, 3.8),
  room('Bath', 'bathroom', 2.4, 2.2),
];

/* --- the fingertip tracker ---------------------------------------------- */

test('skin is recognised across a wide range of luminance', () => {
  // The same chroma at three exposures: the locus test is deliberately
  // chroma-only, because it is luma that varies between skin tones and
  // between a lit hand and a shaded one.
  for (const scale of [0.55, 1, 1.35]) {
    const r = 0.804 * scale;
    const g = 0.588 * scale;
    const b = 0.49 * scale;
    const luma = r * 0.299 + g * 0.587 + b * 0.114;
    assert.ok(hand.isSkin((b - luma) * 0.564, (r - luma) * 0.713, luma), `scale ${scale}`);
  }
});

test('a grey wall and a blue wall are not skin', () => {
  const grey = 0.5;
  assert.equal(hand.isSkin(0, 0, grey), false);
  const b = 0.7;
  const luma = 0.2 * 0.299 + 0.2 * 0.587 + b * 0.114;
  assert.equal(hand.isSkin((b - luma) * 0.564, (0.2 - luma) * 0.713, luma), false);
});

test('a finger arriving, settling and dwelling commits exactly once', () => {
  const buffers = hand.createBuffers();
  const state = hand.createHand();
  const step = (tipY) => hand.readFrame(buffers, state, ...Object.values(frame({ finger: { tipY } })).slice(0, 0)
    .concat([frame({ finger: { tipY } }).data, 96, 128, 0.2]));

  let commits = 0;
  for (const tipY of [70, 64, 60, 60, 60, 60, 60, 60, 60, 60]) {
    const f = frame({ finger: { tipY } });
    const out = hand.readFrame(buffers, state, f.data, f.width, f.height, 0.2);
    if (out.commit) commits += 1;
  }
  assert.equal(commits, 1, 'one dwell is one point, not a stream of them');
  void step;
});

test('a dwelling finger keeps its lock even though it has stopped moving', () => {
  // This is the failure the gate exists to prevent: motion alone loses a hand
  // the instant it holds still, which is exactly when the gesture fires.
  const buffers = hand.createBuffers();
  const state = hand.createHand();
  for (const tipY of [70, 64, 60]) {
    const f = frame({ finger: { tipY } });
    hand.readFrame(buffers, state, f.data, f.width, f.height, 0.2);
  }
  const f = frame({ finger: { tipY: 60 } });
  const out = hand.readFrame(buffers, state, f.data, f.width, f.height, 0.2);
  assert.ok(out.present, 'still tracked');
  assert.ok(out.area > 0.01, 'and still a real blob, not a remembered one');
});

test('a finger creeping in slowly is still acquired', () => {
  // The regression this exists for: when motion was a per-cell filter, a slow
  // approach only ever registered at the finger's leading and trailing edges,
  // so the mask kept a rim of a few cells and threw the hand away. Motion has
  // to qualify the whole component, not each pixel of it.
  const buffers = hand.createBuffers();
  const state = hand.createHand();
  let acquired = false;
  // Two grid cells of travel per frame — slower than any real hand.
  for (let tipY = 120; tipY >= 56; tipY -= 4) {
    const f = frame({ finger: { tipY } });
    const out = hand.readFrame(buffers, state, f.data, f.width, f.height, 0.1);
    if (out.present && out.area > 0.02) acquired = true;
  }
  assert.ok(acquired, 'the whole finger is tracked, not a rim of moving edges');
});

test('a hand that leaves and returns is picked up again', () => {
  const buffers = hand.createBuffers();
  const state = hand.createHand();
  const sweep = (tips) => {
    let seen = false;
    for (const tipY of tips) {
      const f = tipY === null ? frame({}) : frame({ finger: { tipY } });
      const out = hand.readFrame(buffers, state, f.data, f.width, f.height, 0.15);
      if (out.present) seen = true;
    }
    return seen;
  };
  assert.ok(sweep([110, 90, 70, 60, 60]), 'acquired the first time');
  assert.ok(!sweep([null, null, null]), 'and let go when the hand left');
  assert.ok(sweep([110, 90, 70, 60, 60]), 'and acquired it again');
});

test('a static skin-toned wall never latches', () => {
  // Pine, terracotta and unpainted plaster all sit inside the skin locus.
  // Requiring motion to acquire is the only thing keeping them out.
  const buffers = hand.createBuffers();
  const state = hand.createHand();
  let commits = 0;
  for (let i = 0; i < 12; i += 1) {
    const f = frame({ bg: [190, 140, 118] });
    const out = hand.readFrame(buffers, state, f.data, f.width, f.height, 0.2);
    if (out.commit) commits += 1;
  }
  assert.equal(commits, 0);
});

test('a hand sweeping across the frame moves the cursor without committing', () => {
  const buffers = hand.createBuffers();
  const state = hand.createHand();
  let commits = 0;
  for (const x0 of [10, 24, 38, 52, 66, 80]) {
    const f = frame({ finger: { tipY: 50, x0, w: 14 } });
    const out = hand.readFrame(buffers, state, f.data, f.width, f.height, 0.2);
    if (out.commit) commits += 1;
  }
  assert.equal(commits, 0, 'travel is not a dwell');
});

test('the fingertip is the end of the finger, not the middle of the hand', () => {
  const f = frame({ finger: { tipY: 40 } });
  const buffers = hand.createBuffers();
  const state = hand.createHand();
  const out = hand.readFrame(buffers, state, f.data, f.width, f.height, 0.2);
  // The blob runs from y = 40 to the bottom edge; its centroid is near 0.77 of
  // the frame and its tip near 0.31. The tracker must report the tip.
  assert.ok(out.y < 0.45, `tip at ${out.y.toFixed(2)} should be near the top of the blob`);
});

test('covering the lens is rejected rather than treated as a giant finger', () => {
  const buffers = hand.createBuffers();
  const state = hand.createHand();
  let commits = 0;
  for (let i = 0; i < 10; i += 1) {
    const f = frame({ finger: { tipY: 0, x0: 0, w: 96 } });
    const out = hand.readFrame(buffers, state, f.data, f.width, f.height, 0.2);
    if (out.commit) commits += 1;
  }
  assert.equal(commits, 0);
});

/* --- the frame analyser ------------------------------------------------- */

test('a dark room measures dark and a bright one bright', () => {
  const dark = frame({ bg: [46, 40, 30] });
  const bright = frame({ bg: [180, 182, 190] });
  const ds = finish.frameStats(dark.data, dark.width, dark.height);
  const bs = finish.frameStats(bright.data, bright.width, bright.height);
  assert.ok(ds.luma < 0.2 && bs.luma > 0.6);
  // Red over blue: the tungsten-lit room is warm, the daylit one is not.
  assert.ok(ds.warmth > 1.3 && bs.warmth < 1.05);
});

test('signals carry evidence and a confidence, and stay sorted', () => {
  const dark = frame({ bg: [46, 40, 30] });
  const stats = finish.frameStats(dark.data, dark.width, dark.height);
  const found = finish.signals(stats, room('Living', 'living', 6, 5, 2.35));
  assert.ok(found.length > 0);
  for (const signal of found) {
    assert.ok(signal.confidence > 0 && signal.confidence <= 1);
    assert.ok(signal.evidence.length > 10, 'every signal shows its working');
  }
  for (let i = 1; i < found.length; i += 1) {
    assert.ok(found[i - 1].confidence >= found[i].confidence);
  }
  assert.ok(found.some((s) => s.id === 'dim'));
  assert.ok(found.some((s) => s.id === 'low-ceiling'));
});

test('a bright, tall room raises none of the complaints a dark one does', () => {
  const bright = frame({ bg: [176, 180, 190] });
  const stats = finish.frameStats(bright.data, bright.width, bright.height);
  const found = finish.signals(stats, room('Living', 'living', 6, 5, 3.1));
  assert.ok(!found.some((s) => s.id === 'dim'));
  assert.ok(!found.some((s) => s.id === 'low-ceiling'));
  assert.ok(!found.some((s) => s.id === 'warm-cast'));
});

test('presentation scores a good room above a bad one', () => {
  const dark = frame({ bg: [46, 40, 30] });
  const bright = frame({ bg: [176, 180, 190] });
  const bad = finish.presentation(finish.frameStats(dark.data, dark.width, dark.height), room('R', 'living', 6, 5, 2.3));
  const good = finish.presentation(finish.frameStats(bright.data, bright.width, bright.height), room('R', 'living', 6, 5, 3.1));
  assert.ok(good.score > bad.score + 0.3);
  assert.ok(typeof good.band === 'string' && good.band.length > 0);
});

test('averaging ignores frames that carry no samples', () => {
  const real = finish.frameStats(frame({ bg: [120, 120, 120] }).data, 96, 128);
  const empty = finish.frameStats(new Uint8ClampedArray(0), 0, 0);
  const mean = finish.meanStats([real, empty, null, undefined]);
  assert.ok(Math.abs(mean.luma - real.luma) < 1e-9);
});

/* --- the report --------------------------------------------------------- */

test('a report prices the work against the measured areas', () => {
  const built = report.buildReport({
    rooms: HOUSE, pricePerSqft: 420, ceilingPricePerSqft: 610, totalSqft: 2100,
    tier: 'elevated', condition: 'dated',
  });
  assert.ok(built.recommendations.length > 5);
  assert.equal(built.market.value, 2100 * 420);
  assert.equal(built.market.ceiling, 2100 * 610);
  for (const item of built.recommendations) {
    assert.ok(item.cost.low <= item.cost.high, `${item.id} band is ordered`);
    assert.ok(item.cost.mid > 0);
    assert.ok(Number.isFinite(item.roi));
  }
});

test('total uplift never exceeds what the street will bear', () => {
  // The whole point of the engine. Sum every recommendation's uplift and it
  // must still fit inside the headroom.
  for (const ceiling of [430, 500, 610, 900]) {
    const built = report.buildReport({
      rooms: HOUSE, pricePerSqft: 420, ceilingPricePerSqft: ceiling, totalSqft: 2100,
      tier: 'luxury', condition: 'tired',
    });
    const total = built.recommendations.reduce((sum, r) => sum + r.uplift, 0);
    assert.ok(total <= built.market.headroom + 1,
      `ceiling ${ceiling}: uplift ${total} exceeded headroom ${built.market.headroom}`);
  }
});

test('a property already at the ceiling is told the work returns nothing', () => {
  const built = report.buildReport({
    rooms: HOUSE, pricePerSqft: 600, ceilingPricePerSqft: 600, totalSqft: 2100,
    tier: 'luxury', condition: 'dated',
  });
  assert.equal(built.market.headroom, 0);
  assert.equal(built.totals.uplift, 0);
  assert.ok(built.recommendations.every((r) => r.uplift === 0));
  assert.ok(built.recommendations.every((r) => r.verdict.includes('lifestyle')));
  assert.ok(built.totals.net <= 0, 'and the bottom line is not dressed up');
});

test('returns diminish as the headroom fills rather than falling off a cliff', () => {
  const built = report.buildReport({
    rooms: HOUSE, pricePerSqft: 420, ceilingPricePerSqft: 610, totalSqft: 2100,
    tier: 'elevated', condition: 'dated',
  });
  const slacks = built.recommendations.map((r) => r.slack);
  for (let i = 1; i < slacks.length; i += 1) {
    assert.ok(slacks[i] <= slacks[i - 1] + 1e-9, 'each item sees less headroom than the last');
  }
  assert.ok(slacks[0] > 0.9, 'the first item gets its full return');
  assert.ok(slacks[slacks.length - 1] < slacks[0], 'the last one does not');
});

test('the cheap high-return work outranks the expensive rebuild', () => {
  const built = report.buildReport({
    rooms: HOUSE, pricePerSqft: 420, ceilingPricePerSqft: 700, totalSqft: 2100,
    tier: 'elevated', condition: 'dated',
  });
  const rank = (id) => built.recommendations.findIndex((r) => r.id === id);
  const staging = rank('stage');
  const kitchen = rank('kitchen-major');
  assert.ok(staging >= 0 && kitchen >= 0);
  assert.ok(staging < kitchen, 'staging is ranked above a full kitchen rebuild');
  assert.ok(built.recommendations[staging].roi > built.recommendations[kitchen].roi);
});

test('a luxury specification costs more and returns a smaller share of it', () => {
  const base = { rooms: HOUSE, pricePerSqft: 420, ceilingPricePerSqft: 900, totalSqft: 2100, condition: 'dated' };
  const mid = report.buildReport({ ...base, tier: 'elevated' });
  const lux = report.buildReport({ ...base, tier: 'luxury' });
  const cost = (r, id) => r.recommendations.find((x) => x.id === id)?.cost.mid ?? 0;
  const recoup = (r, id) => r.recommendations.find((x) => x.id === id)?.recoup.mid ?? 0;
  assert.ok(cost(lux, 'bath-primary') > cost(mid, 'bath-primary'));
  assert.ok(recoup(lux, 'bath-primary') < recoup(mid, 'bath-primary'));
});

test('work is sequenced so nothing is built on top of work still to come', () => {
  const built = report.buildReport({
    rooms: HOUSE, pricePerSqft: 420, ceilingPricePerSqft: 700, totalSqft: 2100,
    tier: 'elevated', condition: 'tired',
  });
  const order = built.phases.map((p) => p.key);
  const rank = (key) => report.PHASES.findIndex((p) => p.key === key);
  for (let i = 1; i < order.length; i += 1) {
    assert.ok(rank(order[i - 1]) < rank(order[i]), 'phases run in build order');
  }
  if (order.includes('systems') && order.includes('surface')) {
    assert.ok(order.indexOf('systems') < order.indexOf('surface'),
      'wiring goes in before the walls are closed');
  }
});

test('the garage door is not recommended to a house with no garage', () => {
  const withGarage = report.buildReport({ rooms: HOUSE, pricePerSqft: 420, totalSqft: 2100, hasGarage: true });
  const without = report.buildReport({ rooms: HOUSE, pricePerSqft: 420, totalSqft: 2100, hasGarage: false });
  assert.ok(withGarage.recommendations.some((r) => r.id === 'curb-garage'));
  assert.ok(!without.recommendations.some((r) => r.id === 'curb-garage'));
});

test('an extra bathroom is proposed only when the count is short', () => {
  const short = report.buildReport({
    rooms: [room('B1', 'bedroom', 4, 4), room('B2', 'bedroom', 4, 4), room('B3', 'bedroom', 4, 4), room('Bath', 'bathroom', 2.4, 2.2)],
    pricePerSqft: 420, totalSqft: 2100,
  });
  const plenty = report.buildReport({
    rooms: [room('B1', 'bedroom', 4, 4), room('Bath', 'bathroom', 2.4, 2.2), room('Bath2', 'bathroom', 2.4, 2.2)],
    pricePerSqft: 420, totalSqft: 2100,
  });
  assert.ok(short.recommendations.some((r) => r.id === 'bath-add'));
  assert.ok(!plenty.recommendations.some((r) => r.id === 'bath-add'));
});

test('a survey that walked part of the house says so', () => {
  const built = report.buildReport({ rooms: HOUSE, pricePerSqft: 420, totalSqft: 2100 });
  assert.ok(built.market.surveyedShare < 0.5);
  // And valuing off the listed area, not the walked area, or a four-room walk
  // of a large house would report it as a shed.
  assert.equal(built.market.value, 2100 * 420);
});

test('with no market figures at all the report still builds', () => {
  const built = report.buildReport({ rooms: HOUSE });
  assert.equal(built.market.value, 0);
  assert.equal(built.market.headroom, 0);
  assert.ok(built.recommendations.length > 0, 'the work is still identified');
  assert.ok(built.recommendations.every((r) => r.uplift === 0), 'but nothing is claimed about value');
});

test('an empty survey produces no recommendations rather than a crash', () => {
  const built = report.buildReport({ rooms: [] });
  assert.ok(Array.isArray(built.recommendations));
  assert.equal(built.totals.uplift, 0);
});

test('every recommendation carries a caveat the operator has to read', () => {
  const built = report.buildReport({ rooms: HOUSE, pricePerSqft: 420, totalSqft: 2100 });
  assert.match(built.caveat, /[Nn]ot an appraisal/);
  for (const item of built.recommendations) {
    assert.ok(item.watchout.length > 20, `${item.id} states what to watch for`);
    assert.ok(item.blurb.length > 20);
  }
});

test('the text export is complete enough to hand to a client', () => {
  const built = report.buildReport({
    rooms: HOUSE, pricePerSqft: 420, ceilingPricePerSqft: 610, totalSqft: 2100,
    signals: [{ id: 'dim', label: 'Reads dark on camera', confidence: 0.8, evidence: 'mean brightness 16%' }],
  });
  const text = report.toText(built, '1490 Aspen Court');
  assert.ok(text.includes('1490 Aspen Court'));
  assert.ok(text.includes('Headroom'));
  assert.ok(text.includes('WHAT THE CAMERA SAW'));
  assert.ok(text.includes('Reads dark on camera'));
  assert.ok(text.includes('BOTTOM LINE'));
  assert.ok(text.includes('Not an appraisal'));
  assert.ok(text.includes('Survey coverage'), 'a partial walk is disclosed');
});
