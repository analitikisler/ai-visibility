// Small helpers shared by the live provider adapters.

const REGION_NAMES = new Intl.DisplayNames(['en'], { type: 'region', fallback: 'none' });
const LANGUAGE_NAMES = new Intl.DisplayNames(['en'], { type: 'language', fallback: 'none' });
/** Names people type that the region list spells differently. */
const COUNTRY_ALIASES: Record<string, string> = {
  usa: 'US', 'u.s.': 'US', 'u.s.a.': 'US', america: 'US', 'united states of america': 'US', uk: 'GB', 'u.k.': 'GB', britain: 'GB',
  'great britain': 'GB', england: 'GB', turkey: 'TR', turkiye: 'TR', holland: 'NL', 'south korea': 'KR', korea: 'KR', russia: 'RU',
  czechia: 'CZ', 'czech republic': 'CZ', uae: 'AE', 'hong kong': 'HK', vietnam: 'VN',
};
/** Two-letter codes the region list knows that are not countries (unions, pseudo-regions, reserved and private-use codes). */
const NOT_A_COUNTRY = /^(EU|EZ|UN|QO|ZZ|X[A-Z]|AC|CP|CQ|DG|EA|IC|TA)$/;
/** Current ISO code for two letters: retired and alias codes are mapped ("UK" → "GB", "DD" → "DE"); undefined if not a country. */
function canonicalCountry(twoLetters: string): string | undefined {
  try {
    const code = new Intl.Locale(`und-${twoLetters}`).region;
    return code && !NOT_A_COUNTRY.test(code) && REGION_NAMES.of(code) ? code : undefined;
  } catch {
    return undefined;
  }
}
let countryByName: Map<string, string> | null = null;
const fold = (s: string) => s.trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
/** English country names (accents folded) → ISO code, built once from the runtime's region list. */
function countryNames(): Map<string, string> {
  if (countryByName) return countryByName;
  countryByName = new Map(Object.entries(COUNTRY_ALIASES));
  for (let a = 65; a <= 90; a++) {
    for (let b = 65; b <= 90; b++) {
      const code = String.fromCharCode(a, b);
      if (canonicalCountry(code) !== code) continue; // aliases share their country's name
      const name = REGION_NAMES.of(code)!;
      if (!countryByName.has(fold(name))) countryByName.set(fold(name), code);
    }
  }
  return countryByName;
}

/** ISO country code for a project's market, which is free text: a code ("TR") or a country name ("Turkey", "Türkiye"). */
export function countryOf(market?: string): string | undefined {
  const m = market?.trim();
  if (!m) return undefined;
  if (/^[A-Za-z]{2}$/.test(m)) return canonicalCountry(m.toUpperCase());
  return countryNames().get(fold(m));
}

/** English name of a language code ("tr" → "Turkish"); undefined for unknown codes. */
export function languageName(code?: string): string | undefined {
  try {
    return code?.trim() ? LANGUAGE_NAMES.of(code.trim()) : undefined;
  } catch {
    return undefined;
  }
}

const NO_MARKET = /^(global|worldwide|international|world|all|any)$/i;

/**
 * One neutral sentence telling an engine where the question comes from, as the consumer apps know from the
 * person's location. Every engine gets it (only OpenAI and Anthropic also take a structured location). Empty for the
 * United States, which engines assume anyway, so default projects ask exactly what they asked before, and for
 * "global". It never names a language: engines answer in the language the question is written in.
 */
export function marketInstruction(market?: string): string {
  const raw = market?.replace(/\s+/g, ' ').trim().slice(0, 60) ?? '';
  if (!raw || NO_MARKET.test(raw)) return '';
  const code = countryOf(raw);
  if (code === 'US') return '';
  // A region or free text ("DACH", "Latin America") is passed on as written, without quotes or line breaks.
  const place = code ? REGION_NAMES.of(code)! : raw.replace(/["\n\r]/g, '');
  return `The person asking is in this market: ${place}. Answer for that market, in the language of the question.`;
}

/** Joins instruction sentences, skipping empty ones. */
export const instructions = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' ');

/**
 * Where the model decides whether to search (Claude, ChatGPT), nudge it to behave like the consumer apps do for
 * buying questions: search first and cite. Neutral on purpose — it must never steer which brands get named.
 */
export const SEARCH_INSTRUCTION =
  'When a question is about products, services, vendors, pricing or recommendations, search the web for current information before answering, and cite your sources.';

/** Non-negative integer from an optional provider usage field. */
export const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0);
