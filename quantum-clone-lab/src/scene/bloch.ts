/** Draws a Bloch sphere with the state vector(s) for one or more qubits on a 2D canvas. */
export interface BlochPt {
  v: [number, number, number];
  label: string;
  color: string;
}

export function drawBloch(cv: HTMLCanvasElement, pts: BlochPt[], spin = 0): void {
  const g = cv.getContext('2d')!;
  const W = cv.width;
  const H = cv.height;
  const R = Math.min(W, H) * 0.36;
  const cx = W / 2;
  const cy = H / 2;
  g.clearRect(0, 0, W, H);
  // Project a 3D point with a fixed tilt and slow spin about z.
  const tilt = -0.42;
  const project = (x: number, y: number, z: number): [number, number, number] => {
    const xr = x * Math.cos(spin) - y * Math.sin(spin);
    const yr = x * Math.sin(spin) + y * Math.cos(spin);
    const yy = yr * Math.cos(tilt) - z * Math.sin(tilt);
    const zz = yr * Math.sin(tilt) + z * Math.cos(tilt);
    return [cx + xr * R, cy - zz * R, yy];
  };
  // Sphere
  g.fillStyle = 'rgba(99,179,237,0.05)';
  g.strokeStyle = 'rgba(148,197,255,0.25)';
  g.lineWidth = 1;
  g.beginPath();
  g.arc(cx, cy, R, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  // Equator and a meridian
  for (const which of [0, 1]) {
    g.beginPath();
    for (let a = 0; a <= 64; a++) {
      const t = (a / 64) * Math.PI * 2;
      const p = which === 0 ? project(Math.cos(t), Math.sin(t), 0) : project(Math.cos(t), 0, Math.sin(t));
      if (a === 0) g.moveTo(p[0], p[1]);
      else g.lineTo(p[0], p[1]);
    }
    g.strokeStyle = 'rgba(148,197,255,0.18)';
    g.stroke();
  }
  // Axes with |0⟩ / |1⟩ labels
  const axes: [[number, number, number], string][] = [
    [[0, 0, 1], '|0⟩'],
    [[0, 0, -1], '|1⟩'],
    [[1, 0, 0], 'x'],
    [[0, 1, 0], 'y'],
  ];
  g.font = '13px ui-monospace, monospace';
  for (const [v, lab] of axes) {
    const p = project(v[0], v[1], v[2]);
    g.strokeStyle = 'rgba(148,197,255,0.3)';
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(p[0], p[1]);
    g.stroke();
    g.fillStyle = '#8fa6c6';
    g.fillText(lab, p[0] + 4, p[1] - 2);
  }
  // State vectors (draw back-to-front)
  for (const pt of [...pts].sort((a, b) => project(...a.v)[2] - project(...b.v)[2])) {
    const p = project(pt.v[0], pt.v[1], pt.v[2]);
    g.strokeStyle = pt.color;
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(p[0], p[1]);
    g.stroke();
    g.fillStyle = pt.color;
    g.beginPath();
    g.arc(p[0], p[1], 5, 0, Math.PI * 2);
    g.fill();
    if (pt.label) {
      g.fillStyle = '#e6ebf2';
      g.fillText(pt.label, p[0] + 7, p[1] + 4);
    }
  }
  g.lineWidth = 1;
}
