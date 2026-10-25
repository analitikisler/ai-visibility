// ai visibility logo. The ai tool family's lockup and mark from brand/ai/assets (brand/ai/BRAND.md §5–6),
// inlined by aiArtwork.ts: the ink follows `currentColor` (the text ink, so light and dark need nothing), the red
// point is `--point` (brand/tokens.css, the family's one red). Never redraw it; regenerate aiArtwork.ts instead.
import { LOCKUP, MARK } from './aiArtwork';

/** `full` = the ai visibility lockup (default), `mark` = the ai mark alone. `wordmark` is kept for old callers and
 *  draws the lockup: the family has no name-only logo. */
export type LogoVariant = 'full' | 'mark' | 'wordmark';
/** `brand` (default): ink in `currentColor`, the point red. `mono`: all `currentColor`. `reversed`: all white. */
export type LogoTone = 'brand' | 'mono' | 'reversed';

export interface LogoProps {
  variant?: LogoVariant;
  /** Height in px; width follows the aspect ratio. Omit it to size with `className`. With neither, 24px tall. */
  size?: number;
  className?: string;
  tone?: LogoTone;
  /** Kept for old callers; the ai mark has no solid form (below 24px the favicon files are used instead). */
  solid?: boolean;
  /** Accessible name. Pass `null` when the logo sits next to visible "ai visibility" text (decorative). */
  title?: string | null;
}

export function Logo({ variant = 'full', size, className, tone = 'brand', title = 'ai visibility' }: LogoProps) {
  const art = variant === 'mark' ? MARK : LOCKUP;
  const [, , w, h] = art.viewBox.split(/\s+/).map(Number) as [number, number, number, number];
  const height = size ?? (className ? undefined : 24);
  const width = height === undefined ? undefined : Math.round(((height * w) / h) * 100) / 100;
  const a11y = title === null ? { 'aria-hidden': true as const } : { role: 'img', 'aria-label': title };
  const color = tone === 'reversed' ? '#fff' : undefined;
  const inner = tone === 'brand' ? art.inner : art.inner.replaceAll('var(--point)', 'currentColor');

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={art.viewBox}
      width={width}
      height={height}
      className={className}
      style={color ? { color } : undefined}
      focusable="false"
      {...a11y}
      dangerouslySetInnerHTML={{ __html: inner }}
    />
  );
}

/** The raw artwork (viewBox + inner SVG) for compositions such as the hero or the OG card. */
export const MARK_PATHS = { mark: MARK, lockup: LOCKUP } as const;
