/**
 * Meshtastic: $20 LoRa radios on the Q7 / P10 posts that keep talking when
 * Starlink is down. "Gate 3 open" arrives as a text over the mesh, and this
 * console can send one.
 *
 * The browser reaches a node over Web Serial (USB cable, Chromium browsers)
 * using Meshtastic's stream protocol: each protobuf is framed as
 *
 *   0x94 0xC3 len_hi len_lo  <len bytes of ToRadio / FromRadio>
 *
 * and the client opens the conversation with ToRadio{want_config_id}, after
 * which the node streams its config, node list and every packet it hears as
 * FromRadio messages. Only the handful of protobuf fields needed for text
 * messages are encoded and decoded here, by hand; their field numbers were
 * checked against the official meshtastic protobufs (mesh.proto), and the
 * test vectors in tests/black-optic-6 are byte-for-byte what the Python
 * library emits.
 *
 * Text over LoRa is slow and small: one packet carries at most about 230
 * bytes of payload, and LongFast airtime is roughly a second per message.
 * Meant for "gate 3 open", not video.
 *
 * @module black-optic-6/ai/meshtastic
 */

export const START1 = 0x94;
export const START2 = 0xc3;
export const MAX_FRAME = 512;
/** Longest text this console will send, in UTF-8 bytes (DATA_PAYLOAD_LEN is 233). */
export const MAX_TEXT_BYTES = 200;
export const BROADCAST = 0xffffffff;
export const PORT_TEXT = 1;
export const PORT_POSITION = 3;

/* ------------------------------------------------------------ protobuf */

function varint(value) {
  const out = [];
  let v = value >>> 0;
  if (value > 0xffffffff) v = value; // not used above 32 bits here
  while (v > 0x7f) { out.push((v & 0x7f) | 0x80); v = Math.floor(v / 128); }
  out.push(v);
  return out;
}
const tag = (field, wire) => varint((field << 3) | wire);
const fixed32 = (v) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
const lenDelim = (field, bytes) => [...tag(field, 2), ...varint(bytes.length), ...bytes];

/** Read every field of a protobuf message into {field: [values]}. */
export function readFields(bytes) {
  const fields = {};
  let i = 0;
  const readVarint = () => {
    let result = 0; let shift = 0; let b;
    do {
      if (i >= bytes.length) throw new Error('truncated varint');
      b = bytes[i++];
      result += (b & 0x7f) * 2 ** shift;
      shift += 7;
    } while (b & 0x80);
    return result;
  };
  while (i < bytes.length) {
    const key = readVarint();
    const field = Math.floor(key / 8); const wire = key & 7;
    let value;
    if (wire === 0) value = readVarint();
    else if (wire === 1) { value = bytes.subarray(i, i + 8); i += 8; }
    else if (wire === 2) { const n = readVarint(); value = bytes.subarray(i, i + n); i += n; }
    else if (wire === 5) { value = new DataView(bytes.buffer, bytes.byteOffset + i, 4); i += 4; }
    else throw new Error(`unsupported wire type ${wire}`);
    if (i > bytes.length) throw new Error('truncated field');
    (fields[field] ??= []).push({ wire, value });
  }
  return fields;
}

const u32 = (f) => (f?.[0]?.value instanceof DataView ? f[0].value.getUint32(0, true) : f?.[0]?.value ?? 0);
const f32 = (f) => (f?.[0]?.value instanceof DataView ? f[0].value.getFloat32(0, true) : null);

/* -------------------------------------------------------------- encode */

/**
 * ToRadio carrying a text message.
 *
 * @param {string} text
 * @param {object} [options]
 * @param {number} [options.to=BROADCAST] Destination node number.
 * @param {number} [options.channel=0] Channel index.
 * @param {number} [options.id] Packet id (random if omitted).
 * @param {number} [options.hopLimit=3]
 * @param {boolean} [options.wantAck=true]
 * @returns {Uint8Array}
 */
export function encodeText(text, { to = BROADCAST, channel = 0, id = (Math.random() * 0xffffffff) >>> 0, hopLimit = 3, wantAck = true } = {}) {
  const payload = new TextEncoder().encode(text);
  if (payload.length > MAX_TEXT_BYTES) throw new Error(`Text is ${payload.length} bytes; one LoRa packet carries ${MAX_TEXT_BYTES}.`);
  const data = [...tag(1, 0), ...varint(PORT_TEXT), ...lenDelim(2, payload)];
  const packet = [
    ...tag(2, 5), ...fixed32(to),
    ...(channel ? [...tag(3, 0), ...varint(channel)] : []),
    ...lenDelim(4, data),
    ...tag(6, 5), ...fixed32(id),
    ...(hopLimit ? [...tag(9, 0), ...varint(hopLimit)] : []),
    ...(wantAck ? [...tag(10, 0), 1] : []),
  ];
  return Uint8Array.from(lenDelim(1, packet));
}

/** ToRadio{want_config_id}: asks the node to stream its state. */
export function encodeWantConfig(id) {
  return Uint8Array.from([...tag(3, 0), ...varint(id)]);
}

/** Wrap a protobuf in the serial stream header. */
export function frame(bytes) {
  if (bytes.length > MAX_FRAME) throw new Error('frame too long');
  return Uint8Array.from([START1, START2, bytes.length >> 8, bytes.length & 0xff, ...bytes]);
}

/* -------------------------------------------------------------- decode */

/**
 * Pull complete frames out of the serial byte stream. Bytes outside frames
 * are the node's debug log text and are returned separately.
 */
export class FrameReader {
  constructor() { this.buf = []; }

  /** @returns {{frames: Uint8Array[], log: string}} */
  push(chunk) {
    const b = this.buf.concat(Array.from(chunk));
    const frames = []; const logBytes = [];
    let i = 0;
    while (i < b.length) {
      if (b[i] !== START1) { logBytes.push(b[i]); i += 1; continue; }
      if (i + 1 >= b.length) break;
      if (b[i + 1] !== START2) { logBytes.push(b[i]); i += 1; continue; }
      if (i + 4 > b.length) break;
      const len = (b[i + 2] << 8) | b[i + 3];
      if (len > MAX_FRAME) { i += 1; continue; } // corrupt header: resynchronise
      if (i + 4 + len > b.length) break;
      frames.push(Uint8Array.from(b.slice(i + 4, i + 4 + len)));
      i += 4 + len;
    }
    this.buf = b.slice(i);
    return { frames, log: new TextDecoder().decode(Uint8Array.from(logBytes)) };
  }
}

/**
 * Decode the FromRadio variants this console uses.
 *
 * @param {Uint8Array} bytes
 * @returns {{kind: string, [k: string]: any}}
 */
export function decodeFromRadio(bytes) {
  const f = readFields(bytes);
  if (f[2]) {
    const p = readFields(f[2][0].value);
    const packet = {
      from: u32(p[1]), to: u32(p[2]), channel: p[3]?.[0]?.value ?? 0, id: u32(p[6]),
      rxSnr: f32(p[8]), hopLimit: p[9]?.[0]?.value ?? null, encrypted: Boolean(p[5]),
    };
    if (p[4]) {
      const d = readFields(p[4][0].value);
      packet.portnum = d[1]?.[0]?.value ?? 0;
      packet.payload = d[2]?.[0]?.value ?? new Uint8Array(0);
      if (packet.portnum === PORT_TEXT) packet.text = new TextDecoder().decode(packet.payload);
    }
    return { kind: 'packet', packet };
  }
  if (f[3]) return { kind: 'myInfo', myNodeNum: readFields(f[3][0].value)[1]?.[0]?.value ?? 0 };
  if (f[4]) {
    const n = readFields(f[4][0].value);
    const user = n[2] ? readFields(n[2][0].value) : {};
    const str = (x) => (x ? new TextDecoder().decode(x[0].value) : '');
    return { kind: 'nodeInfo', num: n[1]?.[0]?.value ?? 0, longName: str(user[2]), shortName: str(user[3]) };
  }
  if (f[7]) return { kind: 'configComplete', id: f[7][0].value };
  if (f[8]) return { kind: 'rebooted' };
  return { kind: 'other', fields: Object.keys(f).map(Number) };
}

/** Meshtastic's node-id string for a node number: "!0a0b0c0d". */
export function nodeId(num) {
  return `!${(num >>> 0).toString(16).padStart(8, '0')}`;
}

/**
 * Read a gate report out of free text: "gate 3 open", "Gate north CLOSED",
 * "g3 open". Null when the text is not a gate report.
 *
 * @returns {{gate: string, state: 'open'|'closed'}|null}
 */
export function parseGate(text) {
  const m = /\b(?:gate\s*#?\s*|g(?=\d))(?!is\b)([a-z0-9-]+)\s+(?:is\s+)?(open(?:ed)?|closed?|shut)\b/i.exec(String(text));
  if (!m) return null;
  return { gate: m[1].toLowerCase(), state: /^open/i.test(m[2]) ? 'open' : 'closed' };
}
