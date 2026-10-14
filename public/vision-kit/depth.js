/**
 * Monocular depth in the browser with transformers.js running Depth Anything V2 (small) through
 * ONNX Runtime Web. This is the browser counterpart of the ROS 2 Depth Anything V3 TensorRT node:
 * that node runs V3 on a GPU and publishes a metric PointCloud2; this runs the smaller V2 model
 * on WebGPU/WASM and returns relative inverse depth, which `pointcloud.js` back-projects.
 *
 * The model (~25 MB) downloads once and is cached by the browser. No pixels are uploaded.
 *
 * @module vision-kit/depth
 */

const LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.0.2/dist/transformers.min.js';
export const MODEL = 'onnx-community/depth-anything-v2-small';

let pipe = null;
let device = null;

/** Load (once) the depth-estimation pipeline. */
export async function loadDepth(onStatus = () => {}) {
  if (pipe) return { device };
  onStatus('Loading transformers.js…');
  const { pipeline, env } = await import(/* @vite-ignore */ LIB);
  env.allowLocalModels = false;
  const progress = (p) => {
    if (p.status === 'progress' && p.total) onStatus(`Downloading model ${Math.round((p.loaded / p.total) * 100)}%`);
  };
  const tryDevice = async (d) => {
    pipe = await pipeline('depth-estimation', MODEL, { device: d, dtype: d === 'webgpu' ? 'fp32' : 'q8', progress_callback: progress });
    device = d;
  };
  try {
    if (!navigator.gpu) throw new Error('no WebGPU');
    await tryDevice('webgpu');
  } catch {
    await tryDevice('wasm');
  }
  onStatus(`Depth model ready · ${device}`);
  return { device };
}

/**
 * Estimate depth for a canvas.
 * @param {HTMLCanvasElement} canvas
 * @returns {Promise<{disparity: Float32Array, width: number, height: number, ms: number}>}
 */
export async function estimateDepth(canvas) {
  if (!pipe) throw new Error('Depth model not loaded');
  const t0 = performance.now();
  const out = await pipe(canvas.toDataURL('image/jpeg', 0.9));
  const img = out.depth; // RawImage, 8-bit, larger = nearer
  const n = img.width * img.height;
  const disparity = new Float32Array(n);
  const ch = img.channels ?? 1;
  for (let i = 0; i < n; i++) disparity[i] = img.data[i * ch] / 255;
  return { disparity, width: img.width, height: img.height, ms: performance.now() - t0 };
}

/**
 * A synthetic depth scene for when there is no camera or the model is still downloading:
 * a ground plane, a back wall/sky band and a few boxes, as relative disparity.
 */
export function syntheticDepth(width = 160, height = 90, t = 0) {
  const d = new Float32Array(width * height);
  const rgb = new Uint8ClampedArray(width * height * 4);
  const horizon = height * 0.42;
  const objs = [
    { u: 0.22 + 0.04 * Math.sin(t * 0.5), w: 0.12, h: 0.38, disp: 0.55, col: [214, 170, 120] },
    { u: 0.56, w: 0.2, h: 0.3, disp: 0.38, col: [150, 110, 90] },
    { u: 0.8 + 0.03 * Math.cos(t * 0.7), w: 0.08, h: 0.22, disp: 0.7, col: [240, 230, 210] },
  ];
  for (let v = 0; v < height; v++) {
    for (let u = 0; u < width; u++) {
      const i = v * width + u;
      let disp;
      let c;
      if (v < horizon) {
        disp = 0; // sky — dropped by maxDepth
        const k = v / horizon;
        c = [40 + 120 * k, 60 + 90 * k, 110 + 60 * k];
      } else {
        disp = 0.05 + 0.95 * ((v - horizon) / (height - horizon)) ** 1.3;
        c = [70, 90 + 40 * disp, 50];
      }
      for (const o of objs) {
        const x0 = o.u * width;
        const yb = horizon + (height - horizon) * o.disp;
        if (u >= x0 && u < x0 + o.w * width && v <= yb && v >= yb - o.h * height) {
          disp = o.disp;
          c = o.col.map((x) => x * (0.8 + 0.2 * (1 - (yb - v) / (o.h * height))));
        }
      }
      d[i] = disp;
      rgb[i * 4] = c[0];
      rgb[i * 4 + 1] = c[1];
      rgb[i * 4 + 2] = c[2];
      rgb[i * 4 + 3] = 255;
    }
  }
  return { disparity: d, rgb, width, height };
}
