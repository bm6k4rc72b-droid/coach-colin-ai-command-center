/**
 * Camera plumbing for iOS Safari and Android Chrome.
 *
 * Both platforms reach the sensor through `getUserMedia`, but they disagree on
 * everything else — iOS needs `playsinline` and a user gesture, Android exposes
 * torch and zoom through constraints iOS does not implement at all. This module
 * hides that so the rest of the app just asks for frames.
 *
 * @module harvest-eye/camera
 */

/** Live camera feed with frame capture, torch and zoom. */
export class CameraFeed {
  /**
   * @param {HTMLVideoElement} video Video element to bind the stream to. It
   *   must already be in the document: iOS refuses to decode a detached
   *   element, which is the usual cause of a permanently black preview.
   */
  constructor(video) {
    this.video = video;
    this.stream = null;
    this.track = null;
    this.canvas = null;
    this.ctx = null;
    this.facingMode = 'environment';
  }

  /** @returns {boolean} Whether this browser can open a camera at all. */
  static supported() {
    return Boolean(globalThis.navigator?.mediaDevices?.getUserMedia);
  }

  /**
   * Open the camera.
   *
   * @param {object} [options] Stream options.
   * @param {string} [options.facingMode='environment'] Preferred camera.
   * @param {string} [options.deviceId] Exact device to open, if the operator
   *   picked one (phones with three rear lenses default to the wrong one).
   * @returns {Promise<MediaStream>} The live stream.
   */
  async start(options = {}) {
    if (!CameraFeed.supported()) {
      throw new Error('This browser has no camera API. Open the app over HTTPS.');
    }
    this.stop();
    this.facingMode = options.facingMode || this.facingMode;

    const video = options.deviceId
      ? { deviceId: { exact: options.deviceId } }
      : { facingMode: { ideal: this.facingMode } };
    // Ask for a high-ish capture size: analysis runs downscaled, but a sharper
    // source means less chroma smearing on small fruit at the frame edges.
    Object.assign(video, {
      width: { ideal: 1920 },
      height: { ideal: 1080 },
      frameRate: { ideal: 30 },
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
   * @param {number} [timeoutMs=6000] How long to wait before giving up.
   * @returns {Promise<void>} Resolves when frames are decodable.
   */
  ready(timeoutMs = 6000) {
    if (this.video.videoWidth > 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const started = Date.now();
      const tick = () => {
        if (this.video.videoWidth > 0) return resolve();
        if (Date.now() - started > timeoutMs) {
          return reject(new Error('Camera opened but never produced a frame.'));
        }
        return requestAnimationFrame(tick);
      };
      tick();
    });
  }

  /** Release the camera and its indicator light. */
  stop() {
    if (this.stream) for (const track of this.stream.getTracks()) track.stop();
    this.stream = null;
    this.track = null;
  }

  /**
   * Enumerate rear-facing cameras for the lens picker.
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
   * Toggle the torch — the single most useful control for dawn picking and for
   * shaded canopy interiors, where colour readings otherwise collapse.
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

  /** @returns {{min:number,max:number,step:number}|null} Zoom range, if any. */
  zoomRange() {
    const caps = this.capabilities();
    if (!caps.zoom) return null;
    return { min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step || 0.1 };
  }

  /**
   * Set optical/digital zoom where the platform exposes it.
   *
   * @param {number} value Zoom factor within the reported range.
   * @returns {Promise<boolean>} Whether the request was applied.
   */
  async setZoom(value) {
    const range = this.zoomRange();
    if (!range) return false;
    try {
      const clamped = Math.min(range.max, Math.max(range.min, value));
      await this.track.applyConstraints({ advanced: [{ zoom: clamped }] });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Grab the current frame, downscaled for analysis.
   *
   * @param {number} [targetWidth=224] Analysis width in pixels. Detection cost
   *   is quadratic in this, and 224 keeps a mid-range phone at 15+ fps.
   * @returns {ImageData|null} Frame pixels, or null before the stream is live.
   */
  grab(targetWidth = 224) {
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

  /**
   * Grab a full-resolution still, for the saved scan thumbnail.
   *
   * @param {number} [maxWidth=640] Longest edge of the returned image.
   * @returns {string|null} JPEG data URL, or null before the stream is live.
   */
  snapshot(maxWidth = 640) {
    const { videoWidth, videoHeight } = this.video;
    if (!videoWidth) return null;
    const scale = Math.min(1, maxWidth / videoWidth);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(videoWidth * scale);
    canvas.height = Math.round(videoHeight * scale);
    canvas.getContext('2d').drawImage(this.video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.7);
  }
}
