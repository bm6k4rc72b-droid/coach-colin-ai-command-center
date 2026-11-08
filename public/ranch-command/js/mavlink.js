/**
 * RANCH COMMAND — drone telemetry over MAVLink.
 *
 * ArduPilot (and PX4) aircraft speak MAVLink. Two ways in, both read-only:
 *
 * - **mavlink2rest** (Blue Robotics) bridges a vehicle or a ground station to
 *   a WebSocket of JSON-decoded messages. This is the path that works from an
 *   iPhone.
 * - **Web Serial**, straight to a USB telemetry radio, on desktop Chrome or
 *   Edge. That path needs the binary parser below.
 *
 * Nothing in this module sends a command to an aircraft. Dispatch produces a
 * mission file a pilot reviews and uploads from their own ground station —
 * the human approval is the upload, and it happens outside this page.
 *
 * @module ranch-command/mavlink
 */

/* ------------------------------------------------------------- the wire */

/**
 * The messages this dashboard reads: id → [name, payload length, CRC extra,
 * decoder]. Fields are in MAVLink wire order (largest type first).
 */
const MESSAGES = {
  0: ['HEARTBEAT', 9, 50, (v) => ({ custom_mode: v.getUint32(0, true), type: v.getUint8(4), autopilot: v.getUint8(5), base_mode: v.getUint8(6), system_status: v.getUint8(7), mavlink_version: v.getUint8(8) })],
  1: ['SYS_STATUS', 31, 124, (v) => ({ load: v.getUint16(12, true), voltage_battery: v.getUint16(14, true), current_battery: v.getInt16(16, true), battery_remaining: v.getInt8(30) })],
  24: ['GPS_RAW_INT', 30, 24, (v) => ({ lat: v.getInt32(8, true), lon: v.getInt32(12, true), alt: v.getInt32(16, true), eph: v.getUint16(20, true), vel: v.getUint16(24, true), cog: v.getUint16(26, true), fix_type: v.getUint8(28), satellites_visible: v.getUint8(29) })],
  30: ['ATTITUDE', 28, 39, (v) => ({ time_boot_ms: v.getUint32(0, true), roll: v.getFloat32(4, true), pitch: v.getFloat32(8, true), yaw: v.getFloat32(12, true) })],
  33: ['GLOBAL_POSITION_INT', 28, 104, (v) => ({ time_boot_ms: v.getUint32(0, true), lat: v.getInt32(4, true), lon: v.getInt32(8, true), alt: v.getInt32(12, true), relative_alt: v.getInt32(16, true), vx: v.getInt16(20, true), vy: v.getInt16(22, true), vz: v.getInt16(24, true), hdg: v.getUint16(26, true) })],
  74: ['VFR_HUD', 20, 20, (v) => ({ airspeed: v.getFloat32(0, true), groundspeed: v.getFloat32(4, true), alt: v.getFloat32(8, true), climb: v.getFloat32(12, true), heading: v.getInt16(16, true), throttle: v.getUint16(18, true) })],
};

/**
 * CRC-16/MCRF4XX, the "X.25" checksum MAVLink uses.
 *
 * @param {Uint8Array} bytes Data.
 * @param {number} [crc] Running value.
 * @returns {number} The checksum.
 */
export function x25(bytes, crc = 0xffff) {
  for (const b of bytes) {
    let tmp = b ^ (crc & 0xff);
    tmp = (tmp ^ (tmp << 4)) & 0xff;
    crc = ((crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xffff;
  }
  return crc;
}

/**
 * Incremental MAVLink v1/v2 frame parser.
 *
 * Feed it whatever the serial port delivers; it returns every complete frame
 * whose checksum verifies. Unknown message ids are skipped rather than
 * rejected, because a telemetry link carries dozens of types this dashboard
 * has no use for.
 */
export class MavlinkParser {
  constructor() {
    this.buf = new Uint8Array(0);
    this.stats = { frames: 0, badCrc: 0, unknown: 0 };
  }

  /**
   * @param {Uint8Array} bytes New bytes.
   * @returns {Array<{ sysid: number, compid: number, name: string, fields: object }>} Decoded messages.
   */
  push(bytes) {
    const joined = new Uint8Array(this.buf.length + bytes.length);
    joined.set(this.buf);
    joined.set(bytes, this.buf.length);
    const out = [];
    let i = 0;
    while (i < joined.length) {
      const magic = joined[i];
      if (magic !== 0xfd && magic !== 0xfe) { i += 1; continue; }
      const v2 = magic === 0xfd;
      const header = v2 ? 10 : 6;
      if (i + header > joined.length) break;
      const len = joined[i + 1];
      const signed = v2 && (joined[i + 2] & 0x01);
      const total = header + len + 2 + (signed ? 13 : 0);
      if (i + total > joined.length) break;
      const sysid = joined[i + (v2 ? 5 : 3)];
      const compid = joined[i + (v2 ? 6 : 4)];
      const msgid = v2 ? joined[i + 7] | (joined[i + 8] << 8) | (joined[i + 9] << 16) : joined[i + 5];
      const spec = MESSAGES[msgid];
      if (!spec) {
        // A message this dashboard has no decoder for cannot have its checksum
        // verified, so its length is only trusted when the next frame starts
        // where it says it ends. Otherwise this was noise that happened to
        // contain a start byte, and skipping its "length" would swallow the
        // real frame behind it.
        const nextAt = i + total;
        // With nothing after it yet, wait for the next byte to decide.
        if (nextAt === joined.length) break;
        if (joined[nextAt] === 0xfd || joined[nextAt] === 0xfe) {
          this.stats.unknown += 1;
          i = nextAt;
        } else {
          i += 1;
        }
        continue;
      }
      const crcGiven = joined[i + header + len] | (joined[i + header + len + 1] << 8);
      const crc = x25(Uint8Array.of(spec[2]), x25(joined.subarray(i + 1, i + header + len)));
      if (crc !== crcGiven) {
        // Not a frame after all, or a damaged one: resynchronise one byte on.
        this.stats.badCrc += 1;
        i += 1;
        continue;
      }
      // MAVLink 2 trims trailing zero bytes from the payload; restore them.
      const payload = new Uint8Array(Math.max(spec[1], len));
      payload.set(joined.subarray(i + header, i + header + len));
      out.push({ sysid, compid, name: spec[0], fields: spec[3](new DataView(payload.buffer)) });
      this.stats.frames += 1;
      i += total;
    }
    this.buf = joined.slice(i);
    return out;
  }
}

/* ------------------------------------------------------- mavlink2rest */

/** Read an enum or bitmask that mavlink2rest may wrap as `{ type }` or `{ bits }`. */
const raw = (value) => (value && typeof value === 'object' ? (value.bits ?? value.type ?? value.value) : value);

/**
 * Normalise one mavlink2rest WebSocket message to the parser's shape.
 *
 * @param {object} message `{ header: { system_id, component_id }, message: { type, … } }`.
 * @returns {{ sysid: number, compid: number, name: string, fields: object }|null} The message.
 */
export function fromMavlink2Rest(message) {
  const body = message?.message;
  if (!body?.type) return null;
  const fields = {};
  for (const [key, value] of Object.entries(body)) if (key !== 'type') fields[key === 'mavtype' ? 'type' : key] = raw(value);
  return { sysid: message.header?.system_id ?? 1, compid: message.header?.component_id ?? 1, name: body.type, fields };
}

/* ------------------------------------------------------------- vehicles */

const MAV_TYPE = { 1: 'Fixed wing', 2: 'Quadcopter', 3: 'Coaxial', 4: 'Helicopter', 10: 'Ground rover', 13: 'Hexacopter', 14: 'Octocopter', 15: 'Tricopter', 19: 'VTOL', 20: 'VTOL', 21: 'VTOL' };
const COPTER_MODES = { 0: 'Stabilize', 2: 'AltHold', 3: 'Auto', 4: 'Guided', 5: 'Loiter', 6: 'RTL', 9: 'Land', 16: 'PosHold', 17: 'Brake', 21: 'SmartRTL' };
const STATE = { 0: 'uninit', 1: 'boot', 2: 'calibrating', 3: 'standby', 4: 'active', 5: 'critical', 6: 'emergency', 7: 'poweroff' };
const STATE_NAMES = { MAV_STATE_UNINIT: 0, MAV_STATE_BOOT: 1, MAV_STATE_CALIBRATING: 2, MAV_STATE_STANDBY: 3, MAV_STATE_ACTIVE: 4, MAV_STATE_CRITICAL: 5, MAV_STATE_EMERGENCY: 6, MAV_STATE_POWEROFF: 7 };
const TYPE_NAMES = { MAV_TYPE_FIXED_WING: 1, MAV_TYPE_QUADROTOR: 2, MAV_TYPE_COAXIAL: 3, MAV_TYPE_HELICOPTER: 4, MAV_TYPE_GROUND_ROVER: 10, MAV_TYPE_HEXAROTOR: 13, MAV_TYPE_OCTOROTOR: 14, MAV_TYPE_TRICOPTER: 15 };
const num = (v, names) => (typeof v === 'string' ? names[v] ?? null : v);

/** Keeps the latest known state of every aircraft on the link. */
export class Fleet {
  constructor() {
    this.vehicles = new Map();
  }

  /**
   * Apply a decoded message.
   *
   * @param {{ sysid: number, compid: number, name: string, fields: object }} m The message.
   * @param {number} [now] Time in ms.
   * @returns {object|null} The vehicle it updated.
   */
  apply(m, now = Date.now()) {
    if (!m) return null;
    // Ground stations and gimbals send heartbeats too; only autopilots are aircraft.
    if (m.name === 'HEARTBEAT' && (num(m.fields.type, TYPE_NAMES) === 6 || m.compid !== 1)) return null;
    let v = this.vehicles.get(m.sysid);
    if (!v) {
      if (m.name !== 'HEARTBEAT') return null;
      v = { sysid: m.sysid, kind: 'Aircraft', mode: '—', armed: false, state: '—', lat: null, lon: null, alt: null, battery: null, voltage: null, speed: null, heading: null, roll: 0, pitch: 0, sats: null, fix: null, seen: now };
      this.vehicles.set(m.sysid, v);
    }
    const f = m.fields;
    v.seen = now;
    switch (m.name) {
      case 'HEARTBEAT': {
        const type = num(f.type, TYPE_NAMES);
        v.kind = MAV_TYPE[type] || 'Aircraft';
        v.armed = Boolean(f.base_mode & 0x80);
        v.state = STATE[num(f.system_status, STATE_NAMES)] || '—';
        v.mode = [2, 3, 4, 13, 14, 15].includes(type) ? (COPTER_MODES[f.custom_mode] || `mode ${f.custom_mode}`) : `mode ${f.custom_mode}`;
        break;
      }
      case 'GLOBAL_POSITION_INT':
        v.lat = f.lat / 1e7;
        v.lon = f.lon / 1e7;
        v.alt = f.relative_alt / 1000;
        v.speed = Math.hypot(f.vx, f.vy) / 100;
        if (f.hdg !== 65535) v.heading = f.hdg / 100;
        break;
      case 'SYS_STATUS':
        if (f.battery_remaining >= 0) v.battery = f.battery_remaining;
        if (f.voltage_battery !== 65535) v.voltage = f.voltage_battery / 1000;
        break;
      case 'GPS_RAW_INT':
        v.sats = f.satellites_visible === 255 ? null : f.satellites_visible;
        v.fix = ['none', 'none', '2D', '3D', 'DGPS', 'RTK float', 'RTK fixed', 'static', 'PPP'][f.fix_type] || '—';
        break;
      case 'ATTITUDE':
        v.roll = f.roll;
        v.pitch = f.pitch;
        break;
      case 'VFR_HUD':
        v.speed = f.groundspeed;
        v.heading = f.heading;
        break;
      default:
        break;
    }
    return v;
  }

  /**
   * Vehicles, with any not heard from recently marked stale.
   *
   * @param {number} [now] Time in ms.
   * @returns {object[]} Vehicles.
   */
  list(now = Date.now()) {
    return [...this.vehicles.values()].map((v) => ({ ...v, stale: now - v.seen > 5000 }));
  }
}

/* ------------------------------------------------------------- dispatch */

/**
 * Build a QGroundControl `.plan` for a pilot to review and upload: take off,
 * fly to the alert, orbit-ish with a loiter, and return to launch.
 *
 * @param {{ home: { lat: number, lon: number }, target: { lat: number, lon: number }, altitude?: number, loiterSeconds?: number, note?: string }} request The request.
 * @returns {object} The plan document.
 */
export function inspectionPlan({ home, target, altitude = 40, loiterSeconds = 30, maxRange = 5000 }) {
  if (![home?.lat, home?.lon, target?.lat, target?.lon].every(Number.isFinite)) throw new Error('Home and target need a latitude and longitude.');
  // A mistyped or empty coordinate becomes a target thousands of kilometres
  // away (an empty field reads as 0, 0 — off the coast of Africa). No ranch
  // inspection hop is that long, so refuse rather than draft it.
  const range = distance(home, target);
  if (range > maxRange) throw new Error(`That target is ${(range / 1000).toFixed(1)} km from home. Inspection missions are limited to ${maxRange / 1000} km; check the coordinates.`);
  if (altitude < 10 || altitude > 120) throw new Error('Altitude must be between 10 and 120 m (the usual legal ceiling is 120 m / 400 ft).');
  const item = (doJumpId, command, params) => ({ type: 'SimpleItem', autoContinue: true, command, doJumpId, frame: 3, params });
  return {
    fileType: 'Plan',
    version: 1,
    groundStation: 'QGroundControl',
    mission: {
      version: 2,
      firmwareType: 3,
      vehicleType: 2,
      cruiseSpeed: 12,
      hoverSpeed: 5,
      plannedHomePosition: [home.lat, home.lon, 0],
      items: [
        item(1, 22, [0, 0, 0, null, home.lat, home.lon, altitude]),
        item(2, 16, [0, 0, 0, null, target.lat, target.lon, altitude]),
        item(3, 19, [loiterSeconds, 0, 0, null, target.lat, target.lon, altitude]),
        item(4, 20, [0, 0, 0, 0, 0, 0, 0]),
      ],
    },
    geoFence: { circles: [], polygons: [], version: 2 },
    rallyPoints: { points: [], version: 2 },
  };
}

/**
 * Great-circle distance in metres.
 *
 * @param {{ lat: number, lon: number }} a Point.
 * @param {{ lat: number, lon: number }} b Point.
 * @returns {number} Metres.
 */
export function distance(a, b) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
