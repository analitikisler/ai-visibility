// File name + payload for downloading an agent draft (llms.txt, robots.txt, JSON-LD, markdown).
import type { Draft } from '@shared/types';

export interface DraftFile {
  filename: string;
  content: string;
  mime: string;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'draft';

/** Last path segment of the draft's suggested URL (`/compare/acme-vs-globex` → `acme-vs-globex`). */
function urlSlug(meta: Record<string, unknown>): string | null {
  const url = typeof meta.url === 'string' ? meta.url : null;
  if (!url) return null;
  try {
    const seg = new URL(url, 'https://x.invalid').pathname.split('/').filter(Boolean).pop();
    return seg ? slug(seg) : null;
  } catch {
    return null;
  }
}

/**
 * JSON-LD drafts are stored as a `<script type="application/ld+json">` block (with every `<` escaped as `\u003c`
 * so the body can't close the script early); the .json download is the bare object, pretty-printed. If the body
 * isn't valid JSON (e.g. hand-edited), the raw text is kept so nothing the person wrote is lost.
 */
export function stripJsonLdScript(body: string): string {
  const m = /<script[^>]*>([\s\S]*?)<\/script>/i.exec(body);
  const raw = (m ? m[1]! : body).replace(/<\\\//g, '</').trim();
  try {
    return `${JSON.stringify(JSON.parse(raw), null, 2)}\n`;
  } catch {
    return `${raw}\n`;
  }
}

/** Sensible file for a draft: `llms.txt`, `robots.txt`, `structured-data.json`, otherwise `<slug>.md`. */
export function draftFile(d: Pick<Draft, 'kind' | 'title' | 'body' | 'meta'>): DraftFile {
  switch (d.kind) {
    case 'llms_txt':
      return { filename: 'llms.txt', content: d.body, mime: 'text/plain' };
    case 'robots_txt':
      return { filename: 'robots.txt', content: d.body, mime: 'text/plain' };
    case 'schema_jsonld':
      return { filename: 'structured-data.json', content: stripJsonLdScript(d.body), mime: 'application/json' };
    default:
      return { filename: `${urlSlug(d.meta) ?? slug(d.title)}.md`, content: d.body, mime: 'text/markdown' };
  }
}

/** Save text as a file in the browser (user-initiated). */
export function downloadText(file: DraftFile) {
  const blob = new Blob([file.content], { type: `${file.mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = file.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
