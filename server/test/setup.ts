// Imported first by every test file: a throwaway database per test process and no engine keys, so nothing is live.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'ai-visibility-test-'));
delete process.env.DB_PATH;
for (const key of Object.keys(process.env)) if (/_API_KEY$|_MODEL$/.test(key)) delete process.env[key];
