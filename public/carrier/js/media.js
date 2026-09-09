/**
 * Footage the author dropped in, held by slot name.
 *
 * Files stay in the tab. They are read as object URLs, decoded by the browser,
 * and drawn straight to the canvas; nothing is uploaded, and nothing survives
 * the tab closing. That is a deliberate limit rather than an unfinished
 * feature: the material people cut into a security briefing is often footage of
 * their own premises, and the safest place for it is the machine it is already
 * on.
 *
 * Video slots are seeked rather than played. The renderer is a function of a
 * timestamp, and a `<video>` playing at its own rate is a second clock that
 * would drift from it — most visibly during an export, where the canvas advances
 * one frame at a time and wall-clock playback would race ahead.
 *
 * @module carrier/media
 */

/**
 * A registry of loaded media, keyed by slot.
 */
export class MediaLibrary {
  constructor() {
    /** @type {Map<string, {element: HTMLImageElement|HTMLVideoElement, width: number, height: number, kind: string, name: string, url: string, duration: number}>} */
    this.slots = new Map();
    /** @type {Set<() => void>} */
    this.listeners = new Set();
  }

  /**
   * Subscribe to changes.
   *
   * @param {() => void} fn Called whenever a slot is filled or cleared.
   * @returns {() => void} Unsubscribe.
   */
  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** @returns {void} */
  notify() {
    for (const fn of this.listeners) fn();
  }

  /**
   * What is in a slot.
   *
   * @param {string} slot Slot name.
   * @returns {{element: CanvasImageSource, width: number, height: number}|null} The media.
   */
  get(slot) {
    return this.slots.get(slot) ?? null;
  }

  /** @returns {string[]} Every filled slot name. */
  filled() {
    return [...this.slots.keys()];
  }

  /**
   * Load a file into a slot, replacing whatever was there.
   *
   * @param {string} slot Slot name.
   * @param {File} file An image or video file.
   * @returns {Promise<void>} Resolves once the media has dimensions.
   */
  async load(slot, file) {
    const url = URL.createObjectURL(file);
    const kind = file.type.startsWith('video') ? 'video' : 'image';
    const entry = kind === 'video' ? await loadVideo(url) : await loadImage(url);
    this.clear(slot);
    this.slots.set(slot, { ...entry, kind, name: file.name, url });
    this.notify();
  }

  /**
   * Empty a slot and release its object URL.
   *
   * @param {string} slot Slot name.
   * @returns {void}
   */
  clear(slot) {
    const held = this.slots.get(slot);
    if (!held) return;
    URL.revokeObjectURL(held.url);
    this.slots.delete(slot);
    this.notify();
  }

  /**
   * Point every video slot at the right frame for a moment in the episode.
   *
   * Slots loop: a four-second clip under a twelve-second scene plays three
   * times rather than freezing on its last frame, which is what an author
   * dropping in a short loop expects.
   *
   * @param {number} tLocal Seconds since the current scene started.
   * @returns {Promise<void>} Resolves once every seek has landed.
   */
  async seek(tLocal) {
    const waits = [];
    for (const held of this.slots.values()) {
      if (held.kind !== 'video' || !held.duration) continue;
      const target = tLocal % held.duration;
      if (Math.abs(held.element.currentTime - target) < 0.02) continue;
      waits.push(new Promise((resolve) => {
        const done = () => {
          held.element.removeEventListener('seeked', done);
          resolve();
        };
        held.element.addEventListener('seeked', done, { once: true });
        held.element.currentTime = target;
        // A seek that never lands must not hang an export.
        setTimeout(done, 120);
      }));
    }
    await Promise.all(waits);
  }
}

/**
 * Decode an image file.
 *
 * @param {string} url Object URL.
 * @returns {Promise<{element: HTMLImageElement, width: number, height: number, duration: number}>} The image.
 */
function loadImage(url) {
  return new Promise((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve({
      element, width: element.naturalWidth, height: element.naturalHeight, duration: 0,
    });
    element.onerror = () => reject(new Error('That image could not be read.'));
    element.src = url;
  });
}

/**
 * Decode a video file far enough to know its size and length.
 *
 * @param {string} url Object URL.
 * @returns {Promise<{element: HTMLVideoElement, width: number, height: number, duration: number}>} The video.
 */
function loadVideo(url) {
  return new Promise((resolve, reject) => {
    const element = document.createElement('video');
    element.muted = true;
    element.playsInline = true;
    element.preload = 'auto';
    element.onloadeddata = () => resolve({
      element,
      width: element.videoWidth,
      height: element.videoHeight,
      duration: Number.isFinite(element.duration) ? element.duration : 0,
    });
    element.onerror = () => reject(new Error('That video could not be read.'));
    element.src = url;
  });
}
