/**
 * Writing the match up from the measurements, and only from the measurements.
 *
 * Every sentence this module produces is generated from a number the app
 * computed, and prints that number beside the claim. There is no template that
 * says "Team A dominated" — dominance is a judgement, and a judgement with no
 * figure attached is where a tool like this stops being useful and starts being
 * flattering.
 *
 * The report also leads with what it could not see. A reader who skips the
 * caveat and quotes the possession figure has been failed by the layout, so the
 * caveat is the first line rather than a footnote: how long the session ran,
 * how much of it the ball was visible for, and how much of the possession clock
 * could be attributed to anybody.
 *
 * The optional language model in `llm.js` restates this text and answers
 * questions about it. It is handed these numbers and nothing else — no frame,
 * no crop — and it cannot add a fact that is not in here.
 *
 * @module touchline/report
 */

import { definitions } from './metrics.js';
import { longestSpells } from './possession.js';

/** Format a duration in milliseconds as minutes and seconds. */
export function duration(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes ? `${minutes} min ${seconds} s` : `${seconds} s`;
}

/** Format a distance sensibly in metres or kilometres. */
export function distance(metres) {
  return metres >= 1000 ? `${(metres / 1000).toFixed(2)} km` : `${Math.round(metres)} m`;
}

/**
 * Build the written summary.
 *
 * @param {object} session Everything measured this session.
 * @param {number} session.sessionMs Length of the session.
 * @param {object} session.possession Summary from the possession ledger.
 * @param {{seenShare: number}} session.ball Ball tracker state.
 * @param {object[]} session.rows Player rows.
 * @param {{home: object, away: object}} session.totals Team totals.
 * @param {{names: {home: string, away: string}}} session.teams Display names.
 * @param {{residualM: number, worstM: number}|null} session.calibration Fit.
 * @param {number} session.staleFrames Frames where the camera had moved.
 * @param {object} [session.shape] Team shapes.
 * @returns {{headline: string, caveats: string[], lines: string[],
 *   digest: object}} Text for the panel, and the digest a language model gets.
 */
export function matchReport(session) {
  const {
    sessionMs,
    possession,
    ball,
    rows,
    totals,
    teams,
    calibration,
    staleFrames = 0,
    shape = null,
  } = session;

  const caveats = [];
  const assignedPct = Math.round(possession.assignedShare * 100);
  caveats.push(
    `Watched for ${duration(sessionMs)}. The ball was visible in ${Math.round(
      ball.seenShare * 100,
    )}% of frames, and ${assignedPct}% of the clock could be attributed to a team.`,
  );
  if (calibration) {
    caveats.push(
      `The pitch model fits the marked points to ${calibration.residualM.toFixed(
        2,
      )} m on average, ${calibration.worstM.toFixed(2)} m at worst. Every distance below inherits that error.`,
    );
  } else {
    caveats.push('No pitch calibration: nothing below is in metres.');
  }
  if (staleFrames > 0) {
    caveats.push(
      `The camera moved during ${staleFrames} frames. Measurements from those frames were discarded rather than corrected.`,
    );
  }
  const meanCoverage = rows.length
    ? rows.reduce((sum, row) => sum + row.coverage, 0) / rows.length
    : 0;
  caveats.push(
    `${rows.length} players were tracked, each for an average of ${Math.round(
      meanCoverage * 100,
    )}% of the session. Nobody's totals are extrapolated to a full match.`,
  );

  const lines = [];
  const homeName = teams.names.home;
  const awayName = teams.names.away;

  if (possession.assignedMs > 0) {
    lines.push(
      `${homeName} held the ball for ${duration(possession.homeMs)} and ${awayName} for ${duration(
        possession.awayMs,
      )} — ${Math.round(possession.homeShare * 100)}% against ${Math.round(
        possession.awayShare * 100,
      )}% of the ${duration(possession.assignedMs)} that could be attributed.`,
    );
    const unattributed =
      possession.unassignedMs.unseen +
      possession.unassignedMs.loose +
      possession.unassignedMs['in-flight'] +
      possession.unassignedMs.contested;
    lines.push(
      `The remaining ${duration(unattributed)} was ball out of sight (${duration(
        possession.unassignedMs.unseen,
      )}), loose (${duration(possession.unassignedMs.loose)}), in flight (${duration(
        possession.unassignedMs['in-flight'],
      )}) or contested (${duration(possession.unassignedMs.contested)}).`,
    );
    const longest = longestSpells(possession.spells);
    if (longest.home || longest.away) {
      lines.push(
        `Longest unbroken spell: ${homeName} ${longest.home.toFixed(1)} s, ${awayName} ${longest.away.toFixed(
          1,
        )} s, across ${possession.turnovers} changes of possession.`,
      );
    }
  } else {
    lines.push(
      'Possession was never attributed: the ball was not visible for long enough beside a player who was clearly nearest to it.',
    );
  }

  const thresholds = definitions();
  for (const [side, name] of [
    ['home', homeName],
    ['away', awayName],
  ]) {
    const team = totals[side];
    if (!team || !team.tracked) continue;
    lines.push(
      `${name}: ${team.tracked} players tracked, ${distance(team.distanceM)} covered between them, ${distance(
        team.highIntensityM,
      )} of it above ${thresholds.highIntensityKph.toFixed(1)} km/h, ${team.sprints} sprints at or above ${thresholds.sprintKph.toFixed(
        1,
      )} km/h, fastest ${team.topSpeedKph.toFixed(1)} km/h.`,
    );
  }

  const fastest = [...rows].sort((a, b) => b.topSpeedKph - a.topSpeedKph)[0];
  if (fastest && fastest.topSpeedKph > 0) {
    lines.push(
      `Quickest single reading: ${fastest.label} at ${fastest.topSpeedKph.toFixed(
        1,
      )} km/h, from ${Math.round(fastest.coverage * 100)}% coverage of the session.`,
    );
  }
  const busiest = rows[0];
  if (busiest) {
    lines.push(
      `Most ground covered: ${busiest.label}, ${distance(busiest.distanceM)} in ${duration(
        busiest.seenMs,
      )} on camera — ${Math.round(busiest.metresPerMinute)} m per tracked minute.`,
    );
  }

  if (shape && shape.home?.count && shape.away?.count) {
    lines.push(
      `Average shape while visible: ${homeName} ${shape.home.widthM.toFixed(
        0,
      )} m wide by ${shape.home.depthM.toFixed(0)} m deep from ${shape.home.count} players, ${awayName} ${shape.away.widthM.toFixed(
        0,
      )} m by ${shape.away.depthM.toFixed(0)} m from ${shape.away.count}.`,
    );
  }

  const headline =
    possession.assignedMs > 0
      ? `${Math.round(possession.homeShare * 100)}–${Math.round(
          possession.awayShare * 100,
        )} on the ball, from ${assignedPct}% of ${duration(sessionMs)} attributed`
      : `${duration(sessionMs)} watched, possession never attributable`;

  return {
    headline,
    caveats,
    lines,
    digest: {
      sessionSeconds: Math.round(sessionMs / 1000),
      ballVisibleShare: Number(ball.seenShare.toFixed(3)),
      possession: {
        homeShare: Number(possession.homeShare.toFixed(3)),
        awayShare: Number(possession.awayShare.toFixed(3)),
        attributedShare: Number(possession.assignedShare.toFixed(3)),
        turnovers: possession.turnovers,
      },
      calibrationResidualM: calibration ? Number(calibration.residualM.toFixed(3)) : null,
      staleFrames,
      teams: {
        home: { name: homeName, ...totals.home },
        away: { name: awayName, ...totals.away },
      },
      players: rows.slice(0, 24).map((row) => ({
        label: row.label,
        team: row.team,
        distanceM: Math.round(row.distanceM),
        topSpeedKph: Number(row.topSpeedKph.toFixed(1)),
        sprints: row.sprints,
        coverage: Number(row.coverage.toFixed(2)),
      })),
      thresholds,
    },
  };
}
