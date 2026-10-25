// Persists an analyzed answer (response + mentions + citations) and re-analyzes stored answers when tracked entities change.
import type { StatementSync } from 'node:sqlite';
import { all, db, id, tx } from '../db/index.ts';
import type { EngineId, Project } from '../../../shared/types.ts';
import type { EngineAnswer } from '../engines/types.ts';
import { analyzeAnswer, type Analysis } from './analyze.ts';
import { classifySource } from './citations.ts';
import { trackedEntities, type TrackedEntity } from './entities.ts';

const cache = new Map<string, StatementSync>();
/** Prepared-statement cache: seeding inserts tens of thousands of rows. */
function stmt(sql: string): StatementSync {
  let s = cache.get(sql);
  if (!s) cache.set(sql, (s = db.prepare(sql)));
  return s;
}

const INSERT_RESPONSE = `INSERT INTO responses (id, run_id, project_id, prompt_id, engine, model, mode, text, brand_mentioned, brand_position,
  brand_sentiment, latency_ms, error, day, created_at, input_tokens, output_tokens, cached_tokens, search_calls, cost_usd, batch)
  VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
const INSERT_MENTION = `INSERT INTO mentions (id, response_id, project_id, prompt_id, engine, entity_type, competitor_id, entity_name, position,
  count, sentiment, sentiment_label, context, day) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`;
const INSERT_CITATION = `INSERT INTO citations (id, response_id, project_id, prompt_id, engine, url, domain, title, position, source_type,
  competitor_id, day) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`;

export interface ResponseInput {
  runId: string;
  project: Project;
  promptId: string;
  engine: EngineId;
  answer: EngineAnswer;
  day: string;
  createdAt: string;
}

function insertMentions(responseId: string, r: { projectId: string; promptId: string; engine: string; day: string }, a: Analysis): void {
  for (const m of a.mentions) {
    stmt(INSERT_MENTION).run(id('men'), responseId, r.projectId, r.promptId, r.engine, m.entity.type, m.entity.competitorId,
      m.entity.name, m.position, m.count, m.sentiment, m.sentimentLabel, m.context, r.day);
  }
}

/** Inserts one response with its mentions and citations. Caller owns the transaction (see saveResponse). */
export function persistResponse(input: ResponseInput, entities: TrackedEntity[] = trackedEntities(input.project)): string {
  const { answer, project } = input;
  const a: Analysis = answer.error && !answer.text
    ? { mentions: [], citations: [], brand: { mentioned: false, position: null, sentiment: null } }
    : analyzeAnswer(answer.text, answer.citations, project, entities);
  const rid = id('rsp');
  stmt(INSERT_RESPONSE).run(rid, input.runId, project.id, input.promptId, input.engine, answer.model, answer.mode, answer.text,
    a.brand.mentioned ? 1 : 0, a.brand.position, a.brand.sentiment, answer.latencyMs, answer.error, input.day, input.createdAt,
    answer.usage?.inputTokens ?? null, answer.usage?.outputTokens ?? null, answer.usage?.cachedTokens ?? null,
    answer.usage?.searchCalls ?? null, answer.costUsd ?? null, answer.batch ? 1 : 0);
  const ctx = { projectId: project.id, promptId: input.promptId, engine: input.engine, day: input.day };
  insertMentions(rid, ctx, a);
  for (const c of a.citations) {
    stmt(INSERT_CITATION).run(id('cit'), rid, project.id, input.promptId, input.engine, c.url, c.domain, c.title, c.position,
      c.sourceType, c.competitorId, input.day);
  }
  return rid;
}

/** Persist one response atomically. */
export function saveResponse(input: ResponseInput): string {
  return tx(() => persistResponse(input));
}

/**
 * Recomputes mentions and citation classes for every stored answer of a project.
 * Called after the brand or competitor set changes so history reflects the current tracked entities.
 */
export function reanalyzeProject(project: Project): void {
  const entities = trackedEntities(project);
  const rows = all<{ id: string; prompt_id: string; engine: string; text: string; day: string }>(
    'SELECT id, prompt_id, engine, text, day FROM responses WHERE project_id = ? AND error IS NULL', [project.id]);
  const domains = all<{ domain: string }>('SELECT DISTINCT domain FROM citations WHERE project_id = ?', [project.id]);
  tx(() => {
    stmt('DELETE FROM mentions WHERE project_id = ?').run(project.id);
    for (const r of rows) {
      const a = analyzeAnswer(r.text, [], project, entities);
      insertMentions(r.id, { projectId: project.id, promptId: r.prompt_id, engine: r.engine, day: r.day }, a);
      stmt('UPDATE responses SET brand_mentioned = ?, brand_position = ?, brand_sentiment = ? WHERE id = ?')
        .run(a.brand.mentioned ? 1 : 0, a.brand.position, a.brand.sentiment, r.id);
    }
    // Per URL, so URL-prefix aliases (a repo or package page on a shared domain) classify correctly.
    for (const { id: cid, domain, url } of stmt('SELECT id, domain, url FROM citations WHERE project_id = ?').all(project.id) as { id: string; domain: string; url: string }[]) {
      const c = classifySource(domain, project, url);
      stmt('UPDATE citations SET source_type = ?, competitor_id = ? WHERE id = ?').run(c.sourceType, c.competitorId, cid);
    }
  });
}
