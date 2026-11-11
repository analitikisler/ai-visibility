// Dev server on 5180 proxies the API (4400) so the SPA and API share an origin.
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentSecurityPolicy, inlineScripts } from '../shared/csp.ts';

const API = process.env.API_URL ?? 'http://localhost:4400';

/**
 * Writes dist/_headers, which Cloudflare applies to the static files it serves (the Node server sets the same headers
 * itself): the CSP with the hash of each inline script in the built index.html, and the same hardening headers.
 */
function securityHeaders(): Plugin {
  return {
    name: 'ai-visibility:security-headers',
    apply: 'build',
    writeBundle(options) {
      const dir = options.dir ?? 'dist';
      const html = readFileSync(join(dir, 'index.html'), 'utf8');
      const hashes = inlineScripts(html).map((s) => createHash('sha256').update(s).digest('base64'));
      const headers = ['/*', `  Content-Security-Policy: ${contentSecurityPolicy(hashes)}`, '  X-Content-Type-Options: nosniff', '  X-Frame-Options: SAMEORIGIN', ''];
      writeFileSync(join(dir, '_headers'), headers.join('\n'));
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), securityHeaders()],
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
