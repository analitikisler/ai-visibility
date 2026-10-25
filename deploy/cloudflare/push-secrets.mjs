// Copies engine API keys and R2 credentials from the repo-root .env into the Worker's secrets (`wrangler secret bulk`),
// without printing them. Run from the repo root: node deploy/cloudflare/push-secrets.mjs
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseEnv } from 'node:util';
import { readFileSync } from 'node:fs';

const KEYS = [
  'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY', 'PERPLEXITY_API_KEY', 'XAI_API_KEY', 'DEEPSEEK_API_KEY',
  'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY',
];
const env = parseEnv(readFileSync('.env', 'utf8'));
const secrets = Object.fromEntries(KEYS.map((k) => [k, (env[k] ?? '').trim()]).filter(([, v]) => v));
const missing = KEYS.filter((k) => !secrets[k]);
if (!secrets.R2_ACCESS_KEY_ID || !secrets.R2_SECRET_ACCESS_KEY) {
  console.error('R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY must be set in .env (see deploy/cloudflare/README.md).');
  process.exit(1);
}
const dir = mkdtempSync(join(tmpdir(), 'ai-visibility-secrets-'));
const file = join(dir, 'secrets.json');
try {
  writeFileSync(file, JSON.stringify(secrets), { mode: 0o600 });
  execFileSync('npx', ['wrangler', 'secret', 'bulk', file], { stdio: ['ignore', 'inherit', 'inherit'] });
  console.log(`Uploaded ${Object.keys(secrets).length} secrets: ${Object.keys(secrets).join(', ')}`);
  if (missing.length) console.log(`Not set (engines stay simulated): ${missing.join(', ')}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
