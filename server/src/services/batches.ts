// Provider batches for 'batch' runs: one batch per (run, engine) on providers with a batch API that supports web
// search. Submissions and their prompt mapping are persisted (batch_jobs), so a restart never loses paid work;
// a poller collects results when the provider finishes (usually within an hour, at most 24 h).
import { all, dayOf, get, id, insert, nowIso, parseJson, run, tx } from '../db/index.ts';
import type { EngineId, Project, Prompt } from '../../../shared/types.ts';
import { persistResponse, saveResponse } from '../analysis/persist.ts';
import { refineResponses } from '../analysis/refine.ts';
import { engineKey, engineModel } from '../engines/catalog.ts';
import { ask, liveAnswer, redactSecrets, type EngineAnswer } from '../engines/index.ts';
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
  // custom_id must be short, unique and [A-Za-z0-9_-]. A prompt appears once per sample, so the index makes it unique.
  const items = prompts.map((p, i) => ({ customId: `${p.id}_${i}`, promptId: p.id, promptText: p.text }));
  try {
    const providerBatchId = await adapter.submit(items, { apiKey, model, market: project.market });
    insert('batch_jobs', {
      id: id('bat'), run_id: runId, project_id: project.id, engine, model, provider_batch_id: providerBatchId, status: 'submitted',
      items_json: JSON.stringify(Object.fromEntries(items.map((i) => [i.customId, i.promptId]))), error: null,
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

/**
 * Checks one submitted batch; when the provider is done, stores every answer and updates the run.
 * Answers are stored, counted on the run and the batch closed in one transaction, so a failure part-way leaves the
 * batch submitted with nothing stored and the next poll starts clean (no duplicate answers).
 */
async function collect(b: BatchRow): Promise<void> {
  if (inFlight.has(b.id)) return;
  inFlight.add(b.id);
  const apiKey = engineKey(b.engine);
  const items = parseJson<Record<string, string>>(b.items_json, {});
  const estimate = Object.keys(items).length * typicalCostUsd(b.engine, b.model, { batch: true });
  const failed = (error: string): EngineAnswer => ({ text: '', citations: [], model: b.model, mode: 'live', latencyMs: null, error });
  try {
    const project = getProject(b.project_id);
    // Deleting a project deletes its runs and batches, so there is nothing left to update.
    if (!project) return reserve(-estimate);
    const day = get<{ day: string }>('SELECT day FROM runs WHERE id = ?', [b.run_id])?.day ?? dayOf();
    const settle = async (status: 'ended' | 'failed', error: string | null, answers: { promptId: string; answer: EngineAnswer }[]) => {
      const prompts = new Set(all<{ id: string }>('SELECT id FROM prompts WHERE project_id = ?', [project.id]).map((p) => p.id));
      const stored: string[] = [];
      tx(() => {
        for (const { promptId, answer } of answers) {
          // A prompt deleted while the batch was out has nothing to attach its answer to; its job still counts.
          const known = prompts.has(promptId);
          if (known) {
            const responseId = persistResponse({ runId: b.run_id, project, promptId, engine: b.engine, answer, day, createdAt: nowIso() });
            if (!answer.error) stored.push(responseId);
          }
          const jobError = known ? answer.error : 'Prompt was deleted before its answer arrived';
          bumpRun(b.run_id, !jobError);
          if (jobError) noteRunError(b.run_id, `${b.engine}: ${jobError}`);
        }
        run('UPDATE batch_jobs SET status = ?, error = ?, ended_at = ? WHERE id = ?', [status, error, nowIso(), b.id]);
      });
      reserve(-estimate);
      // Optional model check of mentions and sentiment, before the check is marked finished.
      await refineResponses(project, stored);
      maybeFinishRun(b.run_id);
    };

    const adapter = PROVIDERS[b.engine].batch;
    if (!adapter || !apiKey) {
      // The key was removed while the batch was out: fail its jobs so the run finishes instead of waiting forever.
      const reason = 'Engine key or batch API no longer available';
      return await settle('failed', reason, Object.values(items).map((promptId) => ({ promptId, answer: failed(reason) })));
    }
    const ctx = { apiKey, model: b.model, market: project.market };
    run('UPDATE batch_jobs SET checked_at = ? WHERE id = ?', [nowIso(), b.id]);
    const state = await adapter.check(b.provider_batch_id, ctx);
    const tooOld = Date.now() - Date.parse(b.submitted_at) > GIVE_UP_MS;
    if (state.state === 'pending' && !tooOld) return;
    const results = state.state === 'ended' ? await adapter.results(b.provider_batch_id, ctx) : new Map();
    const reason = state.state === 'failed' ? state.error : tooOld ? 'Batch did not finish within 24 hours' : 'No result returned for this prompt';
    const answers: { promptId: string; answer: EngineAnswer }[] = [];
    for (const [customId, promptId] of Object.entries(items)) {
      const r = results.get(customId);
      let answer = r && !('error' in r) ? liveAnswer(b.engine, r, null, true) : failed(redactSecrets(r?.error ?? reason, [apiKey]));
      // Providers occasionally finish a grounded answer with no text (seen on Gemini): ask once more in real time.
      if (answer.error === 'Empty answer') {
        const prompt = get<{ id: string; text: string; topic: string; tier: Prompt['tier']; intent: Prompt['intent'] }>(
          'SELECT id, text, topic, tier, intent FROM prompts WHERE id = ?', [promptId]);
        if (prompt) answer = await ask(b.engine, prompt.text, { project, prompt, day, economy: true });
      }
      answers.push({ promptId, answer });
    }
    await settle(state.state === 'failed' ? 'failed' : 'ended', state.state === 'failed' ? state.error : null, answers);
    console.log(`[batches] ${b.engine}: collected ${results.size} of ${Object.keys(items).length} answers from ${b.provider_batch_id}`);
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

/** Asks already handed to a provider batch for this run, per prompt|engine (so recovery doesn't answer them twice). */
export function batchedPromptKeys(runId: string): Map<string, number> {
  const keys = new Map<string, number>();
  for (const b of all<{ engine: string; items_json: string }>('SELECT engine, items_json FROM batch_jobs WHERE run_id = ?', [runId])) {
    for (const promptId of Object.values(parseJson<Record<string, string>>(b.items_json, {}))) {
      const key = `${promptId}|${b.engine}`;
      keys.set(key, (keys.get(key) ?? 0) + 1);
    }
  }
  return keys;
}
