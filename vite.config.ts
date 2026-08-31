import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  // GitHub Pages serves a project site from /<repo>/, not from the domain root,
  // so asset URLs need that prefix. Left as '/' for local dev and for hosts that
  // serve from the root (Vercel, Netlify, Replit); the deploy script sets it.
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  resolve: {
    alias: {
      // See src/stubs/mediapipe-pose.ts — the BlazePose runtime is unused here
      // and its non-ESM bundle breaks the production build.
      '@mediapipe/pose': fileURLToPath(new URL('./src/stubs/mediapipe-pose.ts', import.meta.url)),
    },
  },
  server: { host: true, port: 5173 },
  build: { target: 'es2020' },
});
