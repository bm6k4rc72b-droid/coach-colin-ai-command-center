// Self-host the TensorFlow.js COCO-SSD (SSDLite MobileNet v2) weights so object detection works
// without third-party CDNs. Output goes to public/ (git-ignored) and is served with the app.
// Failure is non-fatal: the app falls back to Google's model storage at runtime.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
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
