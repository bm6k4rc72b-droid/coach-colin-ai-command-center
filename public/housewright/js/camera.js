/**
 * Camera and orientation plumbing, across the three devices this has to run on.
 *
 * The differences that matter:
 *
 *  - **iOS** needs `playsinline`, a user gesture before the stream opens, and
 *    an explicit permission request for the orientation sensors — a request
 *    that only succeeds inside a real tap handler and only over HTTPS.
 *  - **Android** grants orientation without asking, and is the only one of the
 *    three that reliably offers torch through track constraints.
 *  - **A laptop** has a front camera and no orientation sensors at all, so
 *    the pointing survey is unavailable there and the app has to notice and
 *    say so rather than reporting confident nonsense from a level phone.
 *
 * @module housewright/camera
 */

/** Live camera feed with frame capture and torch. */
export class CameraFeed {
  /**
   * @param {HTMLVideoElement} video Video element to bind to. It must already
   *   be in the document; iOS will not decode a detached element.
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
   * @returns {Promise<MediaStream>} The live stream.
   */
  async start(options = {}) {
    if (!CameraFeed.supported()) {
      throw new Error('This browser has no camera API. Open the app over HTTPS.');
    }
    this.stop();
    this.facingMode = options.facingMode || this.facingMode;
    const constraints = {
      video: {
        facingMode: { ideal: this.facingMode },
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 },
      },
      audio: false,
    };
    this.stream = await navigator.mediaDevices.getUserMedia(constraints);
    this.track = this.stream.getVideoTracks()[0] || null;
    this.video.srcObject = this.stream;
    this.video.setAttribute('playsinline', '');
    this.video.muted = true;
    await this.video.play().catch(() => {});
    return this.stream;
  }

  /** Close the camera and release the indicator light. */
  stop() {
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
    }
    this.stream = null;
    this.track = null;
  }

  /** @returns {boolean} Whether a stream is running. */
  get live() {
    return Boolean(this.stream && this.track && this.track.readyState === 'live');
  }

  /**
   * The lens's field of view, in degrees.
   *
   * Browsers do not report this. The fallback is the horizontal field of a
   * typical phone main camera, which is close enough that the aiming error
   * from a wrong guess is smaller than the aiming error from a shaky hand —
   * and only affects shots taken away from the centre of the frame, which is
   * why the reticle sits in the middle.
   *
   * @returns {{x: number, y: number}} Horizontal and vertical fields of view.
   */
  fieldOfView() {
    const settings = this.track?.getSettings?.() || {};
    const width = settings.width || this.video.videoWidth || 1280;
    const height = settings.height || this.video.videoHeight || 720;
    const fovX = 66;
    const fovY = 2 * Math.atan(Math.tan((fovX / 2) * Math.PI / 180) * (height / width)) * 180 / Math.PI;
    return { x: fovX, y: fovY };
  }

  /**
   * Grab the current frame's pixels at an analysis resolution.
   *
   * @param {number} [width=192] Target width; height follows the aspect ratio.
   * @returns {{data: Uint8ClampedArray, width: number, height: number}|null}
   *   The pixels, or `null` before the first frame has decoded.
   */
  grab(width = 192) {
    const vw = this.video.videoWidth;
    const vh = this.video.videoHeight;
    if (!vw || !vh) return null;
    const height = Math.max(Math.round((width * vh) / vw), 1);
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    }
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.ctx.drawImage(this.video, 0, 0, width, height);
    const image = this.ctx.getImageData(0, 0, width, height);
    return { data: image.data, width, height };
  }

  /**
   * Turn the torch on or off, where the platform allows it.
   *
   * @param {boolean} on Desired state.
   * @returns {Promise<boolean>} Whether the torch is now on.
   */
  async torch(on) {
    const capabilities = this.track?.getCapabilities?.();
    if (!capabilities || !('torch' in capabilities)) return false;
    try {
      await this.track.applyConstraints({ advanced: [{ torch: on }] });
      return on;
    } catch {
      return false;
    }
  }
}

/**
 * Device orientation, normalised and watched.
 *
 * Reports `ready` only once a reading has actually arrived, so the survey can
 * refuse to take shots on hardware that has no sensors rather than treating a
 * silent stream of zeroes as a phone lying perfectly flat.
 */
export class Orientation {
  constructor() {
    this.alpha = 0;
    this.beta = 90;
    this.gamma = 0;
    this.absolute = false;
    this.ready = false;
    this.samples = 0;
    this.handler = null;
  }

  /** @returns {boolean} Whether this browser exposes the sensor API at all. */
  static supported() {
    return typeof globalThis.DeviceOrientationEvent !== 'undefined';
  }

  /**
   * Ask for permission where the platform requires it, then start listening.
   *
   * Must be called from inside a user gesture on iOS; called anywhere else it
   * simply starts listening.
   *
   * @returns {Promise<boolean>} Whether listening started.
   */
  async start() {
    if (!Orientation.supported()) return false;
    const request = globalThis.DeviceOrientationEvent?.requestPermission;
    if (typeof request === 'function') {
      try {
        const state = await request.call(globalThis.DeviceOrientationEvent);
        if (state !== 'granted') return false;
      } catch {
        return false;
      }
    }
    this.handler = (event) => {
      if (event.alpha === null && event.beta === null && event.gamma === null) return;
      this.alpha = event.alpha ?? this.alpha;
      this.beta = event.beta ?? this.beta;
      this.gamma = event.gamma ?? this.gamma;
      this.absolute = Boolean(event.absolute);
      this.samples += 1;
      // Two readings, not one: some browsers fire a single zeroed event on
      // subscribe, and treating that as a live sensor is how a laptop ends up
      // reporting a survey.
      if (this.samples >= 2) this.ready = true;
    };
    globalThis.addEventListener('deviceorientation', this.handler, true);
    return true;
  }

  /** Stop listening. */
  stop() {
    if (this.handler) globalThis.removeEventListener('deviceorientation', this.handler, true);
    this.handler = null;
  }

  /** @returns {number} The screen's rotation in degrees. */
  screenAngle() {
    const angle = globalThis.screen?.orientation?.angle;
    if (typeof angle === 'number') return angle;
    return typeof globalThis.orientation === 'number' ? globalThis.orientation : 0;
  }

  /**
   * The current reading.
   *
   * @returns {{alpha: number, beta: number, gamma: number, screenAngle: number, ready: boolean}}
   *   Everything `pose.pointingRay` needs.
   */
  read() {
    return {
      alpha: this.alpha,
      beta: this.beta,
      gamma: this.gamma,
      screenAngle: this.screenAngle(),
      ready: this.ready,
    };
  }
}
