/* Neural map: a stylised sagittal section with the systems each drill
   loads. Fill = recent training load with a 4-day half-life, so the
   map answers "what have I actually trained this week", not "ever". */
import { REGIONS, state } from '../core/state.js';
import { clamp } from '../core/rng.js';

/* normalised coordinates inside the sagittal outline */
const NODES = {
  mt:       { x:0.235, y:0.585, r:0.052 },
  parietal: { x:0.365, y:0.315, r:0.060 },
  fef:      { x:0.640, y:0.320, r:0.052 },
  dlpfc:    { x:0.790, y:0.430, r:0.062 },
  rifg:     { x:0.735, y:0.560, r:0.050 },
  bg:       { x:0.545, y:0.545, r:0.055 },
  cereb:    { x:0.215, y:0.760, r:0.070 },
  amyg:     { x:0.560, y:0.700, r:0.046 },
  hipp:     { x:0.435, y:0.665, r:0.048 },
};

export function drawBrain(canvas, t = 0){
  const g = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const rect = canvas.getBoundingClientRect();
  const W = rect.width, H = rect.height;
  canvas.width = Math.round(W*dpr); canvas.height = Math.round(H*dpr);
  g.setTransform(dpr,0,0,dpr,0,0);
  g.clearRect(0,0,W,H);

  const px = n => n * W, py = n => n * H;

  // brainstem first, so it tucks behind the cortex instead of floating
  g.save();
  g.beginPath();
  g.moveTo(px(0.355), py(0.60)); g.quadraticCurveTo(px(0.335), py(0.78), px(0.318), py(0.93));
  g.lineTo(px(0.392), py(0.93)); g.quadraticCurveTo(px(0.408), py(0.76), px(0.420), py(0.60));
  g.closePath();
  g.fillStyle = 'rgba(255,158,77,.14)'; g.fill();
  g.strokeStyle = 'rgba(255,158,77,.32)'; g.lineWidth = 1.2; g.stroke();

  // cortex outline
  g.beginPath();
  g.moveTo(px(0.14), py(0.62));
  g.bezierCurveTo(px(0.10), py(0.34), px(0.34), py(0.10), px(0.55), py(0.12));
  g.bezierCurveTo(px(0.78), py(0.14), px(0.93), py(0.30), px(0.90), py(0.48));
  g.bezierCurveTo(px(0.88), py(0.62), px(0.78), py(0.66), px(0.70), py(0.68));
  g.bezierCurveTo(px(0.58), py(0.72), px(0.46), py(0.74), px(0.36), py(0.72));
  g.bezierCurveTo(px(0.26), py(0.70), px(0.17), py(0.72), px(0.14), py(0.62));
  g.closePath();
  const grd = g.createLinearGradient(0,0,W,H);
  grd.addColorStop(0,'rgba(77,240,255,.10)');
  grd.addColorStop(1,'rgba(185,107,255,.08)');
  g.fillStyle = grd; g.fill();
  g.strokeStyle = 'rgba(77,240,255,.42)'; g.lineWidth = 1.4; g.stroke();

  // cerebellum
  g.beginPath();
  g.ellipse(px(0.215), py(0.76), px(0.115), py(0.11), -0.25, 0, Math.PI*2);
  g.fillStyle = 'rgba(107,211,255,.10)'; g.fill();
  g.strokeStyle = 'rgba(107,211,255,.4)'; g.stroke();

  // sulci suggestion
  g.strokeStyle = 'rgba(77,240,255,.14)'; g.lineWidth = 1;
  for(let i=0;i<7;i++){
    const fx = 0.22 + i*0.095;
    g.beginPath();
    g.moveTo(px(fx), py(0.20 + (i%2)*0.05));
    g.bezierCurveTo(px(fx+0.03), py(0.35), px(fx-0.03), py(0.46), px(fx+0.02), py(0.60));
    g.stroke();
  }
  g.restore();

  // nodes
  for(const [id, n] of Object.entries(NODES)){
    const meta = REGIONS[id];
    const load = state.regionLoad(id);
    const cx = px(n.x), cy = py(n.y);
    const rad = Math.min(W,H) * n.r;
    const pulse = 1 + Math.sin(t/520 + n.x*9) * 0.06 * (0.25 + load);

    g.save();
    g.globalCompositeOperation = 'screen';
    const gr = g.createRadialGradient(cx, cy, 1, cx, cy, rad*2.5*pulse);
    gr.addColorStop(0, hexA(meta.color, 0.10 + load*0.75));
    gr.addColorStop(1, hexA(meta.color, 0));
    g.fillStyle = gr;
    g.beginPath(); g.arc(cx, cy, rad*2.5*pulse, 0, Math.PI*2); g.fill();
    g.restore();

    g.beginPath(); g.arc(cx, cy, rad*pulse, 0, Math.PI*2);
    g.fillStyle = hexA(meta.color, 0.16 + load*0.55);
    g.strokeStyle = hexA(meta.color, 0.45 + load*0.5);
    g.lineWidth = 1.4; g.fill(); g.stroke();

    g.fillStyle = 'rgba(223,246,255,.9)';
    g.font = `700 ${Math.max(8, Math.min(11, W*0.026))}px 'Chakra Petch', monospace`;
    g.textAlign = 'center';
    g.fillText(`${Math.round(load*100)}`, cx, cy + 3);
  }
}

function hexA(hex, a){
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n>>16)&255},${(n>>8)&255},${n&255},${a})`;
}
