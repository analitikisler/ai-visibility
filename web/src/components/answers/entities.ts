// Tracked entities (brand + competitors) as the answer viewer highlights them. Mirrors the
// server's matcher (server/src/analysis/entities.ts): name + aliases + domain, case-insensitive,
// word-boundary aware, longest term first.
import { useMemo } from 'react';
import type { Project } from '@shared/types';
import { useProjectContext } from '@/components/layout/ProjectContext';
import { BRAND_COLOR, OTHER_COLOR } from '@/lib/colors';

export interface AnswerEntity {
  /** 'brand' or the competitor id. */
  key: string;
  name: string;
  isBrand: boolean;
  /** Series color (competitor underline). */
  color: string;
  terms: string[];
}

export interface EntityMatcher {
  re: RegExp;
  byTerm: Map<string, AnswerEntity>;
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const clean = (terms: (string | undefined)[]) => [...new Set(terms.map((t) => (t ?? '').trim()).filter((t) => t.length >= 2))];

export function projectEntities(project: Pick<Project, 'name' | 'aliases' | 'domain' | 'competitors'>, colors: Record<string, string>): AnswerEntity[] {
  return [
    { key: 'brand', name: project.name, isBrand: true, color: BRAND_COLOR, terms: clean([project.name, ...project.aliases, project.domain]) },
    ...project.competitors.map((c) => ({
      key: c.id,
      name: c.name,
      isBrand: false,
      color: colors[c.id] ?? OTHER_COLOR,
      terms: clean([c.name, ...c.aliases, c.domain]),
    })),
  ];
}

/** Entities of the current project (empty outside project routes). */
export function useAnswerEntities(): AnswerEntity[] {
  const ctx = useProjectContext();
  const project = ctx?.project;
  const colors = ctx?.colors;
  return useMemo(() => (project && colors ? projectEntities(project, colors) : []), [project, colors]);
}

/** One alternation regex for every term; the brand wins when a term is shared. */
export function buildMatcher(entities: AnswerEntity[]): EntityMatcher | null {
  const byTerm = new Map<string, AnswerEntity>();
  for (const e of [...entities].sort((a, b) => Number(b.isBrand) - Number(a.isBrand))) {
    for (const t of e.terms) if (!byTerm.has(t.toLowerCase())) byTerm.set(t.toLowerCase(), e);
  }
  if (byTerm.size === 0) return null;
  const alt = [...byTerm.keys()].sort((a, b) => b.length - a.length).map(escapeRegex).join('|');
  return { re: new RegExp(`(?<![\\p{L}\\p{N}_])(?:${alt})(?![\\p{L}\\p{N}_])`, 'giu'), byTerm };
}
