import './setup.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { saveResponse } from '../src/analysis/persist.ts';
import { runAudit } from '../src/audit/index.ts';
import { dayOf, daysAgo, id, insert, nowIso } from '../src/db/index.ts';
import { createDraft, updateDraft } from '../src/services/drafts.ts';
import { listEvents } from '../src/services/events.ts';
import { getOverview } from '../src/services/monitor.ts';
import { addCompetitors, createProject, createPrompts, deleteCompetitor, deletePrompt, getProject, listPrompts, updateProject, updatePrompt } from '../src/services/projects.ts';
import { listRecommendations, setRecommendationStatus } from '../src/services/recommendations.ts';
import { seedDemo } from '../src/services/seed.ts';

const titles = (projectId: string) => listEvents(projectId, 30).map((e) => `${e.kind}: ${e.title}`);

test('changes to a project are recorded as events and returned with the overview', async () => {
  const p = createProject({ name: 'Markers', domain: 'markers.example.com', competitors: [{ name: 'Initial Rival' }], prompts: [{ text: 'best markers tool?' }] });
  assert.deepEqual(titles(p.id), [], 'setting a project up is not a change');

  const [rival] = addCompetitors(p.id, [{ name: 'Newcomer' }]);
  const [prompt] = createPrompts(p.id, [{ text: 'markers tool for small teams?' }, { text: 'markers pricing?' }]);
  createPrompts(p.id, [{ text: 'Markers pricing?' }]); // duplicate: nothing added, nothing recorded
  updatePrompt(prompt!.id, { active: false });
  updatePrompt(prompt!.id, { topic: 'Pricing' }); // not a tracking change
  deletePrompt(prompt!.id);
  deleteCompetitor(rival!.id);
  updateProject(p.id, { market: 'Germany', description: 'New description' });
  const draft = await createDraft(getProject(p.id)!, { kind: 'faq_page' });
  updateDraft(draft.id, { status: 'approved' });
  updateDraft(draft.id, { status: 'published' });
  updateDraft(draft.id, { status: 'published', title: 'Renamed' }); // already published

  assert.deepEqual(titles(p.id), [
    'competitor_added: Competitor added: Newcomer',
    'prompts_changed: 2 prompts added',
    'prompts_changed: Prompt paused',
    'prompts_changed: Prompt removed',
    'competitor_removed: Competitor removed: Newcomer',
    'tracking_changed: Market changed to Germany',
    `draft_published: Published: ${draft.title}`,
  ]);
  assert.equal(getOverview(p.id, { days: 30 }).events.length, 7);
});

test('the demo has sample events, and its first audit is one', async () => {
  const demo = seedDemo();
  assert.deepEqual(getOverview(demo.id, { days: 60 }).events.map((e) => e.kind), ['competitor_added', 'draft_published']);
  assert.equal(getOverview(demo.id, { days: 7 }).events.length, 0, 'older events fall outside a short period');
  await runAudit(demo);
  await runAudit(demo); // same score: not a change
  assert.deepEqual(listEvents(demo.id, 7).map((e) => e.title), ['First AI readiness audit: 66/100']);
});

test('a recommendation marked done shows what followed, and stays listed once it no longer applies', async () => {
  const p = createProject({ name: 'Outcome', domain: 'outcome.example.com', engines: ['gemini'], prompts: [{ text: 'best outcome tool?' }] });
  const project = getProject(p.id)!;
  const prompt = listPrompts(p.id)[0]!;
  const runId = id('run');
  insert('runs', { id: runId, project_id: p.id, trigger: 'manual', status: 'completed', engines_json: '["gemini"]', total_jobs: 20, done_jobs: 20,
    failed_jobs: 0, error: null, day: dayOf(), started_at: nowIso(), finished_at: nowIso() });
  const answer = (text: string, day: string) =>
    saveResponse({ runId, project, promptId: prompt.id, engine: 'gemini', day, createdAt: `${day}T08:00:00.000Z`,
      answer: { text, citations: [], model: 'simulated', mode: 'simulated', latencyMs: 0, error: null } });
  for (let i = 0; i < 10; i++) answer('Zenlist and Taskly are popular picks.', daysAgo(3));
  for (let i = 0; i < 10; i++) answer('Outcome is the strongest option here.', dayOf());

  // "Run an AI-readiness audit" applies while the project has no audit.
  const before = await listRecommendations(project);
  assert.ok(before.some((r) => r.key === 'run-audit' && r.status === 'open' && !r.outcome));

  const done = await setRecommendationStatus(project, 'run-audit', 'done');
  assert.deepEqual(
    [done?.status, done?.outcome?.scope, done?.outcome?.before, done?.outcome?.after, done?.outcome?.answersAfter, done?.outcome?.inconclusive],
    ['done', 'all', 0, 1, 10, false],
  );
  assert.ok(titles(p.id).includes('recommendation_done: Done: Run an AI-readiness audit'));

  // Once an audit exists the rule stops firing; the done recommendation is still listed, with its outcome.
  insert('audits', { id: id('aud'), project_id: p.id, url: 'https://outcome.example.com/', score: 80, created_at: nowIso(),
    result_json: JSON.stringify({ id: 'x', projectId: p.id, url: 'https://outcome.example.com/', score: 80, createdAt: nowIso(), checks: [],
      robots: { found: false, agents: [], sitemaps: [] }, llmsTxt: { found: false, url: '', bytes: 0, preview: '' },
      page: { title: '', metaDescription: '', h1: [], wordCount: 0, schemaTypes: [], ogTags: {}, canonical: null, lang: null, statusCode: 200, responseMs: 1 } }) });
  const after = await listRecommendations(getProject(p.id)!);
  const kept = after.find((r) => r.key === 'run-audit');
  assert.deepEqual([kept?.status, kept?.outcome?.after], ['done', 1]);

  // Reopening it removes it for good, since nothing suggests it any more.
  await setRecommendationStatus(getProject(p.id)!, 'run-audit', 'open');
  assert.ok(!(await listRecommendations(getProject(p.id)!)).some((r) => r.key === 'run-audit'));
});

test('an outcome with too few answers since is inconclusive', async () => {
  const p = createProject({ name: 'Early', domain: 'early.example.com', prompts: [{ text: 'best early tool?' }] });
  const done = await setRecommendationStatus(getProject(p.id)!, 'run-audit', 'done');
  assert.deepEqual([done?.outcome?.before, done?.outcome?.after, done?.outcome?.inconclusive], [null, null, true]);
});
