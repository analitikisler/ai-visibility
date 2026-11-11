import './setup.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { all, get, id, insert, nowIso, dayOf, run, setSetting } from '../src/db/index.ts';
import { PROVIDERS } from '../src/engines/providers.ts';
import type { SearchResult } from '../src/engines/types.ts';
import { pollBatches } from '../src/services/batches.ts';
import { updateCostSettings } from '../src/services/cost.ts';
import { marginPoints } from '../src/services/monitor.ts';
import { createProject, deletePrompt, getProject, listPrompts } from '../src/services/projects.ts';
import { getRun, recoverRuns, RunError, startRun } from '../src/services/runs.ts';

const until = async (done: () => boolean, ms = 10_000) => {
  const end = Date.now() + ms;
  while (!done()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 20));
  }
};
const finished = (runId: string) => () => ['completed', 'failed'].includes(getRun(runId)!.status);
const answers = (runId: string) => get<{ n: number }>('SELECT COUNT(*) n FROM responses WHERE run_id = ?', [runId])!.n;
const newProject = (name: string) =>
  createProject({ name, domain: `${name.toLowerCase()}.example.com`, engines: ['gemini', 'claude'], schedule: 'manual',
    prompts: [{ text: `best ${name} tool one?` }, { text: `best ${name} tool two?` }, { text: `best ${name} tool three?` }] });

test('a simulated check answers every prompt on every engine, then reuses the day', async () => {
  const project = newProject('Alpha');
  const first = startRun(project);
  assert.equal(first.totalJobs, 6);
  assert.equal(startRun(project).id, first.id, 'an active check is returned, not duplicated');
  await until(finished(first.id));
  assert.deepEqual([getRun(first.id)!.status, getRun(first.id)!.doneJobs, answers(first.id)], ['completed', 6, 6]);
  assert.equal(all('SELECT 1 FROM responses WHERE run_id = ? AND mode <> ?', [first.id, 'simulated']).length, 0);

  const again = startRun(project);
  assert.deepEqual([again.status, again.totalJobs, again.reusedJobs], ['completed', 0, 6]);
  const forced = startRun(project, { force: true });
  assert.equal(forced.totalJobs, 6);
  await until(finished(forced.id));
});

test('a project without prompts cannot be checked', () => {
  const empty = createProject({ name: 'Empty', domain: 'empty.example.com' });
  assert.throws(() => startRun(empty), RunError);
});

test('a restart resumes a check with the prompts it was limited to', async () => {
  const project = newProject('Beta');
  const [one] = listPrompts(project.id);
  const runId = id('run');
  // A check limited to one prompt, interrupted before any answer was stored.
  insert('runs', { id: runId, project_id: project.id, trigger: 'manual', status: 'running', engines_json: '["gemini","claude"]', total_jobs: 2,
    done_jobs: 0, failed_jobs: 0, error: null, day: dayOf(), started_at: nowIso(), finished_at: null, mode: 'realtime', reused_jobs: 0,
    prompt_ids_json: JSON.stringify([one!.id]) });
  recoverRuns();
  await until(finished(runId));
  assert.deepEqual([getRun(runId)!.totalJobs, answers(runId)], [2, 2]);
});

test('several samples per prompt: more asks, differing answers, partial reuse', async (t) => {
  t.after(() => updateCostSettings({ samplesPerPrompt: 1 }));
  const project = newProject('Epsilon');
  const once = startRun(project); // one sample each: 3 prompts × 2 engines
  await until(finished(once.id));

  updateCostSettings({ samplesPerPrompt: 3 });
  const more = startRun(project);
  // Today's first answer counts as sample one, so two more are asked per prompt × engine.
  assert.deepEqual([more.totalJobs, more.reusedJobs], [12, 6]);
  await until(finished(more.id));
  assert.equal(startRun(project).totalJobs, 0, 'three samples exist, nothing left to ask');

  const texts = all<{ text: string }>(
    'SELECT text FROM responses WHERE project_id = ? AND prompt_id = ? AND engine = ?', [project.id, listPrompts(project.id)[0]!.id, 'gemini']).map((r) => r.text);
  assert.equal(texts.length, 3);
  assert.ok(new Set(texts).size > 1, 'simulated samples are not copies of each other');

  const forced = startRun(project, { force: true });
  assert.equal(forced.totalJobs, 18);
  await until(finished(forced.id));
});

test('margin of error shrinks with more answers and is never zero', () => {
  assert.equal(marginPoints(0, 0), null);
  assert.ok(marginPoints(0, 10)! > 10, 'no hits in 10 answers is still uncertain');
  assert.ok(marginPoints(5, 10)! > marginPoints(50, 100)!);
  assert.ok(marginPoints(500, 1000)! < 3.2 && marginPoints(500, 1000)! > 3);
});

// ---- provider batches, with a stand-in adapter

const result = (text: string): SearchResult => ({ text, citations: [], model: 'gemini-2.5-flash', usage: { inputTokens: 10, outputTokens: 10, cachedTokens: 0, searchCalls: 0 } });
function pendingBatch(name: string) {
  const project = newProject(name);
  const prompts = listPrompts(project.id);
  const runId = id('run');
  insert('runs', { id: runId, project_id: project.id, trigger: 'manual', status: 'running', engines_json: '["gemini"]', total_jobs: 3, done_jobs: 0,
    failed_jobs: 0, error: null, day: dayOf(), started_at: nowIso(), finished_at: null, mode: 'batch', reused_jobs: 0 });
  insert('batch_jobs', { id: id('bat'), run_id: runId, project_id: project.id, engine: 'gemini', model: 'gemini-2.5-flash', provider_batch_id: `batches/${name}`,
    status: 'submitted', items_json: JSON.stringify(Object.fromEntries(prompts.map((p) => [p.id, p.id]))), error: null, submitted_at: nowIso(), checked_at: null, ended_at: null });
  return { project, prompts, runId };
}
const pollNow = async () => {
  run('UPDATE batch_jobs SET checked_at = NULL');
  await pollBatches();
};

test('batches: answers are stored once, and a prompt deleted meanwhile does not block the check', async (t) => {
  const original = PROVIDERS.gemini.batch;
  t.after(() => {
    PROVIDERS.gemini.batch = original;
    setSetting('GEMINI_API_KEY', null);
  });
  setSetting('GEMINI_API_KEY', 'test-key-not-real');
  PROVIDERS.gemini.batch = {
    submit: async () => 'batches/x',
    check: async () => ({ state: 'ended' }),
    results: async () => new Map(all<{ id: string }>('SELECT id FROM prompts').map((p) => [p.id, result(`Answer for ${p.id}`)])),
  };
  const { prompts, runId } = pendingBatch('Gamma');
  deletePrompt(prompts[2]!.id);
  await pollNow();
  await pollNow();
  await pollNow();
  const r = getRun(runId)!;
  assert.deepEqual([r.status, r.doneJobs, r.failedJobs, answers(runId)], ['completed', 2, 1, 2]);
  assert.match(r.error ?? '', /Prompt was deleted/);
});

test('batches: every sample of a prompt gets its own id in the submitted batch', async (t) => {
  const original = PROVIDERS.gemini.batch;
  t.after(() => {
    PROVIDERS.gemini.batch = original;
    setSetting('GEMINI_API_KEY', null);
    updateCostSettings({ samplesPerPrompt: 1, monthlyBudgetUsd: 20 });
  });
  setSetting('GEMINI_API_KEY', 'test-key-not-real');
  updateCostSettings({ samplesPerPrompt: 2 });
  let submitted: { customId: string }[] = [];
  PROVIDERS.gemini.batch = {
    submit: async (items) => ((submitted = items), 'batches/samples'),
    check: async () => ({ state: 'ended' }),
    results: async () => new Map(submitted.map((i) => [i.customId, result(`Answer ${i.customId}`)])),
  };
  const project = createProject({ name: 'Zeta', domain: 'zeta.example.com', engines: ['gemini'], schedule: 'manual', prompts: [{ text: 'best zeta tool one?' }, { text: 'best zeta tool two?' }] });
  const r = startRun(project, { mode: 'batch' });
  assert.equal(r.totalJobs, 4);
  await until(() => submitted.length === 4);
  assert.equal(new Set(submitted.map((i) => i.customId)).size, 4);
  await until(() => get<{ n: number }>("SELECT COUNT(*) n FROM batch_jobs WHERE run_id = ? AND status = 'submitted'", [r.id])!.n === 1);
  await pollNow();
  const done = getRun(r.id)!;
  assert.deepEqual([done.status, done.doneJobs, answers(r.id)], ['completed', 4, 4]);
  assert.equal(all('SELECT prompt_id FROM responses WHERE run_id = ? GROUP BY prompt_id HAVING COUNT(*) = 2', [r.id]).length, 2);
});

test('batches: removing the engine key fails the pending jobs and frees the project for a new check', async () => {
  const { project, runId } = pendingBatch('Delta');
  await pollNow(); // no GEMINI_API_KEY
  const r = getRun(runId)!;
  assert.deepEqual([r.status, r.failedJobs], ['failed', 3]);
  assert.match(r.error ?? '', /no longer available/);
  const next = startRun(getProject(project.id)!);
  assert.notEqual(next.id, runId);
  await until(finished(next.id));
});
