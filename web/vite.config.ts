import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The team keeps a single .env at the repo root, so Vite reads it from there.
export default defineConfig({
  plugins: [react()],
  envDir: '..',
  base: './',
});
