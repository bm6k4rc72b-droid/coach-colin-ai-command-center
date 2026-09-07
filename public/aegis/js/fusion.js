/**
 * Requiring more than one witness.
 *
 * Each of the three channels is beatable on its own, and each is beatable in a
 * different way, which is the whole reason there are three:
 *
 * - The **camera** is fooled by a coat falling off a hook, by a pet, and by
 *   any lighting change violent enough to outrun the background model. It
 *   cannot see into the bathroom.
 * - The **phone in the pocket** is fooled by being set down hard, and it is
 *   useless in a dressing gown with no pocket.
 * - The **room's sound** is fooled by a dropped saucepan and by a slammed door.
 *
 * What none of them share is a *failure mode*. The coat that fools the camera
 * makes no sound and moves no accelerometer. The saucepan that fools the
 * microphone leaves the camera looking at somebody standing up. So the rule
 * this module exists to enforce is that **an alarm needs two independent
 * things to have gone wrong at once**, and a belief that rests on one channel
 * is capped below the alarm threshold no matter how confident that channel is.
 *
 * There is one exception, and it is not a loophole because it satisfies the
 * same requirement by a different route. A camera that *watched the descent*
 * and then *watched the body stay down past the dwell* has made two
 * independent observations separated by seven seconds, and either one alone
 * would be insufficient. A camera that only has the second half — somebody
 * discovered already on the floor — has one observation, and is capped like
 * anything else. That distinction is carried through the whole system as
 * `transitObserved`, and it is the difference between "I saw her fall" and "I
 * can see her lying down", which are not the same sentence and should never be
 * reported as though they were.
 *
 * Evidence is added in log-odds, which is what makes disagreement work
 * properly: a channel that says *no* subtracts, rather than merely failing to
 * add. When the phone reports an impact with no breathing after it, that is
 * not a missing vote — it is a positive finding that the thing which fell was
 * not a person, and it pulls the total down.
 *
 * That distinction — between a channel that disagrees and a channel that has
 * nothing to say — is load-bearing, and getting it wrong the first time here
 * broke the whole system in a way that looked like arithmetic and was really a
 * category error. A quiet accelerometer was being read as *proof nobody fell*,
 * so a camera watching somebody slide to the floor in silence was voted down
 * by two sensors that had simply observed nothing. Silence is not testimony.
 * A channel contributes only when it makes a claim: `likelihood` above the
 * neutral point argues for, `against` argues against, and a sensor that is on
 * and has seen nothing contributes exactly zero.
 *
 * The other half of this module's job is **saying what it cannot see**. A
 * camera-only installation is a perfectly reasonable installation and most of
 * them will be exactly that; it is also blind to the two rooms where people
 * most often fall. That is stated as a fact about the installation, plainly,
 * on the screen, all the time — not buried in a setup wizard that was read
 * once.
 *
 * @module aegis/fusion
 */

import { clamp, logit, sigmoid } from './mathkit.js';

/** Belief at which the system starts paying closer attention. */
export const WATCH = 0.35;

/** Belief at which the receptionist asks whether everything is all right. */
export const CHECK = 0.60;

/** Belief at which the response ladder begins escalating. */
export const ALARM = 0.80;

/** The most a single uncorroborated channel is allowed to reach. */
export const SOLO_CAP = 0.62;

/** A channel must clear this to count towards corroboration. */
export const CORROBORATION_FLOOR = 0.42;

/** Below this a channel is not making a positive claim at all. */
export const NEUTRAL = 0.5;

/** The channels, their weight, and what their absence costs. */
export const CHANNELS = Object.freeze([
  {
    id: 'vision',
    label: 'Camera',
    weight: 1.0,
    blindSpot: 'Without a camera there is no posture, no descent rate and no way to tell a fall from a nap.',
  },
  {
    id: 'inertial',
    label: 'Carried phone',
    weight: 0.85,
    blindSpot: 'Without a carried phone, rooms the camera cannot see — the bathroom, the stairs — are not covered at all.',
  },
  {
    id: 'acoustic',
    label: 'Room sound',
    weight: 0.45,
    blindSpot: 'Without room sound, a fall out of the camera’s frame has nothing to corroborate it.',
  },
]);

/**
 * A fused verdict.
 *
 * @typedef {object} Verdict
 * @property {number} belief Combined belief that somebody has fallen, 0–1.
 * @property {string} level One of `calm`, `watching`, `checking`, `alarm`.
 * @property {boolean} corroborated Whether two independent lines agree.
 * @property {boolean} capped Whether the belief was held down for lack of corroboration.
 * @property {number} coverage Fraction of the total sensing weight in service.
 * @property {{id: string, label: string, available: boolean, likelihood: number, weight: number, note: string}[]} channels
 *   Per-channel detail, in weight order.
 * @property {string[]} agreeing Channels above the corroboration floor.
 * @property {string[]} contradicting Channels actively arguing against.
 * @property {string[]} blindSpots What this installation cannot see.
 * @property {string[]} reasons The grounds, strongest first.
 * @property {string} headline One sentence a person can read at a glance.
 */

/**
 * Combine the channels into one verdict.
 *
 * @param {object} readings The channel readings.
 * @param {import('./kinematics.js').Kinematics|null} [readings.vision] Camera.
 * @param {import('./inertial.js').Inertial|null} [readings.inertial] Phone.
 * @param {import('./acoustic.js').Acoustic|null} [readings.acoustic] Sound.
 * @returns {Verdict} The verdict.
 */
export function fuse(readings = {}) {
  const vision = readings.vision || null;
  const inertial = readings.inertial || null;
  const acoustic = readings.acoustic || null;

  const raw = {
    vision: vision
      ? { likelihood: vision.likelihood, against: 0, note: (vision.reasons || [])[0] || vision.state }
      : null,
    inertial: inertial?.available
      ? { likelihood: inertial.likelihood, against: inertial.against || 0, note: (inertial.reasons || [])[0] || '' }
      : null,
    acoustic: acoustic?.available
      ? { likelihood: acoustic.likelihood, against: acoustic.against || 0, note: (acoustic.reasons || [])[0] || '' }
      : null,
  };

  const channels = CHANNELS.map((channel) => {
    const reading = raw[channel.id];
    return {
      id: channel.id,
      label: channel.label,
      available: Boolean(reading),
      likelihood: reading ? clamp(reading.likelihood, 0, 1) : 0,
      against: reading ? clamp(reading.against, 0, 1) : 0,
      weight: channel.weight,
      note: reading ? reading.note : 'not in service',
    };
  });

  const live = channels.filter((c) => c.available);
  const totalWeight = CHANNELS.reduce((a, c) => a + c.weight, 0);
  const coverage = live.reduce((a, c) => a + c.weight, 0) / totalWeight;

  // The strongest claim sets the belief; every other claim moves it from
  // there. Accumulating all the channels symmetrically from zero would put a
  // room in which nothing whatever has happened at an even fifty-fifty, which
  // is not neutrality — it is the assertion that a fall is as likely as not in
  // any given second of an ordinary afternoon.
  const claiming = live.filter((c) => c.likelihood > NEUTRAL);
  let belief;
  if (!claiming.length) {
    belief = live.reduce((a, c) => Math.max(a, c.likelihood), 0);
    for (const channel of live) {
      if (channel.against > 0) belief = Math.min(belief, NEUTRAL - channel.against / 2);
    }
    belief = clamp(belief, 0, 1);
  } else {
    const lead = claiming.reduce((a, b) => (b.likelihood * b.weight > a.likelihood * a.weight ? b : a));
    let odds = logit(lead.likelihood);
    for (const channel of claiming) {
      if (channel !== lead) odds += channel.weight * logit(channel.likelihood);
    }
    for (const channel of live) {
      if (channel.against > 0) odds -= channel.weight * logit(NEUTRAL + channel.against / 2);
    }
    belief = sigmoid(odds);
  }

  const agreeing = live.filter((c) => c.likelihood >= CORROBORATION_FLOOR);
  const contradicting = live.filter((c) => c.against > 0.15);

  // Corroboration: two channels, or one camera that saw both halves of the
  // event. Nothing else counts.
  const cameraSawBoth = Boolean(
    vision
    && vision.transitObserved
    && (vision.state === 'down' || (vision.state === 'grounded' && vision.sinceMs > 3000)),
  );
  const corroborated = agreeing.length >= 2 || cameraSawBoth;

  let capped = false;
  if (!corroborated && belief > SOLO_CAP) {
    belief = SOLO_CAP;
    capped = true;
  }

  const reasons = [];
  for (const channel of live.slice().sort((a, b) => b.likelihood * b.weight - a.likelihood * a.weight)) {
    if (!channel.note) continue;
    reasons.push(`${channel.label}: ${channel.note}`);
  }
  for (const channel of live) {
    if (channel.against > 0.15) reasons.unshift(`${channel.label} argues against: ${channel.note}`);
  }
  if (capped) {
    reasons.push(`Held at ${Math.round(SOLO_CAP * 100)}% — only one line of evidence. Aegis will not raise an alarm on a single channel.`);
  }
  if (cameraSawBoth && agreeing.length < 2) {
    reasons.push('The camera saw the descent and the aftermath — two observations seven seconds apart, so this counts as corroborated.');
  }

  const blindSpots = CHANNELS
    .filter((c) => !raw[c.id])
    .map((c) => c.blindSpot);

  const level = belief >= ALARM ? 'alarm'
    : belief >= CHECK ? 'checking'
      : belief >= WATCH ? 'watching' : 'calm';

  return {
    belief,
    level,
    corroborated,
    capped,
    coverage,
    channels,
    agreeing: agreeing.map((c) => c.label),
    contradicting: contradicting.map((c) => c.label),
    blindSpots,
    reasons,
    headline: headline(level, belief, vision, agreeing, capped),
  };
}

/**
 * One sentence describing a verdict.
 *
 * @param {string} level The level.
 * @param {number} belief The belief.
 * @param {import('./kinematics.js').Kinematics|null} vision The camera reading.
 * @param {object[]} agreeing Channels above the floor.
 * @param {boolean} capped Whether the belief was held down.
 * @returns {string} The sentence.
 */
function headline(level, belief, vision, agreeing, capped) {
  const state = vision?.state || 'away';
  if (level === 'alarm') {
    return state === 'found-down'
      ? 'Somebody is on the floor and has not got up.'
      : 'A fall has been detected.';
  }
  if (level === 'checking') {
    // What the camera can see outranks the arithmetic in this sentence. "Only
    // one sensor says so" is true and, said about a body visibly lying on a
    // floor, badly under-informs whoever is reading it.
    if (state === 'found-down') return 'Somebody is on the floor. The fall itself was not seen.';
    if (state === 'grounded') return 'Somebody has gone down and has not got up yet.';
    return capped
      ? 'Something looks wrong, but only one sensor says so.'
      : `Something looks wrong — ${agreeing.map((c) => c.label.toLowerCase()).join(' and ')} agree.`;
  }
  if (level === 'watching') return 'Watching closely.';
  switch (state) {
    case 'upright': return 'Upright and moving normally.';
    case 'seated': return 'Seated.';
    case 'resting': return 'Resting where rest is expected.';
    case 'recovering': return 'Getting back up.';
    case 'lowering': return 'Lowering under control.';
    case 'obscured': return 'View obstructed — waiting for a clear look.';
    case 'away': return 'Room empty.';
    default: return 'All clear.';
  }
}

/**
 * Describe what an installation can and cannot do, for the setup screen.
 *
 * @param {{vision: boolean, inertial: boolean, acoustic: boolean}} live Which
 *   channels are in service.
 * @returns {{coverage: number, summary: string, gaps: string[]}} The account.
 */
export function coverageReport(live) {
  const totalWeight = CHANNELS.reduce((a, c) => a + c.weight, 0);
  const running = CHANNELS.filter((c) => live[c.id]);
  const coverage = running.reduce((a, c) => a + c.weight, 0) / totalWeight;
  const gaps = CHANNELS.filter((c) => !live[c.id]).map((c) => c.blindSpot);
  let summary;
  if (!running.length) summary = 'Nothing is watching. Turn on at least the camera.';
  else if (running.length === 1 && live.vision) {
    summary = 'Camera only. Aegis can raise an alarm from what it sees, because a watched descent and a watched aftermath are two observations — but only inside the frame.';
  } else if (running.length === 1) {
    summary = 'One sensor only. Aegis will watch and will speak up, but it will not raise a full alarm on a single channel.';
  } else {
    summary = `${running.length} channels in service. An alarm needs two of them to agree, and they have no failure modes in common.`;
  }
  return { coverage, summary, gaps };
}
