/**
 * Device panel: guide/wire rotation dial, tip location, branch hint, resistance meter;
 * balloon/stent size chips, pressure gauge, achieved diameter, inflation timer and position vs
 * the lesion; QCA readout for the measure tool. Plus on-screen hold buttons for mouse/touch.
 */
import { BALLOON, GUIDE, INFLATION, STENT } from '../config/anatomy';
import { angleDiff } from '../anatomy/math';
import { lesionEnd, lesionStart } from '../anatomy/lumen';
import type { VesselId } from '../anatomy/vessels';
import { canResize, catheterDiameter, rupturePressure } from '../physics/balloon';
import { cuspFacing } from '../physics/guide';
import type { Simulation } from '../procedure/sim';
import { $, bindHold, esc, setHTML, setText } from './dom';

export interface HoldInput {
  advance: number;
  rotate: number;
  inflate: boolean;
  deflate: boolean;
  fine: boolean;
}

export const holdInput: HoldInput = { advance: 0, rotate: 0, inflate: false, deflate: false, fine: false };

function dialSvg(angle: number, marks: { a: number; label: string; color: string; zone?: number }[]): string {
  const cx = 43;
  const cy = 43;
  const R = 34;
  const pt = (a: number, r: number) => {
    const t = ((a - 90) * Math.PI) / 180;
    return [cx + r * Math.cos(t), cy + r * Math.sin(t)];
  };
  let s = `<svg class="dial" viewBox="0 0 86 86"><circle cx="${cx}" cy="${cy}" r="${R}" fill="#0a1118" stroke="rgba(140,170,210,.3)"/>`;
  for (const m of marks) {
    if (m.zone) {
      const [x0, y0] = pt(m.a - m.zone, R);
      const [x1, y1] = pt(m.a + m.zone, R);
      s += `<path d="M${cx} ${cy} L${x0} ${y0} A${R} ${R} 0 ${m.zone * 2 > 180 ? 1 : 0} 1 ${x1} ${y1} Z" fill="${m.color}" opacity=".18"/>`;
    }
    const [x, y] = pt(m.a, R - 2);
    const [lx, ly] = pt(m.a, R - 12);
    s += `<circle cx="${x}" cy="${y}" r="3" fill="${m.color}"/><text x="${lx}" y="${ly + 3}" font-size="8" fill="${m.color}" text-anchor="middle">${m.label}</text>`;
  }
  const [nx, ny] = pt(angle, R - 4);
  s += `<line x1="${cx}" y1="${cy}" x2="${nx}" y2="${ny}" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="3" fill="#fff"/></svg>`;
  return s;
}

export class DevicePanel {
  private el = $('device-panel');
  private mode = '';
  private body!: HTMLElement;

  constructor(private actions: { setSize: (k: 'balloon' | 'stent', d: number, l: number) => void; measure: () => void }) {}

  private build(mode: string): void {
    this.mode = mode;
    const holds =
      mode === 'balloon' || mode === 'stent'
        ? `<div class="holds"><button data-h="back">◀ Back</button><button data-h="fwd">Fwd ▶</button><button data-h="infl">Inflate</button><button data-h="defl">Deflate</button></div>`
        : mode === 'guide' || mode === 'wire'
          ? `<div class="holds"><button data-h="back">◀ Back</button><button data-h="fwd">Fwd ▶</button><button data-h="rl">⟲ A</button><button data-h="rr">D ⟳</button></div>`
          : '';
    this.el.innerHTML = `<h4><span id="dp-title"></span><span id="dp-sub"></span></h4><div id="dp-body"></div>${holds}`;
    this.body = $('dp-body');
    this.el.querySelectorAll<HTMLButtonElement>('.holds button').forEach((b) => {
      const h = b.dataset.h!;
      bindHold(
        b,
        () => {
          if (h === 'fwd') holdInput.advance = 1;
          if (h === 'back') holdInput.advance = -1;
          if (h === 'rl') holdInput.rotate = -1;
          if (h === 'rr') holdInput.rotate = 1;
          if (h === 'infl') holdInput.inflate = true;
          if (h === 'defl') holdInput.deflate = true;
        },
        () => {
          if (h === 'fwd' || h === 'back') holdInput.advance = 0;
          if (h === 'rl' || h === 'rr') holdInput.rotate = 0;
          if (h === 'infl') holdInput.inflate = false;
        },
      );
    });
    this.body.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      const chip = t.closest<HTMLElement>('[data-size]');
      if (chip) {
        const [k, d, l] = chip.dataset.size!.split(':');
        this.actions.setSize(k as 'balloon' | 'stent', Number(d), Number(l));
      }
      if (t.closest('[data-qca]')) this.actions.measure();
    });
  }

  update(sim: Simulation): void {
    const mode = sim.tool;
    if (mode !== this.mode) this.build(mode);
    const title = $('dp-title');
    const sub = $('dp-sub');
    switch (mode) {
      case 'guide':
        return this.guide(sim, title, sub);
      case 'wire':
        return this.wire(sim, title, sub);
      case 'balloon':
      case 'stent':
        return this.catheter(sim, mode, title, sub);
      case 'measure':
        return this.measure(sim, title, sub);
      default:
        setText(title, 'Imaging');
        setText(sub, '');
        setHTML(this.body, '<div class="kv"><b>Contrast</b><span>5 / C</span><b>Fluoro</b><span>hold Space / 6</span></div>');
    }
  }

  private guideLocation(sim: Simulation): string {
    const a = sim.anat;
    const s = sim.guide.s;
    if (sim.guide.engaged) return 'Engaged in the left main';
    if (sim.guideAtRoot) return 'Aortic root';
    let acc = 0;
    for (const id of ['radial', 'brachial', 'axillary', 'subclavian', 'brachiocephalic'] as VesselId[]) {
      acc += a.vessels[id].length - (id === 'radial' ? 0 : 0);
      if (s <= acc) return a.vessels[id].name;
    }
    return 'Ascending aorta';
  }

  private guide(sim: Simulation, title: HTMLElement, sub: HTMLElement): void {
    setText(title, 'Guide catheter 6F');
    const g = sim.guide;
    setText(sub, `${Math.round(g.s)} mm`);
    const facing = cuspFacing(g.angle);
    const off = angleDiff(g.angle, GUIDE.leftCuspAngle);
    const dial = dialSvg(g.angle, [
      { a: GUIDE.leftCuspAngle, label: 'L', color: '#4fd18b', zone: GUIDE.engageTolerance },
      { a: GUIDE.rightCuspAngle, label: 'R', color: '#ff8f6b' },
      { a: GUIDE.nonCoronaryCuspAngle, label: 'NC', color: '#8a9bb0' },
    ]);
    setHTML(
      this.body,
      `<div class="dp-row">${dial}<div class="kv">
        <b>Tip</b><span>${esc(this.guideLocation(sim))}</span>
        <b>Rotation</b><span>${Math.round(g.angle)}°</span>
        <b>Faces</b><span>${facing === 'left' ? 'left cusp' : facing === 'right' ? 'right cusp' : 'non-coronary'}${
          Math.abs(off) <= GUIDE.engageTolerance ? ' ✓' : ''
        }</span>
        <b>Speed</b><span>${g.speed.toFixed(0)} mm/s</span>
        <b>Wire</b><span>${sim.wireOut ? 'OUT — guide locked' : 'in guide'}</span>
      </div></div>`,
    );
  }

  private wire(sim: Simulation, title: HTMLElement, sub: HTMLElement): void {
    setText(title, 'Guidewire 0.014"');
    const w = sim.wire;
    const loc = sim.wireLocus();
    const v = sim.anat.vessels[loc.vessel];
    setText(sub, sim.wireOut ? `${v.id} ${loc.s.toFixed(1)} mm` : 'in guide');
    const marks = (['LAD', 'LCx', 'D1', 'D2'] as VesselId[]).map((id) => ({
      a: sim.anat.vessels[id].wireAngle,
      label: id,
      color: id === 'LAD' ? '#4fd18b' : id === 'LCx' ? '#ff8f6b' : '#f2c14e',
    }));
    const up = sim.upcomingBranch();
    let hint = '—';
    if (up) {
      const names = up.options.join(' / ');
      if (up.terminal) {
        const best = up.options.reduce((a, b) =>
          Math.abs(angleDiff(w.angle, sim.anat.vessels[a].wireAngle)) <= Math.abs(angleDiff(w.angle, sim.anat.vessels[b].wireAngle)) ? a : b,
        );
        hint = `${names} in ${up.distance.toFixed(0)} mm → tip aims ${best}`;
      } else {
        const cap = up.options.find((o) => Math.abs(angleDiff(w.angle, sim.anat.vessels[o].wireAngle)) < 50);
        hint = `${names} in ${up.distance.toFixed(0)} mm → ${cap ? `would enter ${cap}!` : 'tip clear'}`;
      }
    }
    const ls = lesionStart(sim.lesion);
    const le = lesionEnd(sim.lesion);
    const inLesion = loc.vessel === 'LAD' && loc.s >= ls && loc.s <= le;
    const res = Math.round(w.resistance * 100);
    setHTML(
      this.body,
      `<div class="dp-row">${dialSvg(w.angle, marks)}<div class="kv" style="flex:1">
        <b>Tip</b><span>${sim.wireOut ? esc(v.name.split(' (')[0]) : 'inside guide'}${inLesion ? ' · LESION' : ''}</span>
        <b>Rotation</b><span>${Math.round(w.angle)}°</span>
        <b>Branch</b><span>${esc(hint)}</span>
        <b>Speed</b><span>${w.speed.toFixed(1)} mm/s${w.buckling ? ' · BUCKLING' : ''}</span>
        <b>Status</b><span>${w.crossed ? 'lesion crossed' : 'not crossed'}</span>
      </div></div>
      <div style="font-size:11px;color:var(--muted);margin-top:4px">Resistance</div>
      <div class="meter" title="${res}%"><i style="width:${res}%"></i></div>`,
    );
  }

  private catheter(sim: Simulation, kind: 'balloon' | 'stent', title: HTMLElement, sub: HTMLElement): void {
    const spec = kind === 'balloon' ? BALLOON : STENT;
    const c = sim.catheter && sim.catheter.kind === kind ? sim.catheter : null;
    const size = kind === 'balloon' ? sim.balloonSize : sim.stentSize;
    setText(title, kind === 'balloon' ? 'Balloon (pre-dilation)' : 'Drug-eluting stent');
    setText(sub, c ? (c.deployed ? 'deployed' : c.ruptured ? 'RUPTURED' : 'on wire') : 'not loaded');
    const resizable = !c || canResize(c, GUIDE.engagedDepth);
    const chips = (vals: number[], cur: number, fmt: (v: number) => string, mk: (v: number) => string) =>
      vals
        .map((v) => `<button class="chip ${v === cur ? 'sel' : ''}" data-size="${mk(v)}" ${resizable ? '' : 'disabled'}>${fmt(v)}</button>`)
        .join('');
    const dChips = chips(spec.diameters, size.d, (v) => `Ø${v.toFixed(v % 0.5 ? 2 : 1)}`, (v) => `${kind}:${v}:${size.l}`);
    const lChips = chips(spec.lengths, size.l, (v) => `${v} mm`, (v) => `${kind}:${size.d}:${v}`);
    const P = c ? c.pressure : 0;
    const max = rupturePressure(spec);
    const pct = (x: number) => `${Math.min(100, (100 * x) / max)}%`;
    const d = c ? catheterDiameter(c) : INFLATION.foldedDiameter;
    let pos = 'in the guide';
    const r = sim.catheterRange();
    if (c && r && sim.catheterOutside()) {
      if (r.vessel === 'LAD') {
        const prox = lesionStart(sim.lesion) - r.s0;
        const dist = r.s1 - lesionEnd(sim.lesion);
        pos = `prox ${prox >= 0 ? '+' : ''}${prox.toFixed(1)} · dist ${dist >= 0 ? '+' : ''}${dist.toFixed(1)} mm`;
      } else pos = `${r.vessel} ${r.s0.toFixed(0)}–${r.s1.toFixed(0)} mm`;
    } else if (c && c.pos > GUIDE.engagedDepth) pos = 'leaving the guide';
    const ref = r && r.vessel ? sim.referenceAt(r.vessel, (r.s0 + r.s1) / 2) : sim.lesion.referenceDiameter;
    setHTML(
      this.body,
      `<div class="chips">${dChips}</div><div class="chips">${lChips}</div>
       ${resizable ? '' : '<div style="font-size:11px;color:var(--warn)">Size locked — catheter is out of the guide</div>'}
       <div class="gauge" title="${P.toFixed(1)} atm"><i class="${P > spec.rbp ? 'over' : ''}" style="width:${pct(P)}"></i>
         <span class="tick" style="left:${pct(spec.nominal)}"><em>NOM ${spec.nominal}</em></span>
         <span class="tick rbp" style="left:${pct(spec.rbp)}"><em>RBP ${spec.rbp}</em></span></div>
       <div class="kv">
         <b>Pressure</b><span>${P.toFixed(1)} atm</span>
         <b>Diameter</b><span>${d.toFixed(2)} mm (ref ${ref.toFixed(2)} → ${(d / ref).toFixed(2)}×)</span>
         <b>Inflation</b><span>${c && P > 0.05 ? `${c.inflationTime.toFixed(1)} s` : '—'}</span>
         <b>vs lesion</b><span>${esc(pos)}</span>
       </div>`,
    );
  }

  private measure(sim: Simulation, title: HTMLElement, sub: HTMLElement): void {
    setText(title, 'QCA');
    setText(sub, 'hover vessels in 3D');
    const q = sim.qca;
    setHTML(
      this.body,
      q
        ? `<table class="qca"><tr><td>Reference Ø</td><td>${q.referenceDiameter.toFixed(2)} mm</td></tr>
           <tr><td>MLD</td><td>${q.mld.toFixed(2)} mm</td></tr>
           <tr><td>Diameter stenosis</td><td>${Math.round(q.ds * 100)} %</td></tr>
           <tr><td>Lesion length</td><td>${q.lesionLength.toFixed(1)} mm</td></tr></table>
           <button data-qca style="margin-top:6px">Re-measure</button>`
        : '<button data-qca>Measure lesion</button>',
    );
  }
}
