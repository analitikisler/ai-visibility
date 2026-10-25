// Current project, resolved from the `:projectId` route param by AppLayout and shared with the shell
// (sidebar, top bar, banner) and every project page.
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { EngineId, EngineInfo, Project } from '@shared/types';
import { isNotFound, useEngines, useProjectQuery } from '@/lib/api';
import { entityColorMap } from '@/lib/colors';

export interface ProjectContextValue {
  projectId: string;
  /** Undefined while loading (only possible outside `<ProjectGate>`). */
  project: Project | undefined;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
  /** `entityKey → color` ('brand' + competitor ids). Use for every chart/table. */
  colors: Record<string, string>;
  /** Engine catalog entries for this project's engines (with live/simulated mode). */
  engines: EngineInfo[];
  /** Engine id → info (all engines, for answers from engines no longer selected). */
  engineInfo: Partial<Record<EngineId, EngineInfo>>;
}

const Ctx = createContext<ProjectContextValue | null>(null);

export function ProjectProvider({ projectId, children }: { projectId: string; children: ReactNode }) {
  const query = useProjectQuery(projectId, { retry: (n, e) => !isNotFound(e) && n < 2 });
  const enginesQ = useEngines();
  const project = query.data;
  const { isLoading, error, refetch } = query;
  const value = useMemo<ProjectContextValue>(() => {
    const all = enginesQ.data ?? [];
    const engineInfo: Partial<Record<EngineId, EngineInfo>> = {};
    for (const e of all) engineInfo[e.id] = e;
    // Demo projects always run the simulator (server-side), whatever keys are configured.
    const forProject = (e: EngineInfo): EngineInfo => (project?.isDemo ? { ...e, mode: 'simulated', model: 'simulated' } : e);
    const engines = project ? project.engines.map((id) => engineInfo[id]).filter((e): e is EngineInfo => !!e).map(forProject) : [];
    return { projectId, project, isLoading, error, refetch: () => void refetch(), colors: entityColorMap(project), engines, engineInfo };
  }, [projectId, project, isLoading, error, refetch, enginesQ.data]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** Project context or null when not on a project route (shell components). */
export function useProjectContext(): ProjectContextValue | null {
  return useContext(Ctx);
}

/**
 * The loaded project. Only call inside project pages (rendered by `<ProjectGate>`, which waits
 * for the project before rendering its children).
 */
export function useProject(): ProjectContextValue & { project: Project } {
  const ctx = useContext(Ctx);
  if (!ctx || !ctx.project) throw new Error('useProject() must be used inside a project route');
  return ctx as ProjectContextValue & { project: Project };
}
