/**
 * RANCH COMMAND — MQTT 3.1.1 over WebSocket.
 *
 * Frigate publishes its detections to MQTT, and Meshtastic radios publish
 * their position and telemetry to MQTT as JSON, so one small client covers
 * both. It speaks just enough of the protocol to subscribe: CONNECT,
 * SUBSCRIBE, PUBLISH (receive, QoS 0 and 1), PUBACK and PINGREQ. Mosquitto's
 * `listener … protocol websockets` is the broker this is written against.
 *
 * @module ranch-command/mqtt
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

/**
 * Encode MQTT's variable-length "remaining length".
 *
 * @param {number} n Length.
 * @returns {number[]} Bytes.
 */
export function encodeLength(n) {
  const out = [];
  do {
    let byte = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) byte |= 0x80;
    out.push(byte);
  } while (n > 0);
  return out;
}

/**
 * Decode a remaining length.
 *
 * @param {Uint8Array} buf Buffer.
 * @param {number} offset Where the length starts.
 * @returns {{ value: number, bytes: number }|null} The length, or null if incomplete.
 */
export function decodeLength(buf, offset) {
  let multiplier = 1;
  let value = 0;
  for (let i = 0; i < 4; i += 1) {
    if (offset + i >= buf.length) return null;
    const byte = buf[offset + i];
    value += (byte & 0x7f) * multiplier;
    if (!(byte & 0x80)) return { value, bytes: i + 1 };
    multiplier *= 128;
  }
  throw new Error('Malformed MQTT remaining length');
}

const str = (s) => {
  const b = enc.encode(s);
  return [b.length >> 8, b.length & 0xff, ...b];
};

/**
 * Build a CONNECT packet.
 *
 * @param {{ clientId: string, username?: string, password?: string, keepAlive?: number }} options Connection options.
 * @returns {Uint8Array} The packet.
 */
export function connectPacket({ clientId, username, password, keepAlive = 30 }) {
  let flags = 0x02;
  if (username) flags |= 0x80;
  if (password) flags |= 0x40;
  const body = [...str('MQTT'), 4, flags, keepAlive >> 8, keepAlive & 0xff, ...str(clientId)];
  if (username) body.push(...str(username));
  if (password) body.push(...str(password));
  return Uint8Array.from([0x10, ...encodeLength(body.length), ...body]);
}

/**
 * Build a SUBSCRIBE packet.
 *
 * @param {number} packetId Packet id.
 * @param {string[]} topics Topic filters.
 * @param {number} [qos] Requested QoS.
 * @returns {Uint8Array} The packet.
 */
export function subscribePacket(packetId, topics, qos = 0) {
  const body = [packetId >> 8, packetId & 0xff];
  for (const topic of topics) body.push(...str(topic), qos);
  return Uint8Array.from([0x82, ...encodeLength(body.length), ...body]);
}

/**
 * Split a byte stream into MQTT packets.
 *
 * @param {Uint8Array} buf Accumulated bytes.
 * @returns {{ packets: Array<{ type: number, flags: number, body: Uint8Array }>, rest: Uint8Array }} Whole packets and leftover bytes.
 */
export function parsePackets(buf) {
  const packets = [];
  let offset = 0;
  while (offset + 2 <= buf.length) {
    const len = decodeLength(buf, offset + 1);
    if (!len) break;
    const start = offset + 1 + len.bytes;
    const end = start + len.value;
    if (end > buf.length) break;
    packets.push({ type: buf[offset] >> 4, flags: buf[offset] & 0x0f, body: buf.subarray(start, end) });
    offset = end;
  }
  return { packets, rest: buf.subarray(offset) };
}

/**
 * Decode an incoming PUBLISH.
 *
 * @param {{ flags: number, body: Uint8Array }} packet The packet.
 * @returns {{ topic: string, payload: Uint8Array, qos: number, packetId: number|null }} The message.
 */
export function decodePublish({ flags, body }) {
  const topicLen = (body[0] << 8) | body[1];
  const topic = dec.decode(body.subarray(2, 2 + topicLen));
  const qos = (flags >> 1) & 0x03;
  let offset = 2 + topicLen;
  let packetId = null;
  if (qos > 0) {
    packetId = (body[offset] << 8) | body[offset + 1];
    offset += 2;
  }
  return { topic, payload: body.subarray(offset), qos, packetId };
}

/**
 * Whether a topic matches a filter with `+` and `#` wildcards.
 *
 * @param {string} filter Topic filter.
 * @param {string} topic Topic.
 * @returns {boolean} Match.
 */
export function topicMatches(filter, topic) {
  const f = filter.split('/');
  const t = topic.split('/');
  for (let i = 0; i < f.length; i += 1) {
    if (f[i] === '#') return true;
    if (i >= t.length) return false;
    if (f[i] !== '+' && f[i] !== t[i]) return false;
  }
  return f.length === t.length;
}

/** A subscribe-only MQTT client. */
export class MqttClient {
  /**
   * @param {{ url: string, username?: string, password?: string, topics: string[], onMessage: Function, onStatus?: Function, WebSocketImpl?: Function }} options Options.
   */
  constructor({ url, username, password, topics, onMessage, onStatus = () => {}, WebSocketImpl }) {
    Object.assign(this, { url, username, password, topics, onMessage, onStatus });
    this.WS = WebSocketImpl || globalThis.WebSocket;
    this.buffer = new Uint8Array(0);
    this.closed = false;
    this.retry = 1000;
  }

  /** Open the connection, reconnecting with backoff until `close()`. */
  connect() {
    this.closed = false;
    this.onStatus('connecting');
    let ws;
    try {
      ws = new this.WS(this.url, ['mqtt']);
    } catch (error) {
      this.onStatus('error', error.message);
      return;
    }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    ws.onopen = () => {
      ws.send(connectPacket({ clientId: `ranchcmd-${Math.random().toString(16).slice(2, 10)}`, username: this.username, password: this.password }));
    };
    ws.onmessage = (event) => this.receive(new Uint8Array(event.data));
    ws.onerror = () => this.onStatus('error', 'WebSocket error');
    ws.onclose = () => {
      clearInterval(this.ping);
      if (this.closed) { this.onStatus('closed'); return; }
      this.onStatus('reconnecting');
      setTimeout(() => this.connect(), this.retry);
      this.retry = Math.min(30000, this.retry * 2);
    };
  }

  /**
   * Handle bytes from the broker.
   *
   * @param {Uint8Array} bytes Incoming bytes.
   */
  receive(bytes) {
    const joined = new Uint8Array(this.buffer.length + bytes.length);
    joined.set(this.buffer);
    joined.set(bytes, this.buffer.length);
    const { packets, rest } = parsePackets(joined);
    this.buffer = rest.slice();
    for (const packet of packets) {
      if (packet.type === 2) {
        const code = packet.body[1];
        if (code !== 0) {
          this.onStatus('error', ['', 'bad protocol', 'client id rejected', 'server unavailable', 'bad username or password', 'not authorised'][code] || `refused (${code})`);
          this.closed = true;
          this.ws.close();
          return;
        }
        this.retry = 1000;
        this.ws.send(subscribePacket(1, this.topics, 0));
        this.ping = setInterval(() => this.ws.readyState === 1 && this.ws.send(Uint8Array.from([0xc0, 0x00])), 25000);
        this.onStatus('connected');
      } else if (packet.type === 3) {
        const message = decodePublish(packet);
        if (message.qos === 1) this.ws.send(Uint8Array.from([0x40, 0x02, message.packetId >> 8, message.packetId & 0xff]));
        this.onMessage(message.topic, message.payload);
      }
    }
  }

  /** Close for good. */
  close() {
    this.closed = true;
    clearInterval(this.ping);
    try { this.ws?.send(Uint8Array.from([0xe0, 0x00])); } catch { /* already gone */ }
    this.ws?.close();
  }
}

/**
 * Decode a payload as JSON, tolerating anything that is not.
 *
 * @param {Uint8Array} payload Bytes.
 * @returns {object|null} The value.
 */
export function json(payload) {
  try {
    return JSON.parse(dec.decode(payload));
  } catch {
    return null;
  }
}
