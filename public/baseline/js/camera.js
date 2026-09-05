/**
 * Camera plumbing for iPhone, Android and laptops.
 *
 * All three reach the sensor through `getUserMedia` and then disagree about
 * everything else. iOS needs `playsinline` and a real user gesture, and refuses
 * to decode a video element that is not in the document. Android exposes torch
 * and zoom that iOS does not implement. Laptop webcams have no `facingMode` at
 * all and will happily hand back a 1280×720 stream at whatever frame rate the
 * room's lighting lets them manage.
 *
 * The last of those matters more here than in most camera apps: this one is
 * measuring a frequency, so it needs to know *when* each frame was captured,
 * not merely what it contained. Where `requestVideoFrameCallback` exists, the
 * timestamps come from the media clock rather than the animation clock — a
 * dropped frame then shows up as a gap in the record instead of silently
 * stretching the heartbeat.
 *
 * @module baseline/camera
 */

/** Live camera feed with frame capture and precise per-frame timing. */
export class CameraFeed {
  /**
   * @param {HTMLVideoElement} video Video element to bind the stream to; it must
   *   already be in the document.
   */
  constructor(video) {
    this.video = video;
    this.stream = null;
    this.track = null;
    this.canvas = null;
    this.ctx = null;
    this.facingMode = 'user';
    this.frameCallbackId = null;
  }

  /** @returns {boolean} Whether this browser can open a camera at all. */
  static supported() {
    return Boolean(globalThis.navigator?.mediaDevices?.getUserMedia);
  }

  /** @returns {boolean} Whether frames carry media-clock timestamps. */
  static hasFrameClock() {
    return typeof HTMLVideoElement !== 'undefined'
      && typeof HTMLVideoElement.prototype.requestVideoFrameCallback === 'function';
  }

  /**
   * Open the camera.
   *
   * @param {object} [options] Stream options.
   * @param {string} [options.facingMode='user'] Preferred camera.
   * @param {string} [options.deviceId] Exact device, when the user picked one.
   * @returns {Promise<MediaStream>} The live stream.
   */
  async start(options = {}) {
    if (!CameraFeed.supported()) {
      throw new Error('This browser has no camera API. Open the app over HTTPS, or on localhost.');
    }
    this.stop();
    this.facingMode = options.facingMode || this.facingMode;

    const video = options.deviceId
      ? { deviceId: { exact: options.deviceId } }
      : { facingMode: { ideal: this.facingMode } };
    // 640×480 is deliberate. The measurement averages a region down to three
    // numbers, so extra pixels buy nothing, while a smaller frame holds the
    // capture rate up on a mid-range phone — and rate is what the maths needs.
    Object.assign(video, {
      width: { ideal: 640 },
      height: { ideal: 480 },
      frameRate: { ideal: 30, min: 15 },
    });

    this.stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    this.track = this.stream.getVideoTracks()[0] || null;
    this.video.srcObject = this.stream;
    this.video.setAttribute('playsinline', '');
    this.video.muted = true;
    await this.video.play();
    await this.ready();
    return this.stream;
  }

  /**
   * Resolve once the stream reports real dimensions.
   *
   * @param {number} [timeoutMs=8000] How long to wait before giving up.
   * @returns {Promise<void>} Resolves when frames are decodable.
   */
  ready(timeoutMs = 8000) {
    if (this.video.videoWidth > 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const tick = () => {
        if (this.video.videoWidth > 0) return resolve();
        if (Date.now() - started > timeoutMs) {
          return reject(new Error('The camera opened but never produced a frame.'));
        }
        return requestAnimationFrame(tick);
      };
      tick();
    });
  }

  /** Release the camera and its indicator light. */
  stop() {
    this.stopFrames();
    if (this.stream) for (const track of this.stream.getTracks()) track.stop();
    this.stream = null;
    this.track = null;
  }

  /**
   * Run a callback on every decoded frame.
   *
   * @param {(timestampMs: number) => void} onFrame Called per frame with the
   *   best available capture time.
   */
  onFrames(onFrame) {
    this.stopFrames();
    if (CameraFeed.hasFrameClock()) {
      const step = (now, metadata) => {
        // `mediaTime` is the frame's own presentation time in seconds; it does
        // not drift when the main thread stalls, which `now` does.
        onFrame(metadata.mediaTime * 1000);
        this.frameCallbackId = this.video.requestVideoFrameCallback(step);
      };
      this.frameCallbackId = this.video.requestVideoFrameCallback(step);
      return;
    }
    // Fallback: the animation clock, which ticks at the display rate rather
    // than the camera's. Duplicate frames are harmless — the resampler is
    // interpolating onto its own grid regardless.
    const loop = (now) => {
      onFrame(now);
      this.frameCallbackId = requestAnimationFrame(loop);
    };
    this.frameCallbackId = requestAnimationFrame(loop);
  }

  /** Stop the per-frame callback. */
  stopFrames() {
    if (this.frameCallbackId === null) return;
    if (CameraFeed.hasFrameClock() && typeof this.video.cancelVideoFrameCallback === 'function') {
      this.video.cancelVideoFrameCallback(this.frameCallbackId);
    } else {
      cancelAnimationFrame(this.frameCallbackId);
    }
    this.frameCallbackId = null;
  }

  /**
   * Enumerate cameras, for the lens picker.
   *
   * @returns {Promise<MediaDeviceInfo[]>} Video input devices.
   */
  async devices() {
    if (!navigator.mediaDevices?.enumerateDevices) return [];
    const all = await navigator.mediaDevices.enumerateDevices();
    return all.filter((device) => device.kind === 'videoinput');
  }

  /**
   * Capabilities the active track actually supports.
   *
   * @returns {MediaTrackCapabilities|{}} Capability record, possibly empty.
   */
  capabilities() {
    if (!this.track?.getCapabilities) return {};
    try {
      return this.track.getCapabilities();
    } catch {
      return {};
    }
  }

  /** @returns {boolean} Whether the torch can be driven from the page. */
  hasTorch() {
    return 'torch' in this.capabilities();
  }

  /**
   * Toggle the torch, where the platform allows it.
   *
   * @param {boolean} on Desired state.
   * @returns {Promise<boolean>} Whether the request was applied.
   */
  async setTorch(on) {
    if (!this.hasTorch()) return false;
    try {
      await this.track.applyConstraints({ advanced: [{ torch: on }] });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Ask the camera to stop adjusting itself mid-scan.
   *
   * Auto-exposure and auto-white-balance are the enemy of a measurement that
   * lives in one per-cent brightness changes: the camera sees the skin darken
   * on a heartbeat and helpfully brightens the image back. Locking them is only
   * possible on some Android builds, so the app measures anyway and simply
   * reports a worse signal when it could not lock.
   *
   * @returns {Promise<boolean>} Whether any lock was applied.
   */
  async lockExposure() {
    const caps = this.capabilities();
    const advanced = [];
    if (Array.isArray(caps.exposureMode) && caps.exposureMode.includes('manual')) {
      advanced.push({ exposureMode: 'manual' });
    }
    if (Array.isArray(caps.whiteBalanceMode) && caps.whiteBalanceMode.includes('manual')) {
      advanced.push({ whiteBalanceMode: 'manual' });
    }
    if (Array.isArray(caps.focusMode) && caps.focusMode.includes('manual')) {
      advanced.push({ focusMode: 'manual' });
    }
    if (!advanced.length) return false;
    try {
      await this.track.applyConstraints({ advanced });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Grab the current frame, downscaled for analysis.
   *
   * @param {number} [targetWidth=192] Analysis width in pixels.
   * @returns {ImageData|null} Frame pixels, or null before the stream is live.
   */
  grab(targetWidth = 192) {
    const { videoWidth, videoHeight } = this.video;
    if (!videoWidth || !videoHeight) return null;
    const width = targetWidth;
    const height = Math.max(1, Math.round((videoHeight / videoWidth) * targetWidth));
    if (!this.canvas || this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas = document.createElement('canvas');
      this.canvas.width = width;
      this.canvas.height = height;
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    }
    this.ctx.drawImage(this.video, 0, 0, width, height);
    return this.ctx.getImageData(0, 0, width, height);
  }
}
