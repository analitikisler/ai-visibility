// Cost controls: settings (monthly budget, scheduled mode, same-day reuse), month-to-date spend and the budget gate
// that every live call and batch submission passes through. Spend is estimated at list prices (engines/pricing.ts).
import { get, getSetting, setSetting } from '../db/index.ts';
import type { CostSettings, RunMode } from '../../../shared/types.ts';

const KEYS = { budget: 'MONTHLY_BUDGET_USD', mode: 'SCHEDULED_MODE', reuse: 'REUSE_SAME_DAY' } as const;
/** Conservative default so a fresh install with keys can't run up a surprise bill. */
export const DEFAULT_BUDGET_USD = 20;

export function costSettings(): CostSettings {
  const budget = Number(getSetting(KEYS.budget) ?? process.env[KEYS.budget] ?? DEFAULT_BUDGET_USD);
  const mode = getSetting(KEYS.mode) ?? process.env[KEYS.mode];
  const reuse = getSetting(KEYS.reuse) ?? process.env[KEYS.reuse];
  return {
    monthlyBudgetUsd: Number.isFinite(budget) && budget >= 0 ? budget : DEFAULT_BUDGET_USD,
    scheduledMode: mode === 'realtime' ? 'realtime' : 'batch',
    reuseSameDay: reuse !== '0',
  };
}

export function updateCostSettings(patch: Partial<CostSettings>): CostSettings {
  if (patch.monthlyBudgetUsd !== undefined) setSetting(KEYS.budget, String(Math.max(0, Math.round(patch.monthlyBudgetUsd * 100) / 100)));
  if (patch.scheduledMode !== undefined) setSetting(KEYS.mode, patch.scheduledMode satisfies RunMode);
  if (patch.reuseSameDay !== undefined) setSetting(KEYS.reuse, patch.reuseSameDay ? '1' : '0');
  return costSettings();
}

/** First day of the current UTC month, 'YYYY-MM-01'. */
export const monthStart = (d = new Date()) => `${d.toISOString().slice(0, 7)}-01`;

/** Estimated live spend this calendar month (UTC): answers + plain completions. */
export function monthSpendUsd(): number {
  const from = monthStart();
  const answers = get<{ c: number | null }>('SELECT SUM(cost_usd) c FROM responses WHERE day >= ? AND cost_usd IS NOT NULL', [from])?.c ?? 0;
  const other = get<{ c: number | null }>('SELECT SUM(cost_usd) c FROM llm_usage WHERE day >= ?', [from])?.c ?? 0;
  return answers + other;
}

/** Money committed to batches that haven't returned yet (estimated at submission). */
let reservedUsd = 0;
export const reserve = (usd: number) => {
  reservedUsd = Math.max(0, reservedUsd + usd);
};

export class BudgetError extends Error {}

/** Throws BudgetError when spending `estimateUsd` more would exceed this month's budget. */
export function assertBudget(estimateUsd: number): void {
  const { monthlyBudgetUsd } = costSettings();
  const spent = monthSpendUsd() + reservedUsd;
  if (spent + estimateUsd > monthlyBudgetUsd) {
    throw new BudgetError(
      `Monthly budget reached ($${spent.toFixed(2)} of $${monthlyBudgetUsd.toFixed(2)} used). Raise it in Workspace settings to keep checking live.`,
    );
  }
}
