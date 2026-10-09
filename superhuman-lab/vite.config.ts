import { createReadStream, readFileSync } from 'node:fs';
import path from 'node:path';
import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Reuse Human Atlas's BodyParts3D assets instead of duplicating them in git:
// served from ../human-atlas in dev, copied into dist/atlas/ at build time.
const ATLAS_DIR = path.resolve(import.meta.dirname, '../human-atlas/public/anatomy');
const ATLAS_FILES = ['manifest.json', 'skeleton.glb', 'muscles.glb', 'heart.glb', 'sensory.glb', 'arteries.glb', 'veins.glb', 'nervous.glb', 'respiratory.glb'];

function atlasAssets(): Plugin {
  return {
    name: 'atlas-assets',
    configureServer(server) {
      server.middlewares.use('/atlas', (req, res, next) => {
        const file = (req.url ?? '').slice(1).split('?')[0];
        if (!ATLAS_FILES.includes(file)) return next();
        res.setHeader('Content-Type', file.endsWith('.json') ? 'application/json' : 'model/gltf-binary');
        createReadStream(path.join(ATLAS_DIR, file)).pipe(res);
      });
    },
    generateBundle() {
      for (const file of ATLAS_FILES) {
        this.emitFile({ type: 'asset', fileName: `atlas/${file}`, source: readFileSync(path.join(ATLAS_DIR, file)) });
      }
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), atlasAssets()],
  build: { target: 'es2022', chunkSizeWarningLimit: 1600 },
});
