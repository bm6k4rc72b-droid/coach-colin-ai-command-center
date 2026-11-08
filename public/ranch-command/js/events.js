/**
 * RANCH COMMAND — alerts.
 *
 * Every detection, whether it came from Frigate over MQTT, from the edge
 * service's MegaDetector or Cowcatcher pass, or from the detector running in
 * this browser, is normalised to one shape and routed by `rules.json`. The
 * same rules file drives the edge service, so a cow at a gate is a livestock
 * job wherever it was seen — not a security alarm on the phone and a grazing
 * note on the server.
 *
 * Nothing here dispatches anything. Routing decides which queue an alert
 * lands in and how loudly; a person verifies it.
 *
 * @module ranch-command/events
 */

export const PRIORITIES = ['info', 'low', 'medium', 'high', 'critical'];

/**
 * The kind a label belongs to.
 *
 * @param {string} label A detector label.
 * @param {object} rules The rules file.
 * @returns {string} The kind, or `unknown`.
 */
export function kindOf(label, rules) {
  const key = String(label || '').toLowerCase().trim().replace(/[\s-]+/g, '_');
  return rules.classes[key] || 'unknown';
}

/**
 * Whether an hour of the day counts as night under the rules.
 *
 * @param {number} hour 0–23.
 * @param {{ start: number, end: number }} night The night window.
 * @returns {boolean} Night.
 */
export function isNight(hour, night) {
  return night.start > night.end
    ? hour >= night.start || hour < night.end
    : hour >= night.start && hour < night.end;
}

/**
 * Route one normalised event.
 *
 * @param {{ label: string, score?: number, zones?: string[], start?: number }} event The event; `start` in epoch seconds.
 * @param {object} rules The rules file.
 * @param {{ hour?: number }} [context] Override the hour (tests, replays).
 * @returns {{ rule: string, workflow: string, priority: string, reason: string, kind: string, night: boolean }} The routing.
 */
export function route(event, rules, context = {}) {
  const kind = kindOf(event.label, rules);
  const hour = Number.isFinite(context.hour)
    ? context.hour
    : new Date((event.start || Date.now() / 1000) * 1000).getHours();
  const night = isNight(hour, rules.night);
  if (Number.isFinite(event.score) && event.score < rules.minScore) {
    return { rule: 'below-threshold', workflow: 'ignore', priority: 'info', reason: `Confidence ${Math.round(event.score * 100)}% is under the ${Math.round(rules.minScore * 100)}% floor.`, kind, night };
  }
  const zones = (event.zones || []).map((z) => String(z).toLowerCase());
  for (const rule of rules.rules) {
    const w = rule.when || {};
    if (w.kind && !w.kind.includes(kind)) continue;
    if (w.zones && !zones.some((zone) => w.zones.some((keyword) => zone.includes(keyword)))) continue;
    if (typeof w.night === 'boolean' && w.night !== night) continue;
    return { rule: rule.id, workflow: rule.workflow, priority: rule.priority, reason: rule.reason, kind, night };
  }
  return { rule: 'none', workflow: 'review', priority: 'low', reason: 'No rule matched.', kind, night };
}

/**
 * Normalise a Frigate `frigate/events` MQTT message.
 *
 * Frigate sends `{ type, before, after }` with the tracked object in `after`;
 * a sub-label arrives either as a string or as `[name, score]`.
 *
 * @param {object} message The decoded JSON payload.
 * @returns {object|null} The normalised event.
 */
export function fromFrigate(message) {
  const after = message?.after || message;
  if (!after || !after.id || !after.label) return null;
  const sub = Array.isArray(after.sub_label) ? after.sub_label[0] : after.sub_label;
  return {
    id: `frigate:${after.id}`,
    frigateId: after.id,
    source: 'frigate',
    phase: message.type || 'update',
    camera: after.camera || 'camera',
    // Frigate's sub-label is where a face, a plate or a fine-grained species
    // from a second model lands, so it is the better label when present.
    label: sub || after.label,
    baseLabel: after.label,
    score: Number(after.top_score ?? after.score ?? 0),
    zones: [...new Set([...(after.current_zones || []), ...(after.entered_zones || [])])],
    start: Number(after.start_time) || Date.now() / 1000,
    end: after.end_time ? Number(after.end_time) : null,
    snapshot: Boolean(after.has_snapshot),
    falsePositive: Boolean(after.false_positive),
  };
}

/**
 * Normalise an edge-service event from `ranch/events`, which already carries
 * its routing and any model that refined it.
 *
 * @param {object} message The decoded JSON payload.
 * @returns {object|null} The normalised event.
 */
export function fromEdge(message) {
  if (!message || !message.id || !message.label) return null;
  return {
    id: `edge:${message.id}`,
    source: 'edge',
    phase: message.phase || 'new',
    camera: message.camera || 'edge',
    label: message.label,
    baseLabel: message.base_label || message.label,
    score: Number(message.score ?? 0),
    zones: message.zones || [],
    start: Number(message.start) || Date.now() / 1000,
    end: null,
    snapshot: Boolean(message.snapshot_url),
    snapshotUrl: message.snapshot_url || null,
    models: message.models || [],
    routing: message.routing || null,
  };
}

/**
 * The alert queue: deduplicates repeated updates for one tracked object,
 * keeps the highest-priority routing seen for it, and holds the verdict a
 * person gave it.
 */
export class AlertQueue {
  /**
   * @param {object} rules The rules file.
   * @param {{ limit?: number }} [options] Maximum alerts kept.
   */
  constructor(rules, { limit = 200 } = {}) {
    this.rules = rules;
    this.limit = limit;
    this.items = new Map();
  }

  /**
   * Add or update an event.
   *
   * @param {object} event A normalised event.
   * @param {{ hour?: number }} [context] Routing context.
   * @returns {object|null} The alert, or null if it was ignored.
   */
  add(event, context) {
    if (!event || event.falsePositive) return null;
    const routing = event.routing || route(event, this.rules, context);
    if (routing.workflow === 'ignore') return null;
    const existing = this.items.get(event.id);
    if (existing) {
      // An update never quietly demotes an alert someone may be looking at.
      const louder = PRIORITIES.indexOf(routing.priority) > PRIORITIES.indexOf(existing.routing.priority);
      Object.assign(existing, { ...event, routing: louder ? routing : existing.routing, updated: Date.now() });
      return existing;
    }
    const alert = { ...event, routing, verdict: null, created: Date.now(), updated: Date.now() };
    this.items.set(event.id, alert);
    if (this.items.size > this.limit) this.items.delete(this.items.keys().next().value);
    return alert;
  }

  /**
   * Record a person's verdict.
   *
   * @param {string} id Alert id.
   * @param {'confirmed'|'dismissed'} verdict The verdict.
   * @returns {boolean} Whether the alert existed.
   */
  verify(id, verdict) {
    const alert = this.items.get(id);
    if (!alert) return false;
    alert.verdict = verdict;
    alert.verifiedAt = Date.now();
    return true;
  }

  /**
   * Alerts, loudest and newest first.
   *
   * @param {{ workflow?: string, open?: boolean }} [filter] Optional filter.
   * @returns {object[]} Alerts.
   */
  list({ workflow, open } = {}) {
    return [...this.items.values()]
      .filter((a) => !workflow || a.routing.workflow === workflow)
      .filter((a) => !open || !a.verdict)
      .sort((a, b) => (PRIORITIES.indexOf(b.routing.priority) - PRIORITIES.indexOf(a.routing.priority)) || (b.updated - a.updated));
  }
}
