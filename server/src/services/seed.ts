// Demo seeding: a fictional B2B SaaS brand with 5 competitors, ~24 prompts and 60 days of simulated history
// (one completed run per day, back-dated), plus crawler/referral demo data (crawlers/seed.ts).
import { daysAgo, id, insert, run, tx } from '../db/index.ts';
import type { EngineId, Project } from '../../../shared/types.ts';
import { trackedEntities } from '../analysis/entities.ts';
import { persistResponse } from '../analysis/persist.ts';
import { seedCrawlerData } from '../crawlers/seed.ts';
import { DEMO } from '../engines/demo-scenario.ts';
import { simulateAnswer } from '../engines/simulated.ts';
import { promptTemplatesFor } from '../data/prompt-templates.ts';
import { createProject, getProject, listPrompts } from './projects.ts';

const DAYS = 60;
const ENGINES: EngineId[] = ['chatgpt', 'claude', 'gemini', 'perplexity'];
const MAX_PROMPTS = 24;

/** Replaces any existing demo project with a freshly seeded one. Deterministic per calendar day. */
export function seedDemo(): Project {
  run('DELETE FROM projects WHERE is_demo = 1');
  const { brand } = DEMO;
  const prompts = promptTemplatesFor({
    brand: brand.name, industry: brand.industry, description: brand.description,
    competitors: DEMO.competitors.map((c) => c.name), market: 'US',
  }).slice(0, MAX_PROMPTS);
  const created = createProject({
    name: brand.name, domain: brand.domain, aliases: [...brand.aliases], description: brand.description, industry: brand.industry,
    market: 'US', language: 'en', engines: ENGINES, schedule: 'daily',
    competitors: DEMO.competitors.map((c) => ({ name: c.name, domain: c.domain, aliases: c.aliases })),
    prompts,
  }, { isDemo: true, createdAt: new Date(Date.parse(`${daysAgo(DAYS)}T09:00:00Z`)).toISOString() });

  const project = getProject(created.id)!;
  const entities = trackedEntities(project);
  const active = listPrompts(project.id).filter((p) => p.active);
  const latest = Date.now() - 10 * 60_000;

  tx(() => {
    for (let d = DAYS - 1; d >= 0; d--) {
      const day = daysAgo(d);
      // Daily runs start around 06:00 UTC; today's run is clamped so nothing lands in the future.
      const start = Math.min(Date.parse(`${day}T06:00:00Z`) + ((d * 7919) % 90) * 60_000, latest - active.length * ENGINES.length * 1500);
      const runId = id('run');
      const jobs = active.length * ENGINES.length;
      insert('runs', {
        id: runId, project_id: project.id, trigger: 'seed', status: 'completed', engines_json: JSON.stringify(ENGINES),
        total_jobs: jobs, done_jobs: jobs, failed_jobs: 0, error: null, day, started_at: new Date(start).toISOString(), finished_at: null,
      });
      let t = start;
      for (const prompt of active) {
        for (const engine of ENGINES) {
          const answer = simulateAnswer(engine, prompt.text, { project, prompt, day });
          t += 400 + ((answer.latencyMs ?? 0) % 1100);
          persistResponse({ runId, project, promptId: prompt.id, engine, answer, day, createdAt: new Date(t).toISOString() }, entities);
        }
      }
      run('UPDATE runs SET finished_at = ? WHERE id = ?', [new Date(t).toISOString(), runId]);
    }
  });

  try {
    seedCrawlerData(project.id, { days: DAYS, siteDomain: project.domain });
  } catch (err) {
    console.warn('[seed] crawler demo data skipped:', err instanceof Error ? err.message : err);
  }
  return getProject(project.id)!;
}
