// Human visits arriving from AI assistants (clicked citations / links in answers).
// Matched by the Referer hostname (exact or any subdomain) or by utm_source on the
// landing URL; ChatGPT appends `utm_source=chatgpt.com` to links it cites, which also
// covers app clicks that send no Referer.
//
// `hosts` entries may carry a path prefix ('huggingface.co/chat') for assistants that live
// under a broader domain. Browsers usually send only the origin cross-site, so those entries
// match rarely; they never make the whole domain count as AI traffic.
// Android apps send `android-app://<package>/`, so app package ids are listed as hosts too.
import type { AiReferrer } from '../../../shared/types.ts';

export const AI_REFERRERS: AiReferrer[] = [
  {
    id: 'chatgpt',
    name: 'ChatGPT',
    operator: 'OpenAI',
    hosts: ['chatgpt.com', 'chat.openai.com', 'com.openai.chatgpt'],
    utmSources: ['chatgpt.com', 'chatgpt', 'chat.openai.com'],
  },
  {
    id: 'perplexity',
    name: 'Perplexity',
    operator: 'Perplexity',
    hosts: ['perplexity.ai', 'perplexity.com', 'ai.perplexity.app.android'],
    utmSources: ['perplexity', 'perplexity.ai'],
  },
  {
    id: 'gemini',
    name: 'Gemini',
    operator: 'Google',
    hosts: ['gemini.google.com', 'bard.google.com', 'com.google.android.apps.bard'],
    utmSources: ['gemini', 'gemini.google.com', 'bard'],
  },
  {
    id: 'notebooklm',
    name: 'NotebookLM',
    operator: 'Google',
    hosts: ['notebooklm.google.com', 'notebooklm.google'],
    utmSources: ['notebooklm'],
  },
  {
    id: 'claude',
    name: 'Claude',
    operator: 'Anthropic',
    hosts: ['claude.ai', 'com.anthropic.claude'],
    utmSources: ['claude', 'claude.ai'],
  },
  {
    id: 'copilot',
    name: 'Microsoft Copilot',
    operator: 'Microsoft',
    hosts: ['copilot.microsoft.com', 'copilot.cloud.microsoft', 'copilot.com', 'edgeservices.bing.com', 'bing.com/chat', 'com.microsoft.copilot'],
    utmSources: ['copilot', 'copilot.com', 'copilot.microsoft.com'],
  },
  {
    id: 'meta-ai',
    name: 'Meta AI',
    operator: 'Meta',
    hosts: ['meta.ai'],
    utmSources: ['meta.ai', 'meta_ai'],
  },
  {
    id: 'grok',
    name: 'Grok',
    operator: 'xAI',
    hosts: ['grok.com', 'x.com/i/grok', 'ai.x.grok'],
    utmSources: ['grok', 'grok.com'],
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    operator: 'DeepSeek',
    hosts: ['chat.deepseek.com', 'deepseek.com', 'com.deepseek.chat'],
    utmSources: ['deepseek', 'chat.deepseek.com'],
  },
  {
    id: 'mistral',
    name: 'Mistral Vibe',
    operator: 'Mistral AI',
    hosts: ['chat.mistral.ai'],
    utmSources: ['mistral', 'chat.mistral.ai'],
  },
  {
    id: 'you',
    name: 'You.com',
    operator: 'You.com',
    hosts: ['you.com'],
    utmSources: ['you.com'],
  },
  {
    id: 'phind',
    name: 'Phind',
    operator: 'Phind',
    hosts: ['phind.com'],
    utmSources: ['phind', 'phind.com'],
  },
  {
    id: 'poe',
    name: 'Poe',
    operator: 'Quora',
    hosts: ['poe.com'],
    utmSources: ['poe', 'poe.com'],
  },
  {
    id: 'huggingchat',
    name: 'HuggingChat',
    operator: 'Hugging Face',
    hosts: ['huggingface.co/chat'],
    utmSources: ['huggingchat'],
  },
  {
    id: 'kagi-assistant',
    name: 'Kagi Assistant',
    operator: 'Kagi',
    hosts: ['kagi.com/assistant'],
    utmSources: ['kagi-assistant'],
  },
  {
    id: 'duck-ai',
    name: 'Duck.ai',
    operator: 'DuckDuckGo',
    hosts: ['duck.ai'],
    utmSources: ['duck.ai'],
  },
  {
    id: 'kimi',
    name: 'Kimi',
    operator: 'Moonshot AI',
    hosts: ['kimi.com', 'kimi.ai', 'kimi.moonshot.cn'],
    utmSources: ['kimi', 'kimi.com'],
  },
  {
    id: 'qwen',
    name: 'Qwen Chat',
    operator: 'Alibaba',
    hosts: ['chat.qwen.ai'],
    utmSources: ['qwen', 'chat.qwen.ai'],
  },
  {
    id: 'doubao',
    name: 'Doubao',
    operator: 'ByteDance',
    hosts: ['doubao.com'],
    utmSources: ['doubao'],
  },
];

const BY_ID = new Map(AI_REFERRERS.map((r) => [r.id, r]));

export function referrerById(id: string): AiReferrer | undefined {
  return BY_ID.get(id);
}

interface HostRule {
  host: string;
  path: string; // '' or a prefix like '/chat'
  ref: AiReferrer;
}

const HOST_RULES: HostRule[] = AI_REFERRERS.flatMap((ref) =>
  ref.hosts.map((h) => {
    const slash = h.indexOf('/');
    return slash < 0
      ? { host: h.toLowerCase(), path: '', ref }
      : { host: h.slice(0, slash).toLowerCase(), path: h.slice(slash).toLowerCase(), ref };
  }),
);

const UTM_SOURCES = new Map<string, AiReferrer>();
for (const ref of AI_REFERRERS) for (const s of ref.utmSources ?? []) UTM_SOURCES.set(s.toLowerCase(), ref);

/** Parses absolute URLs, scheme-less hosts ('chatgpt.com/…') and android-app:// referrers. */
function parseUrl(raw: string): URL | null {
  const s = raw.trim();
  if (!s) return null;
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
}

function hostMatches(hostname: string, ruleHost: string): boolean {
  return hostname === ruleHost || hostname.endsWith(`.${ruleHost}`);
}

function matchByHost(referrer: string): AiReferrer | null {
  const u = parseUrl(referrer);
  if (!u) return null;
  const hostname = u.hostname.toLowerCase().replace(/^www\./, '');
  const path = u.pathname.toLowerCase();
  let best: HostRule | null = null;
  for (const rule of HOST_RULES) {
    if (!hostMatches(hostname, rule.host)) continue;
    if (rule.path && !(path === rule.path || path.startsWith(`${rule.path}/`))) continue;
    // Prefer the most specific rule (longest host + path).
    if (!best || rule.host.length + rule.path.length > best.host.length + best.path.length) best = rule;
  }
  return best?.ref ?? null;
}

function matchByUtm(url: string): AiReferrer | null {
  const u = parseUrl(url.startsWith('/') ? `https://landing.invalid${url}` : url);
  const src = u?.searchParams.get('utm_source')?.trim().toLowerCase();
  return src ? (UTM_SOURCES.get(src) ?? null) : null;
}

/** Matches a referrer URL (and/or landing URL with utm_source) to an AI assistant, or null. */
export function matchReferrer(referrer: string, url?: string): AiReferrer | null {
  return (referrer ? matchByHost(referrer) : null) ?? (url ? matchByUtm(url) : null);
}
