/**
 * RANCH COMMAND — the clearance ceremony.
 *
 * A three-factor entrance — dermal ridge scan, facial geometry, signature —
 * then the vault opens on a cinematic film (Higgsfield, Seedance) into the
 * lab. It is theatre: nothing is captured, stored or sent. The fingerprint
 * pad responds to a press-and-hold, the face is a rendered wireframe (no
 * camera is opened), and the signature never leaves the canvas.
 *
 * Every step stays light on purpose: SVG and CSS transforms only, one small
 * canvas, no WebGL — iPhone Safari keeps its memory for the dashboard.
 *
 * @module ranch-command/gate
 */

import { el, fill } from './dom.js';
import { GATE } from './rafa.js';

const FILM = 'https://d8j0ntlcm91z4.cloudfront.net/user_3D17dPWC57zGXhL3gHkykFe9E5n/hf_20261108_184138_12d6c0f7-1031-414e-bcf1-699b6d9f2154.mp4';
const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}, kids = []) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  for (const k of kids) n.append(k);
  return n;
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/* ----------------------------------------------------------------- sound */

let audio = null;
function tone(freq = 880, ms = 90, type = 'sine', gain = 0.05, at = 0) {
  if (!audio) return;
  const t = audio.currentTime + at;
  const o = audio.createOscillator();
  const g = audio.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + ms / 1000);
  o.connect(g).connect(audio.destination);
  o.start(t);
  o.stop(t + ms / 1000 + 0.02);
}
const chime = () => { tone(660, 120, 'sine', 0.05); tone(990, 160, 'sine', 0.05, 0.1); tone(1320, 260, 'sine', 0.04, 0.22); };
const deny = () => { tone(180, 220, 'square', 0.03); tone(140, 260, 'square', 0.03, 0.18); };

/* ----------------------------------------------------------- fingerprint */

/** Ridge paths: nested broken arcs around a whorl, like a real print. */
function fingerprint() {
  const paths = [];
  for (let i = 0; i < 15; i += 1) {
    const rx = 8 + i * 4.6;
    const ry = 10 + i * 5.6;
    const gap = 0.25 + ((i * 37) % 11) / 30;
    const start = -Math.PI / 2 + gap + (i % 3) * 0.3;
    const end = start + Math.PI * 2 - gap * 2.2;
    const steps = 48;
    let d = '';
    for (let k = 0; k <= steps; k += 1) {
      const a = start + ((end - start) * k) / steps;
      const warp = 1 + 0.06 * Math.sin(a * 3 + i);
      const x = 100 + Math.cos(a) * rx * warp;
      const y = 104 + Math.sin(a) * ry * warp - (Math.sin(a) < 0 ? i * 0.9 : 0);
      d += `${k ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`;
    }
    paths.push([d, i]);
  }
  return s('svg', { viewBox: '0 0 200 210', class: 'fp-svg', 'aria-hidden': 'true' }, [
    s('defs', {}, [s('clipPath', { id: 'fp-clip' }, [s('ellipse', { cx: 100, cy: 104, rx: 72, ry: 92 })])]),
    // A faint full print, and the same ridges lit progressively by the scan.
    s('g', { 'clip-path': 'url(#fp-clip)', class: 'ridges-base' }, paths.map(([d]) => s('path', { d, class: 'ridge-base' }))),
    s('g', { 'clip-path': 'url(#fp-clip)' }, paths.map(([d, i]) => s('path', { d, class: 'ridge', style: `--i:${i}` }))),
  ]);
}

/* ------------------------------------------------------------------ face */

/** A wireframe face: landmark points and a light triangulated mesh. */
function face() {
  const pts = [];
  // Jaw and brow oval.
  for (let k = 0; k < 28; k += 1) {
    const a = (k / 28) * Math.PI * 2;
    pts.push([100 + Math.cos(a) * 62 * (Math.sin(a) > 0 ? 0.86 : 1), 112 + Math.sin(a) * 84]);
  }
  // Eyes.
  for (const cx of [74, 126]) for (let k = 0; k < 8; k += 1) { const a = (k / 8) * Math.PI * 2; pts.push([cx + Math.cos(a) * 13, 98 + Math.sin(a) * 5.5]); }
  // Brows.
  for (const sx of [-1, 1]) for (let k = 0; k < 5; k += 1) pts.push([100 + sx * (14 + k * 8), 80 - Math.sin((k / 4) * Math.PI) * 6]);
  // Nose.
  for (let k = 0; k < 6; k += 1) pts.push([100 + (k > 3 ? (k === 4 ? -10 : 10) : 0), 96 + k * 9 - (k > 3 ? 9 : 0)]);
  // Mouth.
  for (let k = 0; k < 10; k += 1) { const a = (k / 10) * Math.PI * 2; pts.push([100 + Math.cos(a) * 20, 160 + Math.sin(a) * 6]); }
  // Cheeks / forehead interior.
  for (const [x, y] of [[62, 128], [138, 128], [80, 132], [120, 132], [100, 60], [76, 62], [124, 62], [56, 100], [144, 100], [100, 186], [80, 176], [120, 176]]) pts.push([x, y]);

  // Connect each point to its three nearest neighbours.
  const lines = new Set();
  pts.forEach((p, i) => {
    pts.map((q, j) => [j, (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2]).filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]).slice(0, 3)
      .forEach(([j]) => lines.add(i < j ? `${i}-${j}` : `${j}-${i}`));
  });
  const mesh = [...lines].map((key, n) => { const [i, j] = key.split('-').map(Number); return s('line', { x1: pts[i][0], y1: pts[i][1], x2: pts[j][0], y2: pts[j][1], class: 'mesh', style: `--n:${n}` }); });
  const dots = pts.map(([x, y], n) => s('circle', { cx: x, cy: y, r: 1.6, class: 'lm', style: `--n:${n}` }));
  return s('svg', { viewBox: '0 0 200 220', class: 'face-svg', 'aria-hidden': 'true' }, [
    s('defs', {}, [s('radialGradient', { id: 'face-fill', cx: '50%', cy: '45%', r: '60%' }, [s('stop', { offset: '0%', 'stop-color': 'rgba(78,227,255,0.16)' }), s('stop', { offset: '100%', 'stop-color': 'rgba(78,227,255,0)' })])]),
    s('path', { d: 'M100 22 C150 22 166 62 164 104 C162 150 140 196 100 202 C60 196 38 150 36 104 C34 62 50 22 100 22 Z', class: 'face-outline', fill: 'url(#face-fill)' }),
    s('g', { class: 'mesh-g' }, mesh),
    s('g', { class: 'lm-g' }, dots),
    s('rect', { x: 20, y: 0, width: 160, height: 3, class: 'face-laser' }),
  ]);
}

/* ------------------------------------------------------------- ceremony */

/**
 * Run the clearance ceremony.
 *
 * @param {object} opts
 * @param {HTMLElement} opts.root The gate element.
 * @param {object} opts.rafa The voice.
 * @param {(withSound: boolean) => void} opts.onGranted Called when the lab should open.
 */
export function runGate({ root, rafa, onGranted }) {
  let sound = true;
  const stageEl = el('div.cg-stage');
  const steps = ['Dermal ridge', 'Facial geometry', 'Signature'];
  const rail = el('ol.cg-rail', {}, steps.map((t, i) => el('li', { 'data-i': i }, [el('span', { text: `0${i + 1}` }), t])));
  const status = el('p.cg-status', { 'aria-live': 'polite' });
  const say = (line) => { if (sound) rafa.say(line); else rafa.onCaption?.(line.en); };
  const mark = (i, state) => { const li = rail.children[i]; if (li) li.dataset.state = state; };

  fill(root, [
    el('div.cg-bg', { 'aria-hidden': 'true' }, [el('div.cg-grid'), el('div.cg-vignette'), el('div.cg-rings', {}, [el('i'), el('i'), el('i')])]),
    el('div.cg-frame', {}, [
      el('header.cg-head', {}, [
        el('p.cg-class', {}, [el('span.cg-led'), 'Restricted facility · Principals only']),
        el('p.cg-code.mono', { text: 'RC-NODE 01 · AES-256 · ZERO-TRUST' }),
      ]),
      stageEl,
      el('footer.cg-foot', {}, [rail, status, el('p.cg-fine', { text: 'Ceremonial clearance: no fingerprint, face or signature is captured, stored or sent.' })]),
    ]),
  ]);

  /* 0 — standby */
  fill(stageEl, [
    el('div.cg-standby', {}, [
      el('div.cg-emblem', { 'aria-hidden': 'true' }, [el('i'), el('i'), el('i'), el('b')]),
      el('p.kicker', { text: 'Classified · clearance required' }),
      el('h1.holo.cg-title', { text: 'RANCH COMMAND' }),
      el('p.cg-sub', { text: 'Intelligence Network' }),
      el('button.btn.gold.xl', { id: 'enter', type: 'button', onclick: () => begin(true) }, ['Request Clearance']),
      el('button.btn.ghost', { id: 'enter-quiet', type: 'button', onclick: () => begin(false) }, ['Request silently']),
    ]),
  ]);

  async function begin(withSound) {
    sound = withSound;
    try { audio = withSound ? new (window.AudioContext || window.webkitAudioContext)() : null; } catch { audio = null; }
    rafa.unlock?.();
    if (withSound) rafa.say(GATE.begin);
    root.classList.add('armed');
    tone(520, 80);
    stepFinger();
  }

  /* 1 — fingerprint */
  function stepFinger() {
    mark(0, 'active');
    status.textContent = 'Place and hold your finger on the sensor';
    const svgNode = fingerprint();
    const pct = el('b.fp-pct', { text: '00%' });
    const pad = el('button.fp-pad', { type: 'button', 'aria-label': 'Fingerprint sensor: press and hold' }, [svgNode, el('span.fp-scan'), el('span.fp-glow')]);
    fill(stageEl, [el('div.cg-step', {}, [
      el('p.cg-step-k', { text: 'Factor 01 · Dermal ridge topology' }),
      pad,
      el('p.mono.cg-read', {}, ['MATCH ', pct]),
      el('p.cg-hint', { text: 'Press and hold' }),
    ])]);
    let p = 0;
    let holding = false;
    let raf = 0;
    let done = false;
    let last = 0;
    const tick = (t) => {
      const dt = last ? (t - last) / 1000 : 0;
      last = t;
      p = holding ? Math.min(1, p + dt / 1.7) : Math.max(0, p - dt * 1.6);
      pad.style.setProperty('--p', p.toFixed(3));
      pct.textContent = `${String(Math.round(p * 99.97 * 100) / 100).padStart(2, '0')}%`;
      if (holding && Math.floor(p * 12) !== Math.floor((p - dt / 1.7) * 12)) tone(1200 + p * 600, 30, 'sine', 0.02);
      if (p >= 1 && !done) { done = true; finish(); return; }
      if (holding || p > 0) raf = requestAnimationFrame(tick); else { last = 0; raf = 0; }
    };
    const down = (e) => { e.preventDefault(); if (done) return; holding = true; pad.classList.add('hold'); if (!raf) { last = 0; raf = requestAnimationFrame(tick); } };
    const up = () => { holding = false; pad.classList.remove('hold'); };
    // Touch and mouse separately, not pointer events: a long press on iOS
    // fires pointercancel as Safari considers a callout, which would reset
    // the scan halfway. Cancelling touchstart keeps the press ours.
    pad.addEventListener('touchstart', down, { passive: false });
    pad.addEventListener('touchend', up);
    pad.addEventListener('touchcancel', up);
    pad.addEventListener('mousedown', down);
    addEventListener('mouseup', up);
    pad.addEventListener('contextmenu', (e) => e.preventDefault());
    pad.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) down(e); });
    pad.addEventListener('keyup', up);
    async function finish() {
      pad.classList.add('ok');
      pct.textContent = '99.97%';
      status.textContent = 'Dermal ridge match confirmed · 42 minutiae';
      chime();
      mark(0, 'done');
      say(GATE.finger);
      await wait(1500);
      stepFace();
    }
  }

  /* 2 — face */
  async function stepFace() {
    mark(1, 'active');
    status.textContent = 'Hold steady · mapping facial geometry';
    const count = el('b', { text: '000' });
    const box = el('div.face-box', {}, [face(), el('span.fb.tl'), el('span.fb.tr'), el('span.fb.bl'), el('span.fb.br')]);
    fill(stageEl, [el('div.cg-step', {}, [
      el('p.cg-step-k', { text: 'Factor 02 · Facial geometry & liveness' }),
      box,
      el('p.mono.cg-read', {}, ['LANDMARKS ', count, ' / 468']),
    ])]);
    requestAnimationFrame(() => box.classList.add('scan'));
    const t0 = performance.now();
    await new Promise((resolve) => {
      const step = (t) => {
        const k = Math.min(1, (t - t0) / 3200);
        count.textContent = String(Math.round(k * 468)).padStart(3, '0');
        if (k < 1) requestAnimationFrame(step); else resolve();
      };
      requestAnimationFrame(step);
    });
    box.classList.add('ok');
    status.textContent = 'Facial geometry verified · liveness confirmed';
    chime();
    mark(1, 'done');
    say(GATE.face);
    await wait(1700);
    stepSign();
  }

  /* 3 — signature */
  function stepSign() {
    mark(2, 'active');
    status.textContent = 'Sign within the field to authenticate';
    const canvas = el('canvas.sig-canvas', { 'aria-label': 'Signature pad' });
    const pad = el('div.sig-pad', {}, [el('span.sig-x', { text: '✕' }), el('span.sig-line'), canvas]);
    const go = el('button.btn.gold', { type: 'button' }, ['Authenticate signature']);
    fill(stageEl, [el('div.cg-step.wide', {}, [
      el('p.cg-step-k', { text: 'Factor 03 · Signature vector' }),
      pad,
      el('div.row.center', {}, [el('button.btn.ghost', { type: 'button', onclick: () => clear() }, ['Clear']), go]),
    ])]);
    const ratio = Math.min(2, window.devicePixelRatio || 1);
    const g = canvas.getContext('2d');
    const size = () => {
      const r = canvas.getBoundingClientRect();
      canvas.width = Math.round(r.width * ratio);
      canvas.height = Math.round(r.height * ratio);
      g.setTransform(ratio, 0, 0, ratio, 0, 0);
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.strokeStyle = '#ffd76b';
      g.shadowColor = 'rgba(255,207,74,0.8)';
      g.shadowBlur = 8;
    };
    requestAnimationFrame(size);
    let drawing = false;
    let prev = null;
    let length = 0;
    let box = null;
    const at = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, t: performance.now() }; };
    canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); canvas.setPointerCapture?.(e.pointerId); drawing = true; prev = at(e); });
    canvas.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      const p = at(e);
      const d = Math.hypot(p.x - prev.x, p.y - prev.y);
      const v = d / Math.max(1, p.t - prev.t);
      g.lineWidth = Math.max(1.4, 3.6 - v * 1.6);
      g.beginPath(); g.moveTo(prev.x, prev.y); g.lineTo(p.x, p.y); g.stroke();
      length += d;
      box = box ? { x0: Math.min(box.x0, p.x), x1: Math.max(box.x1, p.x), w: p.w } : { x0: p.x, x1: p.x, w: p.w };
      prev = p;
    });
    for (const ev of ['pointerup', 'pointercancel']) canvas.addEventListener(ev, () => { drawing = false; });
    function clear() { g.clearRect(0, 0, canvas.width, canvas.height); length = 0; box = null; pad.classList.remove('ok', 'bad'); }
    go.addEventListener('click', async () => {
      const wideEnough = box && (box.x1 - box.x0) > box.w * 0.28;
      if (length < 180 || !wideEnough) {
        pad.classList.remove('bad'); void pad.offsetWidth; pad.classList.add('bad');
        status.textContent = 'Insufficient signature vector · please sign again';
        deny();
        say(GATE.doodle);
        return;
      }
      go.disabled = true;
      pad.classList.remove('bad');
      pad.classList.add('ok');
      status.textContent = 'Signature vector authenticated';
      chime();
      mark(2, 'done');
      await wait(900);
      granted();
    });
  }

  /* 4 — granted: the vault opens */
  async function granted() {
    status.textContent = 'All factors verified · clearance: executive';
    root.classList.add('granted');
    const film = el('video.cg-film', { playsinline: true, muted: true, preload: 'auto' });
    film.muted = true;
    film.setAttribute('playsinline', '');
    const overlay = el('div.cg-granted', {}, [
      el('p.kicker', { text: 'Identity confirmed · 3 of 3 factors' }),
      el('h2.holo', { text: 'ACCESS GRANTED' }),
      el('p.cg-sub', { text: 'Clearance level · Executive' }),
    ]);
    const skip = el('button.cg-skip', { type: 'button' }, ['Skip ›']);
    root.append(el('div.cg-cinema', {}, [film, el('div.cg-cinema-shade'), overlay, skip]));
    say(GATE.granted);
    tone(110, 900, 'sawtooth', 0.025);
    tone(55, 1400, 'sine', 0.06, 0.1);
    let finished = false;
    const end = () => {
      if (finished) return;
      finished = true;
      root.classList.add('gone');
      onGranted(sound);
      setTimeout(() => { film.removeAttribute('src'); film.load(); root.replaceChildren(); }, 1200);
    };
    skip.addEventListener('click', end);
    film.addEventListener('ended', end);
    film.addEventListener('error', () => setTimeout(end, 2600));
    setTimeout(end, 9000);
    if (FILM.includes('hf_20261108_184138_12d6c0f7-1031-414e-bcf1-699b6d9f2154.mp4')) { setTimeout(end, 2600); return; }
    film.src = FILM;
    try { await film.play(); } catch { setTimeout(end, 2600); }
  }
}
