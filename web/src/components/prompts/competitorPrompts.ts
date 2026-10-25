// Head-to-head prompts built from the competitors entered during onboarding. The suggest endpoint
// only knows name/domain/description, so its template prompts can't name competitors; these fill the
// comparison and alternatives slots buyers actually type ("Acme vs Globex", "alternatives to Globex").
import type { PromptInput } from '@shared/types';

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const mentions = (text: string, names: string[]) =>
  names.some((n) => new RegExp(`(?<![\\p{L}\\p{N}])${escape(n)}(?![\\p{L}\\p{N}])`, 'iu').test(text));

/** Comparison / alternatives prompts for up to four competitors (must-win for the closest rival, core for the rest). */
export function competitorPrompts(brand: string, competitors: string[]): PromptInput[] {
  const [c0, c1, c2, c3] = competitors;
  if (!brand || !c0) return [];
  const out: PromptInput[] = [
    { text: `${brand} vs ${c0}: which is better?`, tier: 'must_win', intent: 'comparison', topic: 'Comparisons' },
    { text: `What are the best alternatives to ${c0}?`, tier: 'must_win', intent: 'alternatives', topic: 'Alternatives' },
    c1
      ? { text: `Compare ${brand}, ${c0} and ${c1}`, tier: 'must_win', intent: 'comparison', topic: 'Comparisons' }
      : { text: `${c0} or ${brand}: which should I pick?`, tier: 'must_win', intent: 'comparison', topic: 'Comparisons' },
    { text: `${brand} or ${c1 ?? c0}? Pricing and features compared`, tier: 'core', intent: 'comparison', topic: 'Pricing' },
    { text: `Cheaper alternatives to ${c1 ?? c0}`, tier: 'core', intent: 'alternatives', topic: 'Pricing' },
  ];
  if (c1) out.push({ text: `${c0} vs ${c1}: pros and cons?`, tier: 'core', intent: 'comparison', topic: 'Comparisons' });
  if (c2) {
    out.push({ text: `${brand} vs ${c2}`, tier: 'core', intent: 'comparison', topic: 'Comparisons' });
    out.push({ text: `Is there a better option than ${c2}?`, tier: 'core', intent: 'alternatives', topic: 'Alternatives' });
  }
  if (c3) out.push({ text: `${c3} alternatives`, tier: 'core', intent: 'alternatives', topic: 'Alternatives' });
  return out;
}

/**
 * Suggested prompts + head-to-head prompts for the competitors they don't name yet. When the suggestions
 * name no competitor at all (template mode), their generic comparisons ("Is Acme better than other CRMs?")
 * give way to the named ones.
 */
export function withCompetitorPrompts(base: PromptInput[], brand: string, competitors: string[], max = 200): PromptInput[] {
  const own = brand.trim().toLowerCase();
  const names = [...new Map(competitors.map((c) => [c.trim().toLowerCase(), c.trim()])).values()].filter((c) => c && c.toLowerCase() !== own);
  const unnamed = names.filter((n) => !base.some((p) => mentions(p.text, [n])));
  if (!unnamed.length) return base.slice(0, max);
  const kept = unnamed.length === names.length ? base.filter((p) => p.intent !== 'comparison' || mentions(p.text, names)) : base;
  const seen = new Set(kept.map((p) => p.text.trim().toLowerCase()));
  const extra = competitorPrompts(brand.trim(), unnamed).filter((p) => !seen.has(p.text.toLowerCase()) && seen.add(p.text.toLowerCase()));
  // Head-to-head prompts first: they're the must-win ones.
  return [...extra, ...kept].slice(0, max);
}
