/* Thin DOM helpers + the app's feedback vocabulary. */
import { state } from '../core/state.js';
import { audio } from '../core/audio.js';
import { haptics } from '../core/haptics.js';

export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function el(tag, attrs = {}, ...kids){
  const n = document.createElement(tag);
  for(const [k, v] of Object.entries(attrs)){
    if(k === 'class') n.className = v;
    else if(k === 'html') n.innerHTML = v;
    else if(k === 'text') n.textContent = v;
    else if(k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if(v !== null && v !== false && v !== undefined) n.setAttribute(k, v === true ? '' : v);
  }
  kids.flat().forEach(k => { if(k != null) n.append(k.nodeType ? k : document.createTextNode(k)); });
  return n;
}

/* ---------------- screen router ---------------- */
let current = 'boot';
const listeners = [];
export const screens = {
  get current(){ return current; },
  show(name){
    const next = $(`[data-screen="${name}"]`);
    if(!next) return;
    $$('.screen').forEach(s => s.classList.remove('is-active'));
    next.classList.add('is-active');
    next.scrollTop = 0;
    current = name;
    $$('.nav-btn').forEach(b => b.classList.toggle('is-active', b.dataset.nav === name));
    listeners.forEach(fn => fn(name));
  },
  onChange(fn){ listeners.push(fn); },
};

/* ---------------- toasts ---------------- */
export function toast(msg, kind = ''){
  const rail = $('#toast-rail');
  const t = el('div', { class:`toast ${kind ? 'toast--' + kind : ''}`, text:msg });
  rail.append(t);
  setTimeout(() => { t.classList.add('is-out'); setTimeout(() => t.remove(), 320); }, 2100);
}

/* ---------------- screen flash ---------------- */
export function flash(color = '#4DF0FF'){
  if(state.s.settings.reduceFlash) return;
  const v = $('#flash-veil');
  v.style.background = color;
  v.classList.remove('is-fire'); void v.offsetWidth; v.classList.add('is-fire');
}

/* ---------------- big centred cue ---------------- */
export function cue(root, text, kind = 'cy', sub = '', ms = 700){
  const n = el('div', { class:`cue cue--${kind}` }, text, sub ? el('span', { class:'cue__sub', text:sub }) : null);
  root.append(n);
  setTimeout(() => n.remove(), ms);
  return n;
}

/* ---------------- variable-ratio payoff ---------------- */
export function reward({ kicker = 'LOOP BREAK', title, sub, xp }){
  return new Promise(resolve => {
    const veil = $('#reward-veil');
    veil.hidden = false;
    veil.innerHTML = '';
    const card = el('div', { class:'reward-card' },
      el('div', { class:'reward-rays' }),
      el('div', { class:'reward-kicker', text:kicker }),
      el('div', { class:'reward-title', text:title }),
      sub ? el('div', { class:'reward-sub', text:sub }) : null,
      xp ? el('div', { class:'reward-xp', text:`+${xp} XP` }) : null,
      el('button', { class:'holo-btn holo-btn--primary holo-btn--wide', style:'margin-top:20px' }, 'CLAIM'),
    );
    veil.append(card);
    audio.jackpot(); haptics.fire('jackpot');
    const close = () => { veil.hidden = true; veil.innerHTML = ''; resolve(); };
    card.querySelector('button').addEventListener('click', close);
    veil.addEventListener('click', e => { if(e.target === veil) close(); });
  });
}

/* ---------------- misc ---------------- */
export const wait = ms => new Promise(r => setTimeout(r, ms));

export function fmtMs(ms){
  if(ms == null || !isFinite(ms)) return '—';
  return ms >= 1000 ? (ms/1000).toFixed(2) + 's' : Math.round(ms) + 'ms';
}
export function fmtSigned(n){
  if(n == null || !isFinite(n)) return '—';
  return (n > 0 ? '+' : '') + Math.round(n);
}
export function pct(n){ return n == null ? '—' : Math.round(n * 100) + '%'; }
