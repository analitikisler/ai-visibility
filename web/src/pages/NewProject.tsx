// Onboarding wizard: Brand → Competitors → Prompts → Engines & schedule → create + first check.
// Suggestions (POST /projects/suggest) prefill details, competitors and prompts; the person edits
// everything before anything is created.
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode, type RefObject } from 'react';
import { Link, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, ClipboardPaste, ExternalLink, Info, ListPlus, Plus, Trash2, XCircle } from 'lucide-react';
import type { EngineId, ProjectSuggestion, PromptIntent, PromptTier, Run, Schedule } from '@shared/types';
import { EmptyPrompts } from '@/components/art';
import { isDomain, normalizeDomain } from '@/components/competitors';
import { intentOptions, parsePromptLines, TierLabel, tierOptions, TIERS, withCompetitorPrompts } from '@/components/prompts';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  ChipsInput,
  IconButton,
  Input,
  ModeBadge,
  Page,
  PageHeader,
  ProgressBar,
  Select,
  Skeleton,
  Textarea,
  UnsavedChangesGuard,
  useToast,
} from '@/components/ui';
import { copy, fmt, plural } from '@/content/copy';
import { api, errorMessage, qk, useCreateProject, useEngines, useSuggestProject } from '@/lib/api';
import { cn } from '@/lib/cn';
import { ENGINE_IDS } from '@/lib/engines';

const O = copy.pages.onboarding;
const F = O.fields;
const E = O.editor;
const STEPS = ['brand', 'competitors', 'prompts', 'engines'] as const;
type StepKey = (typeof STEPS)[number];
const SCHEDULES: Schedule[] = ['daily', 'weekly', 'manual'];
const DEFAULT_ENGINES: EngineId[] = ['chatgpt', 'claude', 'gemini', 'perplexity'];
const MAX_COMPETITORS = 20;
const MAX_PROMPTS = 200;
const SOFT_PROMPT_LIMIT = 50;

interface CompetitorRow {
  key: number;
  name: string;
  domain: string;
}
interface PromptRow {
  key: number;
  text: string;
  tier: PromptTier;
  intent: PromptIntent;
  topic: string;
}

const lc = (s: string) => s.trim().toLowerCase();

// ---------------------------------------------------------------------------- stepper

function Stepper({ step, maxStep, onGo }: { step: number; maxStep: number; onGo: (i: number) => void }) {
  return (
    <nav aria-label={O.stepper.label}>
      <ol className="flex items-center gap-2">
        {STEPS.map((s, i) => {
          const done = i < step;
          const current = i === step;
          const reachable = i <= maxStep && !current;
          return (
            <li key={s} className={cn('flex min-w-0 items-center gap-2', current ? 'flex-[1.6]' : 'flex-1')}>
              <button
                type="button"
                disabled={!reachable}
                onClick={() => onGo(i)}
                aria-current={current ? 'step' : undefined}
                className={cn('group flex min-w-0 items-center gap-2 rounded-md py-1 text-left', reachable && 'hover:text-text')}
              >
                <span
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-sm border font-mono text-xs font-medium tnum transition-colors',
                    current && 'border-primary bg-primary text-primary-fg',
                    done && 'border-primary bg-primary-soft text-accent',
                    !current && !done && 'border-border-strong bg-surface text-text-subtle',
                  )}
                >
                  {done ? <Check size={12} strokeWidth={2.5} aria-hidden /> : i + 1}
                </span>
                <span className={cn('truncate text-[13px] font-medium', current ? 'text-text' : done ? 'text-text-muted' : 'text-text-subtle', !current && 'hidden sm:inline')}>
                  {O.steps[s].label}
                </span>
                <span className="sr-only">{done ? ` (${O.stepper.done})` : current ? ` (${O.stepper.current})` : ''}</span>
              </button>
              {i < STEPS.length - 1 && <span aria-hidden className={cn('h-px min-w-3 flex-1', done ? 'bg-primary' : 'bg-border-strong')} />}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function StepCard({ k, children, headingRef, aside }: { k: StepKey; children: ReactNode; headingRef: RefObject<HTMLHeadingElement | null>; aside?: ReactNode }) {
  const s = O.steps[k];
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-text outline-none">
            {s.title}
          </h2>
          <p className="mt-0.5 text-sm text-text-muted">{s.description}</p>
        </div>
        {aside}
      </div>
      <div className="px-5 py-5">{children}</div>
    </Card>
  );
}

function SuggestNote({ s }: { s: ProjectSuggestion }) {
  return (
    <p className="flex items-start gap-2 rounded-md bg-info-soft px-3 py-2 text-[13px] text-info" role="status">
      <Info size={14} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0" />
      <span>{s.mode === 'llm' ? O.suggest.llmNote : O.suggest.heuristicNote}</span>
    </p>
  );
}

// ---------------------------------------------------------------------------- page

export default function NewProjectPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const engines = useEngines();
  const suggest = useSuggestProject();
  const create = useCreateProject();

  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(0);
  const [showErrors, setShowErrors] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const seq = useRef(0);
  const nextKey = () => ++seq.current;

  // Step 1
  const [name, setName] = useState('');
  const [domain, setDomain] = useState('');
  const [description, setDescription] = useState('');
  const [industry, setIndustry] = useState('');
  const [aliases, setAliases] = useState<string[]>([]);
  const [market, setMarket] = useState('US');
  const [language, setLanguage] = useState('en');
  // Step 2–3
  const [competitors, setCompetitors] = useState<CompetitorRow[]>([]);
  const [prompts, setPrompts] = useState<PromptRow[]>([]);
  const touchedLists = useRef({ competitors: false, prompts: false });
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState('');
  const [pasteTier, setPasteTier] = useState<PromptTier>('core');
  const [pasteIntent, setPasteIntent] = useState<PromptIntent>('discovery');
  // Step 4
  const [picked, setPicked] = useState<EngineId[]>(DEFAULT_ENGINES);
  const [schedule, setSchedule] = useState<Schedule>('daily');
  const [runNow, setRunNow] = useState(true);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Set right before we navigate to the new project, so the leave guard lets that redirect through.
  const created = useRef(false);

  // Suggestions are tied to the name + domain they were made for.
  const [suggestion, setSuggestion] = useState<ProjectSuggestion | null>(null);
  const [suggestedFor, setSuggestedFor] = useState<string | null>(null);
  // The server's reason (e.g. "Can't fetch this site: private or reserved address") shows under the button.
  const [suggestError, setSuggestError] = useState<string | null>(null);
  const brandKey = `${lc(name)}|${normalizeDomain(domain)}`;

  // Move focus to the new step's heading (not on first render, where the name field has focus).
  const shownStep = useRef(step);
  useEffect(() => {
    if (shownStep.current === step) return;
    shownStep.current = step;
    headingRef.current?.focus();
  }, [step]);

  // ------------------------------------------------------------- validation
  const brandErrors = {
    name: name.trim() ? null : O.validation.nameRequired,
    domain: isDomain(domain) ? null : O.validation.domainInvalid,
  };
  const brandOk = !brandErrors.name && !brandErrors.domain;

  const competitorErrors = useMemo(() => {
    const seen = new Map<string, number>();
    return competitors.map((c) => {
      const n = lc(c.name);
      const nameErr = !n && c.domain.trim() ? E.competitorNameRequired : n && (seen.get(n) ?? 0) > 0 ? O.validation.duplicate : n && n === lc(name) ? copy.pages.competitors.manage.isBrand : null;
      if (n) seen.set(n, (seen.get(n) ?? 0) + 1);
      return { name: nameErr, domain: c.domain.trim() && !isDomain(c.domain) ? O.validation.domainInvalid : null };
    });
  }, [competitors, name]);
  const competitorsOk = competitorErrors.every((e) => !e.name && !e.domain);

  const promptErrors = useMemo(() => {
    const seen = new Set<string>();
    return prompts.map((p) => {
      const t = lc(p.text);
      if (!t) return null;
      if (t.length < 3) return E.promptTooShort;
      if (seen.has(t)) return O.validation.duplicate;
      seen.add(t);
      return null;
    });
  }, [prompts]);
  const filledPrompts = prompts.filter((p) => p.text.trim());
  const promptsOk = filledPrompts.length > 0 && promptErrors.every((e) => !e);
  const enginesOk = picked.length > 0;
  const stepOk = [brandOk, competitorsOk, promptsOk, enginesOk];

  // ------------------------------------------------------------- suggestions
  const applySuggestion = (s: ProjectSuggestion) => {
    setSuggestion(s);
    setIndustry((v) => v || s.industry);
    setDescription((v) => v || s.description);
    setAliases((v) => {
      const have = new Set([lc(name), ...v.map(lc)]);
      return [...v, ...s.aliases.filter((a) => a.trim() && !have.has(lc(a)))].slice(0, 20);
    });
    if (!touchedLists.current.competitors) setCompetitors(s.competitors.slice(0, MAX_COMPETITORS).map((c) => ({ key: nextKey(), name: c.name, domain: c.domain })));
    // Prompts follow from `suggestedPrompts` (below), so they can pick up the competitors entered in step 2.
  };
  const runSuggest = (opts: { quiet?: boolean } = {}) => {
    if (!brandOk) {
      setShowErrors(true);
      if (!opts.quiet) toast.toast({ tone: 'info', title: O.suggest.needsBrand });
      return;
    }
    const key = brandKey;
    setSuggestedFor(key);
    setSuggestError(null);
    suggest.mutate(
      { name: name.trim(), domain: normalizeDomain(domain), description: description.trim() || undefined },
      {
        onSuccess: (s) => applySuggestion(s),
        onError: (e) => {
          setSuggestedFor(null);
          setSuggestError(errorMessage(e));
          // In the background (leaving step 1) the inline note isn't on screen, so also say it in a toast.
          if (opts.quiet) toast.error(O.suggest.failed, errorMessage(e));
        },
      },
    );
  };
  const suggesting = suggest.isPending;
  const freshSuggestion = suggestion && suggestedFor === brandKey ? suggestion : null;

  // Suggested prompts = the endpoint's prompts + head-to-head prompts for the competitors entered in step 2
  // (the endpoint can't take competitors). Competitors count once the person has moved past step 2.
  const competitorNames = step >= 2 ? competitors.map((c) => c.name.trim()).filter(Boolean) : [];
  const competitorKey = competitorNames.join('\u0000').toLowerCase();
  const suggestedPrompts = useMemo(
    () => (suggestion ? withCompetitorPrompts(suggestion.prompts, name, competitorNames, MAX_PROMPTS) : []),
    // competitorKey stands in for competitorNames (a new array every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [suggestion, name, competitorKey],
  );
  // Fill (or refill) the prompt list from suggestions until the person edits it; never overwrite their edits.
  useEffect(() => {
    if (!suggestion || touchedLists.current.prompts) return;
    setPrompts(suggestedPrompts.map((p) => ({ key: nextKey(), text: p.text, tier: p.tier ?? 'core', intent: p.intent ?? 'discovery', topic: p.topic ?? '' })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestedPrompts]);

  // ------------------------------------------------------------- list editors
  const editCompetitors = (fn: (rows: CompetitorRow[]) => CompetitorRow[]) => {
    touchedLists.current.competitors = true;
    setCompetitors(fn);
  };
  const editPrompts = (fn: (rows: PromptRow[]) => PromptRow[]) => {
    touchedLists.current.prompts = true;
    setPrompts(fn);
  };
  const focusLast = (selector: string) =>
    window.setTimeout(() => {
      const els = document.querySelectorAll<HTMLInputElement>(selector);
      els[els.length - 1]?.focus();
    }, 0);
  const addCompetitor = () => {
    if (competitors.length >= MAX_COMPETITORS) return;
    editCompetitors((rows) => [...rows, { key: nextKey(), name: '', domain: '' }]);
    focusLast('[data-competitor-name]');
  };
  const missingSuggestedCompetitors = (freshSuggestion?.competitors ?? []).filter((c) => !competitors.some((r) => lc(r.name) === lc(c.name)));
  const addSuggestedCompetitors = (list: { name: string; domain: string }[]) =>
    editCompetitors((rows) => [...rows.filter((r) => r.name.trim() || r.domain.trim()), ...list.map((c) => ({ key: nextKey(), name: c.name, domain: c.domain }))].slice(0, MAX_COMPETITORS));

  const addPrompt = () => {
    if (prompts.length >= MAX_PROMPTS) return;
    editPrompts((rows) => [...rows, { key: nextKey(), text: '', tier: 'core', intent: 'discovery', topic: '' }]);
    focusLast('[data-prompt-text]');
  };
  const parsedPaste = useMemo(() => parsePromptLines(paste, prompts.map((p) => p.text)), [paste, prompts]);
  const addPasted = () => {
    const room = MAX_PROMPTS - filledPrompts.length;
    const texts = parsedPaste.texts.slice(0, room);
    editPrompts((rows) => [...rows.filter((r) => r.text.trim()), ...texts.map((t) => ({ key: nextKey(), text: t, tier: pasteTier, intent: pasteIntent, topic: '' }))]);
    if (parsedPaste.duplicates) toast.toast({ tone: 'info', title: plural(parsedPaste.duplicates, E.duplicatesSkipped) });
    setPaste('');
    setPasteOpen(false);
  };
  const missingSuggestedPrompts = (freshSuggestion ? suggestedPrompts : []).filter((p) => !prompts.some((r) => lc(r.text) === lc(p.text)));
  const addSuggestedPrompts = () =>
    editPrompts((rows) =>
      [
        ...rows.filter((r) => r.text.trim()),
        ...missingSuggestedPrompts.map((p) => ({ key: nextKey(), text: p.text, tier: p.tier ?? 'core', intent: p.intent ?? 'discovery', topic: p.topic ?? '' })),
      ].slice(0, MAX_PROMPTS),
    );
  const tierCounts = TIERS.map((t) => ({ tier: t, count: filledPrompts.filter((p) => p.tier === t).length }));

  // ------------------------------------------------------------- navigation
  const go = (i: number) => {
    setShowErrors(false);
    setStep(i);
    setMaxStep((m) => Math.max(m, i));
  };
  const focusFirstError = () => window.setTimeout(() => document.querySelector<HTMLElement>('form [aria-invalid="true"]')?.focus(), 0);
  const next = () => {
    if (!stepOk[step]) {
      setShowErrors(true);
      focusFirstError();
      return;
    }
    // Leaving step 1: fetch suggestions in the background if we don't have them for this brand yet.
    if (step === 0 && suggestedFor !== brandKey && !suggesting) runSuggest({ quiet: true });
    go(step + 1);
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (step < STEPS.length - 1) return next();
    const firstBad = stepOk.findIndex((ok) => !ok);
    if (firstBad >= 0) {
      go(firstBad);
      setShowErrors(true);
      return;
    }
    setSubmitError(null);
    create.mutate(
      {
        name: name.trim(),
        domain: normalizeDomain(domain),
        aliases,
        description: description.trim() || undefined,
        industry: industry.trim() || undefined,
        market: market.trim() || undefined,
        language,
        engines: ENGINE_IDS.filter((id) => picked.includes(id)),
        schedule,
        competitors: competitors.filter((c) => c.name.trim()).map((c) => ({ name: c.name.trim(), domain: c.domain.trim() ? normalizeDomain(c.domain) : '' })),
        prompts: filledPrompts.map((p) => ({ text: p.text.trim(), tier: p.tier, intent: p.intent, topic: p.topic.trim() || undefined })),
      },
      {
        onSuccess: async (project) => {
          if (runNow) {
            try {
              const run: Run = await api.startRun(project.id, {});
              // Seed the caches the shell polls so progress shows right away on the overview.
              qc.setQueryData(qk.run(run.id), run);
              qc.setQueryData<Run[]>(qk.runs(project.id), [run]);
              toast.success(fmt(E.created, { name: project.name }));
            } catch (err) {
              toast.toast({ tone: 'warning', title: E.checkFailed, description: errorMessage(err) });
            }
          } else toast.success(fmt(E.createdNoRun, { name: project.name }));
          created.current = true;
          navigate(`/app/p/${project.id}/overview`, { replace: true });
        },
        onError: (err) => setSubmitError(errorMessage(err)),
      },
    );
  };

  // ------------------------------------------------------------- steps
  const err = (v: string | null) => (showErrors ? v : null);

  const brandStep = (
    <StepCard k="brand" headingRef={headingRef}>
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Input
            label={F.name.label}
            placeholder={F.name.placeholder}
            hint={F.name.help}
            value={name}
            onChange={(e) => setName(e.target.value)}
            error={err(brandErrors.name)}
            required
            autoFocus
            maxLength={120}
            autoComplete="organization"
          />
          <Input
            label={F.domain.label}
            placeholder={F.domain.placeholder}
            hint={F.domain.help}
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            onBlur={() => domain.trim() && setDomain(normalizeDomain(domain))}
            error={err(brandErrors.domain)}
            required
            inputMode="url"
            spellCheck={false}
            autoComplete="url"
            className="font-mono"
          />
        </div>
        <Textarea
          label={
            <>
              {F.description.label} <span className="font-normal text-text-subtle">({copy.common.optional})</span>
            </>
          }
          placeholder={F.description.placeholder}
          hint={F.description.help}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          maxLength={2000}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button icon={ListPlus} onClick={() => runSuggest()} loading={suggesting}>
            {suggesting ? O.suggest.running : O.suggest.details}
          </Button>
          {!brandOk && <span className="text-xs text-text-subtle">{O.suggest.needsBrand}</span>}
        </div>
        {suggestError && !suggesting && (
          <p role="alert" className="flex items-start gap-2 rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">
            <XCircle size={14} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0" />
            <span>
              <span className="font-medium">{O.suggest.failed}</span> {suggestError}
            </span>
          </p>
        )}
        {freshSuggestion && <SuggestNote s={freshSuggestion} />}
        <div className="grid grid-cols-1 gap-4 border-t border-border pt-4 sm:grid-cols-2">
          <Input label={F.industry.label} placeholder={F.industry.placeholder} hint={F.industry.help} value={industry} onChange={(e) => setIndustry(e.target.value)} maxLength={120} />
          <ChipsInput label={F.aliases.label} placeholder={F.aliases.placeholder} hint={F.aliases.help} values={aliases} onChange={setAliases} />
          <Input label={F.market.label} placeholder={F.market.placeholder} hint={F.market.help} value={market} onChange={(e) => setMarket(e.target.value)} maxLength={40} />
          <Select<string>
            label={F.language.label}
            hint={F.language.help}
            value={language}
            onChange={setLanguage}
            options={Object.entries(O.languages).map(([value, label]) => ({ value, label }))}
          />
        </div>
      </div>
    </StepCard>
  );

  const competitorsStep = (
    <StepCard
      k="competitors"
      headingRef={headingRef}
      aside={freshSuggestion && freshSuggestion.competitors.length > 0 ? <Badge tone="info">{copy.labels.suggestionMode[freshSuggestion.mode]}</Badge> : undefined}
    >
      {suggesting && competitors.length === 0 ? (
        <div className="space-y-2" aria-busy="true">
          <p className="text-sm text-text-muted">{E.loadingCompetitors}</p>
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-2/3" />
        </div>
      ) : (
        <div className="space-y-4">
          {competitors.length === 0 ? (
            <p className="rounded-md border border-dashed border-border-strong px-4 py-6 text-center text-sm text-text-muted">
              {freshSuggestion && freshSuggestion.competitors.length === 0 ? E.noCompetitorSuggestions : O.competitors.empty}
            </p>
          ) : (
            <ul className="space-y-2">
              <li aria-hidden className="hidden grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] gap-2 px-0.5 text-xs font-medium text-text-muted sm:grid">
                <span>{F.competitorName.label}</span>
                <span>{F.competitorDomain.label}</span>
              </li>
              {competitors.map((c, i) => (
                <li key={c.key} className="grid grid-cols-[minmax(0,1fr)_2rem] items-start gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem]">
                  <Input
                    label={F.competitorName.label}
                    hideLabel
                    data-competitor-name
                    placeholder={F.competitorName.placeholder}
                    value={c.name}
                    onChange={(e) => editCompetitors((rows) => rows.map((r) => (r.key === c.key ? { ...r, name: e.target.value } : r)))}
                    error={err(competitorErrors[i]?.name ?? null)}
                    maxLength={120}
                  />
                  <Input
                    label={F.competitorDomain.label}
                    hideLabel
                    placeholder={F.competitorDomain.placeholder}
                    value={c.domain}
                    onChange={(e) => editCompetitors((rows) => rows.map((r) => (r.key === c.key ? { ...r, domain: e.target.value } : r)))}
                    onBlur={() => c.domain.trim() && editCompetitors((rows) => rows.map((r) => (r.key === c.key ? { ...r, domain: normalizeDomain(r.domain) } : r)))}
                    error={err(competitorErrors[i]?.domain ?? null)}
                    className="font-mono"
                    inputMode="url"
                    spellCheck={false}
                    wrapperClassName="col-start-1 sm:col-start-auto"
                  />
                  <IconButton
                    icon={Trash2}
                    label={fmt(O.competitors.remove, { name: c.name || F.competitorName.label })}
                    onClick={() => editCompetitors((rows) => rows.filter((r) => r.key !== c.key))}
                    className="row-start-1 sm:row-start-auto"
                  />
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-center gap-2">
            <Button icon={Plus} onClick={addCompetitor} disabled={competitors.length >= MAX_COMPETITORS}>
              {O.competitors.add}
            </Button>
            {missingSuggestedCompetitors.length > 0 && (
              <Button variant="ghost" icon={ListPlus} onClick={() => addSuggestedCompetitors(missingSuggestedCompetitors)}>
                {fmt(O.suggest.addAll, { count: missingSuggestedCompetitors.length })}
              </Button>
            )}
            {!freshSuggestion && !suggesting && brandOk && (
              <Button variant="ghost" icon={ListPlus} onClick={() => runSuggest()}>
                {O.suggest.competitors}
              </Button>
            )}
          </div>
          {competitors.filter((c) => c.name.trim()).length > 7 && <p className="text-xs text-text-subtle">{O.competitors.limitNote}</p>}
          {freshSuggestion && freshSuggestion.competitors.length > 0 && <SuggestNote s={freshSuggestion} />}
        </div>
      )}
    </StepCard>
  );

  const promptsStep = (
    <StepCard
      k="prompts"
      headingRef={headingRef}
      aside={
        filledPrompts.length > 0 ? (
          <p className="font-mono text-xs text-text-muted tnum" aria-live="polite">
            <span className="text-text">{plural(filledPrompts.length, E.total)}</span>
            {tierCounts.map((t) => (
              <span key={t.tier}> · {fmt(E.tierCount, { count: t.count, tier: copy.labels.tier[t.tier].toLowerCase() })}</span>
            ))}
          </p>
        ) : undefined
      }
    >
      {suggesting && prompts.length === 0 ? (
        <div className="space-y-2" aria-busy="true">
          <p className="text-sm text-text-muted">{E.loadingPrompts}</p>
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button icon={Plus} onClick={addPrompt} disabled={prompts.length >= MAX_PROMPTS}>
              {O.prompts.add}
            </Button>
            <Button icon={ClipboardPaste} onClick={() => setPasteOpen((v) => !v)} aria-expanded={pasteOpen}>
              {O.prompts.paste}
            </Button>
            {missingSuggestedPrompts.length > 0 && (
              <Button variant="ghost" icon={ListPlus} onClick={addSuggestedPrompts}>
                {fmt(O.suggest.addAll, { count: missingSuggestedPrompts.length })}
              </Button>
            )}
          </div>
          {pasteOpen && (
            <div className="space-y-3 rounded-md border border-border bg-surface-2 p-3">
              <Textarea
                label={O.prompts.paste}
                hint={O.prompts.pasteHelp}
                placeholder={E.pastePlaceholder}
                value={paste}
                onChange={(e) => setPaste(e.target.value)}
                rows={5}
                autoFocus
              />
              <div className="flex flex-wrap items-end gap-2">
                <Select<PromptTier> label={F.promptTier.label} size="sm" value={pasteTier} onChange={setPasteTier} options={tierOptions} wrapperClassName="w-36" />
                <Select<PromptIntent> label={F.promptIntent.label} size="sm" value={pasteIntent} onChange={setPasteIntent} options={intentOptions} wrapperClassName="w-36" />
                <span className="flex-1" />
                <Button variant="ghost" size="sm" onClick={() => setPasteOpen(false)}>
                  {copy.common.cancel}
                </Button>
                <Button size="sm" icon={Plus} onClick={addPasted} disabled={parsedPaste.texts.length === 0}>
                  {plural(parsedPaste.texts.length, E.addPasted)}
                </Button>
              </div>
            </div>
          )}
          {prompts.length === 0 ? (
            <div className="flex flex-col items-center rounded-md border border-dashed border-border-strong px-4 py-8 text-center">
              <EmptyPrompts width={120} />
              <h3 className="mt-4 text-base font-semibold text-text">{O.empty.title}</h3>
              <p className="mt-1 max-w-sm text-sm text-text-muted">{O.empty.body}</p>
              <Button className="mt-4" icon={ListPlus} onClick={() => runSuggest()} disabled={!brandOk}>
                {O.empty.cta}
              </Button>
            </div>
          ) : (
            <ul className="divide-y divide-border rounded-md border border-border">
              {prompts.map((p, i) => (
                <li key={p.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_2rem] gap-2 p-2.5 md:grid-cols-[minmax(0,1fr)_8.5rem_8.5rem_8rem_2rem] md:items-start">
                  <Input
                    label={F.promptText.label}
                    hideLabel
                    data-prompt-text
                    placeholder={F.promptText.placeholder}
                    value={p.text}
                    onChange={(e) => editPrompts((rows) => rows.map((r) => (r.key === p.key ? { ...r, text: e.target.value } : r)))}
                    error={err(promptErrors[i] ?? null)}
                    maxLength={500}
                    wrapperClassName="col-span-3 md:col-span-1"
                  />
                  <Select<PromptTier>
                    label={F.promptTier.label}
                    hideLabel
                    value={p.tier}
                    onChange={(v) => editPrompts((rows) => rows.map((r) => (r.key === p.key ? { ...r, tier: v } : r)))}
                    options={tierOptions}
                  />
                  <Select<PromptIntent>
                    label={F.promptIntent.label}
                    hideLabel
                    value={p.intent}
                    onChange={(v) => editPrompts((rows) => rows.map((r) => (r.key === p.key ? { ...r, intent: v } : r)))}
                    options={intentOptions}
                  />
                  <Input
                    label={F.promptTopic.label}
                    hideLabel
                    placeholder={F.promptTopic.placeholder}
                    value={p.topic}
                    onChange={(e) => editPrompts((rows) => rows.map((r) => (r.key === p.key ? { ...r, topic: e.target.value } : r)))}
                    maxLength={80}
                    wrapperClassName="col-span-2 md:col-span-1"
                  />
                  <IconButton
                    icon={Trash2}
                    label={`${E.removePrompt}: ${p.text || i + 1}`}
                    onClick={() => editPrompts((rows) => rows.filter((r) => r.key !== p.key))}
                    className="col-start-3 row-start-2 md:col-start-auto md:row-start-auto"
                  />
                </li>
              ))}
            </ul>
          )}
          {showErrors && filledPrompts.length === 0 && <p className="text-xs text-danger">{O.validation.promptsRequired}</p>}
          {filledPrompts.length > SOFT_PROMPT_LIMIT && <p className="text-xs text-warning">{O.prompts.tooMany}</p>}
          {prompts.length > 0 && (
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-subtle">
              {TIERS.map((t) => (
                <span key={t} className="inline-flex items-baseline gap-1.5">
                  <TierLabel tier={t} className="font-medium text-text-muted" />
                  <span>{copy.glossary.tiers[t].short}</span>
                </span>
              ))}
            </p>
          )}
          {freshSuggestion && freshSuggestion.prompts.length > 0 && <SuggestNote s={freshSuggestion} />}
        </div>
      )}
    </StepCard>
  );

  const engineList = engines.data ?? [];
  const liveCount = engineList.filter((e) => e.mode === 'live').length;
  const enginesStep = (
    <StepCard
      k="engines"
      headingRef={headingRef}
      aside={engineList.length > 0 ? <span className="font-mono text-xs text-text-muted tnum">{fmt(E.liveCount, { live: liveCount, total: engineList.length })}</span> : undefined}
    >
      <div className="space-y-5">
        <fieldset>
          <legend className="text-xs font-medium text-text-muted">{F.engines.label}</legend>
          {engines.isLoading ? (
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : (
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {engineList.map((e) => (
                <label
                  key={e.id}
                  className="flex cursor-pointer items-start gap-2.5 rounded-md border border-border px-3 py-2.5 transition-colors hover:border-border-strong has-[:checked]:border-primary has-[:checked]:bg-primary-soft"
                >
                  <Checkbox
                    checked={picked.includes(e.id)}
                    onCheckedChange={(c) => setPicked((v) => (c ? [...v, e.id] : v.filter((x) => x !== e.id)))}
                    aria-label={e.name}
                    className="mt-0.5"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-medium text-text">
                      {e.name}
                      {e.vendor !== e.name && <span className="text-xs font-normal text-text-subtle">{e.vendor}</span>}
                      <ModeBadge mode={e.mode} engineName={e.name} tooltip={false} />
                    </span>
                    <span className="mt-0.5 block text-xs text-text-subtle">{e.mode === 'live' ? copy.engines[e.id].note : O.engines.simulated}</span>
                  </span>
                </label>
              ))}
            </div>
          )}
          <p className="mt-2 flex flex-wrap items-center gap-x-2 text-xs text-text-subtle">
            {F.engines.help}
            <Link to="/app/settings" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
              {E.manageKeys}
              <ExternalLink size={12} strokeWidth={1.75} aria-hidden />
            </Link>
          </p>
          {showErrors && !enginesOk && <p className="mt-1 text-xs text-danger">{O.validation.enginesRequired}</p>}
        </fieldset>
        <Select<Schedule>
          label={F.schedule.label}
          hint={F.schedule.help}
          value={schedule}
          onChange={setSchedule}
          options={SCHEDULES.map((s) => ({ value: s, label: F.schedule.options[s] }))}
          wrapperClassName="max-w-xs"
        />
        <Checkbox label={F.runNow.label} description={copy.glossary.concepts.check.short} checked={runNow} onCheckedChange={setRunNow} />
        <div className="rounded-md border border-border bg-surface-2 px-4 py-3">
          <h3 className="text-sm font-semibold text-text">{O.summary.title}</h3>
          <p className="mt-0.5 text-sm text-text-muted">
            {name.trim() || F.name.placeholder} · <span className="font-mono">{normalizeDomain(domain)}</span>
          </p>
          <p className="mt-1 text-sm text-text">
            {fmt(O.summary.body, { prompts: filledPrompts.length, engines: picked.length, schedule: O.summary.scheduleWords[schedule] })}
          </p>
        </div>
        {submitError && (
          <p role="alert" className="text-sm text-danger">
            {E.createFailed} <span className="text-text-muted">{fmt(copy.app.errors.detail, { detail: submitError })}</span>
          </p>
        )}
      </div>
    </StepCard>
  );

  const current = STEPS[step]!;
  const last = step === STEPS.length - 1;
  // Anything typed would be lost on Back, a link or a reload: ask first.
  const dirty = !!(name.trim() || domain.trim() || description.trim() || competitors.length || prompts.length);
  return (
    <Page className="max-w-3xl">
      <UnsavedChangesGuard when={() => dirty && !created.current} />
      <PageHeader title={O.title} subtitle={O.subtitle} className="mb-0" breadcrumbs={[{ label: copy.pages.projects.title, to: '/app' }, { label: O.title }]} />
      <div className="space-y-3">
        <Stepper step={step} maxStep={maxStep} onGo={go} />
        <div className="flex items-center gap-3 sm:hidden">
          <ProgressBar value={(step + 1) / STEPS.length} size="xs" label={fmt(O.progress, { step: step + 1, total: STEPS.length })} />
        </div>
        <p className="font-mono text-xs text-text-subtle tnum">
          {fmt(O.progress, { step: step + 1, total: STEPS.length })} · {O.steps[current].label}
        </p>
      </div>
      <form onSubmit={submit} noValidate className="space-y-4">
        {current === 'brand' && brandStep}
        {current === 'competitors' && competitorsStep}
        {current === 'prompts' && promptsStep}
        {current === 'engines' && enginesStep}
        <div className="flex items-center justify-between gap-2">
          {step > 0 ? (
            <Button icon={ArrowLeft} onClick={() => go(step - 1)} disabled={create.isPending}>
              {O.actions.back}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {current === 'competitors' && competitors.length === 0 && (
              <Button variant="ghost" onClick={() => go(step + 1)}>
                {O.actions.skip}
              </Button>
            )}
            <Button type="submit" variant="primary" iconRight={last ? undefined : ArrowRight} loading={create.isPending}>
              {last ? (create.isPending ? O.actions.creating : O.actions.create) : O.actions.next}
            </Button>
          </div>
        </div>
      </form>
    </Page>
  );
}
