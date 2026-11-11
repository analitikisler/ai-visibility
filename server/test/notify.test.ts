import './setup.ts';
import assert from 'node:assert/strict';
import { after, beforeEach, test } from 'node:test';
import { saveResponse } from '../src/analysis/persist.ts';
import { recordHits } from '../src/crawlers/record.ts';
import { dayOf, daysAgo, id, insert, nowIso, run, setSetting } from '../src/db/index.ts';
import { assertBudget, BudgetError, updateCostSettings } from '../src/services/cost.ts';
import { notificationSettings, sendTestNotification, transport, updateNotificationSettings, type NotificationPayload } from '../src/services/notify.ts';
import { createProject, getProject, listPrompts } from '../src/services/projects.ts';
import { maybeFinishRun } from '../src/services/run-state.ts';
import { seedDemo } from '../src/services/seed.ts';

// Every POST the server would make goes into `sent` instead of onto the network.
const realPost = transport.post;
let sent: NotificationPayload[] = [];
let answer: number | Error = 200;
transport.post = async (_url, body) => {
  sent.push(JSON.parse(body) as NotificationPayload);
  if (answer instanceof Error) throw answer;
  return answer;
};
after(() => {
  transport.post = realPost;
});
beforeEach(() => {
  sent = [];
  answer = 200;
  updateNotificationSettings({ webhookUrl: 'https://hooks.example.com/services/T000/B000/secret-token-9f3a', events: ['visibility_drop', 'check_failed', 'new_agent', 'budget_reached'] });
});
const settle = () => new Promise((r) => setTimeout(r, 20));
const kinds = () => sent.map((p) => p.event);

function finishedRun(projectId: string, failed: boolean): string {
  const runId = id('run');
  insert('runs', { id: runId, project_id: projectId, trigger: 'scheduled', status: 'running', engines_json: '["gemini"]', total_jobs: 2,
    done_jobs: failed ? 0 : 2, failed_jobs: failed ? 2 : 0, error: null, day: dayOf(), started_at: nowIso(), finished_at: null });
  maybeFinishRun(runId);
  return runId;
}
function answers(projectId: string, day: string, n: number, text: string): void {
  const project = getProject(projectId)!;
  const runId = id('run');
  insert('runs', { id: runId, project_id: projectId, trigger: 'manual', status: 'completed', engines_json: '["gemini"]', total_jobs: n, done_jobs: n,
    failed_jobs: 0, error: null, day, started_at: `${day}T08:00:00.000Z`, finished_at: `${day}T08:01:00.000Z` });
  for (let i = 0; i < n; i++) {
    saveResponse({ runId, project, promptId: listPrompts(projectId)[0]!.id, engine: 'gemini', day, createdAt: `${day}T08:00:00.000Z`,
      answer: { text, citations: [], model: 'simulated', mode: 'simulated', latencyMs: 0, error: null } });
  }
}
const newProject = (name: string) => createProject({ name, domain: `${name.toLowerCase()}.example.com`, engines: ['gemini'], prompts: [{ text: `best ${name} tool?` }] });

test('settings: the webhook URL is masked, private addresses are refused, clearing it stops everything', async () => {
  assert.equal(notificationSettings().webhookUrl, 'https://hooks.example.com/…9f3a');
  for (const url of ['http://localhost:3000/hook', 'http://10.0.0.5/hook', 'ftp://example.com/x', 'not a url']) {
    assert.throws(() => updateNotificationSettings({ webhookUrl: url }), /Can't use this webhook URL/, url);
  }
  assert.equal(notificationSettings().webhookUrl, 'https://hooks.example.com/…9f3a', 'a refused URL changes nothing');
  updateNotificationSettings({ webhookUrl: null });
  finishedRun(newProject('Silent').id, true);
  await settle();
  assert.deepEqual([notificationSettings().webhookUrl, sent.length], [null, 0]);
});

test('test delivery: reports success, an error status, and an unreachable webhook', async () => {
  assert.deepEqual([(await sendTestNotification()).ok, sent[0]?.event], [true, 'test']);
  answer = 500;
  const refused = await sendTestNotification();
  assert.deepEqual([refused.ok, refused.status, refused.error], [false, 500, 'The webhook answered HTTP 500']);
  answer = new Error('connect ECONNREFUSED');
  const down = await sendTestNotification();
  assert.deepEqual([down.ok, down.status, down.error], [false, null, 'the webhook refused the connection']);
  assert.equal(notificationSettings().lastDelivery?.error, 'the webhook refused the connection');
});

test('a failed check notifies; a switched-off kind and the demo project do not', async () => {
  const p = newProject('Failing');
  finishedRun(p.id, true);
  await settle();
  assert.deepEqual(kinds(), ['check_failed']);
  assert.deepEqual([sent[0]!.project?.name, sent[0]!.title, sent[0]!.data.failedJobs], ['Failing', 'Check failed for Failing', 2]);

  updateNotificationSettings({ events: ['visibility_drop'] });
  finishedRun(p.id, true);
  finishedRun(seedDemo().id, true);
  await settle();
  assert.equal(sent.length, 1);
});

test('a real drop in visibility notifies once a week; a small or noisy change does not', async () => {
  const drop = newProject('Dropper');
  answers(drop.id, daysAgo(9), 40, 'Dropper is the strongest option.');
  answers(drop.id, dayOf(), 40, 'Zenlist and Taskly lead here.');
  finishedRun(drop.id, false);
  finishedRun(drop.id, false);
  await settle();
  assert.deepEqual(kinds(), ['visibility_drop'], 'the second check the same week is not a second alert');
  assert.deepEqual([sent[0]!.title, sent[0]!.data.visibility, sent[0]!.data.previous], ['Dropper: visibility down 100 points', 0, 100]);

  const tiny = newProject('Tiny');
  answers(tiny.id, daysAgo(9), 3, 'Tiny is the strongest option.');
  answers(tiny.id, dayOf(), 3, 'Zenlist leads here.');
  finishedRun(tiny.id, false); // 100 → 0, but on three answers a week
  const noisy = newProject('Noisy');
  answers(noisy.id, daysAgo(9), 6, 'Noisy is the strongest option.');
  answers(noisy.id, daysAgo(9), 6, 'Zenlist leads here.');
  answers(noisy.id, dayOf(), 5, 'Noisy is the strongest option.');
  answers(noisy.id, dayOf(), 7, 'Zenlist leads here.');
  finishedRun(noisy.id, false); // 50 → 42 on twelve answers a week: inside the margin of error
  const steady = newProject('Steady');
  answers(steady.id, daysAgo(9), 40, 'Steady is the strongest option.');
  answers(steady.id, dayOf(), 40, 'Steady is still the strongest option.');
  finishedRun(steady.id, false);
  await settle();
  assert.equal(sent.length, 1);
});

test('a new AI agent notifies once, after the project has a baseline', async () => {
  const p = newProject('Crawled');
  const hit = (userAgent: string, ts: string) => ({ ts, path: '/pricing', userAgent, ip: '', referrer: '', status: 200 });
  const GPTBOT = 'Mozilla/5.0; compatible; GPTBot/1.3; +https://openai.com/gptbot';
  const CLAUDEBOT = 'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)';
  recordHits(p.id, [hit(GPTBOT, new Date(Date.now() - 5 * 86_400_000).toISOString())], 'ingest');
  await settle();
  assert.equal(sent.length, 0, 'the first agents are the baseline');
  recordHits(p.id, [hit(CLAUDEBOT, nowIso()), hit(CLAUDEBOT, nowIso()), hit(GPTBOT, nowIso())], 'ingest');
  recordHits(p.id, [hit(CLAUDEBOT, nowIso())], 'ingest');
  await settle();
  assert.deepEqual(kinds(), ['new_agent']);
  assert.deepEqual([sent[0]!.data.agent, sent[0]!.data.operator, sent[0]!.project?.domain], ['ClaudeBot', 'Anthropic', 'crawled.example.com']);
});

test('reaching the monthly budget notifies once a month', async () => {
  updateCostSettings({ monthlyBudgetUsd: 0 });
  try {
    assert.throws(() => assertBudget(0.01), BudgetError);
    assert.throws(() => assertBudget(0.01), BudgetError);
    await settle();
    assert.deepEqual(kinds(), ['budget_reached']);
    assert.equal(sent[0]!.data.budgetUsd, 0);
  } finally {
    updateCostSettings({ monthlyBudgetUsd: 20 });
    run("DELETE FROM settings WHERE key LIKE 'notified:%'");
    setSetting('NOTIFY_LAST_DELIVERY', null);
  }
});
