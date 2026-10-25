// Diagnose: why competitors get named instead of you. Overall score, five drivers vs the leader,
// drivers per engine, and lost prompts with a one-click comparison-page draft.
import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Columns2, Play } from 'lucide-react';
import type { Diagnosis, DriverId, DriverScore, EngineId } from '@shared/types';
import { EmptyNoData } from '@/components/art';
import { DriverBars, HeatLegend, HeatmapGrid } from '@/components/charts';
import { DraftDrawer, useDraftAgent } from '@/components/drafts';
import { useProject } from '@/components/layout';
import {
  Badge,
  Button,
  ButtonLink,
  Card,
  CardFooter,
  CardHeader,
  DeltaBadge,
  Dot,
  EmptyState,
  EngineBadge,
  ErrorState,
  InfoTip,
  Page,
  PageHeader,
  ProgressBar,
  ScoreRing,
  SkeletonCard,
  Table,
  TableEmpty,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  useSort,
  useToast,
} from '@/components/ui';
import { copy, fmt, plural } from '@/content/copy';
import { errorMessage, isWaitingOnBatch, useActiveRun, useDiagnosis, useStartRun } from '@/lib/api';
import { useFilters } from '@/lib/filters';
import { cn } from '@/lib/cn';
import { BRAND_COLOR, OTHER_COLOR } from '@/lib/colors';
import { ENGINES } from '@/lib/engines';
import { pct, score } from '@/lib/format';

const P = copy.pages.diagnose;
const GD = copy.glossary.drivers;

/** Leader name → entity color (competitors by name; anything else, like "Benchmark", is slate). */
function useLeaderColor() {
  const { project, colors } = useProject();
  return useMemo(() => {
    const byName = new Map(project.competitors.map((c) => [c.name.toLowerCase(), colors[c.id] ?? OTHER_COLOR]));
    return (name: string) => byName.get(name.toLowerCase()) ?? OTHER_COLOR;
  }, [project.competitors, colors]);
}

// ---------------------------------------------------------------------------- overall + driver bars

function OverallCard({ d }: { d: Diagnosis }) {
  const { projectId } = useProject();
  const leading = d.drivers.filter((x) => x.score >= x.leaderScore).length;
  const trailing = d.drivers.filter((x) => x.score < x.leaderScore).sort((a, b) => a.score - a.leaderScore - (b.score - b.leaderScore));
  const worst = trailing[0];
  const gap = worst ? Math.round(worst.leaderScore - worst.score) : 0;
  return (
    <Card className="flex flex-col">
      <CardHeader title={P.overall.label} titleAddon={<InfoTip term={copy.glossary.metrics.diagnosisScore} />} />
      <div className="flex flex-1 flex-col items-center gap-5 px-4 pb-5 pt-4 sm:flex-row sm:items-center xl:flex-col xl:items-start 2xl:flex-row 2xl:items-center">
        <ScoreRing value={d.overall} size={128} label={P.overall.label} />
        <div className="min-w-0 space-y-2 text-sm">
          <p className="font-medium text-text">{plural(leading, P.summary.leadCount, { total: d.drivers.length })}</p>
          <p className="text-text-muted">
            {worst && gap > 0
              ? fmt(P.summary.biggestGap, { driver: copy.labels.driver[worst.id], gap, leader: worst.leaderName })
              : P.summary.noGap}
          </p>
        </div>
      </div>
      {trailing.length > 0 && (
        <div className="border-t border-border px-4 py-3">
          <h4 className="eyebrow mb-1">{P.summary.trailing}</h4>
          <ul>
            {trailing.map((x) => (
              <li key={x.id}>
                <Link
                  to={`/app/p/${projectId}/actions?driver=${x.id}`}
                  className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-[13px] text-text transition-colors hover:bg-surface-2"
                >
                  <span className="min-w-0 truncate">{copy.labels.driver[x.id]}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="hidden text-xs text-text-subtle sm:inline">{x.leaderName}</span>
                    <DeltaBadge delta={x.score - x.leaderScore} kind="score" />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <CardFooter className="mt-auto">
        <Link to={`/app/p/${projectId}/actions`} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
          {P.ctaActions}
          <ArrowRight size={12} strokeWidth={2} aria-hidden />
        </Link>
      </CardFooter>
    </Card>
  );
}

function DriversCard({ d, selected, onSelect }: { d: Diagnosis; selected: DriverId | null; onSelect: (id: DriverId) => void }) {
  const { project } = useProject();
  const leaderColor = useLeaderColor();
  return (
    <Card className="xl:col-span-2">
      <CardHeader title={P.sections.drivers} subtitle={P.driversBody} />
      <div className="px-2 pb-3 pt-3">
        <DriverBars
          brandName={project.name}
          leaderColor={leaderColor}
          selectedId={selected ?? undefined}
          items={d.drivers.map((x) => ({
            id: x.id,
            name: copy.labels.driver[x.id],
            score: x.score,
            leaderScore: x.leaderScore,
            leaderName: x.leaderName,
            onClick: () => onSelect(x.id),
          }))}
        />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------- driver detail cards

function DriverCard({ x, selected, className }: { x: DriverScore; selected: boolean; className?: string }) {
  const { projectId, project } = useProject();
  const leaderColor = useLeaderColor();
  const leads = x.score >= x.leaderScore;
  return (
    <Card id={`driver-${x.id}`} className={cn('flex scroll-mt-24 flex-col transition-shadow duration-160', selected && 'ring-2 ring-ring ring-offset-2 ring-offset-bg', className)}>
      <CardHeader
        title={copy.labels.driver[x.id]}
        titleAddon={<InfoTip term={GD[x.id]} />}
        actions={leads ? <Badge tone="success">{P.driver.youLead}</Badge> : <DeltaBadge delta={x.score - x.leaderScore} kind="score" />}
      />
      <div className="flex flex-1 flex-col gap-4 px-4 pb-4 pt-3">
        <div className="flex items-baseline gap-1">
          <span className="font-display font-heading text-2xl leading-8 tracking-[-0.012em] text-text-strong tnum">{score(x.score)}</span>
          <span className="font-mono text-sm text-text-muted">{copy.metrics.units.score}</span>
        </div>
        <div className="grid grid-cols-[6.5rem_1fr_2rem] items-center gap-x-2 gap-y-1.5 text-xs">
          <span className="truncate font-medium text-text">{P.driver.you}</span>
          <ProgressBar value={x.score / 100} color={BRAND_COLOR} label={`${project.name} ${copy.labels.driver[x.id]}`} />
          <span className="text-right font-mono text-text tnum">{score(x.score)}</span>
          <span className="flex min-w-0 items-center gap-1.5 text-text-muted" title={x.leaderName}>
            <Dot color={leaderColor(x.leaderName)} size={6} />
            <span className="truncate">{x.leaderName}</span>
          </span>
          <ProgressBar value={x.leaderScore / 100} color={leaderColor(x.leaderName)} label={`${x.leaderName} ${copy.labels.driver[x.id]}`} />
          <span className="text-right font-mono text-text-muted tnum">{score(x.leaderScore)}</span>
        </div>
        <p className="text-[13px] leading-5 text-text-muted">{x.explanation}</p>
        {x.evidence.length > 0 && (
          <div>
            <h4 className="eyebrow mb-1.5">{P.driver.evidence}</h4>
            <ul className="space-y-1.5 text-[13px] leading-5 text-text">
              {x.evidence.map((e, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden className="mt-[7px] size-1 shrink-0 rounded-xs bg-text-subtle" />
                  <span className="min-w-0">{e}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
      <CardFooter className="mt-auto">
        <Link to={`/app/p/${projectId}/actions?driver=${x.id}`} className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
          {P.driver.actions}
          <ArrowRight size={12} strokeWidth={2} aria-hidden />
        </Link>
      </CardFooter>
    </Card>
  );
}

// ---------------------------------------------------------------------------- by engine

function ByEngineCard({ d }: { d: Diagnosis }) {
  const byEngine = useMemo(() => new Map(d.byEngine.map((e) => [e.engine, e.drivers])), [d.byEngine]);
  return (
    <Card>
      <CardHeader title={P.sections.byEngine} subtitle={P.byEngineBody} titleAddon={<InfoTip term={copy.glossary.metrics.diagnosisScore} />} />
      <div className="p-4 pt-3">
        {d.byEngine.length === 0 ? (
          <p className="py-6 text-center text-[13px] text-text-subtle">{P.empty.body}</p>
        ) : (
          <HeatmapGrid
            rowHeader={P.engineColumn}
            rowLabelWidth={140}
            rows={d.byEngine.map((e) => ({ key: e.engine, label: <EngineBadge engine={e.engine} size="sm" />, text: ENGINES[e.engine].name }))}
            columns={d.drivers.map((x) => ({ key: x.id, label: copy.labels.driver[x.id], text: copy.labels.driver[x.id] }))}
            getValue={(row, col) => {
              const v = byEngine.get(row as EngineId)?.[col as DriverId];
              return v == null ? null : v / 100;
            }}
            format={(v) => score(v * 100)}
            legend={false}
          />
        )}
        {d.byEngine.length > 0 && <HeatLegend low="0" high="100" className="mt-3" />}
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------- lost prompts

type Lost = Diagnosis['lostPrompts'][number];

function LostPromptsCard({ d, onDraft, pendingKey }: { d: Diagnosis; onDraft: (l: Lost) => void; pendingKey: string | null }) {
  const { projectId } = useProject();
  const leaderColor = useLeaderColor();
  const C = P.lostColumns;
  const { rows, sortProps } = useSort(
    d.lostPrompts,
    { prompt: (l) => l.text, winner: (l) => l.winner, theirs: (l) => l.winnerVisibility, yours: (l) => l.brandVisibility, gap: (l) => l.winnerVisibility - l.brandVisibility },
    { key: 'gap', dir: 'desc' },
  );
  return (
    <Card className="flex flex-col">
      <CardHeader
        title={P.sections.lostPrompts}
        titleAddon={<InfoTip term={copy.glossary.concepts.lostPrompt} />}
        subtitle={P.sections.lostPromptsBody}
        actions={d.lostPrompts.length > 0 && <Badge tone="neutral">{d.lostPrompts.length}</Badge>}
      />
      <div className="mt-3">
        <Table aria-label={P.sections.lostPrompts} maxHeight={520}>
          <THead>
            <tr>
              <Th {...sortProps('prompt', 'asc')}>{C.prompt}</Th>
              <Th {...sortProps('winner', 'asc')}>{C.winner}</Th>
              <Th num {...sortProps('theirs')}>
                {C.winnerVisibility}
              </Th>
              <Th num {...sortProps('yours')}>
                {C.brandVisibility}
              </Th>
              <Th className="w-0">
                <span className="sr-only">{P.draftComparison}</span>
              </Th>
            </tr>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={5}>{P.lostEmpty}</TableEmpty>
            ) : (
              rows.map((l) => (
                <Tr key={l.promptId}>
                  <Td className="max-w-[36rem]">
                    <Link
                      to={`/app/p/${projectId}/responses?prompt=${encodeURIComponent(l.promptId)}`}
                      className="line-clamp-2 text-text hover:text-accent hover:underline"
                      title={`${P.viewAnswers}: ${l.text}`}
                    >
                      {l.text}
                    </Link>
                  </Td>
                  <Td>
                    <span className="flex min-w-0 items-center gap-2 whitespace-nowrap">
                      <Dot color={leaderColor(l.winner)} />
                      <span className="truncate font-medium">{l.winner}</span>
                    </span>
                  </Td>
                  <Td num>{pct(l.winnerVisibility)}</Td>
                  <Td num className="text-text-muted">
                    {pct(l.brandVisibility)}
                  </Td>
                  <Td className="whitespace-nowrap text-right">
                    <Button size="sm" icon={Columns2} loading={pendingKey === `lost:${l.promptId}`} disabled={!!pendingKey} onClick={() => onDraft(l)}>
                      {P.draftComparison}
                    </Button>
                  </Td>
                </Tr>
              ))
            )}
          </TBody>
        </Table>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------- states

function NoDiagnosis() {
  const { projectId } = useProject();
  const start = useStartRun(projectId);
  const { run } = useActiveRun(projectId);
  const toast = useToast();
  return (
    <EmptyState
      bordered
      size="lg"
      illustration={<EmptyNoData width={180} />}
      title={P.empty.title}
      body={P.empty.body}
      action={
        <Button
          variant="primary"
          icon={Play}
          loading={(!!run && !isWaitingOnBatch(run)) || start.isPending}
          disabled={isWaitingOnBatch(run)}
          onClick={() => start.mutate({}, { onError: (e) => toast.error(copy.app.runCheck.failed, errorMessage(e)) })}
        >
          {P.empty.cta}
        </Button>
      }
    />
  );
}

function DiagnoseSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label={fmt(copy.app.loading.page, { page: P.title })}>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <SkeletonCard height={200} />
        <SkeletonCard height={200} className="xl:col-span-2" />
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <SkeletonCard height={220} />
        <SkeletonCard height={220} />
        <SkeletonCard height={220} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------- page

export default function DiagnosePage() {
  const { projectId, project } = useProject();
  const { days } = useFilters();
  const q = useDiagnosis(projectId, { days });
  const agent = useDraftAgent(projectId);
  const [selected, setSelected] = useState<DriverId | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const d = q.data;

  const select = (id: DriverId) => {
    setSelected(id);
    document.getElementById(`driver-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setSelected(null), 2400);
  };

  const draftComparison = (l: Lost) => {
    const competitorId = l.winnerId ?? project.competitors.find((c) => c.name.toLowerCase() === l.winner.toLowerCase())?.id;
    agent.draft({ kind: 'comparison_page', params: { ...(competitorId ? { competitorId } : { competitor: l.winner }), promptIds: l.promptId } }, `lost:${l.promptId}`);
  };

  // Drivers come back as zeros before the first check; per-engine scores only exist once answers do.
  const hasData = !!d && d.drivers.length > 0 && d.byEngine.length > 0;

  return (
    <Page>
      <PageHeader
        title={P.title}
        subtitle={P.subtitle}
        className="mb-0"
        actions={
          hasData && (
            <ButtonLink to={`/app/p/${projectId}/actions`} iconRight={ArrowRight}>
              {P.ctaActions}
            </ButtonLink>
          )
        }
      />
      {q.isLoading ? (
        <DiagnoseSkeleton />
      ) : q.isError || !d ? (
        <ErrorState bordered title={copy.app.errors.generic.title} error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : !hasData ? (
        <NoDiagnosis />
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <OverallCard d={d} />
            <DriversCard d={d} selected={selected} onSelect={select} />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-6">
            {d.drivers.map((x, i) => (
              <DriverCard key={x.id} x={x} selected={selected === x.id} className={cn(i < 3 ? 'xl:col-span-2' : 'xl:col-span-3', i === 4 && d.drivers.length === 5 && 'md:col-span-2 xl:col-span-3')} />
            ))}
          </div>
          <LostPromptsCard d={d} onDraft={draftComparison} pendingKey={agent.pendingKey} />
          <ByEngineCard d={d} />
        </div>
      )}
      <DraftDrawer {...agent.drawerProps} />
    </Page>
  );
}
