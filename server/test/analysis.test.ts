import './setup.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Project } from '../../shared/types.ts';
import { extractCitations, normalizeDomain } from '../src/analysis/citations.ts';
import { detectMentions, trackedEntities } from '../src/analysis/entities.ts';

const project = {
  id: 'prj_test', name: 'Acme', domain: 'acme.com', aliases: ['github.com/acme'],
  competitors: [
    { id: 'cmp_cloud', projectId: 'prj_test', name: 'Acme Cloud', domain: 'acmecloud.io', aliases: [], color: '' },
    { id: 'cmp_zen', projectId: 'prj_test', name: 'Zenlist', domain: 'zenlist.com', aliases: ['Zen List'], color: '' },
  ],
} as unknown as Project;
const entities = trackedEntities(project);
const names = (text: string) => detectMentions(text, entities).map((m) => `${m.position}:${m.entity.name}x${m.count}`);

test('mentions: whole words only, in order of first appearance', () => {
  assert.deepEqual(names('Zenlist is popular. Acme is cheaper, and Acme scales.'), ['1:Zenlistx1', '2:Acmex2']);
  assert.deepEqual(names('Acmeville and Zenlists are not tracked.'), []);
});

test('mentions: markdown emphasis, possessives and aliases match', () => {
  assert.deepEqual(names("**Acme**'s plans beat Zen List."), ['1:Acmex1', '2:Zenlistx1']);
});

test('mentions: the longer entity wins an overlap', () => {
  assert.deepEqual(names('Acme Cloud is a hosted option.'), ['1:Acme Cloudx1']);
});

test('mentions: domain-labelled links and bare URLs are citations, not mentions', () => {
  assert.deepEqual(names('See [acme.com](https://acme.com/pricing) and https://zenlist.com/blog.'), []);
  assert.deepEqual(names('Try [Acme](https://acme.com/pricing).'), ['1:Acmex1']);
});

test('citations: deduped, utm stripped, classified', () => {
  const c = extractCitations(
    'Read [the guide](https://www.acme.com/guide?utm_source=x) and https://zenlist.com/vs.',
    [{ url: 'https://acme.com/guide/', title: 'Guide' }, { url: 'https://g2.com/acme', title: '' }, { url: 'https://github.com/acme/cli', title: '' }, { url: 'javascript:alert(1)', title: '' }],
    project,
  );
  assert.deepEqual(c.map((x) => [x.domain, x.sourceType, x.position]), [
    ['acme.com', 'own', 1], ['g2.com', 'third_party', 2], ['github.com', 'own', 3], ['zenlist.com', 'competitor', 4],
  ]);
  assert.equal(c[3]!.competitorId, 'cmp_zen');
  assert.equal(c[0]!.title, 'Guide');
});

test('normalizeDomain', () => {
  assert.equal(normalizeDomain('https://www.Acme.com/x?y'), 'acme.com');
  assert.equal(normalizeDomain('  WWW.acme.com. '), 'acme.com');
  assert.equal(normalizeDomain(''), '');
});
