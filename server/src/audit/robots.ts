// robots.txt parsing and evaluation following RFC 9309 (as implemented by Google's open-source parser):
// - consecutive User-agent lines form one group; a User-agent line after a rule starts a new group
// - all groups naming the same product token are merged; `*` groups apply only when no group names the agent
// - the longest matching pattern wins; on a tie Allow wins; `*` wildcards and a trailing `$` anchor are supported
import type { AiAgent, RobotsAgentRule } from '../../../shared/types.ts';

export interface RobotsRule {
  allow: boolean;
  pattern: string;
}
export interface RobotsGroup {
  agents: string[];   // normalized product tokens ('*' for wildcard)
  names: string[];    // User-agent values as written
  rules: RobotsRule[];
}
export interface ParsedRobots {
  groups: RobotsGroup[];
  sitemaps: string[];
}
export type Access = RobotsAgentRule['allowed'];

const KEY_ALIASES: Record<string, string> = {
  'user-agent': 'user-agent', useragent: 'user-agent', 'user agent': 'user-agent',
  allow: 'allow', disallow: 'disallow', dissallow: 'disallow', disalow: 'disallow', 'dis-allow': 'disallow',
  sitemap: 'sitemap', 'site-map': 'sitemap',
};

/** Product token as robots matchers compare it: lowercase, cut at the first space or '/'. */
export function normalizeToken(value: string): string {
  const v = value.trim().toLowerCase();
  return v === '*' ? '*' : (v.split(/[\s/]/)[0] ?? '');
}

/**
 * Does a robots pattern match a path? `*` matches any run, a trailing `$` anchors the end, otherwise it is a prefix
 * match. Greedy two-pointer wildcard matching — O(pattern × path) worst case, unlike a `.*`-joined regex, which
 * backtracks exponentially on hostile patterns such as `/*a*a*a*a*a*b`.
 */
export function patternMatches(pattern: string, path: string): boolean {
  const anchored = pattern.endsWith('$');
  const p = anchored ? pattern.slice(0, -1) : `${pattern}*`;
  let i = 0;
  let j = 0;
  let star = -1;
  let mark = 0;
  while (j < path.length) {
    if (i < p.length && p[i] === '*') {
      star = i++;
      mark = j;
    } else if (i < p.length && p[i] === path[j]) {
      i++;
      j++;
    } else if (star >= 0) {
      i = star + 1;
      j = ++mark;
    } else return false;
  }
  while (i < p.length && p[i] === '*') i++;
  return i === p.length;
}

export function parseRobots(text: string): ParsedRobots {
  const groups: RobotsGroup[] = [];
  const sitemaps: string[] = [];
  let current: RobotsGroup | null = null;
  let inAgentLines = false;
  for (const rawLine of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = KEY_ALIASES[line.slice(0, idx).trim().toLowerCase()];
    const value = line.slice(idx + 1).trim();
    if (key === 'user-agent') {
      if (!current || !inAgentLines) {
        current = { agents: [], names: [], rules: [] };
        groups.push(current);
      }
      const token = normalizeToken(value);
      if (token) {
        current.agents.push(token);
        current.names.push(value);
      }
      inAgentLines = true;
    } else if (key === 'allow' || key === 'disallow') {
      inAgentLines = false;
      // Rules before any User-agent line belong to no group; an empty Disallow means "allow everything".
      if (!current || !value) continue;
      const pattern = value.startsWith('/') || value.startsWith('*') ? value : `/${value}`;
      current.rules.push({ allow: key === 'allow', pattern });
    } else if (key === 'sitemap' && /^https?:\/\//i.test(value)) {
      sitemaps.push(value);
    }
  }
  return { groups, sitemaps: [...new Set(sitemaps)] };
}

/** Rules applying to an agent: merged groups for its first token that has a group, else merged `*` groups. */
export function rulesFor(parsed: ParsedRobots, tokens: string[]): { rules: RobotsRule[]; specific: boolean } {
  for (const t of tokens.map(normalizeToken)) {
    const gs = parsed.groups.filter((g) => g.agents.includes(t));
    if (gs.length) return { rules: gs.flatMap((g) => g.rules), specific: true };
  }
  return { rules: parsed.groups.filter((g) => g.agents.includes('*')).flatMap((g) => g.rules), specific: false };
}

/** Longest-match evaluation; no matching rule ⇒ allowed. */
export function isAllowed(rules: RobotsRule[], path: string): boolean {
  if (path === '/robots.txt') return true;
  let best: { allow: boolean; len: number } | null = null;
  for (const r of rules) {
    if (!patternMatches(r.pattern, path)) continue;
    const len = r.pattern.length;
    if (!best || len > best.len || (len === best.len && r.allow && !best.allow)) best = { allow: r.allow, len };
  }
  return best ? best.allow : true;
}

/**
 * Effective access for an agent over representative site paths:
 * blocked (nothing allowed), partial (root or some sampled pages blocked), allowed (a group names the agent
 * and everything sampled is allowed), unspecified (no group names the agent; allowed by default/`*`).
 */
export function agentAccess(parsed: ParsedRobots, tokens: string[], samplePaths: string[]): Access {
  const { rules, specific } = rulesFor(parsed, tokens);
  const paths = samplePaths.length ? samplePaths : ['/'];
  const allowedCount = paths.filter((p) => isAllowed(rules, p)).length;
  if (allowedCount === 0) return 'blocked';
  if (allowedCount < paths.length || !isAllowed(rules, '/')) return 'partial';
  return specific ? 'allowed' : 'unspecified';
}

/** Per-agent robots status for every catalog agent that has robots tokens (SEO tools excluded). */
export function robotsAgentRules(parsed: ParsedRobots | null, agents: AiAgent[], samplePaths: string[]): RobotsAgentRule[] {
  return agents
    .filter((a) => a.robotsTokens.length > 0 && a.category !== 'seo_tool')
    .map((a) => ({
      agentId: a.id,
      agentName: a.name,
      operator: a.operator,
      category: a.category,
      allowed: parsed ? agentAccess(parsed, a.robotsTokens, samplePaths) : 'unspecified',
    }));
}
