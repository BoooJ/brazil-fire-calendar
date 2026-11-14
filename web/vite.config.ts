import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The .env file lives at the repo root (one file for the whole team).
// Vite only exposes variables starting with VITE_, so keys stay out of the bundle.
export default defineConfig({
  plugins: [react()],
  envDir: '..',
  base: './',
});
