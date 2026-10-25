# ai visibility web

React 19 · React Router 7 (data router, lazy routes) · TanStack Query 5 · Recharts 3 · Tailwind 4 · lucide-react.
Read `brand/ai/BRAND.md` (the ai tool family guide) first; UI tokens are `brand/tokens.css`. Copy comes from `@/content/copy` (Creative), art from `@/components/art` (Art).

```bash
npm run dev -w web          # :5180, proxies /api → :4400 (override with API_URL=http://localhost:4402)
npx tsc --noEmit            # from web/
npx vite build              # then delete web/dist (the API serves it if present)
```

## Add a page

1. Replace the placeholder in `src/pages/project/<Name>.tsx` (project pages) or `src/pages/<Name>.tsx`. Default-export the component.
2. Routes live in `src/App.tsx` (already wired for every path in ARCHITECTURE.md). Add `handle: { filters: true }` to show the period + engine selectors in the top bar, `{ filters: { engine: false } }` for period only.
3. Skeleton:

```tsx
export default function PromptsPage() {
  const { projectId, project, colors, engines } = useProject();   // only inside project routes
  const { params, days, engine } = useFilters();                   // ?days=30&engine=chatgpt
  const stats = usePromptStats(projectId, params);
  const P = copy.pages.prompts;
  return (
    <Page>
      <PageHeader title={P.title} subtitle={P.subtitle} actions={<Button variant="primary">…</Button>} />
      {stats.isLoading ? <SkeletonCard /> : stats.isError ? <ErrorState error={stats.error} onRetry={() => stats.refetch()} /> : …}
    </Page>
  );
}
```

`src/pages/project/Overview.tsx` is the reference implementation (KPI row, charts, table, empty/loading/error states).

**Rules of thumb:** tokens only (`bg-surface`, `text-text-muted`, `var(--color-chart-3)`), never hex · ai visibility follows Tally (BRAND §6): no shadows at rest, 1/2/4/6px radii, no pills, sentence case, links in `text-accent` · one `primary` button per view · numbers in `font-mono tnum`, right-aligned in tables · format every number with `@/lib/format` before it reaches copy templates (`fmt(copy.x, { visibility: pct(v) })`) · UI says "check" (not "run") and "Answers" (not "responses") · color follows the entity (`colors[competitorId]`), never the rank · status colors always come with an icon/sign.

## Layout & context — `@/components/layout`

| Export | Use |
|---|---|
| `useProject()` | `{ projectId, project, colors, engines, engineInfo }` inside project pages. `colors` maps `'brand'` and each competitor id to its CSS color. `engines` = the project's `EngineInfo[]` (with `mode`). |
| `useProjectContext()` | Same, nullable, for components that also render outside projects. |
| `RunButton` | "Run check" (real-time) + menu with "Run cheaper (batch)" and "Re-check today's prompts" (`force`); live `Checking x/y` progress, a calm "Waiting on batch · engines" state, completion toast with cost (already in the top bar). |
| `RunProgress` | `<RunProgress run={run} />` in-place progress for empty states (bar while answers stream in, "Waiting on batch" line while provider batches process). |
| `ThemeToggle` | Light / dark / system menu (persisted as `ai-visibility-theme`). |
| `AppLayout`, `ProjectGate`, `NAV_SECTIONS` | Shell, project loader/404, sidebar model (from `copy.nav.sections`). |

## UI kit — `@/components/ui`

| Component | One-liner |
|---|---|
| `Button` / `ButtonLink` | `<Button variant="primary\|secondary\|ghost\|danger" size="sm\|md\|lg" icon={Plus} loading>Add competitor</Button>`; `ButtonLink` takes `to`. |
| `IconButton` | `<IconButton icon={X} label="Close" />` (label required). |
| `Card`, `CardHeader`, `CardBody`, `CardFooter` | `<Card><CardHeader title subtitle titleAddon={<InfoTip …/>} actions={…} /><CardBody>…</CardBody></Card>`; `Card padded interactive`. |
| `Badge`, `Dot` | `<Badge tone="neutral\|primary\|success\|warning\|danger\|info\|accent\|outline" icon dot>`; `<Dot color={colors[id]} />` for legends/tables. |
| `Tabs`, `TabPanel`, `useTabParam` | `const [tab, setTab] = useTabParam('tab', ['all','lost'] as const, 'all'); <Tabs items={[{value,label,count}]} value={tab} onValueChange={setTab} />` (URL-synced). |
| `SegmentedControl` | `<SegmentedControl label="Metric" value={m} onChange={setM} options={[{value,label,icon?}]} />` |
| `Select`, `Input`, `Textarea`, `Field` | Labelled controls with `hint` / `error`; `Select` is native (`options`, `value`, `onChange(v)`); `Textarea mono`. |
| `Checkbox`, `Switch` | `<Checkbox label description checked onCheckedChange />`, `<Switch checked onCheckedChange label />`. |
| `Dialog`, `Drawer` | Native `<dialog>` (focus trap, Esc, backdrop). `<Dialog open onClose title description footer>`; `<Drawer side="right" widthClass="max-w-2xl">` for answer detail. |
| `Tooltip`, `InfoTip` | `<Tooltip content="…"><button/></Tooltip>`; `<InfoTip term={copy.glossary.metrics.shareOfVoice} />` for metric help. |
| `Popover`, `Menu` | `<Menu items={[{key,label,icon,onSelect,selected?,description?}, 'separator']} trigger={(p) => <IconButton {...p} …/>} />` (`description` = one muted line under the label) |
| `Table`, `THead`, `TBody`, `Tr`, `Th`, `Td`, `TableEmpty`, `useSort` | `const { rows, sortProps } = useSort(data, { vis: r => r.visibility }, { key: 'vis', dir: 'desc' }); <Th num {...sortProps('vis')}>`; `<Tr highlight>` for the brand row; `<Td num>` = mono right-aligned; `<Table maxHeight={480}>` = sticky header. |
| `Skeleton`, `SkeletonText`, `SkeletonCard` | Loading placeholders. |
| `EmptyState`, `ErrorState` | `<EmptyState illustration={<EmptyPrompts />} title body action={<Button variant="primary">…</Button>} />`; `<ErrorState error={q.error} onRetry={q.refetch} />`. |
| `ToastProvider`, `useToast` | `const toast = useToast(); toast.success('Draft approved'); toast.error("Couldn't save", errorMessage(e))`. |
| `CodeBlock`, `CopyButton`, `useCopy` | `<CodeBlock code={snippet.code} title={snippet.name} language="nginx" />` with copy button. |
| `ProgressBar` | `<ProgressBar value={0.42} tone="primary" color? indeterminate label />` |
| `ScoreRing` | `<ScoreRing value={66} tone="status" size={112} />` (`primary` for the brand's score, `status` for audits). |
| `DeltaBadge` | `<DeltaBadge delta={kpi.delta} kind="score\|points\|ratioPoints\|count\|position\|percent" />` — good/bad colored, position lower = better, null → "—". |
| `KpiCard` | `<KpiCard label info={copy.glossary.metrics.x} value="42" unit="/100" delta={…} deltaKind="score" comparison="vs prior 30 days" trend={[…]} />` |
| `SentimentPill` | `<SentimentPill raw={-0.2} showScore />` or `label="positive"`; icon + label, never color alone. |
| `SimulatedBadge`, `LiveBadge`, `ModeBadge` | `<ModeBadge mode={e.mode} engineName="ChatGPT" />` |
| `EngineBadge`, `EngineMark` | `<EngineBadge engine="claude" mode? showVendor? />` (Art's EngineGlyph + name). |
| `PageHeader` | `<PageHeader title subtitle actions breadcrumbs titleAddon />` — also sets `document.title`. |
| `FilterBar` | Period + engine selects bound to the URL (already in the top bar via route `handle`). |
| `UnsavedChangesGuard` | `<UnsavedChangesGuard when={dirty} />` in a form page: "Discard changes?" on in-app navigation, browser prompt on reload. Pass a function (`() => dirty && !saved.current`) when a save navigates away. |
| `Page`, `Section`, `StatGrid` | `<Page>` = max-width 1440 + 24px rhythm; `<StatGrid cols={{ base: 2, md: 3, xl: 6 }}>`; `<Section title actions>`. |

## Charts — `@/components/charts`

All take token colors (`var(--color-chart-n)`), show gaps for `null` days, and use `ChartTooltipBox` tooltips.

| Chart | Use |
|---|---|
| `TrendChart` | `<TrendChart data={ov.visibilityTrend} series={[{ key: 'brand', name, color: BRAND_COLOR, emphasis: true }, …]} format="percent" legend="toggle" />` |
| `StackedAreaChart` | `<StackedAreaChart data={crawlers.trend} series={…} variant="area\|bar" normalize? />` (crawler categories, referral sources). |
| `BarList` | `<BarList items={[{ key, label, value, color, meta, highlight, to }]} format="number\|percent" max={1} limit={8} />` (sources, agents, pages). |
| `DonutChart` | `<DonutChart data={[{ key, name, value, color, emphasis }]} center={…} />` (share; fold >7 competitors into "Other"). |
| `Sparkline` | `<Sparkline values={stat.trend} domain={[0, 1]} width={80} height={24} />` (pure SVG, fine in table rows). |
| `HeatmapGrid` | `<HeatmapGrid rows columns getValue={(r, c) => 0..1 \| null} onCellClick rowHeader="Prompt" />` (prompt × engine). |
| `DriverBars` | `<DriverBars brandName items={drivers.map(d => ({ id, name, score, leaderScore, leaderName }))} leaderColor={(name) => …} />` |
| `ChartLegend`, `ChartEmpty`, `formatValue` | Building blocks for custom charts. |

## Data — `@/lib/api`

Typed fetch (`api.*`, throws `ApiError` with the server's `{error}` text; `errorMessage(e)` for UI) and a hook per endpoint:

- **Settings / engines / spend:** `useSettings`, `useUpdateSettings` (incl. `cost`: budget, scheduled mode, same-day reuse), `useEngines`, `useUsage(days)` (estimated live spend; 404 on servers without cost tracking)
- **Projects:** `useProjects`, `useProjectQuery`, `useCreateProject`, `useUpdateProject(id)`, `useDeleteProject`, `useSuggestProject`, `useSeedDemo`
- **Competitors / prompts:** `useCompetitors`, `useCreateCompetitor(id)`, `useUpdateCompetitor(id)` (`{ id, …patch }`), `useDeleteCompetitor(id)`; `usePrompts`, `useCreatePrompts(id)` (one or many), `useUpdatePrompt(id)`, `useDeletePrompt(id)`
- **Checks (runs):** `useStartRun(id)` (`{ mode: 'batch' }` cheaper, `{ force: true }` skips same-day reuse), `useRuns(id)`, `useRun(rid)` (polls every 1.5s while queued/running, every 30s while only waiting on provider batches; on completion invalidates every answer-derived query and usage), `useActiveRun(id)`, `isRunActive(run)`, `isWaitingOnBatch(run)`
- **Monitor:** `useOverview(id, params)`, `usePromptStats(id, params)`, `useSources(id, params)`, `useResponses(id, { engine, promptId, runId, mentioned, limit, offset })`, `useResponse(rid)`
- **Diagnose / act:** `useDiagnosis(id)`, `useRecommendations(id)`, `useUpdateRecommendation(id)` (optimistic), `useDrafts(id)`, `useCreateDraft(id)`, `useUpdateDraft(id)`, `useDeleteDraft(id)`
- **Readiness:** `useRunAudit(id)`, `useLatestAudit(id)`, `useAudits(id)`
- **Crawlers / traffic:** `useCrawlerOverview(id, { days })`, `useBotEvents(id, { limit, offset, agent, category, operator, path, days })`, `useReferralOverview(id, { days })`, `useUploadLogs(id)`, `useIntegration(id)`, `useAgents()`
- **Report:** `useReport(id, { days })`, `exportCsvUrl(id, 'responses' | 'mentions' | 'citations' | 'bot_events' | 'prompts', { days })`

Mutations invalidate the right keys (`qk.*`; everything about a project lives under `['p', projectId]`). Aggregate hooks keep the previous data while filters change (`isPlaceholderData`).

## Helpers

- `@/lib/filters` — `useFilters()` → `{ days, engine, setDays, setEngine, params }`; `useFilterSearch()` keeps `?days&engine` on links.
- `@/lib/format` — `pct(0.38)` "38%" / "4.2%", `pct(22.2, { from100: true })`, `score`, `num` / `compact` ("12.5k"), `position` "#2.4", `ordinal` "2nd", `sentiment(raw)` / `sentimentScore` / `sentimentLabel`, `formatDelta(d, kind)`, `points(n)` "1 pt" / "6 pts", `relativeTime`, `dayLabel('2026-10-14')` "Oct 14", `date`, `dateTime`, `rangeLabel`, `duration`, `bytes`, `usd` ("$12.40", "$0.18", "<$0.01"; `{ precise: true }` → "$0.0042" for per-answer costs). Missing values render "—"; negatives use a true minus.
- `@/lib/colors` — `BRAND_COLOR` (`--chart-1`), `OTHER_COLOR`, `entityColorMap(project)` (already in `useProject().colors`), `competitorColor`, `themeColor(serverHex)`, `SENTIMENT_COLORS`, `SOURCE_TYPE_COLORS`, `AGENT_CATEGORY_COLORS/NAMES`, `heatStep` / `heatColor`.
- `@/lib/engines` — `ENGINES[id]` `{ name, vendor, color, dotClass }`, `ENGINE_IDS`, `engineName`, `engineColor`, `isEngineId` (engine colors only on engine-series charts); `describeEngineError(raw, engine?)` → `{ message, detail }` for failed answers/checks (plain words first, HTTP status + provider code as detail, never raw JSON).
- `@/lib/theme` — `useTheme()` `{ pref, resolved, setPref }`.
- CSS utilities: `tnum` (tabular digits), `eyebrow` (12px muted label, sentence case), `scrollbar-none`; `data-print="hide"` / `data-print="avoid-break"` for print.
