// Self-host the in-browser AI runtimes so the lab works without third-party CDNs:
//  - MediaPipe Tasks Vision WASM, copied from node_modules
//  - TensorFlow.js COCO-SSD (SSDLite MobileNet v2) weights, downloaded once
// Outputs go to public/ (git-ignored) and are served with the app. Failures are non-fatal:
// the app falls back to the CDNs at runtime.
import { copyFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const wasmSrc = join(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const wasmDst = join(root, 'public/mediapipe-wasm');
mkdirSync(wasmDst, { recursive: true });
for (const f of ['vision_wasm_internal.js', 'vision_wasm_internal.wasm', 'vision_wasm_nosimd_internal.js', 'vision_wasm_nosimd_internal.wasm']) {
  copyFileSync(join(wasmSrc, f), join(wasmDst, f));
}
console.log('MediaPipe WASM → public/mediapipe-wasm');

const base = 'https://storage.googleapis.com/tfjs-models/savedmodel/ssdlite_mobilenet_v2/';
const cocoDst = join(root, 'public/models/coco-ssd');
mkdirSync(cocoDst, { recursive: true });
try {
  if (!existsSync(join(cocoDst, 'model.json'))) {
    const model = await (await fetch(base + 'model.json')).json();
    const paths = model.weightsManifest.flatMap((g) => g.paths);
    for (const p of paths) {
      const r = await fetch(base + p);
      if (!r.ok) throw new Error(`${p}: HTTP ${r.status}`);
      writeFileSync(join(cocoDst, p), Buffer.from(await r.arrayBuffer()));
    }
    writeFileSync(join(cocoDst, 'model.json'), JSON.stringify(model));
  }
  console.log('COCO-SSD weights → public/models/coco-ssd');
} catch (e) {
  console.warn(`COCO-SSD weights not downloaded (${e.message}); the app will use the CDN.`);
}
