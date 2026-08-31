import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

export default defineConfig({
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
