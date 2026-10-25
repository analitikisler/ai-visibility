// Loads optional .env files before anything reads process.env. Imported first by index.ts.
// Order: server/.env, then repo-root .env; values already in the environment always win.
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
for (const file of [join(here, '../.env'), join(here, '../../.env')]) {
  if (existsSync(file)) process.loadEnvFile(file);
}
