/**
 * Sensors: the phone's motion, and the device camera.
 *
 * Two inputs, both optional, both permissioned, both local.
 *
 * **Motion.** On a phone or tablet, tilting the device parallaxes the whole
 * facility — the lab camera, the intro's layered cards, the graph. iOS requires
 * an explicit permission request from inside a user gesture, which is why this
 * is a button rather than something that just happens. On a laptop the same
 * parallax runs from the pointer, so the effect exists everywhere.
 *
 * **Camera.** The lens does two jobs. It scans a QR code or a label and looks
 * the compound up in the corpus; and it drives an ambient-light reading that
 * lets the facility respond to the room you are actually sitting in. Frames are
 * read into a canvas and discarded — nothing is recorded, uploaded or stored.
 *
 * @module astra/sensors
 */

/**
 * Device orientation and pointer parallax, normalised into one signal.
 *
 * Consumers read `x` and `y` in roughly [-1, 1] regardless of which input is
 * driving it, so nothing downstream needs to care whether it is running on a
 * phone or a desktop.
 */
export class Tilt {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.targetX = 0;
    this.targetY = 0;
    this.mode = 'none';
    this.granted = false;
    this.supported = typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;
    this.handlers = { orientation: null, pointer: null };
  }

  /**
   * Whether this device needs an explicit permission prompt (iOS 13+).
   *
   * @returns {boolean} True if a gesture-bound request is required.
   */
  needsPermission() {
    return this.supported && typeof DeviceOrientationEvent.requestPermission === 'function';
  }

  /**
   * Start motion tracking. Call from a user gesture on iOS.
   *
   * @returns {Promise<{ mode: string, granted: boolean }>} What was started.
   */
  async enableMotion() {
    if (!this.supported) return { mode: this.mode, granted: false };
    if (this.needsPermission()) {
      try {
        const response = await DeviceOrientationEvent.requestPermission();
        if (response !== 'granted') return { mode: this.mode, granted: false };
      } catch {
        return { mode: this.mode, granted: false };
      }
    }
    this.granted = true;
    this.mode = 'motion';
    this.handlers.orientation = (event) => {
      // gamma is left-right tilt, beta front-back. Both are clamped hard: the
      // effect should read as a subtle parallax, not a fairground ride.
      const gamma = Number(event.gamma) || 0;
      const beta = Number(event.beta) || 0;
      this.targetX = Math.max(-1, Math.min(1, gamma / 34));
      this.targetY = Math.max(-1, Math.min(1, (beta - 45) / 40));
    };
    window.addEventListener('deviceorientation', this.handlers.orientation, { passive: true });
    return { mode: this.mode, granted: true };
  }

  /**
   * Start pointer parallax, which is the desktop equivalent and the fallback.
   *
   * @param {HTMLElement} [target] Element to track over.
   */
  enablePointer(target = document.body) {
    if (this.mode === 'motion') return;
    this.mode = 'pointer';
    this.handlers.pointer = (event) => {
      const rect = target.getBoundingClientRect();
      this.targetX = ((event.clientX - rect.left) / (rect.width || 1)) * 2 - 1;
      this.targetY = ((event.clientY - rect.top) / (rect.height || 1)) * 2 - 1;
    };
    window.addEventListener('pointermove', this.handlers.pointer, { passive: true });
  }

  /**
   * Advance the smoothing. Call once per frame.
   *
   * @param {number} dt Seconds since the last frame.
   * @returns {{ x: number, y: number }} The eased tilt.
   */
  update(dt) {
    const rate = 1 - Math.exp(-6 * Math.min(0.1, dt));
    this.x += (this.targetX - this.x) * rate;
    this.y += (this.targetY - this.y) * rate;
    return { x: this.x, y: this.y };
  }

  /** Stop listening. */
  stop() {
    if (this.handlers.orientation) window.removeEventListener('deviceorientation', this.handlers.orientation);
    if (this.handlers.pointer) window.removeEventListener('pointermove', this.handlers.pointer);
    this.handlers = { orientation: null, pointer: null };
    this.mode = 'none';
  }
}

/**
 * The lens: camera access, frame sampling and code scanning.
 */
export class Lens {
  /**
   * @param {HTMLVideoElement} video A video element to attach the stream to.
   */
  constructor(video) {
    this.video = video;
    this.stream = null;
    this.canvas = null;
    this.ctx = null;
    this.detector = null;
    this.facing = 'environment';
  }

  /**
   * Whether the browser exposes a camera at all.
   *
   * @returns {boolean} Support.
   */
  static supported() {
    return Boolean(globalThis.navigator?.mediaDevices?.getUserMedia);
  }

  /**
   * Start the camera.
   *
   * @param {'environment'|'user'} [facing] Which camera.
   * @returns {Promise<boolean>} Whether the stream started.
   */
  async start(facing = this.facing) {
    if (!Lens.supported()) return false;
    this.stop();
    this.facing = facing;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
    } catch {
      return false;
    }
    this.video.srcObject = this.stream;
    this.video.setAttribute('playsinline', '');
    this.video.muted = true;
    try {
      await this.video.play();
    } catch {
      // Autoplay refusal; the caller shows a tap-to-start affordance.
    }
    if ('BarcodeDetector' in globalThis) {
      try {
        this.detector = new globalThis.BarcodeDetector({ formats: ['qr_code', 'code_128', 'ean_13'] });
      } catch {
        this.detector = null;
      }
    }
    return true;
  }

  /** Stop the camera and release the hardware. */
  stop() {
    for (const track of this.stream?.getTracks() || []) track.stop();
    this.stream = null;
    if (this.video) this.video.srcObject = null;
  }

  /**
   * Grab a frame into an offscreen canvas.
   *
   * @param {number} [width] Sample width; height follows the aspect ratio.
   * @returns {ImageData|null} The pixels, or null if no frame is ready.
   */
  frame(width = 240) {
    if (!this.video || !this.video.videoWidth) return null;
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    }
    const height = Math.max(1, Math.round(width * (this.video.videoHeight / this.video.videoWidth)));
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx.drawImage(this.video, 0, 0, width, height);
    return this.ctx.getImageData(0, 0, width, height);
  }

  /**
   * Read the room: average luminance and colour temperature of the current
   * frame. The facility uses this to warm or cool its lighting so the screen
   * sits in the room rather than on top of it.
   *
   * @returns {{ luminance: number, warmth: number }|null} The reading in [0, 1].
   */
  ambient() {
    const image = this.frame(64);
    if (!image) return null;
    let sum = 0;
    let red = 0;
    let blue = 0;
    const { data } = image;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      sum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
      red += r;
      blue += b;
    }
    const pixels = data.length / 4;
    return {
      luminance: Math.min(1, sum / pixels / 255),
      // Above 0.5 the room is warm, below it is cool.
      warmth: Math.min(1, Math.max(0, 0.5 + (red - blue) / pixels / 255)),
    };
  }

  /**
   * Scan the current frame for a code.
   *
   * @returns {Promise<string|null>} The decoded value, or null.
   */
  async scan() {
    if (!this.detector || !this.video?.videoWidth) return null;
    try {
      const codes = await this.detector.detect(this.video);
      return codes.length ? String(codes[0].rawValue || '') : null;
    } catch {
      return null;
    }
  }
}

/**
 * Interpret a scanned string.
 *
 * A URL that points back at the platform carries a compound id; anything else
 * is treated as free text and handed to the search engine, which is what makes
 * scanning a product label useful rather than a novelty.
 *
 * @param {string} value The scanned string.
 * @returns {{ kind: 'compound'|'query'|'url', value: string }} How to handle it.
 */
export function interpretScan(value) {
  const text = String(value || '').trim();
  if (!text) return { kind: 'query', value: '' };
  try {
    const url = new URL(text);
    const compound = url.searchParams.get('compound') || url.hash.replace(/^#\/?/, '');
    if (compound) return { kind: 'compound', value: compound };
    return { kind: 'url', value: text };
  } catch {
    return { kind: 'query', value: text };
  }
}

/**
 * Whether the viewer has asked the platform to stop moving.
 *
 * Every animated surface honours this: the parallax, the lab flight, the
 * intro reveals. A reduced-motion preference is not a suggestion.
 *
 * @returns {boolean} True if reduced motion is requested.
 */
export function prefersReducedMotion() {
  return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches);
}
