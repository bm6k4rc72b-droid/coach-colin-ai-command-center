/**
 * Who has the ball, and for how long — with the denominator kept in view.
 *
 * A possession bar is the most quoted number in football and the easiest one to
 * fake. Two teams, two percentages, adding to a hundred: it looks like a
 * measurement of the whole match and is usually a measurement of whatever the
 * system could see. This module is built so that cannot happen here.
 *
 * Time is only ever credited to a team while the ball is visible and one player
 * is unambiguously nearest to it. Everything else — the ball out of frame, the
 * ball hidden under a player, two opponents equally close, the ball in flight
 * between them — goes into a fourth bucket that is reported alongside the two
 * teams instead of being shared out between them. A run of play where the app
 * saw the ball for eight seconds out of sixty reads as 5% / 8% / 87% unassigned,
 * which is honest and useful, rather than 38% / 62%, which is neither.
 *
 * Two more decisions matter:
 *
 * **Nearest is not the same as in control.** A player two metres from a ball
 * travelling at 20 m/s does not have it. Control requires the ball to be within
 * a couple of metres *and* moving slowly enough to be under someone's foot;
 * above that it is in flight, and flight belongs to nobody.
 *
 * **Switching sides needs evidence.** A tackle takes a second; detection noise
 * takes a frame. A change of possession is only recorded once the new holder
 * has been nearest for several consecutive frames, so a ball that flickers
 * between two players' feet does not produce forty turnovers a minute.
 *
 * @module touchline/possession
 */

/** How close a player must be to the ball to be in control of it, metres. */
export const CONTROL_RADIUS_M = 2.2;

/** Difference in distance below which two players are equally close, metres. */
export const CONTEST_MARGIN_M = 0.6;

/** Above this speed the ball is in flight and belongs to nobody, m/s. */
export const IN_FLIGHT_MPS = 9;

/** Consecutive frames a new holder must lead before possession switches. */
export const SWITCH_FRAMES = 4;

/**
 * Who, if anyone, is in control of the ball right now.
 *
 * @param {{id: number, x: number, y: number, team: string}[]} players Tracked
 *   players with their team labels.
 * @param {{visible: boolean, x: number, y: number, speedMps: number}} ball Ball
 *   state from the ball tracker.
 * @param {object} [options] Thresholds.
 * @param {number} [options.radiusM=CONTROL_RADIUS_M] Control radius.
 * @param {number} [options.marginM=CONTEST_MARGIN_M] Contest margin.
 * @returns {{
 *   state: 'held'|'contested'|'loose'|'in-flight'|'unseen',
 *   team: string|null,
 *   playerId: number|null,
 *   distanceM: number|null,
 *   nearest: object[]
 * }} What can be said about control this frame.
 */
export function controlOf(players, ball, options = {}) {
  const radiusM = options.radiusM ?? CONTROL_RADIUS_M;
  const marginM = options.marginM ?? CONTEST_MARGIN_M;
  if (!ball || !ball.visible) {
    return { state: 'unseen', team: null, playerId: null, distanceM: null, nearest: [] };
  }
  const ranked = players
    .map((player) => ({
      id: player.id,
      team: player.team,
      distanceM: Math.hypot(player.x - ball.x, player.y - ball.y),
    }))
    .sort((a, b) => a.distanceM - b.distanceM);

  const nearest = ranked.slice(0, 3);
  if (ball.speedMps > IN_FLIGHT_MPS) {
    return { state: 'in-flight', team: null, playerId: null, distanceM: null, nearest };
  }
  const first = ranked[0];
  if (!first || first.distanceM > radiusM) {
    return { state: 'loose', team: null, playerId: null, distanceM: first?.distanceM ?? null, nearest };
  }
  const second = ranked[1];
  if (second && second.team !== first.team && second.distanceM - first.distanceM < marginM) {
    return { state: 'contested', team: null, playerId: null, distanceM: first.distanceM, nearest };
  }
  if (first.team !== 'home' && first.team !== 'away') {
    // A goalkeeper or an official is nearest. Neither is a team in the
    // possession sense, and quietly filing one under a team would be an
    // invention.
    return { state: 'loose', team: null, playerId: first.id, distanceM: first.distanceM, nearest };
  }
  return {
    state: 'held',
    team: first.team,
    playerId: first.id,
    distanceM: first.distanceM,
    nearest,
  };
}

/**
 * Accumulates possession over a match, with the unassigned time kept separate.
 */
export class PossessionLedger {
  /** @param {object} [options] Ledger settings. */
  constructor(options = {}) {
    this.switchFrames = options.switchFrames ?? SWITCH_FRAMES;
    this.heldMs = { home: 0, away: 0 };
    this.unassignedMs = { contested: 0, loose: 0, 'in-flight': 0, unseen: 0 };
    this.totalMs = 0;
    this.holder = null;
    this.holderId = null;
    this.pending = null;
    this.pendingFrames = 0;
    this.spells = [];
    this.lastMs = null;
    this.turnovers = 0;
  }

  /**
   * Fold one frame of control into the ledger.
   *
   * @param {ReturnType<typeof controlOf>} control This frame's reading.
   * @param {number} timeMs Frame time.
   * @returns {{holder: string|null, holderId: number|null}} The confirmed
   *   holder after this frame, which lags the reading by design.
   */
  update(control, timeMs) {
    const dt = this.lastMs === null ? 0 : Math.max(0, timeMs - this.lastMs);
    this.lastMs = timeMs;
    this.totalMs += dt;

    if (control.state === 'held') {
      if (control.team === this.holder) {
        this.pending = null;
        this.pendingFrames = 0;
        this.holderId = control.playerId;
      } else if (control.team === this.pending) {
        this.pendingFrames += 1;
        if (this.pendingFrames >= this.switchFrames) {
          this.#closeSpell(timeMs);
          if (this.holder) this.turnovers += 1;
          this.holder = control.team;
          this.holderId = control.playerId;
          this.pending = null;
          this.pendingFrames = 0;
          this.spells.push({ team: this.holder, startMs: timeMs, endMs: timeMs, playerIds: [] });
        }
      } else {
        this.pending = control.team;
        this.pendingFrames = 1;
      }
    } else {
      // Losing sight of the ball does not end a spell — a player shielding it
      // hides it — but nothing is credited while it is out of sight either.
      this.pending = null;
      this.pendingFrames = 0;
    }

    if (control.state === 'held' && this.holder === control.team) {
      this.heldMs[this.holder] += dt;
      const spell = this.spells[this.spells.length - 1];
      if (spell && spell.team === this.holder) {
        spell.endMs = timeMs;
        if (control.playerId !== null && !spell.playerIds.includes(control.playerId)) {
          spell.playerIds.push(control.playerId);
        }
      } else {
        this.spells.push({
          team: this.holder,
          startMs: timeMs - dt,
          endMs: timeMs,
          playerIds: control.playerId === null ? [] : [control.playerId],
        });
      }
    } else if (control.state !== 'held') {
      this.unassignedMs[control.state] += dt;
    } else {
      // Held by a team that has not yet earned the switch: time in limbo goes
      // to the contested bucket rather than to either side.
      this.unassignedMs.contested += dt;
    }

    return { holder: this.holder, holderId: this.holderId };
  }

  /** Close the running spell at a given time. */
  #closeSpell(timeMs) {
    const spell = this.spells[this.spells.length - 1];
    if (spell && spell.endMs < timeMs) spell.endMs = timeMs;
  }

  /**
   * The possession figures, with everything the app could not attribute.
   *
   * `homeShare` and `awayShare` are shares of *assigned* time, which is what a
   * broadcast graphic means by possession. `assignedShare` says how much of the
   * clock that was — read the two together or not at all.
   *
   * @returns {{
   *   homeMs: number, awayMs: number, assignedMs: number, totalMs: number,
   *   homeShare: number, awayShare: number, assignedShare: number,
   *   unassignedMs: object, turnovers: number, spells: object[]
   * }} The ledger.
   */
  summary() {
    const assignedMs = this.heldMs.home + this.heldMs.away;
    return {
      homeMs: this.heldMs.home,
      awayMs: this.heldMs.away,
      assignedMs,
      totalMs: this.totalMs,
      homeShare: assignedMs > 0 ? this.heldMs.home / assignedMs : 0,
      awayShare: assignedMs > 0 ? this.heldMs.away / assignedMs : 0,
      assignedShare: this.totalMs > 0 ? assignedMs / this.totalMs : 0,
      unassignedMs: { ...this.unassignedMs },
      turnovers: this.turnovers,
      spells: this.spells.slice(-40),
    };
  }
}

/**
 * The longest unbroken spell each team has strung together, in seconds.
 *
 * @param {{team: string, startMs: number, endMs: number}[]} spells Spells.
 * @returns {{home: number, away: number}} Longest spell per side.
 */
export function longestSpells(spells) {
  const best = { home: 0, away: 0 };
  for (const spell of spells) {
    const seconds = (spell.endMs - spell.startMs) / 1000;
    if (spell.team in best && seconds > best[spell.team]) best[spell.team] = seconds;
  }
  return best;
}
