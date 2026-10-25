> **Retired 25 Oct 2026.** Overt is now **ai visibility**, one of the Analitik İşler ai tools. The brand guide is
> [`brand/ai/BRAND.md`](../../ai/BRAND.md) (board: `brand/ai/board.html`). This file is kept for history only; its name,
> logo, blue (`#2F5CF6`) and tagline are no longer used in new work.

# Overt — Brand Guide

> Owner: Branding. Source of truth for name, voice, color, type and data-viz.
> **Overt follows Tally, the Analitik İşler design system** (2.0, Oct 2026): its colors, type, shape and motion come from Tally, while Overt keeps its own name, logo, blue (`#2F5CF6` / `#5784FF`), voice and copy. Sections 6–11 state the Tally values as Overt uses them.
> Tokens live in `brand/tokens.css` (Tailwind v4) and `brand/tokens.json` (Art & docs). If this file and the tokens disagree, the tokens win; report it to Branding.

---

## 1. Name

**Overt** — /oh-VURT/. Adjective: *done or shown openly; plainly visible, not hidden.*

**Why it works**
- **It's the product promise in one word.** Most brands are invisible inside AI answers. Overt makes you plainly visible, and shows you plainly where you stand.
- **Short and sayable.** Two syllables, five letters, one obvious spelling. Easy to say in a meeting ("check Overt"), easy to type, works as a verb-adjacent noun ("our Overt score").
- **Confident, not cute.** It's a real word with an edge. It fits a product that tells marketing leaders the truth about their brand, including the bad news.
- **Ownable in the category.** No AI-visibility, GEO or SEO tool uses it. Quick checks (Oct 2026) found no conflict among Profound, Peec AI, Otterly, Scrunch, AthenaHQ, 3rd, Hardal, Goodie, Evertune, Bluefish, Writesonic, Semrush, Ahrefs Brand Radar, Rankscale or Knowatoa. The closest hits were *Overt Analytics*, a tiny Chicago ad advisory firm, and *Overtone*, a social-listening company. Both are in different categories with different names. Legal should still run a trademark search before any public launch.

**Write it as:** `Overt` in running text. `overt` (lowercase) only in the logotype. Never OVERT, never Overt.ai in copy.

### Alternates considered

| Name | Idea | Why not |
|---|---|---|
| **Lede** | Journalism term for the first, most important line. "Be the lede." | Readers split on how to say it (led or leed?). *Lede AI* already exists in AI news automation, so it collides in an AI context. |
| **Cairn** | A stone marker that makes a path visible. | Obscure for non-native speakers (kern? cairn?). Too close to *Cairrot*, an existing AI-visibility and crawler tool. |
| **Flare** | A signal you can't miss. | Crowded name: Flare (threat intelligence) and Flare Network (crypto). It also reads as alarm, not insight. |
| **Shortlist** | Being on the list AI gives when buyers ask "best X for Y". | Two syllables but generic. Shortlist is already a recruiting brand, and it sounds like a feature, not a platform. |

Overt won because the word means the outcome (visible), says the attitude (open, direct) and is clear in the category.

---

## 2. Tagline & positioning

**Tagline:** **Be the answer.**

Alternates for specific contexts (≤ 6 words):
- *See how AI talks about you.* (product, onboarding)
- *Visible in every AI answer.* (marketing)
- *Nothing goes live without you.* (Act module, trust)

**Positioning statement (one line):**
> Overt shows marketing and growth teams how ChatGPT, Claude, Gemini and Perplexity describe their brand, why competitors get picked instead, and what to change, with every fix approved by a human.

**Audience**
- **Primary:** in-house marketing, SEO/GEO and growth leads who own organic and brand discovery. They're data-literate and busy, and AI search has been dumped on them without a budget line.
- **Secondary:** their leadership (CMO, VP Marketing, founders). They read the weekly brief and want one number, the trend and the reason.
- **Tertiary:** web and content teams who ship the fixes (llms.txt, schema, comparison pages) and need clear, specific tasks.

---

## 3. Personality

| Trait | Means | Not |
|---|---|---|
| **Direct** | Leads with the number and the verdict. Short sentences. | Blunt to the point of rude; hedging. |
| **Exact** | Every claim traces to a real answer, source or crawler hit. We show our working. | Pedantic; drowning users in caveats. |
| **Calm** | Bad news delivered steadily, with a next step. No panic red, no hype. | Cold or robotic. |
| **On your side** | Human in the loop. We draft, you decide. Nothing goes live without you. | Servile; "AI magic" that acts on its own. |

---

## 4. Voice & tone

**Principles**
1. **Number first, then meaning, then action.** "Visibility 42 (+6). You now appear in 4 of 10 ChatGPT answers. Close the gap on 'best CRM for startups'."
2. **Plain words.** Say "AI answers", not "LLM outputs". Say "mentioned", not "surfaced in the generative layer". Define a term once, then use it the same way everywhere.
3. **Short headlines.** Six words or fewer, sentence case, no trailing period. Page titles are nouns ("Monitor", "Crawlers"). Card titles say what's inside ("Share of voice").
4. **Name names.** "Acme beats you on 7 prompts", not "A competitor is outperforming you".
5. **You decide.** Actions are offers, not orders: "Draft an FAQ page", "Review draft", "Approve & copy". Never "Auto-publish".
6. **No hype, no sparkles.** Don't write "AI-powered", "revolutionary", "supercharge", "unlock" or "magic". Don't use emoji in the product.

**Do / Don't**

| Do | Don't |
|---|---|
| You appear in 38% of answers. Up 6 points. | Your brand's AI visibility metrics have improved significantly! |
| Acme is cited 3× more often on comparison prompts. | Competitors may be outperforming you in some areas. |
| GPTBot read 212 pages. It never reached /pricing. | Our advanced crawler intelligence detected activity. |
| Draft ready. Review it before it goes anywhere. | We've automatically optimized your content! |
| Gemini hasn't mentioned you this week. | Uh oh! Looks like Gemini doesn't love you yet 😢 |

**Writing metrics**
- **Visibility score:** integer 0–100, no unit: `42`. In sentences: "visibility 42".
- **Rates and shares:** percent, no decimal above 10%: `38%`. One decimal below 10%: `4.2%`. Never `38.00%`.
- **Deltas:** signed, same unit, in points for shares: `+6 pts`, `−3 pts`, `+12%` (relative only when labelled "vs last period"). Use a true minus `−` (U+2212). Show `—` when there's no previous period. Never write `0` when the value is null.
- **Position:** `#2.4` average rank, or `2nd` for a single answer. Lower is better, so color it that way (see 7.4).
- **Sentiment:** 0–100 for the KPI, labelled *Positive / Neutral / Negative* for single mentions. Never show the raw −1..1 to users.
- **Counts:** thin-space or comma grouping, `12,480`. Compact above 10k in tiles: `12.5k`. Exact values go in tooltips.
- **Time:** relative for recent ("2h ago"), absolute for history ("Oct 14"). Show ranges as "Last 30 days", not "30d".
- **Engines:** official product names. ChatGPT, Claude, Gemini, Perplexity, Grok, DeepSeek. Not "GPT" or "Bard".
- **Simulated data:** always badge it **Simulated**. Tooltip: "Generated sample answers. Add an API key in Settings to track live."

**Empty states:** say what's missing, why it matters, and the one action that fixes it.
- Title: "No answers yet"
- Body: "Run your first check to see where ChatGPT, Claude and Gemini mention you."
- Action: **Run check**
- Crawlers: "No AI crawlers seen yet." / "Install the snippet or upload a server log to start counting visits." / **Set up tracking**

**Errors:** say what happened in plain words, don't blame, give the way out. Put codes in a detail line, not the headline.
- "Couldn't reach openai.com. We'll retry in 5 minutes. Your simulated data is still up to date."
- "That URL didn't load (timeout after 15s). Check it's public, then try again."
- "Key rejected by Anthropic. Paste a new key in Settings."
- Don't write "Oops!", "Something went wrong" with nothing else, or "Error 500" alone.

**Buttons:** verb + object, sentence case. Write "Run check", "Add competitor", "Export CSV", "Approve draft". Don't write "Submit", "OK" or "Click here".

---

## 5. Messaging pillars

1. **See where you stand.** *(Monitor, Crawlers, AI Traffic)* One honest score across every major AI assistant: visibility, share of voice, position, sentiment, the sources AI cites, and which AI crawlers actually read your site.
   *Proof line:* "Every number links to the answers behind it."
2. **Know why you lose.** *(Diagnose, AI Readiness)* We trace every lost prompt to its cause: the sources competitors get cited from, the pages crawlers never reach, the schema and llms.txt you're missing.
   *Proof line:* "Not a guess. The answer, the source, the gap."
3. **Fix it, with you in control.** *(Plan, Act, Report)* Ranked fixes, agent-drafted content, and a weekly brief your CMO will actually read. Every draft waits for your approval.
   *Proof line:* "Nothing goes live without you."

---

## 6. Color system

**Overt follows Tally, the Analitik İşler design system** (the system behind analitikisler.com: navy grounds, one action blue, the Google Sans family, sharp corners, 1px rules, no decoration). Overt keeps its own name, logo and blue. Its token names stay its own: every token in `brand/tokens.css` says which Tally token it follows, and `brand/tokens.json` lists the same map under `follows`.

**Concept: navy ink, paper and one signal.** Calm navy-tinted surfaces and navy ink. One action blue for what you can press or follow. **Overt Cobalt** means *you*: it is the logo and the tracked brand in every chart, and nothing else.

No gradients, no glass or blur, no glow, no rainbow dashboards.

### 6.1 Theme tokens (CSS vars → Tailwind `bg-*`, `text-*`, `border-*`, `fill-*`, `stroke-*`, `ring-*`)

| Token | Light | Dark | Follows (Tally) | Use |
|---|---|---|---|---|
| `well` | `#E9EEF5` | `#040E1F` | `well` | Sunken areas: code blocks, the draft editor, bar and progress tracks |
| `bg` | `#F4F6FA` | `#071529` | `bg` | App canvas behind cards |
| `surface` | `#FFFFFF` | `#0E1E34` | `surface` | Cards, tables, sidebar, chart plot area |
| `surface-2` | `#ECF1F8` | `#15263F` | `surface-2` | Hover row, inset areas, segmented-control track, disabled |
| `border` | `#D5DDE8` | `#22354E` | `border` | Hairlines, card outline, grid lines |
| `border-strong` | `#78869A` | `#607695` | `border-strong` | Inputs and other control edges, table head rule, axis baseline (3:1) |
| `text-strong` | `#071529` | `#F9FBFF` | `text-strong` | Page and card titles, key figures |
| `text` | `#142338` | `#E1E8F3` | `text` | Body, numbers |
| `text-muted` | `#566479` | `#A2B1C6` | `muted` | Secondary text, labels, legends |
| `text-subtle` | `#566479` | `#A2B1C6` | `muted` | Meta, timestamps, axis ticks, placeholders (Tally has one meta ink) |
| `brand` | `#2F5CF6` | `#5784FF` | product colour | The logo mark. Equals `chart-1`. Never interactive |
| `primary` | `#1259B1` | `#69B1FF` | `action` | Primary button fill, checked checkbox and switch, current step |
| `primary-hover` | `#0E4896` | `#8BC8FF` | `action-hover` | Hover/pressed for primary |
| `primary-fg` | `#FFFFFF` | `#071529` | `on-action` | Text/icons on `primary` (dark mode: a lit key with a navy label) |
| `primary-soft` | `#DEEDFF` | `#0C325B` | `accent-soft` | Selected row and nav item, the brand row in tables |
| `accent` | `#1161BB` | `#69B1FF` | `accent` | Links, text buttons, the selected tab's bar, progress and meters |
| `accent-ink` | `#0F56A8` | `#8BC8FF` | `accent-ink` | Blue text on a tint (selected nav, "You" and "New" badges) |
| `accent-soft` | `#DEEDFF` | `#0C325B` | `accent-soft` | Tinted ground: the brand named inside an AI answer |
| `ring` | `#1161BB` | `#69B1FF` | `focus` (= `accent`) | Focus ring |
| `selection` | `#C6DEFC` | `#123F6F` | `selection` | Text selection |
| `mark` / `mark-ink` | `#D46700` / `#B14C00` | `#FA8C31` / `#FA8C31` | `mark` / `mark-ink` | The one highlighted figure of a section, as a 3px bar under it. Never a status, never a button. Defined, not used in the app today |
| `success` / `-soft` | `#197746` / `#E9F1EB` | `#5AD093` / `#183744` | `ok` | Good change, passed check, live |
| `warning` / `-soft` | `#8B6200` / `#F3EFE7` | `#F4CF5A` / `#2E3840` | `warn` | Needs attention, partial |
| `danger` / `-soft` | `#C12D30` / `#FCEBE9` | `#FA6B6D` / `#332C3F` | `bad` | Bad change, failed check, destructive |
| `info` / `-soft` | `#1161BB` / `#DEEDFF` | `#69B1FF` / `#0C325B` | `accent` (info) / `accent-soft` | Neutral notices, tips |
| `overlay` | navy at 48% | navy at 72% | `overlay` | Dialog and drawer scrim |
| `shadow-overlay` | `0 16px 48px` navy 14% | `0 16px 48px` navy 55% | `shadow.overlay` | Menus, popovers, tooltips, dialogs, drawers, toasts. Nothing else has a shadow |

Status tints (`*-soft`) are the status color mixed into `surface` in OKLab: 10% in light, 16% in dark.

Also in tokens: `chart-1…8`, `chart-other`, `sent-pos/neu/neg`, `heat-0…7` (Section 7). `shadow-md` and `shadow-lg` both resolve to `shadow-overlay`; `shadow-sm` is none.

**Static brand ramp** (theme-independent, `bg-brand-600` etc.), for illustrations, marketing and Art:

| 50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 950 |
|---|---|---|---|---|---|---|---|---|---|---|
| `#F4F7FE` | `#E5EDFF` | `#CBDBFE` | `#A5C0FE` | `#7AA1FE` | `#5784FF` | **`#2F5CF6`** | `#2348CE` | `#1B389B` | `#13296C` | `#0A1844` |

Light `brand` = brand-600. Dark `brand` = brand-500. Hue is fixed at OKLCH 266° (cobalt, deliberately short of violet).

### 6.2 Usage rules
- **Blue means measured or actionable.** `primary` (Tally action) fills the one primary button; `accent` marks links, focus, the selected tab and meters. Never decoration.
- **Cobalt is you.** The logo mark and `chart-1`: the tracked brand in every chart, the brand's own score ring, the focal element in illustrations. Never a button, a link or body text. Competitors never get cobalt or any other blue-family series color.
- **One primary button per view.** Everything else is secondary (surface + 1px `border-strong`) or ghost.
- **Status colors are reserved.** Never use `success`/`danger` as a series color. Always pair them with an icon or sign (`+`, `−`, check, x). Never rely on color alone. Red is a gap, not a mood. There is no orange status: orange is the mark, warnings are amber.
- **Soft fills carry their own ink.** `*-soft` backgrounds take the matching strong color as text (`bg-danger-soft text-danger`), or `accent-ink` on `accent-soft`.
- **No highlighter.** Overt 1.x marked the brand inside an AI answer with a lime highlighter. Tally has no such color, so the brand now sits on the tinted ground (`accent-soft`, ink `text-strong`) with a 2px underline in `chart-1`, the way competitors are underlined in their series color (the `<mark>` base style).
- **Depth is hue-true:** `well` < `bg` < `surface` < `surface-2`. No shadow at rest; only overlays take `shadow-overlay`. No gradients, glass, blur or glow.
- **Dark mode is designed, not inverted.** It takes Tally's dark values and its own chart steps, checked for the navy surfaces. Use tokens and never hard-code hex.
- **Use opacity sparingly.** Use it for disabled states (`opacity-50`) and the overlay scrim, not for building new colors.

### 6.3 Contrast (WCAG 2.x, computed)

Text needs 4.5:1; control edges, focus rings, marks and chart series need 3:1. Every pair below was computed from `brand/tokens.css`; all pass.

| Pair | Min | Light | Dark |
|---|---|---|---|
| `text` on `bg` · `surface` · `surface-2` · `well` · `primary-soft` | 4.5 | 14.62 · 15.82 · 13.94 · 13.57 · 13.31 | 14.84 · 13.59 · 12.34 · 15.66 · 10.50 |
| `text-strong` on `bg` · `surface` · `surface-2` · `well` · `accent-soft` | 4.5 | 16.90 · 18.29 · 16.11 · 15.69 · 15.38 | 17.65 · 16.17 · 14.68 · 18.64 · 12.49 |
| `text-muted` on `bg` · `surface` · `surface-2` · `well` · `primary-soft` | 4.5 | 5.55 · 6.01 · 5.29 · 5.15 · 5.05 | 8.40 · 7.69 · 6.98 · 8.86 · 5.94 |
| `accent` on `bg` · `surface` · `surface-2` · `accent-soft` | 4.5 | 5.62 · 6.08 · 5.36 · 5.12 | 8.13 · 7.44 · 6.76 · 5.75 |
| `accent-ink` on `accent-soft` · `bg` · `surface` | 4.5 | 6.06 · 6.65 · 7.20 | 7.27 · 10.28 · 9.41 |
| `primary-fg` on `primary` · `primary-hover` | 4.5 | 6.80 · 8.80 | 8.13 · 10.28 |
| `success` on `bg` · `surface` · `surface-2` · `success-soft` | 4.5 | 5.15 · 5.57 · 4.91 · 4.84 | 9.47 · 8.68 · 7.88 · 6.52 |
| `warning` on `bg` · `surface` · `surface-2` · `warning-soft` | 4.5 | 5.05 · 5.46 · 4.81 · 4.76 | 12.12 · 11.10 · 10.08 · 7.93 |
| `danger` on `bg` · `surface` · `surface-2` · `danger-soft` | 4.5 | 5.27 · 5.70 · 5.02 · 4.94 | 6.43 · 5.89 · 5.35 · 4.70 |
| `info` on `bg` · `surface` · `info-soft` | 4.5 | 5.62 · 6.08 · 5.12 | 8.13 · 7.44 · 5.75 |
| `text` on `success-soft` · `warning-soft` · `danger-soft` · `selection` | 4.5 | 13.75 · 13.80 · 13.71 · 11.49 | 10.21 · 9.70 · 10.83 · 8.67 |
| `mark-ink` on `bg` · `surface` | 4.5 | 4.97 · 5.38 | 7.72 · 7.07 |
| `border-strong` on `bg` · `surface` · `surface-2` · `well` | 3 | 3.42 · 3.70 · 3.26 · 3.17 | 3.94 · 3.61 · 3.28 · 4.16 |
| `ring` on `bg` · `surface` · `surface-2` · `well` | 3 | 5.62 · 6.08 · 5.36 · 5.22 | 8.13 · 7.44 · 6.76 · 8.58 |
| `primary` on `bg` · `surface` | 3 | 6.28 · 6.80 | 8.13 · 7.44 |
| `brand` on `bg` · `surface` | 3 | 4.87 · 5.27 | 5.36 · 4.90 |
| `mark` on `bg` · `surface` · `surface-2` | 3 | 3.38 · 3.66 · 3.22 | 7.72 · 7.07 · 6.42 |
| `chart-1` on `bg` · `surface` · `surface-2` | 3 | 4.87 · 5.27 · 4.65 | 5.36 · 4.90 · 4.45 |
| `chart-2` on `bg` · `surface` · `surface-2` | 3 | 3.42 · 3.70 · 3.26 | 4.94 · 4.52 · 4.11 |
| `chart-3` on `bg` · `surface` · `surface-2` | 3 | 3.55 · 3.84 · 3.38 | 4.77 · 4.36 · 3.96 |
| `chart-4` on `bg` · `surface` · `surface-2` | 3 | 3.74 · 4.05 · 3.57 | 5.76 · 5.28 · 4.79 |
| `chart-5` on `bg` · `surface` · `surface-2` | 3 | 4.32 · 4.67 · 4.11 | 5.07 · 4.64 · 4.21 |
| `chart-6` on `bg` · `surface` · `surface-2` | 3 | 4.01 · 4.34 · 3.83 | 5.33 · 4.88 · 4.44 |
| `chart-7` on `bg` · `surface` · `surface-2` | 3 | 3.31 · 3.58 · 3.15 | 5.11 · 4.68 · 4.25 |
| `chart-8` on `bg` · `surface` · `surface-2` | 3 | 3.41 · 3.69 · 3.25 | 4.95 · 4.53 · 4.12 |
| `chart-other` on `bg` · `surface` · `surface-2` | 3 | 5.55 · 6.01 · 5.29 | 3.79 · 3.47 · 3.15 |
| `sent-pos` on `bg` · `surface` · `surface-2` | 3 | 3.44 · 3.72 · 3.28 | 6.75 · 6.18 · 5.61 |
| `sent-neu` on `bg` · `surface` · `surface-2` | 3 | 5.55 · 6.01 · 5.29 | 3.79 · 3.47 · 3.15 |
| `sent-neg` on `bg` · `surface` · `surface-2` | 3 | 3.62 · 3.91 · 3.45 | 4.67 · 4.28 · 3.89 |
| heat labels (light): `text` on steps 0–5 | 4.5 | min 4.71 | — |
| heat labels (light): `white` on steps 6–7 | 4.5 | min 5.27 | — |
| heat labels (dark): `text` on steps 0–4 | 4.5 | — | min 4.64 |
| heat labels (dark): `bg` on steps 5–7 | 4.5 | — | min 5.36 |

Lowest pairs: light `chart-7` on `surface-2` 3.15 (non-text) and `warning` on `warning-soft` 4.76 (text); dark `chart-other` / `sent-neu` on `surface-2` 3.15 (non-text) and `danger` on `danger-soft` 4.70 (text). The white marker on the engine tiles (`EngineGlyph`) is at least 3.17:1 against its tile in both themes.

`border` (1.2–1.5:1) is a decorative hairline. Control edges use `border-strong`, which passes 3:1 on every surface; form fields also keep their visible label, and focus shows the 3:1+ `ring`.

---

## 7. Data visualization

The method follows our data-viz standard. Pick the chart form first, then assign color by the job it does, then validate. The palette below was validated with the standard validator (Machado CVD simulation, OKLab ΔE×100) against Tally's light and dark surfaces.

### 7.1 Categorical palette (fixed order, never cycled)

| Slot | Name | Light | Dark | Role |
|---|---|---|---|---|
| `chart-1` | **Cobalt** | `#2F5CF6` | `#5784FF` | **Always the brand being tracked.** It equals `brand`, never `primary` |
| `chart-2` | Ember | `#E5560F` | `#E5560F` | Competitor 1 |
| `chart-3` | Orchid | `#CF4FB9` | `#CF4FB9` | Competitor 2 |
| `chart-4` | Jade | `#009068` | `#16A478` | Competitor 3 |
| `chart-5` | Iris | `#8658E1` | `#976EF1` | Competitor 4 |
| `chart-6` | Ochre | `#9F7100` | `#B3821A` | Competitor 5 |
| `chart-7` | Lagoon | `#0794B0` | `#0794B0` | Competitor 6 |
| `chart-8` | Moss | `#818C01` | `#818C01` | Competitor 7 |
| `chart-other` | Slate | `#566479` | `#657386` | "Other" bucket, untracked entities (navy slate) |

Jade, Iris and Ochre are lifted in dark so they sit on the navy grounds; the other hues keep one value. The server still stores the original light hexes as slot keys (`web/src/lib/colors.ts` maps them to the tokens).

**Validation results.** Every color is ≥ 3:1 on `bg`, `surface` and `surface-2` in both themes (minimum 3.15, see 6.3). Worst adjacent CVD ΔE: 10.9 light, 9.5 dark (target 8). Worst adjacent normal-vision ΔE: 19.4 in both (floor 15). Brand plus the first three competitors also pass all-pairs (CVD ΔE 9.7 light, 9.5 dark; normal 21.3), so scatter plots and maps are safe up to four series.

**Rules**
- **Brand is always `chart-1`.** Competitors get `chart-2…8` in the order they appear in the project's competitor list. That order is stable and never re-sorted by rank.
- **Color follows the entity, not the rank.** Filtering or sorting must not repaint a competitor. Pass a stable `competitorId → slot` map.
- **More than 7 competitors?** Show the top 7 by share of voice. Fold the rest into `chart-other` labelled "Other". Never generate a 9th hue.
- **Scatter, bubble and maps:** at most 4 series (brand + 3). Beyond that, use small multiples.
- **Emphasize the brand:** in line charts the brand line is 2.5px, competitors 1.5px. In bar lists, the brand row gets `primary-soft` behind it.
- **Labels wear ink, not series color.** Values, legends and axis text use `text`/`text-muted`. A square color swatch carries the identity (only status dots are round).
- **Legend for ≥ 2 series.** Add direct end-of-line labels when there are ≤ 4 series. Never put a number on every point.
- **One y-axis.** Never use a dual axis. Different units mean two charts.
- **Recessive chrome:** grid lines `border`, baseline `border-strong`, ticks `text-subtle` at 12px (`text-2xs`).
- **Marks:** 2px lines, ≥ 8px point markers, square bar ends (1px radius) on `well` tracks, 2px `surface`-colored gaps between stacked segments.
- **Gaps are honest.** Days with no data render as gaps (`connectNulls={false}`), never zero.

**Engine series** (per-engine charts, where series are engines rather than brands): ChatGPT `chart-4` Jade · Claude `chart-2` Ember · Gemini `chart-5` Iris · Perplexity `chart-7` Lagoon · Grok `chart-6` Ochre · DeepSeek `chart-3` Orchid. This order passes adjacent CVD (ΔE 9.7 light, 10.2 dark). Engine colors are only for engine-series charts, never on the same chart as competitor series. Always show the engine name next to the color. Don't use vendor logos or brand colors.

### 7.2 Sequential ramp (heatmaps, prompt × engine grids)

Use one hue (cobalt), stepping from low to high. `heat-0` means zero or no data and equals `surface-2`.

| | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|---|
| Light | `#ECF1F8` | `#CEDCFB` | `#B0C8FD` | `#92B3FE` | `#769DFB` | `#5D87F5` | `#2F5CF6` | `#284CC3` |
| Dark | `#15263F` | `#25345A` | `#2B427E` | `#3250A4` | `#3B60C6` | `#5784FF` | `#87ABFF` | `#BCD1FF` |

- Lightness changes in steady, single-hue steps (validator: monotone, every gap ≥ 0.06 ΔL). In dark mode, "more" means brighter.
- **Cell labels:** light theme uses `text` on steps 0–5 (≥ 4.71:1) and white on 6–7 (≥ 5.27:1). Dark theme uses `text` on steps 0–4 (≥ 4.64:1) and `bg` ink on 5–7 (≥ 5.36:1).
- For ordered categories (tiers, funnel stages), start at step 4 so every step clears 2:1 against the surface.
- Bucket values into 5–7 steps with a legend. Don't use continuous gradients.
- **Diverging scale** (e.g. sentiment −1..1 over time): `sent-neg` ← `heat-0` gray midpoint → `sent-pos`, with equal steps on each side.

### 7.3 Sentiment

| Token | Light | Dark | Label | Icon (lucide) |
|---|---|---|---|---|
| `sent-pos` | `#039679` | `#1FB190` | Positive | `ThumbsUp` |
| `sent-neu` | `#566479` | `#657386` | Neutral | `Minus` |
| `sent-neg` | `#E5484D` | `#E5484D` | Negative | `ThumbsDown` |

All three are ≥ 3:1 on every light and dark surface. Positive vs neutral clears the normal-vision floor (ΔE 15.6 light, 18.1 dark); neutral vs negative sits at CVD ΔE 8.5 light and 8.4 dark. Sentiment never uses color alone: every chip, legend and tooltip carries the label or icon. Stack order is always Positive · Neutral · Negative. Sentiment colors are only for sentiment visuals, never as competitor colors.

### 7.4 Deltas & good/bad
- Color a delta by whether it's **good or bad**, not by its direction. Position going from 3.1 to 2.4 is an improvement, so it's `success`.
- Show an arrow icon and a sign along with the color: `ArrowUpRight +6 pts`. When there's no change or no previous data, use `text-subtle` and `—`.

### 7.5 Recharts / SVG notes
- Use the CSS vars directly: `stroke="var(--color-chart-1)"` or `fill="var(--color-sent-pos)"`. Theme switches then need no re-render.
- For canvas or exports, read the resolved value with `getComputedStyle(document.documentElement).getPropertyValue('--chart-1')`.
- Every chart has a hover layer (crosshair + tooltip for lines, per-mark for bars and cells). Tooltips use the `surface` bg, `border` and the overlay shadow, with mono values.

---

## 8. Typography

**The Google Sans family (Tally type), self-hosted.** One merged Latin + Latin-1 + Latin Extended-A WOFF2 per face, so Turkish renders from the font. The files and their OFL-1.1 texts live in `web/public/fonts/`; `web/src/index.css` declares them with `@font-face`, and `web/index.html` preloads the display face only. No third-party font requests.

| Family | File | Weights | Use |
|---|---|---|---|
| Google Sans | `google-sans-text.woff2` | 400, 500, 600 | All UI text, card and section titles |
| Google Sans Flex | `google-sans-flex-display.woff2` | 570 | Page titles, landing headlines, big figures (KPI values, score rings, report cover) |
| Google Sans Code | `google-sans-code.woff2` | 400, 500, 600 | Table numbers, deltas, percentages, IDs, user agents, URLs, llms.txt/schema/code |

Tailwind: `font-sans` (default body), `font-display` with `font-heading` (570), `font-mono`. Dark mode thins the text face a little (`GRAD −25`), so light text on navy doesn't look bolder. `font-synthesis: none`: no faked weights.

**Type scale** (px / line-height / weight / tracking)

| Role | Size | LH | Weight | Tracking | Family | Tailwind hint |
|---|---|---|---|---|---|---|
| Display (report cover, landing) | 34–56 | 40–58 | 570 | −0.012em | display | `font-display font-heading text-[40px] tracking-[-0.012em]` |
| KPI hero value | 36 | 40 | 570 | −0.012em | display | `font-display font-heading text-4xl` |
| H1 page title | 28 | 34 | 570 | −0.012em | display | `font-display font-heading text-[28px] leading-[34px]` |
| Stat tile value | 24 | 32 | 570 | −0.012em | display | `font-display font-heading text-2xl tnum` |
| Landing section title | 30–36 | 36–44 | 570 | −0.006em | display | `font-display font-heading text-3xl` |
| H2 section | 16 | 24 | 600 | 0 | sans | `text-base font-semibold text-text-strong` |
| H3 card title | 16 | 24 | 600 | 0 | sans | `text-base font-semibold text-text-strong` |
| Body large (answer transcripts, reports) | 16 | 24 | 400 | 0 | sans | `text-base` |
| Body (default UI) | 14 | 20 | 400 | 0 | sans | `text-sm` |
| Small (table cells) | 13 | 18 | 400 | 0 | sans | `text-[13px] leading-[18px]` |
| Code / numbers in tables | 13 | 20 | 400 | 0 | mono | `font-mono text-[13px]` |
| Label, legend, table head, badge, axis tick | 12 | 16 | 500 | 0 | sans | `text-xs font-medium` / `text-2xs` (both 12px) |

**Rules**
- Default body is 14px. This is a data product, and density beats air. Nothing is set below 12px.
- Weights: 400 for reading, 500 for UI labels and numbers, 600 for titles; the display face sets at 570. Nothing heavier, nothing thinner.
- Numbers in tables are mono and right-aligned. Every figure is tabular (`tnum`).
- Units are smaller and muted: `42` big, then `/100` in `text-muted` at about 60% size. Write `38%` with the % at the same size.
- **Sentence case everywhere. No uppercase labels, no letter-spaced caps** (the `eyebrow` utility is a 12px muted label in sentence case).
- Keep reading text at 60–75 characters per line (answer viewer, reports).

---

## 9. Iconography

- **lucide-react**, `strokeWidth={1.75}`, `absoluteStrokeWidth` off. Sizes: 14 (dense tables, inline), **16 (default)**, 20 (nav, buttons with large text), 24 (empty states only, on a 48px `surface-2` tile with a 6px radius).
- Color is `currentColor`, usually `text-muted`. Icons are only colored when they carry status, and then they match the status text.
- Don't use filled icons or emoji. Don't use **Sparkles, Wand or Brain** for "AI", which is the cliché we're avoiding.
- Suggested module icons: Monitor `Radar` · Diagnose `ScanSearch` · Plan `ListChecks` · Act `FilePen` · Report `Newspaper` · Crawlers `Bot` · AI Traffic `MousePointerClick` · AI Readiness `ShieldCheck` · Prompts `MessageSquareText` · Competitors `Users` · Sources `Link2` · Settings `Settings2` · Simulated `FlaskConical`.
- Status: `CheckCircle2` success · `AlertTriangle` warning · `XCircle` danger · `Info` info. Trends: `ArrowUpRight` / `ArrowDownRight` / `Minus`.

---

## 10. Layout & UI principles

1. **Calm surfaces, strong numbers.** Page `bg`, content on `surface` cards with a 1px `border` and `rounded-lg` (6px). No shadow. The KPI number is the loudest thing on screen, not the chrome.
2. **Color only where it means something** (see 6.2). A screen with no problems should look almost monochrome: navy ink, the action blue on what you can press, cobalt where your brand is plotted.
3. **Density.** Use a 4px spacing grid. Card padding is 16px (20px for KPI tiles), with a 16px gap between cards (24px between sections). Table rows are 40px (32px compact). Sidebar width 232px, content max-width 1440px.
4. **Elevation is functional and rare:** nothing at rest. Overlays (menus, popovers, tooltips, dialogs, drawers, toasts) take `shadow-overlay` (`shadow-md` / `shadow-lg`); modal dialogs and drawers sit on the navy `overlay` scrim. Depth otherwise comes from the surfaces (`well` < `bg` < `surface` < `surface-2`) and 1px borders. No glass or blur on sticky headers or bars.
5. **Radii (Tally):** `rounded-xs` 1px (cells, tracks, swatches), `rounded-sm` 2px (badges, tags, chips, checkbox, code), `rounded-md` 4px (buttons, inputs, menu items), `rounded-lg` 6px (cards, panels, popovers, dialogs). `rounded-xl` resolves to 6px too. No pills: `rounded-full` only for status dots (Live, receiving, running) and chart rings.
6. **KPI tile anatomy:** label (12px, sentence case, `text-subtle`), then the value in the display face with its muted unit, then the delta chip (icon + signed value, good/bad colored, 1px border), then a 1-line comparison ("vs prior 30 days"). An optional 32px sparkline in the brand series color shows only when the tile is wide enough for it (container query).
7. **Answer viewer:** body-large text, max 72 characters per line. Brand mentions sit on the tinted ground with a 2px underline in `chart-1` (the `<mark>` base style: `accent-soft`, ink `text-strong`). Competitor mentions get a 2px underline in their series color. Citations show as numbered mono chips that link to sources.
8. **Human-in-the-loop affordances.** Agent drafts always show as **Draft** (neutral badge) until a person approves them. The approve button is the single primary action. Nothing auto-publishes.
9. **Simulated badge:** neutral, not alarming. Use `bg-surface-2 text-text-muted border border-border`, the `FlaskConical` icon and the label "Simulated". Live uses a 6px `success` dot and the label "Live".
10. **Tags and badges:** 2px radius, 1px border (the status color at 40%, or `border` / `border-strong`), status or muted text on the matching tint. Never a filled pill.
11. **Tabs:** the selected tab carries a 2px `accent` bar and `text-strong` label. Segmented controls mark the selected segment with `surface` and a 1px `border-strong` edge.
12. **Tables:** 1px row rules, a `border-strong` rule under the head, head labels in `text-muted` weight 500 sentence case, numbers right-aligned, mono and tabular.
13. **Focus & motion:** one focus treatment everywhere: a 2px `ring` (accent) outline 2px off the element, never removed (menu items draw it inset; whole-card links draw it on the card). Transitions are 160ms or 220ms on `cubic-bezier(.2, 0, 0, 1)` (Tailwind `ease-out`), on color and opacity. Nothing scales, bounces or pings. Respect `prefers-reduced-motion`.
14. **Tables over charts** when the user needs to compare exact values. Every chart has a "View as table" toggle or CSV export.

---

## 11. Implementation notes (Frontend)

- **Import order** in the app stylesheet:
  ```css
  @import "tailwindcss";
  @import "../../brand/tokens.css";
  @custom-variant dark (&:where(.dark, .dark *));   /* class-based dark mode */
  ```
- **Fonts are self-hosted.** `web/src/index.css` declares the three faces with `@font-face` (`/fonts/*.woff2`, `font-display: swap`); `web/index.html` preloads only `google-sans-flex-display.woff2`. Don't add Google Fonts links or `@import`s.
- **Dark mode:** toggle the `dark` class on `<html>`. Every token switches automatically, so you rarely need `dark:` utilities. (Tally's own pages switch with `data-theme`; Overt keeps its class switch and maps the same values.)
- **Don't wrap `tokens.css` in `@layer`.** `@theme inline` maps `--shadow-*` onto same-named vars. That works only because our unlayered `:root`/`.dark` values beat Tailwind's layered theme declarations. Verified against Tailwind 4.3.3.
- **Base layer** (in `web/src/index.css`):
  ```css
  @layer base {
    * { border-color: var(--color-border); }
    html { background: var(--color-bg); color: var(--color-text); font-family: var(--font-sans); font-synthesis: none; font-variation-settings: "GRAD" var(--font-grade, 0); }
    .dark { --font-grade: -25; }
    h1 { font-family: var(--font-display); font-weight: var(--font-weight-heading); }
    ::selection { background: var(--color-selection); }
    mark { background: var(--color-accent-soft); color: var(--color-text-strong); border-radius: var(--radius-sm); text-decoration: underline 2px var(--color-chart-1); text-underline-offset: 3px; }
    :focus-visible { outline: 2px solid var(--color-ring); outline-offset: 2px; }
  }
  ```
- **Utility names:** `bg-well`, `bg-bg`, `bg-surface`, `bg-surface-2`, `text-text-strong`, `text-text`, `text-text-muted`, `text-text-subtle`, `border-border`, `border-border-strong`, `bg-primary text-primary-fg hover:bg-primary-hover`, `bg-primary-soft text-accent-ink`, `text-accent`, `bg-accent-soft text-accent-ink`, `text-success`, `bg-danger-soft`, `border-success/40`, `fill-chart-3`, `bg-sent-neg`, `bg-heat-4`, `ring-ring`, `bg-overlay`, `shadow-md`, `font-mono`, `font-display font-heading`, `rounded-xs`, `rounded-lg`, `bg-brand-600`, `text-2xs`.
- Extra tokens beyond the base contract: `well`, `text-strong`, `brand`, `accent-ink`, `accent-soft`, `selection`, `mark`, `mark-ink`, `overlay`, `shadow-overlay`, `info-soft`, `chart-other`, `heat-0…7`, `--font-weight-heading` (570) and `--text-2xs` (12px).

---

## 12. Logo direction (brief for Art)

**Concept: "the answer bubble."** One shape that reads two ways: a **speech bubble** (an AI's answer) and a **target or lens** (being seen). It's the O of *overt*.

**Mark**
- A perfect circle with its **bottom-left quadrant squared off** to a right angle. That corner reads as a speech-bubble tail without adding a tail shape.
- Inside, a **solid dot**, offset slightly up and right of center. That's *you*, named inside the answer. The dot can be ~30–34% of the outer diameter. Ring thickness ≈ dot radius, for optical balance.
- Single color. Cobalt `#2F5CF6` on light, `#5784FF` (or white) on dark. Ink `#0E1116` for mono use.
- Must survive 16px (favicon). At ≤ 24px, test a solid-bubble version with the dot knocked out.

**Wordmark**
- `overt` in lowercase, based on Schibsted Grotesk Bold/ExtraBold, tracked about −2%, with the mark as a standalone symbol to the left. Alternatively, the mark can replace the "o" in the wordmark. Art to explore both and recommend one.
- Custom touches are welcome but small. Try a flat-cut terminal on the "t" and tighter "rt" spacing. It should look engineered, not playful.

**Do**
- Keep it geometric, flat and one color. Leave clear space of at least the dot's diameter on every side.
- Make it work on `bg`, `surface` and cobalt (reversed, white on `#2F5CF6`).
- Optional secondary graphic for marketing and the OG image: the "you're named" moment, a word marked inside an AI-answer snippet. (1.x drew it as a lime highlighter swipe, `#E2F366`. Under Tally it is the tinted ground with a cobalt underline, as in the app, see 10.7; `web/public/og.png` draws it that way.)

**Don't**
- No sparkles, stars, brains, robots, chat-bot faces, eyes with lashes, or magnifying glasses.
- No purple, no gradients, no glow or neon, no 3D.
- Don't put the "you're named" marking (tint, underline or the old lime) in the logo itself. It's a product moment, not the identity.
- Don't rotate, outline, stretch or recolor it outside the palette. Don't put it on busy photos.

**Deliverables expected from Art** (in `brand/assets/` and `web/public/`): `logo.svg` (mark + wordmark, light), `logo-dark.svg`, `mark.svg`, `favicon.svg` (+ 32px PNG), and an OG image (1200×630) on the dark `bg` (`#071529`, Tally's presentation default) with the tagline "Be the answer."
