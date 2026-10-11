/**
 * The AR lab: a palm-sized Colin, or any hologram from the chamber, on your
 * table.
 *
 * Two paths, chosen by what the device can do:
 *
 * - **WebXR (Android Chrome with ARCore):** a real `immersive-ar` session with
 *   hit-testing. A gold reticle finds surfaces; tap to place. It stays put as
 *   you walk round it.
 * - **Camera + gyro (iPhone, desktop, everything else):** the rear camera fills
 *   the screen and the hologram is anchored in front of you using the motion
 *   sensors, so it holds still as you turn (rotation only — walking round it
 *   needs WebXR). Drag to spin it, pinch or slide to scale.
 *
 * Both can save a photo of the hologram over the camera. Nothing is uploaded.
 *
 * @module astra/showcase/arlab
 */

import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EXTRA_HOLOGRAMS } from './holograms.js';
import { WING_HOLOGRAMS } from './holograms2.js';
import { COURT_HOLOGRAMS } from './holograms3.js';
import { HOLOGRAMS } from './room.js';

export const AR_SUBJECTS = [
  { id: 'chamber', label: 'Colin', scale: 0.13 },
  { id: 'arena', label: 'Judge Colin', scale: 0.12 },
  { id: 'translate', label: 'Interpreter Colin', scale: 0.12 },
  { id: 'genome', label: 'DNA', scale: 0.16 },
  { id: 'receptor', label: 'GLP-1 receptor', scale: 0.16 },
  { id: 'myth', label: 'Myth glass', scale: 0.2 },
  { id: 'map', label: 'Compound map', scale: 0.18 },
  { id: 'globe', label: 'Regulatory globe', scale: 0.18 },
];

const el = (tag, attrs = {}, kids = []) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'text') n.textContent = v;
    else if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const kid of [].concat(kids)) if (kid) n.append(kid);
  return n;
};

/** Device orientation → camera quaternion (the classic W3C mapping). */
const zee = new THREE.Vector3(0, 0, 1);
const euler = new THREE.Euler();
const q0 = new THREE.Quaternion();
const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
function orientationQuaternion(q, alpha, beta, gamma, orient) {
  euler.set(beta, alpha, -gamma, 'YXZ');
  q.setFromEuler(euler);
  q.multiply(q1);
  q.multiply(q0.setFromAxisAngle(zee, -orient));
}

export class ARLab {
  /**
   * @param {{ state: object, onSay?: Function }} options Shared state (for Colin's voice level) and a speaker.
   */
  constructor({ state, onSay }) {
    this.state = state;
    this.onSay = onSay || (() => {});
    this.root = null;
    this.subject = AR_SUBJECTS[0];
  }

  async open() {
    if (this.root) return;
    this.xrSupported = Boolean(await navigator.xr?.isSessionSupported?.('immersive-ar').catch(() => false));
    this.build();
    this.onSay();
    if (!this.xrSupported) this.startCamera();
  }

  build() {
    this.video = el('video', { class: 'ar-video', playsinline: '', muted: '', autoplay: '' });
    this.video.muted = true;
    this.canvas = el('canvas', { class: 'ar-canvas' });
    this.hint = el('p', { class: 'ar-hint', text: this.xrSupported
      ? 'This device supports full AR. Tap “Place on a surface”, point at a table, and tap when the gold ring appears.'
      : 'Camera mode: the hologram holds still as you turn your phone. Drag to spin, slide to resize. (Walking round it needs WebXR — Android Chrome.)' });
    const chips = el('div', { class: 'ar-chips' }, AR_SUBJECTS.map((s) => el('button', {
      class: `chip${s.id === this.subject.id ? ' on' : ''}`, type: 'button', text: s.label,
      onclick: (e) => { this.subject = s; chips.querySelectorAll('.chip').forEach((c) => c.classList.remove('on')); e.target.classList.add('on'); this.setSubject(); },
    })));
    this.scaleInput = el('input', { type: 'range', min: '0.4', max: '2.5', step: '0.05', value: '1', 'aria-label': 'Hologram size', oninput: () => this.applyScale() });
    const actions = el('div', { class: 'ar-actions' }, [
      this.xrSupported ? el('button', { class: 'btn-small', type: 'button', text: '◎ Place on a surface', onclick: () => this.startXR() }) : null,
      el('button', { class: 'chip', type: 'button', text: '⟲ Re-centre', onclick: () => this.recentre() }),
      el('button', { class: 'chip', type: 'button', text: '📷 Save photo', onclick: () => this.capture() }),
      el('button', { class: 'chip', type: 'button', text: '✕ Close', onclick: () => this.close() }),
    ]);
    this.panel = el('div', { class: 'ar-panel' }, [this.hint, chips, el('label', { class: 'slider' }, [el('span', { text: 'Size' }), this.scaleInput]), actions]);
    this.root = el('div', { class: 'ar-lab', role: 'dialog', 'aria-label': 'AR lab' }, [this.video, this.canvas, this.panel]);
    document.body.append(this.root);
    document.body.classList.add('ar-open');

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, alpha: true, antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setClearColor(0x000000, 0);
    this.scene = new THREE.Scene();
    this.envMap = new THREE.PMREMGenerator(this.renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x223344, 1.2));
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.01, 50);
    this.anchor = new THREE.Group();
    this.anchor.position.set(0, -0.3, -1.1);
    this.scene.add(this.anchor);
    this.spin = new THREE.Group();
    this.anchor.add(this.spin);
    this.setSubject();
    this.clock = new THREE.Clock();
    this.onResize = () => {
      this.renderer.setSize(innerWidth, innerHeight, false);
      this.camera.aspect = innerWidth / innerHeight;
      this.camera.updateProjectionMatrix();
    };
    addEventListener('resize', this.onResize);
    this.bindGestures();
    this.orientation = null;
    this.onOrient = (e) => { if (e.alpha != null) this.orientation = e; };
    addEventListener('deviceorientation', this.onOrient);
    this.renderer.setAnimationLoop((time, frame) => this.frame(frame));
  }

  setSubject() {
    if (this.holo) { this.spin.remove(this.holo.group); }
    const make = COURT_HOLOGRAMS[this.subject.id] || WING_HOLOGRAMS[this.subject.id] || EXTRA_HOLOGRAMS[this.subject.id] || HOLOGRAMS[this.subject.id];
    this.holo = make(this.envMap);
    this.spin.add(this.holo.group);
    this.applyScale();
  }

  applyScale() {
    const s = this.subject.scale * Number(this.scaleInput?.value || 1);
    this.spin.scale.setScalar(s);
  }

  bindGestures() {
    let last = null;
    let pinch = null;
    this.canvas.addEventListener('pointerdown', (e) => { last = e.clientX; this.canvas.setPointerCapture(e.pointerId); });
    this.canvas.addEventListener('pointermove', (e) => {
      if (last === null) return;
      this.spin.rotation.y += (e.clientX - last) * 0.01;
      last = e.clientX;
    });
    this.canvas.addEventListener('pointerup', () => { last = null; });
    this.canvas.addEventListener('touchmove', (e) => {
      if (e.touches.length !== 2) { pinch = null; return; }
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      if (pinch) this.scaleInput.value = String(Math.min(2.5, Math.max(0.4, Number(this.scaleInput.value) * (d / pinch))));
      pinch = d;
      this.applyScale();
    }, { passive: true });
  }

  async startCamera() {
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
      this.video.srcObject = this.stream;
      await this.video.play().catch(() => {});
    } catch (error) {
      this.hint.textContent = 'Camera unavailable or permission declined — the hologram is shown on its own. You can still spin, resize and save it.';
      this.root.classList.add('no-camera');
    }
    // iOS needs a permission tap for motion; the button that opened the lab was it.
    const DOE = window.DeviceOrientationEvent;
    if (DOE && typeof DOE.requestPermission === 'function') DOE.requestPermission().catch(() => {});
  }

  recentre() {
    // Put the hologram straight ahead of wherever the camera now points.
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    forward.y = 0;
    if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
    forward.normalize().multiplyScalar(1.1);
    this.anchor.position.set(forward.x, -0.3, forward.z);
    this.calibrated = true;
  }

  async startXR() {
    if (this.session) return;
    try {
      const session = await navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['hit-test'], optionalFeatures: ['dom-overlay'], domOverlay: { root: this.root } });
      this.session = session;
      this.stopCamera();
      this.renderer.xr.enabled = true;
      this.renderer.xr.setReferenceSpaceType('local');
      await this.renderer.xr.setSession(session);
      const viewer = await session.requestReferenceSpace('viewer');
      this.hitSource = await session.requestHitTestSource({ space: viewer });
      this.reticle = new THREE.Mesh(new THREE.RingGeometry(0.06, 0.075, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf0b75a }));
      this.reticle.matrixAutoUpdate = false;
      this.reticle.visible = false;
      this.scene.add(this.reticle);
      this.anchor.visible = false;
      session.addEventListener('select', () => {
        if (!this.reticle.visible) return;
        this.anchor.position.setFromMatrixPosition(this.reticle.matrix);
        this.anchor.position.y += 0.12 * Number(this.scaleInput.value) * (this.subject.id === 'chamber' ? 2.5 : 1.2);
        this.anchor.visible = true;
      });
      session.addEventListener('end', () => { this.session = null; this.hitSource = null; this.renderer.xr.enabled = false; this.anchor.visible = true; this.startCamera(); });
      this.hint.textContent = 'Point at a table or the floor. Tap when the gold ring appears.';
    } catch (error) {
      this.hint.textContent = 'Full AR could not start on this device — staying in camera mode.';
    }
  }

  frame(xrFrame) {
    const t = this.clock.getElapsedTime();
    if (xrFrame && this.hitSource) {
      const results = xrFrame.getHitTestResults(this.hitSource);
      const ref = this.renderer.xr.getReferenceSpace();
      if (results.length) {
        const pose = results[0].getPose(ref);
        this.reticle.visible = true;
        this.reticle.matrix.fromArray(pose.transform.matrix);
      } else {
        this.reticle.visible = false;
      }
    } else if (this.orientation) {
      const o = this.orientation;
      const orient = THREE.MathUtils.degToRad((screen.orientation && screen.orientation.angle) || window.orientation || 0);
      orientationQuaternion(this.camera.quaternion, THREE.MathUtils.degToRad(o.alpha), THREE.MathUtils.degToRad(o.beta), THREE.MathUtils.degToRad(o.gamma), orient);
      if (!this.calibrated) this.recentre();
    }
    this.holo.update(t, { ...this.state, lookX: 0, lookY: 0, speed: 1 });
    this.renderer.render(this.scene, this.camera);
  }

  capture() {
    const w = this.canvas.width;
    const h = this.canvas.height;
    const out = document.createElement('canvas');
    out.width = w;
    out.height = h;
    const ctx = out.getContext('2d');
    ctx.fillStyle = '#020203';
    ctx.fillRect(0, 0, w, h);
    if (this.video.videoWidth) {
      const scale = Math.max(w / this.video.videoWidth, h / this.video.videoHeight);
      const dw = this.video.videoWidth * scale;
      const dh = this.video.videoHeight * scale;
      ctx.drawImage(this.video, (w - dw) / 2, (h - dh) / 2, dw, dh);
    }
    ctx.drawImage(this.canvas, 0, 0);
    ctx.font = `${Math.round(h * 0.022)}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = 'rgba(240,183,90,0.9)';
    ctx.fillText('COLIN Biomedical Technologies · educational hologram', 16, h - 16);
    const link = document.createElement('a');
    link.download = `colin-ar-${Date.now()}.png`;
    link.href = out.toDataURL('image/png');
    link.click();
  }

  stopCamera() {
    for (const track of this.stream?.getTracks() || []) track.stop();
    this.stream = null;
  }

  close() {
    this.session?.end().catch(() => {});
    this.stopCamera();
    this.renderer?.setAnimationLoop(null);
    this.renderer?.dispose();
    removeEventListener('resize', this.onResize);
    removeEventListener('deviceorientation', this.onOrient);
    this.root?.remove();
    this.root = null;
    this.calibrated = false;
    document.body.classList.remove('ar-open');
  }
}
