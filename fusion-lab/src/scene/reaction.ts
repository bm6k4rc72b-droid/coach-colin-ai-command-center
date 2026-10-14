/**
 * Animated D + T → ⁴He + n on a 2D canvas: the nuclei approach against their electric
 * repulsion, tunnel through, fuse in a flash and fly apart (the light neutron four times faster).
 */
import { energySplit, massDefect } from '../core/physics';

interface Nucleon {
  dx: number;
  dy: number;
  p: boolean;
}

const D: Nucleon[] = [
  { dx: -4, dy: 0, p: true },
  { dx: 4, dy: 0, p: false },
];
const T: Nucleon[] = [
  { dx: 0, dy: -4.5, p: true },
  { dx: -4.5, dy: 3, p: false },
  { dx: 4.5, dy: 3, p: false },
];
const HE: Nucleon[] = [
  { dx: -4, dy: -4, p: true },
  { dx: 4, dy: 4, p: true },
  { dx: 4, dy: -4, p: false },
  { dx: -4, dy: 4, p: false },
];

function nucleus(g: CanvasRenderingContext2D, x: number, y: number, parts: Nucleon[], scale: number, glow: string): void {
  g.save();
  g.shadowColor = glow;
  g.shadowBlur = 22;
  for (const n of parts) {
    const r = 6.2 * scale;
    const grad = g.createRadialGradient(x + n.dx * scale - r * 0.3, y + n.dy * scale - r * 0.3, 1, x + n.dx * scale, y + n.dy * scale, r);
    if (n.p) {
      grad.addColorStop(0, '#ffd1f4');
      grad.addColorStop(1, '#ff2bd6');
    } else {
      grad.addColorStop(0, '#d6f6ff');
      grad.addColorStop(1, '#2563eb');
    }
    g.fillStyle = grad;
    g.beginPath();
    g.arc(x + n.dx * scale, y + n.dy * scale, r, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
}

export function drawReaction(cv: HTMLCanvasElement, t: number): void {
  const g = cv.getContext('2d')!;
  const W = cv.width;
  const H = cv.height;
  const bg = g.createRadialGradient(W / 2, H / 2, 10, W / 2, H / 2, W * 0.7);
  bg.addColorStop(0, '#160a2e');
  bg.addColorStop(1, '#05030c');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  const cx = W / 2;
  const cy = H / 2 + 6;
  const s = Math.min(W, H) / 110;
  const cycle = 4.2;
  const ph = (t % cycle) / cycle;
  g.font = '12px ui-monospace, monospace';
  g.textAlign = 'center';
  const split = energySplit();
  if (ph < 0.42) {
    // Approach, slowing as they push against the Coulomb barrier
    const k = ph / 0.42;
    const dist = (1 - Math.pow(k, 0.7)) * W * 0.36 + 12 * s;
    const jitter = Math.sin(t * 40) * (k > 0.8 ? 1.5 : 0);
    nucleus(g, cx - dist + jitter, cy, D, s, '#ff2bd6');
    nucleus(g, cx + dist - jitter, cy, T, s, '#22d3ee');
    g.fillStyle = '#ff9be8';
    g.fillText('Deuterium (1p + 1n)', cx - dist, cy + 26 * s);
    g.fillStyle = '#7ee8ff';
    g.fillText('Tritium (1p + 2n)', cx + dist, cy + 26 * s);
    g.fillStyle = 'rgba(255,255,255,0.65)';
    g.fillText(k > 0.6 ? 'Both positive — they repel! Only at ~100 M°C do they get close' : 'Two hydrogen isotopes, stripped of electrons', cx, 22);
    if (k > 0.6) g.fillText('enough to quantum-tunnel through the barrier.', cx, 38);
  } else if (ph < 0.56) {
    // Fusion flash
    const k = (ph - 0.42) / 0.14;
    const r = (12 + k * 70) * s;
    const fl = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    fl.addColorStop(0, `rgba(255,255,255,${1 - k * 0.6})`);
    fl.addColorStop(0.3, `rgba(255,214,60,${0.9 - k * 0.6})`);
    fl.addColorStop(0.7, `rgba(255,43,214,${0.6 - k * 0.5})`);
    fl.addColorStop(1, 'rgba(255,43,214,0)');
    g.fillStyle = fl;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#fff4c2';
    g.fillText('FUSION — the strong nuclear force takes over', cx, 22);
  } else {
    // Products fly apart: neutron 4× the energy, ~2× the speed of the helium nucleus
    const k = (ph - 0.56) / 0.44;
    const he = k * W * 0.2;
    const nn = k * W * 0.42;
    nucleus(g, cx - he, cy - he * 0.15, HE, s, '#fde047');
    nucleus(g, cx + nn, cy + nn * 0.08, [{ dx: 0, dy: 0, p: false }], s * 1.05, '#7ee8ff');
    // Neutron speed trail
    const tr = g.createLinearGradient(cx, cy, cx + nn, cy + nn * 0.08);
    tr.addColorStop(0, 'rgba(126,232,255,0)');
    tr.addColorStop(1, 'rgba(126,232,255,0.6)');
    g.strokeStyle = tr;
    g.lineWidth = 3 * s;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + nn - 8 * s, cy + nn * 0.08);
    g.stroke();
    g.lineWidth = 1;
    g.fillStyle = '#fde047';
    g.fillText(`Helium-4 · ${split.alpha.toFixed(1)} MeV`, cx - he, cy - he * 0.15 + 28 * s);
    g.fillStyle = '#7ee8ff';
    g.fillText(`Neutron · ${split.neutron.toFixed(1)} MeV`, Math.min(cx + nn, W - 70), cy + nn * 0.08 + 22 * s);
    g.fillStyle = 'rgba(255,255,255,0.75)';
    g.fillText('Helium stays trapped and heats the plasma;', cx, 22);
    g.fillText('the neutron escapes to the blanket.', cx, 38);
  }
  const md = massDefect();
  g.fillStyle = 'rgba(233,228,255,0.85)';
  g.font = '11px ui-monospace, monospace';
  g.fillText(`Mass lost: ${md.du.toFixed(4)} u  →  E = mc² = ${md.MeV.toFixed(1)} MeV per reaction`, cx, H - 10);
  g.textAlign = 'left';
}
