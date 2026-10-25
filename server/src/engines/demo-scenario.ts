// The fictional demo company and the story its simulated history tells:
// Relaydesk starts behind Supportwave and Helpforge and climbs; strong on Perplexity, weak on Gemini; a few must-win
// prompts are won by Supportwave, whose answers lean on review sites and publications (g2, capterra, forbes, gartner)
// while Relaydesk's lean on community sources (reddit, youtube, quora) and its own site. All names and domains are invented.
import type { EngineId } from '../../../shared/types.ts';

type EngineStrength = Partial<Record<EngineId, number>>;
/** Citation-domain multipliers when the entity is recommended (>1 preferred, <1 rarely co-cited). */
type SourceFootprint = Record<string, number>;

export interface DemoCompetitor {
  name: string;
  domain: string;
  aliases: string[];
  /** Base inclusion probability per engine (0..1). */
  strength: EngineStrength;
  /** Change in strength over the first ~30 days. */
  drift: number;
  /** Review tone, -1..1. */
  tone: number;
  sources: SourceFootprint;
  /** Chance its own site is cited when it is recommended (default: engine habit). */
  siteRate?: number;
}

export const DEMO = {
  brand: {
    name: 'Relaydesk',
    domain: 'relaydesk.io',
    aliases: ['Relay Desk'],
    description:
      'Relaydesk is an AI-assisted help desk for B2B SaaS support teams: shared inbox, smart ticket routing, SLA tracking and a customer-facing knowledge base.',
    industry: 'Customer Support Software',
    strength: { chatgpt: 0.17, claude: 0.27, gemini: 0.03, perplexity: 0.4, grok: 0.15, deepseek: 0.12 } as EngineStrength,
    drift: 0.22,
    tone: 0.08,
    sources: {
      'reddit.com': 1.6, 'youtube.com': 3, 'quora.com': 3, 'medium.com': 2.5, 'linkedin.com': 2.5, 'zapier.com': 1.5,
      'g2.com': 0.25, 'capterra.com': 0.3, 'forbes.com': 0.25, 'gartner.com': 0.3, 'trustradius.com': 0.35, 'wikipedia.org': 0.5,
    } as SourceFootprint,
  },
  competitors: [
    {
      name: 'Supportwave', domain: 'supportwave.com', aliases: [], strength: { chatgpt: 0.66, claude: 0.6, gemini: 0.72, perplexity: 0.55 }, drift: -0.08, tone: 0.2,
      sources: { 'g2.com': 4, 'capterra.com': 3.5, 'forbes.com': 3.5, 'gartner.com': 3, 'trustradius.com': 2.5 },
      siteRate: 0.4,
    },
    {
      name: 'Helpforge', domain: 'helpforge.io', aliases: [], strength: { chatgpt: 0.52, claude: 0.5, gemini: 0.62, perplexity: 0.44 }, drift: 0, tone: 0.1,
      sources: { 'techradar.com': 3, 'pcmag.com': 3, 'softwareadvice.com': 2.5, 'capterra.com': 1.5 },
    },
    {
      name: 'Deskpilot', domain: 'deskpilot.com', aliases: [], strength: { chatgpt: 0.36, claude: 0.42, gemini: 0.3, perplexity: 0.4 }, drift: 0.02, tone: 0.3,
      sources: { 'zapier.com': 3, 'techrepublic.com': 2.5, 'trustpilot.com': 2 },
    },
    {
      name: 'Ticketbloom', domain: 'ticketbloom.com', aliases: [], strength: { chatgpt: 0.26, claude: 0.24, gemini: 0.4, perplexity: 0.3 }, drift: 0, tone: -0.15,
      sources: { 'trustpilot.com': 3, 'getapp.com': 3 },
    },
    {
      name: 'Casehaven', domain: 'casehaven.com', aliases: ['CaseHaven HQ'], strength: { chatgpt: 0.2, claude: 0.24, gemini: 0.22, perplexity: 0.28 }, drift: 0, tone: 0,
      sources: { 'fitsmallbusiness.com': 3, 'business.com': 2.5 },
    },
  ] as DemoCompetitor[],
  /** Competitor that wins the "lost" must-win prompts. */
  rival: 'Supportwave',
} as const;
