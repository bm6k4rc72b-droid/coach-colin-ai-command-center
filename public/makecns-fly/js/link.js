/**
 * The bridge to real hardware, and the interlocks that stand in front of it.
 *
 * The demonstration's whole point is that the output went to a physical machine,
 * so this app can do that too: frame the four throttles as RC channels and push
 * them over a serial link to a flight controller. The framing is MSP v1, which
 * Betaflight, INAV and their relatives all speak, and which is plain enough to
 * verify by hand.
 *
 * Everything else in this file exists because spinning propellers cut people.
 * Not hypothetically — a 65 mm three-blade propeller at full throttle opens
 * skin, and this app's entire thesis is that the control law driving it may be
 * far worse than it looks. An experiment whose failure mode is "the aircraft
 * tumbles" must not be run with propellers fitted and a hand in the frame, which
 * is the exact posture the gesture input requires.
 *
 * So the interlock refuses to emit anything above idle until, in order:
 *
 *   1. A transport is attached.
 *   2. The operator has declared the bench state — propellers removed, or a net.
 *      There is no third option and no default.
 *   3. A throttle ceiling has been set, and it is enforced on every frame rather
 *      than checked at arming.
 *   4. Arming has been confirmed as a distinct act, which expires.
 *
 * And it disarms itself if frames stop arriving, because the most likely failure
 * in a browser-driven control loop is not a bad command, it is a tab that stopped
 * being scheduled while the last good command keeps the motors running.
 *
 * @module makecns-fly/link
 */

/** Interlock constants. */
export const DEFAULT_LINK = Object.freeze({
  /** Milliseconds without a frame after which the link disarms itself. */
  failsafeMs: 250,
  /** Default throttle ceiling as a fraction of full scale. */
  throttleCeiling: 0.45,
  /** How long an arming confirmation stays valid, milliseconds. */
  armWindowMs: 20000,
  /** RC channel values, microseconds. */
  rcMin: 1000,
  rcMax: 2000,
});

/** Bench states the operator may declare. There is deliberately no safe default. */
export const BENCH_STATES = Object.freeze({
  'props-off': { id: 'props-off', label: 'Propellers removed', allowsFlight: false },
  'netted': { id: 'netted', label: 'Flown inside a net or cage', allowsFlight: true },
});

/**
 * Build an MSP v1 `MSP_SET_RAW_RC` frame.
 *
 * Layout: `$M<`, payload length, command byte, payload, XOR checksum over the
 * length, command and payload. Channel values are little-endian microseconds.
 *
 * @param {ArrayLike<number>} channelsUs Channel values in microseconds, 4 to 16 of them.
 * @returns {Uint8Array} The frame, ready to write.
 */
export function mspSetRawRc(channelsUs) {
  const count = channelsUs.length;
  if (count < 4 || count > 16) throw new Error('MSP_SET_RAW_RC takes between 4 and 16 channels');
  const payloadLength = count * 2;
  const frame = new Uint8Array(6 + payloadLength);
  frame[0] = 0x24; // $
  frame[1] = 0x4d; // M
  frame[2] = 0x3c; // <
  frame[3] = payloadLength;
  frame[4] = 200; // MSP_SET_RAW_RC
  for (let i = 0; i < count; i += 1) {
    const value = Math.max(0, Math.min(65535, Math.round(channelsUs[i])));
    frame[5 + i * 2] = value & 0xff;
    frame[6 + i * 2] = (value >> 8) & 0xff;
  }
  let checksum = 0;
  for (let i = 3; i < 5 + payloadLength; i += 1) checksum ^= frame[i];
  frame[5 + payloadLength] = checksum;
  return frame;
}

/**
 * Map a normalised throttle to an RC microsecond value.
 *
 * @param {number} value Throttle in [0, 1].
 * @param {object} [options] Overrides for `rcMin` and `rcMax`.
 * @returns {number} Microseconds.
 */
export function throttleToUs(value, options = {}) {
  const { rcMin, rcMax } = { ...DEFAULT_LINK, ...options };
  const clamped = Math.max(0, Math.min(1, Number(value) || 0));
  return Math.round(rcMin + clamped * (rcMax - rcMin));
}

/**
 * The interlock. Holds the arming state and is the only thing that produces frames.
 */
export class HardwareLink {
  /**
   * @param {object} [options] Overrides for {@link DEFAULT_LINK}.
   * @param {{write: (bytes: Uint8Array) => (void|Promise<void>)}} [options.transport]
   *   Anything with a `write`. In the browser this wraps a Web Serial writer; in
   *   tests it is a recorder, which is the point of keeping it injectable.
   */
  constructor(options = {}) {
    this.config = { ...DEFAULT_LINK, ...options };
    this.transport = options.transport ?? null;
    this.benchState = null;
    this.armedAt = null;
    this.armed = false;
    this.lastFrameMs = null;
    this.throttleCeiling = this.config.throttleCeiling;
    this.framesSent = 0;
    this.lastRefusal = null;
  }

  /**
   * Attach a transport.
   *
   * @param {{write: Function}} transport Serial writer.
   */
  attach(transport) {
    if (!transport || typeof transport.write !== 'function') throw new Error('transport needs a write method');
    this.transport = transport;
  }

  /** Drop the transport and disarm. */
  detach() {
    this.transport = null;
    this.disarm('transport detached');
  }

  /**
   * Declare the physical situation. Required; there is no assumed value.
   *
   * @param {string} id Key into {@link BENCH_STATES}.
   */
  declareBenchState(id) {
    if (!BENCH_STATES[id]) throw new Error(`unknown bench state: ${id}`);
    this.benchState = BENCH_STATES[id];
    this.disarm('bench state changed');
  }

  /**
   * Set the throttle ceiling enforced on every frame.
   *
   * @param {number} fraction Ceiling in (0, 1].
   */
  setThrottleCeiling(fraction) {
    const value = Number(fraction);
    if (!(value > 0 && value <= 1)) throw new Error('throttle ceiling must be in (0, 1]');
    this.throttleCeiling = value;
  }

  /**
   * Why this link may not arm right now, or `null` if it may.
   *
   * Returning the reason rather than a boolean means the UI can say what is
   * missing instead of leaving a disabled button unexplained.
   *
   * @returns {string|null} The blocking reason.
   */
  armingBlocker() {
    if (!this.transport) return 'no serial device is connected';
    if (!this.benchState) return 'the bench state has not been declared — say whether the propellers are off';
    if (!(this.throttleCeiling > 0 && this.throttleCeiling <= 1)) return 'no throttle ceiling is set';
    return null;
  }

  /**
   * Arm, for a bounded time.
   *
   * @param {number} nowMs Current time, milliseconds.
   * @returns {{armed: boolean, reason: string|null}} Result.
   */
  arm(nowMs = Date.now()) {
    const blocker = this.armingBlocker();
    if (blocker) {
      this.lastRefusal = blocker;
      return { armed: false, reason: blocker };
    }
    this.armed = true;
    this.armedAt = nowMs;
    this.lastFrameMs = nowMs;
    this.lastRefusal = null;
    return { armed: true, reason: null };
  }

  /**
   * Disarm and record why.
   *
   * @param {string} [reason] What caused it.
   */
  disarm(reason = 'operator disarmed') {
    this.armed = false;
    this.armedAt = null;
    this.lastRefusal = reason;
  }

  /**
   * Send one frame of throttles, if everything still permits it.
   *
   * Every refusal path below returns rather than throwing, because a control loop
   * that throws on a safety refusal is a control loop that stops updating, and a
   * link that stops updating is the failure the failsafe exists to catch.
   *
   * @param {ArrayLike<number>} throttles Four normalised throttles.
   * @param {number} [nowMs] Current time.
   * @returns {{sent: boolean, reason: string|null, frame: Uint8Array|null, capped: boolean}} Outcome.
   */
  send(throttles, nowMs = Date.now()) {
    if (!this.armed) return { sent: false, reason: this.lastRefusal ?? 'not armed', frame: null, capped: false };
    if (this.armedAt !== null && nowMs - this.armedAt > this.config.armWindowMs) {
      this.disarm('arming window expired — re-arm to continue');
      return { sent: false, reason: this.lastRefusal, frame: null, capped: false };
    }
    if (this.lastFrameMs !== null && nowMs - this.lastFrameMs > this.config.failsafeMs) {
      this.disarm(`failsafe: ${Math.round(nowMs - this.lastFrameMs)} ms without a frame`);
      return { sent: false, reason: this.lastRefusal, frame: null, capped: false };
    }

    let capped = false;
    const channels = [];
    for (let i = 0; i < 4; i += 1) {
      const raw = Math.max(0, Math.min(1, Number(throttles[i]) || 0));
      const limited = Math.min(raw, this.throttleCeiling);
      if (limited < raw) capped = true;
      channels.push(throttleToUs(limited, this.config));
    }
    // Channels 5–8 are left at centre; this app commands motors, not modes.
    while (channels.length < 8) channels.push(1500);

    const frame = mspSetRawRc(channels);
    this.lastFrameMs = nowMs;
    this.framesSent += 1;
    if (this.transport) this.transport.write(frame);
    return { sent: true, reason: null, frame, capped };
  }

  /**
   * Check the failsafe without sending — call this on a timer.
   *
   * @param {number} nowMs Current time.
   * @returns {boolean} Whether the link is still armed.
   */
  tick(nowMs = Date.now()) {
    if (this.armed && this.lastFrameMs !== null && nowMs - this.lastFrameMs > this.config.failsafeMs) {
      this.disarm(`failsafe: ${Math.round(nowMs - this.lastFrameMs)} ms without a frame`);
    }
    return this.armed;
  }

  /** @returns {object} State for the UI, including why it is refusing. */
  status() {
    return {
      connected: Boolean(this.transport),
      benchState: this.benchState?.id ?? null,
      benchLabel: this.benchState?.label ?? 'not declared',
      armed: this.armed,
      throttleCeiling: this.throttleCeiling,
      framesSent: this.framesSent,
      blocker: this.armingBlocker(),
      lastRefusal: this.lastRefusal,
    };
  }
}
