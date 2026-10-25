// Marketing landing (`/`): hero with the answer card, the shift, five modules (alternating, each with a
// small illustrative product vignette), how it works, stats, FAQ, final CTA, footer. Copy: copy.landing.
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import { AlertTriangle, ArrowRight, Check, CheckCircle2, ChevronDown, Download, FileText, Menu as MenuIcon, ShieldCheck, XCircle } from 'lucide-react';
import type { EngineId } from '@shared/types';
import { EngineGlyph, HeroAnswer, Logo, ModuleIcon, type ModuleIconName } from '@/components/art';
import { DriverBars, Sparkline } from '@/components/charts';
import { ThemeToggle } from '@/components/layout';
import { useQueryClient } from '@tanstack/react-query';
import { Badge, Button, ButtonLink, Dot, Menu, ScoreRing, useToast, type ButtonSize, type ButtonVariant } from '@/components/ui';
import { copy, fmt } from '@/content/copy';
import { api, errorMessage, qk, useSeedDemo } from '@/lib/api';
import { cn } from '@/lib/cn';
import { AGENT_CATEGORY_COLORS } from '@/lib/colors';
import { ENGINES } from '@/lib/engines';

const L = copy.landing;
const MODULES: { id: ModuleIconName; anchor: string }[] = [
  { id: 'monitor', anchor: 'monitor' },
  { id: 'diagnose', anchor: 'diagnose' },
  { id: 'act', anchor: 'act' },
  { id: 'crawlers', anchor: 'crawlers' },
  { id: 'readiness', anchor: 'readiness' },
];
const ENGINE_BY_NAME = Object.fromEntries(Object.values(ENGINES).map((e) => [e.name, e.id])) as Record<string, EngineId>;

// ---------------------------------------------------------------------------- "Open the demo"

/** Every "Open the demo" CTA goes straight into the demo project (one shared in-flight state). */
const DEMO_HREF = L.hero.primaryCta.href;
interface DemoCtx {
  open: () => void;
  /** Looking up or building the demo. */
  busy: boolean;
  /** Building a fresh demo (POST /demo/seed), which takes a moment. */
  seeding: boolean;
}
const DemoContext = createContext<DemoCtx>({ open: () => {}, busy: false, seeding: false });

/** Reuse the existing demo project if there is one (seeding replaces it), otherwise build it, then open its overview. */
function useDemoLauncher(): DemoCtx {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const seed = useSeedDemo();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const open = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    try {
      const projects = await qc.fetchQuery({ queryKey: qk.projects, queryFn: api.listProjects, staleTime: 10_000 });
      const demo = projects.find((p) => p.isDemo) ?? (await seed.mutateAsync());
      void navigate(`/app/p/${demo.id}/overview`);
    } catch (e) {
      toast.error(L.demoFailed, errorMessage(e));
      inFlight.current = false;
      setBusy(false);
    }
  }, [qc, seed, navigate, toast]);
  return useMemo(() => ({ open: () => void open(), busy, seeding: seed.isPending }), [open, busy, seed.isPending]);
}

function OpenDemoButton({ label, variant, size, arrow }: { label: string; variant: ButtonVariant; size?: ButtonSize; arrow?: boolean }) {
  const demo = useContext(DemoContext);
  return (
    <Button variant={variant} size={size} iconRight={arrow && !demo.busy ? ArrowRight : undefined} loading={demo.busy} onClick={demo.open}>
      {demo.seeding ? copy.pages.projects.seedingDemo : label}
    </Button>
  );
}

/** Same-page anchor or in-app route ("Open the demo" links go through the demo launcher). */
function SmartLink({ href, className, children }: { href: string; className?: string; children: ReactNode }) {
  const demo = useContext(DemoContext);
  if (href === DEMO_HREF)
    return (
      <button type="button" onClick={demo.open} disabled={demo.busy} className={cn(className, 'disabled:opacity-60')}>
        {demo.seeding ? copy.pages.projects.seedingDemo : children}
      </button>
    );
  return href.startsWith('#') ? (
    <a href={href} className={className}>
      {children}
    </a>
  ) : (
    <Link to={href} className={className}>
      {children}
    </Link>
  );
}

// ---------------------------------------------------------------------------- nav

function TopNav() {
  const demo = useContext(DemoContext);
  const navigate = useNavigate();
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const on = () => setScrolled(window.scrollY > 8);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  const links = [
    { href: '#monitor', label: L.nav.product },
    { href: '#how', label: L.nav.howItWorks },
    { href: '#faq', label: L.nav.faq },
  ];
  return (
    <header
      className={cn(
        'sticky top-0 z-40 border-b transition-colors duration-160',
        scrolled ? 'border-border bg-bg' : 'border-transparent bg-bg',
      )}
    >
      <nav aria-label={L.nav.label} className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-4 sm:px-6">
        <Link to="/" aria-label={copy.app.name} className="shrink-0 rounded-sm">
          <Logo size={24} title={null} />
        </Link>
        <ul className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <li key={l.href}>
              <a href={l.href} className="rounded-md px-2.5 py-1.5 text-sm font-medium text-text-muted transition-colors hover:bg-surface-2 hover:text-text">
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <ThemeToggle />
          <span className="hidden sm:inline-flex">
            <OpenDemoButton label={L.nav.cta} variant="ghost" />
          </span>
          {/* Below 360px the logo, theme toggle, this button and the menu don't fit one row: the button
              moves into the menu (the hero's own buttons sit right under the header). */}
          <ButtonLink to={L.hero.secondaryCta.href} variant="primary" className="max-[360px]:hidden">
            {L.hero.secondaryCta.label}
          </ButtonLink>
          <div className="md:hidden">
            <Menu
              label={L.nav.label}
              align="end"
              items={[
                ...links.map((l) => ({ key: l.href, label: l.label, onSelect: () => (window.location.hash = l.href) })),
                'separator' as const,
                { key: 'demo', label: demo.seeding ? copy.pages.projects.seedingDemo : L.nav.cta, icon: ArrowRight, disabled: demo.busy, onSelect: demo.open },
                { key: 'start', label: L.hero.secondaryCta.label, icon: ArrowRight, onSelect: () => navigate(L.hero.secondaryCta.href) },
              ]}
              trigger={(props) => (
                <button
                  {...props}
                  type="button"
                  aria-label={copy.nav.openMenu}
                  className="inline-flex size-8 items-center justify-center rounded-md text-text-muted hover:bg-surface-2 hover:text-text"
                >
                  <MenuIcon size={18} strokeWidth={1.75} aria-hidden />
                </button>
              )}
            />
          </div>
        </div>
      </nav>
    </header>
  );
}

// ---------------------------------------------------------------------------- hero + shift

function Hero() {
  const h = L.hero;
  return (
    <section aria-labelledby="hero-title" className="relative overflow-hidden">
      <div className="relative mx-auto grid grid-cols-1 max-w-6xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 md:pt-20 lg:grid-cols-[1.05fr_1fr] lg:gap-10 lg:pb-24">
        <div className="max-w-xl">
          <p className="eyebrow">{h.eyebrow}</p>
          <h1 id="hero-title" className="mt-4 font-display font-heading text-[40px] leading-[44px] tracking-[-0.012em] text-text-strong sm:text-[56px] sm:leading-[58px]">
            {h.headline}
          </h1>
          <p className="mt-5 text-base leading-7 text-text-muted sm:text-[17px]">{h.subhead}</p>
          <div className="mt-8 flex flex-wrap gap-2.5">
            <OpenDemoButton label={h.primaryCta.label} variant="primary" size="lg" arrow />
            <ButtonLink to={h.secondaryCta.href} size="lg">
              {h.secondaryCta.label}
            </ButtonLink>
          </div>
          <p className="mt-4 text-xs text-text-subtle">{h.note}</p>
        </div>
        <figure className="mx-auto w-full max-w-[560px] lg:mx-0 lg:justify-self-end">
          <HeroAnswer prompt={L.heroExample.prompt} />
          <figcaption className="mt-1 text-center text-xs text-text-subtle lg:text-left">{L.heroExample.caption}</figcaption>
        </figure>
      </div>
      <div className="relative border-y border-border bg-surface">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-5 sm:px-6 md:flex-row md:items-center md:gap-8">
          <p className="eyebrow shrink-0">{L.logos.label}</p>
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-2.5">
            {L.logos.engines.map((name) => (
              <li key={name} className="inline-flex items-center gap-2 text-sm font-medium text-text-muted">
                {ENGINE_BY_NAME[name] && <EngineGlyph engine={ENGINE_BY_NAME[name]} size={16} />}
                {name}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

function Shift() {
  const p = L.problem;
  return (
    <section aria-labelledby="shift-title" className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-28">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_1.4fr] lg:gap-16">
        <div>
          <p className="eyebrow">{p.eyebrow}</p>
          <h2 id="shift-title" className="mt-3 font-display font-heading text-3xl leading-9 tracking-[-0.006em] text-text-strong sm:text-4xl sm:leading-[44px]">
            {p.title}
          </h2>
          <p className="mt-4 text-base leading-7 text-text-muted">{p.body}</p>
        </div>
        <ol className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3 lg:grid-cols-1">
          {p.points.map((pt, i) => (
            <li key={pt.title} className="flex gap-4 bg-surface p-5 sm:flex-col lg:flex-row lg:items-baseline">
              <span className="font-mono text-sm text-text-subtle tnum">{String(i + 1).padStart(2, '0')}</span>
              <div>
                <h3 className="text-base font-semibold text-text">{pt.title}</h3>
                <p className="mt-1 text-sm leading-6 text-text-muted">{pt.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------- module vignettes (illustrative)

function Frame({ module, children }: { module: ModuleIconName; children: ReactNode }) {
  return (
    <figure className="relative">
      <div className="rounded-lg border border-border bg-surface p-5 sm:p-6">
        <div className="mb-5 flex items-center justify-between gap-3">
          <ModuleIcon module={module} size={40} />
          <span className="text-2xs font-medium text-text-subtle">{L.vignetteCaption}</span>
        </div>
        <div aria-hidden>{children}</div>
      </div>
    </figure>
  );
}

function MonitorVignette() {
  const rows: { id: EngineId; v: number }[] = [
    { id: 'chatgpt', v: 0.48 },
    { id: 'perplexity', v: 0.44 },
    { id: 'claude', v: 0.41 },
    { id: 'gemini', v: 0.29 },
  ];
  return (
    <div>
      <p className="eyebrow">{copy.metrics.visibilityScore}</p>
      <div className="mt-2 flex items-end justify-between gap-4">
        <div className="flex items-baseline gap-2">
          <span className="font-display font-heading text-4xl leading-10 tracking-[-0.012em] text-text-strong tnum">42</span>
          <span className="text-lg text-text-muted">/100</span>
          <span className="ml-1 inline-flex h-5 items-center rounded-sm border border-success/40 bg-success-soft px-1 font-mono text-2xs font-medium text-success">+6 pts</span>
        </div>
        <Sparkline values={[0.31, 0.33, 0.32, 0.35, 0.34, 0.38, 0.37, 0.4, 0.42]} width={112} height={36} domain={[0.25, 0.45]} area />
      </div>
      <ul className="mt-6 space-y-3">
        {rows.map((r) => (
          <li key={r.id} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-3 text-[13px]">
            <span className="inline-flex items-center gap-2 font-medium text-text">
              <EngineGlyph engine={r.id} size={14} />
              {ENGINES[r.id].name}
            </span>
            <span className="h-1.5 overflow-hidden rounded-xs bg-well">
              <span className="block h-full" style={{ width: `${r.v * 100 * 1.6}%`, background: ENGINES[r.id].color }} />
            </span>
            <span className="text-right font-mono text-text tnum">{Math.round(r.v * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DiagnoseVignette() {
  return (
    <DriverBars
      brandName={L.vignette.brand}
      leaderColor={() => 'var(--color-chart-2)'}
      items={[
        { id: 'content_coverage', name: copy.labels.driver.content_coverage, score: 62, leaderScore: 81, leaderName: L.vignette.rival },
        { id: 'source_authority', name: copy.labels.driver.source_authority, score: 38, leaderScore: 66, leaderName: L.vignette.rival },
        { id: 'technical_readiness', name: copy.labels.driver.technical_readiness, score: 74, leaderScore: 58, leaderName: L.vignette.rival },
      ]}
    />
  );
}

function ActVignette() {
  const E = copy.recommendations.drafts.editor;
  const lines = [`# ${L.vignette.brand}`, `> ${L.vignette.summary}`, '', '## Product', '- [Pricing](https://example.com/pricing): Plans and prices', '- [Docs](https://example.com/docs): Setup guides'];
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex size-7 items-center justify-center rounded-md bg-surface-2 text-text-muted">
          <FileText size={15} strokeWidth={1.75} />
        </span>
        <span className="text-sm font-semibold text-text">{copy.recommendations.drafts.kind.llms_txt}</span>
        <Badge tone="neutral">{copy.app.badges.draft}</Badge>
      </div>
      <pre className="mt-4 overflow-hidden rounded-lg border border-border bg-well p-3 font-mono text-[12px] leading-5 text-text">{lines.join('\n')}</pre>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border-strong bg-surface px-3 text-sm font-medium text-text-muted">
          <Download size={14} strokeWidth={1.75} />
          {fmt(E.download, { file: 'llms.txt' })}
        </span>
        <span className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-fg">
          <Check size={14} strokeWidth={2} />
          {E.approve}
        </span>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs text-text-muted">
        <ShieldCheck size={13} strokeWidth={1.75} className="text-text-subtle" />
        {copy.recommendations.humanInLoopShort}
      </p>
    </div>
  );
}

function CrawlersVignette() {
  const rows = [
    { name: 'GPTBot', op: 'OpenAI', cat: 'training' as const, pages: 212 },
    { name: 'ClaudeBot', op: 'Anthropic', cat: 'training' as const, pages: 148 },
    { name: 'PerplexityBot', op: 'Perplexity', cat: 'search' as const, pages: 96 },
    { name: 'ChatGPT-User', op: 'OpenAI', cat: 'user_fetch' as const, pages: 64 },
  ];
  return (
    <div>
      <div className="mb-2 flex justify-between text-xs font-medium text-text-muted">
        <span>{copy.pages.crawlers.columns.agent}</span>
        <span>{copy.pages.crawlers.kpis.pages}</span>
      </div>
      <ul className="divide-y divide-border border-y border-border">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center justify-between gap-3 py-2.5 text-[13px]">
            <span className="flex min-w-0 items-center gap-2">
              <Dot color={AGENT_CATEGORY_COLORS[r.cat]} />
              <span className="font-medium text-text">{r.name}</span>
              <span className="hidden truncate text-text-subtle sm:inline">
                {r.op} · {copy.labels.agentCategory[r.cat]}
              </span>
            </span>
            <span className="font-mono text-text tnum">{r.pages}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-[13px] text-warning">
        <AlertTriangle size={14} strokeWidth={1.75} className="mt-0.5 shrink-0" />
        {fmt(copy.pages.crawlers.alerts.neverReached, { agent: 'GPTBot', path: '/pricing' })}
      </p>
    </div>
  );
}

function ReadinessVignette() {
  const S = copy.glossary.site;
  const rows = [
    { label: S.robotsAiRules.term, status: 'pass' as const },
    { label: S.ssrContent.term, status: 'pass' as const },
    { label: S.structuredData.term, status: 'warn' as const },
    { label: S.llmsTxt.term, status: 'fail' as const },
  ];
  const ui = {
    pass: { icon: CheckCircle2, cls: 'text-success' },
    warn: { icon: AlertTriangle, cls: 'text-warning' },
    fail: { icon: XCircle, cls: 'text-danger' },
  };
  return (
    <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
      <ScoreRing value={66} tone="status" size={104} label={copy.pages.readiness.score} />
      <ul className="min-w-0 flex-1 space-y-2.5">
        {rows.map((r) => {
          const U = ui[r.status];
          return (
            <li key={r.label} className="flex items-center justify-between gap-3 text-[13px]">
              <span className="flex min-w-0 items-center gap-2 text-text">
                <U.icon size={15} strokeWidth={1.75} className={cn('shrink-0', U.cls)} />
                <span className="truncate">{r.label}</span>
              </span>
              <span className={cn('shrink-0 text-2xs font-semibold', U.cls)}>{copy.labels.checkStatus[r.status]}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const VIGNETTES: Record<ModuleIconName, () => ReactNode> = {
  monitor: MonitorVignette,
  diagnose: DiagnoseVignette,
  act: ActVignette,
  crawlers: CrawlersVignette,
  readiness: ReadinessVignette,
};

function ModuleSection({ id, anchor, index }: { id: ModuleIconName; anchor: string; index: number }) {
  const m = L.modules[id];
  const Vignette = VIGNETTES[id];
  const flip = index % 2 === 1;
  // Some proof lines repeat a bullet word for word; show each line once.
  const norm = (t: string) => t.trim().replace(/\.$/, '').toLowerCase();
  const showProof = !m.bullets.some((b) => norm(b) === norm(m.proof));
  return (
    <section id={anchor} aria-labelledby={`${anchor}-title`} className="scroll-mt-20">
      <div className="mx-auto grid grid-cols-1 max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 md:py-20 lg:grid-cols-2 lg:gap-16">
        <div className={cn('max-w-xl', flip && 'lg:order-2')}>
          <p className="eyebrow flex items-center gap-2">
            <span className="font-mono text-accent tnum">{String(index + 1).padStart(2, '0')}</span>
            <span aria-hidden className="h-px w-6 bg-border-strong" />
            <span>{m.eyebrow}</span>
          </p>
          <h2 id={`${anchor}-title`} className="mt-3 font-display font-heading text-3xl leading-9 tracking-[-0.006em] text-text-strong sm:text-[34px] sm:leading-[42px]">
            {m.title}
          </h2>
          <p className="mt-4 text-base leading-7 text-text-muted">{m.body}</p>
          <ul className="mt-6 space-y-2.5">
            {m.bullets.map((b) => (
              <li key={b} className="flex gap-2.5 text-[15px] leading-6 text-text">
                <Check size={18} strokeWidth={2} aria-hidden className="mt-[3px] shrink-0 text-accent" />
                {b}
              </li>
            ))}
          </ul>
          {showProof && <p className="mt-6 border-l-2 border-accent pl-3 font-mono text-[13px] leading-5 text-text-muted">{m.proof}</p>}
        </div>
        <div className={cn(flip && 'lg:order-1')}>
          <Frame module={id}>
            <Vignette />
          </Frame>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------- how / stats / faq / cta / footer

function HowItWorks() {
  const h = L.howItWorks;
  return (
    <section id="how" aria-labelledby="how-title" className="scroll-mt-20 border-y border-border bg-surface">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 md:py-24">
        <p className="eyebrow">{h.eyebrow}</p>
        <h2 id="how-title" className="mt-3 max-w-xl font-display font-heading text-3xl leading-9 tracking-[-0.006em] text-text-strong sm:text-4xl sm:leading-[44px]">
          {h.title}
        </h2>
        <ol className="mt-12 grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-6">
          {h.steps.map((s, i) => (
            <li key={s.title} className="relative">
              <div className="flex items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-sm border border-border-strong bg-bg font-mono text-sm font-medium text-text tnum">{i + 1}</span>
                {i < h.steps.length - 1 && <span aria-hidden className="hidden h-px flex-1 bg-border-strong md:block" />}
              </div>
              <h3 className="mt-5 text-lg font-semibold text-text">{s.title}</h3>
              <p className="mt-2 text-sm leading-6 text-text-muted">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function Stats() {
  return (
    <section aria-label={L.statsLabel} className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-20">
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-4">
        {L.stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-2 bg-surface px-5 py-6 sm:px-6 sm:py-8">
            <dt className="order-2 text-sm leading-5 text-text-muted">{s.label}</dt>
            <dd className="order-1 font-display font-heading text-4xl tracking-[-0.012em] text-text-strong tnum sm:text-5xl">{s.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <li className="border-b border-border">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={`${id}-panel`}
          id={`${id}-btn`}
          onClick={() => setOpen((v) => !v)}
          className="flex w-full items-center justify-between gap-6 py-5 text-left text-base font-semibold text-text transition-colors hover:text-accent"
        >
          {q}
          <ChevronDown size={18} strokeWidth={1.75} aria-hidden className={cn('shrink-0 text-text-subtle transition-transform duration-160', open && 'rotate-180')} />
        </button>
      </h3>
      <div id={`${id}-panel`} role="region" aria-labelledby={`${id}-btn`} hidden={!open} className="pb-6 pr-10">
        <p className="max-w-[68ch] text-[15px] leading-7 text-text-muted">{a}</p>
      </div>
    </li>
  );
}

function Faq() {
  return (
    <section id="faq" aria-labelledby="faq-title" className="scroll-mt-20 mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_2fr] lg:gap-16">
        <div>
          <p className="eyebrow">{L.nav.faq}</p>
          <h2 id="faq-title" className="mt-3 font-display font-heading text-3xl leading-9 tracking-[-0.006em] text-text-strong sm:text-4xl sm:leading-[44px]">
            {L.faq.title}
          </h2>
        </div>
        <ul className="border-t border-border">
          {L.faq.items.map((f) => (
            <FaqItem key={f.q} q={f.q} a={f.a} />
          ))}
        </ul>
      </div>
    </section>
  );
}

function FinalCta() {
  const f = L.finalCta;
  return (
    <section aria-labelledby="cta-title" className="mx-auto max-w-6xl px-4 pb-20 sm:px-6 md:pb-28">
      <div className="relative overflow-hidden rounded-lg border border-border bg-surface px-6 py-14 text-center sm:px-12 md:py-20">
        <h2 id="cta-title" className="relative mx-auto max-w-2xl font-display font-heading text-[34px] leading-[40px] tracking-[-0.012em] text-text-strong sm:text-5xl sm:leading-[52px]">
          {f.title}
        </h2>
        <p className="relative mx-auto mt-4 max-w-lg text-base leading-7 text-text-muted">{f.body}</p>
        <div className="relative mt-8 flex flex-wrap justify-center gap-2.5">
          <OpenDemoButton label={f.primaryCta.label} variant="primary" size="lg" arrow />
          <ButtonLink to={f.secondaryCta.href} size="lg">
            {f.secondaryCta.label}
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const f = L.footer;
  const cols = [f.columns.product, f.columns.start];
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto grid grid-cols-1 max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-[1.5fr_1fr_1fr]">
        <div>
          <Logo size={22} />
          <p className="mt-3 text-sm text-text-muted">{f.tagline}</p>
        </div>
        {cols.map((c) => (
          <nav key={c.title} aria-label={c.title}>
            <h2 className="eyebrow">{c.title}</h2>
            <ul className="mt-3 space-y-2">
              {c.links.map((l) => (
                <li key={l.label}>
                  <SmartLink href={l.href} className="text-sm text-text-muted transition-colors hover:text-text">
                    {l.label}
                  </SmartLink>
                </li>
              ))}
            </ul>
          </nav>
        ))}
      </div>
      <div className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-6 text-xs text-text-subtle sm:px-6 md:flex-row md:items-center md:justify-between">
          <p>{f.disclaimer}</p>
          <p className="shrink-0">{fmt(f.copyright, { year: new Date().getFullYear() })}</p>
        </div>
      </div>
    </footer>
  );
}

// ---------------------------------------------------------------------------- page

export default function LandingPage() {
  const demo = useDemoLauncher();
  useEffect(() => {
    document.title = L.meta.title;
    const meta = document.querySelector('meta[name="description"]');
    const prev = meta?.getAttribute('content') ?? null;
    meta?.setAttribute('content', L.meta.description);
    return () => {
      if (meta && prev != null) meta.setAttribute('content', prev);
    };
  }, []);
  return (
    <DemoContext.Provider value={demo}>
      <div className="min-h-dvh bg-bg text-text">
        <a
          href="#content"
          className="sr-only z-50 rounded-md bg-surface px-3 py-2 text-sm font-medium text-text shadow-md focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
        >
          {copy.nav.skipToContent}
        </a>
        <TopNav />
        <main id="content">
          <Hero />
          <Shift />
          <div className="border-t border-border">
            {MODULES.map((m, i) => (
              <div key={m.id} className={cn(i > 0 && 'border-t border-border')}>
                <ModuleSection id={m.id} anchor={m.anchor} index={i} />
              </div>
            ))}
          </div>
          <HowItWorks />
          <Stats />
          <Faq />
          <FinalCta />
        </main>
        <Footer />
      </div>
    </DemoContext.Provider>
  );
}
