/**
 * Device camera.
 *
 * iPhone and Android both, front and back, with the platform quirks handled:
 * `playsinline` so iOS does not hijack the video into fullscreen, a facing
 * mode that survives a switch, torch control where the hardware exposes it,
 * and a permission story that explains itself rather than failing silently.
 *
 * Three things run on top of the feed: a frame-difference presence detector
 * (so the receptionist can greet somebody who walks up), still capture, and
 * QR/barcode scanning through `BarcodeDetector` where the platform has it.
 *
 * No frame ever leaves the device.
 *
 * @module nexus/camera
 */

/**
 * Camera controller bound to one `<video>` element.
 */
export class Lens {
  /**
   * @param {HTMLVideoElement} video Preview element.
   */
  constructor(video) {
    this.video = video;
    this.stream = null;
    this.facing = 'user';
    this.torchOn = false;
    this.work = document.createElement('canvas');
    this.ctx = this.work.getContext('2d', { willReadFrequently: true });
    this.previousFrame = null;
    this.detector = null;
    this.presence = 0;
  }

  /**
   * Whether the platform exposes any camera at all.
   *
   * @returns {boolean} Support flag.
   */
  static get supported() {
    return Boolean(navigator.mediaDevices?.getUserMedia);
  }

  /**
   * Start (or restart) the camera.
   *
   * @param {'user'|'environment'} [facing] Which camera to open.
   * @returns {Promise<{ ok: boolean, error?: string, label?: string }>} Result,
   *   with a human-readable reason on failure.
   */
  async start(facing = this.facing) {
    if (!Lens.supported) {
      return { ok: false, error: 'This browser exposes no camera API. On iOS, use Safari; some in-app browsers block camera access entirely.' };
    }
    if (!window.isSecureContext) {
      return { ok: false, error: 'The camera needs a secure context. Open this page over HTTPS, or on localhost.' };
    }
    this.stop();
    this.facing = facing;
    const constraints = {
      audio: false,
      video: {
        facingMode: { ideal: facing },
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
    };
    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    } catch (err) {
      // Some devices reject an exact facing mode; retry with anything.
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      } catch (err2) {
        return { ok: false, error: this.#explain(err2 || err) };
      }
    }
    this.video.srcObject = this.stream;
    this.video.setAttribute('playsinline', '');
    this.video.muted = true;
    try {
      await this.video.play();
    } catch {
      // Autoplay refused: the shell shows a tap-to-start affordance.
    }
    const track = this.stream.getVideoTracks()[0];
    return { ok: true, label: track?.label || 'camera' };
  }

  /**
   * Turn a `getUserMedia` rejection into something a person can act on.
   *
   * @param {Error} err The rejection.
   * @returns {string} Explanation.
   */
  #explain(err) {
    switch (err?.name) {
      case 'NotAllowedError':
        return 'Camera permission was denied. On iOS: Settings → Safari → Camera, or the "aA" menu in the address bar. On Android: the padlock icon → Permissions.';
      case 'NotFoundError':
        return 'No camera was found on this device.';
      case 'NotReadableError':
        return 'The camera is in use by another app. Close it and try again.';
      case 'OverconstrainedError':
        return 'This device has no camera matching that request.';
      default:
        return `The camera could not be opened (${err?.name || 'unknown error'}).`;
    }
  }

  /** Stop the camera and release the hardware. */
  stop() {
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
    this.video.srcObject = null;
    this.previousFrame = null;
    this.torchOn = false;
  }

  /**
   * Whether the camera is currently running.
   *
   * @returns {boolean} Active flag.
   */
  get active() {
    return Boolean(this.stream);
  }

  /**
   * Flip between the selfie and rear cameras.
   *
   * @returns {Promise<object>} The `start` result for the new camera.
   */
  async flip() {
    return this.start(this.facing === 'user' ? 'environment' : 'user');
  }

  /**
   * Whether the active track can drive the torch.
   *
   * @returns {boolean} Torch support.
   */
  get hasTorch() {
    const track = this.stream?.getVideoTracks?.()[0];
    return Boolean(track?.getCapabilities?.().torch);
  }

  /**
   * Toggle the torch on devices that support it.
   *
   * @returns {Promise<boolean>} The new torch state.
   */
  async toggleTorch() {
    const track = this.stream?.getVideoTracks?.()[0];
    if (!track?.getCapabilities?.().torch) return false;
    this.torchOn = !this.torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: this.torchOn }] });
    } catch {
      this.torchOn = false;
    }
    return this.torchOn;
  }

  /**
   * Grab the current frame at full sensor resolution.
   *
   * @returns {HTMLCanvasElement|null} Canvas holding the frame.
   */
  grab() {
    const { videoWidth: w, videoHeight: h } = this.video;
    if (!w || !h) return null;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (this.facing === 'user') {
      // Mirror the selfie camera so a capture matches what was on screen.
      ctx.translate(w, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(this.video, 0, 0, w, h);
    return canvas;
  }

  /**
   * Capture a still as a data URL.
   *
   * @param {number} [quality] JPEG quality.
   * @returns {string|null} Data URL.
   */
  capture(quality = 0.92) {
    const canvas = this.grab();
    return canvas ? canvas.toDataURL('image/jpeg', quality) : null;
  }

  /**
   * Measure how much the scene changed since the last call.
   *
   * A cheap luminance frame-difference on a downsampled copy. It is enough to
   * notice that somebody walked up to the console — which is all the
   * receptionist needs — and it never leaves the device.
   *
   * @returns {number} Motion energy in [0, 1].
   */
  motionEnergy() {
    const { videoWidth: w, videoHeight: h } = this.video;
    if (!w || !h) return 0;
    const cw = 64;
    const ch = Math.max(1, Math.round((h / w) * cw));
    this.work.width = cw;
    this.work.height = ch;
    this.ctx.drawImage(this.video, 0, 0, cw, ch);
    const frame = this.ctx.getImageData(0, 0, cw, ch).data;
    const luma = new Float32Array(cw * ch);
    for (let i = 0; i < luma.length; i += 1) {
      const p = i * 4;
      luma[i] = (frame[p] * 0.299 + frame[p + 1] * 0.587 + frame[p + 2] * 0.114) / 255;
    }
    let energy = 0;
    if (this.previousFrame) {
      for (let i = 0; i < luma.length; i += 1) {
        const d = Math.abs(luma[i] - this.previousFrame[i]);
        if (d > 0.06) energy += d;
      }
      energy /= luma.length;
    }
    this.previousFrame = luma;
    // Smooth so a single noisy frame does not trigger a greeting.
    this.presence = this.presence * 0.7 + Math.min(1, energy * 12) * 0.3;
    return this.presence;
  }

  /**
   * Whether this platform can decode barcodes natively.
   *
   * @returns {boolean} Support flag.
   */
  static get canScanCodes() {
    return typeof window.BarcodeDetector !== 'undefined';
  }

  /**
   * Scan the current frame for QR codes and barcodes.
   *
   * @returns {Promise<Array<{ raw: string, format: string }>>} Detections.
   */
  async scanCodes() {
    if (!Lens.canScanCodes) return [];
    if (!this.detector) {
      const formats = await window.BarcodeDetector.getSupportedFormats().catch(() => []);
      this.detector = new window.BarcodeDetector({
        formats: formats.length ? formats : ['qr_code'],
      });
    }
    try {
      const found = await this.detector.detect(this.video);
      return found.map((code) => ({ raw: code.rawValue, format: code.format }));
    } catch {
      return [];
    }
  }

  /**
   * Average colour and brightness of the frame, used to tint the hologram to
   * the room the visitor is standing in.
   *
   * @returns {{ r: number, g: number, b: number, luma: number }} Scene light.
   */
  ambientLight() {
    if (!this.previousFrame) this.motionEnergy();
    const { width: cw, height: ch } = this.work;
    if (!cw || !ch) return { r: 0, g: 0, b: 0, luma: 0 };
    const data = this.ctx.getImageData(0, 0, cw, ch).data;
    let r = 0;
    let g = 0;
    let b = 0;
    const n = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    r /= n; g /= n; b /= n;
    return { r, g, b, luma: (r * 0.299 + g * 0.587 + b * 0.114) / 255 };
  }
}
