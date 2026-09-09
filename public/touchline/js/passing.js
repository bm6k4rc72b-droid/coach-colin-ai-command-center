/**
 * What the player on the ball can actually see, expressed as geometry.
 *
 * The screenshot this app started from puts "~95%" beside a pass option, in the
 * confident font of a completion model. There is no such model here, and its
 * absence is deliberate. A completion probability is a claim about what *will*
 * happen: it needs thousands of labelled passes from footage like yours, a
 * player's technique, the weather, the state of the pitch, and whether the
 * receiver is expecting it. None of that is in a phone video, and a number
 * invented from the geometry alone and printed as a percentage is a lie told in
 * a trustworthy typeface.
 *
 * What geometry genuinely knows is worth having, so that is what is reported:
 * how long the pass is, how close the nearest opponent comes to the line it
 * would travel along, whether anybody stands inside the corridor it needs, and
 * how much of that changes in the time the ball is in the air. Those are
 * measurements. A coach can argue with them, which is the point — nobody can
 * argue with 95%.
 *
 * `openness` is an index, not a probability, and is defined here in one line so
 * it can be checked: the nearest opponent's clearance from the pass line, as a
 * fraction of the corridor a pass needs, capped at 1. It is a way of ordering
 * options on screen, and the app labels it as such wherever it appears.
 *
 * @module touchline/passing
 */

/** Corridor a ground pass needs to be considered clear, metres. */
export const CORRIDOR_M = 1.5;

/** Assumed speed of a firm ground pass, metres per second. */
export const PASS_SPEED_MPS = 14;

/** Radius counted as pressure on the player in possession, metres. */
export const PRESSURE_RADIUS_M = 5;

/**
 * Perpendicular distance from a point to a segment, and where along it that is.
 *
 * @param {{x: number, y: number}} point Point to measure.
 * @param {{x: number, y: number}} a Segment start.
 * @param {{x: number, y: number}} b Segment end.
 * @returns {{offsetM: number, alongM: number, t: number}} Distance from the
 *   segment, distance along it from `a`, and the parameter in 0-1.
 */
export function offsetFromLane(point, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared < 1e-9) {
    return { offsetM: Math.hypot(point.x - a.x, point.y - a.y), alongM: 0, t: 0 };
  }
  const raw = ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared;
  const t = Math.max(0, Math.min(1, raw));
  const cx = a.x + dx * t;
  const cy = a.y + dy * t;
  return {
    offsetM: Math.hypot(point.x - cx, point.y - cy),
    alongM: t * Math.sqrt(lengthSquared),
    t,
  };
}

/**
 * Measure the lane between two players.
 *
 * Opponents are checked twice: where they are standing now, and where they
 * would be when the ball reached them if they kept running as they are. The
 * second is the one that matters for a pass and the one a still frame hides —
 * a lane can be wide open and closing at four metres a second. The assumption
 * behind it is stated in `PASS_SPEED_MPS` rather than buried: a firm ground
 * pass, no deflection, defenders holding their current velocity.
 *
 * @param {{x: number, y: number}} from Player in possession.
 * @param {{x: number, y: number}} to Intended receiver.
 * @param {{id: number, x: number, y: number, vx?: number, vy?: number}[]} opponents
 *   Opposing players.
 * @param {object} [options] Model settings.
 * @param {number} [options.corridorM=CORRIDOR_M] Corridor width.
 * @param {number} [options.passSpeedMps=PASS_SPEED_MPS] Assumed pass speed.
 * @returns {{
 *   lengthM: number,
 *   clearanceM: number,
 *   clearanceAtArrivalM: number,
 *   flightSeconds: number,
 *   screens: {id: number, offsetM: number, alongM: number}[],
 *   screened: boolean,
 *   closing: boolean,
 *   openness: number
 * }} The measurements, and the index built from them.
 */
export function passLane(from, to, opponents, options = {}) {
  const corridorM = options.corridorM ?? CORRIDOR_M;
  const passSpeedMps = options.passSpeedMps ?? PASS_SPEED_MPS;
  const lengthM = Math.hypot(to.x - from.x, to.y - from.y);
  const flightSeconds = passSpeedMps > 0 ? lengthM / passSpeedMps : 0;

  let clearanceM = Infinity;
  let clearanceAtArrivalM = Infinity;
  const screens = [];
  for (const opponent of opponents) {
    const now = offsetFromLane(opponent, from, to);
    if (now.offsetM < clearanceM) clearanceM = now.offsetM;
    if (now.offsetM <= corridorM) {
      screens.push({ id: opponent.id, offsetM: now.offsetM, alongM: now.alongM });
    }
    // Where the defender can be by the time the ball gets to their part of the
    // lane, not by the time it reaches the receiver: a defender near the
    // passer has a fraction of a second, one near the receiver has all of it.
    const reachSeconds = flightSeconds * (lengthM > 0 ? now.alongM / lengthM : 0);
    const projected = {
      x: opponent.x + (opponent.vx ?? 0) * reachSeconds,
      y: opponent.y + (opponent.vy ?? 0) * reachSeconds,
    };
    const later = offsetFromLane(projected, from, to);
    if (later.offsetM < clearanceAtArrivalM) clearanceAtArrivalM = later.offsetM;
  }
  if (!Number.isFinite(clearanceM)) clearanceM = corridorM * 4;
  if (!Number.isFinite(clearanceAtArrivalM)) clearanceAtArrivalM = clearanceM;

  screens.sort((a, b) => a.alongM - b.alongM);
  const effective = Math.min(clearanceM, clearanceAtArrivalM);
  return {
    lengthM,
    clearanceM,
    clearanceAtArrivalM,
    flightSeconds,
    screens,
    screened: effective < corridorM,
    closing: clearanceAtArrivalM < clearanceM - 0.3,
    openness: Math.max(0, Math.min(1, effective / corridorM)),
  };
}

/**
 * How hard the player on the ball is being pressed.
 *
 * @param {{x: number, y: number}} carrier Player in possession.
 * @param {{id: number, x: number, y: number, vx?: number, vy?: number}[]} opponents
 *   Opposing players.
 * @param {number} [radiusM=PRESSURE_RADIUS_M] Radius counted as pressure.
 * @returns {{nearestM: number|null, nearestId: number|null, within: number,
 *   closingMps: number}} Nearest opponent, how many are inside the radius, and
 *   how fast the nearest is closing (negative if backing off).
 */
export function pressureOn(carrier, opponents, radiusM = PRESSURE_RADIUS_M) {
  let nearestM = Infinity;
  let nearestId = null;
  let closingMps = 0;
  let within = 0;
  for (const opponent of opponents) {
    const dx = carrier.x - opponent.x;
    const dy = carrier.y - opponent.y;
    const distance = Math.hypot(dx, dy);
    if (distance <= radiusM) within += 1;
    if (distance < nearestM) {
      nearestM = distance;
      nearestId = opponent.id;
      // Component of the opponent's velocity along the line to the carrier.
      closingMps =
        distance > 1e-6
          ? ((opponent.vx ?? 0) * dx + (opponent.vy ?? 0) * dy) / distance
          : 0;
    }
  }
  return {
    nearestM: Number.isFinite(nearestM) ? nearestM : null,
    nearestId,
    within,
    closingMps,
  };
}

/**
 * Rank the passes available to the player on the ball.
 *
 * @param {object} carrier Player in possession, with `id`.
 * @param {object[]} teammates Team-mates, each with `id`, `x`, `y`.
 * @param {object[]} opponents Opposing players.
 * @param {object} [options] Model settings, passed through to {@link passLane}.
 * @param {number} [options.limit=4] How many options to return.
 * @param {{lengthM: number, widthM: number}} [options.dimensions] Pitch size,
 *   used to say whether a pass goes forward.
 * @param {number} [options.attackingTowards=1] +1 if this team attacks towards
 *   increasing x, -1 the other way.
 * @returns {object[]} Options, most open first, each with its lane geometry,
 *   the receiver's own space, and whether it is a forward pass.
 */
export function passOptions(carrier, teammates, opponents, options = {}) {
  const limit = options.limit ?? 4;
  const attackingTowards = options.attackingTowards ?? 1;
  const out = [];
  for (const mate of teammates) {
    if (mate.id === carrier.id) continue;
    const lane = passLane(carrier, mate, opponents, options);
    if (lane.lengthM < 2) continue;
    let receiverSpaceM = Infinity;
    for (const opponent of opponents) {
      const gap = Math.hypot(mate.x - opponent.x, mate.y - opponent.y);
      if (gap < receiverSpaceM) receiverSpaceM = gap;
    }
    out.push({
      id: mate.id,
      label: mate.label ?? `#${mate.id}`,
      to: { x: mate.x, y: mate.y },
      ...lane,
      receiverSpaceM: Number.isFinite(receiverSpaceM) ? receiverSpaceM : null,
      progressM: (mate.x - carrier.x) * attackingTowards,
      forward: (mate.x - carrier.x) * attackingTowards > 2,
    });
  }
  // Ordered by how clear the lane is, then by how much ground it wins. Both
  // halves of that are stated on screen so the ordering can be disagreed with.
  out.sort((a, b) => b.openness - a.openness || b.progressM - a.progressM);
  return out.slice(0, limit);
}
