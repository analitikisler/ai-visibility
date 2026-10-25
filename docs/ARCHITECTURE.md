# ai visibility — Architecture

> Product name: **ai visibility** (formerly Overt), one of the Analitik İşler ai tools; tagline "Be the answer." Brand system: `brand/ai/BRAND.md` (ai tool family; the Overt brand is retired) + `brand/tokens.css` (UI tokens).

## Product in one paragraph
A tool that shows a company **how AI assistants talk about its brand** (prompt-based tracking) and **how AI agents consume its website** (first-party crawler analytics). Loop: **Monitor → Diagnose → Plan → Act → Report**, plus **Crawlers** and **AI Readiness**.

| Module | What it answers |
|---|---|
| Monitor | Where do we appear? Visibility score, share of voice, position, sentiment, per-engine, per-prompt, competitor leaderboard, cited sources |
| Diagnose | Why do competitors win? 5 driver scores (0–100) traced to real answers & sources; "lost prompts" |
| Plan / Act | Prioritized recommendations; one-click agent drafts (llms.txt, comparison page, FAQ, schema, outreach) that a human approves |
| Report | Weekly brief / exec summary, printable, CSV export |
| Crawlers | Which AI agents hit the site, which operator, category (training/search/user-fetch/agent), which pages read/missed, trends, new-agent alerts, event log |
| AI Traffic | Humans arriving from ChatGPT/Perplexity/Gemini/Claude/Copilot (referrals) |
| AI Readiness | Audit of robots.txt AI rules, llms.txt, schema.org, meta, SSR content |

## Stack
- **Runtime**: Node 22.13+ (developed on Node 25), TypeScript run via `tsx` (no build step for server). ESM, imports use explicit `.ts` extensions.
- **Server**: Hono + `@hono/node-server`, port **4400**. DB: built-in **`node:sqlite`** (no native deps) at `server/data/app.db`. Validation: `zod` (v4). HTML parsing: `cheerio`.
- **Web**: Vite + React 19 + TypeScript + Tailwind CSS v4 + React Router + TanStack Query + Recharts + lucide-react. Dev port **5180**, proxies `/api` and `/px.js` to 4400. Prod: server serves `web/dist`.
- **Shared contract**: `shared/types.ts` (import with `import type`). Server imports it as `../../shared/types.ts` (relative, with extension); web uses alias `@shared/types`.
- **Package manager**: npm workspaces (`server`, `web`). Install from repo root: `npm i -w server <pkg>` / `npm i -w web <pkg>`.

## Web routes
`/` landing · `/app` projects · `/app/new` onboarding · `/app/settings` workspace (API keys) · `/app/p/:projectId/{overview,prompts,competitors,sources,responses,diagnose,actions,crawlers,traffic,readiness,reports,integrations,settings}`. Global filters live in URL search params: `?days=30&engine=chatgpt`.

## Engines: live vs simulated
Every feature works end-to-end in **simulated mode** and switches to **live mode** automatically when a key is set (Settings page or env).
- Engines: `chatgpt` (OpenAI, key `OPENAI_API_KEY`), `claude` (Anthropic, `ANTHROPIC_API_KEY`), `gemini` (Google, `GEMINI_API_KEY`), `perplexity` (`PERPLEXITY_API_KEY`), `grok` (xAI, `XAI_API_KEY`), `deepseek` (`DEEPSEEK_API_KEY`).
- Read keys only via `secret(key)` from `server/src/db/index.ts` (DB setting wins over env). The product's own calls read no other ambient env, such as `ANTHROPIC_BASE_URL`.
- Simulated engine = deterministic (seeded by prompt+engine+day) realistic answers that mention the brand/competitors with engine-specific bias and plausible citations, so the demo dashboards look believable: trends, variance between engines, some prompts lost to competitors.
- Every response row stores `mode` ('live'|'simulated'); UI shows a "Simulated" badge.

## Code map
| Path | What lives there |
|---|---|
| `shared/types.ts` | API contract shared by server and web |
| `server/src/index.ts`, `server/src/db/*` | Server entry, middleware, `node:sqlite` schema and helpers |
| `server/src/data/**` | AI agent & referrer catalogs, industry source domains, prompt templates, sentiment lexicon |
| `server/src/engines/**`, `server/src/analysis/**`, `server/src/lib/llm.ts` | Live adapters and the simulator; entity, position, sentiment and citation extraction; LLM helper for suggestions and drafts |
| `server/src/services/{runs,scheduler,seed,projects,monitor}.ts`, `server/src/routes/{settings,projects,runs,monitor}.ts` | Checks, scheduling, demo seed, projects and monitor aggregates |
| `server/src/audit/**`, `server/src/crawlers/**`, `server/src/services/{diagnose,recommendations,drafts,report}.ts`, `server/src/routes/{insights,audit,crawlers,ingest}.ts` | AI-readiness audit, crawler/referral ingestion, diagnosis, recommendations, drafts, reports |
| `brand/**` | ai brand guide and logos (`brand/ai/`), UI tokens, copy deck; retired Overt brand in `brand/retired/` |
| `web/src/content/**` | Typed UI copy (`copy.ts`) |
| `web/src/components/art/**`, `web/public/**` | Logo, favicon, OG image, theme-aware SVG illustrations |
| `web/**` | The React app |

## Module interfaces
- `server/src/lib/llm.ts` → `hasLlm()`, `llmComplete({system,prompt,json,maxTokens,engine}) → Promise<LlmResult|null>` (null ⇒ caller falls back to templates).
- `server/src/services/scheduler.ts` → `startScheduler()`.
- `server/src/crawlers/seed.ts` → `seedCrawlerData(projectId, opts?: { days?: number; siteDomain?: string })` — called by the demo seed.
- `server/src/data/ai-agents.ts` → `AI_AGENTS: AiAgent[]`, `matchAgent(userAgent) → AiAgent | null`. `server/src/data/ai-referrers.ts` → `AI_REFERRERS: AiReferrer[]`, `matchReferrer(referrer, url?) → AiReferrer | null`.
- `server/src/data/sources.ts` → `sourceDomainsFor(industry) → { domain, title, weight }[]` (plausible 3rd-party domains cited by AI for an industry: review sites, publications, forums), used by the simulator.
- `server/src/services/projects.ts` → `getProject(id)`, `getProjectBySiteKey(key)`, `listProjects()`, `listCompetitors(projectId)`.
- `server/src/services/monitor.ts` → `getOverview(projectId, {days, engine?, tier?})`, `getPromptStats(...)`, `getSources(...)` — also used by diagnose and the report.
- `server/src/data/prompt-templates.ts` → `promptTemplatesFor({ brand, industry, description?, competitors, market? }) → PromptInput[]` (20–30 realistic buyer prompts with topic/tier/intent), used for heuristic suggestions and the demo seed.
- `server/src/data/sentiment.ts` → `scoreSentiment(text) → number` (−1..1, lexicon-based with negation handling, tuned for product-review language).
- DB helpers: `db, all, get, run, insert, tx, id, nowIso, dayOf, daysAgo, parseJson, getSetting, setSetting, secret` from `server/src/db/index.ts`.

## API (all under `/api`, JSON; types in `shared/types.ts`)
Common aggregate query params: `days` (default 30), `engine` (optional EngineId), `tier` (optional).

**Monitoring**
- `GET /settings` → SettingsView · `PUT /settings` (SettingsUpdate, incl. `cost`: monthly budget, scheduled mode, same-day reuse) → SettingsView · `GET /engines` → EngineInfo[]
- `GET /usage?days=30` → UsageView (estimated live spend, savings, by engine / project / day)
- `GET /projects` → Project[] · `POST /projects` (ProjectInput) → Project · `GET|PUT|DELETE /projects/:id`
- `POST /projects/suggest` ({name, domain, description?}) → ProjectSuggestion
- `GET|POST /projects/:id/competitors` · `PUT|DELETE /competitors/:cid`
- `GET /projects/:id/prompts` → Prompt[] · `POST /projects/:id/prompts` (PromptInput | PromptInput[]) → Prompt[] · `PUT|DELETE /prompts/:pid`
- `POST /projects/:id/runs` ({engines?, promptIds?, mode?: 'realtime'|'batch', force?: boolean}) → Run (async; poll). `mode: 'batch'` submits provider batch APIs (~50% cheaper, results within hours); `force` skips same-day reuse · `GET /projects/:id/runs` → Run[] · `GET /runs/:rid` → Run
- `GET /projects/:id/overview` → Overview · `GET /projects/:id/prompt-stats` → PromptStat[] · `GET /projects/:id/sources` → SourcesView
- `GET /projects/:id/responses?promptId&engine&runId&limit&offset&mentioned=0|1` → Paged<AiResponse> · `GET /responses/:rid` → AiResponse
- `POST /demo/seed` → Project (creates a demo project with ~30 days history, competitors, ~24 prompts, and calls seedCrawlerData)

**Insights, crawlers and reports**
- `GET /projects/:id/diagnose` → Diagnosis
- `GET /projects/:id/recommendations` → Recommendation[] · `PUT /projects/:id/recommendations/:key` ({status}) → Recommendation
- `GET /projects/:id/drafts` → Draft[] · `POST /projects/:id/drafts` (DraftRequest) → Draft · `PUT|DELETE /drafts/:did`
- `POST /projects/:id/audit` ({url?}) → AuditResult · `GET /projects/:id/audits/latest` → AuditResult | null · `GET /projects/:id/audits` → AuditResult[]
- `GET /projects/:id/crawlers/overview` → CrawlerOverview · `GET /projects/:id/crawlers/events?limit&offset&agent&category&operator` → Paged<BotEvent>
- `GET /projects/:id/referrals/overview` → ReferralOverview
- `POST /projects/:id/logs` (text/plain body or {log}) → { parsed, botEvents, referralEvents, skipped }
- `GET /projects/:id/integration` → IntegrationInfo · `POST /projects/:id/integration/token` (rotate the ingest token) · `GET /agents` → AiAgent[] (catalog)
- `GET /projects/:id/report?days=7` → Report · `GET /projects/:id/export/:kind.csv` (kind = responses|mentions|citations|bot_events|prompts)
- Public (no workspace auth, open CORS): `POST /api/ingest/:siteKey` (IngestEvent | IngestEvent[], `Authorization: Bearer <ingest token>`) → {accepted, bots, referrals} · `POST /api/ingest/:siteKey/logs` (same token) · `GET /px.js` (referral tracking script) · `POST /api/collect/:siteKey` (beacon from px.js, referral visits only)

## Cost controls (live engines)
- Every live answer stores tokens, cached tokens, search calls and an estimated USD cost (`server/src/engines/pricing.ts`, list prices with an as-of date). Simulated answers (and the demo project, always) cost nothing.
- A monthly budget (`cost.monthlyBudgetUsd`) is enforced before every live call and batch submission.
- Scheduled checks default to provider batch APIs where they support web search; answers already collected today are reused unless `force`.
- When developing, start the server with blank `*_API_KEY` env vars to force simulation, so tests never spend money.

## Metric definitions
- **Visibility** (entity) = responses mentioning entity ÷ responses (in filter). **Visibility score** = brand visibility × 100.
- **Share of voice** = entity mention rows ÷ all tracked-entity mention rows.
- **Position** = 1-based order of first appearance among tracked entities in a response; avg over responses where mentioned.
- **Sentiment** −1..1 per mention; KPI maps to 0..100 via `(s+1)*50`.
- **Delta** = value(current period) − value(previous equal-length period); null when previous has no data.
- Trends are daily; days with no data → `null` (charts show gaps), never fabricated.

## Quality bar
- `npm run typecheck` passes (server: `cd server && npx tsc --noEmit`).
- No unhandled promise rejections; external fetches have timeouts (8–20s) and never crash the server.
- Endpoints validate input with zod and return `{error}` with 400 on bad input.
- Keep code readable: small modules, named exports, short doc comments on non-obvious logic. No dead code or TODO stubs.
