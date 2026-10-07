/** Schematic micromanipulation / facility scenes for each SCNT stage, drawn on a 2D canvas. */
import type { Stage } from '../core/scnt-stages';

function bg(g: CanvasRenderingContext2D, W: number, H: number): void {
  g.fillStyle = '#0a0f17';
  g.fillRect(0, 0, W, H);
}

/** An egg cell: zona (shell), cytoplasm, optional nucleus/spindle and polar body. */
function egg(g: CanvasRenderingContext2D, x: number, y: number, r: number, opts: { nucleus?: string; spindle?: boolean } = {}): void {
  g.fillStyle = 'rgba(150,170,190,0.18)';
  g.beginPath();
  g.arc(x, y, r + 7, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(245,225,200,0.9)';
  g.strokeStyle = 'rgba(210,180,150,0.9)';
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  if (opts.spindle) {
    g.strokeStyle = '#7c4dff';
    g.lineWidth = 2;
    for (let i = -2; i <= 2; i++) {
      g.beginPath();
      g.moveTo(x - r * 0.55 + i, y - r * 0.6);
      g.lineTo(x + r * 0.55 + i, y - r * 0.6);
      g.stroke();
    }
    g.lineWidth = 1;
  }
  if (opts.nucleus) {
    g.fillStyle = opts.nucleus;
    g.beginPath();
    g.arc(x - r * 0.35, y + r * 0.2, r * 0.3, 0, Math.PI * 2);
    g.fill();
  }
}

function holdingPipette(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.strokeStyle = '#9fb0c4';
  g.lineWidth = 8;
  g.beginPath();
  g.moveTo(0, y);
  g.lineTo(x - r - 9, y);
  g.stroke();
  g.fillStyle = '#0a0f17';
  g.beginPath();
  g.arc(x - r - 5, y, 5, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 1;
}

function injectPipette(g: CanvasRenderingContext2D, W: number, tipX: number, y: number, contents?: string): void {
  g.strokeStyle = '#c4d2e4';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(W, y - 20);
  g.lineTo(tipX, y);
  g.stroke();
  if (contents) {
    g.fillStyle = contents;
    g.beginPath();
    g.arc(tipX + 7, y, 4.5, 0, Math.PI * 2);
    g.fill();
  }
  g.lineWidth = 1;
}

export function drawScene(cv: HTMLCanvasElement, stage: Stage, t: number): void {
  const g = cv.getContext('2d')!;
  const W = cv.width;
  const H = cv.height;
  bg(g, W, H);
  const cx = W / 2;
  const cy = H / 2;
  const r = Math.min(W, H) * 0.2;
  const pulse = 0.5 + 0.5 * Math.sin(t * 2);
  g.textAlign = 'left';
  g.font = '13px system-ui, sans-serif';

  switch (stage.scene) {
    case 'collect': {
      // A dish of cells / eggs.
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2 + t * 0.1;
        const rad = r * (0.5 + 0.5 * ((i * 37) % 10) / 10);
        egg(g, cx + Math.cos(a) * rad * 1.3, cy + Math.sin(a) * rad * 0.8, 10, stage.id === 'donor' ? { nucleus: '#2563eb' } : { spindle: true });
      }
      g.fillStyle = '#8fa6c6';
      g.fillText(stage.id === 'donor' ? 'Donor fibroblasts (G0-arrested): nucleus = genome to clone' : 'Matured MII oocytes: each holds a spindle of chromosomes', 16, H - 16);
      break;
    }
    case 'enucleate': {
      holdingPipette(g, cx, cy, r);
      egg(g, cx, cy, r, { spindle: true });
      // Aspirating pipette pulls the spindle out to the right.
      const grab = Math.min(1, t * 0.3 % 2);
      injectPipette(g, W, cx + r + 10 - grab * 0, cy - r * 0.6);
      g.fillStyle = '#7c4dff';
      g.beginPath();
      g.arc(cx + r + 20 + grab * 40, cy - r * 0.6, 6, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#8fa6c6';
      g.fillText('A fine pipette aspirates the chromosomes (purple) — the egg keeps its cytoplasm', 16, H - 16);
      break;
    }
    case 'inject': {
      holdingPipette(g, cx, cy, r);
      egg(g, cx, cy, r);
      const push = Math.min(1, (t * 0.3) % 2);
      injectPipette(g, W, cx + r - push * r * 0.6, cy, '#2563eb');
      g.fillStyle = '#8fa6c6';
      g.fillText('Enucleated egg + donor cell (blue nucleus) slipped under the zona', 16, H - 16);
      break;
    }
    case 'fuse': {
      egg(g, cx, cy, r, { nucleus: '#2563eb' });
      // Electric pulse flashes
      g.strokeStyle = `rgba(125,211,252,${pulse})`;
      g.lineWidth = 2;
      for (const s of [-1, 1]) {
        g.beginPath();
        g.moveTo(cx + s * (r + 30), cy - 20);
        g.lineTo(cx + s * (r + 10), cy);
        g.lineTo(cx + s * (r + 30), cy + 20);
        g.stroke();
      }
      g.fillStyle = `rgba(124,77,255,${0.3 + 0.4 * pulse})`;
      g.beginPath();
      g.arc(cx - r * 0.35, cy + r * 0.2, r * 0.32, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 1;
      g.fillStyle = '#8fa6c6';
      g.fillText('Electric pulse fuses the cells; activation + reprogramming begins (the real bottleneck)', 16, H - 16);
      break;
    }
    case 'culture': {
      // Dividing embryo: 1 → 2 → 4 → blastocyst
      const phase = Math.floor((t * 0.4) % 4);
      const cells = [1, 2, 4, 16][phase];
      const label = ['1 cell', '2 cells', '4 cells', 'blastocyst'][phase];
      for (let i = 0; i < cells; i++) {
        const a = (i / cells) * Math.PI * 2;
        const rad = cells === 1 ? 0 : r * 0.45;
        const cr = cells >= 16 ? r * 0.16 : (r * 0.9) / Math.sqrt(cells);
        egg(g, cx + Math.cos(a) * rad, cy + Math.sin(a) * rad, cr, { nucleus: '#2563eb' });
      }
      g.fillStyle = '#8fa6c6';
      g.fillText(`Day ${phase * 2 + 1}: ${label} — most embryos arrest; a minority reach blastocyst`, 16, H - 16);
      break;
    }
    case 'transfer': {
      // Uterus outline with a catheter depositing blastocysts
      g.strokeStyle = 'rgba(244,143,177,0.7)';
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(cx - r * 1.6, cy + r);
      g.quadraticCurveTo(cx, cy - r * 1.4, cx + r * 1.6, cy + r);
      g.stroke();
      g.strokeStyle = '#c4d2e4';
      g.beginPath();
      g.moveTo(0, cy + r * 1.3);
      g.lineTo(cx, cy);
      g.stroke();
      for (let i = 0; i < 4; i++) egg(g, cx + (i - 1.5) * 20, cy - 4, 7, { nucleus: '#2563eb' });
      g.lineWidth = 1;
      g.fillStyle = '#8fa6c6';
      g.fillText('Blastocysts transferred into a synchronised surrogate uterus', 16, H - 16);
      break;
    }
    case 'birth': {
      g.fillStyle = 'rgba(244,143,177,0.12)';
      g.beginPath();
      g.arc(cx, cy, r * 1.4, 0, Math.PI * 2);
      g.fill();
      egg(g, cx, cy, r, { nucleus: '#2563eb' });
      g.fillStyle = '#4ade80';
      g.font = '15px system-ui';
      g.fillText('Identical nuclear DNA', cx - r, cy - r - 16);
      g.fillStyle = '#fbbf24';
      g.fillText("Egg donor's mitochondria", cx - r, cy + r + 24);
      g.fillStyle = '#8fa6c6';
      g.font = '13px system-ui, sans-serif';
      g.fillText('A live birth: a genetically identical individual — born as a baby, not a copy of the adult', 16, H - 16);
      break;
    }
  }
}
