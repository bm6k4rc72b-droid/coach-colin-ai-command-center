/**
 * Digital subtraction angiography on a 2D canvas: AP or lateral projection, contrast flowing
 * from the guide tip and stopping at occlusions, capillary blush in perfused territory, and
 * radiopaque device markers over a faint roadmap between runs.
 */
import { pointOn, type V3 } from '../core/anatomy';
import { branchOpen, contrastReach, MCA_BRANCHES } from '../core/angio';
import type { Sim } from '../core/sim';

export type Projection = 'AP' | 'LAT';

const FLOW = 110; // contrast front speed, mm/s
const RUN_SECONDS = 4.5;

export class Dsa {
  view: Projection = 'AP';
  /** Seconds since the last injection started, or null between runs. */
  runT: number | null = null;
  private ctx: CanvasRenderingContext2D;
  private noise: HTMLCanvasElement;
  private lastRun = -1;
  private roadmap: { seg: string; from: number; to: number }[] = [];

  constructor(private canvas: HTMLCanvasElement, private sim: Sim) {
    this.ctx = canvas.getContext('2d')!;
    this.noise = document.createElement('canvas');
    this.noise.width = this.noise.height = 128;
    const n = this.noise.getContext('2d')!;
    const img = n.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 120 + Math.random() * 30;
      img.data.set([v, v, v, 18], i);
    }
    n.putImageData(img, 0, 0);
  }

  /** Start the cine run that matches the latest sim.runs entry. */
  play(): void {
    this.runT = 0;
  }

  private proj(p: V3): [number, number] {
    return this.view === 'AP' ? [p[0], p[1]] : [-p[2], p[1]];
  }

  private frame(): { cx: number; cy: number; scale: number } {
    const W = this.canvas.width;
    const H = this.canvas.height;
    const sim = this.sim;
    const seg = sim.dev.guide.inBody ? sim.locate(sim.dev.guide.s).seg : 'desc';
    const cranial = ['lcca', 'ica', 'eca'].includes(seg) || sim.dev.micro.s > sim.dev.guide.s + 5;
    if (cranial) {
      const c = this.view === 'AP' ? [22, 232] : [0, 232];
      const scale = Math.min(W / 150, H / 150);
      return { cx: W / 2 - c[0] * scale, cy: H / 2 + c[1] * scale, scale };
    }
    const scale = Math.min(W / 260, H / 380);
    return { cx: W / 2, cy: H / 2 + 20 * scale, scale };
  }

  update(dt: number): void {
    const sim = this.sim;
    if (this.runT !== null) {
      this.runT += dt;
      if (this.runT > RUN_SECONDS + 1.5) this.runT = null;
    }
    const lastIdx = sim.runs.length - 1;
    if (lastIdx !== this.lastRun) {
      this.lastRun = lastIdx;
      if (lastIdx >= 0) {
        const r = sim.runs[lastIdx];
        this.roadmap = Object.entries(contrastReach(sim.tree, r.inj, sim.occ)).map(([seg, v]) => ({ seg, from: v.from, to: v.to }));
        this.play();
      }
    }
    this.draw();
  }

  private draw(): void {
    const { ctx, canvas } = this;
    const W = canvas.width;
    const H = canvas.height;
    const sim = this.sim;
    const f = this.frame();
    const P = (p: V3): [number, number] => {
      const [x, y] = this.proj(p);
      return [f.cx + x * f.scale, f.cy - y * f.scale];
    };
    const inRun = this.runT !== null;
    ctx.fillStyle = inRun ? '#cfcfcf' : '#a9a9a9';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = ctx.createPattern(this.noise, 'repeat')!;
    ctx.fillRect(0, 0, W, H);

    if (!inRun) {
      // Fluoroscopy: faint skull and spine, plus the roadmap from the last run.
      ctx.strokeStyle = 'rgba(60,60,60,0.35)';
      ctx.lineWidth = Math.max(2, 5 * f.scale);
      ctx.beginPath();
      const [hx, hy] = P(this.view === 'AP' ? [0, 230, 0] : [0, 230, 4]);
      ctx.ellipse(hx, hy, (this.view === 'AP' ? 74 : 96) * f.scale, 98 * f.scale, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = 'rgba(70,70,70,0.25)';
      for (let y = -160; y < 175; y += 22) {
        const [sx, sy] = P(this.view === 'AP' ? [0, y, -40] : [0, y, -40]);
        ctx.fillRect(sx - 9 * f.scale, sy - 8 * f.scale, 18 * f.scale, 16 * f.scale);
      }
      for (const r of this.roadmap) this.vessel(P, r.seg, r.from, r.to, 'rgba(70,70,70,0.28)', f.scale);
    } else {
      const t = this.runT!;
      const run = sim.runs[sim.runs.length - 1];
      const reach = contrastReach(sim.tree, run.inj, sim.occ);
      const fade = t > RUN_SECONDS ? Math.max(0, 1 - (t - RUN_SECONDS) / 1.5) : 1;
      // Capillary blush where the territory is perfused.
      const open = branchOpen(sim.tree, sim.occ);
      const blush = Math.max(0, Math.min(1, (t - 1.8) / 1.2)) * fade;
      if (blush > 0 && reach.m1) {
        for (const id of MCA_BRANCHES) {
          if (!reach[id] || open[id] < 0.05) continue;
          const seg = sim.tree.segs[id];
          const [x, y] = P(seg.pts[seg.pts.length - 1]);
          const g = ctx.createRadialGradient(x, y, 0, x, y, 34 * f.scale);
          g.addColorStop(0, `rgba(40,40,40,${0.35 * blush * open[id]})`);
          g.addColorStop(1, 'rgba(40,40,40,0)');
          ctx.fillStyle = g;
          ctx.fillRect(x - 40 * f.scale, y - 40 * f.scale, 80 * f.scale, 80 * f.scale);
        }
      }
      for (const [id, r] of Object.entries(reach)) {
        const front = FLOW * t - r.d0;
        if (front <= 0) continue;
        const to = Math.min(r.to, r.from + front);
        const a = Math.min(1, 0.25 + front / 40) * fade;
        this.vessel(P, id, r.from, to, `rgba(18,18,18,${a})`, f.scale);
        // Abrupt cut-off (meniscus) at an occlusion.
        if (to >= r.to - 0.01 && r.to < sim.tree.segs[id].length - 0.01 && fade > 0.3) {
          const p = pointOn(sim.tree.segs[id], r.to);
          const [x, y] = P(p.p);
          ctx.fillStyle = `rgba(18,18,18,${a})`;
          ctx.beginPath();
          ctx.arc(x, y, Math.max(1.5, p.r * f.scale * 1.1), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    this.devices(P, f.scale);
    // Labels
    ctx.fillStyle = inRun ? '#111' : '#222';
    ctx.font = `${Math.round(Math.max(11, W / 46))}px ui-monospace, monospace`;
    ctx.fillText(`${inRun ? 'DSA' : 'FLUORO'} · ${this.view === 'AP' ? 'AP' : 'LATERAL'}`, 10, 18);
    if (inRun && sim.runs.length) ctx.fillText(`run ${sim.runs.length} · ${this.runT!.toFixed(1)} s`, 10, 34);
    ctx.textAlign = 'right';
    ctx.fillText(this.view === 'AP' ? 'L' : 'ANT ←', W - 10, 18);
    ctx.textAlign = 'left';
  }

  private vessel(P: (p: V3) => [number, number], id: string, from: number, to: number, style: string, scale: number): void {
    const seg = this.sim.tree.segs[id];
    if (to - from < 0.2) return;
    const ctx = this.ctx;
    ctx.strokeStyle = style;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.max(1.2, ((seg.r0 + seg.r1) / 2) * 2 * scale * (seg.r1 < 1.6 ? 1.3 : 1));
    ctx.beginPath();
    for (let x = from; x <= to; x += 1.5) {
      const [px, py] = P(pointOn(seg, x).p);
      if (x === from) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    const [ex, ey] = P(pointOn(seg, to).p);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }

  /** Radiopaque bits: catheter tips, the wire, stent markers, the clot is invisible (a filling defect). */
  private devices(P: (p: V3) => [number, number], scale: number): void {
    const sim = this.sim;
    if (sim.phase !== 'procedure' && sim.phase !== 'done') return;
    const ctx = this.ctx;
    const line = (from: number, to: number, w: number, style: string) => {
      if (to - from < 0.5) return;
      ctx.strokeStyle = style;
      ctx.lineWidth = w;
      ctx.beginPath();
      for (let x = from; x <= to; x += 2) {
        const [px, py] = P(sim.pointAt(x).p);
        if (x === from) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      const [ex, ey] = P(sim.pointAt(to).p);
      ctx.lineTo(ex, ey);
      ctx.stroke();
    };
    const marker = (s: number, r: number) => {
      const [x, y] = P(sim.pointAt(s).p);
      ctx.fillStyle = '#050505';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };
    const g = sim.dev.guide;
    if (g.inBody) {
      line(0, g.s, Math.max(2, 2.4 * scale), 'rgba(20,20,20,0.55)');
      marker(g.s, Math.max(2.5, 1.6 * scale));
      if (sim.bgcInflated) {
        const [x, y] = P(sim.pointAt(Math.max(0, g.s - 4)).p);
        ctx.strokeStyle = 'rgba(20,20,20,0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(x, y, 3 * scale, 5 * scale, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    const a = sim.dev.asp;
    if (a.s > g.s + 0.5) {
      line(g.s, a.s, Math.max(1.6, 1.6 * scale), 'rgba(20,20,20,0.5)');
      marker(a.s, Math.max(2, 1.1 * scale));
    }
    const m = sim.dev.micro;
    if (m.s > g.s + 0.5) {
      line(Math.max(g.s, a.s), m.s, Math.max(1, 0.6 * scale), 'rgba(20,20,20,0.6)');
      marker(m.s, Math.max(1.5, 0.6 * scale));
      // Wire tip just beyond the microcatheter
      line(m.s, Math.min(sim.routeLength, m.s + 4), 1, 'rgba(10,10,10,0.9)');
    }
    if (sim.stent) {
      line(sim.stent.from, sim.stent.to, Math.max(1, 1.4 * scale), 'rgba(20,20,20,0.18)');
      for (const k of [0, 1, 2]) {
        const [x, y] = P(sim.pointAt(sim.stent.to - 0.6 * k).p);
        ctx.fillStyle = '#050505';
        ctx.fillRect(x - 1.5 + k, y - 1.5, 3, 3);
      }
      marker(sim.stent.from, Math.max(1.5, 0.7 * scale));
    }
  }
}
