// AI traffic: people who click through from AI answers (referrer / utm_source). Period filter only.
import { useMemo } from 'react';
import { Link } from 'react-router';
import { ArrowRight, Code2 } from 'lucide-react';
import type { ReferralOverview } from '@shared/types';
import { EmptyTraffic } from '@/components/art';
import { BarList, ChartLegend, StackedAreaChart, type SeriesDef } from '@/components/charts';
import { useProject } from '@/components/layout';
import {
  ButtonLink,
  Card,
  CardHeader,
  Dot,
  EmptyState,
  ErrorState,
  InfoTip,
  KpiCard,
  Page,
  PageHeader,
  SkeletonCard,
  StatGrid,
  Table,
  TableEmpty,
  TBody,
  Td,
  Th,
  THead,
  Tr,
  useSort,
} from '@/components/ui';
import { copy, fmt } from '@/content/copy';
import { useReferralOverview } from '@/lib/api';
import { cn } from '@/lib/cn';
import { OTHER_COLOR } from '@/lib/colors';
import { engineColor, isEngineId } from '@/lib/engines';
import { useFilters } from '@/lib/filters';
import { compact, num, pct } from '@/lib/format';

const P = copy.pages.traffic;
/** Assistants that aren't tracked engines get the remaining non-brand slots, then slate. */
const EXTRA_SLOTS = ['var(--color-chart-8)', 'var(--color-chart-other)'];

/** Source id → color: tracked engines keep their engine-series color (BRAND §7.1). */
function useSourceColors(ov: ReferralOverview | undefined) {
  return useMemo(() => {
    const map: Record<string, string> = {};
    let extra = 0;
    for (const s of ov?.bySource ?? []) map[s.sourceId] = isEngineId(s.sourceId) ? engineColor(s.sourceId) : (EXTRA_SLOTS[extra++] ?? OTHER_COLOR);
    return map;
  }, [ov?.bySource]);
}

function KpiRow({ ov, days }: { ov: ReferralOverview; days: number }) {
  const t = ov.totals;
  const vs = (d: number | null) => (d == null ? copy.filters.noPrior : fmt(copy.filters.vsPrior, { days }));
  const ids = ov.bySource.map((s) => s.sourceId);
  const trend = ov.trend.map((r) => {
    const vals = ids.map((k) => r[k]).filter((v): v is number => typeof v === 'number');
    return vals.length ? vals.reduce((a, b) => a + b, 0) : null;
  });
  return (
    <StatGrid cols={{ base: 1, sm: 3 }}>
      <KpiCard label={P.kpis.visits} info={copy.glossary.site.aiReferral} value={compact(t.visits.value)} delta={t.visits.delta} deltaKind="count" comparison={vs(t.visits.delta)} trend={trend} trendColor="var(--color-chart-other)" />
      <KpiCard label={P.kpis.sources} value={num(t.sources.value)} delta={t.sources.delta} deltaKind="count" comparison={vs(t.sources.delta)} />
      <KpiCard label={P.kpis.landingPages} value={num(t.landingPages.value)} delta={t.landingPages.delta} deltaKind="count" comparison={vs(t.landingPages.delta)} />
    </StatGrid>
  );
}

function LandingPages({ ov, colors }: { ov: ReferralOverview; colors: Record<string, string> }) {
  const C = P.columns;
  const idByName = new Map(ov.bySource.map((s) => [s.name, s.sourceId]));
  const { rows, sortProps } = useSort(ov.topLandingPages, { path: (p) => p.path, visits: (p) => p.visits, top: (p) => p.topSource }, { key: 'visits', dir: 'desc' });
  return (
    <Card className="xl:col-span-2">
      <CardHeader
        title={P.sections.topLandingPages}
        subtitle={
          ov.topLandingPages.length < ov.totals.landingPages.value
            ? `${P.landingBody} ${fmt(copy.pages.crawlers.topPagesOf, { shown: num(ov.topLandingPages.length), total: num(ov.totals.landingPages.value) })}`
            : P.landingBody
        }
      />
      <div className="mt-3">
        <Table aria-label={P.sections.topLandingPages} maxHeight={520}>
          <THead>
            <tr>
              <Th {...sortProps('path', 'asc')}>{C.path}</Th>
              <Th num {...sortProps('visits')}>
                {C.visits}
              </Th>
              <Th num className="hidden sm:table-cell">
                {C.share}
              </Th>
              <Th {...sortProps('top', 'asc')}>{C.topSource}</Th>
            </tr>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={4}>{P.empty.title}</TableEmpty>
            ) : (
              rows.map((p) => (
                <Tr key={p.path}>
                  <Td className="max-w-[20rem] font-mono text-[12.5px]">
                    <span className="block truncate" title={p.path}>
                      {p.path}
                    </span>
                  </Td>
                  <Td num>{num(p.visits)}</Td>
                  <Td num muted className="hidden sm:table-cell">
                    {pct(ov.totals.visits.value ? p.visits / ov.totals.visits.value : null)}
                  </Td>
                  <Td className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-2">
                      <Dot color={colors[idByName.get(p.topSource) ?? ''] ?? OTHER_COLOR} />
                      {p.topSource}
                    </span>
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

export default function TrafficPage() {
  const { projectId } = useProject();
  const { days } = useFilters();
  const q = useReferralOverview(projectId, { days });
  const ov = q.data;
  const colors = useSourceColors(ov);
  const series: SeriesDef[] = useMemo(
    () => (ov?.bySource ?? []).map((s) => ({ key: s.sourceId, name: s.name, color: colors[s.sourceId] ?? OTHER_COLOR })),
    [ov?.bySource, colors],
  );
  const empty = ov && ov.totals.visits.value === 0 && ov.bySource.length === 0;

  return (
    <Page>
      <PageHeader title={P.title} subtitle={P.subtitle} className="mb-0" />
      {q.isLoading ? (
        <div className="space-y-4" aria-busy="true">
          <StatGrid cols={{ base: 1, sm: 3 }}>
            {Array.from({ length: 3 }, (_, i) => (
              <KpiCard key={i} label=" " value="" loading />
            ))}
          </StatGrid>
          <SkeletonCard height={260} />
        </div>
      ) : q.isError || !ov ? (
        <ErrorState bordered title={copy.app.errors.generic.title} error={q.error} onRetry={() => void q.refetch()} retrying={q.isFetching} />
      ) : empty ? (
        <EmptyState
          bordered
          size="lg"
          illustration={<EmptyTraffic width={180} />}
          title={P.empty.title}
          body={P.empty.body}
          action={
            <ButtonLink to={`/app/p/${projectId}/integrations`} variant="primary" icon={Code2}>
              {P.empty.cta}
            </ButtonLink>
          }
        />
      ) : (
        <div className={cn('space-y-4 transition-opacity duration-160', q.isPlaceholderData && 'opacity-60')}>
          <KpiRow ov={ov} days={days} />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader title={P.sections.trend} titleAddon={<InfoTip term={copy.glossary.site.aiReferral} />} subtitle={P.trendBody} />
              <div className="px-4 pb-4 pt-3">
                <ChartLegend items={series} className="mb-3" />
                <StackedAreaChart data={ov.trend} series={series} legend={false} height={280} ariaLabel={`${P.sections.trend}: ${series.map((s) => s.name).join(', ')}`} />
              </div>
            </Card>
            <Card>
              <CardHeader title={P.sections.bySource} subtitle={fmt(copy.filters.range.lastDays, { days: ov.range.days })} />
              <div className="px-2 pb-3 pt-2">
                <BarList
                  labelHeader={P.columns.source}
                  valueHeader={P.columns.visits}
                  items={ov.bySource.map((s) => ({
                    key: s.sourceId,
                    label: s.name,
                    icon: <Dot color={colors[s.sourceId] ?? OTHER_COLOR} />,
                    value: s.visits,
                    display: num(s.visits),
                    meta: pct(s.share),
                    color: colors[s.sourceId],
                  }))}
                />
              </div>
            </Card>
          </div>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <LandingPages ov={ov} colors={colors} />
            <Card className="flex flex-col">
              <CardHeader title={P.howTitle} />
              <div className="flex flex-1 flex-col gap-3 p-4 text-[13px] leading-5 text-text-muted">
                <p>{copy.glossary.site.aiReferral.long}</p>
                <Link to={`/app/p/${projectId}/integrations`} className="mt-auto inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline">
                  {P.empty.cta}
                  <ArrowRight size={12} strokeWidth={2} aria-hidden />
                </Link>
              </div>
            </Card>
          </div>
        </div>
      )}
    </Page>
  );
}
