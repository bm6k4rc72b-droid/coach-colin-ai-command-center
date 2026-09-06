/**
 * Writing up a track, without making anything up.
 *
 * The brief asked for an AI summary of each subject the system locks onto. This
 * module is that summary, and the shape it takes is a decision rather than a
 * limitation: every sentence is generated from a measurement, and every
 * measurement is printed next to the sentence it produced. Not "subject
 * displaying suspicious behaviour" but "path doubled back four times inside
 * 3 m of the gate over 47 s". The operator can disagree with the second one.
 *
 * Three rules hold everywhere in here, and they are what keep the output from
 * becoming an accusation with a number attached:
 *
 * **No claim without its evidence.** Each line carries the figure behind it,
 * and lines whose measurement is missing or low-confidence are omitted rather
 * than softened. A missing gait estimate produces no cadence sentence at all.
 *
 * **No inference about intent, mood or character.** Kinematics have no access
 * to any of those. The vocabulary here is deliberately flat — paused, reversed,
 * approached, left — and there is no threat score, because a threat score is a
 * guess about a person's mind dressed up as arithmetic, and it is exactly the
 * number people would act on.
 *
 * **No identity.** A subject is "Track 7", scoped to this session, with an
 * appearance descriptor too coarse to match anybody against anything. Nothing
 * here recognises a face, and nothing persists after the session unless the
 * operator exports it deliberately.
 *
 * The writer is deterministic and pure, which is also what makes it testable:
 * the same track always produces the same words, and a test can assert that a
 * subject who never stopped never gets a sentence about pausing.
 *
 * @module sentry/dossier
 */

import { cadence, dwellSeconds, limbActivity, posture, reversals, sinuosity } from './behaviour.js';
import { classify, describe } from './classify.js';
import { netDisplacement } from './tracker.js';

/**
 * Reduce a live track to the measurements a summary is written from.
 *
 * @param {object} track A tracker record.
 * @param {object} [context] Extra observations.
 * @param {Array<{type: string, zoneName: string, timeMs: number, detail: string}>}
 *   [context.events] Zone events attributed to this track.
 * @param {{breathsPerMin: number|null, bpm: number|null, grade: string,
 *   reason: string}} [context.vitals] Vitals reading, when one exists.
 * @returns {object} A flat record of everything measured.
 */
export function measure(track, context = {}) {
  const { events = [], vitals = null } = context;
  const durationSec = (track.lastSeenMs - track.startMs) / 1000;
  const gait = cadence(track.bobs);
  const shape = posture(track.boxHeight, track.boxWidth);
  const identification = classify({
    heightM: track.heightM,
    aspect: shape.ratio,
    fill: track.fill,
    speedMps: track.speedMps,
    peakSpeedMps: track.peakSpeedMps,
    cadence: gait,
  });
  return {
    id: track.id,
    durationSec,
    distanceM: track.distanceM,
    netM: netDisplacement(track.path),
    // Two speeds, because they answer different questions. The average over the
    // whole track is what a summary should quote — it is the figure that
    // matches the distance beside it. The instantaneous one is what the live
    // overlay shows, and quoting it in a write-up would report whatever the
    // subject happened to be doing in the last second before they left frame.
    meanSpeedMps: durationSec > 0 ? track.distanceM / durationSec : 0,
    speedMps: track.speedMps,
    peakSpeedMps: track.peakSpeedMps,
    heightM: track.heightM,
    posture: shape.posture,
    aspect: shape.ratio,
    cadence: gait,
    sinuosity: sinuosity(track.path),
    dwellSec: dwellSeconds(track.path),
    reversals: reversals(track.path),
    limbs: limbActivity(track.upperEnergy, track.speedMps),
    classification: identification,
    events,
    vitals,
  };
}

/**
 * Turn measurements into sentences.
 *
 * @param {object} m A record from {@link measure}.
 * @returns {{headline: string, lines: string[], caveats: string[]}} The written
 *   summary: one identifying line, the observations that had evidence, and the
 *   things the reader should not conclude from them.
 */
export function write(m) {
  const lines = [];
  const caveats = [];

  const seen = m.durationSec >= 60
    ? `${Math.floor(m.durationSec / 60)} min ${Math.round(m.durationSec % 60)} s`
    : `${m.durationSec.toFixed(1)} s`;
  const headline = `Track ${m.id} — ${describe(m.classification)} In view ${seen}.`;

  if (m.distanceM > 0.3) {
    lines.push(
      `Covered ${m.distanceM.toFixed(1)} m of ground at ${m.meanSpeedMps.toFixed(2)} m/s on average, ` +
        `peaking at ${m.peakSpeedMps.toFixed(2)} m/s.`,
    );
  } else {
    lines.push(`Stayed put — under 0.3 m of ground movement in ${seen}.`);
  }

  if (m.netM > 0.3 && m.distanceM > 0.3) {
    lines.push(
      `Ended ${m.netM.toFixed(1)} m from where it was first seen` +
        (m.sinuosity && m.sinuosity < 90
          ? `, having walked ${m.sinuosity.toFixed(1)}× that in path length.`
          : '.'),
    );
  }

  if (m.cadence?.confident) {
    lines.push(
      `Gait rhythm of ${Math.round(m.cadence.stepsPerMin)} steps a minute ` +
        `(${m.cadence.snrDb.toFixed(1)} dB above the noise).`,
    );
  }

  if (m.dwellSec >= 5) {
    lines.push(`Longest pause: ${Math.round(m.dwellSec)} s inside a 1.5 m circle.`);
  }
  if (m.reversals >= 2) {
    lines.push(`Path reversed direction ${m.reversals} times — back-and-forth movement, not a crossing.`);
  }
  if (m.limbs?.elevated) {
    lines.push(
      `Upper-body movement well above what the body's own travel accounts for ` +
        `(activity index ${m.limbs.index.toFixed(2)}) — arm or hand motion while largely stationary.`,
    );
  }
  if (m.posture === 'prone' || m.posture === 'low') {
    lines.push(`Silhouette is ${m.posture} (${m.aspect.toFixed(1)}:1) rather than upright.`);
  }

  if (m.events?.length) {
    const byZone = new Map();
    for (const event of m.events) {
      byZone.set(event.zoneName, (byZone.get(event.zoneName) ?? 0) + 1);
    }
    const parts = [...byZone].map(([zone, count]) => `${zone}${count > 1 ? ` ×${count}` : ''}`);
    lines.push(`Zone activity: ${parts.join(', ')}.`);
    const latest = m.events[m.events.length - 1];
    lines.push(`Most recent: ${latest.detail}.`);
  }

  if (m.vitals) {
    if (m.vitals.breathsPerMin) {
      lines.push(`Breathing about ${Math.round(m.vitals.breathsPerMin)} a minute, from torso motion while still.`);
    }
    if (m.vitals.bpm) {
      lines.push(`Pulse about ${Math.round(m.vitals.bpm)} bpm from skin colour (${m.vitals.grade} quality).`);
      caveats.push('The pulse figure is a research-grade camera estimate, not a medical measurement.');
    }
    if (!m.vitals.breathsPerMin && !m.vitals.bpm) {
      lines.push(`No vitals: ${m.vitals.reason}.`);
    }
  }

  if (m.heightM === null) {
    caveats.push('No ground calibration, so distances and heights are unavailable and the classification is a guess.');
  }
  if (m.classification.confidence < 0.35 && m.heightM !== null) {
    caveats.push('The classification is weak — more than one category fits these measurements.');
  }
  if (m.cadence && !m.cadence.confident) {
    caveats.push('A step rhythm was present but too weak to report a cadence from.');
  }
  caveats.push('These are measurements of movement. They say nothing about intent.');

  return { headline, lines, caveats };
}

/**
 * The whole summary as plain text, for the clipboard and the log.
 *
 * @param {object} m A record from {@link measure}.
 * @returns {string} Multi-line text.
 */
export function toText(m) {
  const { headline, lines, caveats } = write(m);
  return [headline, '', ...lines.map((l) => `• ${l}`), '', ...caveats.map((c) => `— ${c}`)].join('\n');
}

/**
 * The numbers alone, for the optional language model.
 *
 * Only measurements leave this function. No frame, no crop, no image of any
 * kind, and no timestamp precise enough to place a person anywhere: if the
 * operator turns on narration, what goes over the wire is arithmetic.
 *
 * @param {object} m A record from {@link measure}.
 * @returns {object} A compact, shareable digest.
 */
export function digest(m) {
  return {
    track: m.id,
    seconds: Number(m.durationSec.toFixed(1)),
    metresWalked: Number(m.distanceM.toFixed(2)),
    netMetres: Number(m.netM.toFixed(2)),
    speedMps: Number(m.meanSpeedMps.toFixed(2)),
    peakSpeedMps: Number(m.peakSpeedMps.toFixed(2)),
    heightM: m.heightM === null ? null : Number(m.heightM.toFixed(2)),
    posture: m.posture,
    stepsPerMin: m.cadence?.confident ? Math.round(m.cadence.stepsPerMin) : null,
    pathReversals: m.reversals,
    longestPauseSec: Math.round(m.dwellSec),
    upperBodyActivity: m.limbs ? Number(m.limbs.index.toFixed(2)) : null,
    classified: m.classification.label,
    classifierConfidence: Number(m.classification.confidence.toFixed(2)),
    zoneEvents: (m.events ?? []).map((e) => ({ type: e.type, zone: e.zoneName })),
    breathsPerMin: m.vitals?.breathsPerMin ? Math.round(m.vitals.breathsPerMin) : null,
    pulseBpm: m.vitals?.bpm ? Math.round(m.vitals.bpm) : null,
  };
}
