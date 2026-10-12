/**
 * Judge Colin, alive: four AI-generated clips of the judge — idle, speaking,
 * striking the gavel, delivering the verdict — animated from the court
 * plate's own frame and directed by what happens in the trial.
 *
 * One director serves both views of him: the 3D hologram on the courtroom
 * pedestal (the clips as video textures, keyed into light) and the
 * full-colour "judge cam" at the top of the courtroom card (the same
 * <video> elements, cross-faded). Clips are loaded only while the visitor
 * is at or beside the courtroom, and released when they walk on.
 *
 * @module astra/showcase/judge
 */

import * as THREE from 'three';

const BASE = '../assets/showcase/';
const CDN = 'https://d2ol7oe51mr4n9.cloudfront.net/user_3D17dPWC57zGXhL3gHkykFe9E5n/';

/**
 * The clips: Kling 3.0 image-to-video from the judge's own frame, cut to
 * 720 × 720 H.264 (0.7–1.2 MB each). Idle and speak loop seamlessly — their
 * last half-second cross-fades into their first. They are served from the
 * Higgsfield CDN, which allows cross-origin use (needed for the WebGL
 * texture) and byte ranges (needed by iPhones). `hit` is when the gavel
 * lands in the strike clip (3.12 s, read off the frames), so the knock can
 * wait for him.
 */
export const CLIPS = {
  idle: { src: `${CDN}d6fd6c9b-a16a-4304-a740-4465ace60037.mp4`, loop: true },
  speak: { src: `${CDN}56d81d2c-d5fb-48ec-b72b-efe2ecf59ea3.mp4`, loop: true },
  gavel: { src: `${CDN}6dc92974-d483-43ff-af61-4c2ce5843aed.mp4`, loop: false, hit: 3.12 },
  verdict: { src: `${CDN}8f141fc4-205a-4ba2-86ed-f394fcb362fe.mp4`, loop: false },
};

/**
 * Where the judge sits inside a clip's frame, in the same UV convention as
 * the plate crop (v up). The clips were generated from a 900-pixel square
 * cut from the court plate at (680, 108); the hologram's crop of the plate
 * (x 729–1529, y 141–857) maps into it as below.
 */
export const VIDEO_CROP = {
  u0: (729 - 680) / 900, u1: (1529 - 680) / 900,
  v0: 1 - (857 - 108) / 900, v1: 1 - (141 - 108) / 900,
};

const FADE = 0.35;

class Director {
  constructor() {
    this.videos = {};
    this.textures = {};
    this.active = false;
    this.current = 'idle';
    this.previous = null;
    this.fadeStart = 0;
    this.queue = [];
    this.quietSince = 0;
    this.cam = null;
    this.blessed = new Set();
    this.blocked = false;
    this.kicked = 0;
    this.since = 0;
    this.feed = 'loading';
    this.unlocking = false;
  }

  /**
   * iPhones only let a page start a video on its own while the video is on
   * screen and the phone is not in Low Power Mode. A video once started from
   * a tap is free of that rule, so the first taps anywhere start every clip
   * (and park the ones not on screen), after which the director can cut
   * between them at will.
   */
  listen() {
    if (this.unlocking || typeof window === 'undefined') return;
    this.unlocking = true;
    const unlock = () => {
      if (!this.active) return;
      for (const [name, v] of Object.entries(this.videos)) {
        if (!v.getAttribute('src') || (this.blessed.has(name) && name !== this.current)) continue;
        if (name === this.current && !v.paused) continue;
        v.play()?.then?.(() => {
          this.blessed.add(name);
          if (name !== this.current && name !== this.previous) { v.pause(); try { v.currentTime = 0; } catch (error) { /* seeking */ } }
        }).catch?.(() => {});
      }
    };
    for (const type of ['pointerdown', 'touchend', 'click', 'keydown']) window.addEventListener(type, unlock, { capture: true, passive: true });
  }

  /** Buffer a clip that is not on screen yet: start it silently and park it. */
  prime(name) {
    const v = this.videos[name];
    v.play()?.then?.(() => {
      if (name !== this.current && name !== this.previous) { v.pause(); try { v.currentTime = 0; } catch (error) { /* seeking */ } }
    }).catch?.(() => {});
  }

  /** Clip elements, created once; sources attached only while active. */
  video(name) {
    if (!this.videos[name]) {
      const v = document.createElement('video');
      v.addEventListener('playing', () => { if (name === this.current) this.blocked = false; });
      v.crossOrigin = 'anonymous';
      v.muted = true;
      v.defaultMuted = true;
      v.playsInline = true;
      v.setAttribute('playsinline', '');
      v.setAttribute('muted', '');
      v.loop = CLIPS[name].loop;
      v.preload = 'auto';
      v.className = `judge-clip clip-${name}`;
      v.setAttribute('aria-hidden', 'true');
      this.videos[name] = v;
    }
    return this.videos[name];
  }

  /** The visitor is at (or beside) the courtroom: load the clips and roll. */
  setActive(on) {
    if (on === this.active) return;
    this.active = on;
    this.listen();
    this.since = performance.now() / 1000;
    for (const name of Object.keys(CLIPS)) {
      const v = this.video(name);
      if (on) {
        if (!v.getAttribute('src')) { v.src = CLIPS[name].src; v.load(); }
      } else {
        v.pause();
        v.removeAttribute('src');
        v.load();
      }
    }
    if (on) {
      this.play('idle');
      for (const name of Object.keys(CLIPS)) if (name !== 'idle') this.prime(name);
    }
    this.syncCam();
  }

  ready(name) {
    const v = this.videos[name];
    return Boolean(this.active && v && v.readyState >= 2);
  }

  /** Cut to a clip (cross-fading from the last), from the start. */
  play(name) {
    const v = this.video(name);
    if (!this.active) return;
    if (name !== this.current) {
      this.previous = this.current;
      this.fadeStart = performance.now() / 1000;
    }
    this.current = name;
    this.since = Math.max(this.since, performance.now() / 1000 - 3);
    try { v.currentTime = 0; } catch (error) { /* not loaded yet */ }
    this.kick(v);
    this.syncCam();
  }

  /** Start a clip, noting when the browser refuses (it wants a tap first). */
  kick(v) {
    this.kicked = performance.now() / 1000;
    v.play()?.then?.(() => { this.blocked = false; }).catch?.((error) => { if (error?.name === 'NotAllowedError') this.blocked = true; });
  }

  /** What the judge cam can honestly say about its feed. */
  feedState(now) {
    const v = this.videos[this.current];
    if (!v) return 'loading';
    if (v.error) return 'offline';
    if (!v.paused && v.readyState >= 2) { this.since = now; return 'live'; }
    if (this.blocked || now - this.since > 5) return 'tap';
    return 'loading';
  }

  /**
   * Ask the judge to act. Returns the delay in seconds until the moment that
   * matters (the gavel landing), so sound and 3D props can wait for him.
   *
   * @param {'gavel'|'verdict'} name The action.
   * @returns {number|null} Seconds until the gavel lands, or null if the clips are not ready.
   */
  cue(name) {
    if (!this.ready(name)) return null;
    if (name === 'verdict') {
      this.queue = ['gavel'];
      this.play('verdict');
      return null;
    }
    this.queue = [];
    this.play('gavel');
    return CLIPS.gavel.hit;
  }

  /** Per frame: finish one-shots, follow Colin's voice, report the fade. */
  update(speak) {
    if (!this.active) return;
    const now = performance.now() / 1000;
    const v = this.videos[this.current];
    const oneShot = !CLIPS[this.current].loop;
    if (oneShot && v && (v.ended || (v.duration && v.currentTime >= v.duration - 0.08))) {
      const next = this.queue.shift();
      if (next === 'gavel' && this.ready('gavel')) {
        this.play('gavel');
        this.onQueuedGavel?.(CLIPS.gavel.hit);
      } else this.play(speak > 0.25 ? 'speak' : 'idle');
      return;
    }
    if (!oneShot) {
      if (speak > 0.25) { this.quietSince = now; if (this.current !== 'speak' && this.ready('speak')) this.play('speak'); }
      else if (this.current === 'speak' && now - this.quietSince > 0.8) this.play('idle');
    }
    // Only the clips on screen need decoding.
    for (const [name, clip] of Object.entries(this.videos)) {
      if (name !== this.current && name !== this.previous && !clip.paused) clip.pause();
    }
    if (this.previous && now - this.fadeStart > FADE) {
      this.videos[this.previous]?.pause();
      this.previous = null;
      this.syncCam();
    }
    // A looping clip that has been paused under us (iPhones pause muted
    // video that scrolls off screen) is nudged back into motion.
    if (v && v.paused && !v.ended && !v.error && now - this.kicked > 1.5) this.kick(v);
    const feed = this.feedState(now);
    if (feed !== this.feed) { this.feed = feed; this.syncCam(); }
  }

  /** The textures to show and how far through the cross-fade we are. */
  frame() {
    if (!this.active || !this.ready(this.current)) return null;
    const tex = (name) => {
      if (!this.textures[name]) {
        const t = new THREE.VideoTexture(this.video(name));
        t.colorSpace = THREE.SRGBColorSpace;
        t.minFilter = THREE.LinearFilter;
        t.generateMipmaps = false;
        this.textures[name] = t;
      }
      return this.textures[name];
    };
    const to = tex(this.current);
    const from = this.previous && this.ready(this.previous) ? tex(this.previous) : to;
    const k = this.previous ? Math.min(1, (performance.now() / 1000 - this.fadeStart) / FADE) : 1;
    return { from, to, k };
  }

  /** The clip on screen, if it has a frame to show (for the wall screen). */
  currentVideo() {
    return this.ready(this.current) ? this.videos[this.current] : null;
  }

  /** The full-colour judge cam for the courtroom card. */
  camera() {
    if (this.cam) return this.cam;
    const poster = `${BASE}judge-frame.jpg`;
    this.cam = document.createElement('div');
    this.cam.className = 'judge-cam';
    this.cam.dataset.src = poster;
    for (const name of Object.keys(CLIPS)) this.cam.append(this.video(name));
    this.syncCam();
    return this.cam;
  }

  syncCam() {
    if (!this.cam) return;
    for (const [name, v] of Object.entries(this.videos)) v.classList.toggle('on', name === this.current);
    this.cam.dataset.clip = this.current;
    this.cam.dataset.feed = this.active ? this.feed : 'loading';
  }
}

export const judge = new Director();
