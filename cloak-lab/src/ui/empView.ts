/**
 * Tab 4 — EMP hardening lab (defensive, conceptual): protect devices, fire a simulated pulse,
 * see what survives and why.
 */
import { EMP, ENCLOSURES, type EnclosureId } from '../config/lab';
import { DEVICES, evaluate, explain, protectionCost, type DeviceResult, type Protection } from '../core/emp';
import { state } from '../core/store';
import { $, esc } from './dom';

export class EmpView {
  private results: Record<string, DeviceResult> = {};
  active = false;

  constructor(private root: HTMLElement) {
    this.render();
  }

  private render(): void {
    this.root.innerHTML = `
      <h2>EMP Lab: hardening electronics (defensive)</h2>
      <p class="lede">A cloak is a pile of electronics, and electronics have a classic weakness: electromagnetic pulses
        and surges. This lab is about <strong>protection</strong>: what couples energy into a device, and which
        defences stop it. Field values are relative teaching units (the international reference waveform,
        IEC 61000-2-9, uses ${EMP.e1RefKvPerM} kV/m for the fast E1 part); nothing here describes how to make a pulse.</p>
      <div class="grid cols-2">
        <div class="card">
          <div class="row" style="justify-content:space-between">
            <label class="slider" style="flex:1;max-width:420px">Threat level <input type="range" id="threat" min="0" max="1" step="0.05"/><span id="threat-v"></span></label>
            <button id="pulse" class="primary">⚡ Simulate pulse</button>
          </div>
          <p class="muted" style="margin:6px 0 10px">Total protection cost: <span id="emp-cost" class="mono"></span></p>
          <div class="devices" id="devices"></div>
        </div>
        <div class="grid" style="align-content:start">
          <div class="card"><h3>How the energy gets in</h3>
            <p><strong>E1</strong> (nanoseconds) couples into any conductor — cables, antennas, circuit traces. The longer
              the conductor, the more voltage. Small unplugged devices collect little.</p>
            <p><strong>E2</strong> behaves like nearby lightning; normal surge protection handles it.</p>
            <p><strong>E3</strong> (seconds to minutes) drives slow currents through very long lines and can overheat grid
              transformers. A metal box does nothing for that — disconnection or neutral blocking devices do.</p>
          </div>
          <div class="card"><h3>Defences</h3>
            <p><strong>Enclosure</strong>: a continuous conductive shell (Faraday cage) reflects the field. Gaps, vents and
              unfiltered cable entries leak — a tight bag or welded room is far better than a box with holes.</p>
            <p><strong>Filters / surge protection</strong>: clamp what enters through wires.</p>
            <p><strong>Fibre optics</strong>: glass carries data but no current.</p>
            <p><strong>Isolation</strong>: unplug from long lines, or fit blocking devices on the grid side.</p>
            <p class="muted">Real hardening standards exist for critical facilities (e.g. MIL-STD-188-125). Spares stored
              in a Faraday bag are the cheapest resilience plan.</p>
          </div>
        </div>
      </div>
      <div id="pulse-ring"></div>`;
    const th = $('#threat', this.root) as HTMLInputElement;
    th.value = String(state.threat);
    th.addEventListener('input', () => {
      state.threat = Number(th.value);
      this.sync();
    });
    $('#pulse', this.root).addEventListener('click', () => this.pulse());
    this.buildDevices();
    this.sync();
  }

  private buildDevices(): void {
    $('#devices', this.root).innerHTML = DEVICES.map(
      (d) => `<div class="card device" data-dev="${d.id}">
        <h3>${esc(d.name)}</h3>
        <div class="muted" style="font-size:12px">${esc(d.info)}</div>
        <div class="opts">
          <label>Enclosure <select data-k="enclosure">${(Object.keys(ENCLOSURES) as EnclosureId[])
            .map((k) => `<option value="${k}">${esc(ENCLOSURES[k].name)} (${ENCLOSURES[k].seDb} dB)</option>`)
            .join('')}</select></label>
          <label><input type="checkbox" data-k="filters"/> Filters / surge protection on cables</label>
          <label><input type="checkbox" data-k="fiber"/> Fibre-optic data links</label>
          <label><input type="checkbox" data-k="isolated"/> Isolated from long lines</label>
        </div>
        <div class="outcome">—</div>
        <div class="why"></div>
      </div>`,
    ).join('');
    this.root.querySelectorAll<HTMLElement>('[data-dev]').forEach((card) => {
      const id = card.dataset.dev!;
      card.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-k]').forEach((el) =>
        el.addEventListener('change', () => {
          const k = el.dataset.k as keyof Protection;
          const v = el instanceof HTMLInputElement && el.type === 'checkbox' ? el.checked : el.value;
          this.setProtection(id, { [k]: v } as Partial<Protection>);
        }),
      );
    });
  }

  setProtection(id: string, p: Partial<Protection>): void {
    state.protection[id] = { ...state.protection[id], ...p };
    delete this.results[id];
    this.sync();
  }

  setThreat(t: number): void {
    state.threat = t;
    ($('#threat', this.root) as HTMLInputElement).value = String(t);
    this.sync();
  }

  pulse(): void {
    for (const d of DEVICES) this.results[d.id] = evaluate(d, state.protection[d.id], state.threat);
    const ring = $('#pulse-ring', this.root);
    ring.classList.remove('go');
    void ring.offsetWidth;
    ring.classList.add('go');
    this.root.querySelectorAll<HTMLElement>('[data-dev]').forEach((c) => {
      c.classList.remove('hit');
      void c.offsetWidth;
      if (this.results[c.dataset.dev!].outcome !== 'ok') c.classList.add('hit');
    });
    state.lastPulseAt = performance.now();
    this.sync();
  }

  private sync(): void {
    $('#threat-v', this.root).textContent = state.threat.toFixed(2);
    let cost = 0;
    let kg = 0;
    this.root.querySelectorAll<HTMLElement>('[data-dev]').forEach((card) => {
      const id = card.dataset.dev!;
      const p = state.protection[id];
      (card.querySelector('[data-k="enclosure"]') as HTMLSelectElement).value = p.enclosure;
      for (const k of ['filters', 'fiber', 'isolated'] as const) (card.querySelector(`[data-k="${k}"]`) as HTMLInputElement).checked = p[k];
      const c = protectionCost(p);
      cost += c.cost;
      kg += c.kg;
      const r = this.results[id];
      const o = card.querySelector('.outcome')!;
      if (r) {
        o.className = `outcome o-${r.outcome}`;
        o.textContent = r.outcome === 'ok' ? '✔ Survived' : r.outcome === 'upset' ? '▲ Upset (reboot)' : '✖ Damaged';
        card.querySelector('.why')!.textContent = explain(r, p);
      } else {
        o.className = 'outcome muted';
        o.textContent = 'Not tested';
        card.querySelector('.why')!.textContent = '';
      }
    });
    $('#emp-cost', this.root).textContent = `$${cost} · ${kg.toFixed(1)} kg`;
  }
}
