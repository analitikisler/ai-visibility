# brand/

ai visibility is one of the Analitik İşler ai tools. It has no brand of its own: it takes the family guide and the
Analitik İşler design kit.

| Where | What |
|---|---|
| **BRAND.md v1.1** (11 Nov 2026) | **The brand guide** for the whole ai tool family: naming, the lockups, app icons and favicons, voice. It is kept with the Analitik İşler design files (`13-ai-brand/BRAND.md`), not in this repo. |
| [`web/src/cini/`](../web/src/cini/) | **Çini · Mercan**, the Analitik İşler design kit, copied unchanged: colour roles (light and dark), Gabarito and Azeret Mono, the Pano pattern, the missing-data hatch, and every logo (`logos/lockups/ai-visibility-*.svg`, `logos/icons/ai-visibility-*.svg`, `logos/icons/favicon-ai-*.svg`, the ai mark and the master logo). Read its [`README.md`](../web/src/cini/README.md) for the rules. |
| [`COPY.md`](COPY.md) | The UI copy deck (mirror of `web/src/content/copy.ts`). Voice rules come from BRAND.md v1.1 §11. |

To update the kit, rebuild it in the design files (`cini-kit/`) and copy its `dist/` over `web/src/cini/` again.
Don't edit the kit's files here.
