// NEUROLENS · Noir Luxe interface layer — by Coach Colin.
//
// Two editions share every number and every model: Noir Luxe (obsidian glass,
// champagne gold, the 3D neural-orb entrance) and the original Pearl. This
// module switches between them and adds the tactile layer: glass that tilts
// toward the hand and catches the light, a soft gold spotlight that follows the
// cursor, magnetic primary buttons, a gold tab indicator that glides, panels
// that rise in when a view changes, and figures that count up to their value.
//
// Everything here is decoration on top of the app; the app runs without it.
// prefers-reduced-motion turns the motion off and keeps the look.

import { createHero } from './hero.js';

const KEY = 'neurolens.edition';
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const finePointer = matchMedia('(pointer: fine)').matches;

/** The edition to start in: a saved choice, else Noir Luxe. */
export function savedEdition() {
  try { return localStorage.getItem(KEY) === 'pearl' ? 'pearl' : 'noir'; } catch { return 'noir'; }
}

/** Parse a figure like "72%", "1.4 s", "−12", "3,200" into its parts; null when it is not a single number. */
export function parseFigure(text) {
  const m = /^([^\d−-]*)([−-]?)(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d+))?(.*)$/.exec(String(text).trim());
  if (!m) return null;
  const value = Number(m[3].replace(/,/g, '') + (m[4] ? `.${m[4]}` : '')) * (m[2] ? -1 : 1);
  return { prefix: m[1], sign: m[2], value, decimals: m[4] ? m[4].length : 0, grouped: m[3].includes(','), suffix: m[5] };
}

/** Format a figure back with the same shape. */
export function formatFigure(f, v) {
  const abs = Math.abs(v);
  let num = abs.toFixed(f.decimals);
  if (f.grouped) num = Number(num).toLocaleString('en-US', { minimumFractionDigits: f.decimals, maximumFractionDigits: f.decimals });
  const neg = v < 0 || (f.sign && abs === 0 && f.value < 0);
  return `${f.prefix}${neg ? f.sign || '−' : ''}${num}${f.suffix}`;
}

/** Ease-out-cubic. */
const ease = (t) => 1 - (1 - t) ** 3;

function countUp(el, ms = 900) {
  const f = parseFigure(el.textContent);
  if (!f || reduced) return;
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / ms);
    el.textContent = formatFigure(f, f.value * ease(t));
    if (t < 1 && el.isConnected) requestAnimationFrame(step); else el.textContent = formatFigure(f, f.value);
  };
  requestAnimationFrame(step);
}

/**
 * Mount the layer.
 *
 * @param {{ app: object, N: object, i18n: object }} ctx
 */
export function mountLux({ app, N, i18n }) {
  const root = document.documentElement;
  const $ = (s) => document.querySelector(s);
  let hero = null;

  /* ---------------------------------------------------------- editions */

  function setEdition(ed, { save = true } = {}) {
    root.dataset.theme = ed;
    N.applyTheme?.(ed);
    if (save) { try { localStorage.setItem(KEY, ed); } catch { /* private mode */ } }
    for (const b of document.querySelectorAll('[data-edition-btn]')) {
      b.textContent = ed === 'noir' ? i18n.t('lux.toPearl') : i18n.t('lux.toNoir');
      b.setAttribute('aria-label', b.textContent);
    }
    // The entrance orb belongs to Noir, and only while the start screen is up.
    const onStart = !$('#start').classList.contains('hidden');
    if (ed === 'noir' && onStart && !hero) startHero();
    if (ed !== 'noir' && hero) { hero.stop(); hero = null; }
  }

  function startHero() {
    const cv = $('#lux-hero');
    try { hero = createHero(cv, { reduced }); cv.classList.add('on'); } catch (e) { console.warn('NeuroLens: entrance orb unavailable', e); }
  }

  for (const b of document.querySelectorAll('[data-edition-btn]')) {
    b.addEventListener('click', () => setEdition(root.dataset.theme === 'noir' ? 'pearl' : 'noir'));
  }
  i18n.onChange(() => setEdition(root.dataset.theme, { save: false }));

  // Entering the lab retires the orb.
  const stopHero = () => { if (hero) { hero.stop(); hero = null; } $('#lux-hero').classList.remove('on'); };
  $('#btn-start').addEventListener('click', stopHero);
  $('#btn-start-tour').addEventListener('click', stopHero);

  /* ------------------------------------------------------- title reveal */

  const h1 = $('#start h1');
  const splitTitle = () => {
    const text = h1.textContent;
    h1.innerHTML = '';
    h1.setAttribute('aria-label', text);
    [...text].forEach((ch, i) => {
      const s = document.createElement('span');
      s.className = 'lux-ch'; s.textContent = ch; s.style.setProperty('--i', i); s.setAttribute('aria-hidden', 'true');
      h1.append(s);
    });
  };
  splitTitle();
  i18n.onChange(() => requestAnimationFrame(splitTitle));

  /* ------------------------------------------------ spotlight & tilt */

  if (finePointer && !reduced) {
    const spot = document.createElement('div');
    spot.id = 'lux-spot';
    document.body.append(spot);
    let sx = innerWidth / 2; let sy = innerHeight / 2; let tx = sx; let ty = sy;
    addEventListener('pointermove', (e) => {
      tx = e.clientX; ty = e.clientY;
      // Light catches the glass under the cursor.
      const panel = e.target.closest?.('.panel, .card, .bigstats > div');
      if (panel) {
        const r = panel.getBoundingClientRect();
        panel.style.setProperty('--mx', `${((e.clientX - r.left) / r.width) * 100}%`);
        panel.style.setProperty('--my', `${((e.clientY - r.top) / r.height) * 100}%`);
      }
    }, { passive: true });
    const follow = () => {
      sx += (tx - sx) * 0.18; sy += (ty - sy) * 0.18;
      spot.style.transform = `translate3d(${sx}px, ${sy}px, 0)`;
      requestAnimationFrame(follow);
    };
    follow();

    // 3D tilt on the cards that are objects, not reading surfaces.
    const TILT = '.start-card, .db-card, .card, .bigstats > div, .brand, .actions .btn, .lux-tilt';
    addEventListener('pointermove', (e) => {
      const el = e.target.closest?.(TILT);
      document.querySelectorAll('.lux-tilting').forEach((x) => { if (x !== el) { x.classList.remove('lux-tilting'); x.style.transform = ''; } });
      if (!el || root.dataset.theme !== 'noir') return;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5; const py = (e.clientY - r.top) / r.height - 0.5;
      const max = el.matches('.start-card, .db-card') ? 3.5 : 7;
      el.classList.add('lux-tilting');
      el.style.transform = `perspective(900px) rotateX(${(-py * max).toFixed(2)}deg) rotateY(${(px * max).toFixed(2)}deg) translateZ(0)`;
    }, { passive: true });

    // Magnetic primary buttons.
    addEventListener('pointermove', (e) => {
      for (const b of document.querySelectorAll('.btn.primary')) {
        const r = b.getBoundingClientRect();
        const cx = r.left + r.width / 2; const cy = r.top + r.height / 2;
        const dx = e.clientX - cx; const dy = e.clientY - cy; const d = Math.hypot(dx, dy);
        b.style.translate = d < 110 && root.dataset.theme === 'noir' && !b.disabled ? `${(dx * 0.18).toFixed(1)}px ${(dy * 0.25).toFixed(1)}px` : '';
      }
    }, { passive: true });
  }

  /* ------------------------------------------------ gliding tab marker */

  const tabs = $('#tabs');
  const marker = document.createElement('i');
  marker.id = 'lux-tabmark';
  tabs.append(marker);
  const placeMarker = () => {
    const on = tabs.querySelector('button.on');
    if (!on) { marker.style.opacity = '0'; return; }
    marker.style.opacity = '1';
    marker.style.transform = `translateX(${on.offsetLeft}px)`;
    marker.style.width = `${on.offsetWidth}px`;
  };
  new MutationObserver(placeMarker).observe(tabs, { subtree: true, attributes: true, attributeFilter: ['class'] });
  addEventListener('resize', placeMarker);
  i18n.onChange(() => requestAnimationFrame(placeMarker));
  requestAnimationFrame(placeMarker);

  /* --------------------------------- staggered reveal and count-up */

  let lastTab = document.body.dataset.tab;
  const reveal = (host) => {
    const fresh = document.body.dataset.tab !== lastTab;
    [...host.children].forEach((c, i) => {
      if (!reduced) { c.classList.remove('lux-in'); c.style.setProperty('--d', `${Math.min(i, 12) * 45}ms`); void c.offsetWidth; c.classList.add('lux-in'); }
    });
    if (fresh) host.querySelectorAll('.bigstats b, .db-ring b').forEach((b) => countUp(b));
  };
  for (const id of ['#panel', '#side']) {
    new MutationObserver(() => { reveal($(id)); }).observe($(id), { childList: true });
  }
  new MutationObserver(() => { requestAnimationFrame(() => { lastTab = document.body.dataset.tab; }); }).observe(document.body, { attributes: true, attributeFilter: ['data-tab'] });
  // The report ring and its figures count up every time it opens.
  new MutationObserver(() => { if (!$('#report').classList.contains('hidden')) $('#report').querySelectorAll('.db-ring b').forEach((b) => countUp(b, 1200)); })
    .observe($('#report'), { attributes: true, attributeFilter: ['class'] });

  setEdition(savedEdition(), { save: false });
  return { setEdition };
}
