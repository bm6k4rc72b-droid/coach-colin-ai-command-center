/**
 * Evidence: the seconds before the event, not just after it.
 *
 * A camera that starts recording when it detects something has already missed
 * the part worth having — the approach, the vehicle that dropped somebody off,
 * the direction they came from. So the recorder runs continuously into a ring
 * and the event marks a point in it; saving a clip means keeping the thirty
 * seconds either side of that mark.
 *
 * Every saved clip is hashed on write. That is not theatre: a clip offered to an
 * insurer or a deputy is worth what its provenance is worth, and a hash recorded
 * at the moment of capture is the cheapest way to show later that the file is
 * the one the camera produced. The hash covers the clip bytes; the console
 * stores it beside the clip with the capture time.
 *
 * Nothing here uploads. Clips live in this browser until exported deliberately.
 *
 * @module black-optic-6/vault
 */

/** Seconds kept before an event mark. */
export const PRE_ROLL_SEC = 30;

/** Seconds kept after an event mark. */
export const POST_ROLL_SEC = 30;

/** Milliseconds per recorder chunk. Smaller is finer-grained and more overhead. */
export const CHUNK_MS = 1000;

/**
 * How many chunks a ring must hold to cover a window.
 *
 * @param {number} seconds Window length.
 * @param {number} [chunkMs=CHUNK_MS] Chunk length.
 * @returns {number} Chunk count, at least one.
 */
export function ringCapacity(seconds, chunkMs = CHUNK_MS) {
  return Math.max(1, Math.ceil((seconds * 1000) / chunkMs));
}

/**
 * A hex digest of some bytes.
 *
 * @param {Blob} blob The clip.
 * @returns {Promise<string>} SHA-256 as lowercase hex, or an empty string where
 *   the platform offers no subtle crypto (insecure origins).
 */
export async function digest(blob) {
  if (!globalThis.crypto?.subtle) return '';
  const bytes = await blob.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * A continuously recording buffer that can be asked for the recent past.
 */
export class Vault {
  /**
   * @param {object} [options] Settings.
   * @param {number} [options.preRollSec=PRE_ROLL_SEC] Seconds kept before a mark.
   * @param {number} [options.postRollSec=POST_ROLL_SEC] Seconds kept after.
   */
  constructor(options = {}) {
    this.preRollSec = options.preRollSec ?? PRE_ROLL_SEC;
    this.postRollSec = options.postRollSec ?? POST_ROLL_SEC;
    this.chunks = [];
    this.recorder = null;
    this.mime = '';
    /** @type {Array<{id: string, atMs: number, reason: string, blob: Blob, hash: string, seconds: number}>} */
    this.clips = [];
  }

  /** @returns {boolean} Whether this browser can record at all. */
  static supported() {
    return typeof MediaRecorder !== 'undefined';
  }

  /**
   * Start recording a stream into the ring.
   *
   * @param {MediaStream} stream The camera stream.
   * @returns {void}
   */
  start(stream) {
    if (!Vault.supported() || this.recorder) return;
    this.mime = ['video/mp4;codecs=avc1.42E01E', 'video/webm;codecs=vp9', 'video/webm']
      .find((type) => MediaRecorder.isTypeSupported?.(type)) ?? '';
    this.recorder = new MediaRecorder(stream, this.mime ? { mimeType: this.mime } : undefined);
    this.recorder.ondataavailable = (event) => {
      if (!event.data?.size) return;
      this.chunks.push({ blob: event.data, atMs: Date.now() });
      const keep = ringCapacity(this.preRollSec + this.postRollSec) + 2;
      while (this.chunks.length > keep) this.chunks.shift();
    };
    this.recorder.start(CHUNK_MS);
  }

  /**
   * Stop recording and drop the ring.
   *
   * @returns {void}
   */
  stop() {
    if (this.recorder?.state && this.recorder.state !== 'inactive') this.recorder.stop();
    this.recorder = null;
    this.chunks = [];
  }

  /** @returns {number} Seconds currently held in the ring. */
  get bufferedSeconds() {
    return (this.chunks.length * CHUNK_MS) / 1000;
  }

  /**
   * Save the window around an event.
   *
   * Waits out the post-roll before assembling, so the clip genuinely contains
   * what happened next rather than stopping at the moment of detection.
   *
   * @param {string} reason Why this was kept.
   * @param {number} [atMs=Date.now()] The event mark.
   * @returns {Promise<object|null>} The stored clip, or null if nothing is buffered.
   */
  async keep(reason, atMs = Date.now()) {
    if (!this.chunks.length) return null;
    await new Promise((resolve) => setTimeout(resolve, this.postRollSec * 1000));

    const from = atMs - this.preRollSec * 1000;
    const to = atMs + this.postRollSec * 1000;
    const window = this.chunks.filter((chunk) => chunk.atMs >= from && chunk.atMs <= to);
    if (!window.length) return null;

    const blob = new Blob(window.map((chunk) => chunk.blob), { type: this.mime || 'video/webm' });
    const clip = {
      id: `clip-${atMs}`,
      atMs,
      reason,
      blob,
      hash: await digest(blob),
      seconds: (window.length * CHUNK_MS) / 1000,
      mime: this.mime || 'video/webm',
    };
    this.clips.unshift(clip);
    while (this.clips.length > 20) {
      this.clips.pop();
    }
    return clip;
  }

  /**
   * A clip's filename, carrying its time and the first of its hash.
   *
   * @param {object} clip A stored clip.
   * @returns {string} Filename.
   */
  static filename(clip) {
    const stamp = new Date(clip.atMs).toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const extension = clip.mime.includes('mp4') ? 'mp4' : 'webm';
    const short = clip.hash ? `-${clip.hash.slice(0, 12)}` : '';
    return `bo6-${stamp}${short}.${extension}`;
  }
}
