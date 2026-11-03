/**
 * NVIDIA-AI-IOT's NanoOWL tree prompts and NanoSAM segmentation, ported to the
 * browser.
 *
 * NanoOWL and NanoSAM ship as TensorRT engines for Jetson. Their models are
 * not tied to TensorRT, so the parts that matter are reproduced here exactly,
 * from NVIDIA's own source:
 *
 * - NanoOWL's tree prompt (nanoowl/tree.py, Tree.from_prompt): "[ ]" detects,
 *   "( )" classifies, "," separates labels at one level, and nesting means
 *   "inside each of those". `[a person [a face (smiling, frowning)], a truck]`
 *   finds people and trucks, finds faces inside each person, and classifies
 *   each face as smiling or frowning. Detection runs OWL-ViT and
 *   classification runs CLIP — the two models NanoOWL uses — through
 *   transformers.js.
 * - NanoSAM (nanosam/utils/predictor.py): a ResNet18 image encoder distilled
 *   from MobileSAM plus MobileSAM's mask decoder. Pre-processing (ImageNet
 *   mean/std on 0–255, longest side 1024, top-left padding), point scaling
 *   and the mask upscale (crop the valid 256-grid corner, bilinear to the
 *   image, logits > 0) follow predictor.py line for line, so the same two
 *   ONNX files NVIDIA publishes run here in ONNX Runtime Web.
 *
 * Pure: no DOM, no models. The browser glue lives in ai-ui.js.
 *
 * @module black-optic-6/ai/nvidia
 */

/* ======================================================= NanoOWL trees */

export const DETECT = 'detect';
export const CLASSIFY = 'classify';

/**
 * Parse a NanoOWL tree prompt. A direct port of Tree.from_prompt, including
 * its error messages.
 *
 * @param {string} prompt
 * @returns {{nodes: {op: string, input: number, outputs: number[]}[], labels: string[]}}
 */
export function treeFromPrompt(prompt) {
  const nodes = [];
  const stack = [];
  const labelStack = [0];
  const labels = ['image'];
  let index = 0;
  for (const ch of String(prompt)) {
    if (ch === '[' || ch === '(') {
      index += 1;
      const node = { op: ch === '[' ? DETECT : CLASSIFY, input: labelStack[labelStack.length - 1], outputs: [index] };
      stack.push(node); labelStack.push(index); labels.push(''); nodes.push(node);
    } else if (ch === ']' || ch === ')') {
      const want = ch === ']' ? DETECT : CLASSIFY;
      if (!stack.length || stack[stack.length - 1].op !== want) throw new Error(`Unexpected '${ch}'.`);
      stack.pop(); labelStack.pop();
    } else if (ch === ',') {
      if (!stack.length) throw new Error("Unexpected ','.");
      labelStack.pop(); index += 1; labelStack.push(index);
      stack[stack.length - 1].outputs.push(index); labels.push('');
    } else {
      labels[labelStack[labelStack.length - 1]] += ch;
    }
  }
  if (stack.length) throw new Error(stack[stack.length - 1].op === DETECT ? "Missing ']'." : "Missing ')'.");
  return { nodes, labels: labels.map((l) => l.trim()) };
}

/** The node that produces a label, or null for the root "image". */
export function nodeFor(tree, labelIndex) {
  return tree.nodes.find((n) => n.outputs.includes(labelIndex)) ?? null;
}

/** Labels a tree detects, written as paths ("a person › a face"). */
export function detectPaths(tree) {
  const path = (i) => { const n = nodeFor(tree, i); return n && n.input !== 0 ? `${path(n.input)} › ${tree.labels[i]}` : tree.labels[i]; };
  const out = [];
  for (const n of tree.nodes) if (n.op === DETECT) for (const i of n.outputs) out.push(path(i));
  return out;
}

/**
 * Run a tree over an image, breadth first, the way NanoOWL's TreePredictor
 * does: every detect node runs inside each box its input label produced;
 * every classify node labels each of those boxes with its best class.
 *
 * @param {object} tree From treeFromPrompt.
 * @param {number[]} imageBox [x, y, w, h] of the whole frame.
 * @param {(box: number[], labels: string[]) => Promise<{box: number[], score: number, label: number}[]>} detect
 *   Boxes in frame pixels; `label` indexes into the labels passed.
 * @param {(box: number[], labels: string[]) => Promise<{label: number, score: number}>} classify
 * @returns {Promise<{id: number, parent: number|null, box: number[], label: number, score: number, path: string, classes: {label: string, score: number}[]}[]>}
 */
export async function runTree(tree, imageBox, detect, classify) {
  const out = [];
  const byLabel = new Map([[0, [{ id: -1, box: imageBox }]]]);
  const queue = [0];
  let nextId = 0;
  const path = (i) => { const n = nodeFor(tree, i); return n && n.input !== 0 ? `${path(n.input)} › ${tree.labels[i]}` : tree.labels[i]; };
  while (queue.length) {
    const li = queue.shift();
    const parents = byLabel.get(li) ?? [];
    for (const node of tree.nodes.filter((n) => n.input === li)) {
      const names = node.outputs.map((i) => tree.labels[i]);
      for (const p of parents) {
        if (node.op === DETECT) {
          for (const d of await detect(p.box, names)) {
            const label = node.outputs[d.label];
            const det = { id: nextId++, parent: p.id >= 0 ? p.id : null, box: d.box, label, score: d.score, path: path(label), classes: [] };
            out.push(det);
            if (!byLabel.has(label)) byLabel.set(label, []);
            byLabel.get(label).push(det);
          }
        } else {
          const c = await classify(p.box, names);
          const det = out.find((d) => d.id === p.id);
          if (det) det.classes.push({ label: tree.labels[node.outputs[c.label]], score: c.score });
        }
      }
      if (node.op === DETECT) for (const i of node.outputs) if (!queue.includes(i)) queue.push(i);
    }
  }
  return out;
}

/** Map a box found inside a crop back to frame pixels. */
export function fromCrop(box, crop, cropScale = 1) {
  return [crop[0] + box[0] / cropScale, crop[1] + box[1] / cropScale, box[2] / cropScale, box[3] / cropScale];
}

/* ========================================================== NanoSAM */

export const NANOSAM_SIZE = 1024;
export const NANOSAM_MEAN = [123.675, 116.28, 103.53];
export const NANOSAM_STD = [58.395, 57.12, 57.375];

/** Resized size inside the 1024 square (predictor.preprocess_image: int() truncation). */
export function nanosamResize(width, height, size = NANOSAM_SIZE) {
  const aspect = width / height;
  return aspect >= 1 ? { w: size, h: Math.trunc(size / aspect) } : { w: Math.trunc(size * aspect), h: size };
}

/**
 * Normalised CHW tensor from resized RGBA pixels, zero-padded at the bottom
 * and right to size × size.
 *
 * @param {Uint8ClampedArray} rgba Resized pixels, rw × rh.
 * @returns {Float32Array} 3 × size × size.
 */
export function nanosamTensor(rgba, rw, rh, size = NANOSAM_SIZE) {
  const t = new Float32Array(3 * size * size);
  for (let y = 0; y < rh; y += 1) for (let x = 0; x < rw; x += 1) {
    const s = (y * rw + x) * 4; const d = y * size + x;
    for (let c = 0; c < 3; c += 1) t[c * size * size + d] = (rgba[s + c] - NANOSAM_MEAN[c]) / NANOSAM_STD[c];
  }
  return t;
}

/** Click points (image pixels) to decoder coordinates (predictor.preprocess_points). */
export function nanosamPoints(points, width, height, size = NANOSAM_SIZE) {
  const scale = size / Math.max(width, height);
  return points.map(([x, y]) => [x * scale, y * scale]);
}

/**
 * One low-res mask (logits) to a full-resolution binary mask
 * (predictor.upscale_mask: crop the valid corner, bilinear, align_corners=False).
 *
 * @param {Float32Array} logits The decoder's low_res_masks for one mask, n × n.
 * @param {number} width Image width.
 * @param {number} height Image height.
 * @param {number} [n=256]
 * @returns {Uint8Array} width × height, 1 inside.
 */
export function nanosamUpscale(logits, width, height, n = 256) {
  const limX = width > height ? n : Math.trunc((n * width) / height);
  const limY = width > height ? Math.trunc((n * height) / width) : n;
  const out = new Uint8Array(width * height);
  const sx = limX / width; const sy = limY / height;
  for (let y = 0; y < height; y += 1) {
    const fy = Math.min(limY - 1, Math.max(0, (y + 0.5) * sy - 0.5));
    const y0 = Math.floor(fy); const y1 = Math.min(limY - 1, y0 + 1); const ty = fy - y0;
    for (let x = 0; x < width; x += 1) {
      const fx = Math.min(limX - 1, Math.max(0, (x + 0.5) * sx - 0.5));
      const x0 = Math.floor(fx); const x1 = Math.min(limX - 1, x0 + 1); const tx = fx - x0;
      const v = (logits[y0 * n + x0] * (1 - tx) + logits[y0 * n + x1] * tx) * (1 - ty)
        + (logits[y1 * n + x0] * (1 - tx) + logits[y1 * n + x1] * tx) * ty;
      out[y * width + x] = v > 0 ? 1 : 0;
    }
  }
  return out;
}
