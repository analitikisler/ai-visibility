<h1>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="brand/ai/assets/lockups/ai-visibility-dark.svg">
    <img src="brand/ai/assets/lockups/ai-visibility-light.svg" alt="ai visibility" height="48">
  </picture>
</h1>

Be the answer.

Open source · AGPL-3.0 · Alpha

ai visibility shows how AI assistants talk about your brand, why they pick competitors instead, and what to fix — plus which AI crawlers read your site and which visitors arrive from AI.

| Module | Answers |
|---|---|
| **Monitor** | How often ChatGPT, Claude, Gemini, Perplexity, Grok and DeepSeek name you: visibility score, share of voice, position, sentiment, per prompt / engine / competitor, cited sources, every answer |
| **Diagnose** | Why competitors win — five driver scores (content coverage, content quality, source authority, technical readiness, sentiment) with evidence, and the prompts you lose |
| **Act** | Prioritized recommendations; an agent drafts the fix (llms.txt, comparison page, FAQ, JSON-LD, robots.txt, outreach email) and you approve it |
| **Report** | Weekly / monthly brief, printable, CSV exports |
| **AI crawlers** | Which AI agents fetch your pages (61 catalogued: GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot, ChatGPT-User…), operator, category (training / AI search / user fetch / agent), pages read and missed, new agents, event log |
| **AI traffic** | Human visits referred by ChatGPT, Perplexity, Gemini, Copilot, Claude and more |
| **AI readiness** | Audit of robots.txt AI rules, llms.txt, structured data, server-rendered content, meta |

## Quick start

Requires **Node 22.13+** (uses the built-in `node:sqlite`; developed on Node 25).

```bash
npm install
```

```bash
npm run dev
```

Open http://localhost:5180 → **Open demo project**. The demo is a fictional help desk brand (Relaydesk) with 60 days of history, five competitors, crawler and referral traffic. The API runs on :4400.

Production build (one process serves API + app on :4400):

```bash
npm run build && npm start
```

## Live vs simulated engines

Without API keys every engine runs in **simulated** mode: deterministic, realistic answers so the whole product works offline. Add keys in **Workspace settings** (stored in the local database) or in a `.env` file at the repo root (see `.env.example`) and that engine goes **live** — real answers with web search and citations:

| Engine | Key | Default model |
|---|---|---|
| ChatGPT | `OPENAI_API_KEY` | `gpt-5-mini` (Responses API + web search) |
| Claude | `ANTHROPIC_API_KEY` | `claude-sonnet-5-5` (Messages API + web search) |
| Gemini | `GEMINI_API_KEY` | `gemini-2.5-flash` (Google Search grounding) |
| Perplexity | `PERPLEXITY_API_KEY` | `sonar` |
| Grok | `XAI_API_KEY` | `grok-4` |
| DeepSeek | `DEEPSEEK_API_KEY` | `deepseek-chat` |

Models are overridable per engine (`OPENAI_MODEL`, …) in settings or `.env`. After adding keys, run `npm run check:live` — one real prompt per keyed engine, showing model, latency, citations and detected mentions (keys are never printed; exits non-zero if an engine fails). With any live engine, onboarding suggestions and agent drafts also use an LLM; otherwise they use templates.

Live checks are billed to your own provider accounts. Workspace settings track spend per engine against a monthly budget (default $20).

Checks run on each project's schedule (daily / weekly / manual) via an in-process scheduler, or on demand with **Run check**. Scheduled checks only run in production (`npm start`); under `npm run dev` they are off unless `SCHEDULER=on`, so a dev copy with the same keys never pays for them twice.

## Connecting your site (crawlers & AI traffic)

Each project has a public **site key** and a secret **ingest token** (Integrations page, where the token can be rotated):

- **Server-side (recommended)** — AI crawlers don't run JavaScript, so forward bot hits from your server/edge: copy-paste snippets for Express, Next.js middleware, Cloudflare Workers, Vercel Edge. They fire-and-forget to `POST /api/ingest/:siteKey` with `Authorization: Bearer <ingest token>` and never delay your response.
- **Log upload** — Nginx/Apache combined logs or JSON lines, in the app or via cron to `POST /api/ingest/:siteKey/logs` (same token).
- **Referral pixel** — `<script async src="https://<host>/px.js" data-key="<siteKey>"></script>` records visits arriving from AI assistants (no cookies, no visitor IPs stored). The site key in it can only report referral visits.
- **IP verification** — send the client IP with each hit and it is checked against the IP ranges the agent's operator publishes (OpenAI, Anthropic, Google, Perplexity, Bing, Apple, …; fetched daily and cached in the database so restarts work offline): **verified**, **unverified** (no IP or no published list) or **spoofed** (the UA claims a bot its IP doesn't belong to). Spoofed hits stay in the visit log but count in no totals.

## Deploying

Set `APP_USER` and `APP_PASSWORD` to protect the workspace with basic auth (health, ingestion and the pixel stay public). Without them the workspace only answers on loopback host names (localhost, 127.0.0.1) — to expose it on another host name without auth, list it in `ALLOWED_HOSTS=ai-visibility.internal.example.com` (comma-separated). Cross-site write requests are always refused (CSRF), and server-side fetches (audits, sitemap, onboarding suggestions) only reach public addresses. Data lives in `server/data/app.db` (`DATA_DIR` / `DB_PATH` to move it). `PORT` defaults to 4400.

To run it on Cloudflare (Worker + Container, SQLite backed up to R2, Cloudflare Access sign-in), follow [deploy/cloudflare/README.md](deploy/cloudflare/README.md). The `Dockerfile` runs anywhere else that runs containers.

## Project layout

```
shared/types.ts        API contract shared by server and web
server/src/
  engines/             live adapters + deterministic simulator
  analysis/            entity, position, sentiment, citation extraction
  services/            runs, scheduler, monitor aggregates, diagnose, recommendations, drafts, report, seed
  audit/  crawlers/    AI-readiness audit · crawler/referral ingestion, logs, pixel, integration snippets
  data/                AI agent & referrer catalogs, source domains, prompt templates, sentiment lexicon
  routes/  db/         Hono routes · node:sqlite schema + helpers
web/src/               React 19 + Tailwind 4 app (pages, UI kit, charts, copy, art)
brand/                 ai/ (the ai brand guide, board, logos), UI tokens, COPY.md
docs/ARCHITECTURE.md   architecture, code map, API, metric definitions
```

Metric definitions (visibility, share of voice, position, sentiment, deltas) are in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#metric-definitions).

## Hosted version

ai visibility is free and open source. Analitik İşler also runs it as a hosted service for teams that would rather not run it themselves: no engine API keys, server or backups of your own. It is in early access: email hello@analitikisler.com with the subject "ai visibility".

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md), including the contribution terms.

## Security

Please report vulnerabilities privately, not in public issues. See [SECURITY.md](SECURITY.md).

## License

Copyright (c) 2026 Analitik İşler. ai visibility is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0-only). You may use, modify and self-host it. If you run a modified version as a network service, you must offer its source code to the people who use it.

The ai visibility name and logo are trademarks of Analitik İşler and are not covered by the code license. A fork you distribute or host for others needs its own name and logo.

Built by [Analitik İşler](https://analitikisler.com).
