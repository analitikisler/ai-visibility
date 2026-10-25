> **Retired 25 Oct 2026.** These are the old Overt logos. Use the ai visibility lockups in
> [`brand/ai/assets/lockups/`](../../../ai/assets/lockups/) and the rules in `brand/ai/BRAND.md`.

# Overt — logo & art assets

Owner: Art. These SVGs are the source of truth for the logo. They are hand-built, optimized
outlines with no fonts, strokes, transforms or gradients, so they render the same everywhere. The
React components in `web/src/components/art/` use the same geometry. Change both together.

## Inventory

### `brand/assets/`

| File | What | Use on |
|---|---|---|
| `logo.svg` | Mark (Cobalt `#2F5CF6`) + wordmark (Ink `#0E1116`) | `bg`, `surface`, white, light photos with a plain area |
| `logo-dark.svg` | Mark `#5784FF` + wordmark `#ECEFF4` | Tally's dark grounds: `bg` `#071529`, `surface` `#0E1E34`, `surface-2` `#15263F`. The logo files themselves are unchanged from 1.x |
| `logo-mono.svg` | All Ink `#0E1116` | One-color print, fax-grade docs, embossing, partner pages that forbid color |
| `logo-reversed.svg` | All white | On a Cobalt `#2F5CF6` fill (or brand-700…950) |
| `wordmark.svg` | Letters only, Ink | Where the mark already appears nearby (e.g. footer next to an app icon) |
| `mark.svg` | Answer-bubble mark, Cobalt | App icon, avatars, social profile, loading states |
| `mark-dark.svg` | Mark `#5784FF` | Dark surfaces |
| `mark-mono.svg` | Mark, Ink | One-color use |
| `mark-reversed.svg` | Mark, white | On Cobalt |
| `mark-solid.svg` | Solid bubble with the dot knocked out, Cobalt | **16–24px only** (favicons, tiny UI). It stays legible where the ring would fill in. |

### `web/public/`

| File | What |
|---|---|
| `favicon.svg` | Solid mark. Switches to `#5784FF` under `prefers-color-scheme: dark` |
| `favicon-32.png`, `favicon.ico` | 32 × 32 raster fallback (Safari, legacy `/favicon.ico` requests) |
| `apple-touch-icon.png` | 180 × 180, white ring mark on Cobalt (iOS rounds the corners) |
| `og.svg` / `og.png` | 1200 × 630 social card on the dark `bg` (`#071529`): the logo as in `logo-dark.svg`, "Be the answer." in Google Sans Flex, and an abstract AI answer where "Your brand" sits on the tinted ground (`accent-soft`) with a cobalt underline, the card's only blue besides the logo. Its text is drawn as outlines from the bundled Google Sans files, so the SVG needs no fonts; the PNG is a 1:1 render of the SVG. Use the **PNG** in meta tags. Social platforms don't render SVG. |

Suggested `<head>` tags (Frontend owns `web/index.html`):

```html
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png" type="image/png" sizes="32x32">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<meta name="theme-color" content="#F4F6FA" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#071529" media="(prefers-color-scheme: dark)">
<meta property="og:image" content="/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
```

(`og:image` must be an absolute URL in production, for example `https://overt.example/og.png`.)

## The mark: "the answer bubble"

One shape that reads two ways. It's a speech bubble, an AI's answer. It's also a lens or target, being seen. Inside sits a solid dot, offset up and to the right. That dot is *you*, named in the answer.

Construction on a 48-unit grid:

- **Outer:** a circle, R 24, with its **bottom-left quadrant squared off** to a right angle. The square corner works as the bubble's tail, so there's no extra tail shape.
- **Counter:** the same shape inset by 9 (R 15, also squared at the bottom-left). That makes a ring 9 thick.
- **Dot:** r 8 (diameter 16 = 33% of the mark), centred at (26.5, 21.5), which is +2.5 / −2.5 from the centre. Ring thickness (9) ≈ dot radius (8), for optical balance.
- **Solid version** (≤ 24px): the outer shape filled, with the same dot knocked out.

## The wordmark

`overt` in lowercase, drawn as outlines in the spirit of Schibsted Grotesk Bold. Units are on an x-height of 100:

- Stems 28. Round sides 29, round tops and bottoms 20. Overshoot 2. Squarish curves (tension 0.6).
- Custom touches: a **flat-cut top on the t** (the font slants it), a **vertical-cut r terminal**, a **tight r–t pair** (4 units, the arm nearly meets the crossbar), and tracking of about −2%.

**Lockup:** the mark is 1.32 × the x-height tall. Its flat bottom edge sits on the baseline, and its top rises just above the t. The gap from mark to wordmark is 36 units, or 0.27 × the mark's height.

**Recommendation:** use the mark as a standalone symbol to the left of the wordmark. We also tried the mark in place of the "o". It was rejected because the squared corner makes the o read as a "D" or "p" ("pvert") at text sizes, and at x-height size the ring is lighter than the letter stems.

## Usage rules

**Clear space.** Leave at least **one dot diameter** on every side: ⅓ of the mark's height, or about 0.33 × the logo's height for the full lockup. Nothing else goes inside that zone: no text, no edges, no other logos.

**Minimum size**

| Asset | Screen | Print |
|---|---|---|
| Full logo | 16px tall (≈ 74px wide) | 6 mm tall |
| Ring mark | 24px | 8 mm |
| Solid mark | 12px (use it for anything 16–24px) | 4 mm |

**Color**

- Light surfaces: Cobalt mark + Ink wordmark (`logo.svg`).
- Dark surfaces: `#5784FF` mark + `#ECEFF4` wordmark (`logo-dark.svg`). In the app, `<Logo />` switches automatically through `--brand` and `currentColor`.
- On Cobalt: all white (`logo-reversed.svg`).
- One color: all Ink (`logo-mono.svg`).
- The "you're named" marking **is never part of the logo**. It belongs only in answer snippets. In the app, the landing hero and the OG card (`og.svg` / `og.png`) it is Tally's tinted ground (`accent-soft`) with a cobalt underline (2px in the app). The 1.x lime highlighter (`#E2F366`) is retired.

**Don't**

- Rotate, skew, stretch, outline or add strokes to the mark or the letters.
- Recolor outside the palette above. That means no purple, no gradients, no glow or neon, no 3D or bevels, and no drop shadows on the logo.
- Move the dot, mirror the bubble (the square corner is always bottom-left) or swap the ring for a plain circle.
- Retype the wordmark in a live font. Use the outlines.
- Rearrange the lockup (mark above the wordmark, different gaps or sizes), or add a tagline inside the clear space.
- Put the logo on busy photos or on low-contrast tints (for example, Cobalt on `primary-soft`).
- Add sparkles, stars, robots, brains, eyes or magnifying glasses near it.

## React components (`web/src/components/art`)

Import from `@/components/art`. All of them are theme-aware through CSS variables from
`brand/tokens.css`, so light and dark need no re-render. Decorative pieces are `aria-hidden`.

| Component | Props | Notes |
|---|---|---|
| `Logo` | `variant?: 'full' \| 'mark' \| 'wordmark'`, `size?` (px height), `className?`, `tone?: 'brand' \| 'mono' \| 'reversed'`, `solid?`, `title?: string \| null` | Mark = `var(--brand)` (Overt's blue, also `chart-1`), letters = `currentColor`. With no `size` and no `className`, it's 24px tall. Otherwise size it with `className="h-6 w-auto"`. A mark at ≤ 20px goes solid automatically. `title={null}` makes it decorative. |
| `EngineGlyph` | `engine: EngineId`, `size?` (16), `variant?: 'tile' \| 'marker'`, `className?`, `title?` | Neutral geometric badges, **not vendor logos**. ChatGPT disc (Jade `--chart-4`), Claude diamond (Ember `--chart-2`), Gemini twin discs (Iris `--chart-5`), Perplexity triangle (Lagoon `--chart-7`), Grok square (Ochre `--chart-6`), DeepSeek ring (Orchid `--chart-3`). The distinct shapes keep them readable without color. Always show the engine name next to one. |
| `EmptyNoData`, `EmptyPrompts`, `EmptyCrawlers`, `EmptyAudit`, `EmptyActions`, `EmptyTraffic`, `ErrorState` | `width?` (160), `className?` | 160 × 120 line art for `EmptyState`'s `illustration` slot. Structure uses `--surface`, `--surface-2`, `--border`, `--border-strong`. The one focal element uses `--chart-1`, the brand (`ErrorState` uses `--danger`). |
| `HeroAnswer` | `brand?` ("Your brand"), `prompt?`, `className?` | Landing hero (≈ 560 × 430). It's an AI answer card with engine tabs, the brand named first on the tinted ground with a cobalt underline, competitors underlined in series colors, citation chips, source pills and a visibility score badge. HTML with inline token styles, so it doesn't depend on Tailwind. Width is 100%, up to 560px. |
| `ModuleIcon` | `module: 'monitor' \| 'diagnose' \| 'act' \| 'crawlers' \| 'readiness'`, `size?` (64), `className?` | Spot illustrations for landing sections. |
