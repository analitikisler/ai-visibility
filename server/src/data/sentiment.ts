// Lexicon-based sentiment for AI-answer snippets about products and brands.
// VADER-style: token valences (-3..3) adjusted for intensifiers, hedges, negation and
// contrast ("but", "although"), summed and squashed to -1..1 with x / sqrt(x² + α).
// Tuned so neutral descriptive sentences score ~0 and clearly positive ones ~0.4–0.8.
import type { SentimentLabel } from '../../../shared/types.ts';

/** Multi-word phrases, matched before single words (hyphens are normalised to spaces). */
const PHRASES: Record<string, number> = {
  'steep learning curve': -2,
  'learning curve': -1,
  'easy to use': 2.2,
  'easy to set up': 2,
  'easy to learn': 2,
  'user friendly': 2,
  'hard to use': -2,
  'difficult to use': -2,
  'hard to beat': 2.2,
  'hard to navigate': -1.8,
  'best in class': 2.6,
  'industry leader': 2,
  'market leader': 2,
  'industry standard': 1.6,
  'go to': 1.4,
  'top choice': 2,
  'top pick': 2,
  'stands out': 1.8,
  'stand out': 1.6,
  'well regarded': 1.8,
  'highly rated': 2,
  'highly recommended': 2.4,
  'worth it': 1.6,
  'worth the money': 1.8,
  'good value': 2,
  'great value': 2.5,
  'value for money': 1.6,
  'peace of mind': 1.6,
  'falls short': -2,
  'fall short': -2,
  'hidden fees': -2.2,
  'price increase': -1.4,
  'price increases': -1.4,
  'price hike': -1.6,
  'price hikes': -1.6,
  'data breach': -2.5,
  'security issues': -2,
  'privacy concerns': -1.8,
  'customer service issues': -2,
  'poor support': -2.2,
  'slow support': -1.8,
  'lock in': -1.2,
  'vendor lock in': -1.6,
  'not worth': -1.8,
  'a lot to be desired': -2,
  'leaves much to be desired': -2,
  'mixed reviews': -0.8,
  'love it': 2.2,
  'works well': 1.4,
  'works great': 2,
  'well suited': 1.4,
  'well designed': 1.6,
  'well documented': 1.4,
  'free plan': 0.5,
  'free tier': 0.5,
  'free trial': 0.4,
  // Neutral domain terms that would otherwise hit the lexicon ("issue", "risk", "no").
  'issue tracking': 0,
  'issue tracker': 0,
  'bug tracking': 0,
  'bug tracker': 0,
  'risk management': 0,
  'problem solving': 0,
  'hard drive': 0,
  'limited time': 0,
  'crash course': 0,
  'no code': 0,
  'low code': 0,
  'out of the box': 0.8,
  'feature rich': 1.8,
  'award winning': 2.2,
  'state of the art': 1.8,
  'cutting edge': 1.6,
  'top notch': 2.4,
  'second to none': 2.6,
  'on the pricey side': -1.2,
  'add up quickly': -1.2,
  'gets expensive': -1.6,
  'can get expensive': -1.6,
};

const WORDS: Record<string, number> = {
  // positive
  excellent: 3, outstanding: 3, exceptional: 3, superb: 3, phenomenal: 3, fantastic: 2.8, amazing: 2.6,
  great: 2.4, perfect: 2.4, impressive: 2.2, superior: 2, ideal: 1.8, delightful: 2.4, brilliant: 2.4,
  good: 1.8, nice: 1.4, solid: 1.6, strong: 1.6, robust: 2, powerful: 2, reliable: 2, dependable: 1.9,
  intuitive: 2.2, seamless: 2.2, seamlessly: 2, smooth: 1.6, polished: 1.8, sleek: 1.5, elegant: 1.8,
  easy: 1.4, easily: 1, simple: 1.1, straightforward: 1.4, effortless: 2, convenient: 1.5,
  affordable: 1.8, inexpensive: 1.4, cheap: 1.2, cheaper: 1, cheapest: 1.2, generous: 1.6, competitive: 0.8,
  flexible: 1.6, versatile: 1.8, comprehensive: 1.6, customizable: 1.4, scalable: 1.6, efficient: 1.6,
  fast: 1.3, faster: 1.2, quick: 1, responsive: 1.4, secure: 1.4, stable: 1.4, accurate: 1.5, durable: 1.8,
  innovative: 1.8, modern: 0.8, mature: 0.9, transparent: 1.4, helpful: 1.6, valuable: 1.8, useful: 1.4,
  popular: 1.3, trusted: 1.8, leader: 1.8, leading: 1.5, favorite: 1.8, favourite: 1.8, preferred: 1.4,
  standout: 2, best: 1.2, top: 0.8, recommended: 1.8, recommend: 1.5, praised: 2.2, praise: 1.8, loved: 2.2,
  love: 2, beloved: 2.2, acclaimed: 2.2, celebrated: 1.8, admired: 1.8, satisfied: 1.8, happy: 1.6, enjoy: 1.5,
  excels: 2.2, excel: 2, shines: 2, thrives: 1.6, wins: 1.4, win: 1, benefit: 1, benefits: 1, advantage: 1.2,
  advantages: 1.2, strength: 1.4, strengths: 1.4, effective: 1.6, safe: 1.2, comfortable: 1.6, delicious: 2.2,
  tasty: 1.8, fresh: 1, healthy: 1.2, fun: 1.4, engaging: 1.5, beautiful: 2, clean: 1, improved: 1,
  improves: 1, boost: 1, boosts: 1, empowers: 1.4, worth: 1, unmatched: 2.4, unbeatable: 2.4, rich: 0.8,
  // negative
  expensive: -1.6, pricey: -1.3, costly: -1.5, overpriced: -2.2, clunky: -2, slow: -1.6, sluggish: -1.8,
  buggy: -2.2, bugs: -1.5, bug: -1.2, glitchy: -2, glitches: -1.6, laggy: -1.8, lag: -1.3, crash: -2,
  crashes: -2, unreliable: -2.2, unstable: -1.8, downtime: -1.8, outage: -1.8, outages: -1.8,
  limited: -1.4, limitation: -1.2, limitations: -1.3, lacks: -1.6, lacking: -1.6, lack: -1.4, missing: -1.2,
  outdated: -1.8, dated: -1.2, complex: -0.5, complicated: -1.5, confusing: -1.8, cluttered: -1.5,
  overwhelming: -1.4, bloated: -1.8, cumbersome: -1.8, tedious: -1.6, rigid: -1.2, restrictive: -1.4,
  frustrating: -2.2, frustrated: -2, frustration: -2, annoying: -1.8, disappointing: -2.2, disappointed: -2,
  poor: -2.2, poorly: -2, bad: -2.2, terrible: -3, awful: -3, horrible: -3, worst: -3, weak: -1.6,
  mediocre: -1.8, inconsistent: -1.5, unhelpful: -1.8, unresponsive: -1.8, complaints: -1.6, complaint: -1.4,
  complain: -1.4, complained: -1.4, criticized: -1.8, criticised: -1.8, criticism: -1.6, concerns: -1.1,
  concern: -1, issues: -1.1, issue: -0.9, problems: -1.4, problem: -1.2, problematic: -1.8, drawback: -1.4,
  drawbacks: -1.4, downside: -1.4, downsides: -1.4, shortcomings: -1.6, flaws: -1.6, flawed: -1.8,
  difficult: -1.4, hard: -0.6, struggle: -1.4, struggles: -1.6, struggling: -1.6, steep: -1, risky: -1.6,
  risk: -0.7, risks: -0.8, breach: -2.4, vulnerable: -1.8, vulnerability: -1.6, insecure: -2, lawsuit: -2,
  scam: -3, fraud: -3, spam: -2, intrusive: -1.6, noisy: -1.2, flimsy: -1.8, fragile: -1.4, unhealthy: -1.6,
  bland: -1.4, stale: -1.4, declining: -1.4, decline: -1, overkill: -1, confusingly: -1.6, painful: -1.8,
  hassle: -1.6, worse: -1.8, fails: -1.8, fail: -1.6, failed: -1.6, failure: -1.8, avoid: -1.6, unclear: -1,
};

const NEGATORS = new Set([
  'not', 'no', 'never', 'none', 'nothing', 'neither', 'nor', 'without', 'hardly', 'barely', 'rarely', 'cannot',
  "isn't", "aren't", "wasn't", "weren't", "doesn't", "don't", "didn't", "can't", "won't", "wouldn't",
  "shouldn't", "couldn't", "hasn't", "haven't", 'isnt', 'arent', 'doesnt', 'dont', 'didnt', 'cant', 'wont',
  'few', 'minimal', 'zero',
]);

const BOOSTERS: Record<string, number> = {
  very: 1.3, extremely: 1.5, highly: 1.4, really: 1.25, incredibly: 1.5, exceptionally: 1.5, particularly: 1.2,
  remarkably: 1.4, super: 1.3, truly: 1.3, especially: 1.2, major: 1.25, significant: 1.25,
  significantly: 1.3, notably: 1.15, consistently: 1.2, genuinely: 1.25, so: 1.15, too: 1.2, most: 1.1,
  slightly: 0.6, somewhat: 0.65, fairly: 0.75, relatively: 0.75, moderately: 0.7, bit: 0.6, little: 0.7,
  occasionally: 0.7, sometimes: 0.75, minor: 0.6, some: 0.85, can: 0.85, may: 0.8, might: 0.8,
};

/** "X but Y": the clause before is down-weighted, the clause after up-weighted. */
const CONTRAST = new Set(['but', 'however', 'yet', 'nevertheless']);
/** "Although X, Y": the leading concession (up to the comma) is down-weighted, the rest up-weighted. */
const CONCESSIVE_LEAD = new Set(['although', 'though', 'while', 'whilst', 'despite', 'even']);
/** "Y, although X": the trailing concession is down-weighted. */
const CONCESSIVE_MID = new Set(['although', 'though', 'despite', 'albeit']);

const ALPHA = 15;
const NEGATION_WINDOW = 3;
const NEGATION_FACTOR = -0.7;

interface Token {
  text: string;
  score: number; // valence (0 for non-lexicon tokens)
  span: number; // number of words consumed (phrases > 1)
}

const MAX_PHRASE_WORDS = Math.max(...Object.keys(PHRASES).map((p) => p.split(' ').length));

function tokenize(sentence: string): Token[] {
  const words = sentence
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/[-–—/]/g, ' ')
    .replace(/[^a-z0-9' ,]/g, ' ')
    .replace(/,/g, ' , ')
    .split(/\s+/)
    .filter(Boolean);
  const out: Token[] = [];
  for (let i = 0; i < words.length; ) {
    let matched = false;
    for (let n = Math.min(MAX_PHRASE_WORDS, words.length - i); n >= 2; n--) {
      const phrase = words.slice(i, i + n).join(' ');
      const v = PHRASES[phrase];
      if (v !== undefined) {
        out.push({ text: phrase, score: v, span: n });
        i += n;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    const w = words[i] ?? '';
    out.push({ text: w, score: WORDS[w] ?? 0, span: 1 });
    i++;
  }
  return out;
}

/** "rated 4.7/5", "4.5 out of 5 stars" -> valence. */
function ratingValence(sentence: string): number {
  let v = 0;
  for (const m of sentence.matchAll(/(\d(?:\.\d)?)\s*(?:\/|out of)\s*5\b/gi)) {
    const r = Number(m[1]);
    if (r >= 4.5) v += 2.2;
    else if (r >= 4) v += 1.6;
    else if (r >= 3.5) v += 0.6;
    else if (r <= 2.5) v -= 2;
    else if (r < 3) v -= 1;
  }
  return v;
}

function scoreSentenceRaw(sentence: string): number {
  const tokens = tokenize(sentence);
  const contrastAt = tokens.findIndex((t, i) => i > 0 && CONTRAST.has(t.text));
  const leadEnd = CONCESSIVE_LEAD.has(tokens[0]?.text ?? '') ? tokens.findIndex((t) => t.text === ',') : -1;
  const midAt = tokens.findIndex((t, i) => i > 0 && CONCESSIVE_MID.has(t.text));
  const clauseWeight = (i: number): number => {
    if (contrastAt > 0) return i < contrastAt ? 0.5 : 1.5;
    if (leadEnd > 0) return i < leadEnd ? 0.5 : 1.5;
    if (midAt > 0) return i > midAt ? 0.5 : 1;
    return 1;
  };

  let sum = 0;
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (!tok || tok.score === 0) continue;
    let v = tok.score;

    // Intensifiers / hedges directly before (up to 2 words back).
    for (let k = 1; k <= 2; k++) {
      const prev = tokens[i - k];
      if (!prev || prev.score !== 0) break;
      const b = BOOSTERS[prev.text];
      if (b !== undefined) v *= b;
    }

    // Negation within the preceding window, stopping at a comma or another sentiment word.
    for (let k = 1; k <= NEGATION_WINDOW; k++) {
      const prev = tokens[i - k];
      if (!prev || prev.text === ',' || prev.score !== 0) break;
      if (!NEGATORS.has(prev.text)) continue;
      const next = tokens[i - k + 1]?.text;
      const before = tokens[i - k - 1]?.text;
      if (prev.text === 'not' && next === 'only') break; // "not only X but also Y"
      if (prev.text === 'few' && before === 'a') v *= 0.7; // "a few drawbacks" is still negative
      else v *= NEGATION_FACTOR;
      break;
    }

    sum += v * clauseWeight(i);
  }
  return sum + ratingValence(sentence);
}

/** Lexicon-based sentiment for a sentence/snippet, -1..1. */
export function scoreSentiment(text: string): number {
  if (!text) return 0;
  const sentences = text.split(/(?<=[.!?;])\s+|\n+/).filter((s) => s.trim());
  const raw = sentences.reduce((acc, s) => acc + scoreSentenceRaw(s), 0);
  if (raw === 0) return 0;
  const score = raw / Math.sqrt(raw * raw + ALPHA);
  return Math.round(Math.max(-1, Math.min(1, score)) * 1000) / 1000;
}

export function labelSentiment(score: number): SentimentLabel {
  if (score >= 0.15) return 'positive';
  if (score <= -0.15) return 'negative';
  return 'neutral';
}
