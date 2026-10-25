// Tiny Markdown subset parser for AI answers (simulated and live). No dependency, no HTML:
// it returns a plain tree that AnswerText renders with React elements, so nothing is ever
// injected as markup. Covers what assistants actually emit: paragraphs, headings, **bold**,
// *italic*, `code`, links, bare URLs, [n] citation markers, ordered/bulleted (nested) lists,
// blockquotes, fenced code, horizontal rules and simple pipe tables.

export type Inline =
  | { t: 'text'; v: string }
  | { t: 'strong'; c: Inline[] }
  | { t: 'em'; c: Inline[] }
  | { t: 'code'; v: string }
  | { t: 'link'; href: string; c: Inline[]; citationLike: boolean }
  | { t: 'cite'; n: number };

export interface ListItem {
  c: Inline[];
  children?: Block[];
}

export type Block =
  | { t: 'p'; c: Inline[] }
  | { t: 'h'; level: number; c: Inline[] }
  | { t: 'list'; ordered: boolean; start: number; items: ListItem[] }
  | { t: 'quote'; c: Block[] }
  | { t: 'code'; v: string }
  | { t: 'hr' }
  | { t: 'table'; head: Inline[][]; rows: Inline[][][] };

const LIST_RE = /^(\s*)([-*+•]|\d{1,3}[.)])\s+(.*)$/;
const TABLE_SEP = /^\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?$/;
const DOMAIN_LIKE = /^[\w-]+(\.[\w-]+)*\.[a-z]{2,}$/i;

/** Only web and mail links survive; anything else (javascript:, data:, relative) renders as text. */
export function safeHref(raw: string): string | null {
  const href = raw.trim().replace(/^<|>$/g, '');
  return /^(https?:\/\/|mailto:)/i.test(href) ? href : null;
}

const indentOf = (line: string) => line.length - line.trimStart().length;
const isOrdered = (marker: string) => /\d/.test(marker);

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

function dedent(lines: string[]): string[] {
  const min = Math.min(...lines.filter((l) => l.trim()).map(indentOf));
  return lines.map((l) => l.slice(Number.isFinite(min) ? min : 0));
}

function parseList(lines: string[], start: number): [Block, number] {
  const first = LIST_RE.exec(lines[start]!)!;
  const base = first[1]!.length;
  const ordered = isOrdered(first[2]!);
  const startNum = ordered ? Number.parseInt(first[2]!, 10) || 1 : 1;
  const items: { text: string; sub: string[] }[] = [];
  let i = start;
  while (i < lines.length) {
    const line = lines[i]!;
    if (!line.trim()) {
      // A blank line continues the list only when the next content is still part of it.
      let j = i + 1;
      while (j < lines.length && !lines[j]!.trim()) j++;
      const next = j < lines.length ? LIST_RE.exec(lines[j]!) : null;
      const nested = j < lines.length && indentOf(lines[j]!) > base + 1;
      if ((next && indentOf(lines[j]!) <= base + 1 && isOrdered(next[2]!) === ordered) || (nested && items.length)) {
        i = j;
        continue;
      }
      break;
    }
    const m = LIST_RE.exec(line);
    const indent = indentOf(line);
    if (m && indent <= base + 1) {
      if (isOrdered(m[2]!) !== ordered) break;
      items.push({ text: m[3]!, sub: [] });
      i++;
      continue;
    }
    if (indent > base + 1 && items.length) {
      items[items.length - 1]!.sub.push(line);
      i++;
      continue;
    }
    break;
  }
  return [
    {
      t: 'list',
      ordered,
      start: startNum,
      items: items.map((it) => ({ c: parseInline(it.text), children: it.sub.length ? parseBlocks(dedent(it.sub).join('\n')) : undefined })),
    },
    i,
  ];
}

/** Block-level parse. Never throws: anything unrecognised becomes a paragraph. */
export function parseBlocks(src: string): Block[] {
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => {
    if (para.length) out.push({ t: 'p', c: parseInline(para.join(' ')) });
    para = [];
  };
  let i = 0;
  while (i < lines.length) {
    const line = lines[i]!;
    const trimmed = line.trim();
    if (!trimmed) {
      flush();
      i++;
      continue;
    }
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      flush();
      const fence = trimmed.slice(0, 3);
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i]!.trim().startsWith(fence)) buf.push(lines[i++]!);
      i++;
      out.push({ t: 'code', v: buf.join('\n') });
      continue;
    }
    const h = /^(#{1,6})\s+(.*?)\s*#*$/.exec(trimmed);
    if (h) {
      flush();
      out.push({ t: 'h', level: h[1]!.length, c: parseInline(h[2]!) });
      i++;
      continue;
    }
    if (/^([-*_])(\s*\1){2,}$/.test(trimmed)) {
      flush();
      out.push({ t: 'hr' });
      i++;
      continue;
    }
    if (trimmed.startsWith('|') && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]!.trim())) {
      flush();
      const head = splitRow(trimmed).map(parseInline);
      const rows: Inline[][][] = [];
      i += 2;
      while (i < lines.length && lines[i]!.trim().startsWith('|')) rows.push(splitRow(lines[i++]!).map(parseInline));
      out.push({ t: 'table', head, rows });
      continue;
    }
    if (trimmed.startsWith('>')) {
      flush();
      const buf: string[] = [];
      while (i < lines.length && lines[i]!.trim().startsWith('>')) buf.push(lines[i++]!.trim().replace(/^>\s?/, ''));
      out.push({ t: 'quote', c: parseBlocks(buf.join('\n')) });
      continue;
    }
    if (LIST_RE.test(line)) {
      flush();
      const [block, next] = parseList(lines, i);
      out.push(block);
      i = next;
      continue;
    }
    para.push(trimmed);
    i++;
  }
  flush();
  return out;
}

const STRONG = /^(\*\*|__)(?!\s)([\s\S]+?)(?<!\s)\1/;
const EM_STAR = /^\*(?![\s*])([^*]+?)(?<!\s)\*(?!\*)/;
const EM_UNDER = /^_(?![\s_])([^_]+?)(?<!\s)_(?![\p{L}\p{N}])/u;
const CITES = /^\[(\d{1,3}(?:\s*,\s*\d{1,3})*)\](?!\()/;
const LINK = /^\[([^\]]+)\]\(\s*(<[^>]*>|[^\s()]+(?:\([^\s()]*\)[^\s()]*)*)(?:\s+"[^"]*")?\s*\)/;
const BARE_URL = /^https?:\/\/[^\s<>"'`]+/;

/** Inline parse: emphasis, code, links, bare URLs and [n] citation markers. */
export function parseInline(src: string): Inline[] {
  const out: Inline[] = [];
  let buf = '';
  const push = (node: Inline) => {
    if (buf) out.push({ t: 'text', v: buf });
    buf = '';
    out.push(node);
  };
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    const prev = i > 0 ? src[i - 1]! : '';
    const rest = src.slice(i);
    if (ch === '\\' && i + 1 < src.length && /[\\`*_[\]()#+\-.!|>~]/.test(src[i + 1]!)) {
      buf += src[i + 1];
      i += 2;
      continue;
    }
    if (ch === '`') {
      const end = src.indexOf('`', i + 1);
      if (end > i + 1) {
        push({ t: 'code', v: src.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }
    if (ch === '*' || ch === '_') {
      const strong = STRONG.exec(rest);
      if (strong && (ch === '*' || !/[\p{L}\p{N}]/u.test(prev))) {
        push({ t: 'strong', c: parseInline(strong[2]!) });
        i += strong[0].length;
        continue;
      }
      const em = ch === '*' ? EM_STAR.exec(rest) : !/[\p{L}\p{N}]/u.test(prev) ? EM_UNDER.exec(rest) : null;
      if (em) {
        push({ t: 'em', c: parseInline(em[1]!) });
        i += em[0].length;
        continue;
      }
    }
    if (ch === '[') {
      const cites = CITES.exec(rest);
      if (cites) {
        for (const n of cites[1]!.split(',')) push({ t: 'cite', n: Number.parseInt(n.trim(), 10) });
        i += cites[0].length;
        continue;
      }
      const link = LINK.exec(rest);
      if (link) {
        const href = safeHref(link[2]!);
        const label = link[1]!.trim();
        if (href) {
          push({ t: 'link', href, c: parseInline(label), citationLike: DOMAIN_LIKE.test(label) || /^https?:\/\//.test(label) });
        } else {
          // Unsafe or relative target: keep the label, drop the link.
          if (buf) out.push({ t: 'text', v: buf });
          buf = '';
          out.push(...parseInline(label));
        }
        i += link[0].length;
        continue;
      }
    }
    if (ch === 'h' && !/[\p{L}\p{N}]/u.test(prev)) {
      const url = BARE_URL.exec(rest);
      if (url) {
        // Trailing punctuation belongs to the sentence, not the URL.
        const clean = url[0].replace(/[.,;:!?)\]]+$/, '');
        push({ t: 'link', href: clean, c: [{ t: 'text', v: clean.replace(/^https?:\/\/(www\.)?/, '') }], citationLike: true });
        i += clean.length;
        continue;
      }
    }
    buf += ch;
    i++;
  }
  if (buf) out.push({ t: 'text', v: buf });
  return out;
}

/** Plain-text version of an answer (for snippets and copy): markers, emphasis and URLs removed. */
export function toPlainText(markdown: string): string {
  return markdown
    .replace(/\r\n?/g, '\n')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/\(\s*\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)\s*\)/g, '')
    .replace(/!?\[([^\]]*)\]\((https?:\/\/[^\s()]+(?:\([^\s()]*\)[^\s()]*)*)\)/g, (_m, label: string) => (DOMAIN_LIKE.test(label.trim()) ? '' : label.trim()))
    .replace(/\[([^\]]+)\]\([^)]*\)+/g, '$1')
    .replace(/https?:\/\/[^\s<>()"'`]+/g, '')
    .replace(/^\s*([-*_])(\s*\1){2,}\s*$/gm, '')
    .replace(/\[\d+(?:\s*,\s*\d+)*\]/g, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^\s*(?:[-*+•]|\d{1,3}[.)])\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/^\s*\|?(\s*:?-{2,}:?\s*\|)+\s*$/gm, '')
    .replace(/\|/g, ' ')
    .replace(/\*\*|__|~~|[*`]/g, '')
    .replace(/(^|[^\p{L}\p{N}])_([^_\n]+)_(?![\p{L}\p{N}])/gu, '$1$2')
    .replace(/\(\s*\)/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim();
}

/** First `max` characters of plain text, cut on a word boundary. */
export function snippet(text: string, max = 220): string {
  const flat = text.replace(/\s*\n\s*/g, ' ').trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:.—–-]+$/, '')}…`;
}
