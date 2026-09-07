/**
 * QB IQ — build config.
 *
 * The app is a leaf of the parent Command Center site and is mounted at
 * `/qb-iq/` locally and at `/<repo>/qb-iq/` on GitHub Pages, so every asset
 * path is emitted relative (`base: './'`) and the bundle is written straight
 * into the parent's `public/` tree, where the outer Vite build picks it up
 * verbatim.
 */
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    outDir: '../../public/qb-iq',
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 900,
  },
  server: { port: 5180 },
  preview: { port: 5180 },
});
