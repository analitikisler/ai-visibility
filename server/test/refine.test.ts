import './setup.ts';
import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { saveResponse } from '../src/analysis/persist.ts';
import { refineResponse, setAnalysisMode } from '../src/analysis/refine.ts';
import { all, dayOf, get, id, insert, nowIso, setSetting } from '../src/db/index.ts';
import { PROVIDERS } from '../src/engines/providers.ts';
import type { CompleteRequest } from '../src/engines/types.ts';
import { getResponse } from '../src/services/monitor.ts';
import { addCompetitors, createProject, getProject, listPrompts } from '../src/services/projects.ts';
import { getRun, startRun } from '../src/services/runs.ts';
import { seedDemo } from '../src/services/seed.ts';

// DeepSeek stands in as a live analysis engine: its completion and its search are replaced, so nothing leaves the process.
const real = { complete: PROVIDERS.deepseek.complete, search: PROVIDERS.deepseek.search };
let asked: CompleteRequest[] = [];
let reply: (req: CompleteRequest) => string = () => '{}';
const usage = { inputTokens: 100, outputTokens: 20, cachedTokens: 0, searchCalls: 0 };
PROVIDERS.deepseek.complete = async (req) => {
  asked.push(req);
  return { text: reply(req), model: 'deepseek-flash', usage };
};
after(() => {
  Object.assign(PROVIDERS.deepseek, real);
  setSetting('DEEPSEEK_API_KEY', null);
  setAnalysisMode('rules');
});
beforeEach(() => {
  asked = [];
  setSetting('DEEPSEEK_API_KEY', 'test-key-not-real');
  setAnalysisMode('model');
});

const ANSWER = 'The notion that support tools must be complex is outdated. Zenlist is a solid, affordable pick, though its reporting is weak.';

function project(name = 'Notion') {
  const p = createProject({ name, domain: `${name.toLowerCase()}.example.com`, engines: ['deepseek'], prompts: [{ text: 'best support tool?' }], competitors: [{ name: 'Zenlist' }] });
  return getProject(p.id)!;
}
function stored(p: ReturnType<typeof project>, mode: 'live' | 'simulated' = 'live', text = ANSWER): string {
  const runId = id('run');
  insert('runs', { id: runId, project_id: p.id, trigger: 'manual', status: 'completed', engines_json: '["deepseek"]', total_jobs: 1, done_jobs: 1,
    failed_jobs: 0, error: null, day: dayOf(), started_at: nowIso(), finished_at: nowIso() });
  return saveResponse({ runId, project: p, promptId: listPrompts(p.id)[0]!.id, engine: 'deepseek', day: dayOf(), createdAt: nowIso(),
    answer: { text, citations: [], model: 'deepseek-flash', mode, latencyMs: 1, error: null } });
}
const verdict = (p: ReturnType<typeof project>, brand: object | null, zenlist: object | null) =>
  JSON.stringify({ entities: [brand && { key: 'brand', ...brand }, zenlist && { key: p.competitors[0]!.id, ...zenlist }].filter(Boolean) });
const summary = (rid: string) => {
  const r = getResponse(rid)!;
  return { analysis: r.analysis, brand: r.brandMentioned, mentions: r.mentions.map((m) => `${m.position}:${m.entityName}:${m.sentimentLabel}`) };
};

test('rules alone: an ordinary word that matches the brand name counts as a mention, with the sentence\'s tone', () => {
  const p = project();
  assert.deepEqual(summary(stored(p)), { analysis: 'rules', brand: true, mentions: ['1:Notion:negative', '2:Zenlist:positive'] });
});

test('the model removes a false match, re-ranks the rest and sets sentiment', async () => {
  const p = project();
  const rid = stored(p);
  reply = () => `Here you go:\n${verdict(p, { refers: false, sentiment: 0 }, { refers: true, sentiment: 0.6 })}`;
  assert.equal(await refineResponse(p, rid), true);
  assert.deepEqual(summary(rid), { analysis: 'model', brand: false, mentions: ['1:Zenlist:positive'] });
  assert.deepEqual([asked.length, /<<<ANSWER[\s\S]*ANSWER>>>/.test(asked[0]!.prompt), /key "brand": Notion/.test(asked[0]!.prompt)], [1, true, true]);
  assert.equal(get<{ n: number }>("SELECT COUNT(*) n FROM llm_usage WHERE project_id = ? AND purpose = 'analysis'", [p.id])?.n, 1, 'its cost is recorded');
});

test('a confirmed brand keeps its place and takes the model\'s sentiment, clamped to -1..1', async () => {
  const p = project();
  const rid = stored(p);
  reply = () => verdict(p, { refers: true, sentiment: -7 }, { refers: true, sentiment: 0.05 });
  await refineResponse(p, rid);
  assert.deepEqual(summary(rid).mentions, ['1:Notion:negative', '2:Zenlist:neutral']);
  assert.deepEqual([getResponse(rid)!.brandPosition, getResponse(rid)!.brandSentiment], [1, -1]);
});

test('an unusable reply, a failed call or an entity the model skipped keeps the rule-based result', async () => {
  const p = project();
  for (const bad of ['not json at all', '{"entities":"nope"}', JSON.stringify({ entities: [{ key: 'someone-else', refers: false, sentiment: 0 }] })]) {
    const rid = stored(p);
    reply = () => bad;
    assert.equal(await refineResponse(p, rid), false, bad);
    assert.equal(summary(rid).analysis, 'rules');
  }
  const failing = stored(p);
  reply = () => { throw new Error('provider down'); };
  assert.equal(await refineResponse(p, failing), false);
  const partial = stored(p);
  reply = () => verdict(p, null, { refers: true, sentiment: 0.9 }); // nothing said about the brand
  await refineResponse(p, partial);
  assert.deepEqual(summary(partial), { analysis: 'model', brand: true, mentions: ['1:Notion:negative', '2:Zenlist:positive'] });
});

test('nothing is sent when it is off, for simulated answers, for the demo, or when no name matched', async () => {
  const p = project();
  reply = () => verdict(p, { refers: false, sentiment: 0 }, { refers: false, sentiment: 0 });
  setAnalysisMode('rules');
  assert.equal(await refineResponse(p, stored(p)), false);
  setAnalysisMode('model');
  assert.equal(await refineResponse(p, stored(p, 'simulated')), false);
  assert.equal(await refineResponse(p, stored(p, 'live', 'Taskly and Deskly lead this category.')), false);
  const demo = getProject(seedDemo().id)!;
  const demoAnswer = all<{ id: string }>('SELECT id FROM responses WHERE project_id = ? AND brand_mentioned = 1 LIMIT 1', [demo.id])[0]!.id;
  assert.equal(await refineResponse(demo, demoAnswer), false);
  setSetting('DEEPSEEK_API_KEY', null); // on, but no live engine to do it
  assert.equal(await refineResponse(p, stored(p)), false);
  assert.equal(asked.length, 0);
});

test('a live check runs the model check on each answer; changing competitors goes back to rules', async () => {
  const p = project('Notion');
  PROVIDERS.deepseek.search = async () => ({ text: ANSWER, citations: [], model: 'deepseek-flash', usage });
  reply = () => verdict(p, { refers: false, sentiment: 0 }, { refers: true, sentiment: 0.5 });
  const r = startRun(p);
  for (let i = 0; i < 200 && !['completed', 'failed'].includes(getRun(r.id)!.status); i++) await new Promise((res) => setTimeout(res, 20));
  const rid = all<{ id: string }>('SELECT id FROM responses WHERE run_id = ?', [r.id])[0]!.id;
  assert.deepEqual([getRun(r.id)!.status, summary(rid).analysis, summary(rid).brand], ['completed', 'model', false]);

  addCompetitors(p.id, [{ name: 'Deskly' }]);
  assert.deepEqual([summary(rid).analysis, summary(rid).brand], ['rules', true], 'history is re-analysed by rules when tracked names change');
});
