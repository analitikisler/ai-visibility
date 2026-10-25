// Typed API client + TanStack Query hooks for every endpoint in docs/ARCHITECTURE.md.
// Pages never call fetch directly: use a hook from here (or `api.*` inside custom logic).
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type UseQueryOptions,
} from '@tanstack/react-query';
import type {
  AgentCategory,
  AiAgent,
  AiResponse,
  AuditResult,
  BotEvent,
  Competitor,
  CrawlerOverview,
  Diagnosis,
  Draft,
  DraftRequest,
  EngineId,
  EngineInfo,
  IntegrationInfo,
  Overview,
  Paged,
  Project,
  ProjectInput,
  ProjectSuggestion,
  Prompt,
  PromptInput,
  PromptStat,
  PromptTier,
  Recommendation,
  RecStatus,
  ReferralOverview,
  Report,
  Run,
  RunMode,
  SettingsUpdate,
  SettingsView,
  SourcesView,
  UsageView,
} from '@shared/types';

// ============================================================================
// Fetch wrapper
// ============================================================================

/** Thrown for any non-2xx response. `message` is the server's `{error}` text when present. */
export class ApiError extends Error {
  readonly status: number;
  readonly path: string;
  constructor(message: string, status: number, path: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.path = path;
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;
export const isNotFound = (e: unknown) => isApiError(e) && e.status === 404;

/** Human-readable message for any thrown value (for toasts and ErrorState). */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  if (e instanceof Error) return e.message;
  return 'Unexpected error';
}

type QueryValue = string | number | boolean | null | undefined;
export type QueryParams = Record<string, QueryValue>;

/** `?a=1&b=x` from params, skipping null/undefined/''. */
export function toQuery(params?: QueryParams): string {
  if (!params) return '';
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    sp.set(k, typeof v === 'boolean' ? (v ? '1' : '0') : String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

const TIMEOUT_MS = 30_000;
const UNREACHABLE = "Couldn't reach the ai visibility server. Check it's running, then try again.";

async function request<T>(method: string, path: string, body?: unknown, opts: { text?: boolean; headers?: Record<string, string> } = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const url = `/api${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      signal: ctrl.signal,
      headers: {
        ...(body === undefined ? { Accept: 'application/json' } : { Accept: 'application/json', 'Content-Type': opts.text ? 'text/plain' : 'application/json' }),
        ...opts.headers,
      },
      body: body === undefined ? undefined : opts.text ? String(body) : JSON.stringify(body),
    });
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === 'AbortError';
    throw new ApiError(aborted ? `The server took longer than ${TIMEOUT_MS / 1000}s to answer. Try again.` : UNREACHABLE, 0, path);
  } finally {
    clearTimeout(timer);
  }
  const ct = res.headers.get('content-type') ?? '';
  const data: unknown = ct.includes('application/json') ? await res.json().catch(() => null) : await res.text().catch(() => null);
  if (!res.ok) {
    const msg =
      data && typeof data === 'object' && 'error' in data && typeof (data as { error: unknown }).error === 'string'
        ? (data as { error: string }).error
        : // No `{error}` body: a proxy answered (API down or restarting) or the server crashed. Plain words, code in brackets.
          res.status === 502 || res.status === 503 || res.status === 504
          ? UNREACHABLE
          : `The server couldn't finish that request (HTTP ${res.status}). Try again.`;
    throw new ApiError(msg, res.status, path);
  }
  return data as T;
}

export const http = {
  get: <T>(path: string, params?: QueryParams) => request<T>('GET', path + toQuery(params)),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>('POST', path, body ?? {}, { headers }),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  del: <T = { ok: boolean }>(path: string) => request<T>('DELETE', path),
  postText: <T>(path: string, text: string) => request<T>('POST', path, text, { text: true }),
};

// ============================================================================
// Param types
// ============================================================================

/** Common aggregate filters (`?days&engine&tier`). */
export interface AggParams {
  days?: number;
  engine?: EngineId;
  tier?: PromptTier;
}
/** `GET /projects/:id/responses` filters (the server doesn't take `days`/`tier` here). */
export interface ResponsesParams {
  engine?: EngineId;
  promptId?: string;
  runId?: string;
  limit?: number;
  offset?: number;
  /** true → only answers mentioning the brand; false → only answers without it (failed answers excluded either way). */
  mentioned?: boolean;
  /** true → only failed answers (engine error, no text); false → only successful ones. */
  failed?: boolean;
  days?: number;
  tier?: PromptTier;
  /** Text search over answer and prompt text. */
  q?: string;
  /** Only answers that cite this domain (normalized, no www.). */
  citedDomain?: string;
}
export interface BotEventsParams {
  limit?: number;
  offset?: number;
  agent?: string;
  category?: AgentCategory;
  operator?: string;
  path?: string;
  days?: number;
  verification?: BotEvent['verification'];
}
/** `POST /projects/:id/runs` body. `mode: 'batch'` uses provider batch APIs (~50% cheaper, results within hours); `force` skips same-day reuse. */
export interface StartRunBody {
  engines?: EngineId[];
  promptIds?: string[];
  mode?: RunMode;
  force?: boolean;
}
export type ExportKind = 'responses' | 'mentions' | 'citations' | 'bot_events' | 'prompts';
export interface LogUploadResult {
  parsed: number;
  botEvents: number;
  referralEvents: number;
  skipped: number;
}

const agg = (p?: AggParams): QueryParams => ({ days: p?.days, engine: p?.engine, tier: p?.tier });

// ============================================================================
// Raw endpoint functions (one per route)
// ============================================================================

export const api = {
  // settings & engines
  getSettings: () => http.get<SettingsView>('/settings'),
  updateSettings: (body: SettingsUpdate) => http.put<SettingsView>('/settings', body),
  getEngines: () => http.get<EngineInfo[]>('/engines'),
  getUsage: (p?: { days?: number }) => http.get<UsageView>('/usage', { days: p?.days }),

  // projects
  listProjects: () => http.get<Project[]>('/projects'),
  getProject: (id: string) => http.get<Project>(`/projects/${id}`),
  createProject: (body: ProjectInput) => http.post<Project>('/projects', body),
  updateProject: (id: string, body: Partial<ProjectInput>) => http.put<Project>(`/projects/${id}`, body),
  deleteProject: (id: string) => http.del(`/projects/${id}`),
  suggestProject: (body: { name: string; domain: string; description?: string }) => http.post<ProjectSuggestion>('/projects/suggest', body),
  seedDemo: () => http.post<Project>('/demo/seed'),

  // competitors
  listCompetitors: (projectId: string) => http.get<Competitor[]>(`/projects/${projectId}/competitors`),
  createCompetitor: (projectId: string, body: { name: string; domain?: string; aliases?: string[]; color?: string }) =>
    http.post<Competitor>(`/projects/${projectId}/competitors`, body),
  updateCompetitor: (cid: string, body: Partial<Pick<Competitor, 'name' | 'domain' | 'aliases' | 'color'>>) => http.put<Competitor>(`/competitors/${cid}`, body),
  deleteCompetitor: (cid: string) => http.del(`/competitors/${cid}`),

  // prompts
  listPrompts: (projectId: string) => http.get<Prompt[]>(`/projects/${projectId}/prompts`),
  createPrompts: (projectId: string, body: PromptInput | PromptInput[]) => http.post<Prompt[]>(`/projects/${projectId}/prompts`, body),
  updatePrompt: (pid: string, body: Partial<PromptInput>) => http.put<Prompt>(`/prompts/${pid}`, body),
  deletePrompt: (pid: string) => http.del(`/prompts/${pid}`),

  // runs
  startRun: (projectId: string, body: StartRunBody = {}) => http.post<Run>(`/projects/${projectId}/runs`, body),
  listRuns: (projectId: string) => http.get<Run[]>(`/projects/${projectId}/runs`),
  getRun: (rid: string) => http.get<Run>(`/runs/${rid}`),

  // monitor
  getOverview: (projectId: string, p?: AggParams) => http.get<Overview>(`/projects/${projectId}/overview`, agg(p)),
  getPromptStats: (projectId: string, p?: AggParams) => http.get<PromptStat[]>(`/projects/${projectId}/prompt-stats`, agg(p)),
  getSources: (projectId: string, p?: AggParams) => http.get<SourcesView>(`/projects/${projectId}/sources`, agg(p)),
  listResponses: (projectId: string, p?: ResponsesParams) =>
    http.get<Paged<AiResponse>>(`/projects/${projectId}/responses`, {
      engine: p?.engine,
      promptId: p?.promptId,
      runId: p?.runId,
      limit: p?.limit,
      offset: p?.offset,
      mentioned: p?.mentioned,
      failed: p?.failed,
      days: p?.days,
      tier: p?.tier,
      q: p?.q,
      citedDomain: p?.citedDomain,
    }),
  getResponse: (rid: string) => http.get<AiResponse>(`/responses/${rid}`),

  // diagnose / plan / act
  // Diagnose and recommendations are computed over the project's recent history (no filters).
  getDiagnosis: (projectId: string, p?: { days?: number }) => http.get<Diagnosis>(`/projects/${projectId}/diagnose`, { days: p?.days }),
  listRecommendations: (projectId: string) => http.get<Recommendation[]>(`/projects/${projectId}/recommendations`),
  updateRecommendation: (projectId: string, key: string, status: RecStatus) =>
    http.put<Recommendation>(`/projects/${projectId}/recommendations/${encodeURIComponent(key)}`, { status }),
  listDrafts: (projectId: string) => http.get<Draft[]>(`/projects/${projectId}/drafts`),
  createDraft: (projectId: string, body: DraftRequest) => http.post<Draft>(`/projects/${projectId}/drafts`, body),
  updateDraft: (did: string, body: Partial<Pick<Draft, 'title' | 'body' | 'status'>>) => http.put<Draft>(`/drafts/${did}`, body),
  deleteDraft: (did: string) => http.del(`/drafts/${did}`),

  // audit
  runAudit: (projectId: string, body: { url?: string } = {}) => http.post<AuditResult>(`/projects/${projectId}/audit`, body),
  getLatestAudit: (projectId: string) => http.get<AuditResult | null>(`/projects/${projectId}/audits/latest`),
  listAudits: (projectId: string) => http.get<AuditResult[]>(`/projects/${projectId}/audits`),

  // crawlers & traffic
  getCrawlerOverview: (projectId: string, p?: { days?: number }) => http.get<CrawlerOverview>(`/projects/${projectId}/crawlers/overview`, { days: p?.days }),
  listBotEvents: (projectId: string, p?: BotEventsParams) => http.get<Paged<BotEvent>>(`/projects/${projectId}/crawlers/events`, { ...p }),
  getReferralOverview: (projectId: string, p?: { days?: number }) => http.get<ReferralOverview>(`/projects/${projectId}/referrals/overview`, { days: p?.days }),
  uploadLogs: (projectId: string, log: string) => http.postText<LogUploadResult>(`/projects/${projectId}/logs`, log),
  getIntegration: (projectId: string) => http.get<IntegrationInfo>(`/projects/${projectId}/integration`),
  listAgents: () => http.get<AiAgent[]>('/agents'),

  // report
  getReport: (projectId: string, p?: { days?: number }) => http.get<Report>(`/projects/${projectId}/report`, { days: p?.days ?? 7 }),
};

/** URL for a CSV export (use as `<a href download>`); `days` defaults to 90 on the server. */
export function exportCsvUrl(projectId: string, kind: ExportKind, params?: { days?: number }): string {
  return `/api/projects/${projectId}/export/${kind}.csv${toQuery({ days: params?.days })}`;
}

// ============================================================================
// Query keys
// ============================================================================
// Everything about a project lives under ['p', projectId, …] so one prefix invalidates it all.

export const qk = {
  settings: ['settings'] as const,
  engines: ['engines'] as const,
  /** Workspace-wide spend (not under a project: it spans all of them). */
  usage: (days?: number) => ['usage', days ?? 30] as const,
  usageAll: ['usage'] as const,
  agents: ['agents'] as const,
  projects: ['projects'] as const,
  project: (id: string) => ['p', id, 'detail'] as const,
  projectAll: (id: string) => ['p', id] as const,
  competitors: (id: string) => ['p', id, 'competitors'] as const,
  prompts: (id: string) => ['p', id, 'prompts'] as const,
  runs: (id: string) => ['p', id, 'runs'] as const,
  run: (rid: string) => ['run', rid] as const,
  overview: (id: string, p?: AggParams) => ['p', id, 'overview', agg(p)] as const,
  promptStats: (id: string, p?: AggParams) => ['p', id, 'prompt-stats', agg(p)] as const,
  sources: (id: string, p?: AggParams) => ['p', id, 'sources', agg(p)] as const,
  responses: (id: string, p?: ResponsesParams) => ['p', id, 'responses', p ?? {}] as const,
  response: (rid: string) => ['response', rid] as const,
  diagnosis: (id: string, days?: number) => (days ? (['p', id, 'diagnose', days] as const) : (['p', id, 'diagnose'] as const)),
  recommendations: (id: string) => ['p', id, 'recommendations'] as const,
  drafts: (id: string) => ['p', id, 'drafts'] as const,
  latestAudit: (id: string) => ['p', id, 'audits', 'latest'] as const,
  audits: (id: string) => ['p', id, 'audits', 'list'] as const,
  crawlerOverview: (id: string, p?: { days?: number }) => ['p', id, 'crawlers', 'overview', p?.days ?? null] as const,
  botEvents: (id: string, p?: BotEventsParams) => ['p', id, 'crawlers', 'events', p ?? {}] as const,
  referrals: (id: string, p?: { days?: number }) => ['p', id, 'referrals', p?.days ?? null] as const,
  integration: (id: string) => ['p', id, 'integration'] as const,
  report: (id: string, p?: { days?: number }) => ['p', id, 'report', p?.days ?? 7] as const,
};

/** Parts of a project derived from answers; refetched after a run or a config change. */
const ANSWER_DERIVED = ['overview', 'prompt-stats', 'sources', 'responses', 'diagnose', 'recommendations', 'report', 'runs'] as const;

/** Invalidate every aggregate built from answers (after a run completes or competitors/prompts change). */
export function invalidateProjectAggregates(qc: QueryClient, projectId: string) {
  for (const part of ANSWER_DERIVED) void qc.invalidateQueries({ queryKey: ['p', projectId, part] });
  void qc.invalidateQueries({ queryKey: qk.project(projectId) });
  void qc.invalidateQueries({ queryKey: qk.projects });
  // New live answers change the workspace's spend.
  void qc.invalidateQueries({ queryKey: qk.usageAll });
}

type Opts<T> = Omit<UseQueryOptions<T, Error, T, readonly unknown[]>, 'queryKey' | 'queryFn'>;

// ============================================================================
// Query hooks
// ============================================================================

// ---- settings & engines
export const useSettings = (o?: Opts<SettingsView>) => useQuery({ queryKey: qk.settings, queryFn: api.getSettings, ...o });
export const useEngines = (o?: Opts<EngineInfo[]>) => useQuery({ queryKey: qk.engines, queryFn: api.getEngines, staleTime: 60_000, ...o });
/** Estimated live spend over the last `days` (default 30) plus month-to-date vs budget. 404 = server without cost tracking. */
export const useUsage = (days = 30, o?: Opts<UsageView>) =>
  useQuery({ queryKey: qk.usage(days), queryFn: () => api.getUsage({ days }), placeholderData: keepPreviousData, ...o });

// ---- projects
export const useProjects = (o?: Opts<Project[]>) => useQuery({ queryKey: qk.projects, queryFn: api.listProjects, ...o });
export const useProjectQuery = (id: string | undefined, o?: Opts<Project>) =>
  useQuery({ queryKey: qk.project(id ?? ''), queryFn: () => api.getProject(id!), enabled: !!id, ...o });
export const useCompetitors = (id: string | undefined, o?: Opts<Competitor[]>) =>
  useQuery({ queryKey: qk.competitors(id ?? ''), queryFn: () => api.listCompetitors(id!), enabled: !!id, ...o });
export const usePrompts = (id: string | undefined, o?: Opts<Prompt[]>) =>
  useQuery({ queryKey: qk.prompts(id ?? ''), queryFn: () => api.listPrompts(id!), enabled: !!id, ...o });

// ---- runs
const isActive = (r: Run | undefined | null) => !!r && (r.status === 'queued' || r.status === 'running');
export const isRunActive = isActive;
/** A batch run whose provider batches are still processing (minutes to hours): poll slowly, show a calm waiting state. */
export const isWaitingOnBatch = (r: Run | undefined | null) => isActive(r) && !!r?.pendingBatches?.length;
/** Poll fast while answers stream in, slowly while only provider batches are left. */
const runPollMs = (r: Run | undefined | null) => (isWaitingOnBatch(r) ? 30_000 : 1500);

export const useRuns = (id: string | undefined, o?: Opts<Run[]>) =>
  useQuery({
    queryKey: qk.runs(id ?? ''),
    queryFn: () => api.listRuns(id!),
    enabled: !!id,
    // Keep the list fresh while something is in flight so the latest run shows up.
    refetchInterval: (q) => {
      const active = q.state.data?.filter(isActive) ?? [];
      return active.length === 0 ? false : active.every(isWaitingOnBatch) ? 30_000 : 3000;
    },
    ...o,
  });

/**
 * One run, polled every 1.5s while queued/running (every 30s while it only waits on provider batches). When it finishes, every answer-derived
 * aggregate of its project is invalidated (once per transition, however many components watch it).
 */
export function useRun(rid: string | undefined | null, o?: Opts<Run>) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: qk.run(rid ?? ''),
    enabled: !!rid,
    queryFn: async () => {
      const prev = qc.getQueryData<Run>(qk.run(rid!));
      const run = await api.getRun(rid!);
      if (isActive(prev) && !isActive(run)) invalidateProjectAggregates(qc, run.projectId);
      return run;
    },
    refetchInterval: (q) => (isActive(q.state.data) ? runPollMs(q.state.data) : false),
    refetchIntervalInBackground: true,
    ...o,
  });
}

/** The project's in-flight run (if any), polled live. Used by the "Run now" button. */
export function useActiveRun(projectId: string | undefined) {
  const runs = useRuns(projectId);
  const latest = runs.data?.find(isActive) ?? null;
  const run = useRun(latest?.id);
  const current = run.data ?? latest;
  return { run: isActive(current) ? current : null, lastRun: runs.data?.[0] ?? null, isLoading: runs.isLoading };
}

// ---- monitor
export const useOverview = (id: string | undefined, p?: AggParams, o?: Opts<Overview>) =>
  useQuery({ queryKey: qk.overview(id ?? '', p), queryFn: () => api.getOverview(id!, p), enabled: !!id, placeholderData: keepPreviousData, ...o });
export const usePromptStats = (id: string | undefined, p?: AggParams, o?: Opts<PromptStat[]>) =>
  useQuery({ queryKey: qk.promptStats(id ?? '', p), queryFn: () => api.getPromptStats(id!, p), enabled: !!id, placeholderData: keepPreviousData, ...o });
export const useSources = (id: string | undefined, p?: AggParams, o?: Opts<SourcesView>) =>
  useQuery({ queryKey: qk.sources(id ?? '', p), queryFn: () => api.getSources(id!, p), enabled: !!id, placeholderData: keepPreviousData, ...o });
export const useResponses = (id: string | undefined, p?: ResponsesParams, o?: Opts<Paged<AiResponse>>) =>
  useQuery({ queryKey: qk.responses(id ?? '', p), queryFn: () => api.listResponses(id!, p), enabled: !!id, placeholderData: keepPreviousData, ...o });
export const useResponse = (rid: string | undefined | null, o?: Opts<AiResponse>) =>
  useQuery({ queryKey: qk.response(rid ?? ''), queryFn: () => api.getResponse(rid!), enabled: !!rid, ...o });

// ---- diagnose / plan / act
/** Diagnosis over the last `days` (server default 30). The key stays under ['p', id, 'diagnose'] so invalidations match. */
export const useDiagnosis = (id: string | undefined, p?: { days?: number }, o?: Opts<Diagnosis>) =>
  useQuery({ queryKey: qk.diagnosis(id ?? '', p?.days), queryFn: () => api.getDiagnosis(id!, p), enabled: !!id, ...o });
export const useRecommendations = (id: string | undefined, o?: Opts<Recommendation[]>) =>
  useQuery({ queryKey: qk.recommendations(id ?? ''), queryFn: () => api.listRecommendations(id!), enabled: !!id, ...o });
export const useDrafts = (id: string | undefined, o?: Opts<Draft[]>) =>
  useQuery({ queryKey: qk.drafts(id ?? ''), queryFn: () => api.listDrafts(id!), enabled: !!id, ...o });

// ---- audit
export const useLatestAudit = (id: string | undefined, o?: Opts<AuditResult | null>) =>
  useQuery({ queryKey: qk.latestAudit(id ?? ''), queryFn: () => api.getLatestAudit(id!), enabled: !!id, ...o });
export const useAudits = (id: string | undefined, o?: Opts<AuditResult[]>) =>
  useQuery({ queryKey: qk.audits(id ?? ''), queryFn: () => api.listAudits(id!), enabled: !!id, ...o });

// ---- crawlers & traffic
export const useCrawlerOverview = (id: string | undefined, p?: { days?: number }, o?: Opts<CrawlerOverview>) =>
  useQuery({ queryKey: qk.crawlerOverview(id ?? '', p), queryFn: () => api.getCrawlerOverview(id!, p), enabled: !!id, placeholderData: keepPreviousData, ...o });
export const useBotEvents = (id: string | undefined, p?: BotEventsParams, o?: Opts<Paged<BotEvent>>) =>
  useQuery({ queryKey: qk.botEvents(id ?? '', p), queryFn: () => api.listBotEvents(id!, p), enabled: !!id, placeholderData: keepPreviousData, ...o });
export const useReferralOverview = (id: string | undefined, p?: { days?: number }, o?: Opts<ReferralOverview>) =>
  useQuery({ queryKey: qk.referrals(id ?? '', p), queryFn: () => api.getReferralOverview(id!, p), enabled: !!id, placeholderData: keepPreviousData, ...o });
export const useIntegration = (id: string | undefined, o?: Opts<IntegrationInfo>) =>
  useQuery({ queryKey: qk.integration(id ?? ''), queryFn: () => api.getIntegration(id!), enabled: !!id, ...o });
/** Issues a new ingest token; the old one stops working at once. */
export function useRotateIngestToken(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => http.post<IntegrationInfo>(`/projects/${projectId}/integration/token`),
    onSuccess: (info) => qc.setQueryData(qk.integration(projectId), info),
  });
}
export const useAgents = (o?: Opts<AiAgent[]>) => useQuery({ queryKey: qk.agents, queryFn: api.listAgents, staleTime: 5 * 60_000, ...o });

// ---- report
export const useReport = (id: string | undefined, p?: { days?: number }, o?: Opts<Report>) =>
  useQuery({ queryKey: qk.report(id ?? '', p), queryFn: () => api.getReport(id!, p), enabled: !!id, ...o });

// ============================================================================
// Mutation hooks
// ============================================================================

// ---- settings
export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.updateSettings,
    onSuccess: (data, body) => {
      qc.setQueryData(qk.settings, data);
      // Keys switch engines between live and simulated.
      void qc.invalidateQueries({ queryKey: qk.engines });
      // The monthly budget is part of the usage view.
      if (body.cost) void qc.invalidateQueries({ queryKey: qk.usageAll });
    },
  });
}

// ---- projects
export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createProject,
    onSuccess: (p) => {
      qc.setQueryData(qk.project(p.id), p);
      void qc.invalidateQueries({ queryKey: qk.projects });
    },
  });
}

export function useUpdateProject(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<ProjectInput>) => api.updateProject(projectId, body),
    onSuccess: (p) => {
      qc.setQueryData(qk.project(projectId), p);
      invalidateProjectAggregates(qc, projectId);
    },
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deleteProject,
    onSuccess: (_d, id) => {
      qc.removeQueries({ queryKey: qk.projectAll(id) });
      void qc.invalidateQueries({ queryKey: qk.projects });
    },
  });
}

export const useSuggestProject = () => useMutation({ mutationFn: api.suggestProject });

/** Creates the demo project; returns it so the caller can navigate to its overview. */
export function useSeedDemo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.seedDemo,
    onSuccess: (p) => {
      qc.setQueryData(qk.project(p.id), p);
      void qc.invalidateQueries({ queryKey: qk.projects });
    },
  });
}

// ---- competitors (changes repaint the leaderboard → aggregates refetch)
function useProjectMutation<TVars, TData>(projectId: string, fn: (v: TVars) => Promise<TData>, extraKeys: (readonly unknown[])[]) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      for (const key of extraKeys) void qc.invalidateQueries({ queryKey: key });
      invalidateProjectAggregates(qc, projectId);
    },
  });
}

export const useCreateCompetitor = (projectId: string) =>
  useProjectMutation(projectId, (body: { name: string; domain?: string; aliases?: string[]; color?: string }) => api.createCompetitor(projectId, body), [qk.competitors(projectId)]);
export const useUpdateCompetitor = (projectId: string) =>
  useProjectMutation(projectId, ({ id, ...body }: { id: string } & Partial<Pick<Competitor, 'name' | 'domain' | 'aliases' | 'color'>>) => api.updateCompetitor(id, body), [qk.competitors(projectId)]);
export const useDeleteCompetitor = (projectId: string) => useProjectMutation(projectId, (cid: string) => api.deleteCompetitor(cid), [qk.competitors(projectId)]);

// ---- prompts
export const useCreatePrompts = (projectId: string) =>
  useProjectMutation(projectId, (body: PromptInput | PromptInput[]) => api.createPrompts(projectId, body), [qk.prompts(projectId)]);
export const useUpdatePrompt = (projectId: string) =>
  useProjectMutation(projectId, ({ id, ...body }: { id: string } & Partial<PromptInput>) => api.updatePrompt(id, body), [qk.prompts(projectId)]);
export const useDeletePrompt = (projectId: string) => useProjectMutation(projectId, (pid: string) => api.deletePrompt(pid), [qk.prompts(projectId)]);

// ---- runs
/** Starts a run (`{ mode: 'batch' }` for the cheaper batch path, `{ force: true }` to skip same-day reuse); seeds the run cache so `useRun`/`useActiveRun` start polling immediately. */
export function useStartRun(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: StartRunBody = {}) => api.startRun(projectId, body),
    onSuccess: (run) => {
      qc.setQueryData(qk.run(run.id), run);
      qc.setQueryData<Run[]>(qk.runs(projectId), (prev) => [run, ...(prev ?? []).filter((r) => r.id !== run.id)]);
      void qc.invalidateQueries({ queryKey: qk.runs(projectId) });
    },
  });
}

// ---- recommendations (optimistic status change)
export function useUpdateRecommendation(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ key, status }: { key: string; status: RecStatus }) => api.updateRecommendation(projectId, key, status),
    onMutate: async ({ key, status }) => {
      const key_ = qk.recommendations(projectId);
      await qc.cancelQueries({ queryKey: key_ });
      const previous = qc.getQueryData<Recommendation[]>(key_);
      qc.setQueryData<Recommendation[]>(key_, (list) => list?.map((r) => (r.key === key ? { ...r, status } : r)));
      return { previous };
    },
    onError: (_e, _v, ctx) => qc.setQueryData(qk.recommendations(projectId), ctx?.previous),
    onSuccess: (rec) => qc.setQueryData<Recommendation[]>(qk.recommendations(projectId), (list) => list?.map((r) => (r.key === rec.key ? rec : r))),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.recommendations(projectId) });
      void qc.invalidateQueries({ queryKey: ['p', projectId, 'report'] });
    },
  });
}

// ---- drafts
export function useCreateDraft(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: DraftRequest) => api.createDraft(projectId, body),
    onSuccess: (d) => qc.setQueryData<Draft[]>(qk.drafts(projectId), (prev) => [d, ...(prev ?? []).filter((x) => x.id !== d.id)]),
    onSettled: (_d, _e, body) => {
      void qc.invalidateQueries({ queryKey: qk.drafts(projectId) });
      // Drafting from a recommendation moves it to in_progress on the server.
      if (body.params?.recKey) void qc.invalidateQueries({ queryKey: qk.recommendations(projectId) });
    },
  });
}
export function useUpdateDraft(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<Pick<Draft, 'title' | 'body' | 'status'>>) => api.updateDraft(id, body),
    onSuccess: (d) => qc.setQueryData<Draft[]>(qk.drafts(projectId), (prev) => prev?.map((x) => (x.id === d.id ? d : x))),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.drafts(projectId) }),
  });
}
export function useDeleteDraft(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (did: string) => api.deleteDraft(did),
    onSuccess: (_r, did) => qc.setQueryData<Draft[]>(qk.drafts(projectId), (prev) => prev?.filter((x) => x.id !== did)),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.drafts(projectId) }),
  });
}

// ---- audit
/** True when `url` is on the project's own site (its domain or a subdomain), like the server's "latest audit" rule. */
export function isOwnSiteUrl(domain: string, url: string): boolean {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    const own = domain.replace(/^www\./, '').toLowerCase();
    return host === own || host.endsWith(`.${own}`);
  } catch {
    return false;
  }
}

/**
 * Runs an audit. `GET /audits/latest` is the latest audit of the project's own site, so only an own-site
 * result replaces it; audits of other URLs (a competitor's page) just join the history.
 */
export function useRunAudit(projectId: string, domain: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { url?: string } = {}) => api.runAudit(projectId, body),
    onSuccess: (a) => {
      if (isOwnSiteUrl(domain, a.url)) qc.setQueryData(qk.latestAudit(projectId), a);
      qc.setQueryData<AuditResult[]>(qk.audits(projectId), (old) => (old ? [a, ...old.filter((x) => x.id !== a.id)] : old));
      void qc.invalidateQueries({ queryKey: qk.audits(projectId) });
      // Technical readiness feeds diagnose + recommendations.
      for (const part of ['diagnose', 'recommendations', 'report']) void qc.invalidateQueries({ queryKey: ['p', projectId, part] });
    },
  });
}

// ---- crawler logs
export function useUploadLogs(projectId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (log: string) => api.uploadLogs(projectId, log),
    onSuccess: () => {
      for (const part of ['crawlers', 'referrals', 'integration', 'recommendations', 'report']) void qc.invalidateQueries({ queryKey: ['p', projectId, part] });
    },
  });
}
