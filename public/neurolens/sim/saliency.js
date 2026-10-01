// NEUROLENS · bottom-up visual saliency and image statistics, computed on real pixels.
//
// Itti–Koch–Niebur (1998) style saliency on a small working image (W×H):
//   intensity        I = (r + g + b)/3
//   colour opponency RG = r − g,  BY = b − (r + g)/2          (double-opponent cells, V1/V4)
//   orientation      gradient energy from Sobel filters        (V1 simple/complex cells)
//   motion           |I_t − I_{t−1}|                           (MT/V5)
//   centre–surround  C(c,s) = |blur_c(F) − blur_s(F)|  for (c,s) ∈ {(1,4), (2,6), (3,9)} px
//   normalisation    N(M) = M/max · (1 − m̄)²  (maps with one strong peak are promoted)
//   saliency         S = ⅓·[N(I) + N(C) + N(O)] + w_m·N(M) + w_c·centre bias (Tatler 2007)
//
// Colourfulness (Hasler & Süsstrunk 2003):  rg = R − G,  yb = ½(R + G) − B
//   M = √(σ_rg² + σ_yb²) + 0.3·√(μ_rg² + μ_yb²)
// RMS contrast = σ(L)/μ(L);  edge density = share of pixels with |∇L| above a threshold.
// Scanpath: winner-take-all on S with Gaussian inhibition of return (Koch & Ullman 1985).

export const W = 160, H = 90;

function boxBlur(src, dst, r, tmp) {
  if (r < 1) { dst.set(src); return; }
  const k = 1 / (2 * r + 1);
  for (let y = 0; y < H; y++) { let s = 0; const o = y * W; for (let x = -r; x <= r; x++) s += src[o + Math.min(W - 1, Math.max(0, x))]; for (let x = 0; x < W; x++) { tmp[o + x] = s * k; s += src[o + Math.min(W - 1, x + r + 1)] - src[o + Math.max(0, x - r)]; } }
  for (let x = 0; x < W; x++) { let s = 0; for (let y = -r; y <= r; y++) s += tmp[Math.min(H - 1, Math.max(0, y)) * W + x]; for (let y = 0; y < H; y++) { dst[y * W + x] = s * k; s += tmp[Math.min(H - 1, y + r + 1) * W + x] - tmp[Math.max(0, y - r) * W + x]; } }
}
// Gaussian blur ≈ three box passes.
function blur(src, dst, r, tmp, tmp2) { const b = Math.max(1, Math.round(r / 1.7)); boxBlur(src, tmp2, b, tmp); boxBlur(tmp2, dst, b, tmp); boxBlur(dst, tmp2, b, tmp); dst.set(tmp2); }
function normalize(m) {
  let max = 0, sum = 0; for (let i = 0; i < m.length; i++) { if (m[i] > max) max = m[i]; }
  if (max < 1e-6) return m;
  for (let i = 0; i < m.length; i++) { m[i] /= max; sum += m[i]; }
  const mean = sum / m.length, k = (1 - mean) ** 2;
  for (let i = 0; i < m.length; i++) m[i] *= k;
  return m;
}

export function makeAnalyzer() {
  const N = W * H, F = () => new Float32Array(N);
  const L = F(), RG = F(), BY = F(), O = F(), M = F(), prevL = F(), S = F(), tmp = F(), tmp2 = F(), a = F(), b = F(), cs = F();
  const centre = F();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const dx = (x / W - 0.5) / 0.28, dy = (y / H - 0.5) / 0.32; centre[y * W + x] = Math.exp(-0.5 * (dx * dx + dy * dy)); }
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  let hasPrev = false;
  const pairs = [[1, 4], [2, 6], [3, 9]];
  const centreSurround = (feat, out) => { out.fill(0); for (const [c, s] of pairs) { blur(feat, a, c, tmp, tmp2); blur(feat, b, s, tmp, tmp2); for (let i = 0; i < N; i++) out[i] += Math.abs(a[i] - b[i]); } return normalize(out); };

  return {
    canvas: cv, map: S, motion: M,
    reset() { hasPrev = false; },
    // Analyse a drawable (canvas, image or video). Returns statistics; the map is in `map`.
    analyse(source, { motionW = 0.6, centreW = 0.25, faces = [] } = {}) {
      ctx.drawImage(source, 0, 0, W, H);
      const px = ctx.getImageData(0, 0, W, H).data;
      let mL = 0, mL2 = 0, mrg = 0, myb = 0, mrg2 = 0, myb2 = 0, motion = 0;
      for (let i = 0, j = 0; i < N; i++, j += 4) {
        const r = px[j] / 255, g = px[j + 1] / 255, bl = px[j + 2] / 255, l = (r + g + bl) / 3;
        L[i] = l; RG[i] = r - g; BY[i] = bl - (r + g) / 2;
        const rg = (px[j] - px[j + 1]), yb = 0.5 * (px[j] + px[j + 1]) - px[j + 2];
        mL += l; mL2 += l * l; mrg += rg; myb += yb; mrg2 += rg * rg; myb2 += yb * yb;
        M[i] = hasPrev ? Math.abs(l - prevL[i]) : 0; motion += M[i];
      }
      mL /= N; mrg /= N; myb /= N;
      const sL = Math.sqrt(Math.max(0, mL2 / N - mL * mL)), srg = Math.sqrt(Math.max(0, mrg2 / N - mrg * mrg)), syb = Math.sqrt(Math.max(0, myb2 / N - myb * myb));
      const colourfulness = Math.sqrt(srg * srg + syb * syb) + 0.3 * Math.sqrt(mrg * mrg + myb * myb);
      // Orientation / edges (Sobel magnitude).
      let edges = 0;
      for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
        const i = y * W + x;
        const gx = -L[i - W - 1] - 2 * L[i - 1] - L[i + W - 1] + L[i - W + 1] + 2 * L[i + 1] + L[i + W + 1];
        const gy = -L[i - W - 1] - 2 * L[i - W] - L[i - W + 1] + L[i + W - 1] + 2 * L[i + W] + L[i + W + 1];
        O[i] = Math.hypot(gx, gy); if (O[i] > 0.25) edges++;
      }
      const edgeDensity = edges / N;
      // Feature maps → conspicuity.
      const cI = centreSurround(L, new Float32Array(N));
      const cRG = centreSurround(RG, new Float32Array(N)), cBY = centreSurround(BY, cs);
      for (let i = 0; i < N; i++) cRG[i] += cBY[i];
      normalize(cRG);
      blur(O, a, 2, tmp, tmp2); const cO = normalize(Float32Array.from(a));
      const cM = hasPrev ? (() => { blur(M, a, 2, tmp, tmp2); return normalize(Float32Array.from(a)); })() : new Float32Array(N);
      let max = 0;
      for (let i = 0; i < N; i++) { S[i] = (cI[i] + cRG[i] + cO[i]) / 3 + motionW * cM[i] + centreW * centre[i] * 0.5; }
      // Faces are a learned top-down prior (FFA → pulvinar): add a blob per known face.
      for (const f of faces) { const fx = f.x * W, fy = f.y * H, fr = Math.max(2, f.r * W); for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const d2 = ((x - fx) ** 2 + (y - fy) ** 2) / (fr * fr); if (d2 < 9) S[y * W + x] += f.w * Math.exp(-0.5 * d2); } }
      for (let i = 0; i < N; i++) if (S[i] > max) max = S[i];
      let sum = 0, ent = 0, peak = 0, pi = 0;
      for (let i = 0; i < N; i++) { S[i] /= max || 1; sum += S[i]; if (S[i] > peak) { peak = S[i]; pi = i; } }
      for (let i = 0; i < N; i++) { const p = S[i] / (sum || 1); if (p > 0) ent -= p * Math.log(p); }
      prevL.set(L); hasPrev = true;
      return {
        luminance: mL, contrast: sL / Math.max(0.02, mL), colourfulness, edgeDensity, motion: motion / N,
        entropy: ent / Math.log(N),                 // 0 = one focal point, 1 = attention spread everywhere
        // focus rescales the narrow useful range of 1 − H/H_max (≈ 0.02–0.15) onto 0–1
        focus: Math.min(1, (1 - ent / Math.log(N)) * 7), peak: { x: (pi % W) / W, y: Math.floor(pi / W) / H },
      };
    },
    // Winner-take-all scanpath with inhibition of return.
    scanpath(n = 8, ior = 0.11) {
      const s = Float32Array.from(S), out = [], r = ior * W;
      for (let k = 0; k < n; k++) {
        let best = 0, bi = 0; for (let i = 0; i < s.length; i++) if (s[i] > best) { best = s[i]; bi = i; }
        const x = bi % W, y = Math.floor(bi / W); out.push({ x: x / W, y: y / H, v: best, dur: 180 + 220 * best });
        for (let yy = Math.max(0, y - 3 * r); yy < Math.min(H, y + 3 * r); yy++) for (let xx = Math.max(0, Math.floor(x - 3 * r)); xx < Math.min(W, x + 3 * r); xx++) { const d2 = ((xx - x) ** 2 + (yy - y) ** 2) / (r * r); s[yy * W + xx] *= 1 - Math.exp(-0.5 * d2); }
      }
      return out;
    },
    // Composition: distance of the saliency peak to the nearest rule-of-thirds power point, and L/R symmetry.
    composition() {
      let bx = 0, by = 0, bv = 0; for (let i = 0; i < S.length; i++) if (S[i] > bv) { bv = S[i]; bx = (i % W) / W; by = Math.floor(i / W) / H; }
      let d = 9; for (const px of [1 / 3, 2 / 3]) for (const py of [1 / 3, 2 / 3]) d = Math.min(d, Math.hypot(px - bx, (py - by) * (H / W)));
      let sym = 0, tot = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W / 2; x++) { const a1 = L[y * W + x], a2 = L[y * W + (W - 1 - x)]; sym += Math.abs(a1 - a2); tot += (a1 + a2) / 2 + 1e-3; }
      return { thirds: Math.max(0, 1 - d / 0.2), centred: Math.max(0, 1 - Math.hypot(bx - 0.5, (by - 0.5) * (H / W)) / 0.15), symmetry: Math.max(0, 1 - sym / tot), peak: { x: bx, y: by } };
    },
    // Heat-map image of the current saliency (pink → white palette) for overlays.
    heat(target) {
      const c = target.getContext('2d'); target.width = W; target.height = H;
      const img = c.createImageData(W, H), d = img.data;
      for (let i = 0; i < S.length; i++) { const v = Math.pow(S[i], 1.5); d[i * 4] = 255; d[i * 4 + 1] = 40 + 200 * v * v; d[i * 4 + 2] = 150 + 105 * v; d[i * 4 + 3] = Math.min(190, 240 * v * v); }
      c.putImageData(img, 0, 0);
    },
  };
}
