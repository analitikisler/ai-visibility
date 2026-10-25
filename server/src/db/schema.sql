-- ai visibility — SQLite schema (node:sqlite).
-- Conventions: ids are TEXT (nanoid-like), timestamps are ISO-8601 TEXT (UTC),
-- `day` columns are 'YYYY-MM-DD' for fast daily aggregation. JSON columns end in _json.

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,              -- brand name, e.g. "Acme"
  domain        TEXT NOT NULL,              -- "acme.com" (no scheme)
  aliases_json  TEXT NOT NULL DEFAULT '[]', -- ["Acme Inc", "acme.io"]
  description   TEXT NOT NULL DEFAULT '',
  industry      TEXT NOT NULL DEFAULT '',
  market        TEXT NOT NULL DEFAULT 'US', -- country code
  language      TEXT NOT NULL DEFAULT 'en',
  engines_json  TEXT NOT NULL DEFAULT '["chatgpt","claude","gemini","perplexity"]',
  schedule      TEXT NOT NULL DEFAULT 'daily', -- 'manual' | 'daily' | 'weekly'
  site_key      TEXT NOT NULL UNIQUE,        -- public key for crawler/referral ingestion
  is_demo       INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS competitors (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  domain       TEXT NOT NULL DEFAULT '',
  aliases_json TEXT NOT NULL DEFAULT '[]',
  color        TEXT NOT NULL DEFAULT '',     -- optional chart color override
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_competitors_project ON competitors(project_id);

CREATE TABLE IF NOT EXISTS prompts (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  text        TEXT NOT NULL,
  topic       TEXT NOT NULL DEFAULT '',      -- free-form grouping, e.g. "Pricing", "Alternatives"
  tier        TEXT NOT NULL DEFAULT 'core',  -- 'must_win' | 'core' | 'foundational'
  intent      TEXT NOT NULL DEFAULT 'discovery', -- 'discovery' | 'comparison' | 'alternatives' | 'how_to' | 'branded'
  active      INTEGER NOT NULL DEFAULT 1,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_prompts_project ON prompts(project_id);

CREATE TABLE IF NOT EXISTS runs (
  id            TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  trigger       TEXT NOT NULL DEFAULT 'manual', -- 'manual' | 'scheduled' | 'seed'
  status        TEXT NOT NULL DEFAULT 'queued', -- 'queued' | 'running' | 'completed' | 'failed'
  engines_json  TEXT NOT NULL DEFAULT '[]',
  total_jobs    INTEGER NOT NULL DEFAULT 0,
  done_jobs     INTEGER NOT NULL DEFAULT 0,
  failed_jobs   INTEGER NOT NULL DEFAULT 0,
  error         TEXT,
  day           TEXT NOT NULL,
  started_at    TEXT NOT NULL,
  finished_at   TEXT
);
CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_id, started_at);

-- One row per (run, prompt, engine): the raw AI answer.
CREATE TABLE IF NOT EXISTS responses (
  id           TEXT PRIMARY KEY,
  run_id       TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  prompt_id    TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
  engine       TEXT NOT NULL,          -- EngineId
  model        TEXT NOT NULL DEFAULT '',
  mode         TEXT NOT NULL DEFAULT 'simulated', -- 'live' | 'simulated'
  text         TEXT NOT NULL DEFAULT '',
  brand_mentioned INTEGER NOT NULL DEFAULT 0,  -- denormalized: did the project brand appear?
  brand_position  INTEGER,                     -- 1-based rank among tracked entities, NULL if absent
  brand_sentiment REAL,                        -- -1..1, NULL if absent
  latency_ms   INTEGER,
  error        TEXT,
  day          TEXT NOT NULL,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_responses_project_day ON responses(project_id, day);
CREATE INDEX IF NOT EXISTS idx_responses_prompt ON responses(prompt_id, created_at);

-- Every tracked entity (brand or competitor) found in a response.
CREATE TABLE IF NOT EXISTS mentions (
  id            TEXT PRIMARY KEY,
  response_id   TEXT NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  prompt_id     TEXT NOT NULL,
  engine        TEXT NOT NULL,
  entity_type   TEXT NOT NULL,         -- 'brand' | 'competitor'
  competitor_id TEXT,                  -- NULL when entity_type = 'brand'
  entity_name   TEXT NOT NULL,
  position      INTEGER NOT NULL,      -- 1-based order of first appearance among tracked entities
  count         INTEGER NOT NULL DEFAULT 1,
  sentiment     REAL NOT NULL DEFAULT 0,         -- -1..1
  sentiment_label TEXT NOT NULL DEFAULT 'neutral', -- 'positive' | 'neutral' | 'negative'
  context       TEXT NOT NULL DEFAULT '',        -- sentence snippet around first mention
  day           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_mentions_project_day ON mentions(project_id, day);
CREATE INDEX IF NOT EXISTS idx_mentions_response ON mentions(response_id);

-- Sources cited / linked in a response.
CREATE TABLE IF NOT EXISTS citations (
  id            TEXT PRIMARY KEY,
  response_id   TEXT NOT NULL REFERENCES responses(id) ON DELETE CASCADE,
  project_id    TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  prompt_id     TEXT NOT NULL,
  engine        TEXT NOT NULL,
  url           TEXT NOT NULL,
  domain        TEXT NOT NULL,         -- normalized, no "www."
  title         TEXT NOT NULL DEFAULT '',
  position      INTEGER NOT NULL DEFAULT 1,
  source_type   TEXT NOT NULL DEFAULT 'third_party', -- 'own' | 'competitor' | 'third_party'
  competitor_id TEXT,
  day           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_citations_project_day ON citations(project_id, day);
CREATE INDEX IF NOT EXISTS idx_citations_response ON citations(response_id);

-- AI-readiness site audits.
CREATE TABLE IF NOT EXISTS audits (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  url          TEXT NOT NULL,
  score        INTEGER NOT NULL,
  result_json  TEXT NOT NULL,          -- AuditResult
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_audits_project ON audits(project_id, created_at);

-- AI crawler / agent hits on the customer's site (Hardal-style, first-party).
CREATE TABLE IF NOT EXISTS bot_events (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ts           TEXT NOT NULL,
  day          TEXT NOT NULL,
  agent_id     TEXT NOT NULL,          -- AiAgent.id from catalog, e.g. 'gptbot'
  agent_name   TEXT NOT NULL,
  operator     TEXT NOT NULL,          -- 'OpenAI', 'Anthropic', ...
  category     TEXT NOT NULL,          -- AgentCategory
  path         TEXT NOT NULL,
  status       INTEGER,
  user_agent   TEXT NOT NULL DEFAULT '',
  ip           TEXT NOT NULL DEFAULT '',
  verified     INTEGER NOT NULL DEFAULT 0, -- IP check (crawlers/verify.ts): 1 verified, 0 unverified, -1 spoofed (IP outside the agent's published ranges)
  source       TEXT NOT NULL DEFAULT 'ingest' -- 'ingest' | 'log_upload' | 'pixel' | 'demo'
);
CREATE INDEX IF NOT EXISTS idx_bot_events_project_day ON bot_events(project_id, day);
CREATE INDEX IF NOT EXISTS idx_bot_events_project_ts ON bot_events(project_id, ts);

-- Human visits referred by AI assistants (chatgpt.com, perplexity.ai, ...).
CREATE TABLE IF NOT EXISTS referral_events (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  ts           TEXT NOT NULL,
  day          TEXT NOT NULL,
  source_id    TEXT NOT NULL,          -- AiReferrer.id, e.g. 'chatgpt'
  source_name  TEXT NOT NULL,
  landing_path TEXT NOT NULL,
  referrer     TEXT NOT NULL DEFAULT '',
  session_id   TEXT NOT NULL DEFAULT '',
  source       TEXT NOT NULL DEFAULT 'pixel' -- 'pixel' | 'ingest' | 'log_upload' | 'demo'
);
CREATE INDEX IF NOT EXISTS idx_referral_events_project_day ON referral_events(project_id, day);

-- Generated content drafts ("Act").
CREATE TABLE IF NOT EXISTS drafts (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL,          -- DraftKind
  title        TEXT NOT NULL,
  body         TEXT NOT NULL,          -- markdown / plain text
  status       TEXT NOT NULL DEFAULT 'draft', -- 'draft' | 'approved' | 'published' | 'dismissed'
  meta_json    TEXT NOT NULL DEFAULT '{}',
  mode         TEXT NOT NULL DEFAULT 'template', -- 'llm' | 'template'
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_drafts_project ON drafts(project_id, created_at);

-- Recommendation lifecycle (recommendations are computed; this stores user state per rec key).
CREATE TABLE IF NOT EXISTS recommendation_state (
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  rec_key      TEXT NOT NULL,
  status       TEXT NOT NULL,          -- 'open' | 'in_progress' | 'done' | 'dismissed'
  updated_at   TEXT NOT NULL,
  PRIMARY KEY (project_id, rec_key)
);

-- Provider batch submissions for 'batch' runs (Anthropic / OpenAI / Gemini batch APIs). One row per (run, engine).
-- items_json maps custom_id -> prompt_id so results (which arrive in any order) can be matched back.
CREATE TABLE IF NOT EXISTS batch_jobs (
  id                TEXT PRIMARY KEY,
  run_id            TEXT NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  project_id        TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  engine            TEXT NOT NULL,
  model             TEXT NOT NULL,
  provider_batch_id TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'submitted', -- 'submitted' | 'ended' | 'failed'
  items_json        TEXT NOT NULL,
  error             TEXT,
  submitted_at      TEXT NOT NULL,
  checked_at        TEXT,
  ended_at          TEXT
);
CREATE INDEX IF NOT EXISTS idx_batch_jobs_status ON batch_jobs(status);


-- Live spend outside answers (drafts, onboarding suggestions): plain completions on a live engine.
CREATE TABLE IF NOT EXISTS llm_usage (
  id            TEXT PRIMARY KEY,
  project_id    TEXT,
  engine        TEXT NOT NULL,
  model         TEXT NOT NULL,
  purpose       TEXT NOT NULL DEFAULT 'completion',
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  cached_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd      REAL NOT NULL DEFAULT 0,
  day           TEXT NOT NULL,
  created_at    TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_llm_usage_day ON llm_usage(day);
