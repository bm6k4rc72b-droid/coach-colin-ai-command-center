/**
 * Listening to the property.
 *
 * One microphone answers two questions well — *how loud* and *exactly when* —
 * and a third badly. It cannot tell you where. Bearing needs several
 * microphones at known positions sharing a clock, which is what the commercial
 * gunshot-location systems are, and pretending otherwise on a console would put
 * an arrow on screen pointing at nothing.
 *
 * So this module measures level, picks out impulses, and describes their shape.
 * A sharp broadband impulse at high level is *an impulse at high level* — the
 * console writes that down with its time and its numbers and leaves the naming
 * to the person reading it. A gate slamming, a backfire, a rifle and a dropped
 * tailgate are the same object to one microphone, and a label saying "GUNSHOT
 * DETECTED" would be a guess dressed as a measurement.
 *
 * Everything here operates on plain arrays so it can be tested without an audio
 * device.
 *
 * @module black-optic-6/acoustic
 */

/** Frames per second of level analysis. Short enough to catch an impulse's attack. */
export const FRAME_HZ = 100;

/** Frames of history the background level is taken from — about two seconds. */
export const BACKGROUND_FRAMES = 200;

/** How far above background an impulse must rise, in decibels. */
export const IMPULSE_RISE_DB = 12;

/** Below this level, nothing is an event however sharp it looks. */
export const IMPULSE_FLOOR_DB = -34;

/** Seconds after an impulse before another may be reported. */
export const REFRACTORY_SEC = 0.35;

/**
 * Root-mean-square level of a frame, in decibels relative to full scale.
 *
 * @param {ArrayLike<number>} samples Samples in −1..1.
 * @returns {number} Level in dBFS; −120 for silence.
 */
export function rmsDb(samples) {
  if (!samples?.length) return -120;
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
  const rms = Math.sqrt(sum / samples.length);
  return rms > 1e-6 ? Math.max(-120, 20 * Math.log10(rms)) : -120;
}

/**
 * The quiet level a frame should be judged against.
 *
 * A median rather than a mean, because the background of a ranch at night is
 * mostly quiet with occasional loud things in it, and a mean is dragged upward
 * by exactly the events being looked for — which raises the threshold and hides
 * the next one.
 *
 * @param {ArrayLike<number>} history Recent frame levels in dB.
 * @returns {number} Background level in dB.
 */
export function backgroundDb(history) {
  if (!history?.length) return -120;
  const sorted = [...history].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/**
 * Spectral flatness, 0..1 — how noise-like a spectrum is.
 *
 * Near 1 means energy spread across the band, which is what a sharp mechanical
 * impulse looks like. Near 0 means a tone: an engine, a pump, a dog.
 *
 * @param {ArrayLike<number>} magnitudes Linear magnitudes per bin.
 * @returns {number} Flatness in 0..1.
 */
export function spectralFlatness(magnitudes) {
  if (!magnitudes?.length) return 0;
  let logSum = 0;
  let sum = 0;
  let counted = 0;
  for (let i = 0; i < magnitudes.length; i += 1) {
    const m = Math.max(1e-9, magnitudes[i]);
    logSum += Math.log(m);
    sum += m;
    counted += 1;
  }
  if (!counted || sum <= 0) return 0;
  const geometric = Math.exp(logSum / counted);
  const arithmetic = sum / counted;
  return Math.max(0, Math.min(1, geometric / arithmetic));
}

/**
 * Energy per named band, as a fraction of the total.
 *
 * @param {ArrayLike<number>} magnitudes Linear magnitudes per bin.
 * @param {number} sampleRate Sample rate in hertz.
 * @param {Array<{name: string, lowHz: number, highHz: number}>} bands Bands to sum.
 * @returns {Record<string, number>} Fraction of total energy per band.
 */
export function bandEnergy(magnitudes, sampleRate, bands) {
  const binHz = sampleRate / (magnitudes.length * 2);
  const out = {};
  let total = 0;
  for (const value of magnitudes) total += value * value;
  for (const band of bands) {
    let sum = 0;
    const from = Math.max(0, Math.floor(band.lowHz / binHz));
    const to = Math.min(magnitudes.length - 1, Math.ceil(band.highHz / binHz));
    for (let i = from; i <= to; i += 1) sum += magnitudes[i] * magnitudes[i];
    out[band.name] = total > 0 ? sum / total : 0;
  }
  return out;
}

/** The bands the console reports, chosen for what they separate on a ranch. */
export const BANDS = Object.freeze([
  { name: 'low', lowHz: 20, highHz: 250, note: 'engines, thunder, doors' },
  { name: 'mid', lowHz: 250, highHz: 2000, note: 'voices, animals' },
  { name: 'high', lowHz: 2000, highHz: 12000, note: 'glass, metal, impulses' },
]);

/**
 * Find impulses in a run of frame levels.
 *
 * An impulse is a rise above the background that is both large and fast. The
 * rise time is measured rather than assumed — it is the thing that separates a
 * slam from a truck arriving, and it is reported so the reader can judge.
 *
 * @param {number[]} levels Frame levels in dB, oldest first.
 * @param {object} [options] Detection settings.
 * @param {number} [options.hz=FRAME_HZ] Frame rate.
 * @param {number} [options.riseDb=IMPULSE_RISE_DB] Required rise above background.
 * @param {number} [options.floorDb=IMPULSE_FLOOR_DB] Absolute level floor.
 * @returns {Array<{frame: number, atSec: number, peakDb: number, backgroundDb: number,
 *   riseDb: number, riseMs: number}>} Impulses in order.
 */
export function findImpulses(levels, options = {}) {
  const hz = options.hz ?? FRAME_HZ;
  const riseDb = options.riseDb ?? IMPULSE_RISE_DB;
  const floorDb = options.floorDb ?? IMPULSE_FLOOR_DB;
  const refractory = Math.round((options.refractorySec ?? REFRACTORY_SEC) * hz);

  const found = [];
  let blockedUntil = -1;

  for (let i = 1; i < levels.length; i += 1) {
    if (i <= blockedUntil) continue;
    const history = levels.slice(Math.max(0, i - BACKGROUND_FRAMES), i);
    if (history.length < 4) continue;
    const floor = backgroundDb(history);
    const rise = levels[i] - floor;
    if (rise < riseDb || levels[i] < floorDb) continue;

    // Only report the peak of the event, not its leading edge.
    let peak = i;
    while (peak + 1 < levels.length && levels[peak + 1] > levels[peak]) peak += 1;

    // Walk back to where it left the background to measure the attack.
    let onset = i;
    while (onset > 0 && levels[onset - 1] > floor + 6) onset -= 1;

    found.push({
      frame: peak,
      atSec: peak / hz,
      peakDb: levels[peak],
      backgroundDb: floor,
      riseDb: levels[peak] - floor,
      riseMs: ((peak - onset) / hz) * 1000,
    });
    blockedUntil = peak + refractory;
  }
  return found;
}

/**
 * What can honestly be said about an impulse's shape.
 *
 * Deliberately not a list of sources. The console reports a shape and a level;
 * naming the thing that made the sound is the operator's call, with everything
 * else they know and this console does not.
 *
 * @param {{riseMs: number, peakDb: number}} impulse An impulse.
 * @param {number} flatness Spectral flatness at the peak, 0..1.
 * @returns {{shape: string, note: string}} A description.
 */
export function describeImpulse(impulse, flatness) {
  const sharp = impulse.riseMs <= 30;
  const broad = flatness >= 0.35;
  if (sharp && broad) {
    return {
      shape: 'sharp · broadband',
      note: 'Fast attack across the whole band. Consistent with a hard mechanical impact or a shot — one microphone cannot separate those.',
    };
  }
  if (sharp) {
    return { shape: 'sharp · tonal', note: 'Fast attack concentrated in a narrow band. Metal on metal, a latch, a gate.' };
  }
  if (broad) {
    return { shape: 'swelling · broadband', note: 'Rose over more than a tenth of a second. Something arriving rather than something striking.' };
  }
  return { shape: 'swelling · tonal', note: 'Slow tonal rise. An engine, a pump, or wind across the microphone.' };
}

/**
 * A live microphone watch.
 *
 * Holds the audio graph, keeps the rolling level history, and reports impulses
 * as they happen. No audio is recorded or sent anywhere by this class.
 */
export class AcousticWatch {
  /**
   * @param {object} [handlers] Callbacks.
   * @param {(frame: object) => void} [handlers.onFrame] Per-frame level report.
   * @param {(event: object) => void} [handlers.onImpulse] Impulse reports.
   */
  constructor(handlers = {}) {
    this.onFrame = handlers.onFrame ?? (() => {});
    this.onImpulse = handlers.onImpulse ?? (() => {});
    this.context = null;
    this.stream = null;
    this.analyser = null;
    this.levels = [];
    this.running = false;
    this.lastImpulseMs = 0;
  }

  /**
   * Open the microphone and start listening.
   *
   * @returns {Promise<void>} Resolves once frames are flowing.
   */
  async start() {
    if (this.running) return;
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    this.context = new (window.AudioContext ?? window.webkitAudioContext)();
    const source = this.context.createMediaStreamSource(this.stream);
    this.analyser = this.context.createAnalyser();
    this.analyser.fftSize = 2048;
    this.analyser.smoothingTimeConstant = 0;
    source.connect(this.analyser);
    this.running = true;
    this.#loop();
  }

  /**
   * Close the microphone.
   *
   * @returns {void}
   */
  stop() {
    this.running = false;
    for (const track of this.stream?.getTracks() ?? []) track.stop();
    this.context?.close?.();
    this.context = null;
    this.stream = null;
    this.analyser = null;
    this.levels = [];
  }

  /**
   * The analysis loop.
   *
   * @returns {void}
   */
  #loop() {
    if (!this.running || !this.analyser) return;
    const time = new Float32Array(this.analyser.fftSize);
    const freq = new Float32Array(this.analyser.frequencyBinCount);
    this.analyser.getFloatTimeDomainData(time);
    this.analyser.getFloatFrequencyData(freq);

    const magnitudes = new Float32Array(freq.length);
    for (let i = 0; i < freq.length; i += 1) magnitudes[i] = 10 ** (freq[i] / 20);

    const db = rmsDb(time);
    this.levels.push(db);
    if (this.levels.length > BACKGROUND_FRAMES * 2) this.levels.shift();

    const floor = backgroundDb(this.levels.slice(0, -1));
    const flatness = spectralFlatness(magnitudes);
    const bands = bandEnergy(magnitudes, this.context.sampleRate, BANDS);

    this.onFrame({ db, floor, flatness, bands, atMs: Date.now() });

    const now = Date.now();
    if (
      db - floor >= IMPULSE_RISE_DB
      && db >= IMPULSE_FLOOR_DB
      && now - this.lastImpulseMs > REFRACTORY_SEC * 1000
      && this.levels.length > 20
    ) {
      this.lastImpulseMs = now;
      const impulse = { riseMs: 1000 / FRAME_HZ, peakDb: db, backgroundDb: floor, riseDb: db - floor };
      this.onImpulse({ ...impulse, flatness, bands, ...describeImpulse(impulse, flatness), atMs: now });
    }

    setTimeout(() => this.#loop(), 1000 / FRAME_HZ);
  }
}
