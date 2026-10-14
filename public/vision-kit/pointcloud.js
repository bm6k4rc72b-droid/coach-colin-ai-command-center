/**
 * Depth map → 3D point cloud, the way a ROS 2 depth node publishes PointCloud2: back-project
 * each pixel through a pinhole camera model (fx, fy, cx, cy from CameraInfo, or here from the
 * field of view), drop sky / invalid pixels, downsample on a stride, and colourise.
 *
 * Monocular models such as Depth Anything return relative inverse depth (disparity) unless a
 * metric head is used; `disparityToDepth` converts with a stated scale so the cloud's units are
 * honest ("relative units" until calibrated against one known distance).
 *
 * Pure: arrays in, typed arrays out.
 *
 * @module vision-kit/pointcloud
 */

/** Pinhole intrinsics from image size and horizontal field of view (degrees). */
export function intrinsicsFromFov(width, height, hfovDeg) {
  const fx = width / 2 / Math.tan((hfovDeg * Math.PI) / 360);
  return { fx, fy: fx, cx: width / 2, cy: height / 2, width, height };
}

/** Relative inverse depth → depth, with a scale (metres at disparity 1) and a floor. */
export function disparityToDepth(disp, scale = 1, eps = 1e-3) {
  const out = new Float32Array(disp.length);
  for (let i = 0; i < disp.length; i++) out[i] = scale / Math.max(disp[i], eps);
  return out;
}

/** Normalise any array to 0..1 (min–max). */
export function normalise(a) {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of a) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  const span = hi - lo || 1;
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = (a[i] - lo) / span;
  return out;
}

/** Turbo colour map (Google, 2019) polynomial approximation: t in 0..1 → [r, g, b] 0..1. */
export function turbo(t) {
  const x = Math.min(1, Math.max(0, t));
  const r = 0.13572138 + x * (4.6153926 + x * (-42.66032258 + x * (132.13108234 + x * (-152.94239396 + x * 59.28637943))));
  const g = 0.09140261 + x * (2.19418839 + x * (4.84296658 + x * (-14.18503333 + x * (4.27729857 + x * 2.82956604))));
  const b = 0.1066733 + x * (12.64194608 + x * (-60.58204836 + x * (110.36276771 + x * (-89.90310912 + x * 27.34824973))));
  return [Math.min(1, Math.max(0, r)), Math.min(1, Math.max(0, g)), Math.min(1, Math.max(0, b))];
}

/**
 * Back-project a depth map to points.
 * @param {ArrayLike<number>} depth row-major, width × height
 * @param {{fx:number, fy:number, cx:number, cy:number, width:number, height:number}} K
 * @param {{stride?:number, maxDepth?:number, minDepth?:number, rgb?:ArrayLike<number>, colorBy?:'rgb'|'depth'}} [opt]
 *   rgb: optional RGBA bytes of the same image for true-colour points.
 * @returns {{positions: Float32Array, colors: Float32Array, count: number, dropped: number}}
 */
export function depthToPoints(depth, K, opt = {}) {
  const { stride = 2, maxDepth = Infinity, minDepth = 0, rgb = null, colorBy = rgb ? 'rgb' : 'depth' } = opt;
  const W = K.width;
  const H = K.height;
  const cap = Math.ceil(W / stride) * Math.ceil(H / stride);
  const pos = new Float32Array(cap * 3);
  const col = new Float32Array(cap * 3);
  let n = 0;
  let dropped = 0;
  let dMax = 0;
  for (let i = 0; i < depth.length; i++) if (depth[i] < maxDepth && depth[i] > dMax) dMax = depth[i];
  for (let v = 0; v < H; v += stride) {
    for (let u = 0; u < W; u += stride) {
      const i = v * W + u;
      const z = depth[i];
      if (!(z > minDepth) || !(z < maxDepth)) {
        dropped++;
        continue;
      }
      // Camera frame (x right, y down, z forward) → display frame (y up).
      pos[n * 3] = ((u - K.cx) * z) / K.fx;
      pos[n * 3 + 1] = -((v - K.cy) * z) / K.fy;
      pos[n * 3 + 2] = -z;
      let c;
      if (colorBy === 'rgb' && rgb) c = [rgb[i * 4] / 255, rgb[i * 4 + 1] / 255, rgb[i * 4 + 2] / 255];
      else c = turbo(1 - z / (dMax || 1));
      col[n * 3] = c[0];
      col[n * 3 + 1] = c[1];
      col[n * 3 + 2] = c[2];
      n++;
    }
  }
  return { positions: pos.subarray(0, n * 3), colors: col.subarray(0, n * 3), count: n, dropped };
}
