/**
 * What to do to the property, in what order, and what it is worth doing.
 *
 * The analysis rests on one idea that most renovation advice quietly ignores:
 * **a block has a ceiling.** Spend enough and any house can be made beautiful,
 * but the market will only pay up to roughly what the best house on that
 * street is worth. So the engine computes headroom — the gap between what the
 * property is worth now and what the neighbourhood will bear — and then
 * *rations* uplift against it, best-returning work first. Once the headroom is
 * spent, further work still costs money and still improves the house, and this
 * report will say plainly that it no longer returns any: it is lifestyle
 * spending, which is a fine thing to choose but a bad thing to be sold.
 *
 * The numbers are planning-grade bands built from published national
 * remodelling cost-and-recoup ranges, scaled by the measured areas from the
 * survey and by the local price per square foot. They are for deciding what to
 * look at first. They are not an appraisal, a bid, or a guarantee, and every
 * surface that renders them repeats that.
 *
 * @module housewright/report
 */

import { SQFT, clamp, remap, roundMoney } from './mathkit.js';

/**
 * Finish levels. The multiplier scales every cost; the recoup adjustment
 * reflects that dearer finishes return a smaller share of what they cost.
 */
export const TIERS = {
  essential: { key: 'essential', label: 'Essential', cost: 0.72, recoup: 1.12, note: 'make it sound and clean' },
  elevated: { key: 'elevated', label: 'Elevated', cost: 1, recoup: 1, note: 'the safe middle of the market' },
  luxury: { key: 'luxury', label: 'Luxury', cost: 1.85, recoup: 0.74, note: 'specified to compete at the top of the street' },
};

/** Work sequence. Doing these out of order is how renovation money is burned. */
export const PHASES = [
  { key: 'structure', rank: 0, label: 'Structure & envelope', why: 'Anything that opens walls, moves loads or keeps water out happens before a single finish is chosen.' },
  { key: 'systems', rank: 1, label: 'Systems', why: 'Wiring, plumbing and air have to be in the walls before the walls are closed. This is the phase people skip and pay for twice.' },
  { key: 'surface', rank: 2, label: 'Surfaces & fit-out', why: 'Kitchens, baths, floors and joinery — the visible spend, and the one that is wasted if it goes in before the two phases above.' },
  { key: 'light', rank: 3, label: 'Light & atmosphere', why: 'Lighting is specified late but designed early; it is the cheapest lever on how a room reads in a photograph.' },
  { key: 'stage', rank: 4, label: 'Presentation', why: 'Last, and closest to the listing date, so it is still fresh when the photographer arrives.' },
];

/**
 * The catalogue.
 *
 * `needs` returns 0–1 for how much this property calls for the work — it is
 * where the survey geometry and the camera signals actually bite. `cost` is a
 * band in dollars before the tier multiplier. `recoup` is the share of that
 * cost the market typically returns, as a band.
 */
export const INTERVENTIONS = [
  {
    id: 'structural-opening',
    name: 'Open the wall between kitchen and living',
    phase: 'structure',
    days: [10, 21],
    cost: { fixed: [9000, 24000] },
    recoup: [0.85, 1.25],
    blurb: 'A beam in place of a partition, so the two largest rooms read as one volume.',
    watchout: 'Needs an engineer’s beam calculation and a permit. If the wall is load-bearing and the span is over about 4 m, budget toward the top of the band.',
    needs(ctx) {
      const small = ctx.rooms.filter((r) => ['kitchen', 'living', 'dining'].includes(r.type) && r.areaSqft < 240);
      if (small.length < 2) return 0;
      return clamp(0.4 + small.length * 0.2, 0, 1);
    },
  },
  {
    id: 'ceiling-raise',
    name: 'Take the main room up to the structure',
    phase: 'structure',
    days: [12, 25],
    cost: { fixed: [12000, 30000], perSqm: [140, 320] },
    recoup: [0.6, 1.0],
    blurb: 'Remove the dropped ceiling and finish to the joists or the ridge, buying height no fit-out can fake.',
    watchout: 'Only worth surveying where there is void above. Services in that ceiling have to be re-run, which is why this is a structure-phase decision.',
    needs(ctx) {
      const low = ctx.rooms.filter((r) => r.ceiling < 2.5 && r.areaSqft > 180);
      return low.length ? clamp(remap(ctx.meanCeiling, 2.55, 2.25, 0, 0.9), 0, 1) : 0;
    },
  },
  {
    id: 'roof',
    name: 'Roof covering replacement',
    phase: 'structure',
    days: [3, 8],
    cost: { fixed: [16000, 38000] },
    recoup: [0.6, 0.75],
    blurb: 'The item that stops a buyer’s inspector writing the sentence that reprices the deal.',
    watchout: 'Almost never adds value on its own — it removes a deduction. Price it as insurance, not as an improvement.',
    needs(ctx) { return ctx.condition === 'tired' ? 0.75 : ctx.condition === 'dated' ? 0.35 : 0.1; },
  },
  {
    id: 'windows',
    name: 'Replace the glazing',
    phase: 'structure',
    days: [4, 10],
    cost: { fixed: [0, 0], perUnit: [900, 2400] },
    recoup: [0.6, 0.72],
    blurb: 'Larger, better-insulated units where the survey found the glass-to-floor ratio short.',
    watchout: 'Recoup is middling everywhere. Do it for comfort, noise and the daylight the report keeps flagging — not for the resale line.',
    needs(ctx) { return clamp(remap(ctx.glazingRatio, 0.1, 0.04, 0, 1) * 0.9, 0, 1); },
  },
  {
    id: 'systems-electrical',
    name: 'Panel and circuit upgrade',
    phase: 'systems',
    days: [3, 8],
    cost: { fixed: [3200, 9500] },
    recoup: [0.5, 0.8],
    blurb: 'Capacity for induction, EV charging and the lighting plan below it.',
    watchout: 'Invisible money. It is also the reason the lighting plan is possible, so it goes in the same phase or before.',
    needs(ctx) { return ctx.condition === 'tired' ? 0.8 : ctx.condition === 'dated' ? 0.55 : 0.2; },
  },
  {
    id: 'systems-hvac',
    name: 'Heat pump and zoned air',
    phase: 'systems',
    days: [4, 10],
    cost: { fixed: [12000, 26000] },
    recoup: [0.5, 0.85],
    blurb: 'One system for heating and cooling, zoned so the large volumes stay comfortable.',
    watchout: 'Check the local incentive schedule before pricing — rebates move this band more than any specification choice.',
    needs(ctx) { return ctx.condition === 'tired' ? 0.7 : 0.3; },
  },
  {
    id: 'kitchen-minor',
    name: 'Minor kitchen refit',
    phase: 'surface',
    days: [10, 20],
    cost: { fixed: [22000, 36000] },
    recoup: [0.85, 1.05],
    blurb: 'Keep the boxes and the layout; replace doors, worktop, sink, taps and appliances.',
    watchout: 'The highest-returning interior work there is, and it is beaten by a full refit only when the layout itself is wrong.',
    needs(ctx) {
      const k = ctx.rooms.find((r) => r.type === 'kitchen');
      if (!k) return 0.35;
      return ctx.condition === 'renovated' ? 0.15 : 0.85;
    },
  },
  {
    id: 'kitchen-major',
    name: 'Full kitchen rebuild',
    phase: 'surface',
    days: [25, 50],
    cost: { fixed: [58000, 96000], perSqm: [900, 1800] },
    recoup: [0.4, 0.72],
    blurb: 'New layout, new services, island, and the appliance package the tier implies.',
    watchout: 'Returns less of its cost than the minor refit at every tier. Choose it because the plan is wrong, not because the doors are.',
    needs(ctx) {
      const k = ctx.rooms.find((r) => r.type === 'kitchen');
      if (!k) return 0;
      // A cramped kitchen is a layout problem, which is the only case where
      // the full rebuild beats the refit.
      return clamp(remap(k.areaSqft, 150, 70, 0.2, 0.95), 0, 1);
    },
  },
  {
    id: 'bath-primary',
    name: 'Primary bathroom rebuild',
    phase: 'surface',
    days: [14, 28],
    cost: { fixed: [24000, 46000], perSqm: [1200, 2600] },
    recoup: [0.5, 0.78],
    blurb: 'Walk-in shower, double vanity, heated floor, and a window or a proper extract.',
    watchout: 'Second only to the kitchen in how it is judged, and the first place a luxury specification stops paying for itself.',
    needs(ctx) {
      const b = ctx.rooms.find((r) => r.type === 'bathroom');
      return b ? (ctx.condition === 'renovated' ? 0.2 : 0.8) : 0.3;
    },
  },
  {
    id: 'bath-add',
    name: 'Add a bathroom',
    phase: 'surface',
    days: [18, 35],
    cost: { fixed: [26000, 62000] },
    recoup: [0.5, 0.9],
    blurb: 'Convert dead circulation or a cupboard into the count the listing needs.',
    watchout: 'Only pays where the bath count is genuinely short for the bedroom count. Otherwise it is expensive floor area.',
    needs(ctx) {
      const beds = ctx.rooms.filter((r) => r.type === 'bedroom').length;
      const baths = ctx.rooms.filter((r) => r.type === 'bathroom').length;
      if (!beds) return 0;
      return baths === 0 ? 0.9 : clamp((beds - baths * 2) * 0.35, 0, 0.85);
    },
  },
  {
    id: 'floors',
    name: 'One floor finish, throughout',
    phase: 'surface',
    days: [5, 12],
    cost: { perSqm: [70, 190] },
    recoup: [0.7, 1.0],
    blurb: 'A single continuous material across the public rooms, which reads as more space than it is.',
    watchout: 'The cheapest way to make a plan feel bigger. Breaking flooring at every threshold is the most common own goal in a mid-market renovation.',
    needs(ctx) { return ctx.condition === 'renovated' ? 0.25 : 0.7; },
  },
  {
    id: 'joinery',
    name: 'Built-in joinery to the main rooms',
    phase: 'surface',
    days: [8, 18],
    cost: { fixed: [9000, 28000] },
    recoup: [0.45, 0.8],
    blurb: 'Storage that clears the floor, which is what the busy-sightlines signal is actually asking for.',
    watchout: 'Reads as luxury for a fraction of what luxury usually costs, but it is bespoke and the band is wide.',
    needs(ctx) { return clamp(ctx.signalStrength('busy') * 0.8 + 0.15, 0, 1); },
  },
  {
    id: 'paint',
    name: 'Repaint in one light, neutral palette',
    phase: 'surface',
    days: [4, 9],
    cost: { perSqm: [26, 62] },
    recoup: [1.2, 2.2],
    blurb: 'Walls, trim and ceilings in a single scheme, chosen against the room’s own light rather than a chart.',
    watchout: 'Consistently the best dollar-for-dollar move in the catalogue, and the one most often done last and in a rush.',
    needs(ctx) { return clamp(0.5 + ctx.signalStrength('warm-cast') * 0.3 + ctx.signalStrength('flat') * 0.3, 0, 1); },
  },
  {
    id: 'lighting-plan',
    name: 'A real lighting plan',
    phase: 'light',
    days: [3, 7],
    cost: { fixed: [3500, 14000], perSqm: [22, 70] },
    recoup: [0.9, 1.7],
    blurb: 'Layered circuits — ambient, task, accent — on dimmers, at one colour temperature throughout.',
    watchout: 'Mixed colour temperatures are the single most common reason a good room photographs badly. Specify one and hold it.',
    needs(ctx) {
      return clamp(0.35 + ctx.signalStrength('dim') * 0.4 + ctx.signalStrength('warm-cast') * 0.4, 0, 1);
    },
  },
  {
    id: 'daylight',
    name: 'Bring daylight deeper into the plan',
    phase: 'structure',
    days: [6, 16],
    cost: { fixed: [8000, 32000] },
    recoup: [0.65, 1.1],
    blurb: 'Rooflights, a widened opening, or glazed doors where the plan runs deep and dark.',
    watchout: 'Structural, so it belongs in the first phase even though it feels like a finishing decision.',
    needs(ctx) {
      return clamp(ctx.signalStrength('dim') * 0.6 + remap(ctx.glazingRatio, 0.09, 0.04, 0, 0.6), 0, 1);
    },
  },
  {
    id: 'curb-door',
    name: 'Front door and entry',
    phase: 'surface',
    days: [1, 3],
    cost: { fixed: [2200, 6500] },
    recoup: [1.3, 1.9],
    blurb: 'The door, its furniture, the light beside it and the number on it.',
    watchout: 'Near the top of the recoup table nationally, for less than a week of work.',
    needs(ctx) { return ctx.condition === 'renovated' ? 0.4 : 0.8; },
  },
  {
    id: 'curb-garage',
    name: 'Garage door replacement',
    phase: 'surface',
    days: [1, 2],
    cost: { fixed: [4200, 9500] },
    recoup: [1.4, 1.95],
    blurb: 'The largest single surface on most street elevations, and the cheapest to change.',
    watchout: 'Recoups above its cost more reliably than any interior item. It only applies if there is a garage on the elevation.',
    needs(ctx) { return ctx.hasGarage ? 0.9 : 0; },
  },
  {
    id: 'facade',
    name: 'Façade and stone detail',
    phase: 'surface',
    days: [6, 14],
    cost: { fixed: [11000, 26000] },
    recoup: [1.1, 1.55],
    blurb: 'Cladding or stone to the entry bay, so the elevation reads as considered from the kerb.',
    watchout: 'Works because it changes the first photograph. Do not extend it around elevations no one photographs.',
    needs(ctx) { return ctx.condition === 'renovated' ? 0.3 : 0.65; },
  },
  {
    id: 'landscape',
    name: 'Landscape and approach',
    phase: 'stage',
    days: [4, 12],
    cost: { fixed: [6000, 28000] },
    recoup: [0.9, 1.5],
    blurb: 'Grading, planting, and lighting the path so the house is still legible at an evening viewing.',
    watchout: 'Established planting reads as decades of care. Nursery stock reads as a flip; buy fewer, larger specimens.',
    needs(ctx) { return 0.6; },
  },
  {
    id: 'outdoor-room',
    name: 'An outdoor room',
    phase: 'surface',
    days: [8, 20],
    cost: { fixed: [14000, 42000] },
    recoup: [0.6, 0.95],
    blurb: 'A covered terrace with light and power, counted by buyers as living space.',
    watchout: 'Returns fall off sharply in markets with short seasons. Weight it against the local comparables, not the brochure.',
    needs(ctx) { return ctx.tier === 'luxury' ? 0.75 : 0.45; },
  },
  {
    id: 'smart',
    name: 'Lighting control and automation',
    phase: 'light',
    days: [2, 6],
    cost: { fixed: [4000, 22000] },
    recoup: [0.35, 0.7],
    blurb: 'Scene control on the circuits the lighting plan just created.',
    watchout: 'Expected at the top tier and close to invisible below it. Recoup is poor; it sells the house faster rather than higher.',
    needs(ctx) { return ctx.tier === 'luxury' ? 0.7 : 0.2; },
  },
  {
    id: 'stage',
    name: 'Stage and photograph',
    phase: 'stage',
    days: [2, 5],
    cost: { fixed: [2500, 9000] },
    recoup: [1.5, 3.5],
    blurb: 'Furniture scaled to the measured rooms, then photographed at the hour the survey says the light is best.',
    watchout: 'The highest-multiple item in the catalogue and the first one cut. Staged listings close faster at nearly every tier.',
    needs(ctx) { return 0.95; },
  },
];

/**
 * Assemble the evaluation context the catalogue's `needs` functions read.
 *
 * @param {object} property The surveyed property.
 * @returns {object} Context, including a `signalStrength` lookup.
 */
function makeContext(property) {
  const rooms = property.rooms || [];
  const totalArea = rooms.reduce((sum, r) => sum + r.area, 0);
  const glazed = rooms.reduce((sum, r) => sum + (r.glazedArea || 0), 0);
  const meanCeiling = totalArea > 0
    ? rooms.reduce((sum, r) => sum + r.ceiling * r.area, 0) / totalArea
    : 2.44;
  const strengths = new Map();
  for (const signal of property.signals || []) {
    strengths.set(signal.id, Math.max(strengths.get(signal.id) || 0, signal.confidence));
  }
  return {
    rooms,
    area: totalArea,
    areaSqft: totalArea / SQFT,
    glazingRatio: totalArea > 0 ? glazed / totalArea : 0,
    meanCeiling,
    condition: property.condition || 'dated',
    tier: property.tier || 'elevated',
    hasGarage: property.hasGarage !== false,
    signalStrength: (id) => strengths.get(id) || 0,
  };
}

/**
 * Price one intervention against the measured property.
 *
 * @param {object} item A catalogue entry.
 * @param {object} ctx From `makeContext`.
 * @param {object} tier A `TIERS` entry.
 * @returns {{low: number, high: number, mid: number}} The cost band, in dollars.
 */
export function priceOf(item, ctx, tier) {
  const fixed = item.cost.fixed || [0, 0];
  const perSqm = item.cost.perSqm || [0, 0];
  const perUnit = item.cost.perUnit || [0, 0];
  // Per-square-metre items are priced on the rooms they actually touch, which
  // for the whole-property finishes is every room and for a kitchen is one.
  const scoped = item.id === 'kitchen-major'
    ? ctx.rooms.filter((r) => r.type === 'kitchen')
    : item.id === 'bath-primary'
      ? ctx.rooms.filter((r) => r.type === 'bathroom')
      : ctx.rooms;
  const scopedArea = scoped.reduce((sum, r) => sum + r.area, 0) || ctx.area;
  const units = (ctx.rooms.reduce((sum, r) => sum + (r.openings || []).filter((o) => o.kind === 'window').length, 0)) || 6;
  const low = (fixed[0] + perSqm[0] * scopedArea + perUnit[0] * units) * tier.cost;
  const high = (fixed[1] + perSqm[1] * scopedArea + perUnit[1] * units) * tier.cost;
  return { low: roundMoney(low), high: roundMoney(high), mid: roundMoney((low + high) / 2) };
}

/**
 * Estimate the property's value and the ceiling its street imposes.
 *
 * @param {object} property The surveyed property.
 * @param {object} ctx From `makeContext`.
 * @returns {{value: number, ceiling: number, headroom: number, ceilingKnown: boolean}}
 *   Current value, the neighbourhood ceiling, and the gap between them.
 */
export function marketFrame(property, ctx) {
  const perSqft = property.pricePerSqft || 0;
  // A survey covers the rooms that were walked, which is rarely the whole
  // house. Valuing off the measured area alone would undercount a property
  // badly, so the listed area wins when the agent supplies it.
  const valuedSqft = property.totalSqft || ctx.areaSqft;
  const value = property.value || valuedSqft * perSqft;
  // With no stated best-on-street, assume the ceiling sits about a third above
  // the property's current value — a deliberately conservative default, since
  // guessing high here would flatter every recommendation in the report.
  const ceilingPerSqft = property.ceilingPricePerSqft || 0;
  const ceiling = ceilingPerSqft > 0 ? valuedSqft * ceilingPerSqft : value * 1.33;
  return {
    value,
    ceiling: Math.max(ceiling, value),
    headroom: Math.max(ceiling - value, 0),
    ceilingKnown: ceilingPerSqft > 0,
    valuedSqft,
    surveyedShare: valuedSqft > 0 ? Math.min(ctx.areaSqft / valuedSqft, 1) : 1,
  };
}

/**
 * Build the full analysis.
 *
 * @param {object} property The surveyed property.
 * @param {Array<object>} property.rooms Rooms from `plan.buildRoom`.
 * @param {Array<object>} [property.signals] Signals from `finish.signals`.
 * @param {number} [property.pricePerSqft] Local price per square foot.
 * @param {number} [property.ceilingPricePerSqft] Best-on-street price per square foot.
 * @param {number} [property.value] Current value, if known, overriding the estimate.
 * @param {string} [property.tier='elevated'] Finish level, a key of `TIERS`.
 * @param {string} [property.condition='dated'] `'tired'`, `'dated'` or `'renovated'`.
 * @param {boolean} [property.hasGarage=true] Whether a garage faces the street.
 * @param {object} [options] Analysis options.
 * @param {number} [options.threshold=0.3] Minimum relevance to be recommended.
 * @returns {object} The report: market frame, ranked recommendations, phases,
 *   totals, and the caveat that belongs on every page that renders it.
 */
export function buildReport(property, options = {}) {
  const { threshold = 0.3 } = options;
  const ctx = makeContext(property);
  const tier = TIERS[ctx.tier] || TIERS.elevated;
  const market = marketFrame(property, ctx);

  const candidates = [];
  for (const item of INTERVENTIONS) {
    const relevance = clamp(item.needs(ctx), 0, 1);
    if (relevance < threshold) continue;
    const cost = priceOf(item, ctx, tier);
    if (cost.mid <= 0) continue;
    // Recoup is the published band, tuned by the tier (dearer finishes return
    // a smaller share) and by how much this property actually needed the work
    // — fixing what is wrong returns more than improving what was already fine.
    const recoupLow = item.recoup[0] * tier.recoup * (0.75 + relevance * 0.3);
    const recoupHigh = item.recoup[1] * tier.recoup * (0.75 + relevance * 0.3);
    candidates.push({
      id: item.id,
      name: item.name,
      phase: item.phase,
      blurb: item.blurb,
      watchout: item.watchout,
      days: item.days,
      relevance,
      cost,
      recoup: { low: recoupLow, high: recoupHigh, mid: (recoupLow + recoupHigh) / 2 },
      rawUplift: {
        low: roundMoney(cost.low * recoupLow),
        high: roundMoney(cost.high * recoupHigh),
        mid: roundMoney(cost.mid * (recoupLow + recoupHigh) / 2),
      },
    });
  }

  // Ration the headroom, best-returning work first. The share each item
  // realises decays as the headroom is consumed rather than falling off a
  // cliff, because that is how the market actually behaves: the second
  // bathroom is worth less than the first, not worth nothing. Total uplift
  // approaches the headroom asymptotically and never exceeds it.
  candidates.sort((a, b) => (b.rawUplift.mid / b.cost.mid) - (a.rawUplift.mid / a.cost.mid));
  // Two running totals, deliberately: `consumed` is exact and drives the
  // decay, while `reported` is the sum of the rounded figures the report
  // actually prints. Rounding each item to a presentable band can push their
  // sum past the ceiling by a few hundred dollars, which would quietly break
  // the one invariant this whole model exists to enforce — so the printed
  // figure is clamped against what is left of the headroom, not just derived
  // from it.
  let consumed = 0;
  let reported = 0;
  const recommendations = candidates.map((c, order) => {
    const slack = market.headroom > 0 ? clamp(1 - consumed / market.headroom, 0, 1) : 0;
    const exact = c.rawUplift.mid * slack;
    consumed += exact;
    const realised = Math.min(roundMoney(exact), Math.max(market.headroom - reported, 0));
    reported += realised;
    const roi = c.cost.mid > 0 ? (realised - c.cost.mid) / c.cost.mid : 0;
    return {
      ...c,
      order: order + 1,
      uplift: realised,
      slack,
      capped: realised < c.rawUplift.mid * 0.98,
      exactUplift: exact,
      roi,
      verdict: roi >= 0.25 ? 'returns more than it costs'
        : roi >= -0.1 ? 'roughly pays for itself'
          : realised <= 0 ? 'no market return left — lifestyle spend'
            : 'costs more than it returns',
    };
  });

  const byRoi = [...recommendations].sort((a, b) => b.roi - a.roi);
  const earning = recommendations.filter((r) => r.roi >= -0.1);
  const spend = {
    low: recommendations.reduce((s, r) => s + r.cost.low, 0),
    high: recommendations.reduce((s, r) => s + r.cost.high, 0),
    mid: recommendations.reduce((s, r) => s + r.cost.mid, 0),
  };
  const earningSpend = earning.reduce((s, r) => s + r.cost.mid, 0);
  const earningUplift = earning.reduce((s, r) => s + r.uplift, 0);

  const phases = PHASES.map((phase) => ({
    ...phase,
    items: recommendations
      .filter((r) => r.phase === phase.key)
      .sort((a, b) => b.roi - a.roi),
  })).filter((p) => p.items.length);

  const days = phases.reduce((sum, p) => sum + p.items.reduce((s, r) => s + r.days[1], 0), 0);

  return {
    market,
    tier,
    context: {
      area: ctx.area,
      areaSqft: ctx.areaSqft,
      rooms: ctx.rooms.length,
      meanCeiling: ctx.meanCeiling,
      glazingRatio: ctx.glazingRatio,
      condition: ctx.condition,
    },
    signals: property.signals || [],
    recommendations,
    best: byRoi.slice(0, 3),
    phases,
    totals: {
      spend,
      uplift: recommendations.reduce((s, r) => s + r.uplift, 0),
      earningSpend: roundMoney(earningSpend),
      earningUplift: roundMoney(earningUplift),
      net: roundMoney(earningUplift - earningSpend),
      projectedValue: roundMoney(market.value + earningUplift),
      headroomLeft: roundMoney(Math.max(market.headroom - reported, 0)),
      // Calendar weeks, not the sum of the durations: phases overlap in
      // practice, trades do not. Two thirds is the usual compression.
      weeks: Math.round((days * 0.66) / 5),
    },
    caveat: 'Planning-grade estimates from published national remodelling cost and recoup ranges, scaled by the measured areas in this survey and by the price per square foot entered above. Not an appraisal, a bid, or a guarantee of value. Get two local bids before committing to any line.',
  };
}

/**
 * Render the report as plain text, for pasting into a listing presentation.
 *
 * @param {object} report From `buildReport`.
 * @param {string} [name='Property'] What to call the property.
 * @returns {string} A text report.
 */
export function toText(report, name = 'Property') {
  const money = (n) => `$${Math.round(n).toLocaleString('en-US')}`;
  const lines = [];
  lines.push(`HOUSEWRIGHT — IMPROVEMENT ANALYSIS`);
  lines.push(name);
  lines.push('='.repeat(64));
  lines.push('');
  lines.push(`Measured area      ${Math.round(report.context.areaSqft)} sq ft across ${report.context.rooms} surveyed room(s)`);
  lines.push(`Mean ceiling       ${report.context.meanCeiling.toFixed(2)} m`);
  lines.push(`Estimated value    ${money(report.market.value)}`);
  lines.push(`Street ceiling     ${money(report.market.ceiling)}${report.market.ceilingKnown ? '' : ' (assumed — enter the best comparable to sharpen this)'}`);
  lines.push(`Headroom           ${money(report.market.headroom)}`);
  if (report.market.surveyedShare < 0.98) {
    lines.push(`Survey coverage    ${Math.round(report.market.surveyedShare * 100)}% of the stated floor area was walked`);
  }
  lines.push(`Finish level       ${report.tier.label} — ${report.tier.note}`);
  lines.push('');

  if (report.signals.length) {
    lines.push('WHAT THE CAMERA SAW');
    for (const s of report.signals.slice(0, 6)) {
      lines.push(`  · ${s.label} (${Math.round(s.confidence * 100)}%) — ${s.evidence}`);
    }
    lines.push('');
  }

  lines.push('THE WORK, IN THE ORDER IT SHOULD HAPPEN');
  for (const phase of report.phases) {
    lines.push('');
    lines.push(`${phase.label.toUpperCase()}`);
    lines.push(`  ${phase.why}`);
    for (const item of phase.items) {
      lines.push('');
      lines.push(`  ${item.name}`);
      lines.push(`    ${money(item.cost.low)}–${money(item.cost.high)} · ${item.days[0]}–${item.days[1]} days · ${item.verdict}`);
      lines.push(`    Adds about ${money(item.uplift)}${item.capped ? ` (${Math.round(item.slack * 100)}% of its usual return — the street ceiling is filling up)` : ''}`);
      lines.push(`    ${item.blurb}`);
      lines.push(`    Watch out: ${item.watchout}`);
    }
  }

  lines.push('');
  lines.push('BOTTOM LINE');
  lines.push(`  Work that pays      ${money(report.totals.earningSpend)} in, ${money(report.totals.earningUplift)} back`);
  lines.push(`  Net                 ${money(report.totals.net)}`);
  lines.push(`  Projected value     ${money(report.totals.projectedValue)}`);
  lines.push(`  Rough programme     ${report.totals.weeks} weeks`);
  lines.push('');
  lines.push(report.caveat);
  return lines.join('\n');
}
