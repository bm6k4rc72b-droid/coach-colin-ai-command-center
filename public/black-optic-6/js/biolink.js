/**
 * Heart rate from a wearable, by the one route that actually reaches a browser.
 *
 * The request was smartwatch integration, and the honest shape of it is narrow
 * but real. No watch streams live heart rate to a web page: Apple Watch data
 * goes to HealthKit and needs a companion app to get out, and the same is true
 * of Wear OS and Garmin's own ecosystem.
 *
 * What does work is Bluetooth. The Heart Rate Service is a standard BLE profile
 * — service `0x180D`, characteristic `0x2A37` — and a browser with Web Bluetooth
 * can subscribe to it directly. Chest straps implement it universally. Several
 * watches implement it too, but only in a broadcast mode you have to switch on:
 * Garmin calls it "Broadcast Heart Rate", Polar and Wahoo expose it during a
 * workout, and an Apple Watch does not expose it at all.
 *
 * The limitation worth stating before anybody buys anything: Web Bluetooth does
 * not exist in Safari, on any Apple device. This link works in Chrome and Edge
 * on desktop and on Android, and nowhere on an iPhone.
 *
 * What arrives is a pulse rate and, on better sensors, the beat-to-beat
 * intervals behind it. A rate is a fact about a heart. It is not a fact about
 * what somebody is feeling, and this module deliberately computes no such thing.
 *
 * @module black-optic-6/biolink
 */

/** Standard BLE heart rate service. */
export const HEART_RATE_SERVICE = 0x180d;

/** Heart rate measurement characteristic. */
export const HEART_RATE_MEASUREMENT = 0x2a37;

/** Battery service, so the console can warn before a strap dies mid-watch. */
export const BATTERY_SERVICE = 0x180f;

/** Battery level characteristic. */
export const BATTERY_LEVEL = 0x2a19;

/**
 * Decode a heart rate measurement packet.
 *
 * The layout is in the Bluetooth specification: a flags byte, then the rate as
 * either one or two bytes depending on bit zero, then optional energy and
 * optional RR intervals in units of 1/1024 second.
 *
 * @param {DataView} view The characteristic value.
 * @returns {{bpm: number, contact: boolean|null, rrMs: number[], energyKJ: number|null}}
 *   The decoded reading.
 */
export function decodeHeartRate(view) {
  const flags = view.getUint8(0);
  const wide = (flags & 0x01) !== 0;
  const contactSupported = (flags & 0x04) !== 0;
  const contact = contactSupported ? (flags & 0x02) !== 0 : null;
  const hasEnergy = (flags & 0x08) !== 0;
  const hasIntervals = (flags & 0x10) !== 0;

  let offset = 1;
  const bpm = wide ? view.getUint16(offset, true) : view.getUint8(offset);
  offset += wide ? 2 : 1;

  let energyKJ = null;
  if (hasEnergy) {
    energyKJ = view.getUint16(offset, true);
    offset += 2;
  }

  const rrMs = [];
  if (hasIntervals) {
    while (offset + 1 < view.byteLength) {
      rrMs.push(Math.round((view.getUint16(offset, true) / 1024) * 1000));
      offset += 2;
    }
  }

  return { bpm, contact, rrMs, energyKJ };
}

/**
 * Beat-to-beat variability, where the sensor reports intervals.
 *
 * RMSSD is the standard short-window measure. It is reported because it is a
 * real quantity a strap can support — and it is reported as a number of
 * milliseconds, not as stress, readiness or strain, all of which are vendor
 * scores built on assumptions this console has no way to check.
 *
 * @param {number[]} intervals Beat-to-beat intervals in milliseconds.
 * @returns {{rmssdMs: number|null, beats: number}} The measure.
 */
export function variability(intervals) {
  const clean = intervals.filter((value) => value > 300 && value < 2000);
  if (clean.length < 3) return { rmssdMs: null, beats: clean.length };
  let sum = 0;
  for (let i = 1; i < clean.length; i += 1) sum += (clean[i] - clean[i - 1]) ** 2;
  return { rmssdMs: Math.sqrt(sum / (clean.length - 1)), beats: clean.length };
}

/**
 * Whether this browser can talk to a strap at all.
 *
 * @returns {{available: boolean, headline: string, detail: string,
 *   works: string[], doesNot: string[]}} What is possible here.
 */
export function capability() {
  const available = typeof navigator !== 'undefined' && Boolean(navigator.bluetooth);
  return {
    available,
    headline: available
      ? 'Bluetooth is available — a standard heart rate sensor will pair.'
      : 'This browser has no Web Bluetooth, so no wearable can connect here.',
    detail: available
      ? 'Pairing opens the browser\'s own device chooser. Nothing is scanned or stored until you pick a device.'
      : 'Web Bluetooth does not exist in Safari on any Apple device. Chrome or Edge on a laptop, or Chrome on Android, will pair with the same strap.',
    works: [
      'Chest straps — Polar H10, Wahoo Tickr, Garmin HRM. Universal support, and the most accurate option by a distance.',
      'Garmin watches with Broadcast Heart Rate switched on.',
      'Polar and Wahoo watches while a workout is running.',
      'Armband optical sensors that advertise the standard service.',
    ],
    doesNot: [
      'Apple Watch — it never exposes the heart rate service to another device.',
      'Any watch on an iPhone, because Safari has no Web Bluetooth.',
      'Sleep, readiness, stress and strain scores. Those are computed in a vendor cloud from data that never reaches here.',
    ],
  };
}

/**
 * A live link to a Bluetooth heart rate sensor.
 */
export class HeartLink {
  /**
   * @param {object} [handlers] Callbacks.
   * @param {(reading: object) => void} [handlers.onReading] Each measurement.
   * @param {(state: string, detail: string) => void} [handlers.onState] State changes.
   */
  constructor(handlers = {}) {
    this.onReading = handlers.onReading ?? (() => {});
    this.onState = handlers.onState ?? (() => {});
    this.device = null;
    this.characteristic = null;
    this.intervals = [];
    this.state = 'absent';
  }

  /**
   * Pair with a sensor and start receiving.
   *
   * @returns {Promise<void>} Resolves once notifications are flowing.
   */
  async connect() {
    if (!navigator.bluetooth) {
      this.#setState('blocked', capability().detail);
      return;
    }
    try {
      this.#setState('pairing', 'Waiting for a device to be chosen.');
      this.device = await navigator.bluetooth.requestDevice({
        filters: [{ services: [HEART_RATE_SERVICE] }],
        optionalServices: [BATTERY_SERVICE],
      });
      this.device.addEventListener('gattserverdisconnected', () => {
        this.#setState('absent', 'The sensor disconnected.');
      });

      const server = await this.device.gatt.connect();
      const service = await server.getPrimaryService(HEART_RATE_SERVICE);
      this.characteristic = await service.getCharacteristic(HEART_RATE_MEASUREMENT);
      await this.characteristic.startNotifications();
      this.characteristic.addEventListener('characteristicvaluechanged', (event) => {
        const reading = decodeHeartRate(event.target.value);
        this.intervals = [...this.intervals, ...reading.rrMs].slice(-60);
        this.onReading({
          ...reading,
          ...variability(this.intervals),
          device: this.device?.name ?? 'sensor',
          atMs: Date.now(),
        });
      });

      this.#setState('live', `${this.device.name ?? 'Sensor'} connected.`);
    } catch (error) {
      this.#setState('absent', error?.message ?? 'Pairing was cancelled.');
    }
  }

  /**
   * Drop the link.
   *
   * @returns {void}
   */
  disconnect() {
    try {
      this.characteristic?.stopNotifications?.();
      this.device?.gatt?.disconnect?.();
    } catch {
      // A sensor that has already walked out of range throws here; the state is
      // the same either way.
    }
    this.device = null;
    this.characteristic = null;
    this.intervals = [];
    this.#setState('absent', 'Disconnected.');
  }

  /**
   * Record and publish a state change.
   *
   * @param {string} state New state.
   * @param {string} detail Why.
   * @returns {void}
   */
  #setState(state, detail) {
    this.state = state;
    this.onState(state, detail);
  }
}
