import { Link, useNavigate } from 'react-router';
import { ArrowRight, FlaskConical, Plus } from 'lucide-react';
import type { Project } from '@shared/types';
import { EmptyNoData } from '@/components/art';
import { Sparkline } from '@/components/charts';
import { Badge, Button, ButtonLink, Card, DeltaBadge, EngineMark, ErrorState, Page, PageHeader, Skeleton, Tooltip, useToast } from '@/components/ui';
import { copy, fmt, plural } from '@/content/copy';
import { errorMessage, useProjects, useSeedDemo } from '@/lib/api';
import { relativeTime, score } from '@/lib/format';

const P = copy.pages.projects;

/** "Open demo project": seeds the demo (replacing any old one) and opens its overview. */
function DemoButton({ variant = 'secondary', size = 'md' }: { variant?: 'primary' | 'secondary'; size?: 'md' | 'lg' }) {
  const seed = useSeedDemo();
  const navigate = useNavigate();
  const toast = useToast();
  return (
    <Button
      variant={variant}
      size={size}
      icon={FlaskConical}
      loading={seed.isPending}
      onClick={() =>
        seed.mutate(undefined, {
          onSuccess: (p) => {
            toast.success(P.demoReady);
            navigate(`/app/p/${p.id}/overview`);
          },
          onError: (e) => toast.error(copy.app.errors.generic.title, errorMessage(e)),
        })
      }
    >
      {seed.isPending ? P.seedingDemo : P.openDemo}
    </Button>
  );
}

function ProjectCard({ project }: { project: Project }) {
  // Last 30 days, all engines (the numbers the overview opens with), summarised by GET /projects.
  const summary = project.summary;
  const hasAnswers = summary?.visibilityScore != null;
  const trend = summary?.trend;
  const c = P.card;
  return (
    <Card as="article" interactive className="relative flex flex-col">
      <div className="flex items-start gap-3 p-4 pb-0">
        <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary-soft font-display text-base font-semibold text-accent-ink">
          {project.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="truncate text-base font-semibold text-text">
              <Link to={`/app/p/${project.id}/overview`} className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-ring">
                {project.name}
              </Link>
            </h2>
            {project.isDemo && (
              <Tooltip content={copy.app.badges.demoTooltip} triggerClassName="relative z-[1]">
                <Badge tone="neutral">{copy.app.badges.demo}</Badge>
              </Tooltip>
            )}
          </div>
          <p className="truncate font-mono text-xs text-text-subtle">{project.domain}</p>
        </div>
        <ArrowRight size={16} strokeWidth={1.75} aria-hidden className="mt-1 shrink-0 text-text-subtle" />
      </div>

      <div className="flex items-end justify-between gap-4 px-4 pb-4 pt-5">
        <div>
          <div className="eyebrow">{copy.metrics.visibilityScore}</div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="font-display font-heading text-2xl leading-8 tracking-[-0.012em] text-text-strong tnum">{hasAnswers ? score(summary?.visibilityScore) : '—'}</span>
            {hasAnswers && <span className="font-mono text-sm text-text-muted">{copy.metrics.units.score}</span>}
            {hasAnswers && <DeltaBadge delta={summary?.delta} kind="score" />}
          </div>
        </div>
        {trend && trend.length > 0 && hasAnswers && <Sparkline values={trend} width={96} height={32} domain={[0, 1]} area label={`${copy.metrics.visibility} trend`} />}
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border px-4 py-3 text-xs text-text-subtle">
        <span className="flex items-center gap-2">
          <span className="flex items-center -space-x-0.5" aria-label={project.engines.join(', ')}>
            {project.engines.map((e) => (
              <EngineMark key={e} engine={e} size={14} className="rounded-sm ring-2 ring-surface" />
            ))}
          </span>
          <span>
            {plural(project.promptCount, c.prompts)} · {plural(project.competitors.length, c.competitors)}
          </span>
        </span>
        <span>{project.lastRunAt ? fmt(c.lastRun, { time: relativeTime(project.lastRunAt) }) : c.neverRun}</span>
      </div>
    </Card>
  );
}

export default function ProjectsPage() {
  const projects = useProjects();
  const list = projects.data ?? [];
  const hasDemo = list.some((p) => p.isDemo);

  const actions = (
    <>
      {list.length > 0 && !hasDemo && <DemoButton />}
      <ButtonLink to="/app/new" variant="primary" icon={Plus}>
        {P.newProject}
      </ButtonLink>
    </>
  );

  return (
    <Page className="max-w-6xl">
      <PageHeader title={P.title} subtitle={P.subtitle} actions={list.length > 0 ? actions : undefined} />

      {projects.isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3" aria-busy="true">
          {Array.from({ length: 3 }, (_, i) => (
            <Skeleton key={i} className="h-[196px] rounded-lg" />
          ))}
        </div>
      ) : projects.isError ? (
        <ErrorState bordered title={copy.app.errors.generic.title} error={projects.error} onRetry={() => void projects.refetch()} retrying={projects.isFetching} />
      ) : list.length === 0 ? (
        <Card className="overflow-hidden">
          <div className="flex flex-col items-center px-6 py-14 text-center sm:py-20">
            <EmptyNoData width={200} />
            <h2 className="mt-6 font-display font-heading text-2xl tracking-[-0.012em] text-text-strong">{P.empty.title}</h2>
            <p className="mt-2 max-w-md text-sm text-text-muted">{P.empty.body}</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              <DemoButton variant="primary" size="lg" />
              <ButtonLink to="/app/new" size="lg" icon={Plus}>
                {P.empty.cta}
              </ButtonLink>
            </div>
            <p className="mt-4 text-xs text-text-subtle">{copy.landing.hero.note}</p>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      )}
    </Page>
  );
}
