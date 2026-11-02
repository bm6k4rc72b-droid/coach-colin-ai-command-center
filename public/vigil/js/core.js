/**
 * VIGIL — pure logic shared by the app and the tests (no DOM).
 *
 * - Catalog totals and the monthly payment schedule (the enterprise deal).
 * - Unit economics for selling the platform per bed / per home.
 * - The escalation ladder an alert walks through.
 * - A tiny resident-pose simulator: standing, walking, seated, falling, on floor.
 *
 * @module vigil/core
 */

/** Sum of each section and the grand total. */
export function totals(catalog) {
  const sections = catalog.sections.map((s) => ({
    id: s.id,
    name: s.name,
    total: s.items.reduce((a, i) => a + i.price, 0),
  }));
  const total = sections.reduce((a, s) => a + s.total, 0);
  return { sections, total };
}

/**
 * 12 equal monthly payments in cents; the rounding remainder goes on the first payment,
 * like the "first payment $37,280.05" line on a quote.
 */
export function schedule(total, months = 12) {
  const cents = Math.round(total * 100);
  const each = Math.floor(cents / months);
  const first = cents - each * (months - 1);
  return { monthly: each / 100, first: first / 100, months };
}

export const money = (n, dp = 2) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });

/**
 * Unit economics for running VIGIL as a business.
 * @param {{beds:number, homes:number, bedPrice:number, homePrice:number, bedCost:number, homeCost:number, kitPrice:number, kitCost:number}} p
 */
export function unitEconomics(p) {
  const mrr = p.beds * p.bedPrice + p.homes * p.homePrice;
  const cogs = p.beds * p.bedCost + p.homes * p.homeCost;
  const kitMargin = p.homes * (p.kitPrice - p.kitCost);
  const arr = mrr * 12;
  const grossMargin = mrr ? (mrr - cogs) / mrr : 0;
  return { mrr, arr, cogs, grossMargin, kitMargin, yearOneGross: (mrr - cogs) * 12 + kitMargin };
}

/** The ladder an unacknowledged alert climbs. Seconds are from detection. */
export const LADDER = Object.freeze([
  { at: 0, who: 'Edge AI', what: 'Pose drop + floor posture confirmed' },
  { at: 2, who: 'AI verifier', what: 'Second look by vision-language model' },
  { at: 4, who: 'Nearest caregiver', what: 'Critical push + badge vibrate' },
  { at: 6, who: 'Voice concierge', what: '“Are you alright?” in-room check' },
  { at: 60, who: 'Charge nurse', what: 'Escalated: no acknowledgement' },
  { at: 180, who: 'Family + on-call manager', what: 'SMS and call' },
  { at: 300, who: '911 dispatch', what: 'If no responder on scene' },
]);

/** Which ladder steps have fired after `t` seconds, stopping once acknowledged at `ack`. */
export function ladderAt(t, ack = Infinity) {
  return LADDER.map((s) => ({ ...s, state: s.at <= Math.min(t, ack) ? 'done' : s.at <= t ? 'skipped' : 'waiting' }));
}

/** Seeded PRNG so the demo is the same every load. */
export function rng(seed = 7) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/**
 * Resident pose at time t for a simulated room. Returns 17 COCO-style keypoints
 * in room-normalised coordinates (0..1) plus the activity label.
 *
 * @param {{x:number, y:number, phase:number, fallAt?:number}} r resident state
 * @param {number} t seconds
 */
export function pose(r, t) {
  const fall = r.fallAt != null && t >= r.fallAt ? Math.min(1, (t - r.fallAt) / 0.7) : 0;
  const walk = Math.sin(t * 2.4 + r.phase);
  const cx = r.x + (fall || r.seated ? 0 : 0.12 * Math.sin(t * 0.25 + r.phase));
  const footY = r.y;
  const H = 0.42; // standing height in room units
  const ang = fall * (Math.PI / 2) * 0.96; // tip over around the feet
  const pts = {
    head: [0, H], neck: [0, H * 0.84], hip: [0, H * 0.5],
    lsh: [-0.05, H * 0.82], rsh: [0.05, H * 0.82],
    lel: [-0.07, H * 0.66], rel: [0.07, H * 0.66],
    lwr: [-0.06 - 0.02 * walk, H * 0.52], rwr: [0.06 + 0.02 * walk, H * 0.52],
    lhp: [-0.035, H * 0.5], rhp: [0.035, H * 0.5],
    lkn: [-0.04 + 0.03 * walk * (1 - fall), H * 0.26], rkn: [0.04 - 0.03 * walk * (1 - fall), H * 0.26],
    lan: [-0.04 + 0.05 * walk * (1 - fall), 0], ran: [0.04 - 0.05 * walk * (1 - fall), 0],
  };
  if (r.seated && !fall) {
    // in an armchair: hips at seat height, thighs forward, shins down
    Object.assign(pts, {
      head: [0, H * 0.78], neck: [0, H * 0.64], hip: [0, H * 0.3],
      lsh: [-0.05, H * 0.62], rsh: [0.05, H * 0.62], lel: [-0.06, H * 0.47], rel: [0.07, H * 0.47],
      lwr: [0.03, H * 0.4], rwr: [0.08, H * 0.4], lhp: [-0.03, H * 0.3], rhp: [0.03, H * 0.3],
      lkn: [0.07, H * 0.3], rkn: [0.11, H * 0.3], lan: [0.07, 0], ran: [0.11, 0],
    });
  }
  const out = {};
  for (const [k, [px, py]] of Object.entries(pts)) {
    const rx = px * Math.cos(ang) + py * Math.sin(ang);
    const ry = -px * Math.sin(ang) + py * Math.cos(ang);
    out[k] = [cx + rx, footY - ry];
  }
  const label = fall >= 1 ? 'On floor' : fall > 0 ? 'Falling' : r.seated ? 'Seated' : 'Walking';
  return { kp: out, fall, label };
}

/** Bounding box of a pose → aspect ratio check the FallWatch uses (wide = lying). */
export function poseBox(kp) {
  const xs = Object.values(kp).map((p) => p[0]);
  const ys = Object.values(kp).map((p) => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return [x, y, Math.max(...xs) - x, Math.max(...ys) - y];
}

export const BONES = [
  ['head', 'neck'], ['neck', 'lsh'], ['neck', 'rsh'], ['lsh', 'lel'], ['lel', 'lwr'], ['rsh', 'rel'], ['rel', 'rwr'],
  ['neck', 'hip'], ['hip', 'lhp'], ['hip', 'rhp'], ['lhp', 'lkn'], ['lkn', 'lan'], ['rhp', 'rkn'], ['rkn', 'ran'],
];
