/**
 * The coach: turning two numbers and four sliders into today's session.
 *
 * This is deliberately a decision engine rather than a chat model. Every
 * prescription it issues can be traced to a rule you can read, the rules are
 * unit-tested against readings whose right answer is known, and it works on a
 * phone in a basement gym with no signal and no API key. A language model can
 * be layered on top to say the same thing more warmly — see `llm.js` — but it
 * is never what decides whether you train hard today.
 *
 * The prescription is intensity-first. Amateur training goes wrong far more
 * often through easy days done too hard than through hard days done too easy,
 * so the engine's main job is to put a ceiling on today and to say, in heart
 * rate you can actually see on a watch, where that ceiling is.
 *
 * @module baseline/coach
 */

import { clamp } from './signal.js';

/**
 * Estimated maximum heart rate.
 *
 * Tanaka's 208 − 0.7 × age fits measured maxima considerably better than the
 * 220 − age rule of thumb, which underestimates older athletes by a decade's
 * worth of beats. Both are population fits with a standard deviation around
 * 10 bpm, so a measured maximum from a real test always wins.
 *
 * @param {number} age Age in years.
 * @returns {number} Estimated maximum heart rate.
 */
export function estimatedMaxHr(age) {
  return Math.round(208 - 0.7 * clamp(age, 10, 95));
}

/** The five training zones, as fractions of heart-rate reserve. */
export const ZONE_MODEL = Object.freeze([
  { zone: 1, name: 'Recovery', low: 0.45, high: 0.55, feel: 'conversation is effortless' },
  { zone: 2, name: 'Aerobic base', low: 0.55, high: 0.68, feel: 'you can talk in full sentences' },
  { zone: 3, name: 'Tempo', low: 0.68, high: 0.79, feel: 'sentences get short' },
  { zone: 4, name: 'Threshold', low: 0.79, high: 0.89, feel: 'a few words at a time' },
  { zone: 5, name: 'Maximal', low: 0.89, high: 1.0, feel: 'no talking at all' },
]);

/**
 * Heart-rate zones by the Karvonen method, using the measured resting rate.
 *
 * Percentage-of-maximum zones ignore the resting rate entirely, which is why
 * they drift wrong for exactly the people who train most: as fitness improves
 * and the resting rate falls, reserve-based zones move with it and
 * percentage-of-max zones do not.
 *
 * @param {object} profile Athlete profile.
 * @param {number} profile.age Age in years.
 * @param {number} profile.restingHr Measured resting heart rate.
 * @param {number} [profile.maxHr] Measured maximum, if known.
 * @returns {Array<{zone: number, name: string, low: number, high: number, feel: string}>}
 *   Zones with heart rates in beats per minute.
 */
export function heartRateZones(profile) {
  const maxHr = profile.maxHr || estimatedMaxHr(profile.age ?? 35);
  const resting = clamp(profile.restingHr || 60, 30, 110);
  const reserve = Math.max(20, maxHr - resting);
  return ZONE_MODEL.map((band) => ({
    ...band,
    low: Math.round(resting + reserve * band.low),
    high: Math.round(resting + reserve * band.high),
  }));
}

/**
 * Format a zone as a heart-rate range.
 *
 * @param {Array<object>} zones Output of {@link heartRateZones}.
 * @param {number} zone Zone number, 1–5.
 * @returns {string} e.g. `Z2 · 118–134 bpm`.
 */
export function zoneLabel(zones, zone) {
  const band = zones.find((entry) => entry.zone === zone) || zones[0];
  return `Z${band.zone} · ${band.low}–${band.high} bpm`;
}

/** Intensity tiers the engine can prescribe, easiest first. */
export const TIERS = Object.freeze(['restore', 'easy', 'moderate', 'hard']);

/**
 * Session templates.
 *
 * Each is a function of the athlete's zones so that every block carries a
 * number the athlete can actually chase on a watch, rather than an adjective.
 */
const SESSIONS = {
  endurance: {
    restore: (z) => ({
      title: 'Walk and breathe',
      minutes: 30,
      blocks: [
        { label: '30 min', detail: `Flat walk, nose breathing, ${zoneLabel(z, 1)}. If the hill pushes you out of Z1, walk round it.` },
        { label: '5 min', detail: 'Paced breathing on the app afterwards — it is the session, not an add-on.' },
      ],
    }),
    easy: (z) => ({
      title: 'Aerobic base run',
      minutes: 45,
      blocks: [
        { label: '10 min', detail: `Build from walk to ${zoneLabel(z, 1)}.` },
        { label: '30 min', detail: `Steady at ${zoneLabel(z, 2)}. Cap it: if the rate climbs on flat ground, slow down.` },
        { label: '5 min', detail: 'Walk out, then a minute of long exhales.' },
      ],
    }),
    moderate: (z) => ({
      title: 'Tempo blocks',
      minutes: 55,
      blocks: [
        { label: '15 min', detail: `Warm-up to ${zoneLabel(z, 2)}, then four 20-second strides.` },
        { label: '3 × 8 min', detail: `At ${zoneLabel(z, 3)}, 3 min easy between. Even splits beat a fast first rep.` },
        { label: '10 min', detail: `Cool down to ${zoneLabel(z, 1)}.` },
      ],
    }),
    hard: (z) => ({
      title: 'Threshold intervals',
      minutes: 65,
      blocks: [
        { label: '15 min', detail: `Warm-up, finishing in ${zoneLabel(z, 2)}, plus drills.` },
        { label: '5 × 5 min', detail: `At ${zoneLabel(z, 4)} with 90 s jog. Stop the set if you cannot hold the range — that is the session working, not you failing.` },
        { label: '12 min', detail: `Cool down into ${zoneLabel(z, 1)} and re-scan when your pulse has settled.` },
      ],
    }),
  },
  strength: {
    restore: () => ({
      title: 'Mobility and reset',
      minutes: 25,
      blocks: [
        { label: '12 min', detail: 'Hips, thoracic spine, ankles. Long holds, nothing that makes you brace.' },
        { label: '10 min', detail: 'Empty-bar or bodyweight patterns at half speed — movement, not load.' },
      ],
    }),
    easy: (z) => ({
      title: 'Technique and volume',
      minutes: 45,
      blocks: [
        { label: 'Main', detail: 'Two compounds at 60–65% for 4 × 6. Every rep the same speed.' },
        { label: 'Accessory', detail: '3 × 12 pull and single-leg work, one or two reps from failure.' },
        { label: 'Finish', detail: `8 min easy on a bike at ${zoneLabel(z, 2)}.` },
      ],
    }),
    moderate: () => ({
      title: 'Strength — working sets',
      minutes: 60,
      blocks: [
        { label: 'Main', detail: 'Squat or hinge, 4 × 5 at roughly RPE 7. Stop the set when bar speed drops.' },
        { label: 'Second', detail: 'Press or pull, 4 × 6 at RPE 7.' },
        { label: 'Accessory', detail: 'Two accessories, 3 × 10, plus loaded carries.' },
      ],
    }),
    hard: () => ({
      title: 'Strength — heavy day',
      minutes: 70,
      blocks: [
        { label: 'Main', detail: 'Work to a heavy triple at RPE 8, then 2 × 3 at 90% of it.' },
        { label: 'Second', detail: 'Opposing pattern, 5 × 3 with full rest.' },
        { label: 'Accessory', detail: 'Hypertrophy block, 3 × 8–10, and finish with trunk work.' },
      ],
    }),
  },
  fatloss: {
    restore: (z) => ({
      title: 'Long easy walk',
      minutes: 45,
      blocks: [
        { label: '45 min', detail: `Outdoors, ${zoneLabel(z, 1)}. This is the single most repeatable calorie you own.` },
      ],
    }),
    easy: (z) => ({
      title: 'Zone 2 and carries',
      minutes: 50,
      blocks: [
        { label: '35 min', detail: `Bike, row or brisk incline walk at ${zoneLabel(z, 2)}.` },
        { label: '12 min', detail: 'Farmer carries and step-ups, easy pace, full breath between rounds.' },
      ],
    }),
    moderate: (z) => ({
      title: 'Circuit and steady',
      minutes: 45,
      blocks: [
        { label: '4 rounds', detail: 'Push, pull, hinge, carry — 40 s work, 40 s rest, controlled reps.' },
        { label: '18 min', detail: `Steady at ${zoneLabel(z, 3)} to finish.` },
      ],
    }),
    hard: (z) => ({
      title: 'Intervals',
      minutes: 40,
      blocks: [
        { label: '10 min', detail: `Warm-up to ${zoneLabel(z, 2)}.` },
        { label: '8 × 1 min', detail: `Hard at ${zoneLabel(z, 4)}–${zoneLabel(z, 5)}, 90 s easy between.` },
        { label: '8 min', detail: 'Cool down and re-scan in ten minutes to see how fast you come back.' },
      ],
    }),
  },
  general: {
    restore: () => ({
      title: 'Rest, deliberately',
      minutes: 20,
      blocks: [
        { label: '20 min', detail: 'Walk, stretch, daylight. No session today — the adaptation happens now, not in the gym.' },
      ],
    }),
    easy: (z) => ({
      title: 'Easy aerobic',
      minutes: 40,
      blocks: [
        { label: '30 min', detail: `Anything continuous at ${zoneLabel(z, 2)}.` },
        { label: '10 min', detail: 'Mobility for whatever was stiff this week.' },
      ],
    }),
    moderate: (z) => ({
      title: 'Mixed session',
      minutes: 50,
      blocks: [
        { label: '20 min', detail: 'Full-body strength, 3 × 8, two reps in reserve.' },
        { label: '20 min', detail: `Steady cardio at ${zoneLabel(z, 3)}.` },
        { label: '10 min', detail: 'Cool down and mobility.' },
      ],
    }),
    hard: (z) => ({
      title: 'Hard mixed session',
      minutes: 55,
      blocks: [
        { label: '15 min', detail: 'Strength, heavy 5s, three sets.' },
        { label: '6 × 2 min', detail: `At ${zoneLabel(z, 4)}, 2 min easy between.` },
        { label: '10 min', detail: 'Cool down properly. Do not skip this one on a hard day.' },
      ],
    }),
  },
};

/** Goals the session library covers. */
export const GOALS = Object.freeze([
  { id: 'endurance', label: 'Endurance' },
  { id: 'strength', label: 'Strength' },
  { id: 'fatloss', label: 'Fat loss' },
  { id: 'general', label: 'General fitness' },
]);

/**
 * Choose the intensity tier for today.
 *
 * @param {object} input Decision inputs.
 * @param {number|null} input.readiness Readiness score, or null while building.
 * @param {string} input.planned Tier the athlete intended.
 * @param {Array<object>} input.flags Anomaly flags.
 * @param {number} input.hardDaysInARow Consecutive recent hard sessions.
 * @returns {{tier: string, reasons: string[]}} Chosen tier and why.
 */
export function chooseTier(input) {
  const reasons = [];
  const plannedIndex = Math.max(0, TIERS.indexOf(input.planned));
  let index = plannedIndex;

  if (input.readiness === null) {
    // Without a baseline there is nothing to deviate from, so the athlete's own
    // plan stands — capped, because an unverified plan should not be the
    // hardest session of the week either.
    index = Math.min(index, TIERS.indexOf('moderate'));
    if (index < plannedIndex) reasons.push('No baseline yet, so today is capped at moderate.');
    return { tier: TIERS[index], reasons };
  }

  if (input.readiness >= 78) {
    if (index < TIERS.length - 1 && input.hardDaysInARow < 2) {
      index += 1;
      reasons.push(`Readiness ${input.readiness} is well above your normal — there is room for more than you planned.`);
    } else {
      reasons.push(`Readiness ${input.readiness}: green light for what you planned.`);
    }
  } else if (input.readiness >= 62) {
    reasons.push(`Readiness ${input.readiness} is normal for you — the plan stands.`);
  } else if (input.readiness >= 46) {
    if (index > TIERS.indexOf('moderate')) {
      index = TIERS.indexOf('moderate');
      reasons.push(`Readiness ${input.readiness} is below your normal — same session, one gear down.`);
    } else {
      reasons.push(`Readiness ${input.readiness}: fine for an aerobic day, not for intervals.`);
    }
  } else if (input.readiness >= 30) {
    index = Math.min(index, TIERS.indexOf('easy'));
    reasons.push(`Readiness ${input.readiness} is low for you. Easy today, and the hard session keeps until it is not.`);
  } else {
    index = 0;
    reasons.push(`Readiness ${input.readiness} is the bottom of your own range. Today is recovery, whatever the calendar says.`);
  }

  if (input.hardDaysInARow >= 2 && index > TIERS.indexOf('easy')) {
    index = TIERS.indexOf('easy');
    reasons.push(`${input.hardDaysInARow} hard days back to back already — the third is where the injuries live.`);
  }

  if (input.flags.some((flag) => flag.severity === 'high')) {
    index = 0;
    reasons.push('A resting sign is well outside your normal range, so nothing hard today.');
  }

  return { tier: TIERS[index], reasons };
}

/**
 * Count consecutive hard or moderate sessions ending at the most recent day.
 *
 * @param {Array<object>} sessions Stored sessions, any order.
 * @param {number} [now=Date.now()] Clock.
 * @returns {number} Consecutive recent days with a hard prescription completed.
 */
export function hardDaysInARow(sessions, now = Date.now()) {
  const byDay = new Map();
  for (const session of sessions) {
    if (!session.tier) continue;
    const day = Math.floor((now - session.at) / 86400000);
    if (day < 0 || day > 6) continue;
    const rank = TIERS.indexOf(session.tier);
    byDay.set(day, Math.max(byDay.get(day) ?? -1, rank));
  }
  let streak = 0;
  for (let day = 0; day <= 6; day += 1) {
    const rank = byDay.get(day);
    if (rank === undefined) {
      if (day === 0) continue;
      break;
    }
    if (rank >= TIERS.indexOf('moderate')) streak += 1;
    else break;
  }
  return streak;
}

/**
 * Write today's prescription.
 *
 * @param {object} input Everything the decision needs.
 * @param {object} input.reading Scan reading (bpm, rmssd, confidence, grade…).
 * @param {object} input.readiness Output of `readinessScore`.
 * @param {object} input.baseline Output of `buildBaseline`.
 * @param {Array<object>} [input.flags] Anomaly flags.
 * @param {object} [input.context] Subjective inputs.
 * @param {object} [input.profile] Age, goal, measured max heart rate.
 * @param {Array<object>} [input.history] Past sessions, for the streak rule.
 * @param {number} [input.now] Clock, for testing.
 * @returns {object} A plan: verdict, session, zones, cautions and rationale.
 */
export function prescribe(input) {
  const {
    reading,
    readiness,
    baseline,
    flags = [],
    context = {},
    profile = {},
    history = [],
    now = Date.now(),
  } = input;

  const zones = heartRateZones({
    age: profile.age ?? 35,
    // A measured resting rate is better than a typed one, and the baseline
    // median is better than either — it is the same measurement, less noisy.
    restingHr: baseline.ready ? baseline.restingHr.centre : (reading.bpm || profile.restingHr || 60),
    maxHr: profile.maxHr,
  });

  if (!reading || reading.grade === 'unusable') {
    return {
      tier: 'easy',
      verdict: 'No usable scan',
      headline: 'I will not write a session off a reading I could not take.',
      session: SESSIONS[profile.goal || 'general'].easy(zones),
      zones,
      cautions: ['Everything below is the generic easy day, not a prescription from your data.'],
      rationale: reading?.advice ?? ['The scan did not produce a signal worth reading.'],
      readiness: null,
      capZone: 2,
      spoken: 'That scan was not clean enough to read. Fix the light, hold still, and give me another thirty seconds.',
    };
  }

  const streak = hardDaysInARow(history, now);
  const { tier, reasons } = chooseTier({
    readiness: readiness.score,
    planned: context.planned || 'moderate',
    flags,
    hardDaysInARow: streak,
  });

  const goal = SESSIONS[profile.goal] ? profile.goal : 'general';
  const session = SESSIONS[goal][tier](zones);
  const capZone = { restore: 1, easy: 2, moderate: 3, hard: 5 }[tier];

  const cautions = flags.map((flag) => flag.text);
  if (reading.confidence < 0.55) {
    cautions.push('The scan was only fair, so weight your own sense of how you feel above the number.');
  }
  if (!reading.hrvReliable && baseline.ready) {
    cautions.push('Variability could not be read from this scan, so today leans on resting rate alone.');
  }
  if (tier === 'hard') {
    cautions.push('Hard means hard on the work and genuinely easy on the recovery. Both halves count.');
  }

  const rationale = [...reasons];
  for (const driver of readiness.drivers?.slice(0, 3) ?? []) {
    const direction = driver.direction === 'up' ? 'in your favour' : 'against you';
    rationale.push(`${driver.label}: ${driver.value} (${driver.reference}) — ${direction}.`);
  }
  if (readiness.note) rationale.push(readiness.note);

  const verdict = {
    restore: 'Recover today',
    easy: 'Keep it easy',
    moderate: 'Train, but hold the ceiling',
    hard: 'Green light',
  }[tier];

  const headline = {
    restore: 'Your body is asking for a day back, and the training you already did only counts once you absorb it.',
    easy: 'An easy day done properly easy is worth more this week than a hard one done badly.',
    moderate: 'Good to work. Keep the hard part honest and the rest genuinely rested.',
    hard: 'Everything is where it should be. This is the day to spend it.',
  }[tier];

  return {
    tier,
    verdict,
    headline,
    session,
    zones,
    capZone,
    cautions,
    rationale,
    readiness: readiness.score,
    streak,
    spoken: spokenBriefing({
      tier, verdict, session, readiness, reading, zones, capZone, cautions,
    }),
  };
}

/**
 * Compose the spoken version of a plan.
 *
 * Written for the ear rather than the eye: short clauses, numbers rounded to
 * what a person can hold in their head, and the ceiling stated last because
 * that is the part worth remembering on the way out of the door.
 *
 * @param {object} plan Plan fields.
 * @returns {string} Briefing text for speech synthesis.
 */
export function spokenBriefing(plan) {
  const parts = [];
  const score = plan.readiness?.score;
  if (score === null || score === undefined) {
    parts.push(`Resting rate ${Math.round(plan.reading.bpm)}.`);
    parts.push('I am still learning your normal, so I have kept today sensible rather than clever.');
  } else {
    parts.push(`Readiness ${score}, ${plan.readiness.band.label.toLowerCase()}.`);
    const top = plan.readiness.drivers?.[0];
    if (top) {
      parts.push(top.reference === 'self-reported'
        ? `Mostly ${top.label.toLowerCase()}, ${top.value}.`
        : `Mostly ${top.label.toLowerCase()}: ${top.value} against ${top.reference}.`);
    }
  }
  parts.push(`${plan.verdict}.`);
  parts.push(`Today is ${plan.session.title}, about ${plan.session.minutes} minutes.`);
  const cap = plan.zones.find((zone) => zone.zone === plan.capZone);
  if (cap) parts.push(`Keep the hardest part at or under ${cap.high} beats.`);
  if (plan.cautions?.length) parts.push(plan.cautions[0]);
  return parts.join(' ');
}

/** Offline answers to the questions people actually ask a coach. */
const ANSWERS = [
  {
    id: 'why',
    keys: ['why', 'reason', 'how did you', 'explain'],
    reply: (ctx) => `Because ${ctx.plan.rationale.slice(0, 2).join(' ').toLowerCase()}`,
  },
  {
    id: 'harder',
    keys: ['harder', 'more', 'push', 'can i still', 'ignore'],
    reply: (ctx) => (ctx.plan.tier === 'hard'
      ? 'You already have the green light. Spend it on the intervals, not on making the warm-up a race.'
      : `You can override me — it is your body. But the reason for the ceiling is ${ctx.plan.rationale[0].toLowerCase()} `
        + `If you go anyway, hold ${zoneLabel(ctx.plan.zones, ctx.plan.capZone)} and stop at the first sign it is costing more than it should.`),
  },
  {
    id: 'zones',
    keys: ['zone', 'heart rate', 'bpm', 'pace', 'how fast'],
    reply: (ctx) => ctx.plan.zones.map((zone) => `Z${zone.zone} ${zone.name}: ${zone.low}–${zone.high}, ${zone.feel}`).join('. '),
  },
  {
    id: 'hrv',
    keys: ['hrv', 'variability', 'rmssd'],
    reply: (ctx) => (ctx.reading.hrvReliable
      ? `Your variability read ${Math.round(ctx.reading.rmssd)} milliseconds today against a usual `
        + `${Math.round(ctx.baseline.hrv.centre || 0)}. Higher generally means better recovered — but only against your own history, never against someone else's.`
      : 'This scan could not measure variability reliably, so I left it out rather than guess. A still, well-lit, thirty-second scan usually gets it.'),
  },
  {
    id: 'sleep',
    keys: ['sleep', 'tired', 'bed'],
    reply: () => 'Sleep is the only recovery intervention that works every time. If you can move one thing this week, move bedtime, not the training plan.',
  },
  {
    id: 'accuracy',
    keys: ['accurate', 'trust', 'real', 'medical', 'compare'],
    reply: (ctx) => `This scan graded ${ctx.reading.grade} at ${Math.round((ctx.reading.confidence || 0) * 100)} per cent confidence. `
      + 'Camera pulse readings are good at rate and only fair at variability, they need light and stillness, and none of it is a medical measurement. '
      + 'Treat the trend as the signal and any single reading as a rumour.',
  },
  {
    id: 'breathe',
    keys: ['breath', 'breathe', 'calm', 'stress', 'anxious'],
    reply: () => 'Open the breathing screen and take six breaths a minute for two minutes — four seconds in, six out. '
      + 'Then scan again: you will usually see the rate drop and the variability rise while you watch, which is the point of doing it.',
  },
];

/**
 * Answer a free-text question offline.
 *
 * @param {string} question What the athlete asked.
 * @param {object} context Plan, reading, baseline.
 * @returns {{id: string, text: string}} The best matching answer, or a fallback.
 */
export function answer(question, context) {
  const text = String(question || '').toLowerCase();
  let best = null;
  let bestScore = 0;
  for (const entry of ANSWERS) {
    const score = entry.keys.reduce((total, key) => (text.includes(key) ? total + key.length : total), 0);
    if (score > bestScore) {
      bestScore = score;
      best = entry;
    }
  }
  if (!best) {
    return {
      id: 'fallback',
      text: `${context.plan.verdict}: ${context.plan.headline} Ask me about your zones, your variability, `
        + 'why today looks like this, or whether you can push anyway.',
    };
  }
  return { id: best.id, text: best.reply(context) };
}
