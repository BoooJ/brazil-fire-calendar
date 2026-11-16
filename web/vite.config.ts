import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { FULL_NAME, SEAL, markSvg } from './src/brand';

// The loading screen (#splash in index.html) shows the logo before any script runs, so its SVG is written
// into the page here, from the same artwork the pages use (src/brand.ts).
const brandInHtml = (): Plugin => ({
  name: 'fogo-brand',
  transformIndexHtml: (html) =>
    html
      .replace('<!--brand:seal-->', markSvg(SEAL, 'class="splash-seal" aria-hidden="true"'))
      .replace('<!--brand:name-->', markSvg(FULL_NAME, 'class="splash-name" aria-hidden="true"')),
});

// The .env file lives at the repo root (one file for the whole team).
// Vite only exposes variables starting with VITE_, so keys stay out of the bundle.
export default defineConfig({
  plugins: [react(), brandInHtml()],
  envDir: '..',
  base: './',
  build: {
    // public/assets/ holds the landing page's design kit (copied as is), so the bundles go elsewhere.
    assetsDir: '_app',
    // maplibre-gl and echarts are big, but each is its own lazy chunk (see Tool.tsx).
    chunkSizeWarningLimit: 1200,
  },
});
