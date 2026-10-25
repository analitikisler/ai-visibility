// Turns a raw engine answer into mentions (with position / count / sentiment / context) and classified citations.
import type { Project, SentimentLabel } from '../../../shared/types.ts';
import { labelSentiment, scoreSentiment } from '../data/sentiment.ts';
import type { EngineCitation } from '../engines/types.ts';
import { extractCitations, type ResolvedCitation } from './citations.ts';
import { detectMentions, trackedEntities, type TrackedEntity } from './entities.ts';

export interface AnalyzedMention {
  entity: TrackedEntity;
  position: number;
  count: number;
  sentiment: number;
  sentimentLabel: SentimentLabel;
  context: string;
}

export interface Analysis {
  mentions: AnalyzedMention[];
  citations: ResolvedCitation[];
  brand: { mentioned: boolean; position: number | null; sentiment: number | null };
}

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Mean lexicon sentiment over the spans that talk about the entity, clamped to -1..1. */
function sentimentOf(scopes: string[]): number {
  const scores = scopes.filter(Boolean).map((s) => scoreSentiment(s)).filter((n) => Number.isFinite(n));
  if (!scores.length) return 0;
  return round3(Math.max(-1, Math.min(1, scores.reduce((a, b) => a + b, 0) / scores.length)));
}

export function analyzeAnswer(text: string, engineCitations: EngineCitation[], project: Project, entities = trackedEntities(project)): Analysis {
  const mentions = detectMentions(text, entities).map((m) => {
    const sentiment = sentimentOf(m.scopes);
    return { entity: m.entity, position: m.position, count: m.count, sentiment, sentimentLabel: labelSentiment(sentiment), context: m.context };
  });
  const brand = mentions.find((m) => m.entity.type === 'brand');
  return {
    mentions,
    citations: extractCitations(text, engineCitations, project),
    brand: { mentioned: !!brand, position: brand?.position ?? null, sentiment: brand?.sentiment ?? null },
  };
}
