/**
 * Zone engine: the part of the system that turns tracked boxes into
 * "space 14 is occupied", "someone walked into the loading bay" and
 * "37 cars in, 29 out" — the same job a parking-occupancy product does with
 * in-ground magnetometers, done here from the camera you already have.
 *
 * Three zone kinds:
 *   - space       a parking bay (or any area) that is occupied/free;
 *   - restricted  an area where presence raises an event;
 *   - line        a directed gate that counts crossings in each direction.
 *
 * Occupancy is decided per frame from box coverage of the bay or the box's
 * ground-contact point, then debounced in time so a passing car does not
 * register as parked and a pedestrian walking in front does not vacate it.
 *
 * @module vulture/lot
 */

import { coverage, pointInPolygon, samplePolygon, segmentsIntersect, side } from './geometry.js';
import { familyOf } from './tracker.js';

/**
 * @typedef {object} Zone
 * @property {string} id Unique id.
 * @property {string} name Display name.
 * @property {'space'|'restricted'|'line'} kind Zone type.
 * @property {{x:number,y:number}[]} points Polygon (or two points for a line).
 * @property {'vehicle'|'person'|'any'} [accepts] Which tracks count.
 */

export const DEFAULT_LOT_SETTINGS = Object.freeze({
  coverMin: 0.35,
  enterMs: 2000,
  exitMs: 4000,
  sampleMs: 5000,
  maxSamples: 17280,
});

const accepts = (zone, label) => {
  const want = zone.accepts ?? { space: 'vehicle', restricted: 'person', line: 'any' }[zone.kind];
  return want === 'any' || familyOf(label) === want;
};

export class LotModel {
  /**
   * @param {Zone[]} zones Zones drawn in the space designer.
   * @param {Partial<typeof DEFAULT_LOT_SETTINGS>} [settings] Overrides.
   */
  constructor(zones = [], settings = {}) {
    this.settings = { ...DEFAULT_LOT_SETTINGS, ...settings };
    this.samples = [];
    this.lastSample = -Infinity;
    this.startedAt = null;
    this.setZones(zones);
  }

  /**
   * Replace the zone set, keeping state for zones that still exist.
   *
   * @param {Zone[]} zones New zones.
   */
  setZones(zones) {
    const old = new Map((this.state ?? []).map((s) => [s.zone.id, s]));
    this.zones = zones;
    this.state = zones.map((zone) => {
      const prev = old.get(zone.id);
      const base = prev ?? {
        occupied: false, pendingSince: null, since: null, occupiedMs: 0, observedMs: 0,
        sessions: [], turnovers: 0, inside: new Set(), countIn: 0, countOut: 0, lastT: null,
      };
      base.zone = zone;
      base.samples = zone.kind === 'line' ? null : samplePolygon(zone.points);
      return base;
    });
  }

  /**
   * Advance with this frame's tracks.
   *
   * @param {import('./tracker.js').Track[]} tracks Visible confirmed tracks.
   * @param {number} t Timestamp (ms).
   * @returns {object[]} Events raised this frame.
   */
  update(tracks, t) {
    if (this.startedAt === null) this.startedAt = t;
    const { coverMin, enterMs, exitMs } = this.settings;
    const events = [];
    for (const s of this.state) {
      const z = s.zone;
      const dt = s.lastT === null ? 0 : Math.min(t - s.lastT, 10_000);
      s.lastT = t;
      if (z.kind === 'line') {
        const [a, b] = z.points;
        for (const tr of tracks) {
          if (!tr.prevFoot || !accepts(z, tr.label)) continue;
          if (!segmentsIntersect(tr.prevFoot, tr.foot, a, b)) continue;
          const before = side(a, b, tr.prevFoot);
          const after = side(a, b, tr.foot);
          if (before === after || (before > 0) === (after > 0)) continue;
          const dir = before > 0 ? 'in' : 'out';
          if (dir === 'in') s.countIn++; else s.countOut++;
          events.push({ type: 'line-cross', zone: z, dir, track: tr.id, label: tr.label, t });
        }
        continue;
      }
      if (z.kind === 'restricted') {
        const now = new Set();
        for (const tr of tracks) {
          if (accepts(z, tr.label) && pointInPolygon(tr.foot, z.points)) now.add(tr.id);
        }
        for (const id of now) {
          if (!s.inside.has(id)) {
            const tr = tracks.find((x) => x.id === id);
            events.push({ type: 'zone-enter', zone: z, track: id, label: tr?.label, t });
          }
        }
        s.inside = now;
        s.occupied = now.size > 0;
        continue;
      }
      // Parking space.
      s.observedMs += dt;
      if (s.occupied) s.occupiedMs += dt;
      let hit = false;
      for (const tr of tracks) {
        if (!accepts(z, tr.label)) continue;
        const contact = { x: tr.foot.x, y: tr.foot.y - tr.box.h * 0.15 };
        if (coverage(s.samples, tr.box) >= coverMin || pointInPolygon(contact, z.points)) { hit = true; break; }
      }
      if (hit !== s.occupied) {
        if (s.pendingSince === null) s.pendingSince = t;
        if (t - s.pendingSince >= (hit ? enterMs : exitMs)) {
          const changedAt = s.pendingSince;
          s.occupied = hit;
          s.pendingSince = null;
          if (hit) {
            s.since = changedAt;
            events.push({ type: 'space-occupied', zone: z, t });
          } else {
            const dwell = s.since === null ? 0 : changedAt - s.since;
            s.sessions.push(dwell);
            if (s.sessions.length > 500) s.sessions.shift();
            s.turnovers++;
            s.since = null;
            events.push({ type: 'space-vacated', zone: z, dwell, t });
          }
        }
      } else {
        s.pendingSince = null;
      }
    }
    if (t - this.lastSample >= this.settings.sampleMs) {
      this.lastSample = t;
      this.samples.push(this.snapshot(t, tracks));
      if (this.samples.length > this.settings.maxSamples) this.samples.shift();
    }
    return events;
  }

  /**
   * Compact record of the lot at time t (stored in history).
   *
   * @param {number} t Timestamp.
   * @param {import('./tracker.js').Track[]} [tracks] Visible tracks.
   * @returns {object} Sample.
   */
  snapshot(t, tracks = []) {
    const spaces = this.state.filter((s) => s.zone.kind === 'space');
    return {
      t,
      occ: spaces.filter((s) => s.occupied).length,
      total: spaces.length,
      bits: spaces.map((s) => (s.occupied ? '1' : '0')).join(''),
      vehicles: tracks.filter((tr) => familyOf(tr.label) === 'vehicle').length,
      persons: tracks.filter((tr) => tr.label === 'person').length,
    };
  }

  /** @returns {object} Live summary for the dashboard. */
  summary() {
    const spaces = this.state.filter((s) => s.zone.kind === 'space');
    const occ = spaces.filter((s) => s.occupied).length;
    const lines = this.state.filter((s) => s.zone.kind === 'line');
    return {
      total: spaces.length,
      occupied: occ,
      free: spaces.length - occ,
      pct: spaces.length ? (occ / spaces.length) * 100 : 0,
      countIn: lines.reduce((a, s) => a + s.countIn, 0),
      countOut: lines.reduce((a, s) => a + s.countOut, 0),
      restrictedBusy: this.state.filter((s) => s.zone.kind === 'restricted' && s.occupied).length,
    };
  }

  /**
   * Per-space analytics.
   *
   * @param {number} t Now.
   * @returns {object[]} Rows: name, utilisation %, turnovers, mean dwell ms, current dwell ms.
   */
  analytics(t) {
    return this.state.filter((s) => s.zone.kind === 'space').map((s) => {
      const done = s.sessions;
      const mean = done.length ? done.reduce((a, b) => a + b, 0) / done.length : 0;
      return {
        id: s.zone.id,
        name: s.zone.name,
        occupied: s.occupied,
        utilisation: s.observedMs ? (s.occupiedMs / s.observedMs) * 100 : 0,
        turnovers: s.turnovers,
        meanDwell: mean,
        currentDwell: s.occupied && s.since !== null ? Math.max(0, t - s.since) : 0,
      };
    });
  }

  /**
   * Occupancy by hour of day from the stored samples.
   *
   * @returns {number[]} 24 mean-occupancy percentages (NaN where no data).
   */
  hourly() {
    const sum = new Array(24).fill(0);
    const n = new Array(24).fill(0);
    for (const s of this.samples) {
      if (!s.total) continue;
      const h = new Date(s.t).getHours();
      sum[h] += (s.occ / s.total) * 100;
      n[h]++;
    }
    return sum.map((v, i) => (n[i] ? v / n[i] : NaN));
  }
}

/**
 * Samples → CSV.
 *
 * @param {object[]} samples History.
 * @param {Zone[]} zones Zones (for the per-space columns).
 * @returns {string} CSV text.
 */
export function samplesToCsv(samples, zones) {
  const spaces = zones.filter((z) => z.kind === 'space');
  const head = ['time_iso', 'occupied', 'total', 'vehicles', 'persons', ...spaces.map((z) => z.name)];
  const rows = samples.map((s) => [
    new Date(s.t).toISOString(), s.occ, s.total, s.vehicles, s.persons,
    ...spaces.map((_, i) => s.bits[i] ?? ''),
  ]);
  return [head, ...rows].map((r) => r.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(',')).join('\n');
}
