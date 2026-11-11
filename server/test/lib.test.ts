import './setup.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { redactSecrets } from '../src/engines/index.ts';
import { estimateCostUsd } from '../src/engines/pricing.ts';
import { extractJson } from '../src/lib/llm.ts';
import { RateLimiter } from '../src/lib/rate-limit.ts';
import { BlockedUrlError, checkUrl, isPrivateIp } from '../src/lib/safe-fetch.ts';

test('safe fetch refuses non-public destinations', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '169.254.169.254', '192.168.1.1', '::1', 'fe80::1', '::ffff:10.0.0.1', 'not-an-ip']) assert.ok(isPrivateIp(ip), ip);
  for (const ip of ['8.8.8.8', '2606:4700:4700::1111']) assert.ok(!isPrivateIp(ip), ip);
  for (const url of ['http://localhost/', 'http://intranet/', 'https://10.0.0.5/', 'ftp://example.com/', 'https://user:pw@example.com/', 'https://db.internal/', 'https://[::1]/']) {
    assert.throws(() => checkUrl(url), BlockedUrlError, url);
  }
  assert.equal(checkUrl('https://example.com/a?b=1').hostname, 'example.com');
});

test('secrets are redacted from stored error text', () => {
  const out = redactSecrets('401 for key sk-proj-abcdefgh12345678 at https://x.test/v1?key=AIzaSyA1234567890123456789012&z=1 (my-own-secret-value)', ['my-own-secret-value']);
  assert.ok(!/abcdefgh|AIzaSy|my-own-secret/.test(out), out);
  assert.match(out, /\?key=\[redacted\]&z=1/);
});

test('cost estimate: cached input and batch discount', () => {
  const usage = { inputTokens: 1_000_000, outputTokens: 100_000, cachedTokens: 400_000, searchCalls: 2 };
  // Sonnet 5.5: 600k input at $2 + 400k cached at $0.10 + 100k output at $10, plus two searches at $0.01.
  assert.equal(estimateCostUsd('claude', 'claude-sonnet-5-5', usage, { batch: false }), 2.26);
  assert.equal(estimateCostUsd('claude', 'claude-sonnet-5-5', usage, { batch: true }), 1.14);
  assert.ok(estimateCostUsd('claude', 'claude-fable-5-2', usage, { batch: false }) > estimateCostUsd('claude', 'claude-opus-5-5', usage, { batch: false }));
});

test('extractJson finds the first balanced value', () => {
  assert.equal(extractJson('Here you go:\n```json\n{"a": [1, 2], "b": "}"}\n```\nthanks'), '{"a": [1, 2], "b": "}"}');
  assert.equal(extractJson('no json here'), null);
});

test('rate limiter: burst, refill and wait time', () => {
  const limiter = new RateLimiter(1, 2);
  assert.equal(limiter.take('k', 1, 0), 0);
  assert.equal(limiter.take('k', 1, 0), 0);
  assert.equal(limiter.take('k', 1, 0), 1);
  assert.equal(limiter.take('k', 1, 1000), 0);
  assert.equal(limiter.take('other', 1, 0), 0);
});
