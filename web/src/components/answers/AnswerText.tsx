// Safe answer renderer: Markdown subset → React elements (never HTML strings), with the brand
// named on the tinted ground with an underline in the brand blue (the <mark> base style) and competitors
// underlined in their series color (BRAND §10.7).
import { Fragment, useMemo, type ReactNode } from 'react';
import type { Citation } from '@shared/types';
import { cn } from '@/lib/cn';
import { buildMatcher, useAnswerEntities, type AnswerEntity, type EntityMatcher } from './entities';
import { parseBlocks, snippet, toPlainText, type Block, type Inline } from './markdown';

interface Ctx {
  matcher: EntityMatcher | null;
  citations: Citation[];
}

/** Text with tracked entities wrapped: brand → <mark>, competitors → colored underline. */
function highlight(text: string, matcher: EntityMatcher | null, keyBase: string): ReactNode {
  if (!matcher || !text) return text;
  const re = new RegExp(matcher.re.source, matcher.re.flags);
  const out: ReactNode[] = [];
  let last = 0;
  let k = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const entity = matcher.byTerm.get(m[0].toLowerCase());
    if (!entity) continue;
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(<EntityMark key={`${keyBase}-${k++}`} entity={entity} text={m[0]} />);
    last = m.index + m[0].length;
  }
  if (last === 0) return text;
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function EntityMark({ entity, text }: { entity: AnswerEntity; text: string }) {
  if (entity.isBrand) return <mark className="px-0.5">{text}</mark>;
  return (
    <span title={entity.name} className="underline decoration-2 underline-offset-[3px]" style={{ textDecorationColor: entity.color }}>
      {text}
    </span>
  );
}

function CiteChip({ n, citations }: { n: number; citations: Citation[] }) {
  const c = citations.find((x) => x.position === n) ?? citations[n - 1];
  const cls =
    'mx-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-sm border border-border bg-surface-2 px-1 align-[2px] font-mono text-[11px] leading-none text-text-muted tnum';
  if (!c) return <span className={cls}>{n}</span>;
  return (
    <a
      href={c.url}
      target="_blank"
      rel="noopener noreferrer"
      title={`${c.title || c.domain} · ${c.domain}`}
      aria-label={`Source ${n}: ${c.domain}`}
      className={cn(cls, 'no-underline transition-colors hover:border-border-strong hover:text-text')}
    >
      {n}
    </a>
  );
}

function renderInline(nodes: Inline[], ctx: Ctx, key: string, plain = false): ReactNode[] {
  return nodes.map((n, i) => {
    const k = `${key}.${i}`;
    switch (n.t) {
      case 'text':
        return <Fragment key={k}>{plain ? n.v : highlight(n.v, ctx.matcher, k)}</Fragment>;
      case 'strong':
        return (
          <strong key={k} className="font-semibold text-text">
            {renderInline(n.c, ctx, k, plain)}
          </strong>
        );
      case 'em':
        return <em key={k}>{renderInline(n.c, ctx, k, plain)}</em>;
      case 'code':
        return (
          <code key={k} className="rounded-sm bg-well px-1 py-px font-mono text-[0.85em]">
            {n.v}
          </code>
        );
      case 'cite':
        return <CiteChip key={k} n={n.n} citations={ctx.citations} />;
      case 'link':
        return (
          <a
            key={k}
            href={n.href}
            target="_blank"
            rel="noopener noreferrer"
            className={cn('text-accent underline decoration-1 underline-offset-2 hover:decoration-2', n.citationLike && 'font-mono text-[0.85em] no-underline hover:underline')}
          >
            {/* Domain-labelled links are citations, not mentions (same rule as the server). */}
            {renderInline(n.c, ctx, k, plain || n.citationLike)}
          </a>
        );
    }
  });
}

function renderBlock(b: Block, ctx: Ctx, key: string): ReactNode {
  switch (b.t) {
    case 'p':
      return <p key={key}>{renderInline(b.c, ctx, key)}</p>;
    case 'h': {
      const cls = b.level <= 2 ? 'text-lg font-semibold' : 'text-base font-semibold';
      return (
        <p key={key} role="heading" aria-level={Math.min(6, b.level + 2)} className={cn('text-text-strong', cls)}>
          {renderInline(b.c, ctx, key)}
        </p>
      );
    }
    case 'list': {
      const items = b.items.map((it, i) => (
        <li key={`${key}.${i}`} className="pl-1">
          {renderInline(it.c, ctx, `${key}.${i}`)}
          {it.children && <div className="mt-1.5 space-y-1.5">{it.children.map((c, j) => renderBlock(c, ctx, `${key}.${i}.${j}`))}</div>}
        </li>
      ));
      return b.ordered ? (
        <ol key={key} start={b.start !== 1 ? b.start : undefined} className="list-decimal space-y-1.5 pl-6 marker:font-mono marker:text-[0.85em] marker:text-text-subtle">
          {items}
        </ol>
      ) : (
        <ul key={key} className="list-disc space-y-1.5 pl-6 marker:text-text-subtle">
          {items}
        </ul>
      );
    }
    case 'quote':
      return (
        <blockquote key={key} className="space-y-2 border-l-2 border-border-strong pl-3 text-text-muted">
          {b.c.map((c, j) => renderBlock(c, ctx, `${key}.${j}`))}
        </blockquote>
      );
    case 'code':
      return (
        <pre key={key} className="overflow-x-auto rounded-md border border-border bg-well p-3 font-mono text-[13px] leading-5">
          <code>{b.v}</code>
        </pre>
      );
    case 'hr':
      return <hr key={key} className="border-border" />;
    case 'table':
      return (
        <div key={key} className="overflow-x-auto rounded-md border border-border">
          <table className="w-full border-collapse text-[13px] leading-[18px]">
            <thead className="bg-surface-2">
              <tr>
                {b.head.map((h, i) => (
                  <th key={i} scope="col" className="border-b border-border px-2.5 py-2 text-left font-semibold text-text">
                    {renderInline(h, ctx, `${key}.h${i}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {b.rows.map((r, i) => (
                <tr key={i} className="border-b border-border last:border-b-0">
                  {r.map((cell, j) => (
                    <td key={j} className="border-b border-border px-2.5 py-2 align-top text-text">
                      {renderInline(cell, ctx, `${key}.${i}.${j}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

export interface AnswerTextProps {
  /** Answer Markdown (simulated or live). */
  text: string;
  /** Citations behind `[n]` markers (matched by position). */
  citations?: Citation[];
  /** Entities to highlight; defaults to the current project's brand + competitors. */
  entities?: AnswerEntity[];
  /** `base` = 16/24 answer transcript (default), `sm` = 14/22 for dense panels. */
  size?: 'base' | 'sm';
  className?: string;
}

/** Full answer transcript, max ~72 characters per line. */
export function AnswerText({ text, citations = [], entities, size = 'base', className }: AnswerTextProps) {
  const fallback = useAnswerEntities();
  const list = entities ?? fallback;
  const matcher = useMemo(() => buildMatcher(list), [list]);
  const blocks = useMemo(() => parseBlocks(text), [text]);
  const ctx: Ctx = { matcher, citations };
  return (
    <div className={cn('max-w-[72ch] space-y-3 break-words text-text', size === 'base' ? 'text-base leading-6' : 'text-sm leading-[22px]', className)}>
      {blocks.map((b, i) => renderBlock(b, ctx, `b${i}`))}
    </div>
  );
}

export interface AnswerSnippetProps {
  text: string;
  /** Start the excerpt at this phrase (e.g. the sentence that names the brand) when it's found. */
  from?: string;
  /** Max characters before the ellipsis. */
  max?: number;
  entities?: AnswerEntity[];
  className?: string;
}

/** One-paragraph plain-text excerpt with the same highlights (list rows, cards). */
export function AnswerSnippet({ text, from, max = 220, entities, className }: AnswerSnippetProps) {
  const fallback = useAnswerEntities();
  const list = entities ?? fallback;
  const matcher = useMemo(() => buildMatcher(list), [list]);
  const value = useMemo(() => {
    const plain = toPlainText(text).replace(/\s*\n\s*/g, ' ');
    const probe = from ? toPlainText(from).slice(0, 40).toLowerCase() : '';
    const at = probe ? plain.toLowerCase().indexOf(probe) : -1;
    return at > 0 ? `…${snippet(plain.slice(at), max)}` : snippet(plain, max);
  }, [text, from, max]);
  // A span (block) so it can sit inside buttons and links. A `line-clamp-*` class brings its own display
  // (-webkit-box), which `block` would override and silently disable the clamp.
  const clamped = /\bline-clamp-/.test(className ?? '');
  return <span className={cn(!clamped && 'block', 'break-words text-[13px] leading-5 text-text-muted', className)}>{highlight(value, matcher, 's')}</span>;
}
