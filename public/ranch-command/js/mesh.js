/**
 * RANCH COMMAND — off-grid mesh and field sensors.
 *
 * Meshtastic LoRa radios reach places cell service never will, and with
 * "JSON output" enabled on a node's MQTT module they publish position,
 * battery, environment readings and text messages as JSON. Solar field
 * stations (SPARROW-style acoustic and camera units, water-tank floats, gate
 * switches) are expected on `ranch/sensors/<node>/<metric>`, one number or a
 * JSON object per message, so any device that can publish MQTT can join.
 *
 * @module ranch-command/mesh
 */

/**
 * Normalise a Meshtastic JSON MQTT message.
 *
 * @param {object} m The message.
 * @returns {{ node: string, type: string, patch: object, at: number }|null} A change to apply to that node.
 */
export function fromMeshtastic(m) {
  if (!m || typeof m !== 'object' || !m.type) return null;
  const node = m.sender || (Number.isFinite(m.from) ? `!${(m.from >>> 0).toString(16).padStart(8, '0')}` : null);
  if (!node) return null;
  const p = m.payload || {};
  const at = (Number(m.timestamp) || Date.now() / 1000) * 1000;
  const patch = { rssi: m.rssi ?? null, snr: m.snr ?? null, hops: m.hops_away ?? null };
  switch (m.type) {
    case 'position':
      if (Number.isFinite(p.latitude_i)) patch.lat = p.latitude_i / 1e7;
      if (Number.isFinite(p.longitude_i)) patch.lon = p.longitude_i / 1e7;
      if (Number.isFinite(p.altitude)) patch.alt = p.altitude;
      break;
    case 'telemetry':
      if (Number.isFinite(p.battery_level)) patch.battery = p.battery_level;
      if (Number.isFinite(p.voltage)) patch.voltage = p.voltage;
      if (Number.isFinite(p.temperature)) patch.temperature = p.temperature;
      if (Number.isFinite(p.relative_humidity)) patch.humidity = p.relative_humidity;
      if (Number.isFinite(p.barometric_pressure)) patch.pressure = p.barometric_pressure;
      break;
    case 'nodeinfo':
      if (p.longname) patch.name = p.longname;
      if (p.shortname) patch.short = p.shortname;
      break;
    case 'text':
      if (p.text) patch.lastText = String(p.text).slice(0, 240);
      break;
    default:
      break;
  }
  for (const k of Object.keys(patch)) if (patch[k] === null) delete patch[k];
  return { node, type: m.type, patch, at };
}

/**
 * Normalise a field-sensor message on `ranch/sensors/<node>/<metric>`.
 *
 * @param {string} topic The topic.
 * @param {object|number|string} value The decoded payload.
 * @returns {{ node: string, type: string, patch: object, at: number }|null} A change.
 */
export function fromSensor(topic, value) {
  const parts = topic.split('/');
  if (parts[0] !== 'ranch' || parts[1] !== 'sensors' || parts.length < 3) return null;
  const node = parts[2];
  const metric = parts[3];
  const patch = {};
  if (metric) {
    const n = typeof value === 'object' && value ? value.value : Number(value);
    if (!Number.isFinite(Number(n))) return null;
    patch[metric] = Number(n);
  } else if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) if (Number.isFinite(Number(v))) patch[k] = Number(v);
  }
  if (!Object.keys(patch).length) return null;
  return { node, type: 'sensor', patch, at: Date.now() };
}

/** The current state of every node heard from. */
export class Mesh {
  constructor() {
    this.nodes = new Map();
  }

  /**
   * @param {{ node: string, type: string, patch: object, at: number }|null} change A change.
   * @returns {object|null} The node.
   */
  apply(change) {
    if (!change) return null;
    const node = this.nodes.get(change.node) || { id: change.node, name: change.node, kind: change.type === 'sensor' ? 'sensor' : 'radio', seen: 0 };
    Object.assign(node, change.patch);
    node.seen = Math.max(node.seen, change.at);
    this.nodes.set(change.node, node);
    return node;
  }

  /**
   * @param {number} [now] Time in ms.
   * @returns {object[]} Nodes, most recently heard first, with staleness.
   */
  list(now = Date.now()) {
    return [...this.nodes.values()].map((n) => ({ ...n, stale: now - n.seen > 30 * 60 * 1000 })).sort((a, b) => b.seen - a.seen);
  }
}
