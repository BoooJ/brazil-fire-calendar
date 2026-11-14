import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The .env file lives at the repo root (one file for the whole team).
// Vite only exposes variables starting with VITE_, so keys stay out of the bundle.
export default defineConfig({
  plugins: [react()],
  envDir: '..',
  base: './',
  build: {
    // public/assets/ holds the landing page's design kit (copied as is), so the bundles go elsewhere.
    assetsDir: '_app',
    // maplibre-gl and echarts are big, but each is its own lazy chunk (see Tool.tsx).
    chunkSizeWarningLimit: 1200,
  },
});
