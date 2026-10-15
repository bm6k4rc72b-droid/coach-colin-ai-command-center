/**
 * The classified station: a warning, a signature, a thumbprint, and a vault
 * door that unlocks into the Black Lab.
 *
 * The signature and the print are theatre, and say so in the small print:
 * the strokes are hashed on the device only to print a "reference" on
 * screen, the print is drawn, not read, and nothing is stored or sent.
 *
 * @module astra/showcase/vault
 */

import { el, fill } from './cards.js';
import { IDENTITY } from './classified.js';
import { line } from './colin.js';
import { alarm, beep, clunk, creak, hiss, swing } from './sfx.js';

/** FNV-1a over the rounded stroke points: a stable, meaningless reference. */
export function strokeHash(points) {
  let h = 0x811c9dc5;
  for (const [x, y] of points) {
    for (const v of [Math.round(x), Math.round(y)]) {
      h ^= v & 0xff;
      h = Math.imul(h, 0x01000193) >>> 0;
      h ^= (v >> 8) & 0xff;
      h = Math.imul(h, 0x01000193) >>> 0;
    }
  }
  return h.toString(16).toUpperCase().padStart(8, '0');
}

/** Total ink: the summed length of every stroke segment. */
export function inkLength(strokes) {
  let total = 0;
  for (const s of strokes) for (let i = 1; i < s.length; i += 1) total += Math.hypot(s[i][0] - s[i - 1][0], s[i][1] - s[i - 1][1]);
  return total;
}

/** A signature counts if there is enough ink spread wide enough to be one. */
export function signatureValid(strokes, width) {
  const all = strokes.flat();
  if (all.length < 8) return false;
  const xs = all.map((p) => p[0]);
  return inkLength(strokes) > Math.max(160, width * 0.6) && Math.max(...xs) - Math.min(...xs) > width * 0.25;
}

/* ------------------------------------------------------- signature pad */

function signaturePad(onChange) {
  const canvas = el('canvas', { class: 'sig-pad', 'aria-label': 'Signature pad: sign with your finger or mouse' });
  const strokes = [];
  let drawing = null;
  const ctx = canvas.getContext('2d');
  const size = () => {
    const r = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, r.width * dpr);
    canvas.height = Math.max(1, r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    redraw();
  };
  const redraw = () => {
    const r = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, r.width, r.height);
    ctx.strokeStyle = 'rgba(240,183,90,0.25)';
    ctx.setLineDash([4, 6]);
    ctx.beginPath(); ctx.moveTo(12, r.height - 22); ctx.lineTo(r.width - 12, r.height - 22); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(240,183,90,0.45)';
    ctx.font = '600 11px Inter, system-ui, sans-serif';
    ctx.fillText('✕  SIGN HERE', 12, r.height - 8);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#ffd998';
    ctx.shadowColor = 'rgba(240,183,90,0.9)';
    ctx.shadowBlur = 8;
    for (const s of strokes) {
      ctx.beginPath();
      s.forEach(([x, y], i) => { ctx.lineWidth = 2.4; if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  };
  const at = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  canvas.addEventListener('pointerdown', (e) => { e.preventDefault(); canvas.setPointerCapture(e.pointerId); drawing = [at(e)]; strokes.push(drawing); });
  canvas.addEventListener('pointermove', (e) => { if (!drawing) return; drawing.push(at(e)); redraw(); });
  const end = () => { if (!drawing) return; drawing = null; onChange(strokes, canvas.getBoundingClientRect().width); };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
  new ResizeObserver(size).observe(canvas);
  return { canvas, clear: () => { strokes.length = 0; redraw(); onChange(strokes, canvas.getBoundingClientRect().width); }, strokes };
}

/* ------------------------------------------------------ thumb scanner */

/**
 * A fingerprint drawn from a seed — loops of ridges round a core, bent by a
 * few low harmonics — revealed in gold as the scan line passes.
 */
function ridges(seed) {
  const r = (k) => { const x = Math.sin(seed * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
  const cx = 60 + (r(1) - 0.5) * 14;
  const cy = 78 + (r(2) - 0.5) * 18;
  const paths = [];
  for (let k = 1; k <= 17; k += 1) {
    const base = 3.6 * k;
    const pts = [];
    for (let a = 0; a <= Math.PI * 2 + 0.01; a += 0.06) {
      const wobble = 1 + 0.09 * Math.sin(3 * a + r(3) * 6) + 0.05 * Math.sin(5 * a + k * 0.7 + r(4) * 6);
      // Whorl: radius grows a little with angle, so rings become a spiral.
      const rad = (base + (a / (Math.PI * 2)) * 2.2) * wobble;
      pts.push([cx + Math.cos(a + k * 0.05) * rad * 0.82, cy + Math.sin(a + k * 0.05) * rad]);
    }
    paths.push(pts);
  }
  return paths;
}

export function thumbScanner({ onDone, onFail, hold = 1800 }) {
  const canvas = el('canvas', { class: 'thumb-pad', width: '120', height: '156', 'aria-label': 'Thumbprint scanner: press and hold' });
  const ring = el('div', { class: 'thumb-ring' });
  const box = el('div', { class: 'thumb', role: 'button', tabindex: '0', title: 'Press and hold' }, [canvas, ring, el('span', { class: 'thumb-scan' })]);
  const ctx = canvas.getContext('2d');
  let paths = ridges(7);
  let start = 0;
  let raf = 0;
  let done = false;
  const draw = (progress) => {
    ctx.clearRect(0, 0, 120, 156);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = 'rgba(111,211,255,0.28)';
    for (const p of paths) { ctx.beginPath(); p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); }
    if (progress > 0) {
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, 120, 156 * progress); ctx.clip();
      ctx.strokeStyle = done ? '#3ef0b4' : '#ffd998';
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 6;
      for (const p of paths) { ctx.beginPath(); p.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke(); }
      ctx.restore();
    }
    ring.style.setProperty('--p', String(progress));
  };
  const tick = () => {
    const p = Math.min(1, (performance.now() - start) / hold);
    draw(p);
    if (p >= 1) { done = true; draw(1); box.classList.remove('scanning'); box.classList.add('done'); navigator.vibrate?.([30, 50, 30]); onDone(); return; }
    raf = requestAnimationFrame(tick);
  };
  const press = (e) => {
    if (done) return;
    e.preventDefault();
    // The print is "yours" only in the sense that where you press seeds it.
    const rect = box.getBoundingClientRect();
    paths = ridges(((e.clientX || 0) - rect.left) * 0.37 + ((e.clientY || 0) - rect.top) * 0.71 + (Date.now() % 997));
    start = performance.now();
    box.classList.add('scanning');
    navigator.vibrate?.(15);
    raf = requestAnimationFrame(tick);
  };
  const release = () => {
    if (done || !start) return;
    cancelAnimationFrame(raf);
    start = 0;
    box.classList.remove('scanning');
    draw(0);
    onFail();
  };
  box.addEventListener('pointerdown', press);
  box.addEventListener('pointerup', release);
  box.addEventListener('pointerleave', release);
  box.addEventListener('pointercancel', release);
  box.addEventListener('contextmenu', (e) => e.preventDefault());
  box.addEventListener('keydown', (e) => { if ((e.key === ' ' || e.key === 'Enter') && !start) press(e); });
  box.addEventListener('keyup', (e) => { if (e.key === ' ' || e.key === 'Enter') release(); });
  draw(0);
  return { node: box, reset: () => { done = false; box.classList.remove('done'); draw(0); } };
}

/* ------------------------------------------------------------ the door */

const BOLTS = 12;

function doorSvg() {
  const bolts = Array.from({ length: BOLTS }, (_, i) => {
    const a = (i / BOLTS) * 360;
    return `<g transform="rotate(${a})"><rect class="bolt" x="-3.2" y="-97" width="6.4" height="15" rx="1.6" style="--i:${i}"/></g>`;
  }).join('');
  const ticks = Array.from({ length: 60 }, (_, i) => `<line x1="0" y1="-24" x2="0" y2="${i % 5 ? -21 : -18}" transform="rotate(${i * 6})"/>`).join('');
  const rivets = Array.from({ length: 24 }, (_, i) => { const a = (i / 24) * Math.PI * 2; return `<circle cx="${(Math.cos(a) * 74).toFixed(2)}" cy="${(Math.sin(a) * 74).toFixed(2)}" r="1.6"/>`; }).join('');
  const drips = Array.from({ length: 9 }, (_, i) => `<path class="drip" style="--d:${i}" d="M${-60 + i * 15} -86 q 3 ${10 + (i % 3) * 6} 0 ${18 + (i % 4) * 7} q -3 -${8 + (i % 3) * 6} 0 -${18 + (i % 4) * 7}"/>`).join('');
  return `
<svg viewBox="-110 -110 220 220" class="door-svg" aria-hidden="true">
  <defs>
    <radialGradient id="vd-metal" cx="40%" cy="35%" r="75%"><stop offset="0" stop-color="#3a3f48"/><stop offset="0.55" stop-color="#15181d"/><stop offset="1" stop-color="#050608"/></radialGradient>
    <linearGradient id="vd-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff1c4"/><stop offset="0.45" stop-color="#e9b24f"/><stop offset="1" stop-color="#7a5112"/></linearGradient>
    <path id="vd-rim" d="M -91 0 A 91 91 0 1 1 91 0 A 91 91 0 1 1 -91 0"/>
  </defs>
  <circle r="104" fill="#07080b" stroke="url(#vd-gold)" stroke-width="5"/>
  <g class="door-leaf">
    <circle r="96" fill="url(#vd-metal)" stroke="#2b2f36" stroke-width="2"/>
    ${bolts}
    <circle r="86" fill="none" stroke="url(#vd-gold)" stroke-width="1.2" opacity="0.8"/>
    <text class="rim-text"><textPath href="#vd-rim" startOffset="0">CLASSIFIED · EX-039 · LEVEL 4 · EYES ONLY · CLASSIFIED · EX-039 · LEVEL 4 · EYES ONLY ·</textPath></text>
    <circle r="66" fill="none" stroke="#2b2f36" stroke-width="6"/>
    <g fill="#c99a45" opacity="0.7">${rivets}</g>
    <g class="wheel">
      <circle r="40" fill="none" stroke="url(#vd-gold)" stroke-width="5"/>
      ${[0, 60, 120].map((a) => `<rect x="-2.5" y="-40" width="5" height="80" rx="2.5" fill="url(#vd-gold)" transform="rotate(${a})"/>`).join('')}
      ${[0, 60, 120, 180, 240, 300].map((a) => `<circle cx="0" cy="-44" r="4.5" fill="url(#vd-gold)" transform="rotate(${a})"/>`).join('')}
    </g>
    <g class="dial">
      <circle r="26" fill="#0b0d11" stroke="url(#vd-gold)" stroke-width="2"/>
      <g stroke="#e9b24f" stroke-width="0.8">${ticks}</g>
      <text y="5" text-anchor="middle" class="dial-c">C</text>
    </g>
    <g class="goo">${drips}</g>
  </g>
</svg>`;
}

/**
 * Play the unlock: authentication lines, the dial, twelve bolts, the wheel,
 * the seal, the swing, the light — then hand over to the lab.
 *
 * @param {{ say: Function, signature: string, reduced: boolean, onOpen: Function }} options Sequence hooks.
 * @returns {Promise<void>} Resolves when the lab has taken over.
 */
export function playUnlock({ say, signature, reduced, onOpen }) {
  const status = el('div', { class: 'vault-status', role: 'status', 'aria-live': 'polite' });
  const door = el('div', { class: 'vault-door' });
  door.innerHTML = doorSvg();
  const overlay = el('div', { class: 'vault-overlay', role: 'dialog', 'aria-label': 'Vault unlocking' }, [
    el('div', { class: 'vault-light' }),
    el('div', { class: 'vault-frame' }, [door]),
    el('div', { class: 'vault-steam' }),
    status,
    el('div', { class: 'vault-alarm' }),
  ]);
  document.body.append(overlay);
  document.body.classList.add('vault-running');
  const k = reduced ? 0.25 : 1;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms * k));
  const print = (text, cls = '') => status.append(el('p', { class: cls, text }));
  return (async () => {
    requestAnimationFrame(() => overlay.classList.add('on'));
    alarm(2);
    say(line('vaultGranted'));
    await wait(500);
    for (const [text, cls] of [
      ['AUTHENTICATING…', ''],
      [`SIGNATURE ${signature} · VERIFIED`, 'ok'],
      ['BIOMETRIC · 1 OF 1 · VERIFIED', 'ok'],
      [`CLEARANCE LEVEL 4 · ${IDENTITY.code} · GRANTED`, 'ok'],
    ]) { print(text, cls); beep(cls ? 1320 : 660); await wait(420); }
    overlay.classList.add('dial');
    await wait(1200);
    say(line('vaultUnlock'));
    overlay.classList.add('bolts');
    for (let i = 0; i < BOLTS; i += 1) clunk(i * 0.07 * k);
    print('LOCKING BOLTS · RETRACTED', 'ok');
    await wait(1100);
    overlay.classList.add('wheel');
    creak(0, 1 * k);
    await wait(1000);
    overlay.classList.add('seal');
    hiss(0, 1.3 * k);
    print('PRESSURE SEAL · RELEASED', 'warn');
    await wait(700);
    overlay.classList.add('open');
    swing(0);
    await wait(1500);
    overlay.classList.add('flash');
    await wait(450);
    // Tear the door down before the lab is built, so the two never hold
    // memory at the same time.
    overlay.remove();
    document.body.classList.remove('vault-running');
    onOpen();
  })();
}

/* ------------------------------------------------------------- the card */

/**
 * Build the classified station's card.
 *
 * @param {object} state Shared state (uses state.vault).
 * @param {{ say: Function, go: Function, index: Function, openLab: Function, reduced: boolean }} hooks Hooks.
 * @returns {Node[]} The card's extra nodes.
 */
export function buildVaultCard(state, hooks) {
  const v = state.vault;
  const sigStatus = el('p', { class: 'meta vault-check', text: 'Awaiting signature.' });
  const thumbStatus = el('p', { class: 'meta vault-check', text: 'Awaiting biometric. Press and hold.' });
  const codename = el('input', { type: 'text', maxlength: '24', placeholder: 'e.g. NIGHTJAR', 'aria-label': 'Codename (optional)' });
  const request = el('button', { class: 'btn-vault', type: 'button', disabled: '', text: '🔒 Request access' });
  const reenter = el('button', { class: 'btn-vault', type: 'button', hidden: '', text: '⇢ Re-enter the Black Lab', onclick: () => { hooks.say(line('vaultReturn')); hooks.openLab(); } });
  const sync = () => {
    const ready = v.signature && v.print;
    request.disabled = !ready || v.phase === 'unlocking';
    request.textContent = ready ? '🔓 Request access' : '🔒 Request access';
    request.classList.toggle('armed', Boolean(ready));
    reenter.hidden = !v.granted;
  };
  const pad = signaturePad((strokes, width) => {
    const ok = signatureValid(strokes, width);
    const was = v.signature;
    v.signature = ok ? `SIG-${strokeHash(strokes.flat())}` : null;
    sigStatus.textContent = ok ? `Signature captured · reference ${v.signature} · kept on this device only` : strokes.length ? 'Not enough signature. Sign properly — with a flourish.' : 'Awaiting signature.';
    sigStatus.classList.toggle('ok', ok);
    if (ok && !was) { beep(1046); hooks.say(line('vaultSigned')); }
    v.phase = v.signature && v.print ? 'ready' : 'locked';
    sync();
  });
  const thumb = thumbScanner({
    onDone: () => {
      v.print = true;
      thumbStatus.textContent = 'Print accepted · match 1 of 1 · simulated — nothing is read from your finger';
      thumbStatus.classList.add('ok');
      beep(1320); beep(1760, 0.1);
      v.phase = v.signature ? 'ready' : 'locked';
      sync();
    },
    onFail: () => { thumbStatus.textContent = 'Scan incomplete. Hold for two seconds.'; hooks.say(line('vaultDenied')); },
  });
  let thumbTold = false;
  thumb.node.addEventListener('pointerdown', () => { if (!thumbTold) { thumbTold = true; hooks.say(line('vaultThumb')); } });
  request.addEventListener('click', async () => {
    if (!(v.signature && v.print) || v.phase === 'unlocking') return;
    v.phase = 'unlocking';
    v.codename = codename.value.trim().toUpperCase().slice(0, 24) || null;
    v.unlockAt = hooks.now();
    sync();
    await playUnlock({ say: hooks.say, signature: v.signature, reduced: hooks.reduced, onOpen: () => { v.phase = 'open'; v.granted = true; hooks.openLab(); } });
    sync();
  });
  const leave = el('button', { class: 'chip', type: 'button', text: '← Leave now', onclick: () => { hooks.say(line('vaultLeaveEarly')); hooks.go(0); } });
  sync();
  return [
    el('div', { class: 'classified-head' }, [
      el('span', { class: 'stamp', text: 'TOP SECRET' }),
      el('p', { text: `// ${IDENTITY.code} // EYES ONLY // LEVEL 4 CLEARANCE //` }),
    ]),
    el('div', { class: 'dossier' }, [
      el('p', {}, ['Subject: ', el('span', { class: 'redact', text: 'exenatide' }), ' (synthetic ', el('span', { class: 'redact', text: 'exendin' }), '-4)']),
      el('p', {}, ['Origin: venom of ', el('span', { class: 'redact', text: 'Heloderma suspectum' })]),
      el('p', {}, [`Residues: ${IDENTITY.residues} · mass ${IDENTITY.mass} Da · t½ `, el('span', { class: 'redact', text: '2.4 h' })]),
      el('p', {}, ['Status: ', el('span', { class: 'redact', text: 'approved 2005' }), ' · file sealed']),
    ]),
    el('ul', { class: 'facts vault-terms' }, [
      el('li', { text: 'Contents are educational. Nothing behind this door is medical advice, and no doses are discussed.' }),
      el('li', { text: 'Your signature and print are simulated, hashed on this device for a reference number, and never stored or sent.' }),
      el('li', { text: 'The custodian will ask you to leave. Repeatedly.' }),
    ]),
    el('label', { class: 'field' }, [el('span', { text: 'Codename (optional)' }), codename]),
    el('div', { class: 'vault-step' }, [el('p', { class: 'step-label', text: '01 · Signature' }), pad.canvas, el('div', { class: 'pair' }, [sigStatus, el('button', { class: 'chip', type: 'button', text: 'Clear', onclick: () => pad.clear() })])]),
    el('div', { class: 'vault-step' }, [el('p', { class: 'step-label', text: '02 · Biometric' }), el('div', { class: 'thumb-row' }, [thumb.node, thumbStatus])]),
    el('div', { class: 'pair vault-actions' }, [request, reenter, leave]),
  ];
}
