// Small helpers shared by the live provider adapters.

export const countryOf = (market?: string) => (market && /^[A-Za-z]{2}$/.test(market) ? market.toUpperCase() : undefined);

/**
 * Where the model decides whether to search (Claude, ChatGPT), nudge it to behave like the consumer apps do for
 * buying questions: search first and cite. Neutral on purpose — it must never steer which brands get named.
 */
export const SEARCH_INSTRUCTION =
  'When a question is about products, services, vendors, pricing or recommendations, search the web for current information before answering, and cite your sources.';

/** Non-negative integer from an optional provider usage field. */
export const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);
