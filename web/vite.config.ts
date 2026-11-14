import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

// Two pages:
//   public/index.html -> the landing page: plain HTML + its design kit in public/assets/, copied as is
//   app.html          -> the fire calendar itself (React, built by Vite)
// The team keeps a single .env at the repo root, so Vite reads it from there.
export default defineConfig({
  plugins: [
    react(),
    {
      // in dev, "/" opens the landing page in public/ (the build copies it to dist/index.html)
      name: 'landing-at-root',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url === '/' || req.url?.startsWith('/?')) req.url = '/index.html';
          next();
        });
      },
    },
  ],
  envDir: '..',
  base: './',
  build: {
    // public/assets/ holds the landing page's kit, so the app's bundles go elsewhere.
    assetsDir: '_app',
    rollupOptions: {
      input: { app: resolve(__dirname, 'app.html') },
    },
  },
});
