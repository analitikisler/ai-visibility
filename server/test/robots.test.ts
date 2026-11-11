import './setup.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { agentAccess, isAllowed, parseRobots, patternMatches, rulesFor } from '../src/audit/robots.ts';

test('patterns: prefix, wildcard and end anchor', () => {
  assert.ok(patternMatches('/blog', '/blog/post'));
  assert.ok(patternMatches('/*.pdf$', '/files/a.pdf'));
  assert.ok(!patternMatches('/*.pdf$', '/files/a.pdf?x=1'));
  assert.ok(!patternMatches('/private', '/public/private'));
  // A pattern that makes a `.*`-joined regex backtrack exponentially must return quickly.
  assert.ok(!patternMatches('/*a*a*a*a*a*a*a*a*b', `/${'a'.repeat(5000)}`));
});

const robots = parseRobots(`
User-agent: *
Disallow: /app/
Allow: /app/public

User-agent: GPTBot
User-agent: ClaudeBot
Disallow: /

# a second group for the same agent is merged
User-agent: gptbot
Allow: /llms.txt

Sitemap: https://example.com/sitemap.xml
`);

test('groups: consecutive user-agent lines share rules; same agent merges', () => {
  assert.deepEqual(robots.sitemaps, ['https://example.com/sitemap.xml']);
  assert.equal(rulesFor(robots, ['GPTBot']).rules.length, 2);
  assert.equal(rulesFor(robots, ['ClaudeBot']).specific, true);
  assert.equal(rulesFor(robots, ['PerplexityBot']).specific, false);
});

test('longest match wins, Allow wins a tie, robots.txt is always fetchable', () => {
  const star = rulesFor(robots, ['PerplexityBot']).rules;
  assert.equal(isAllowed(star, '/app/settings'), false);
  assert.equal(isAllowed(star, '/app/public/page'), true);
  assert.equal(isAllowed(star, '/pricing'), true);
  assert.equal(isAllowed(rulesFor(robots, ['GPTBot']).rules, '/robots.txt'), true);
  assert.equal(isAllowed([{ allow: false, pattern: '/x' }, { allow: true, pattern: '/x' }], '/x'), true);
});

test('agent access over sample paths', () => {
  const paths = ['/', '/pricing', '/app/settings'];
  assert.equal(agentAccess(robots, ['ClaudeBot'], paths), 'blocked');
  assert.equal(agentAccess(robots, ['PerplexityBot'], paths), 'partial');
  assert.equal(agentAccess(robots, ['PerplexityBot'], ['/', '/pricing']), 'unspecified');
  assert.equal(agentAccess(parseRobots('User-agent: OAI-SearchBot\nAllow: /'), ['OAI-SearchBot'], paths), 'allowed');
});
