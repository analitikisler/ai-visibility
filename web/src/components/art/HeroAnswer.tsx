// Landing hero visual: a stylized AI answer that names the brand first.
// Plain HTML + inline styles on brand tokens, so it renders the same with or without
// Tailwind and switches with the theme. Content is illustrative, not real data.
import type { CSSProperties, ReactNode } from 'react';
import type { EngineId } from '@shared/types';
import { EngineGlyph } from './EngineGlyph';

export interface HeroAnswerProps {
  /** Brand named (and highlighted) in the answer. */
  brand?: string;
  /** The buyer prompt shown above the answer. */
  prompt?: string;
  className?: string;
}

const SANS = "var(--font-sans, 'Google Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif)";
const MONO = "var(--font-mono, 'Google Sans Code', ui-monospace, 'SF Mono', Menlo, Consolas, monospace)";
const DISPLAY = "var(--font-display, 'Google Sans Flex', 'Google Sans', system-ui, sans-serif)";

const TABS: { id: EngineId; name: string }[] = [
  { id: 'chatgpt', name: 'ChatGPT' },
  { id: 'claude', name: 'Claude' },
  { id: 'gemini', name: 'Gemini' },
  { id: 'perplexity', name: 'Perplexity' },
];

const s = {
  root: {
    position: 'relative',
    width: '100%',
    maxWidth: 560,
    paddingRight: 24,
    paddingBottom: 56,
    boxSizing: 'border-box',
    fontFamily: SANS,
    color: 'var(--text)',
    textAlign: 'left',
  },
  card: {
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    overflow: 'hidden',
    // The tab row sizes its gaps against the card's width (cqi units below).
    containerType: 'inline-size',
  },
  // Underline tabs, as in the app (brand/retired/overt/BRAND.md §10.11). Gaps and side padding shrink with the card,
  // so all four fit on one row down to a 375px phone; on narrower screens the row wraps.
  tabs: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    columnGap: 'clamp(8px, 2.6cqi, 16px)',
    padding: '0 clamp(12px, 3cqi, 16px)',
    borderBottom: '1px solid var(--border)',
    background: 'var(--surface)',
  },
  tab: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    height: 38,
    marginBottom: -1,
    borderBottom: '2px solid transparent',
    boxSizing: 'border-box',
    fontSize: 12,
    lineHeight: '16px',
    fontWeight: 500,
    color: 'var(--text-muted)',
    whiteSpace: 'nowrap',
  },
  tabActive: { borderBottomColor: 'var(--accent)', color: 'var(--text-strong)' },
  body: { padding: '18px 20px 32px' },
  prompt: {
    marginLeft: 'auto',
    width: 'fit-content',
    maxWidth: '82%',
    background: 'var(--surface-2)',
    borderRadius: '6px 6px 2px 6px',
    padding: '9px 13px',
    fontSize: 14,
    lineHeight: '20px',
    color: 'var(--text)',
  },
  who: { display: 'flex', alignItems: 'center', gap: 6, marginTop: 18, fontSize: 12, fontWeight: 500, color: 'var(--text-muted)' },
  lead: { margin: '8px 0 10px', fontSize: 14, lineHeight: '22px', color: 'var(--text)' },
  list: { listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10 },
  item: { display: 'grid', gridTemplateColumns: '22px 1fr', alignItems: 'baseline', fontSize: 14, lineHeight: '22px' },
  rank: { fontFamily: MONO, fontSize: 12, color: 'var(--text-subtle)' },
  muted: { color: 'var(--text-muted)' },
  mark: {
    background: 'var(--accent-soft)',
    color: 'var(--text-strong)',
    textDecoration: 'underline 2px var(--chart-1)',
    textUnderlineOffset: 3,
    borderRadius: 2,
    padding: '1px 4px',
    margin: '0 -1px',
    fontWeight: 600,
    boxDecorationBreak: 'clone',
    WebkitBoxDecorationBreak: 'clone',
  },
  cite: {
    display: 'inline-block',
    minWidth: 16,
    marginLeft: 4,
    padding: '0 4px',
    borderRadius: 2,
    border: '1px solid var(--border)',
    background: 'var(--surface-2)',
    fontFamily: MONO,
    fontSize: 10,
    lineHeight: '15px',
    textAlign: 'center',
    color: 'var(--text-muted)',
    verticalAlign: 1,
  },
  sources: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
    marginTop: 16,
    paddingTop: 14,
    borderTop: '1px solid var(--border)',
  },
  overline: { fontSize: 12, lineHeight: '16px', fontWeight: 500, color: 'var(--text-subtle)' },
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 5,
    padding: '2px 8px 2px 4px',
    borderRadius: 2,
    border: '1px solid var(--border)',
    background: 'var(--surface)',
    fontFamily: MONO,
    fontSize: 11,
    lineHeight: '16px',
    color: 'var(--text-muted)',
  },
  pillNum: {
    display: 'inline-grid',
    placeItems: 'center',
    width: 16,
    height: 16,
    borderRadius: 1,
    background: 'var(--surface-2)',
    fontSize: 10,
    color: 'var(--text-subtle)',
  },
  score: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    padding: '12px 14px',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: 6,
    // It floats over the answer card, so it takes the overlay shadow (the only shadow in Tally).
    boxShadow: 'var(--shadow-overlay)',
  },
  value: { fontFamily: DISPLAY, fontSize: 28, lineHeight: '32px', fontWeight: 570, letterSpacing: '-0.012em', color: 'var(--text-strong)', fontVariantNumeric: 'tabular-nums' },
  unit: { fontFamily: SANS, fontSize: 14, fontWeight: 400, color: 'var(--text-muted)', letterSpacing: 0 },
  delta: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 2,
    padding: '0 5px',
    borderRadius: 2,
    border: '1px solid color-mix(in oklab, var(--success) 40%, transparent)',
    background: 'var(--success-soft)',
    color: 'var(--success)',
    fontFamily: MONO,
    fontSize: 11,
    lineHeight: '16px',
    fontWeight: 500,
  },
} satisfies Record<string, CSSProperties>;

const Cite = ({ n }: { n: number }) => <span style={s.cite}>{n}</span>;

/** Competitor mention: 2px underline in the competitor's series color (brand/retired/overt/BRAND.md §10.7). */
const Rival = ({ color, children }: { color: string; children: ReactNode }) => (
  <span
    style={{
      fontWeight: 600,
      textDecorationLine: 'underline',
      textDecorationColor: color,
      textDecorationThickness: 2,
      textUnderlineOffset: 4,
    }}
  >
    {children}
  </span>
);

/** Brand line with a 7-day sparkline, drawn in the brand series color. */
const Spark = () => (
  <svg width="72" height="28" viewBox="0 0 72 28" fill="none" aria-hidden="true">
    <path d="M1 22H71" stroke="var(--border)" strokeWidth="1" strokeDasharray="2 3" />
    <path
      d="M2 21 13 18.5 24 20 35 14 46 15 57 9 70 6"
      stroke="var(--chart-1)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="70" cy="6" r="2.5" fill="var(--chart-1)" />
  </svg>
);

const ArrowUpRight = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M7 17 17 7M8 7h9v9" />
  </svg>
);

/** Landing hero: an AI answer card (~560 × 420) where the brand is named first and highlighted. */
export function HeroAnswer({
  brand = 'Your brand',
  prompt = 'What’s the best CRM for a 20-person startup?',
  className,
}: HeroAnswerProps) {
  return (
    <div className={className} style={s.root} role="img" aria-label={`Example AI answer that recommends ${brand} first`}>
      <div style={s.card} aria-hidden="true">
        <div style={s.tabs}>
          {TABS.map((t, i) => (
            <span key={t.id} style={i === 0 ? { ...s.tab, ...s.tabActive } : s.tab}>
              <EngineGlyph engine={t.id} size={14} />
              {t.name}
            </span>
          ))}
        </div>

        <div style={s.body}>
          <div style={s.prompt}>{prompt}</div>

          <div style={s.who}>
            <EngineGlyph engine="chatgpt" size={16} />
            ChatGPT
          </div>
          <p style={s.lead}>For a team that size, three tools come up again and again:</p>

          <ol style={s.list}>
            <li style={s.item}>
              <span style={s.rank}>1.</span>
              <span>
                <mark style={s.mark}>{brand}</mark>
                <span style={s.muted}> is the most recommended: quick setup and pricing that grows with the team.</span>
                <Cite n={1} />
                <Cite n={2} />
              </span>
            </li>
            <li style={s.item}>
              <span style={s.rank}>2.</span>
              <span>
                <Rival color="var(--chart-2)">Northwind</Rival>
                <span style={s.muted}> has deep reporting, with a steeper learning curve.</span>
                <Cite n={3} />
              </span>
            </li>
            <li style={s.item}>
              <span style={s.rank}>3.</span>
              <span>
                <Rival color="var(--chart-3)">Acme</Rival>
                <span style={s.muted}> is flexible, but key features sit on higher tiers.</span>
                <Cite n={2} />
              </span>
            </li>
          </ol>

          <div style={s.sources}>
            <span style={{ ...s.overline, marginRight: 4 }}>Sources</span>
            {['g2.com', 'reddit.com', 'capterra.com'].map((d, i) => (
              <span key={d} style={s.pill}>
                <span style={s.pillNum}>{i + 1}</span>
                {d}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div style={s.score} aria-hidden="true">
        <div>
          <div style={s.overline}>Visibility</div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={s.value}>
              42<span style={s.unit}>/100</span>
            </span>
            <span style={s.delta}>
              <ArrowUpRight />
              +6 pts
            </span>
          </div>
        </div>
        <Spark />
      </div>
    </div>
  );
}
