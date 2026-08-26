/* ══════════════════════════════════════════════════════════════
   PRISM · util — DOM helpers, seeded randomness, formatting
   ══════════════════════════════════════════════════════════════ */

window.P = window.P || {};

P.util = (function () {
  'use strict';

  /* ── DOM ──────────────────────────────────────────────────── */

  const $  = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /** Build an element. `el('div.card', {id:'x'}, child, 'text')` */
  function el(spec, attrs, ...kids) {
    const [tagPart, ...classes] = String(spec).split('.');
    const node = document.createElement(tagPart || 'div');
    if (classes.length) node.className = classes.join(' ');

    if (attrs && attrs.nodeType) { kids.unshift(attrs); attrs = null; }
    if (attrs && typeof attrs === 'string') { kids.unshift(attrs); attrs = null; }

    for (const k in (attrs || {})) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'style' && typeof v === 'object') {
        // Custom properties are invisible to Object.assign on a style
        // object — they must go through setProperty or they vanish.
        for (const sk in v) {
          if (sk.indexOf('--') === 0) node.style.setProperty(sk, v[sk]);
          else node.style[sk] = v[sk];
        }
      }
      else if (k === 'html') node.innerHTML = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : String(v));
    }

    for (const kid of kids.flat(3)) {
      if (kid === null || kid === undefined || kid === false) continue;
      node.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return node;
  }

  const frag = (...kids) => {
    const f = document.createDocumentFragment();
    kids.flat(3).filter(Boolean).forEach(k => f.append(k.nodeType ? k : document.createTextNode(String(k))));
    return f;
  };

  const clear = node => { while (node.firstChild) node.removeChild(node.firstChild); return node; };

  /** Stagger children for the .reveal animation. */
  function stagger(root) {
    $$(':scope > *', root).forEach((c, i) => c.style.setProperty('--i', i));
    return root;
  }

  /* ── randomness ───────────────────────────────────────────── */

  /** FNV-1a — stable string → 32-bit int. */
  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  }

  /** mulberry32 — deterministic PRNG from a seed. */
  function rng(seed) {
    let a = typeof seed === 'string' ? hash(seed) : (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** Pick one item using a seeded rng function. */
  const pick = (list, rnd) => list[Math.floor((rnd ? rnd() : Math.random()) * list.length)];

  /** Pick n distinct items, order preserved by draw. */
  function sample(list, n, rnd) {
    const pool = list.slice(), out = [];
    while (pool.length && out.length < n) {
      out.push(pool.splice(Math.floor((rnd ? rnd() : Math.random()) * pool.length), 1)[0]);
    }
    return out;
  }

  /** Deterministic shuffle. */
  function shuffle(list, rnd) {
    const a = list.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor((rnd ? rnd() : Math.random()) * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  /* ── text ─────────────────────────────────────────────────── */

  const cap    = s => (s || '').charAt(0).toUpperCase() + (s || '').slice(1);
  const clamp  = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
  const titled = s => (s || '').replace(/\b[a-z]/g, c => c.toUpperCase());

  /** Strip a trailing full stop so fragments compose cleanly. */
  const unpunct = s => (s || '').trim().replace(/[.。!?]+$/, '');

  /** "3 days ago" style relative time. */
  function ago(ts) {
    const s = Math.max(0, (Date.now() - ts) / 1000);
    if (s < 60) return 'just now';
    const m = s / 60;   if (m < 60) return Math.floor(m) + 'm ago';
    const h = m / 60;   if (h < 24) return Math.floor(h) + 'h ago';
    const d = h / 24;   if (d < 7)  return Math.floor(d) + 'd ago';
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }

  /** Local calendar day key — streaks must not roll over on UTC midnight. */
  function dayKey(d) {
    const t = d || new Date();
    return t.getFullYear() + '-' +
      String(t.getMonth() + 1).padStart(2, '0') + '-' +
      String(t.getDate()).padStart(2, '0');
  }

  /** Whole days between two local day keys. */
  function daysBetween(a, b) {
    const pa = a.split('-').map(Number), pb = b.split('-').map(Number);
    const da = Date.UTC(pa[0], pa[1] - 1, pa[2]);
    const db = Date.UTC(pb[0], pb[1] - 1, pb[2]);
    return Math.round((db - da) / 86400000);
  }

  const fmt = n => n >= 10000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n);
  const pct = (a, b) => (b > 0 ? (a / b) * 100 : 0);
  const round1 = n => Math.round(n * 10) / 10;

  /* ── misc ─────────────────────────────────────────────────── */

  const wait = ms => new Promise(r => setTimeout(r, ms));

  function throttle(fn, ms) {
    let last = 0, timer = null, lastArgs = null;
    return function (...args) {
      lastArgs = args;
      const now = Date.now();
      if (now - last >= ms) { last = now; fn.apply(this, args); }
      else if (!timer) {
        timer = setTimeout(() => { timer = null; last = Date.now(); fn.apply(this, lastArgs); }, ms - (now - last));
      }
    };
  }

  async function copy(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (_) {
      // Clipboard API needs a secure context; fall back for file:// use.
      const ta = el('textarea', { style: { position: 'fixed', opacity: '0', top: '0' } });
      ta.value = text;
      document.body.append(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (_e) { ok = false; }
      ta.remove();
      return ok;
    }
  }

  const reduceMotion = () =>
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  return {
    $, $$, el, frag, clear, stagger,
    hash, rng, pick, sample, shuffle,
    cap, clamp, titled, unpunct, ago, dayKey, daysBetween, fmt, pct, round1,
    wait, throttle, copy, reduceMotion
  };
})();
