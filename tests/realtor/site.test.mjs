/**
 * Unit tests for the estate site's non-visual logic: the scroll maths, the
 * geometry builders, the mortgage arithmetic, the portfolio queries, the
 * concierge's grammar and the camera gesture tracker.
 *
 * Everything under test is pure by construction, so nothing here needs a DOM,
 * a camera or a microphone. `window` is stubbed only because `voice.js` reads
 * it at import time.
 */

import assert from 'node:assert/strict';
import { test } from 'node:test';

globalThis.window = globalThis.window || {};

const { EASE, approach, clamp, mix, perspective, progress, rng, smoothstep } = await import('../../public/jose-montes/js/mathkit.js');
const { activeChapter, beat, countTo, documentProgress, integrateImpulse, parallaxOffset, pinState, revealAmount } = await import('../../public/jose-montes/js/scroll.js');
const { buildEstate, buildMotes, buildOcean, buildRing } = await import('../../public/jose-montes/js/geometry.js');
const { COUNTY_TAX_RATE, affordablePrice, equityAfter, monthlyPayment, ownershipCost } = await import('../../public/jose-montes/js/finance.js');
const { AGENT, LISTINGS, matchListing, money, pricePerSqft, selectListings, specLine } = await import('../../public/jose-montes/js/listings.js');
const { extractMoney, parseRequest, respond } = await import('../../public/jose-montes/js/concierge.js');
const { createTracker, downsample, motionField, trackGesture } = await import('../../public/jose-montes/js/motion.js');
const { clauses, pickVoice, scoreVoice } = await import('../../public/jose-montes/js/voice.js');

/* --- the scroll engine -------------------------------------------------- */

test('a pinned scene reports before, pinned and after', () => {
  const scene = { top: 1000, height: 3000, viewport: 1000 };
  assert.equal(pinState({ ...scene, scrollY: 500 }).phase, 'before');
  assert.equal(pinState({ ...scene, scrollY: 1000 }).phase, 'before');
  assert.equal(pinState({ ...scene, scrollY: 2000 }).phase, 'pinned');
  assert.equal(pinState({ ...scene, scrollY: 3000 }).phase, 'after');
  assert.equal(pinState({ ...scene, scrollY: 9999 }).phase, 'after');
});

test('a pin timeline runs 0 to 1 across the held pixels, and reverses', () => {
  const scene = { top: 0, height: 3000, viewport: 1000 };
  assert.equal(pinState({ ...scene, scrollY: 1000 }).t, 0.5);
  assert.equal(pinState({ ...scene, scrollY: 500 }).t, 0.25);
  // The same offset always gives the same t: scrubbing back is exact, not
  // an animation that has to be unwound.
  assert.equal(
    pinState({ ...scene, scrollY: 1234 }).t,
    pinState({ ...scene, scrollY: 1234 }).t,
  );
});

test('a scene with no room to hold is never pinned', () => {
  const state = pinState({ top: 0, height: 800, scrollY: 400, viewport: 1000 });
  assert.equal(state.phase, 'after');
  assert.equal(state.t, 1);
});

test('document progress spans the scrollable travel', () => {
  assert.equal(documentProgress(0, 3000, 1000), 0);
  assert.equal(documentProgress(2000, 3000, 1000), 1);
  assert.equal(documentProgress(1000, 3000, 1000), 0.5);
  // A document shorter than the viewport cannot be scrolled at all.
  assert.equal(documentProgress(0, 500, 1000), 0);
});

test('beats carve a sub-range out of a scene timeline', () => {
  assert.equal(beat(0.1, 0.2, 0.8), 0);
  assert.equal(beat(0.9, 0.2, 0.8), 1);
  assert.ok(beat(0.5, 0.2, 0.8) > 0.4 && beat(0.5, 0.2, 0.8) < 0.6);
});

test('reveal rises as an element climbs the viewport', () => {
  const geo = { height: 300, viewport: 1000 };
  assert.equal(revealAmount({ ...geo, top: 1000 }), 0);
  assert.equal(revealAmount({ ...geo, top: 200 }), 1);
  const middle = revealAmount({ ...geo, top: 700 });
  assert.ok(middle > 0 && middle < 1, `middle was ${middle}`);
});

test('an element taller than the viewport still completes its reveal', () => {
  const value = revealAmount({ top: 100, height: 4000, viewport: 1000 });
  assert.equal(value, 1);
});

test('parallax is signed by depth and centred on the viewport', () => {
  const near = parallaxOffset({ top: 500, viewport: 1000, depth: 0.5, distance: 100 });
  assert.equal(near, 0);
  const above = parallaxOffset({ top: 0, viewport: 1000, depth: 0.5, distance: 100 });
  const below = parallaxOffset({ top: 1000, viewport: 1000, depth: 0.5, distance: 100 });
  assert.ok(above > 0 && below < 0);
  // A negative depth leads the scroll instead of trailing it.
  assert.ok(parallaxOffset({ top: 0, viewport: 1000, depth: -0.5, distance: 100 }) < 0);
});

test('counters interpolate and settle exactly on the target', () => {
  assert.equal(countTo(0, 0, 412), 0);
  assert.equal(countTo(1, 0, 412), 412);
  assert.ok(countTo(0.5, 0, 412) > 0);
});

test('the current chapter is the last one past the marker line', () => {
  const chapters = [{ top: 0 }, { top: 2000 }, { top: 5000 }];
  assert.equal(activeChapter(chapters, 0, 900), 0);
  assert.equal(activeChapter(chapters, 1800, 900), 1);
  assert.equal(activeChapter(chapters, 9000, 900), 2);
});

test('impulses are capped, blended and allowed to die', () => {
  assert.ok(Math.abs(integrateImpulse(0, 100000)) <= 140 * 4);
  assert.equal(integrateImpulse(0.01, 0), 0);
  const momentum = integrateImpulse(0, 60);
  assert.ok(momentum > 0 && integrateImpulse(momentum, 0) < momentum);
});

/* --- mathkit ------------------------------------------------------------ */

test('easing curves start at zero and finish at one', () => {
  for (const [name, curve] of Object.entries(EASE)) {
    assert.ok(Math.abs(curve(0)) < 1e-6, `${name} at 0`);
    assert.ok(Math.abs(curve(1) - 1) < 1e-6, `${name} at 1`);
  }
});

test('approach is frame-rate independent', () => {
  // One second of convergence must land in the same place whether it is taken
  // in one step or in sixty.
  const once = approach(0, 100, 0.9, 1);
  let stepped = 0;
  for (let i = 0; i < 60; i += 1) stepped = approach(stepped, 100, 0.9, 1 / 60);
  assert.ok(Math.abs(once - stepped) < 0.5, `${once} vs ${stepped}`);
});

test('clamp, mix, progress and smoothstep behave', () => {
  assert.equal(clamp(5, 0, 1), 1);
  assert.equal(mix(10, 20, 0.5), 15);
  assert.equal(progress(5, 0, 10), 0.5);
  assert.equal(progress(5, 5, 5), 1);
  assert.equal(smoothstep(0, 1, 0.5), 0.5);
});

test('the random generator is deterministic and bounded', () => {
  const a = rng(42);
  const b = rng(42);
  for (let i = 0; i < 100; i += 1) {
    const value = a();
    assert.equal(value, b());
    assert.ok(value >= 0 && value < 1);
  }
});

test('the projection matrix is the OpenGL one', () => {
  const m = perspective(Math.PI / 4, 1.5, 0.1, 100);
  assert.equal(m.length, 16);
  assert.equal(m[11], -1);
  assert.ok(m[0] > 0 && m[5] > 0);
});

/* --- geometry ----------------------------------------------------------- */

test('every mesh is a well-formed line list', () => {
  for (const [name, geo] of Object.entries({ estate: buildEstate(), ocean: buildOcean(8, 8), ring: buildRing(10, 24) })) {
    assert.equal(geo.positions.length, geo.count * 3, `${name} positions`);
    assert.equal(geo.order.length, geo.count * 2, `${name} order`);
    assert.equal(geo.count % 2, 0, `${name} has whole segments`);
    assert.ok(geo.positions.every(Number.isFinite), `${name} is finite`);
  }
});

test('the estate assembles from the ground up', () => {
  const { order, positions, count } = buildEstate();
  // Vertex order is the assembly channel; intensity is the second component.
  for (let i = 0; i < count; i += 1) {
    const step = order[i * 2];
    assert.ok(step >= 0 && step <= 1, `order ${step}`);
  }
  // The first thing drawn is the slab, and it is at ground level.
  let lowest = Infinity;
  let lowestOrder = 1;
  for (let i = 0; i < count; i += 1) {
    if (order[i * 2] < lowestOrder) { lowestOrder = order[i * 2]; lowest = positions[i * 3 + 1]; }
  }
  assert.ok(lowest <= 0.01, `first edge sits at y=${lowest}`);
});

test('the mote field is deterministic for a seed', () => {
  const a = buildMotes(50, 3);
  const b = buildMotes(50, 3);
  assert.deepEqual(Array.from(a.positions), Array.from(b.positions));
  assert.equal(a.seeds.length, 100);
});

/* --- the money ---------------------------------------------------------- */

test('the payment formula matches the standard annuity', () => {
  // $1,000,000 at 6.25% over 30 years is $6,157.17 — the figure any lender's
  // sheet prints for the same inputs.
  assert.ok(Math.abs(monthlyPayment(1000000, 0.0625, 30) - 6157.17) < 0.01);
  // A zero rate is simple division, not a divide by zero.
  assert.equal(monthlyPayment(360000, 0, 30), 1000);
  assert.equal(monthlyPayment(0, 0.06, 30), 0);
});

test('ownership cost carries tax, insurance and PMI', () => {
  const twenty = ownershipCost({ price: 1250000, downPct: 0.2, rate: 0.0625 });
  assert.equal(twenty.pmi, 0, 'no PMI at 80% LTV');
  assert.ok(Math.abs(twenty.tax - (1250000 * COUNTY_TAX_RATE) / 12) < 0.01);
  assert.ok(twenty.total > twenty.principalInterest, 'total exceeds the loan alone');

  const five = ownershipCost({ price: 1250000, downPct: 0.05, rate: 0.0625 });
  assert.ok(five.pmi > 0, 'PMI applies above 80% LTV');
  assert.ok(five.total > twenty.total);
});

test('affordability inverts the cost, including its moving parts', () => {
  const budget = 9000;
  const price = affordablePrice({ budget, downPct: 0.2, rate: 0.0625 });
  const back = ownershipCost({ price, downPct: 0.2, rate: 0.0625 });
  assert.ok(Math.abs(back.total - budget) < 25, `round trip landed at ${back.total}`);
  assert.equal(affordablePrice({ budget: 0, downPct: 0.2, rate: 0.06 }), 0);
});

test('equity is appreciation plus principal paid down', () => {
  const held = equityAfter({ price: 1000000, downPct: 0.2, rate: 0.0625, years: 7 });
  assert.ok(held.paidDown > 0 && held.gained > 0);
  assert.ok(Math.abs(held.equity - (held.value - held.balance)) < 0.01);
  // Held to term, the loan is gone.
  const paid = equityAfter({ price: 1000000, downPct: 0.2, rate: 0.0625, years: 30 });
  assert.ok(paid.balance < 1, `balance ${paid.balance}`);
});

/* --- the portfolio ------------------------------------------------------ */

test('prices format the way a listing sheet does', () => {
  assert.equal(money(1250000), '$1.25M');
  assert.equal(money(1495000), '$1.5M');
  assert.equal(money(738000000), '$738M');
  assert.equal(money(7647.31, true), '$7,647');
  assert.equal(money(NaN), '—');
});

test('listings expose consistent specs', () => {
  for (const listing of LISTINGS) {
    assert.ok(listing.price > 0 && listing.sqft > 0);
    assert.ok(pricePerSqft(listing) > 100);
    assert.match(specLine(listing), /bed · .* bath · .* sqft/);
    assert.ok(['active', 'pending', 'sold'].includes(listing.status));
  }
  assert.ok(AGENT.name.length > 0);
});

test('selection filters and sorts', () => {
  assert.ok(selectListings(LISTINGS, { status: 'sold' }).every((l) => l.status === 'sold'));
  assert.ok(selectListings(LISTINGS, { text: 'pismo' }).every((l) => /pismo/i.test(l.city)));
  assert.equal(selectListings(LISTINGS, { text: 'no such place' }).length, 0);
  const cheapFirst = selectListings(LISTINGS, { sort: 'price' });
  assert.ok(cheapFirst[0].price <= cheapFirst[cheapFirst.length - 1].price);
  assert.ok(selectListings(LISTINGS, { maxPrice: 1500000 }).every((l) => l.price <= 1500000));
});

test('listings are found by number, street, city or description', () => {
  assert.equal(matchListing(LISTINGS, 'tell me about 123 ocean view').id, 'ocean-view-123');
  assert.equal(matchListing(LISTINGS, 'the bluff one').id, 'bluff-trail-8');
  assert.equal(matchListing(LISTINGS, 'anything in avila').id, 'harbor-light-19');
  assert.equal(matchListing(LISTINGS, 'the vineyard estate').id, 'vintners-ridge-77');
  assert.equal(matchListing(LISTINGS, 'completely unrelated'), null);
  assert.equal(matchListing(LISTINGS, ''), null);
});

/* --- the concierge ------------------------------------------------------ */

test('the grammar separates commands, questions and properties', () => {
  const cases = [
    ['hello there', 'greet'],
    ['help', 'help'],
    ['show me the listings', 'browse'],
    ['what is the payment on 123 ocean view', 'payment'],
    ['what can I afford at eight thousand a month', 'afford'],
    ['how much is it', 'price'],
    ['how many bedrooms', 'specs'],
    ['book a tour', 'tour'],
    ['what is your track record', 'record'],
    ['how is the market', 'market'],
    ['turn the music off', 'audio'],
    ['scroll down', 'scroll'],
    ['let me scroll with my hand', 'gesture'],
    ['take me back to the top', 'navigate'],
    ['show me the most expensive one', 'extreme'],
    ['tell me about 8 bluff trail', 'listing'],
    ['stop', 'stop'],
    ['qwertyuiop', 'unknown'],
    ['', 'none'],
  ];
  for (const [utterance, intent] of cases) {
    assert.equal(parseRequest(utterance).intent, intent, utterance);
  }
});

test('a wake word does not change the meaning', () => {
  assert.equal(parseRequest('hey Jose, book a tour').intent, 'tour');
  assert.equal(parseRequest('concierge show me the listings').intent, 'browse');
});

test('the concierge answers from the data, not from a script', () => {
  const listing = LISTINGS[0];
  const payment = respond(parseRequest('what is the payment'), { listing, rate: 0.0625 });
  const expected = ownershipCost({ price: listing.price, downPct: 0.2, rate: 0.0625 });
  assert.ok(payment.say.includes(money(expected.total, true)), payment.say);
  assert.equal(payment.action.type, 'goto');

  // A price question that names a property is about that property, not about
  // whatever happens to be on screen.
  const price = respond(parseRequest('how much is 8 bluff trail'), { listing: LISTINGS[0] });
  assert.ok(price.say.includes(money(2895000)), price.say);
  assert.equal(price.action.value, 'bluff-trail-8');

  const elsewhere = respond(parseRequest('what is the payment on the vineyard estate'), { listing: LISTINGS[0], rate: 0.0625 });
  assert.ok(elsewhere.say.startsWith('On 77 Vintners Ridge'), elsewhere.say);
});

test('actions are a small, closed vocabulary', () => {
  const allowed = new Set(['goto', 'focus', 'scroll', 'audio', 'gesture', 'stop']);
  const utterances = [
    'show me the listings', 'book a tour', 'scroll up', 'turn the music on',
    'let me use my hand', 'stop', 'the most expensive one', 'what is the payment',
    'what can I afford', 'contact', 'your track record', 'how is the market',
  ];
  for (const utterance of utterances) {
    const action = respond(parseRequest(utterance), {}).action;
    if (action) assert.ok(allowed.has(action.type), `${utterance} -> ${action.type}`);
  }
});

test('budgets are read from digits, shorthand and words', () => {
  assert.equal(extractMoney('about $8,500 a month'), 8500);
  assert.equal(extractMoney('8k a month'), 8000);
  assert.equal(extractMoney('eight thousand a month'), 8000);
  assert.equal(extractMoney('1.2 million'), 1200000);
  assert.equal(extractMoney('no numbers here'), 0);
});

/* --- the gesture -------------------------------------------------------- */

test('a moving bright blob is located in the frame', () => {
  const w = 64;
  const h = 48;
  const frame = (cx, cy) => {
    const rgba = new Uint8ClampedArray(w * h * 4).fill(12);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (Math.hypot(x - cx, y - cy) < 8) {
          const i = (y * w + x) * 4;
          rgba[i] = 240; rgba[i + 1] = 240; rgba[i + 2] = 240;
        }
      }
    }
    return rgba;
  };
  const before = downsample(frame(32, 10), w, h, 16, 12);
  const after = downsample(frame(32, 34), w, h, 16, 12);
  const field = motionField(before, after, 16, 12);
  assert.ok(field.energy > 0.05, `energy ${field.energy}`);
  assert.ok(field.x > 0.35 && field.x < 0.65, `x ${field.x}`);
});

test('a still frame produces no motion at all', () => {
  const flat = new Float32Array(16 * 12).fill(0.4);
  const field = motionField(flat, Float32Array.from(flat), 16, 12);
  assert.equal(field.energy, 0);
  assert.equal(field.x, -1);
});

test('the tracker latches without jumping, then follows', () => {
  const tracker = createTracker();
  const first = trackGesture(tracker, { energy: 0.09, y: 0.2, x: 0.5 }, 1 / 30);
  assert.equal(first.present, true);
  assert.equal(first.delta, 0, 'the first frame must not scroll');

  const down = trackGesture(tracker, { energy: 0.09, y: 0.42, x: 0.5 }, 1 / 30);
  assert.ok(down.delta > 0, 'a hand moving down scrolls down');

  const up = trackGesture(tracker, { energy: 0.09, y: 0.2, x: 0.5 }, 1 / 30);
  assert.ok(up.delta < 0, 'and back up scrolls up');
});

test('a hand held still does not creep the page', () => {
  const tracker = createTracker();
  trackGesture(tracker, { energy: 0.09, y: 0.5, x: 0.5 }, 1 / 30);
  for (let i = 0; i < 20; i += 1) {
    const step = trackGesture(tracker, { energy: 0.09, y: 0.5 + (i % 2) * 0.004, x: 0.5 }, 1 / 30);
    assert.equal(step.delta, 0);
  }
});

test('faint movement never latches the tracker', () => {
  const tracker = createTracker();
  const step = trackGesture(tracker, { energy: 0.02, y: 0.5, x: 0.5 }, 1 / 30);
  assert.equal(step.present, false);
  assert.equal(step.delta, 0);
});

test('the tracker releases when the hand leaves', () => {
  const tracker = createTracker();
  trackGesture(tracker, { energy: 0.09, y: 0.3, x: 0.5 }, 1 / 30);
  trackGesture(tracker, { energy: 0.001, y: -1, x: -1 }, 0.5);
  const relatched = trackGesture(tracker, { energy: 0.09, y: 0.9, x: 0.5 }, 1 / 30);
  assert.equal(relatched.delta, 0, 'the next gesture starts clean, not from the old position');
});

test('one impulse cannot throw the page across the document', () => {
  const tracker = createTracker();
  trackGesture(tracker, { energy: 0.2, y: 0, x: 0.5 }, 1 / 30);
  const leap = trackGesture(tracker, { energy: 0.2, y: 1, x: 0.5 }, 1 / 30);
  assert.ok(Math.abs(leap.delta) <= 260, `delta ${leap.delta}`);
});

/* --- the voice ---------------------------------------------------------- */

test('the best installed voice is preferred over the default', () => {
  const voices = [
    { name: 'Albert', lang: 'en-US', localService: true },
    { name: 'Samantha', lang: 'en-US', localService: true },
    { name: 'Anna', lang: 'de-DE', localService: true },
  ];
  assert.equal(pickVoice(voices).name, 'Samantha');
  assert.ok(scoreVoice({ name: 'Ava (Premium)', lang: 'en-US' }) > scoreVoice({ name: 'Fred', lang: 'en-US' }));
  assert.equal(scoreVoice({ name: 'Anna', lang: 'de-DE' }), -1);
  assert.equal(pickVoice([{ name: 'Anna', lang: 'de-DE' }]), null);
  assert.equal(pickVoice([]), null);
});

test('lines are split into speakable clauses', () => {
  const parts = clauses('Good to meet you. I am the concierge, and I answer out loud; ask me anything.');
  assert.equal(parts.length, 4);
  assert.equal(parts[0], 'Good to meet you.');
  assert.deepEqual(clauses(''), []);
});
