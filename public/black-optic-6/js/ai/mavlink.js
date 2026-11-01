/**
 * MAVLink straight off the wire: your X500 / Pixhawk 6C (PX4) telemetry read
 * by the browser over Web Serial, so the drone's position on the aerial deck
 * is a measurement the aircraft reported rather than something inferred from
 * pixels.
 *
 * Why not MAVSDK in the page: MAVSDK's language bindings talk gRPC to a
 * native `mavsdk_server`, and there is no browser build. MAVLink itself is a
 * small, fully specified binary protocol, so the console parses it directly —
 * read-only. Commanding the aircraft (arm, take off, missions) stays in
 * QGroundControl or MAVSDK on a laptop, where the failsafes live.
 *
 * Wire formats (mavlink.io/en/guide/serialization.html):
 *
 *   v1: FE len seq sys comp msgid                       payload crc(2)
 *   v2: FD len incompat compat seq sys comp msgid(3 LE)  payload crc(2) [sig 13]
 *
 * The checksum is CRC-16/MCRF4XX (X.25 polynomial, init 0xFFFF) over every
 * byte after the start marker, then one more byte: the message's CRC_EXTRA,
 * a seed derived from its field layout. v2 strips trailing zero bytes from
 * the payload, so a short payload is zero-padded back before decoding.
 * The CRC_EXTRA values and field orders below were checked against
 * pymavlink's generated common dialect.
 *
 * @module black-optic-6/ai/mavlink
 */

/** One step of CRC-16/MCRF4XX. */
export function crcAccumulate(byte, crc) {
  let tmp = (byte ^ (crc & 0xff)) & 0xff;
  tmp = (tmp ^ (tmp << 4)) & 0xff;
  return ((crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xffff;
}

/** CRC over a byte range plus a CRC_EXTRA. */
export function crc(bytes, start, end, extra) {
  let c = 0xffff;
  for (let i = start; i < end; i += 1) c = crcAccumulate(bytes[i], c);
  return crcAccumulate(extra, c);
}

/** Autopilot ids in HEARTBEAT. */
export const AUTOPILOT = Object.freeze({ 0: 'generic', 3: 'ArduPilot', 8: 'none (GCS/companion)', 12: 'PX4' });

/** Vehicle types in HEARTBEAT (the common ones on a ranch). */
export const VEHICLE = Object.freeze({ 1: 'fixed wing', 2: 'quadrotor', 6: 'ground station', 10: 'ground rover', 13: 'hexarotor', 14: 'octorotor', 19: 'VTOL', 20: 'VTOL', 21: 'VTOL', 22: 'VTOL' });

/** GPS fix types in GPS_RAW_INT. */
export const FIX = Object.freeze(['no GPS', 'no fix', '2D', '3D', 'DGPS', 'RTK float', 'RTK fixed', 'static', 'PPP']);

/**
 * Messages the console decodes: id → { name, extra (CRC_EXTRA), len (full v1
 * payload length), decode(DataView) }. Field offsets follow MAVLink's wire
 * order (sorted by type size, largest first).
 */
export const MESSAGES = Object.freeze({
  0: {
    name: 'HEARTBEAT', extra: 50, len: 9,
    decode: (d) => ({
      customMode: d.getUint32(0, true), type: d.getUint8(4), autopilot: d.getUint8(5),
      baseMode: d.getUint8(6), systemStatus: d.getUint8(7), mavlinkVersion: d.getUint8(8),
      armed: (d.getUint8(6) & 0x80) !== 0,
    }),
  },
  1: {
    name: 'SYS_STATUS', extra: 124, len: 31,
    decode: (d) => ({
      voltageV: d.getUint16(14, true) === 0xffff ? null : d.getUint16(14, true) / 1000,
      currentA: d.getInt16(16, true) === -1 ? null : d.getInt16(16, true) / 100,
      batteryPct: d.getInt8(30) === -1 ? null : d.getInt8(30),
    }),
  },
  24: {
    name: 'GPS_RAW_INT', extra: 24, len: 30,
    decode: (d) => ({
      timeUsec: Number(d.getBigUint64(0, true)),
      lat: d.getInt32(8, true) / 1e7, lon: d.getInt32(12, true) / 1e7, altMslM: d.getInt32(16, true) / 1000,
      eph: d.getUint16(20, true), epv: d.getUint16(22, true),
      groundSpeedMps: d.getUint16(24, true) === 0xffff ? null : d.getUint16(24, true) / 100,
      cogDeg: d.getUint16(26, true) === 0xffff ? null : d.getUint16(26, true) / 100,
      fixType: d.getUint8(28), satellites: d.getUint8(29) === 255 ? null : d.getUint8(29),
    }),
  },
  30: {
    name: 'ATTITUDE', extra: 39, len: 28,
    decode: (d) => ({
      timeBootMs: d.getUint32(0, true),
      rollDeg: (d.getFloat32(4, true) * 180) / Math.PI, pitchDeg: (d.getFloat32(8, true) * 180) / Math.PI,
      yawDeg: (d.getFloat32(12, true) * 180) / Math.PI,
    }),
  },
  33: {
    name: 'GLOBAL_POSITION_INT', extra: 104, len: 28,
    decode: (d) => ({
      timeBootMs: d.getUint32(0, true),
      lat: d.getInt32(4, true) / 1e7, lon: d.getInt32(8, true) / 1e7,
      altMslM: d.getInt32(12, true) / 1000, relAltM: d.getInt32(16, true) / 1000,
      vxMps: d.getInt16(20, true) / 100, vyMps: d.getInt16(22, true) / 100, vzMps: d.getInt16(24, true) / 100,
      headingDeg: d.getUint16(26, true) === 0xffff ? null : d.getUint16(26, true) / 100,
    }),
  },
  74: {
    name: 'VFR_HUD', extra: 20, len: 20,
    decode: (d) => ({
      airspeedMps: d.getFloat32(0, true), groundSpeedMps: d.getFloat32(4, true), altM: d.getFloat32(8, true),
      climbMps: d.getFloat32(12, true), headingDeg: d.getInt16(16, true), throttlePct: d.getUint16(18, true),
    }),
  },
});

/**
 * Streaming parser: push bytes as they arrive from the serial port, get
 * decoded messages out. Frames with bad CRCs are counted and dropped; unknown
 * message ids are counted and skipped (their CRC_EXTRA is unknown, so they
 * cannot be verified).
 */
export class MavlinkParser {
  constructor() {
    this.buf = new Uint8Array(0);
    this.stats = { frames: 0, badCrc: 0, unknown: 0, v1: 0, v2: 0 };
  }

  /**
   * @param {Uint8Array} chunk
   * @returns {{id: number, name: string, sys: number, comp: number, seq: number, version: number, fields: object}[]}
   */
  push(chunk) {
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf, 0); merged.set(chunk, this.buf.length);
    let b = merged;
    const out = [];
    let i = 0;
    while (i < b.length) {
      const stx = b[i];
      if (stx !== 0xfe && stx !== 0xfd) { i += 1; continue; }
      const v2 = stx === 0xfd;
      const header = v2 ? 10 : 6;
      if (b.length - i < header) break;
      const len = b[i + 1];
      const signed = v2 && (b[i + 2] & 0x01);
      const total = header + len + 2 + (signed ? 13 : 0);
      if (b.length - i < total) break;
      const id = v2 ? b[i + 7] | (b[i + 8] << 8) | (b[i + 9] << 16) : b[i + 5];
      const def = MESSAGES[id];
      if (!def) { this.stats.unknown += 1; i += 1; continue; }
      const want = crc(b, i + 1, i + header + len, def.extra);
      const got = b[i + header + len] | (b[i + header + len + 1] << 8);
      if (want !== got) { this.stats.badCrc += 1; i += 1; continue; }
      const payload = new Uint8Array(Math.max(def.len, len));
      payload.set(b.subarray(i + header, i + header + len));
      out.push({
        id, name: def.name, version: v2 ? 2 : 1,
        seq: b[i + (v2 ? 4 : 2)], sys: b[i + (v2 ? 5 : 3)], comp: b[i + (v2 ? 6 : 4)],
        fields: def.decode(new DataView(payload.buffer)),
      });
      this.stats.frames += 1;
      this.stats[v2 ? 'v2' : 'v1'] += 1;
      i += total;
    }
    this.buf = b.slice(i);
    if (this.buf.length > 4096) this.buf = this.buf.slice(-280);
    return out;
  }
}

/**
 * Fold decoded messages into the aircraft's state, and produce telemetry
 * frames in the shape the aerial deck's telemetryTrack expects.
 */
export class Vehicle {
  constructor() {
    this.state = { heartbeat: null, gps: null, position: null, attitude: null, hud: null, power: null };
  }

  /**
   * @param {object} msg One decoded message.
   * @param {number} [atMs=Date.now()]
   * @returns {object|null} A telemetry frame when the message carried a position.
   */
  apply(msg, atMs = Date.now()) {
    const f = msg.fields;
    switch (msg.name) {
      case 'HEARTBEAT': this.state.heartbeat = { ...f, sys: msg.sys, atMs }; return null;
      case 'SYS_STATUS': this.state.power = f; return null;
      case 'ATTITUDE': this.state.attitude = f; return null;
      case 'VFR_HUD': this.state.hud = f; return null;
      case 'GPS_RAW_INT': this.state.gps = { ...f, atMs }; return null;
      case 'GLOBAL_POSITION_INT': {
        this.state.position = { ...f, atMs };
        return {
          atMs, source: 'mavlink', lat: f.lat, lon: f.lon,
          altitudeM: f.relAltM, altMslM: f.altMslM,
          speedMps: Math.hypot(f.vxMps, f.vyMps),
          climbMps: -f.vzMps, // NED: positive vz is down
          headingDeg: f.headingDeg,
        };
      }
      default: return null;
    }
  }

  /** One line describing the link, for the panel. */
  describe() {
    const hb = this.state.heartbeat;
    if (!hb) return 'No heartbeat yet.';
    const ap = AUTOPILOT[hb.autopilot] ?? `autopilot ${hb.autopilot}`;
    const kind = VEHICLE[hb.type] ?? `type ${hb.type}`;
    const gps = this.state.gps ? ` · GPS ${FIX[this.state.gps.fixType] ?? this.state.gps.fixType}, ${this.state.gps.satellites ?? '?'} sats` : '';
    return `${ap} ${kind}, system ${hb.sys}, ${hb.armed ? 'ARMED' : 'disarmed'}${gps}`;
  }
}

/** Serial speeds worth offering: SiK/RFD radios default to 57600, USB CDC ignores it. */
export const BAUDS = Object.freeze([57600, 115200, 921600]);
