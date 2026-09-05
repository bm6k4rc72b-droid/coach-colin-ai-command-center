/**
 * Air scrolling: the plumbing.
 *
 * Opens the front camera, samples it into a small grayscale buffer, and hands
 * the frames to the pure tracker in `motion.js`. What comes back is a scroll
 * delta, which is applied to the window.
 *
 * The camera runs at a deliberately low resolution and a capped rate: the
 * gesture needs a hand's position, not a portrait, and 160×120 at 24 Hz is
 * both plenty and cheap enough to leave the renderer its frame budget.
 *
 * No frame is uploaded, recorded, or written anywhere. The preview exists so
 * the visitor can see exactly what the page can see.
 *
 * @module jose-montes/airscroll
 */

import { createTracker, downsample, motionField, trackGesture } from './motion.js';

const COLS = 24;
const ROWS = 18;

/**
 * Camera-driven scrolling.
 */
export class AirScroll {
  /**
   * @param {object} elements DOM handles.
   * @param {HTMLVideoElement} elements.video Preview element.
   * @param {HTMLCanvasElement} [elements.overlay] Optional pointer overlay.
   * @param {(state: object) => void} [onState] Called when the state changes.
   */
  constructor({ video, overlay }, onState = null) {
    this.video = video;
    this.overlay = overlay || null;
    this.onState = onState;
    this.stream = null;
    this.active = false;
    this.work = document.createElement('canvas');
    this.work.width = 160;
    this.work.height = 120;
    this.ctx = this.work.getContext('2d', { willReadFrequently: true });
    this.previous = null;
    this.current = new Float32Array(COLS * ROWS);
    this.tracker = createTracker();
    this.last = 0;
    this.frame = null;
    this.present = false;
  }

  /**
   * Whether the platform exposes a camera at all.
   *
   * @returns {boolean} Support flag.
   */
  static get supported() {
    return Boolean(navigator.mediaDevices?.getUserMedia);
  }

  /**
   * Open the camera and start tracking.
   *
   * @returns {Promise<{ ok: boolean, error?: string }>} Result, with a
   *   human-readable reason on failure.
   */
  async start() {
    if (this.active) return { ok: true };
    if (!AirScroll.supported) {
      return { ok: false, error: 'This browser exposes no camera API. On iOS use Safari — some in-app browsers block the camera entirely.' };
    }
    if (!window.isSecureContext) {
      return { ok: false, error: 'The camera needs a secure context. Open this page over HTTPS, or on localhost.' };
    }
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } },
        audio: false,
      });
    } catch (error) {
      const reason = error?.name === 'NotAllowedError'
        ? 'Camera permission was declined. You can still scroll normally, or allow the camera and try again.'
        : `The camera did not open (${error?.name || 'unknown error'}).`;
      return { ok: false, error: reason };
    }
    this.video.srcObject = this.stream;
    this.video.setAttribute('playsinline', '');
    this.video.muted = true;
    try { await this.video.play(); } catch { /* autoplay is best-effort */ }
    this.active = true;
    this.previous = null;
    this.tracker = createTracker();
    this.last = performance.now();
    this.frame = requestAnimationFrame(this.#tick);
    this.onState?.({ active: true, present: false });
    return { ok: true };
  }

  /**
   * Close the camera and release the hardware.
   */
  stop() {
    this.active = false;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = null;
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    this.video.srcObject = null;
    this.present = false;
    this.onState?.({ active: false, present: false });
  }

  /**
   * Toggle, reporting the eventual state.
   *
   * @returns {Promise<{ ok: boolean, error?: string, active: boolean }>} Result.
   */
  async toggle() {
    if (this.active) { this.stop(); return { ok: true, active: false }; }
    const result = await this.start();
    return { ...result, active: this.active };
  }

  /**
   * One sampling step: difference, track, scroll, draw the overlay.
   *
   * @param {number} now Frame timestamp.
   */
  #tick = (now) => {
    if (!this.active) return;
    this.frame = requestAnimationFrame(this.#tick);
    const dt = (now - this.last) / 1000;
    // 24 Hz is fast enough to feel immediate and slow enough to stay out of
    // the renderer's way.
    if (dt < 1 / 24) return;
    this.last = now;

    if (this.video.readyState < 2) return;
    const { width, height } = this.work;
    this.ctx.drawImage(this.video, 0, 0, width, height);
    let pixels;
    try {
      pixels = this.ctx.getImageData(0, 0, width, height).data;
    } catch {
      // A tainted canvas means we cannot read the camera; stop rather than
      // spin on an exception every frame.
      this.stop();
      return;
    }

    downsample(pixels, width, height, COLS, ROWS, this.current);
    if (!this.previous) {
      this.previous = Float32Array.from(this.current);
      return;
    }
    const field = motionField(this.previous, this.current, COLS, ROWS);
    const gesture = trackGesture(this.tracker, field, dt);
    this.previous.set(this.current);

    if (gesture.present !== this.present) {
      this.present = gesture.present;
      this.onState?.({ active: true, present: gesture.present });
    }
    if (gesture.delta) {
      window.scrollBy({ top: gesture.delta, behavior: 'auto' });
    }
    this.#drawOverlay(gesture, field);
  };

  /**
   * Draw the tracked point over the preview, mirrored to match the image.
   *
   * @param {{ present: boolean, x: number, y: number }} gesture Tracker output.
   * @param {{ energy: number }} field Motion field.
   */
  #drawOverlay(gesture, field) {
    if (!this.overlay) return;
    const canvas = this.overlay;
    const w = canvas.width;
    const h = canvas.height;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, w, h);
    if (!gesture.present) return;
    const x = (1 - gesture.x) * w;
    const y = gesture.y * h;
    const radius = 8 + Math.min(field.energy * 90, 16);
    ctx.strokeStyle = 'rgba(120, 224, 255, 0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(120, 224, 255, 0.35)';
    ctx.beginPath();
    ctx.moveTo(x - radius - 7, y);
    ctx.lineTo(x + radius + 7, y);
    ctx.stroke();
  }
}
