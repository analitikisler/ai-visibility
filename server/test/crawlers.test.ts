import './setup.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classifyAgent, classifyReferrer } from '../src/crawlers/catalog.ts';
import { ingestLogUpload, parseLogText, parseLogTime } from '../src/crawlers/logs.ts';
import { get } from '../src/db/index.ts';
import { createProject } from '../src/services/projects.ts';

const GPTBOT = 'Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko); compatible; GPTBot/1.3; +https://openai.com/gptbot';
const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const now = new Date();
const clf = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, '0');
  const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()];
  return `${p(d.getUTCDate())}/${mon}/${d.getUTCFullYear()}:${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())} +0000`;
};
const hourAgo = new Date(now.getTime() - 3600_000);

test('agents: user agent, signed requests, ordinary browsers', () => {
  assert.equal(classifyAgent(GPTBOT)?.id, 'gptbot');
  assert.equal(classifyAgent(CHROME), null);
  assert.equal(classifyAgent(CHROME, '"https://chatgpt.com"')?.id, 'chatgpt-agent');
  assert.equal(classifyAgent(''), null);
});

test('referrers: host and utm_source', () => {
  assert.equal(classifyReferrer('https://chatgpt.com/')?.id, 'chatgpt');
  assert.equal(classifyReferrer('', '/pricing?utm_source=perplexity')?.id, 'perplexity');
  assert.equal(classifyReferrer('https://www.google.com/search?q=x'), null);
  assert.equal(classifyReferrer('', ''), null);
});

test('log time: CLF offsets, ISO and epochs', () => {
  assert.equal(parseLogTime('10/Oct/2026:13:55:36 -0700'), '2026-10-10T20:55:36.000Z');
  assert.equal(parseLogTime('2026-10-10T20:55:36Z'), '2026-10-10T20:55:36.000Z');
  assert.equal(parseLogTime(1_791_665_736), new Date(1_791_665_736_000).toISOString());
  assert.equal(parseLogTime('not a date'), null);
});

test('log lines: combined format and JSON lines; junk is skipped', () => {
  const text = [
    `20.171.207.10 - - [${clf(hourAgo)}] "GET /pricing?x=1 HTTP/1.1" 200 5120 "-" "${GPTBOT}"`,
    JSON.stringify({ time: hourAgo.toISOString(), request: 'GET /docs HTTP/2', status: 200, http_user_agent: CHROME, http_referer: 'https://chatgpt.com/' }),
    'this is not a log line',
    `1.2.3.4 - - [01/Jan/2001:00:00:00 +0000] "GET /old HTTP/1.1" 200 1 "-" "${GPTBOT}"`,
  ].join('\n');
  const { hits, skipped } = parseLogText(text);
  assert.equal(skipped, 2);
  assert.deepEqual(hits.map((h) => [h.path, h.status, h.ip]), [['/pricing', 200, '20.171.207.10'], ['/docs', 200, '']]);
  assert.equal(hits[1]!.referrer, 'https://chatgpt.com/');
});

test('log upload: stores AI hits once; a second upload reports duplicates', () => {
  const project = createProject({ name: 'Logs', domain: 'logs.example.com' });
  const text = [
    `20.171.207.10 - - [${clf(hourAgo)}] "GET /pricing HTTP/1.1" 200 5120 "-" "${GPTBOT}"`,
    `9.9.9.9 - - [${clf(hourAgo)}] "GET /blog HTTP/1.1" 200 900 "https://chatgpt.com/" "${CHROME}"`,
    `8.8.8.8 - - [${clf(hourAgo)}] "GET / HTTP/1.1" 200 900 "-" "${CHROME}"`,
  ].join('\n');
  const first = ingestLogUpload(project.id, text, 'text/plain');
  assert.deepEqual(first, { ok: true, parsed: 3, botEvents: 1, referralEvents: 1, skipped: 0, duplicates: 0, ignored: 1 });
  const second = ingestLogUpload(project.id, text, 'text/plain');
  assert.deepEqual(second, { ok: true, parsed: 3, botEvents: 0, referralEvents: 0, skipped: 0, duplicates: 2, ignored: 1 });
  assert.equal(get<{ n: number }>('SELECT COUNT(*) n FROM bot_events WHERE project_id = ?', [project.id])?.n, 1);
  assert.equal(ingestLogUpload(project.id, '   ', 'text/plain').ok, false);
});
