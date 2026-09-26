import { i18n } from './i18n.js';
import { bus } from '../procedure/bus.js';

// Bottom toolbar: the ten instruments, bound to keys 1–9 and 0.
const ICONS = {
  suction: '<path d="M5 19l9-9"/><path d="M14 10c2-2 3-4 5-5"/><circle cx="5" cy="19" r="1.6"/>',
  scissors: '<circle cx="6" cy="18" r="2.2"/><circle cx="16" cy="19" r="2.2"/><path d="M7.5 16.5L19 4M14.5 17.2L9 5"/>',
  bipolar: '<path d="M6 21L10.5 5M12 21L11.5 5"/><path d="M9 3l2 2 2-2" /><path d="M16 6l2-1M16 9h3M16 12l2 1"/>',
  dissector: '<path d="M5 20L16 7"/><path d="M16 7c1-2 3-2 3.5-.5"/><circle cx="19.5" cy="6.8" r="1"/>',
  spatula: '<rect x="9" y="2" width="6" height="16" rx="3" transform="rotate(30 12 10)"/><path d="M8 21l2-4"/>',
  clip: '<path d="M8 3v11M14 3v11"/><path d="M8 14c0 3 1.5 5 3 5s3-2 3-5"/><circle cx="11" cy="19.5" r="1.8"/>',
  icg: '<circle cx="12" cy="12" r="3.2"/><path d="M2 12c3-5 6.5-7 10-7s7 2 10 7c-3 5-6.5 7-10 7s-7-2-10-7z"/>',
  doppler: '<path d="M3 12h3l2-5 3 10 3-8 2 3h5"/>',
  endoscope: '<path d="M4 20L15 9"/><circle cx="17.5" cy="6.5" r="3.2"/><circle cx="17.5" cy="6.5" r="1.2"/>',
  tempClip: '<path d="M7 3v9M12 3v9"/><path d="M7 12c0 2.5 1 4 2.5 4S12 14.5 12 12"/><circle cx="17" cy="16" r="4"/><path d="M17 14v2l1.4 1"/>',
};
const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'];

export class Toolbar {
  constructor(el, card, tools) {
    this.el = el; this.card = card; this.tools = tools;
    tools.list.forEach((t, i) => {
      const b = document.createElement('button');
      b.className = 'tool';
      b.dataset.tool = t.id;
      b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${ICONS[t.id]}</svg><span class="tname"></span><kbd>${KEYS[i]}</kbd>`;
      b.onclick = () => tools.select(tools.active === t ? null : t.id);
      el.appendChild(b);
    });
    card.querySelectorAll('[data-cliptype]').forEach((b) => {
      b.onclick = () => { tools.byId.clip.setType(b.dataset.cliptype); this.refresh(); };
    });
    tools.onChange(() => this.refresh());
    i18n.onChange(() => this.refresh());
    bus.on('clip:type', () => this.refresh());
    this.refresh();
  }
  refresh() {
    const a = this.tools.active;
    this.el.querySelectorAll('.tool').forEach((b) => {
      b.classList.toggle('active', a?.id === b.dataset.tool);
      b.querySelector('.tname').textContent = i18n.t('tool.' + b.dataset.tool);
    });
    this.card.classList.toggle('hidden', !a);
    if (!a) return;
    this.card.querySelector('.tc-name').textContent = i18n.t('tool.' + a.id);
    this.card.querySelector('.tc-rule').textContent = i18n.t('rule.' + a.id);
    this.card.querySelector('.tc-ctrl').textContent = i18n.t('ctrl.' + a.id);
    const clipRow = this.card.querySelector('.tc-clip');
    clipRow.classList.toggle('hidden', a.id !== 'clip');
    clipRow.querySelectorAll('[data-cliptype]').forEach((b) => b.classList.toggle('active', b.dataset.cliptype === this.tools.byId.clip.type));
  }
}
