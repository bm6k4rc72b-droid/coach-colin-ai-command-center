/**
 * Bottom toolbar (tools 1–7) with rule tooltips, lock reasons and custom canvas cursors.
 */
import { TOOLS, toolAvailability, type ToolId } from '../tools/tools';
import type { Simulation } from '../procedure/sim';
import { $, bindHold, esc } from './dom';

const ICONS: Record<ToolId, string> = {
  guide: '<path d="M3 20 C 8 20, 10 8, 16 6 S 22 8, 20 12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  wire: '<path d="M2 21 L17 6 q3 -3 5 0" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="21" cy="7" r="1.4" fill="#d9b154"/>',
  balloon: '<path d="M2 12 H6 M18 12 H22" stroke="currentColor" stroke-width="1.6"/><rect x="6" y="8" width="12" height="8" rx="4" fill="#f2c933" opacity=".85"/><path d="M7 8v8M17 8v8" stroke="#fff" stroke-width="1.3"/>',
  stent: '<rect x="4" y="8" width="16" height="8" rx="2" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M4 8 l4 8 l4 -8 l4 8 l4 -8" fill="none" stroke="currentColor" stroke-width="1.2"/>',
  contrast: '<path d="M9 3h6v4l3 3v10a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V10l3-3z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7 14h10v6H7z" fill="#5fb4ff" opacity=".8"/>',
  fluoro: '<path d="M12 2 L14 9 L21 9 L15.5 13.5 L17.5 21 L12 16.5 L6.5 21 L8.5 13.5 L3 9 L10 9 Z" fill="#ffd56b" opacity=".85"/>',
  measure: '<path d="M3 17 L17 3 L21 7 L7 21 Z" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M7 13l2 2M10 10l2 2M13 7l2 2" stroke="currentColor" stroke-width="1.3"/>',
};

const svgCursor = (inner: string, hx: number, hy: number, fallback: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='28' height='28' viewBox='0 0 24 24' color='white'>${inner.replace(/currentColor/g, 'white')}</svg>`,
  )}") ${hx} ${hy}, ${fallback}`;

export const CURSORS: Record<ToolId, string> = {
  guide: svgCursor(ICONS.guide, 3, 20, 'grab'),
  wire: svgCursor(ICONS.wire, 2, 21, 'crosshair'),
  balloon: svgCursor(ICONS.balloon, 12, 12, 'pointer'),
  stent: svgCursor(ICONS.stent, 12, 12, 'pointer'),
  contrast: 'pointer',
  fluoro: 'pointer',
  measure: svgCursor('<circle cx="12" cy="12" r="5" fill="none" stroke="white" stroke-width="1.5"/><path d="M12 2v6M12 16v6M2 12h6M16 12h6" stroke="white" stroke-width="1.5"/>', 12, 12, 'crosshair'),
};

export interface ToolbarActions {
  select: (id: ToolId) => void;
  pedal: (down: boolean) => void;
}

export class Toolbar {
  private el = $('toolbar');
  private btns = new Map<ToolId, HTMLButtonElement>();
  private tip = $('tooltip');
  private hoverTool: ToolId | null = null;

  constructor(private sim: () => Simulation, a: ToolbarActions) {
    for (const t of TOOLS) {
      const b = document.createElement('button');
      b.className = 'tool';
      b.innerHTML = `<span class="key">${t.key}</span><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[t.id]}</svg><span>${esc(t.short)}</span>`;
      b.setAttribute('aria-label', `${t.name} (${t.key})`);
      if (t.hold) bindHold(b, () => a.pedal(true), () => a.pedal(false));
      else b.addEventListener('click', () => a.select(t.id));
      b.addEventListener('pointerenter', () => {
        this.hoverTool = t.id;
        this.showTip(b);
      });
      b.addEventListener('pointerleave', () => {
        this.hoverTool = null;
        this.tip.classList.add('hidden');
      });
      this.el.appendChild(b);
      this.btns.set(t.id, b);
    }
  }

  private showTip(b: HTMLElement): void {
    if (!this.hoverTool) return;
    const t = TOOLS.find((x) => x.id === this.hoverTool)!;
    const av = toolAvailability(this.sim().snapshot())[t.id];
    this.tip.innerHTML = `<strong>${esc(t.name)}</strong> <kbd>${t.key}</kbd><div>${esc(t.rules)}</div>${
      av.enabled ? '' : `<div class="lock">🔒 ${esc(av.reason)}</div>`
    }`;
    this.tip.classList.remove('hidden');
    const r = b.getBoundingClientRect();
    const tw = this.tip.offsetWidth;
    const left = Math.max(6, Math.min(window.innerWidth - tw - 6, r.left + r.width / 2 - tw / 2));
    this.tip.style.left = `${left}px`;
    this.tip.style.top = `${Math.max(6, r.top - this.tip.offsetHeight - 8)}px`;
  }

  update(sim: Simulation, pedal: boolean): void {
    const av = toolAvailability(sim.snapshot());
    for (const [id, b] of this.btns) {
      b.classList.toggle('active', sim.tool === id);
      b.classList.toggle('locked', !av[id].enabled);
      if (id === 'fluoro') b.classList.toggle('on', pedal || sim.acquisition !== 'off');
      if (id === 'contrast') b.classList.toggle('on', sim.acquisition === 'cine');
    }
    if (this.hoverTool) {
      const b = this.btns.get(this.hoverTool);
      if (b) this.showTip(b);
    }
  }
}
