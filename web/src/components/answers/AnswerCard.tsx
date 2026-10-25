// One AI answer: prompt, engine + mode, who got named (position + sentiment), the highlighted
// transcript and its sources. `AnswerCard` is the full view (drawers); `AnswerListItem` the compact row.
import type { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, CircleSlash, Coins, ExternalLink, Minus, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { AiResponse, AnswerUsage, Citation, Mention, SentimentLabel } from '@shared/types';
import { useProjectContext } from '@/components/layout/ProjectContext';
import { Badge, CopyButton, Dot, EngineBadge, ModeBadge, Tooltip } from '@/components/ui';
import { copy, fmt, plural } from '@/content/copy';
import { cn } from '@/lib/cn';
import { BRAND_COLOR, OTHER_COLOR, SOURCE_TYPE_COLORS } from '@/lib/colors';
import { describeEngineError, engineName } from '@/lib/engines';
import { dateTime, duration, num, ordinal, relativeTime, usd } from '@/lib/format';
import { AnswerSnippet, AnswerText } from './AnswerText';
import { useAnswerEntities, type AnswerEntity } from './entities';
import { toPlainText } from './markdown';

const D = copy.pages.responses.detail;
const L = copy.pages.responses.list;

function useMentionColor() {
  const colors = useProjectContext()?.colors ?? {};
  return (m: Pick<Mention, 'entityType' | 'competitorId'>) => (m.entityType === 'brand' ? BRAND_COLOR : (m.competitorId && colors[m.competitorId]) || OTHER_COLOR);
}

const byPosition = (a: Mention, b: Mention) => a.position - b.position;

/** "Named 2nd" / "Not named" status chip. Brand presence uses the brand blue + an icon, never color alone. */
/** A failed engine call: the reason in plain words, the status/provider code in a mono detail line. */
function EngineErrorNote({ answer }: { answer: AiResponse }) {
  const e = describeEngineError(answer.error, answer.engine);
  return (
    <div role="alert" className="mt-4 flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">
      <AlertTriangle size={16} strokeWidth={1.75} aria-hidden className="mt-0.5 shrink-0" />
      <span className="min-w-0">
        <span className="block">{e.message}</span>
        {e.detail && <span className="mt-0.5 block break-words font-mono text-xs opacity-90">{e.detail}</span>}
      </span>
    </div>
  );
}

export function NamedBadge({ answer, className }: { answer: Pick<AiResponse, 'brandMentioned' | 'brandPosition'>; className?: string }) {
  return answer.brandMentioned ? (
    <Badge tone="primary" icon={CheckCircle2} className={className}>
      {fmt(L.named, { position: answer.brandPosition ? ordinal(answer.brandPosition) : '' }).trim()}
    </Badge>
  ) : (
    <Badge tone="neutral" icon={CircleSlash} className={className}>
      {L.notNamed}
    </Badge>
  );
}

const SENT_ICON = { positive: ThumbsUp, neutral: Minus, negative: ThumbsDown } as const;
const SENT_CLS = { positive: 'text-sent-pos', neutral: 'text-sent-neu', negative: 'text-sent-neg' } as const;

/** Sentiment as icon + accessible label (the chip shows the label on hover too). */
function SentimentIcon({ label }: { label: SentimentLabel }) {
  const Icon = SENT_ICON[label];
  return (
    <span className="inline-flex items-center gap-1 text-2xs font-medium text-text-muted" title={copy.labels.sentiment[label]}>
      <Icon size={12} strokeWidth={2} aria-hidden className={SENT_CLS[label]} />
      <span className="hidden sm:inline">{copy.labels.sentiment[label]}</span>
      <span className="sr-only sm:hidden">{copy.labels.sentiment[label]}</span>
    </span>
  );
}

/** Position + entity + sentiment chip; hover shows the sentence around the mention. */
export function MentionChip({ mention, color }: { mention: Mention; color: string }) {
  const brand = mention.entityType === 'brand';
  return (
    <Tooltip
      content={
        mention.context ? (
          <span className="block">
            <span className="mb-0.5 block font-semibold">{D.mentionContext}</span>
            <span className="block text-text-muted">{mention.context}</span>
          </span>
        ) : null
      }
    >
      <span
        tabIndex={mention.context ? 0 : undefined}
        className={cn(
          'inline-flex h-7 max-w-full items-center gap-1.5 rounded-md border px-2 text-xs',
          brand ? 'border-transparent bg-primary-soft text-accent-ink' : 'border-border bg-surface text-text',
        )}
      >
        <span className="font-mono text-2xs text-text-subtle tnum">#{mention.position}</span>
        <Dot color={color} />
        <span className={cn('truncate', brand ? 'font-semibold' : 'font-medium')}>{mention.entityName}</span>
        {brand && <span className="sr-only">({copy.app.badges.you})</span>}
        <span aria-hidden className="h-3 w-px bg-border-strong" />
        <SentimentIcon label={mention.sentimentLabel} />
      </span>
    </Tooltip>
  );
}

function SourceRow({ c, colors }: { c: Citation; colors: Record<string, string> }) {
  const color = c.sourceType === 'competitor' && c.competitorId ? (colors[c.competitorId] ?? SOURCE_TYPE_COLORS.competitor) : SOURCE_TYPE_COLORS[c.sourceType];
  return (
    <li className="flex min-w-0 items-start gap-2.5 py-2">
      <span className="mt-px inline-flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-sm border border-border bg-surface-2 px-1 font-mono text-[11px] text-text-muted tnum">
        {c.position}
      </span>
      <div className="min-w-0 flex-1">
        <a
          href={c.url}
          target="_blank"
          rel="noopener noreferrer"
          className="group inline-flex max-w-full items-center gap-1 text-[13px] font-medium text-text hover:text-accent"
        >
          <span className="truncate">{c.title || c.domain}</span>
          <ExternalLink size={12} strokeWidth={1.75} aria-hidden className="shrink-0 text-text-subtle group-hover:text-accent" />
          <span className="sr-only">({D.openSource})</span>
        </a>
        <p className="mt-0.5 flex min-w-0 items-center gap-2 text-xs text-text-subtle">
          <span className="truncate font-mono">{c.domain}</span>
          <span className="inline-flex shrink-0 items-center gap-1">
            <Dot color={color} size={6} />
            {copy.labels.sourceType[c.sourceType]}
          </span>
        </p>
      </div>
    </li>
  );
}

function Meta({ label, title, children }: { label: string; title?: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-0.5 truncate font-mono text-xs text-text-muted tnum" title={title}>
        {children}
      </dd>
    </div>
  );
}

/** Tokens, searches and estimated cost of a live answer (simulated answers have no usage). */
function UsageMeta({ usage }: { usage: AnswerUsage }) {
  const tokens = fmt(D.tokensValue, { input: num(usage.inputTokens, { compact: true }), output: num(usage.outputTokens, { compact: true }) });
  const cached = usage.cachedTokens > 0 ? fmt(D.tokensCached, { cached: num(usage.cachedTokens, { compact: true }) }) : '';
  return (
    <>
      <Meta label={D.tokens} title={[tokens, cached].filter(Boolean).join(' · ')}>
        {tokens}
        {cached && <span className="text-text-subtle"> · {cached}</span>}
      </Meta>
      <Meta label={D.searches}>{num(usage.searchCalls)}</Meta>
      <div className="min-w-0">
        <dt className="eyebrow">{D.cost}</dt>
        <dd className="mt-0.5 flex items-center gap-1.5 font-mono text-xs text-text-muted tnum">
          <Tooltip content={D.costTooltip}>
            <span tabIndex={0}>{usd(usage.costUsd, { precise: true })}</span>
          </Tooltip>
          {usage.batch && (
            <Tooltip content={D.batchTooltip}>
              <Badge tone="neutral" icon={Coins} tabIndex={0} className="font-sans">
                {D.batch}
              </Badge>
            </Tooltip>
          )}
        </dd>
      </div>
    </>
  );
}

export interface AnswerCardProps {
  answer: AiResponse;
  /** Hide the prompt block (when the surrounding view already shows it). */
  hidePrompt?: boolean;
  /** Render without the card border/padding (inside a drawer that already frames it). */
  bare?: boolean;
  /** Entities to highlight (defaults to the current project). */
  entities?: AnswerEntity[];
  className?: string;
}

/** Full answer: header, brands named, highlighted transcript, sources, timings. */
export function AnswerCard({ answer, hidePrompt, bare, entities, className }: AnswerCardProps) {
  const colorOf = useMentionColor();
  const colors = useProjectContext()?.colors ?? {};
  const fallback = useAnswerEntities();
  const ents = entities ?? fallback;
  const mentions = [...answer.mentions].sort(byPosition);
  const name = engineName(answer.engine);
  return (
    <article className={cn('min-w-0', !bare && 'rounded-lg border border-border bg-surface p-4', className)} aria-label={`${name} · ${answer.promptText}`}>
      {!hidePrompt && (
        <div className="mb-4 rounded-md bg-surface-2 px-3 py-2.5">
          <div className="eyebrow">{D.prompt}</div>
          <p className="mt-0.5 text-[15px] font-medium leading-[22px] text-text">{answer.promptText}</p>
        </div>
      )}

      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <EngineBadge engine={answer.engine} />
          <ModeBadge mode={answer.mode} engineName={name} />
          <NamedBadge answer={answer} />
        </span>
        <time dateTime={answer.createdAt} title={dateTime(answer.createdAt)} className="text-xs text-text-subtle">
          {fmt(D.collected, { time: relativeTime(answer.createdAt) })}
        </time>
      </header>

      {answer.error ? (
        <EngineErrorNote answer={answer} />
      ) : (
        <>
          <section className="mt-4" aria-label={D.mentions}>
            <p className="text-[13px] text-text">
              {answer.brandMentioned && answer.brandPosition
                ? fmt(D.brandPosition, { position: ordinal(answer.brandPosition), total: mentions.length })
                : D.notMentioned}
            </p>
            {mentions.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {mentions.map((m) => (
                  <li key={`${m.entityType}-${m.competitorId ?? 'brand'}`} className="max-w-full">
                    <MentionChip mention={m} color={colorOf(m)} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="mt-5 border-t border-border pt-4">
            <p className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-subtle">
              <span aria-hidden className="inline-flex items-center gap-3">
                <mark className="px-1">{copy.app.badges.you}</mark>
                <span className="underline decoration-2 underline-offset-[3px]" style={{ textDecorationColor: OTHER_COLOR }}>
                  {copy.pages.competitors.title}
                </span>
              </span>
              <span className="sr-only">{D.legend}</span>
            </p>
            <AnswerText text={answer.text} citations={answer.citations} entities={ents} />
          </div>
        </>
      )}

      {!answer.error && (
        <section className="mt-5 border-t border-border pt-4">
          <h4 className="eyebrow">{D.citations}</h4>
          {answer.citations.length ? (
            <ol className="mt-1 divide-y divide-border">
              {[...answer.citations]
                .sort((a, b) => a.position - b.position)
                .map((c) => (
                  <SourceRow key={`${c.position}-${c.url}`} c={c} colors={colors} />
                ))}
            </ol>
          ) : (
            <p className="mt-1.5 text-[13px] text-text-subtle">{D.noCitations}</p>
          )}
        </section>
      )}

      <footer className="mt-5 flex flex-wrap items-end justify-between gap-3 border-t border-border pt-4">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
          <Meta label={D.model}>{answer.model}</Meta>
          <Meta label={D.latency}>{duration(answer.latencyMs)}</Meta>
          <Meta label={copy.pages.responses.columns.date}>{dateTime(answer.createdAt)}</Meta>
          {answer.usage && <UsageMeta usage={answer.usage} />}
        </dl>
        {!answer.error && <CopyButton text={toPlainText(answer.text)} label={D.copyAnswer} showLabel />}
      </footer>
    </article>
  );
}

export interface AnswerListItemProps {
  answer: AiResponse;
  onOpen: () => void;
  selected?: boolean;
  /** Hide the prompt line (list already filtered to one prompt). */
  hidePrompt?: boolean;
  entities?: AnswerEntity[];
}

/** Compact answer row: engine, status, prompt, highlighted snippet, brands named. Whole row opens the answer. */
export function AnswerListItem({ answer, onOpen, selected, hidePrompt, entities }: AnswerListItemProps) {
  const colorOf = useMentionColor();
  const mentions = [...answer.mentions].sort(byPosition);
  const shown = mentions.slice(0, 5);
  const brandMention = mentions.find((m) => m.entityType === 'brand');
  const name = engineName(answer.engine);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={selected || undefined}
      className={cn(
        'group block h-full w-full rounded-lg border bg-surface p-4 text-left transition-[border-color,box-shadow] duration-160 ease-out hover:border-border-strong',
        selected ? 'border-primary' : 'border-border',
      )}
    >
      <span className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          <EngineBadge engine={answer.engine} size="sm" />
          <ModeBadge mode={answer.mode} engineName={name} tooltip={false} />
          {answer.error ? (
            <Badge tone="warning" icon={AlertTriangle}>
              {copy.labels.runStatus.failed}
            </Badge>
          ) : (
            <NamedBadge answer={answer} />
          )}
        </span>
        <time dateTime={answer.createdAt} title={dateTime(answer.createdAt)} className="text-xs text-text-subtle">
          {relativeTime(answer.createdAt)}
        </time>
      </span>
      {!hidePrompt && <span className="mt-2 line-clamp-2 text-sm font-medium text-text group-hover:text-accent">{answer.promptText}</span>}
      {answer.error ? (
        <span className="mt-1.5 block text-[13px] text-text-muted">{describeEngineError(answer.error, answer.engine).message}</span>
      ) : (
        // Lead with the sentence that names the brand, so the highlight is visible in the list.
        <AnswerSnippet text={answer.text} from={brandMention?.context} max={260} entities={entities} className="mt-1.5 line-clamp-3" />
      )}
      {(shown.length > 0 || answer.citations.length > 0) && (
        <span className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-text-muted">
          {shown.map((m) => (
            <span key={`${m.entityType}-${m.competitorId ?? 'b'}`} className="inline-flex min-w-0 items-center gap-1.5">
              <span className="font-mono text-2xs text-text-subtle tnum">#{m.position}</span>
              <Dot color={colorOf(m)} size={6} />
              <span className={cn('max-w-36 truncate', m.entityType === 'brand' && 'font-semibold text-text')}>{m.entityName}</span>
            </span>
          ))}
          {mentions.length > shown.length && <span className="text-text-subtle">+{mentions.length - shown.length}</span>}
          {answer.citations.length > 0 && <span className="ml-auto text-text-subtle">{plural(answer.citations.length, L.citations)}</span>}
        </span>
      )}
    </button>
  );
}
