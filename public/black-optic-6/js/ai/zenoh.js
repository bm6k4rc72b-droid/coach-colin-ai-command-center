/**
 * Zenoh in place of the bespoke sensor-bridge socket.
 *
 * Zenoh (Eclipse, Apache-2.0/EPL-2.0) is a pub/sub/query protocol built for
 * robots and constrained links; PX4 already speaks it (uXRCE-DDS → ROS 2 →
 * zenoh-bridge, or PX4's native Zenoh client in recent releases), so the X500,
 * the post cameras and this console can share one key space such as
 * `ranch/x500/position` or `ranch/gate/3/state`.
 *
 * A browser cannot open Zenoh's TCP/QUIC transports. Two routes reach it:
 *
 * - zenohd's REST plugin (`--rest-http-port 8000`): GET with
 *   `Accept: text/event-stream` subscribes to a key expression as
 *   Server-Sent Events; PUT publishes. No library at all — used here.
 * - zenoh-ts over zenohd's remote-api plugin (WebSocket) — the full API; worth
 *   it when the console needs queries and liveliness, not needed for telemetry.
 *
 * The router must send CORS headers, and an https page can only reach an
 * https router (or localhost) — both are stated on the panel when a connect
 * fails, instead of a silent empty feed.
 *
 * @module black-optic-6/ai/zenoh
 */

/**
 * Does a key match a Zenoh key expression? Chunks are separated by "/";
 * "*" matches exactly one chunk, "**" matches zero or more, and "$*" inside a
 * chunk matches any run of characters within that chunk.
 */
export function keyMatches(expr, key) {
  const e = String(expr).split('/');
  const k = String(key).split('/');
  const chunk = (pattern, text) => {
    if (pattern === '*') return text.length > 0;
    if (!pattern.includes('$*')) return pattern === text;
    const re = new RegExp(`^${pattern.split('$*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`);
    return re.test(text);
  };
  const memo = new Map();
  const go = (i, j) => {
    const id = i * 1000 + j;
    if (memo.has(id)) return memo.get(id);
    let r;
    if (i === e.length) r = j === k.length;
    else if (e[i] === '**') r = go(i + 1, j) || (j < k.length && go(i, j + 1));
    else r = j < k.length && chunk(e[i], k[j]) && go(i + 1, j + 1);
    memo.set(id, r);
    return r;
  };
  return go(0, 0);
}

/** The REST URL for a key expression on a router base such as https://router.local:8000. */
export function restUrl(base, keyExpr) {
  const b = String(base).replace(/\/+$/, '');
  return `${b}/${String(keyExpr).replace(/^\/+/, '')}`;
}

/**
 * One SSE sample from zenohd's REST plugin. The plugin sends JSON with the key
 * and the value; the value is itself JSON when the publisher used a JSON
 * encoding, else a string (or base64 for binary). Parse whichever arrived.
 *
 * @param {string} data The SSE event's data field.
 * @returns {{key: string, value: any, encoding: string|null, time: string|null}|null}
 */
export function parseSample(data) {
  let o;
  try { o = JSON.parse(data); } catch { return null; }
  if (!o || typeof o !== 'object' || typeof o.key !== 'string') return null;
  let value = o.value;
  if (typeof value === 'string') {
    try { value = JSON.parse(value); } catch { /* plain text stays text */ }
  }
  return { key: o.key, value, encoding: o.encoding ?? null, time: o.time ?? o.timestamp ?? null };
}

/**
 * Read a position out of a sample value, whatever the publisher called the
 * fields. Accepts {lat, lon, alt}, {latitude, longitude, altitude},
 * {x, y, z} with a frame of "wgs84", and MAVLink-style integer degE7.
 *
 * @returns {{lat: number, lon: number, altitudeM: number|null, speedMps: number|null}|null}
 */
export function positionOf(value) {
  if (!value || typeof value !== 'object') return null;
  let lat = value.lat ?? value.latitude ?? value.latitude_deg;
  let lon = value.lon ?? value.lng ?? value.longitude ?? value.longitude_deg;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) { lat /= 1e7; lon /= 1e7; }
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  const alt = value.relative_alt ?? value.rel_alt ?? value.alt ?? value.altitude ?? value.altitude_m ?? null;
  const speed = value.speed ?? value.groundspeed ?? value.ground_speed ?? null;
  return { lat, lon, altitudeM: Number.isFinite(alt) ? alt : null, speedMps: Number.isFinite(speed) ? speed : null };
}

/**
 * Subscribe over SSE. Browser-only (EventSource).
 */
export class ZenohRest {
  /**
   * @param {object} handlers
   * @param {(sample: object) => void} handlers.onSample
   * @param {(state: 'connecting'|'live'|'error'|'closed', detail?: string) => void} handlers.onState
   */
  constructor({ onSample, onState }) {
    this.onSample = onSample;
    this.onState = onState;
    this.source = null;
    this.count = 0;
  }

  connect(base, keyExpr) {
    this.close();
    const url = restUrl(base, keyExpr);
    if (location.protocol === 'https:' && /^http:/.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(url)) {
      this.onState('error', 'This page is https, so the browser will not open an http:// router (mixed content). Serve zenohd behind https, or use localhost.');
      return;
    }
    this.onState('connecting', url);
    const source = new EventSource(url);
    this.source = source;
    const take = (event) => {
      const sample = parseSample(event.data);
      if (!sample) return;
      this.count += 1;
      if (this.count === 1) this.onState('live', `${url} — first sample on ${sample.key}`);
      this.onSample(sample);
    };
    for (const type of ['message', 'PUT', 'put']) source.addEventListener(type, take);
    source.onerror = () => {
      if (source.readyState === EventSource.CLOSED) this.onState('error', 'The router closed the stream or refused it (check the REST plugin and its CORS headers).');
      else if (!this.count) this.onState('connecting', 'Retrying…');
    };
  }

  close() {
    this.source?.close();
    this.source = null;
    this.onState?.('closed');
  }

  /** Publish a JSON value with HTTP PUT. */
  static async put(base, key, value) {
    const response = await fetch(restUrl(base, key), {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value),
    });
    if (!response.ok) throw new Error(`router answered ${response.status}`);
  }
}
