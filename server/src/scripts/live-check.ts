// Live engine smoke test: one real prompt per engine that has an API key (from .env or Workspace settings).
// Usage (from repo root):  npm run check:live [-- --engine claude] [-- --prompt "..."] [-- --project <id>] [-- --completion]
// Prints status, model, latency, answer preview, citations and detected mentions. Keys are never printed.
// Exits 1 when any live engine fails, so it can gate a deploy.
import '../env.ts';
import { parseArgs } from 'node:util';
import { dayOf, id, insert, nowIso } from '../db/index.ts';
import { analyzeAnswer } from '../analysis/analyze.ts';
import { ask, complete } from '../engines/index.ts';
import { ENGINES, engineKey, engineModel } from '../engines/catalog.ts';
import { getProject, listProjects } from '../services/projects.ts';
import type { EngineId, Project } from '../../../shared/types.ts';

const { values } = parseArgs({
  options: {
    engine: { type: 'string' },
    prompt: { type: 'string', default: 'What are the best help desk tools for a small B2B SaaS support team? Answer briefly and cite sources.' },
    project: { type: 'string' },
    /** Also test a plain completion (drafts, suggestions) per engine. */
    completion: { type: 'boolean', default: false },
  },
});

/** Project whose brand/competitors we look for in the answers: --project, else your first real project. Never the demo (always simulated). */
function pickProject(): Project | null {
  const p = values.project ? getProject(values.project) : listProjects().find((x) => !x.isDemo) ?? null;
  return p && !p.isDemo ? p : null;
}

const oneLine = (s: string, n: number) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

async function checkEngine(engine: EngineId, project: Project | null): Promise<boolean> {
  const name = ENGINES.find((e) => e.id === engine)!.name;
  if (!engineKey(engine)) {
    console.log(`○ ${name.padEnd(11)} simulated (no key)`);
    return true;
  }
  const answer = await ask(engine, values.prompt!, {
    project: project ?? ({ market: 'US', isDemo: false } as Project),
    prompt: { id: 'live-check', text: values.prompt!, topic: 'Live check', tier: 'core', intent: 'discovery' },
    day: dayOf(),
  });
  const u = answer.usage;
  // The check's spend counts toward the monthly budget like any other live call.
  insert('llm_usage', {
    id: id('use'), project_id: null, engine, model: answer.model, purpose: 'live-check', input_tokens: u?.inputTokens ?? 0,
    output_tokens: u?.outputTokens ?? 0, cached_tokens: u?.cachedTokens ?? 0, cost_usd: answer.costUsd ?? 0, day: dayOf(), created_at: nowIso(),
  });
  if (answer.error) {
    console.log(`✗ ${name.padEnd(11)} ${answer.model} · ${answer.latencyMs ?? '–'} ms\n    ${oneLine(answer.error, 300)}`);
    return false;
  }
  console.log(`✓ ${name.padEnd(11)} ${answer.model} · ${answer.latencyMs} ms · ${answer.text.length} chars · ${answer.citations.length} citations · $${(answer.costUsd ?? 0).toFixed(4)}`);
  if (u) console.log(`    usage: ${u.inputTokens} in (${u.cachedTokens} cached) · ${u.outputTokens} out · ${u.searchCalls} searches`);
  console.log(`    “${oneLine(answer.text, 160)}”`);
  if (project) {
    const a = analyzeAnswer(answer.text, answer.citations, project);
    const named = a.mentions.map((m) => `#${m.position} ${m.entity.name}`).join(', ') || 'none';
    const domains = [...new Set(a.citations.map((c) => c.domain))].slice(0, 6).join(', ') || 'none';
    console.log(`    ${project.name} project · named: ${named} · sources: ${domains}`);
  }
  if (values.completion) {
    const plain = await complete(engine, { prompt: 'Reply with exactly this JSON and nothing else: {"ok":true}', json: true, maxTokens: 50, purpose: 'live-check' });
    console.log(`    plain completion (drafts, suggestions): ${plain ? 'ok' : 'failed — see warning above'}`);
  }
  return true;
}

const project = pickProject();
const ids = (values.engine ? [values.engine] : ENGINES.map((e) => e.id)) as EngineId[];
const unknown = ids.filter((e) => !ENGINES.some((x) => x.id === e));
if (unknown.length) {
  console.error(`Unknown engine: ${unknown.join(', ')}. Use one of: ${ENGINES.map((e) => e.id).join(', ')}`);
  process.exit(2);
}

console.log(`Live check · prompt: “${oneLine(values.prompt!, 90)}”${project ? ` · matching against ${project.name}` : ''}\n`);
let ok = true;
for (const id of ids) ok = (await checkEngine(id, project)) && ok;
const live = ids.filter((e) => engineKey(e));
console.log(`\n${live.length} live engine${live.length === 1 ? '' : 's'} checked${live.length ? ` (${live.map(engineModel).join(', ')})` : ' — add keys to .env or Workspace settings'}.`);
process.exit(ok ? 0 : 1);
