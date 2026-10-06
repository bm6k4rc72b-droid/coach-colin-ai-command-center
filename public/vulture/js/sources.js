/**
 * Camera sources. Anything that can become pixels in a browser can feed the
 * pipeline:
 *
 *   webcam   getUserMedia — laptop webcam, iPhone/Android camera (front/back),
 *            USB/HDMI capture cards (DJI, GoPro, drone controllers' HDMI out)
 *   screen   getDisplayMedia — mirror the DJI Fly / Meta AI app window, a VMS
 *            tab, or any on-screen feed
 *   file     a local video file (recorded session, drone footage)
 *   url      HTTP(S) MP4/WebM, HLS (.m3u8, via hls.js) or MJPEG (multipart)
 *   rtsp     rtsp:// IP cameras through the bundled relay (browsers cannot
 *            speak RTSP; the relay transcodes to MJPEG with ffmpeg)
 *   sim-*    simulated feeds for demos and testing
 *
 * Every source draws into a fixed-width analysis canvas; inference reads that
 * canvas, so detectors see one uniform input regardless of origin.
 *
 * @module vulture/sources
 */

import { LotSim, simulatedPose } from './sim.js';

export const ANALYSIS_WIDTH = 960;

let seq = 0;
const uid = () => `cam${Date.now().toString(36)}${(seq++).toString(36)}`;

export const KIND_LABEL = {
  webcam: 'Device camera', screen: 'Screen / app mirror', file: 'Video file', url: 'Stream URL',
  rtsp: 'RTSP / IP camera', 'sim-lot': 'Simulated parking lot', 'sim-athlete': 'Simulated athlete',
};

export class Camera {
  /**
   * @param {object} cfg Persisted config.
   */
  constructor(cfg) {
    this.id = cfg.id ?? uid();
    this.name = cfg.name ?? 'Camera';
    this.kind = cfg.kind;
    this.url = cfg.url ?? '';
    this.relay = cfg.relay ?? 'http://127.0.0.1:8787';
    this.deviceId = cfg.deviceId ?? '';
    this.facing = cfg.facing ?? 'environment';
    this.zones = cfg.zones ?? [];
    this.simMode = cfg.simMode ?? 'squat';
    this.task = cfg.task ?? (cfg.kind === 'sim-lot' ? 'zones' : cfg.kind === 'sim-athlete' ? 'kinetics' : 'both');
    this.status = 'stopped';
    this.error = '';
    this.el = null;
    this.stream = null;
    this.hls = null;
    this.file = null;
    this.sim = null;
    this.frame = document.createElement('canvas');
    this.fctx = this.frame.getContext('2d', { willReadFrequently: true });
    this.simPose = null;
    this.simDetections = null;
    this.startedAt = 0;
  }

  /** @returns {object} Serialisable config. */
  toJSON() {
    const { id, name, kind, url, relay, deviceId, facing, zones, simMode, task } = this;
    return { id, name, kind, url, relay, deviceId, facing, zones, simMode, task };
  }

  get isSim() { return this.kind.startsWith('sim-'); }

  /** Start capturing. Throws with a human-readable message on failure. */
  async start() {
    this.stop();
    this.status = 'starting';
    this.error = '';
    try {
      if (this.kind === 'webcam') {
        const video = {
          width: { ideal: 1280 }, height: { ideal: 720 },
          ...(this.deviceId ? { deviceId: { exact: this.deviceId } } : { facingMode: this.facing }),
        };
        this.stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
        this.el = await videoFromStream(this.stream);
        const track = this.stream.getVideoTracks()[0];
        this.deviceId = track.getSettings().deviceId ?? this.deviceId;
        if (this.name === 'Camera' || !this.name) this.name = track.label || 'Device camera';
      } else if (this.kind === 'screen') {
        this.stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: false });
        this.el = await videoFromStream(this.stream);
      } else if (this.kind === 'file') {
        if (!this.file) throw new Error('Choose a video file for this camera.');
        const v = makeVideo();
        v.src = URL.createObjectURL(this.file);
        v.loop = true;
        await playWhenReady(v);
        this.el = v;
      } else if (this.kind === 'url') {
        this.el = await openUrl(this.url, this);
      } else if (this.kind === 'rtsp') {
        if (!/^rtsps?:\/\//i.test(this.url)) throw new Error('RTSP URL must start with rtsp://');
        const src = `${this.relay.replace(/\/$/, '')}/mjpeg?src=${encodeURIComponent(this.url)}&fps=12&w=${ANALYSIS_WIDTH}`;
        this.el = await openMjpeg(src);
      } else if (this.kind === 'sim-lot') {
        this.sim = new LotSim();
        if (!this.zones.length) this.zones = this.sim.defaultZones();
        this.el = document.createElement('canvas');
        this.el.width = ANALYSIS_WIDTH; this.el.height = 540;
      } else if (this.kind === 'sim-athlete') {
        this.el = document.createElement('canvas');
        this.el.width = ANALYSIS_WIDTH; this.el.height = 540;
      }
      this.startedAt = performance.now();
      this.status = 'live';
    } catch (err) {
      this.status = 'error';
      this.error = explain(err);
      this.stop(true);
      throw new Error(this.error);
    }
  }

  /** Stop and release devices. */
  stop(keepError = false) {
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.hls?.destroy();
    this.hls = null;
    if (this.el instanceof HTMLVideoElement) { this.el.pause(); if (this.el.src.startsWith('blob:')) URL.revokeObjectURL(this.el.src); this.el.removeAttribute('src'); this.el.load(); }
    if (this.el instanceof HTMLImageElement) this.el.src = '';
    this.el = null;
    this.sim = null;
    if (!keepError) { this.status = 'stopped'; this.error = ''; }
  }

  /** Natural size of the source. */
  size() {
    const e = this.el;
    if (!e) return [0, 0];
    if (e instanceof HTMLVideoElement) return [e.videoWidth, e.videoHeight];
    if (e instanceof HTMLImageElement) return [e.naturalWidth, e.naturalHeight];
    return [e.width, e.height];
  }

  /**
   * Copy the current frame into the analysis canvas.
   *
   * @param {number} tMs Timestamp.
   * @returns {HTMLCanvasElement|null} Frame, or null if nothing new to show.
   */
  grab(tMs) {
    if (this.status !== 'live' || !this.el) return null;
    if (this.kind === 'sim-lot') {
      this.sim.step(tMs / 1000);
      this.sim.draw(this.el.getContext('2d'), this.el.width, this.el.height);
      this.simDetections = this.sim.detections();
    } else if (this.kind === 'sim-athlete') {
      const t = (tMs - this.startedAt) / 1000;
      const mode = this.simMode;
      this.simPose = mode === 'run'
        ? simulatedPose('run', t, { cadence: 172, speed: 0.22, pingPong: true })
        : simulatedPose(t < 3 ? 'stand' : mode, Math.max(0, t - 3), { period: 2.6 });
      drawMannequin(this.el.getContext('2d'), this.el.width, this.el.height, this.simPose);
    }
    const [w, h] = this.size();
    if (!w || !h) return null;
    const W = Math.min(ANALYSIS_WIDTH, w);
    const H = Math.round((W * h) / w);
    if (this.frame.width !== W || this.frame.height !== H) { this.frame.width = W; this.frame.height = H; }
    this.fctx.drawImage(this.el, 0, 0, W, H);
    return this.frame;
  }
}

function makeVideo() {
  const v = document.createElement('video');
  v.muted = true; v.playsInline = true; v.autoplay = true; v.crossOrigin = 'anonymous';
  v.setAttribute('playsinline', '');
  return v;
}

async function videoFromStream(stream) {
  const v = makeVideo();
  v.srcObject = stream;
  await playWhenReady(v);
  return v;
}

function playWhenReady(v) {
  return new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error('Timed out waiting for video')), 20000);
    v.addEventListener('loadeddata', () => { clearTimeout(to); v.play().then(() => resolve(v), () => resolve(v)); }, { once: true });
    v.addEventListener('error', () => { clearTimeout(to); reject(new Error(v.error?.message || 'Video failed to load (format or CORS)')); }, { once: true });
  });
}

async function openUrl(url, cam) {
  if (!/^https?:\/\//i.test(url)) throw new Error('Stream URL must start with http:// or https://');
  if (/\.m3u8(\?|$)/i.test(url)) {
    const v = makeVideo();
    if (window.Hls?.isSupported()) {
      cam.hls = new window.Hls({ lowLatencyMode: true });
      cam.hls.loadSource(url);
      cam.hls.attachMedia(v);
    } else {
      v.src = url; // Safari plays HLS natively
    }
    return playWhenReady(v);
  }
  if (/mjpe?g|\.cgi|snapshot|video\.feed|action=stream/i.test(url)) return openMjpeg(url);
  const v = makeVideo();
  v.src = url;
  v.loop = true;
  return playWhenReady(v);
}

function openMjpeg(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const to = setTimeout(() => reject(new Error('No frames from MJPEG stream (is the relay running?)')), 15000);
    img.onload = () => { clearTimeout(to); resolve(img); };
    img.onerror = () => { clearTimeout(to); reject(new Error('MJPEG stream failed (URL, relay or CORS)')); };
    img.src = src;
  });
}

function explain(err) {
  const n = err?.name;
  if (n === 'NotAllowedError') return 'Camera permission denied — allow camera access in the browser and try again.';
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'No matching camera found on this device.';
  if (n === 'NotReadableError') return 'Camera is busy in another app.';
  if (n === 'SecurityError' || (typeof isSecureContext !== 'undefined' && !isSecureContext)) return 'Cameras need HTTPS (or localhost).';
  return err?.message ?? String(err);
}

/** List video inputs (labels appear once permission has been granted). */
export async function listDevices() {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const all = await navigator.mediaDevices.enumerateDevices();
  return all.filter((d) => d.kind === 'videoinput');
}

/** Draw a simulated athlete as a solid mannequin in a gym. */
function drawMannequin(g, W, H, lm) {
  const grd = g.createLinearGradient(0, 0, 0, H);
  grd.addColorStop(0, '#1b2028'); grd.addColorStop(1, '#0d1015');
  g.fillStyle = grd; g.fillRect(0, 0, W, H);
  g.strokeStyle = '#ffffff10'; g.lineWidth = 1;
  for (let x = 0; x < W; x += 48) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H * 0.93); g.stroke(); }
  g.fillStyle = '#2a2f37'; g.fillRect(0, H * 0.93, W, H * 0.07);
  const P = (i) => [lm[i].x * W, lm[i].y * H];
  const limb = (a, b, w, c) => { g.strokeStyle = c; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(...P(a)); g.lineTo(...P(b)); g.stroke(); };
  const skin = '#c9a487'; const shirt = '#30353f'; const shorts = '#1d2129'; const far = '#a6876f';
  limb(24, 26, 26, shorts); limb(26, 28, 20, far); limb(28, 32, 12, '#222');
  limb(12, 14, 15, far); limb(14, 16, 12, far);
  limb(11, 23, 44, shirt); limb(12, 24, 44, shirt);
  limb(23, 25, 28, shorts); limb(25, 27, 21, skin); limb(27, 31, 13, '#111');
  limb(11, 13, 16, skin); limb(13, 15, 13, skin);
  g.fillStyle = skin; g.beginPath(); g.arc(...P(0), H * 0.045, 0, 7); g.fill();
  g.fillStyle = '#111'; g.beginPath(); g.arc(P(0)[0] - 4, P(0)[1] - 8, H * 0.04, Math.PI, 2 * Math.PI); g.fill();
}
