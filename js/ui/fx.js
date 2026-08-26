/* ══════════════════════════════════════════════════════════════
   PRISM · fx — the holography

   Two canvases: a fixed volumetric field behind everything, and a
   prism/dispersion layer behind the facet grid. Plus pointer tilt,
   specular tracking, and optional WebAudio blips.

   Everything here is decorative and self-disabling: reduced motion,
   a hidden tab, or a motion:off preference stops the loops dead.
   ══════════════════════════════════════════════════════════════ */

P.fx = (function () {
  'use strict';

  const U = P.util;

  let running = false;
  let raf = null;
  const pointer = { x: 0.5, y: 0.4, tx: 0.5, ty: 0.4 };

  const enabled = () => P.store.get().prefs.motion && !U.reduceMotion();

  /* ══════════════════════════════════════════════════════════
     Field — drifting light shards behind the whole page
     ══════════════════════════════════════════════════════════ */

  const field = { cv: null, ctx: null, w: 0, h: 0, dpr: 1, shards: [], motes: [] };

  function sizeField() {
    const c = field.cv;
    if (!c) return;
    field.dpr = Math.min(2, window.devicePixelRatio || 1);
    field.w = c.clientWidth;
    field.h = c.clientHeight;
    c.width = Math.floor(field.w * field.dpr);
    c.height = Math.floor(field.h * field.dpr);
    field.ctx.setTransform(field.dpr, 0, 0, field.dpr, 0, 0);
  }

  function seedField() {
    const r = U.rng('prism-field');
    const count = window.innerWidth < 700 ? 5 : 9;

    field.shards = Array.from({ length: count }, () => ({
      x: r(), y: r(),
      len: 0.16 + r() * 0.42,
      ang: -0.9 + r() * 1.8,
      hue: [190, 205, 265, 300, 315][Math.floor(r() * 5)],
      speed: 0.00004 + r() * 0.00011,
      width: 40 + r() * 130,
      alpha: 0.05 + r() * 0.09,
      phase: r() * Math.PI * 2
    }));

    field.motes = Array.from({ length: window.innerWidth < 700 ? 22 : 46 }, () => ({
      x: r(), y: r(),
      vy: -0.00004 - r() * 0.00012,
      vx: (r() - 0.5) * 0.00006,
      r: 0.4 + r() * 1.5,
      hue: 180 + r() * 140,
      alpha: 0.14 + r() * 0.4,
      tw: r() * Math.PI * 2
    }));
  }

  function drawField(t) {
    const { ctx, w, h } = field;
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);

    // Parallax: the field leans away from the pointer very slightly.
    const px = (pointer.x - 0.5) * 26;
    const py = (pointer.y - 0.5) * 18;

    ctx.globalCompositeOperation = 'lighter';

    // Light shards — long soft diagonal beams.
    field.shards.forEach(s => {
      const drift = (t * s.speed) % 1.4 - 0.2;
      const x = (s.x + drift) * w - px;
      const y = s.y * h + Math.sin(t * 0.0002 + s.phase) * 22 - py;
      const dx = Math.cos(s.ang) * s.len * w;
      const dy = Math.sin(s.ang) * s.len * h;

      const g = ctx.createLinearGradient(x, y, x + dx, y + dy);
      const a = s.alpha * (0.6 + 0.4 * Math.sin(t * 0.0004 + s.phase));
      g.addColorStop(0,   'hsla(' + s.hue + ', 100%, 68%, 0)');
      g.addColorStop(0.5, 'hsla(' + s.hue + ', 100%, 68%, ' + a.toFixed(3) + ')');
      g.addColorStop(1,   'hsla(' + s.hue + ', 100%, 68%, 0)');

      ctx.strokeStyle = g;
      ctx.lineWidth = s.width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + dx, y + dy);
      ctx.stroke();
    });

    // Motes — slow rising dust, twinkling.
    field.motes.forEach(m => {
      m.x += m.vx; m.y += m.vy;
      if (m.y < -0.05) { m.y = 1.05; m.x = Math.random(); }
      if (m.x < -0.05) m.x = 1.05;
      if (m.x > 1.05)  m.x = -0.05;

      const tw = 0.55 + 0.45 * Math.sin(t * 0.0016 + m.tw);
      ctx.fillStyle = 'hsla(' + m.hue + ', 100%, 76%, ' + (m.alpha * tw).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(m.x * w - px * 0.4, m.y * h - py * 0.4, m.r, 0, Math.PI * 2);
      ctx.fill();
    });

    ctx.globalCompositeOperation = 'source-over';
  }

  /* ══════════════════════════════════════════════════════════
     Prism — the beam splitting behind the facet grid
     ══════════════════════════════════════════════════════════ */

  const prism = { cv: null, ctx: null, w: 0, h: 0, dpr: 1, hues: [] };

  function sizePrism() {
    const c = prism.cv;
    if (!c) return;
    prism.dpr = Math.min(2, window.devicePixelRatio || 1);
    prism.w = c.clientWidth;
    prism.h = c.clientHeight;
    c.width = Math.floor(prism.w * prism.dpr);
    c.height = Math.floor(prism.h * prism.dpr);
    prism.ctx.setTransform(prism.dpr, 0, 0, prism.dpr, 0, 0);
  }

  /** Tell the prism which hues to disperse — the unlocked agents. */
  function setSpectrum(hues) { prism.hues = hues.slice(); }

  function drawPrism(t) {
    const { ctx, w, h } = prism;
    if (!ctx || !w) return;
    ctx.clearRect(0, 0, w, h);
    if (!prism.hues.length) return;

    const ox = w * 0.5, oy = -h * 0.08;   // apex just above the grid
    ctx.globalCompositeOperation = 'lighter';

    // Incoming white beam.
    const beam = ctx.createLinearGradient(ox, oy - 60, ox, oy + 30);
    beam.addColorStop(0, 'hsla(200, 100%, 90%, 0)');
    beam.addColorStop(1, 'hsla(200, 100%, 90%, ' + (0.16 + 0.06 * Math.sin(t * 0.001)).toFixed(3) + ')');
    ctx.strokeStyle = beam;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ox, oy - 60);
    ctx.lineTo(ox, oy + 24);
    ctx.stroke();

    // Dispersion fan — one ray per unlocked agent.
    const n = prism.hues.length;
    const spread = Math.PI * 0.78;
    const start = Math.PI / 2 - spread / 2;

    prism.hues.forEach((hue, idx) => {
      const frac = n === 1 ? 0.5 : idx / (n - 1);
      const ang = start + spread * frac + Math.sin(t * 0.0003 + idx) * 0.012;
      const len = h * 1.25;
      const x2 = ox + Math.cos(ang) * len;
      const y2 = oy + Math.sin(ang) * len;

      const pulse = 0.5 + 0.5 * Math.sin(t * 0.0009 + idx * 0.7);
      const g = ctx.createLinearGradient(ox, oy, x2, y2);
      g.addColorStop(0,    'hsla(' + hue + ', 100%, 78%, ' + (0.34 * (0.6 + pulse * 0.4)).toFixed(3) + ')');
      g.addColorStop(0.55, 'hsla(' + hue + ', 100%, 68%, ' + (0.13 * (0.6 + pulse * 0.4)).toFixed(3) + ')');
      g.addColorStop(1,    'hsla(' + hue + ', 100%, 60%, 0)');

      // Ray thickness has to scale with the canvas or a phone gets one
      // fat slab instead of a fan.
      const wide = Math.max(9, Math.min(30, w / n / 2.6));
      ctx.strokeStyle = g;
      ctx.lineWidth = wide + pulse * (wide * 0.35);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(ox, oy);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    });

    ctx.globalCompositeOperation = 'source-over';
  }

  /* ══════════════════════════════════════════════════════════
     Loop
     ══════════════════════════════════════════════════════════ */

  function frame(t) {
    // Ease the pointer so parallax glides instead of snapping.
    pointer.x += (pointer.tx - pointer.x) * 0.06;
    pointer.y += (pointer.ty - pointer.y) * 0.06;

    drawField(t);
    drawPrism(t);
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running || !enabled()) return;
    running = true;
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    running = false;
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  }

  function refresh() {
    if (enabled()) { sizeField(); sizePrism(); start(); }
    else {
      stop();
      if (field.ctx) field.ctx.clearRect(0, 0, field.w, field.h);
      if (prism.ctx) prism.ctx.clearRect(0, 0, prism.w, prism.h);
    }
  }

  /* ══════════════════════════════════════════════════════════
     Pointer: parallax, tilt, specular
     ══════════════════════════════════════════════════════════ */

  const onPointer = U.throttle(e => {
    pointer.tx = e.clientX / window.innerWidth;
    pointer.ty = e.clientY / window.innerHeight;
  }, 32);

  /** Give a card 3D tilt + a sheen that tracks the cursor. */
  function bindTilt(node, strength) {
    const s = strength === undefined ? 7 : strength;

    node.addEventListener('pointermove', e => {
      if (!enabled()) return;
      const r = node.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width;
      const py = (e.clientY - r.top) / r.height;

      node.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
      node.style.setProperty('--my', (py * 100).toFixed(1) + '%');

      node.classList.add('tilt--active');
      node.style.transform =
        'perspective(900px) rotateX(' + ((0.5 - py) * s).toFixed(2) + 'deg) ' +
        'rotateY(' + ((px - 0.5) * s).toFixed(2) + 'deg) translateZ(0)';
    });

    node.addEventListener('pointerleave', () => {
      node.classList.remove('tilt--active');
      node.style.transform = '';
    });

    node.classList.add('tilt');
    return node;
  }

  /* ══════════════════════════════════════════════════════════
     Sound — tiny synthesised blips, off by default
     ══════════════════════════════════════════════════════════ */

  let actx = null;

  function tone(freq, dur, type, gain) {
    if (!P.store.get().prefs.sound) return;
    try {
      if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();

      const osc = actx.createOscillator();
      const amp = actx.createGain();
      osc.type = type || 'sine';
      osc.frequency.setValueAtTime(freq, actx.currentTime);

      const peak = gain === undefined ? 0.05 : gain;
      amp.gain.setValueAtTime(0.0001, actx.currentTime);
      amp.gain.exponentialRampToValueAtTime(peak, actx.currentTime + 0.012);
      amp.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);

      osc.connect(amp).connect(actx.destination);
      osc.start();
      osc.stop(actx.currentTime + dur + 0.02);
    } catch (_) { /* audio is a nicety, never a failure */ }
  }

  const sfx = {
    tap:     () => tone(680, 0.06, 'sine', 0.035),
    open:    () => { tone(420, 0.09, 'triangle', 0.04); setTimeout(() => tone(640, 0.10, 'triangle', 0.03), 55); },
    run:     () => { tone(300, 0.12, 'sawtooth', 0.022); setTimeout(() => tone(600, 0.14, 'sine', 0.03), 70); },
    done:    () => { [523, 659, 784].forEach((f, i) => setTimeout(() => tone(f, 0.16, 'sine', 0.036), i * 70)); },
    reward:  () => { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 0.22, 'triangle', 0.04), i * 85)); },
    error:   () => { tone(180, 0.18, 'square', 0.03); }
  };

  /* ══════════════════════════════════════════════════════════
     Boot
     ══════════════════════════════════════════════════════════ */

  function init() {
    field.cv = document.getElementById('fx-field');
    if (field.cv) { field.ctx = field.cv.getContext('2d'); sizeField(); seedField(); }

    prism.cv = document.getElementById('fx-prism');
    if (prism.cv) { prism.ctx = prism.cv.getContext('2d'); sizePrism(); }

    window.addEventListener('resize', U.throttle(() => { sizeField(); sizePrism(); }, 180));
    window.addEventListener('pointermove', onPointer, { passive: true });

    // Do not burn a phone battery animating a tab nobody is looking at.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) stop(); else refresh();
    });

    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq.addEventListener) mq.addEventListener('change', refresh);

    refresh();
  }

  return { init, start, stop, refresh, bindTilt, setSpectrum, sizePrism, sfx, tone, enabled };
})();
