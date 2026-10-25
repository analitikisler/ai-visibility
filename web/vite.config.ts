// Dev server on 5180 proxies the API (4400) so the SPA and API share an origin.
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath } from 'node:url';

const API = process.env.API_URL ?? 'http://localhost:4400';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
      '@brand': fileURLToPath(new URL('../brand', import.meta.url)),
    },
  },
  server: {
    port: 5180,
    strictPort: true,
    proxy: { '/api': API, '/px.js': API },
    fs: { allow: ['..'] },
  },
  build: { outDir: 'dist', sourcemap: false, chunkSizeWarningLimit: 1500 },
});
