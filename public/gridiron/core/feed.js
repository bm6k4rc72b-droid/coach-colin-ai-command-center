import { i18n } from './i18n.js';

// Short event messages that fade after a few seconds. Repeats inside 1.5 s collapse.
export class Feed {
  constructor(el) { this.el = el; this.last = { key: '', t: 0 }; }
  push(key, level = 'ok', vars = {}) {
    const now = performance.now();
    const text = i18n.t(key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
    if (this.last.key === text && now - this.last.t < 1500) return;
    this.last = { key: text, t: now };
    const row = document.createElement('div');
    row.className = `feed-row ${level}`;
    row.textContent = text;
    this.el.prepend(row);
    while (this.el.children.length > 4) this.el.lastChild.remove();
    setTimeout(() => row.classList.add('out'), 4200);
    setTimeout(() => row.remove(), 5000);
  }
  clear() { this.el.innerHTML = ''; }
}
