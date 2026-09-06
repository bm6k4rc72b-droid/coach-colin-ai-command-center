/**
 * Sensing through a wall, and why this file cannot do it by itself.
 *
 * The request this module answers is "see through walls over WiFi", and the
 * research behind it is real: channel state information from a commodity WiFi
 * link carries enough of the multipath structure of a room to locate people in
 * it, count them, and — in the strongest published results — recover coarse body
 * pose through drywall. Person-in-WiFi and DensePose-from-WiFi both did it.
 * Millimetre-wave presence sensors do a plainer version of the same thing and
 * cost about as much as a smoke alarm.
 *
 * None of it is reachable from this app on its own, and the reason is worth
 * being precise about rather than hand-waving:
 *
 * - A browser has no radio API at all. `navigator.wifi` does not exist in any
 *   shipping engine, and no permission prompt would create it.
 * - iOS exposes no channel state information to any app, at any privilege level.
 *   Not a limitation of this code — there is no API.
 * - Android exposes scan results and signal strength, which is a single number
 *   per access point. Presence sensing needs per-subcarrier phase and amplitude,
 *   which the driver does not surface.
 * - The published work runs on specific hardware: Intel 5300 or Atheros NICs
 *   with patched firmware, ESP32 boards in CSI mode, or an SDR.
 *
 * So the honest engineering answer is an adapter rather than a pretence. Attach
 * one of those devices, have it stream frames to this app over a WebSocket, and
 * the tracker will fuse its contacts with the camera's. With nothing attached
 * this module reports exactly that, and never fabricates a contact to fill the
 * panel — a fake blip on a security display is worse than an empty one, because
 * an empty one is believed correctly.
 *
 * The wire format is deliberately small, so an ESP32 sketch or a twenty-line
 * Python bridge can speak it:
 *
 * ```json
 * {"t": 1725580000000,
 *  "contacts": [{"id": "a", "rangeM": 3.4, "bearingDeg": -12, "confidence": 0.7,
 *                "motion": 0.4, "throughWall": true}],
 *  "sensor": {"kind": "csi", "label": "ESP32-CSI hallway"}}
 * ```
 *
 * One more thing belongs in this file rather than the documentation, because
 * this is where somebody will come looking for it: sensing people through the
 * walls of a building you do not control is, in most places, not a thing you may
 * lawfully do, and it does not stop being surveillance because the sensor is
 * cheap. The camera side of this app watches ground you can point a camera at.
 * This side can see into rooms. They are not the same act.
 *
 * @module sentry/rf
 */

/**
 * Why no through-wall data is present, in words an operator can act on.
 *
 * @returns {{state: 'absent', headline: string, detail: string,
 *   options: Array<{name: string, note: string}>}} Explanation and the hardware
 *   that would change the answer.
 */
export function capability() {
  return {
    state: 'absent',
    headline: 'No RF sensor attached — the camera cannot see through walls.',
    detail:
      'Browsers expose no radio interface, iOS exposes no channel state information to any app, ' +
      'and Android reports only per-network signal strength. Through-wall sensing needs a device ' +
      'that streams subcarrier data, connected below.',
    options: [
      { name: 'ESP32 in CSI mode', note: 'About £8. Streams per-subcarrier amplitude and phase over WiFi.' },
      { name: 'Intel 5300 / Atheros NIC', note: 'The rigs the published through-wall pose work used.' },
      { name: '60 GHz mmWave presence sensor', note: 'Sees motion and rough range through plasterboard; no imaging.' },
      { name: 'UWB anchor pair', note: 'Range and bearing to a tag, not to an untagged person.' },
    ],
  };
}

/**
 * A live link to an external RF sensor.
 *
 * Emits nothing until a device actually connects and sends a frame that parses.
 */
export class RfLink {
  /**
   * @param {object} [handlers] Callbacks.
   * @param {(state: string, detail: string) => void} [handlers.onState] State
   *   changes.
   * @param {(frame: object) => void} [handlers.onFrame] Parsed sensor frames.
   */
  constructor(handlers = {}) {
    this.onState = handlers.onState ?? (() => {});
    this.onFrame = handlers.onFrame ?? (() => {});
    this.socket = null;
    this.state = 'absent';
    this.sensor = null;
    this.lastFrameMs = 0;
  }

  /**
   * Open a link to a sensor bridge.
   *
   * @param {string} url A `ws://` or `wss://` endpoint.
   * @returns {void}
   */
  connect(url) {
    this.disconnect();
    let socket;
    try {
      socket = new WebSocket(url);
    } catch (error) {
      this.#setState('error', String(error?.message ?? error));
      return;
    }
    this.socket = socket;
    this.#setState('connecting', `opening ${url}`);
    socket.addEventListener('open', () => this.#setState('live', 'sensor connected, waiting for frames'));
    socket.addEventListener('close', () => this.#setState('absent', 'sensor disconnected'));
    socket.addEventListener('error', () => this.#setState('error', 'link failed'));
    socket.addEventListener('message', (event) => {
      const frame = parseFrame(event.data);
      if (!frame) return;
      this.lastFrameMs = Date.now();
      this.sensor = frame.sensor ?? this.sensor;
      this.onFrame(frame);
    });
  }

  /** Close the link, if any. */
  disconnect() {
    if (!this.socket) return;
    try {
      this.socket.close();
    } catch {
      /* already gone */
    }
    this.socket = null;
    this.#setState('absent', 'no sensor attached');
  }

  /**
   * @param {'absent'|'connecting'|'live'|'error'} state New state.
   * @param {string} detail Human-readable reason.
   * @returns {void}
   */
  #setState(state, detail) {
    this.state = state;
    this.onState(state, detail);
  }
}

/**
 * Parse and validate one sensor frame.
 *
 * Anything malformed is dropped rather than coerced. A sensor that sends
 * nonsense should show as a sensor sending nothing, because the alternative is
 * a contact at range NaN drawn confidently on the plan view.
 *
 * @param {string} raw JSON text from the bridge.
 * @returns {{t: number, contacts: object[], sensor: object|null}|null} Frame, or
 *   null when it cannot be trusted.
 */
export function parseFrame(raw) {
  let parsed;
  try {
    parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const contacts = Array.isArray(parsed.contacts) ? parsed.contacts : [];
  const clean = [];
  for (const contact of contacts) {
    // `Number(null)` is 0 and `Number('')` is 0, so a field the bridge could not
    // fill arrives looking like a contact standing on top of the sensor. JSON
    // has no NaN either, which is how a genuinely unknown range reaches here as
    // null in the first place. Insist on an actual number.
    const rangeM = numberOrNull(contact?.rangeM);
    const bearingDeg = numberOrNull(contact?.bearingDeg);
    if (rangeM === null || rangeM < 0 || rangeM > 60) continue;
    if (bearingDeg === null || Math.abs(bearingDeg) > 180) continue;
    clean.push({
      id: String(contact.id ?? clean.length),
      rangeM,
      bearingDeg,
      confidence: clampUnit(contact.confidence, 0.5),
      motion: clampUnit(contact.motion, 0),
      throughWall: Boolean(contact.throughWall),
    });
  }
  const t = Number.isFinite(Number(parsed.t)) ? Number(parsed.t) : Date.now();
  const sensor =
    parsed.sensor && typeof parsed.sensor === 'object'
      ? { kind: String(parsed.sensor.kind ?? 'unknown'), label: String(parsed.sensor.label ?? 'RF sensor') }
      : null;
  return { t, contacts: clean, sensor };
}

/**
 * A finite number, or null — never a zero conjured from a missing field.
 *
 * @param {unknown} value Candidate.
 * @returns {number|null} The number, or null when there was not one.
 */
function numberOrNull(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * Coerce a value into 0–1, falling back rather than producing NaN.
 *
 * @param {unknown} value Candidate.
 * @param {number} fallback Value to use when the candidate is unusable.
 * @returns {number} A number in 0–1.
 */
function clampUnit(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(1, Math.max(0, n));
}

/**
 * Place an RF contact on the same ground plane the camera tracks use.
 *
 * The sensor's bearing is measured from its own boresight, so the caller
 * supplies where the sensor sits and which way it faces. Without that the
 * contact has a range and nothing to hang it on, and is left off the plan.
 *
 * @param {{rangeM: number, bearingDeg: number}} contact Sensor contact.
 * @param {{x: number, y: number, headingDeg: number}} mount Sensor placement in
 *   ground coordinates.
 * @returns {{x: number, y: number}} Ground position, metres.
 */
export function contactToGround(contact, mount) {
  const angle = ((mount.headingDeg + contact.bearingDeg) * Math.PI) / 180;
  return {
    x: mount.x + contact.rangeM * Math.sin(angle),
    y: mount.y + contact.rangeM * Math.cos(angle),
  };
}
