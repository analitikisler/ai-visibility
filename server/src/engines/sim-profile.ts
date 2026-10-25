// Simulator "world model": how strongly each tracked entity is associated with a project's buyer prompts per engine.
// Seeded from project/entity names so every project gets a stable, distinct landscape; the demo project uses DEMO.
import type { EngineId, Project, Prompt } from '../../../shared/types.ts';
import { DEMO } from './demo-scenario.ts';
import { Rng, unit } from './prng.ts';

export interface SimEntity {
  key: string;
  name: string;
  domain: string;
  isBrand: boolean;
}

type SimPrompt = Pick<Prompt, 'text' | 'tier' | 'intent'>;

const DAY_MS = 86_400_000;

/** 0 → 1 linear ramp over the project's first eight weeks; drives the brand's slow improvement. */
function ramp(project: Project, day: string): number {
  const days = Math.max(0, (Date.parse(day) - Date.parse(project.createdAt.slice(0, 10))) / DAY_MS);
  return Math.min(1, days / 56);
}

function demoEntity(project: Project, e: SimEntity) {
  if (!project.isDemo) return null;
  if (e.isBrand) return DEMO.brand;
  return DEMO.competitors.find((c) => c.name.toLowerCase() === e.name.toLowerCase()) ?? null;
}

const seedOf = (project: Project, e: SimEntity) => `${project.domain}|${e.name.toLowerCase()}`;

/** Base probability (≈0..1) that an engine names the entity in a typical recommendation answer on `day`. */
export function strength(project: Project, e: SimEntity, engine: EngineId, day: string): number {
  const t = ramp(project, day);
  const demo = demoEntity(project, e);
  if (demo) {
    const values = Object.values(demo.strength);
    const fallback = (values.reduce((a, b) => a + b, 0) / values.length) * 0.9;
    return (demo.strength[engine] ?? fallback) + demo.drift * t;
  }
  const seed = seedOf(project, e);
  const perEngine = 0.65 + 0.7 * unit(`${seed}|${engine}`);
  if (e.isBrand) return (0.28 + 0.24 * unit(seed)) * perEngine + 0.16 * t;
  return (0.22 + 0.46 * unit(seed)) * perEngine;
}

/** Review tone −1..1 the engine tends to use for the entity (brand warms up over time). */
export function tone(project: Project, e: SimEntity, engine: EngineId, day: string): number {
  const seed = seedOf(project, e);
  const engineTilt = (unit(`${seed}|${engine}|tone`) - 0.5) * 0.3;
  const demo = demoEntity(project, e);
  const base = demo ? demo.tone : e.isBrand ? 0.2 : unit(`${seed}|tone`) * 0.8 - 0.25;
  return base + engineTilt + (e.isBrand ? 0.2 * ramp(project, day) : 0);
}

/** Demo must-win discovery prompts (about two in three) that the brand consistently loses to the rival. */
export function isLostPrompt(prompt: SimPrompt): boolean {
  return prompt.tier === 'must_win' && prompt.intent === 'discovery' && unit(`lost|${prompt.text}`) < 0.65;
}

/** Prompt-specific pull (−0.2..0.2) so some prompts consistently favor some entities. */
export function affinity(project: Project, e: SimEntity, prompt: SimPrompt): number {
  let a = (unit(`${prompt.text}|${e.name.toLowerCase()}`) - 0.5) * 0.4;
  if (project.isDemo && isLostPrompt(prompt)) {
    if (e.isBrand) a -= 0.55;
    else if (e.name === DEMO.rival) a += 0.35;
  }
  return a;
}

/** Day-level shared noise so daily trend lines wiggle together across prompts. */
export function dailyNoise(e: SimEntity, engine: EngineId, day: string): number {
  return (unit(`${day}|${engine}|${e.name.toLowerCase()}`) - 0.5) * 0.14;
}

/**
 * Source footprint: citation-domain multipliers applied when the entity is recommended, so each entity co-occurs with
 * its own set of sources (the demo uses DEMO's footprints; other projects get three seeded preferred domains).
 */
export function sourceFootprint(project: Project, e: SimEntity, pool: { domain: string; weight: number }[]): Map<string, number> {
  const demo = demoEntity(project, e);
  if (demo) return new Map(Object.entries(demo.sources));
  const rng = new Rng(`footprint|${seedOf(project, e)}`);
  return new Map(rng.sample(pool, 3, (d) => d.weight).map((d) => [d.domain, rng.range(2.5, 4)]));
}

/** Chance a recommended competitor's own site is cited (Perplexity links vendor pages most). */
export function siteCitationRate(project: Project, e: SimEntity, engine: EngineId): number {
  const demo = demoEntity(project, e);
  const fallback = engine === 'perplexity' ? 0.22 : 0.12;
  return demo && 'siteRate' in demo && demo.siteRate !== undefined ? demo.siteRate : fallback;
}
