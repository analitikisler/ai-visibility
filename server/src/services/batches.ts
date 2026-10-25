// Provider batches for 'batch' runs: one batch per (run, engine) on providers with a batch API that supports web
// search. Submissions and their prompt mapping are persisted (batch_jobs), so a restart never loses paid work;
// a poller collects results when the provider finishes (usually within an hour, at most 24 h).
import { all, get, id, insert, nowIso, parseJson, run } from '../db/index.ts';
import type { EngineId, Project, Prompt } from '../../../shared/types.ts';
import { saveResponse } from '../analysis/persist.ts';
import { engineKey, engineModel } from '../engines/catalog.ts';
import { ask, liveAnswer, redactSecrets } from '../engines/index.ts';
import { typicalCostUsd } from '../engines/pricing.ts';
import { PROVIDERS } from '../engines/providers.ts';
import { assertBudget, BudgetError, reserve } from './cost.ts';
import { getProject } from './projects.ts';
import { bumpRun, maybeFinishRun, noteRunError } from './run-state.ts';

/** How often a submitted batch is checked. Providers finish most batches within an hour. */
const POLL_MS = 60_000;
/** Give up on a batch the provider hasn't finished after this long (providers expire them at 24 h). */
const GIVE_UP_MS = 26 * 3600_000;

interface BatchRow {
  id: string; run_id: string; project_id: string; engine: EngineId; model: string; provider_batch_id: string;
  status: string; items_json: string; submitted_at: string; checked_at: string | null;
}

/** True when this engine can take a batch for this project right now (live key, batch API, not the demo). */
export function canBatch(engine: EngineId, project: Project): boolean {
  return !project.isDemo && !!engineKey(engine) && !!PROVIDERS[engine].batch;
}

/** Records a job that never reached the provider (budget, submit failure) as a failed answer. */
function failJob(runId: string, project: Project, promptId: string, engine: EngineId, day: string, message: string): void {
  saveResponse({
    runId, project, promptId, engine, day, createdAt: nowIso(),
    answer: { text: '', citations: [], model: engineModel(engine), mode: 'live', latencyMs: null, error: message },
  });
  bumpRun(runId, false);
  noteRunError(runId, `${engine}: ${message}`);
}

/**
 * Submits one batch for `engine` covering `prompts`. On budget refusal the jobs fail with a clear message;
 * on a provider error they fall back to `onFallback` (realtime) so the check still completes.
 */
export async function submitBatch(
  runId: string, project: Project, engine: EngineId, prompts: Prompt[], day: string, onFallback: (prompts: Prompt[]) => void,
): Promise<void> {
  const adapter = PROVIDERS[engine].batch;
  const apiKey = engineKey(engine);
  if (!adapter || !apiKey) return onFallback(prompts);
  const model = engineModel(engine);
  const estimate = prompts.length * typicalCostUsd(engine, model, { batch: true });
  try {
    assertBudget(estimate);
  } catch (err) {
    if (!(err instanceof BudgetError)) throw err;
    for (const p of prompts) failJob(runId, project, p.id, engine, day, err.message);
    return maybeFinishRun(runId);
  }
  // custom_id must be short and [A-Za-z0-9_-]; prompt ids already are, and a batch never repeats a prompt.
  const items = prompts.map((p) => ({ customId: p.id, promptText: p.text }));
  try {
    const providerBatchId = await adapter.submit(items, { apiKey, model, market: project.market });
    insert('batch_jobs', {
      id: id('bat'), run_id: runId, project_id: project.id, engine, model, provider_batch_id: providerBatchId, status: 'submitted',
      items_json: JSON.stringify(Object.fromEntries(items.map((i) => [i.customId, i.customId]))), error: null,
      submitted_at: nowIso(), checked_at: null, ended_at: null,
    });
    reserve(estimate);
    console.log(`[batches] ${engine}: submitted ${items.length} prompts as ${providerBatchId} (≈$${estimate.toFixed(3)})`);
  } catch (err) {
    console.warn(`[batches] ${engine}: submit failed, answering in real time instead — ${redactSecrets(String((err as Error)?.message ?? err), [apiKey])}`);
    onFallback(prompts);
  }
}

const inFlight = new Set<string>();

/** Checks one submitted batch; when the provider is done, stores every answer and updates the run. */
async function collect(b: BatchRow): Promise<void> {
  if (inFlight.has(b.id)) return;
  inFlight.add(b.id);
  const apiKey = engineKey(b.engine);
  const items = parseJson<Record<string, string>>(b.items_json, {});
  const estimate = Object.keys(items).length * typicalCostUsd(b.engine, b.model, { batch: true });
  const close = (status: 'ended' | 'failed', error: string | null) => {
    run('UPDATE batch_jobs SET status = ?, error = ?, ended_at = ? WHERE id = ?', [status, error, nowIso(), b.id]);
    reserve(-estimate);
  };
  try {
    const project = getProject(b.project_id);
    const adapter = PROVIDERS[b.engine].batch;
    if (!project || !adapter || !apiKey) return close('failed', 'Project, engine key or batch API no longer available');
    const ctx = { apiKey, model: b.model, market: project.market };
    run('UPDATE batch_jobs SET checked_at = ? WHERE id = ?', [nowIso(), b.id]);
    const state = await adapter.check(b.provider_batch_id, ctx);
    const tooOld = Date.now() - Date.parse(b.submitted_at) > GIVE_UP_MS;
    if (state.state === 'pending' && !tooOld) return;
    const day = all<{ day: string }>('SELECT day FROM runs WHERE id = ?', [b.run_id])[0]?.day ?? nowIso().slice(0, 10);
    const results = state.state === 'ended' ? await adapter.results(b.provider_batch_id, ctx) : new Map();
    const reason = state.state === 'failed' ? state.error : tooOld ? 'Batch did not finish within 24 hours' : 'No result returned for this prompt';
    for (const [customId, promptId] of Object.entries(items)) {
      const r = results.get(customId);
      let answer = r && !('error' in r)
        ? liveAnswer(b.engine, r, null, true)
        : { text: '', citations: [], model: b.model, mode: 'live' as const, latencyMs: null, error: redactSecrets(r?.error ?? reason, [apiKey]) };
      // Providers occasionally finish a grounded answer with no text (seen on Gemini): ask once more in real time.
      if (answer.error === 'Empty answer') {
        const prompt = get<{ id: string; text: string; topic: string; tier: Prompt['tier']; intent: Prompt['intent'] }>(
          'SELECT id, text, topic, tier, intent FROM prompts WHERE id = ?', [promptId]);
        if (prompt) answer = await ask(b.engine, prompt.text, { project, prompt, day, economy: true });
      }
      saveResponse({ runId: b.run_id, project, promptId, engine: b.engine, answer, day, createdAt: nowIso() });
      bumpRun(b.run_id, !answer.error);
      if (answer.error) noteRunError(b.run_id, `${b.engine}: ${answer.error}`);
    }
    close(state.state === 'failed' ? 'failed' : 'ended', state.state === 'failed' ? state.error : null);
    console.log(`[batches] ${b.engine}: collected ${results.size} of ${Object.keys(items).length} answers from ${b.provider_batch_id}`);
    maybeFinishRun(b.run_id);
  } catch (err) {
    // Transient (network, 5xx): leave it submitted and try again on the next poll.
    console.warn(`[batches] ${b.engine}: check failed for ${b.provider_batch_id} — ${redactSecrets(String((err as Error)?.message ?? err), [apiKey])}`);
  } finally {
    inFlight.delete(b.id);
  }
}

/** One poll over every submitted batch that hasn't been checked in the last POLL_MS. */
export async function pollBatches(): Promise<void> {
  const cutoff = new Date(Date.now() - POLL_MS + 5_000).toISOString();
  const due = all<BatchRow>("SELECT * FROM batch_jobs WHERE status = 'submitted' AND (checked_at IS NULL OR checked_at < ?)", [cutoff]);
  await Promise.all(due.map(collect));
}

let timer: NodeJS.Timeout | null = null;
/** Starts the batch poller (idempotent). Re-reserves budget for batches still out after a restart. */
export function startBatchPoller(): void {
  if (timer) return;
  for (const b of all<BatchRow>("SELECT * FROM batch_jobs WHERE status = 'submitted'")) {
    reserve(Object.keys(parseJson<Record<string, string>>(b.items_json, {})).length * typicalCostUsd(b.engine, b.model, { batch: true }));
  }
  const tick = () => void pollBatches().catch((err) => console.error('[batches] poll failed', err));
  setTimeout(tick, 10_000).unref();
  timer = setInterval(tick, POLL_MS);
  timer.unref();
}

/** Prompt ids already handed to a provider batch for this run (so recovery doesn't answer them twice). */
export function batchedPromptKeys(runId: string): Set<string> {
  const keys = new Set<string>();
  for (const b of all<{ engine: string; items_json: string }>('SELECT engine, items_json FROM batch_jobs WHERE run_id = ?', [runId])) {
    for (const promptId of Object.values(parseJson<Record<string, string>>(b.items_json, {}))) keys.add(`${promptId}|${b.engine}`);
  }
  return keys;
}
