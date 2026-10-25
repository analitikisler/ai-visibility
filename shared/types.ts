// ============================================================================
// Shared API contract — the single source of truth between server/ and web/.
// Prefer adding optional fields; renaming or removing one changes the contract for both sides.
// All endpoints are JSON under /api. Errors: { error: string } with 4xx/5xx.
// Dates: ISO strings. Days: 'YYYY-MM-DD'. Ratios: 0..1. Scores: 0..100.
// ============================================================================

// ---------- Core enums ----------

export type EngineId = 'chatgpt' | 'claude' | 'gemini' | 'perplexity' | 'grok' | 'deepseek';
export type EngineMode = 'live' | 'simulated';
export type PromptTier = 'must_win' | 'core' | 'foundational';
export type PromptIntent = 'discovery' | 'comparison' | 'alternatives' | 'how_to' | 'branded';
export type Schedule = 'manual' | 'daily' | 'weekly';
export type SentimentLabel = 'positive' | 'neutral' | 'negative';
export type SourceType = 'own' | 'competitor' | 'third_party';
export type RunStatus = 'queued' | 'running' | 'completed' | 'failed';

/** Hardal-style agent taxonomy. */
export type AgentCategory =
  | 'training'      // collects data to train models (GPTBot, ClaudeBot, Google-Extended, CCBot)
  | 'search'        // builds AI search indexes (OAI-SearchBot, PerplexityBot, Claude-SearchBot)
  | 'user_fetch'    // fetches a page live because a user asked (ChatGPT-User, Perplexity-User, Claude-User)
  | 'agent'         // autonomous browsing agents (ChatGPT Agent/Operator, etc.)
  | 'search_engine' // classic search crawlers that feed AI answers (Googlebot, Bingbot)
  | 'seo_tool';     // SEO / scraping tools (AhrefsBot, SemrushBot)

// ---------- Engines & settings ----------

export interface EngineInfo {
  id: EngineId;
  name: string;            // "ChatGPT"
  vendor: string;          // "OpenAI"
  mode: EngineMode;        // 'live' if an API key is configured, else 'simulated'
  model: string;           // model used for live calls (or "simulated")
  keySetting: string;      // settings key that enables it, e.g. 'OPENAI_API_KEY'
  supportsCitations: boolean;
  /** How this engine gets cheaper in batch-mode checks: a provider batch API, OpenAI's flex tier, or not at all. */
  economy?: 'batch' | 'flex' | null;
}

export interface SettingsView {
  /** Masked values, e.g. "sk-…a1b2" or null when unset. */
  keys: Record<string, string | null>;
  /** Model overrides, e.g. { OPENAI_MODEL: 'gpt-5-mini' }. */
  models: Record<string, string>;
  /** Engine used for analysis/drafting when available (first live engine by default). */
  analysisEngine: EngineId | null;
  /** Built-in model per model setting, so the UI can tell an override from the default. */
  defaultModels?: Record<string, string>;
  /** The stored analysis-engine choice (may not be live yet); null = automatic. */
  analysisEnginePreference?: EngineId | null;
  /** Cost controls (see UsageView for spend). */
  cost?: CostSettings;
}
export interface SettingsUpdate {
  keys?: Record<string, string | null>;   // null/'' clears
  models?: Record<string, string>;        // '' resets to the default model
  /** Preferred analysis engine (setting ANALYSIS_ENGINE); null clears (= first live engine). */
  analysisEngine?: EngineId | null;
  cost?: Partial<CostSettings>;
}

// ---------- Cost controls & usage ----------

export type RunMode = 'realtime' | 'batch';

export interface CostSettings {
  /** Hard monthly cap on estimated live spend (USD, all projects). Live calls stop once it's reached; 0 = no live calls. */
  monthlyBudgetUsd: number;
  /** How scheduled checks run: 'batch' (provider batch APIs, ~50% cheaper, results within hours) or 'realtime'. */
  scheduledMode: RunMode;
  /** Reuse an answer already collected today for the same prompt × engine instead of paying for it again. */
  reuseSameDay: boolean;
}

/** Tokens, searches and estimated cost of one live answer (absent for simulated answers). */
export interface AnswerUsage {
  inputTokens: number;
  outputTokens: number;
  /** Input tokens served from the provider's prompt cache (billed at the cached rate). */
  cachedTokens: number;
  /** Web searches / grounding queries the engine ran for this answer. */
  searchCalls: number;
  /** Estimated cost in USD at list prices (see server/src/engines/pricing.ts), after batch/cache discounts. */
  costUsd: number;
  /** Answered through a provider batch API (discounted). */
  batch: boolean;
}

/** GET /api/usage?days=30 — estimated live spend at list prices (simulated answers cost nothing). */
export interface UsageView {
  range: { from: string; to: string; days: number };
  /** Current calendar month (UTC); `label` is display text, e.g. "October 2026". Spend includes drafts and checks. */
  month: { label: string; spendUsd: number; budgetUsd: number; remainingUsd: number };
  totals: { answers: number; liveAnswers: number; costUsd: number; inputTokens: number; outputTokens: number; cachedTokens: number; searchCalls: number };
  /** Estimated money not spent thanks to batch discounts, prompt caching and same-day reuse. */
  savings: { batchUsd: number; cacheUsd: number; reuseUsd: number; reusedAnswers: number };
  byEngine: { engine: EngineId; name: string; model: string; answers: number; costUsd: number; avgCostUsd: number; inputTokens: number; outputTokens: number; cachedTokens: number; searchCalls: number; batchShare: number }[];
  byProject: { projectId: string; name: string; answers: number; costUsd: number }[];
  /** `answers` counts live (billable) answers only; `costUsd` also includes drafts and suggestions. */
  byDay: { day: string; costUsd: number; answers: number }[];
  pricingAsOf: string;
}

// ---------- Projects ----------

export interface Competitor {
  id: string;
  projectId: string;
  name: string;
  domain: string;
  aliases: string[];
  color: string;
}

export interface Project {
  id: string;
  name: string;
  domain: string;
  aliases: string[];
  description: string;
  industry: string;
  market: string;
  language: string;
  engines: EngineId[];
  schedule: Schedule;
  siteKey: string;
  isDemo: boolean;
  createdAt: string;
  updatedAt: string;
  competitors: Competitor[];
  promptCount: number;
  lastRunAt: string | null;
  /** Only on GET /projects (list): 30-day brand visibility score (0..100), delta vs prior 30 days, daily trend 0..1. */
  summary?: { visibilityScore: number | null; delta: number | null; trend: (number | null)[] };
}

export interface ProjectInput {
  name: string;
  domain: string;
  aliases?: string[];
  description?: string;
  industry?: string;
  market?: string;
  language?: string;
  engines?: EngineId[];
  schedule?: Schedule;
  competitors?: { name: string; domain?: string; aliases?: string[] }[];
  prompts?: PromptInput[];
}

/** POST /api/projects/suggest  { name, domain, description? } -> ProjectSuggestion */
export interface ProjectSuggestion {
  description: string;
  industry: string;
  aliases: string[];
  competitors: { name: string; domain: string }[];
  prompts: PromptInput[];
  mode: 'llm' | 'heuristic';
}

// ---------- Prompts ----------

export interface Prompt {
  id: string;
  projectId: string;
  text: string;
  topic: string;
  tier: PromptTier;
  intent: PromptIntent;
  active: boolean;
  createdAt: string;
}
export interface PromptInput {
  text: string;
  topic?: string;
  tier?: PromptTier;
  intent?: PromptIntent;
  active?: boolean;
}

// ---------- Runs ----------

export interface Run {
  id: string;
  projectId: string;
  trigger: 'manual' | 'scheduled' | 'seed';
  status: RunStatus;
  engines: EngineId[];
  totalJobs: number;
  doneJobs: number;
  failedJobs: number;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
  /** 'batch' runs submit provider batches and finish when results arrive (minutes to hours). */
  mode?: RunMode;
  /** Engines whose provider batch is still processing (status stays 'running' meanwhile). */
  pendingBatches?: { engine: EngineId; jobs: number; submittedAt: string }[];
  /** Jobs skipped because today's answer for that prompt × engine was reused. Not included in totalJobs/doneJobs. */
  reusedJobs?: number;
  /** Estimated cost of this run's live answers so far (USD). */
  costUsd?: number;
}

// ---------- Responses / mentions / citations ----------

export interface Mention {
  entityType: 'brand' | 'competitor';
  competitorId: string | null;
  entityName: string;
  position: number;
  count: number;
  sentiment: number;
  sentimentLabel: SentimentLabel;
  context: string;
}
export interface Citation {
  url: string;
  domain: string;
  title: string;
  position: number;
  sourceType: SourceType;
  competitorId: string | null;
}
export interface AiResponse {
  id: string;
  runId: string;
  promptId: string;
  promptText: string;
  engine: EngineId;
  model: string;
  mode: EngineMode;
  text: string;
  brandMentioned: boolean;
  brandPosition: number | null;
  brandSentiment: number | null;
  mentions: Mention[];
  citations: Citation[];
  latencyMs: number | null;
  /** Live answers only. */
  usage?: AnswerUsage | null;
  error: string | null;
  createdAt: string;
}

// ---------- Monitor (dashboard aggregates) ----------
// Query params common to aggregates: ?days=30 (7|14|30|90) &engine=chatgpt (optional) &tier=must_win (optional)

export interface Kpi {
  value: number;
  /** change vs previous equal-length period (absolute, same unit as value); null if no prior data */
  delta: number | null;
}
/** A Kpi that can be undefined for the period (e.g. sentiment when the brand has no mentions): value and delta are then null. */
export type NullableKpi = Kpi | { value: null; delta: null };

export interface SeriesPoint {
  day: string;
  [seriesKey: string]: number | string | null; // e.g. { day, brand: 0.42, cmp_x: 0.31 }
}

export interface EntityStat {
  key: string;               // 'brand' or competitor id
  name: string;
  isBrand: boolean;
  color: string;
  visibility: number;        // share of responses mentioning entity (0..1)
  shareOfVoice: number;      // entity mentions / all tracked-entity mentions (0..1)
  avgPosition: number | null;
  sentiment: number | null;  // avg -1..1
  mentions: number;
  rank: number;              // 1 = leader by visibility
}

export interface EngineStat {
  engine: EngineId;
  name: string;
  mode: EngineMode;
  responses: number;
  visibility: number;
  avgPosition: number | null;
  sentiment: number | null;
  shareOfVoice: number;
}

/** GET /api/projects/:id/overview */
export interface Overview {
  range: { from: string; to: string; days: number };
  kpis: {
    visibilityScore: Kpi;    // 0..100 = visibility * 100, 2 decimals (same rounding as leaderboard visibility)
    shareOfVoice: Kpi;       // 0..100, 2 decimals
    avgPosition: Kpi;        // lower is better; value 0 if never mentioned
    sentiment: NullableKpi;  // 0..100 (mapped from -1..1), 2 decimals; null when the brand has no mentions
    mentions: Kpi;           // count of brand mentions
    citations: Kpi;          // count of citations to own domain
  };
  visibilityTrend: SeriesPoint[];   // keys: 'brand' + each competitor id -> visibility 0..1
  sovTrend: SeriesPoint[];          // same keys -> share of voice 0..1
  leaderboard: EntityStat[];
  engines: EngineStat[];
  topSources: SourceStat[];         // top 8
  sentimentBreakdown: { positive: number; neutral: number; negative: number }; // brand mention counts
  tiers: { tier: PromptTier; prompts: number; visibility: number }[];
  lastRun: Run | null;
  totals: { responses: number; prompts: number; runs: number };
}

/** GET /api/projects/:id/prompt-stats */
export interface PromptStat {
  prompt: Prompt;
  responses: number;
  visibility: number;                  // brand visibility on this prompt
  avgPosition: number | null;
  sentiment: number | null;
  byEngine: Partial<Record<EngineId, { visibility: number; position: number | null; responses: number }>>;
  topCompetitor: { name: string; visibility: number } | null;
  /** Optional: visibility of every tracked competitor on this prompt, keyed by competitor id. Enables exact head-to-head lists. */
  competitorVisibility?: Record<string, number>; // competitor id -> visibility on this prompt (0..1)
  trend: number[];                     // last N daily visibility values (sparkline)
  lastRunAt: string | null;
}

/** GET /api/projects/:id/sources */
export interface SourceStat {
  domain: string;
  sourceType: SourceType;
  competitorId: string | null;
  citations: number;
  share: number;                        // of all citations (0..1)
  responses: number;                    // responses citing it
  prompts: number;                      // distinct prompts citing it
  engines: EngineId[];
  brandMentionedRate: number;           // in responses citing this domain, how often brand appears
  sampleUrls: { url: string; title: string; count: number }[];
}
export interface SourcesView {
  sources: SourceStat[];
  byType: { own: number; competitor: number; third_party: number };
  totalCitations: number;
}

// ---------- Diagnose (driver scores, like 3rd) ----------

export type DriverId = 'content_coverage' | 'content_quality' | 'source_authority' | 'technical_readiness' | 'sentiment';
export interface DriverScore {
  id: DriverId;
  name: string;
  score: number;                 // 0..100 brand
  leaderScore: number;           // best competitor score
  leaderName: string;
  explanation: string;
  evidence: string[];            // bullet points with concrete numbers
}
/** GET /api/projects/:id/diagnose */
export interface Diagnosis {
  overall: number;
  drivers: DriverScore[];
  byEngine: { engine: EngineId; drivers: Record<DriverId, number> }[];
  /** Prompts where a competitor is visible and the brand is not. */
  lostPrompts: { promptId: string; text: string; winner: string; winnerId?: string; winnerVisibility: number; brandVisibility: number }[];
}

// ---------- Plan / Act ----------

export type RecImpact = 'high' | 'medium' | 'low';
export type RecEffort = 'low' | 'medium' | 'high';
export type RecCategory = 'content' | 'technical' | 'sources' | 'reputation' | 'crawlers';
export type RecStatus = 'open' | 'in_progress' | 'done' | 'dismissed';
export type DraftKind = 'llms_txt' | 'comparison_page' | 'faq_page' | 'content_brief' | 'robots_txt' | 'schema_jsonld' | 'outreach_email';

export interface Recommendation {
  key: string;                   // stable key (used for status)
  title: string;
  description: string;
  category: RecCategory;
  impact: RecImpact;
  effort: RecEffort;
  priority: number;              // 0..100 (higher first)
  status: RecStatus;
  driver: DriverId | null;
  evidence: string[];
  relatedPromptIds: string[];
  draft?: { kind: DraftKind; params: Record<string, string> }; // "Generate with agent" button
}

export interface Draft {
  id: string;
  projectId: string;
  kind: DraftKind;
  title: string;
  body: string;
  status: 'draft' | 'approved' | 'published' | 'dismissed';
  mode: 'llm' | 'template';
  meta: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}
/** POST /api/projects/:id/drafts */
export interface DraftRequest {
  kind: DraftKind;
  params?: Record<string, string>; // e.g. { competitorId }, { promptId }, { recKey }
}

// ---------- AI-readiness audit ----------

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'info';
export interface AuditCheck {
  id: string;
  group: 'crawlability' | 'content' | 'structured_data' | 'ai_files' | 'performance';
  title: string;
  status: CheckStatus;
  detail: string;
  fix?: string;
  weight: number;
}
export interface RobotsAgentRule {
  agentId: string;
  agentName: string;
  operator: string;
  category: AgentCategory;
  allowed: 'allowed' | 'blocked' | 'partial' | 'unspecified';
}
export interface AuditResult {
  id: string;
  projectId: string;
  url: string;
  score: number;
  createdAt: string;
  /** True for the generated sample audit of a demo project (its domain is fictional); show a "Sample" badge. */
  demo?: boolean;
  checks: AuditCheck[];
  /** `raw` (optional): robots.txt text as fetched (capped at 32 KB), used to preserve existing rules in drafts. */
  robots: { found: boolean; agents: RobotsAgentRule[]; sitemaps: string[]; raw?: string };
  llmsTxt: { found: boolean; url: string; bytes: number; preview: string };
  page: {
    title: string;
    metaDescription: string;
    h1: string[];
    wordCount: number;
    schemaTypes: string[];
    ogTags: Record<string, string>;
    canonical: string | null;
    lang: string | null;
    statusCode: number | null;
    responseMs: number | null;
  };
}

// ---------- Crawler analytics (Hardal-style) ----------

export interface AiAgent {
  id: string;                 // 'gptbot'
  name: string;               // 'GPTBot'
  operator: string;           // 'OpenAI'
  category: AgentCategory;
  product?: string;           // 'ChatGPT'
  pattern: string;            // UA regex source (case-insensitive); '' when not detectable by UA
  /** Tokens used on robots.txt `User-agent:` lines for this agent, e.g. ['GPTBot']. */
  robotsTokens: string[];
  /** false for robots.txt-only control tokens (Google-Extended, Applebot-Extended) that never appear in a UA. */
  uaDetectable: boolean;
  /** Published IP ranges JSON for verification, if the operator provides one. */
  ipRangesUrl?: string;
  docsUrl?: string;
  respectsRobots: boolean;
  description: string;
}

export interface AiReferrer {
  id: string;                 // 'chatgpt'
  name: string;               // 'ChatGPT'
  operator: string;
  hosts: string[];            // ['chatgpt.com', 'chat.openai.com']
  utmSources?: string[];      // ['chatgpt.com']
}

/** One hit as sent by an integration. POST /api/ingest/:siteKey accepts IngestEvent | IngestEvent[] */
export interface IngestEvent {
  url?: string;               // full URL or path
  path?: string;
  userAgent: string;
  ip?: string;
  referrer?: string;
  status?: number;
  ts?: string;                // ISO; defaults to now
  /** Value of the `Signature-Agent` request header (Web Bot Auth), e.g. '"https://chatgpt.com"' — identifies ChatGPT agent, which uses a normal Chrome UA. */
  signatureAgent?: string;
}

export interface CrawlerOverview {
  range: { from: string; to: string; days: number };
  /**
   * AI agents only (training, search, user_fetch, agent). `allVisits` adds classic search engines and SEO tools.
   * `trend`, `byAgent`, `byOperator` and `byCategory` cover every category (shares are of all visits);
   * `topPages` and `statusCodes` cover AI agents only. Spoofed hits are only counted in `spoofedVisits`.
   */
  totals: {
    visits: Kpi; agents: Kpi; pages: Kpi; operators: Kpi; allVisits?: Kpi;
    /** AI visits (subset of `visits`) whose IP is inside the operator's published ranges for that agent. */
    verifiedVisits?: Kpi;
    /** Hits of any category whose UA names a known agent but whose IP is outside its published ranges. Left out of every other number here. */
    spoofedVisits?: Kpi;
  };
  trend: SeriesPoint[];                         // keys = category ids -> visits
  byAgent: { agentId: string; name: string; operator: string; category: AgentCategory; visits: number; pages: number; lastSeen: string; share: number }[];
  byOperator: { operator: string; visits: number; agents: number; share: number }[];
  byCategory: { category: AgentCategory; visits: number; share: number }[];
  topPages: { path: string; visits: number; agents: number; lastSeen: string; topAgent: string }[];
  /** Pages from sitemap/known pages that no AI agent fetched in range. */
  missedPages: { path: string; source: 'sitemap' | 'known' }[];
  newAgents: { agentId: string; name: string; firstSeen: string }[];  // first seen within range
  statusCodes: { status: number; visits: number }[];
}

export interface BotEvent {
  id: string;
  ts: string;
  agentId: string;
  agentName: string;
  operator: string;
  category: AgentCategory;
  path: string;
  status: number | null;
  userAgent: string;
  ip: string;
  verified: boolean;
  /** verified: IP in the agent's published ranges · unverified: can't tell (no IP or list) · spoofed: IP outside them. */
  verification?: BotVerification;
  source: string;
}

/** IP check of a crawler hit against the ranges its operator publishes (see server/src/crawlers/verify.ts). */
export type BotVerification = 'verified' | 'unverified' | 'spoofed';

export interface ReferralOverview {
  range: { from: string; to: string; days: number };
  totals: { visits: Kpi; sources: Kpi; landingPages: Kpi };
  trend: SeriesPoint[];                         // keys = referrer ids -> visits
  bySource: { sourceId: string; name: string; visits: number; share: number }[];
  topLandingPages: { path: string; visits: number; topSource: string }[];
}

/** GET /api/projects/:id/integration -> snippets for the Integrations tab */
export interface IntegrationInfo {
  siteKey: string;
  /** Secret for server-side ingestion and log shipping (Authorization: Bearer …). The site key alone only admits referral beacons. */
  ingestToken: string;
  ingestUrl: string;                 // absolute URL of POST /api/ingest/:siteKey
  pixelScript: string;               // <script> tag for AI-referral tracking
  snippets: { id: string; name: string; language: string; code: string }[]; // express, nextjs, cloudflare, nginx, vercel...
  lastEventAt: string | null;
}

// ---------- Reports ----------

/** GET /api/projects/:id/report?days=7 */
export interface Report {
  project: Pick<Project, 'id' | 'name' | 'domain'>;
  generatedAt: string;
  range: { from: string; to: string; days: number };
  headline: string;              // one-sentence summary
  highlights: string[];          // bullets: wins
  risks: string[];               // bullets: losses / threats
  overview: Overview;
  diagnosis: Diagnosis;
  topRecommendations: Recommendation[];
  crawlers: Pick<CrawlerOverview, 'totals' | 'byOperator'> | null;
}

// ---------- Generic ----------

export interface Paged<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
