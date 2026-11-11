# brand/

| Path | What |
|---|---|
| [`ai/BRAND.md`](ai/BRAND.md) | **The brand guide.** This product is **ai visibility**, one of the Analitik İşler ai tools; the guide is shared by the whole family (copied from `design/13-ai-brand/` in the analitikisler.com repo, 25 Oct 2026). |
| [`ai/board.html`](ai/board.html) | Every logo, icon and brand colour on one page, light and dark. |
| [`ai/assets/`](ai/assets/) | Logo files: `lockups/ai-visibility-*.svg`, `icons/ai-visibility-*.svg`, `icons/favicon-ai-*.svg`, the ai mark and the Analitik İşler master logo. |
| [`ai/tokens.css`](ai/tokens.css), [`ai/tokens.json`](ai/tokens.json) | The four brand colours (ink, paper, the red point, pencil). |
| [`tokens.css`](tokens.css), [`tokens.json`](tokens.json) | The **UI** tokens the web app imports (`web/src/index.css`). Since 25 Oct 2026 `brand` (chart-1) is Tally's blue (`#1161BB` / `#69B1FF`, 5.7 : 1 on white) and `point` is the ai red (`#C12D30` / `#FA6B6D`); the Overt blue is gone. |
| [`COPY.md`](COPY.md) | The UI copy deck for review: the main strings of `web/src/content/copy.ts`, which holds the full set. Voice rules now come from `ai/BRAND.md` §11. |
| [`retired/overt/`](retired/overt/) | The old Overt guide and logos. The identity (name, logo, blue, tagline) is history; the guide's UI sections (§4 writing metrics, empty states and errors; §6–11 colour, charts, type, layout) still describe the app and are what `BRAND §N` in code comments refers to. |

When the ai guide changes, copy `design/13-ai-brand/` from the analitikisler.com repo over `brand/ai/` again.
