// GET /api/usage: estimated live spend at list prices, where it went, and what batching, caching and same-day reuse saved.
import { all, daysAgo } from '../db/index.ts';
import type { EngineId, UsageView } from '../../../shared/types.ts';
import { ENGINES } from '../engines/catalog.ts';
import { estimateCostUsd, PRICING_AS_OF, savingsFromCacheUsd } from '../engines/pricing.ts';
import { costSettings, monthSpendUsd, monthStart } from './cost.ts';

interface Row {
  project_id: string; engine: EngineId; model: string; day: string; batch: number;
  input_tokens: number | null; output_tokens: number | null; cached_tokens: number | null; search_calls: number | null; cost_usd: number;
}

const r4 = (n: number) => Math.round(n * 10_000) / 10_000;

export function getUsage(days: number): UsageView {
  const from = daysAgo(days - 1);
  const to = daysAgo(0);
  const rows = all<Row>(
    `SELECT project_id, engine, model, day, batch, input_tokens, output_tokens, cached_tokens, search_calls, cost_usd
     FROM responses WHERE day >= ? AND cost_usd IS NOT NULL`, [from]);
  const other = all<{ project_id: string | null; engine: EngineId; day: string; cost_usd: number; input_tokens: number; output_tokens: number; cached_tokens: number }>(
    'SELECT project_id, engine, day, cost_usd, input_tokens, output_tokens, cached_tokens FROM llm_usage WHERE day >= ?', [from]);
  const answers = all<{ n: number }>('SELECT COUNT(*) n FROM responses WHERE day >= ?', [from])[0]?.n ?? 0;
  const projects = new Map(all<{ id: string; name: string; is_demo: number }>('SELECT id, name, is_demo FROM projects').map((p) => [p.id, p]));

  const usage = (r: Row) => ({ inputTokens: r.input_tokens ?? 0, outputTokens: r.output_tokens ?? 0, cachedTokens: r.cached_tokens ?? 0, searchCalls: r.search_calls ?? 0 });
  let batchSaved = 0;
  let cacheSaved = 0;
  for (const r of rows) {
    if (r.batch) batchSaved += estimateCostUsd(r.engine, r.model, usage(r), { batch: false }) - r.cost_usd;
    cacheSaved += savingsFromCacheUsd(r.engine, r.model, r.cached_tokens ?? 0, { batch: !!r.batch });
  }
  const liveCost = rows.reduce((s, r) => s + r.cost_usd, 0);
  const avgAnswerCost = rows.length ? liveCost / rows.length : 0;
  // Reused jobs on real projects with live engines would each have cost about one average answer.
  const reused = all<{ project_id: string; reused: number }>('SELECT project_id, SUM(reused_jobs) reused FROM runs WHERE day >= ? GROUP BY project_id', [from])
    .filter((x) => projects.get(x.project_id)?.is_demo === 0)
    .reduce((s, x) => s + x.reused, 0);

  const byEngine = ENGINES.map((e) => {
    const rs = rows.filter((r) => r.engine === e.id);
    const os = other.filter((o) => o.engine === e.id);
    const cost = rs.reduce((s, r) => s + r.cost_usd, 0) + os.reduce((s, o) => s + o.cost_usd, 0);
    return {
      engine: e.id, name: e.name, model: rs.at(-1)?.model ?? '', answers: rs.length, costUsd: r4(cost),
      avgCostUsd: rs.length ? r4(rs.reduce((s, r) => s + r.cost_usd, 0) / rs.length) : 0,
      inputTokens: rs.reduce((s, r) => s + (r.input_tokens ?? 0), 0) + os.reduce((s, o) => s + o.input_tokens, 0),
      outputTokens: rs.reduce((s, r) => s + (r.output_tokens ?? 0), 0) + os.reduce((s, o) => s + o.output_tokens, 0),
      cachedTokens: rs.reduce((s, r) => s + (r.cached_tokens ?? 0), 0) + os.reduce((s, o) => s + o.cached_tokens, 0),
      searchCalls: rs.reduce((s, r) => s + (r.search_calls ?? 0), 0),
      batchShare: rs.length ? r4(rs.filter((r) => r.batch).length / rs.length) : 0,
    };
  }).filter((e) => e.answers || e.costUsd);

  const projectCost = new Map<string, { answers: number; cost: number }>();
  for (const r of rows) {
    const p = projectCost.get(r.project_id) ?? { answers: 0, cost: 0 };
    projectCost.set(r.project_id, { answers: p.answers + 1, cost: p.cost + r.cost_usd });
  }
  for (const o of other) {
    if (!o.project_id) continue;
    const p = projectCost.get(o.project_id) ?? { answers: 0, cost: 0 };
    projectCost.set(o.project_id, { ...p, cost: p.cost + o.cost_usd });
  }

  const byDay = Array.from({ length: days }, (_, i) => {
    const day = daysAgo(days - 1 - i);
    const rs = rows.filter((r) => r.day === day);
    return { day, costUsd: r4(rs.reduce((s, r) => s + r.cost_usd, 0) + other.filter((o) => o.day === day).reduce((s, o) => s + o.cost_usd, 0)), answers: rs.length };
  });

  const { monthlyBudgetUsd } = costSettings();
  const spent = monthSpendUsd();
  return {
    range: { from, to, days },
    month: {
      label: new Date(`${monthStart()}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
      spendUsd: r4(spent), budgetUsd: monthlyBudgetUsd, remainingUsd: r4(Math.max(0, monthlyBudgetUsd - spent)),
    },
    totals: {
      answers, liveAnswers: rows.length, costUsd: r4(liveCost + other.reduce((s, o) => s + o.cost_usd, 0)),
      inputTokens: byEngine.reduce((s, e) => s + e.inputTokens, 0), outputTokens: byEngine.reduce((s, e) => s + e.outputTokens, 0),
      cachedTokens: byEngine.reduce((s, e) => s + e.cachedTokens, 0), searchCalls: byEngine.reduce((s, e) => s + e.searchCalls, 0),
    },
    savings: { batchUsd: r4(batchSaved), cacheUsd: r4(cacheSaved), reuseUsd: r4(reused * avgAnswerCost), reusedAnswers: reused },
    byEngine,
    byProject: [...projectCost].map(([projectId, v]) => ({ projectId, name: projects.get(projectId)?.name ?? projectId, answers: v.answers, costUsd: r4(v.cost) }))
      .sort((a, b) => b.costUsd - a.costUsd),
    byDay,
    pricingAsOf: PRICING_AS_OF,
  };
}
