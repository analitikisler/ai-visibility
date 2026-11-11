// Small statistics shared by monitor aggregates, recommendation outcomes and alerts.

/**
 * Half-width of the 95% Wilson interval for `hits` out of `n` answers, in points (0..100, one decimal); null
 * without answers. It is a floor on the real uncertainty: answers to the same prompt on different days or engines
 * are not independent, and it says nothing about prompts that aren't tracked.
 */
export function marginPoints(hits: number, n: number): number | null {
  if (n <= 0) return null;
  const z = 1.96;
  const p = hits / n;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / (1 + (z * z) / n);
  return Math.round(half * 1000) / 10;
}
