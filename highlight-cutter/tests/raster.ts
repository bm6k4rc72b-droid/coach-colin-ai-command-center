/** Minimal software rasteriser implementing the demo's Painter, producing luma for the tests. */
import type { Painter } from '../src/core/demo';

const lumaOf = (hex: string) => {
  const n = parseInt(hex.slice(1), 16);
  return 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255);
};

export class Raster implements Painter {
  px: Float32Array;
  constructor(
    public w: number,
    public h: number,
  ) {
    this.px = new Float32Array(w * h);
  }
  rect(x: number, y: number, w: number, h: number, c: string): void {
    const v = lumaOf(c);
    const x0 = Math.max(0, Math.round(x));
    const x1 = Math.min(this.w, Math.round(x + w));
    const y0 = Math.max(0, Math.round(y));
    const y1 = Math.min(this.h, Math.round(y + h));
    for (let j = y0; j < y1; j++) this.px.fill(v, j * this.w + x0, j * this.w + Math.max(x0, x1));
  }
  circle(cx: number, cy: number, r: number, c: string): void {
    const v = lumaOf(c);
    for (let j = Math.max(0, Math.floor(cy - r)); j < Math.min(this.h, Math.ceil(cy + r)); j++)
      for (let i = Math.max(0, Math.floor(cx - r)); i < Math.min(this.w, Math.ceil(cx + r)); i++) if ((i + 0.5 - cx) ** 2 + (j + 0.5 - cy) ** 2 <= r * r) this.px[j * this.w + i] = v;
  }
  text(): void {}
}
