// px.js — tiny, dependency-free AI-referral beacon. Built once from the referrer catalog.
// The client pre-filters with a coarse host/utm regex and sends raw values; the server decides via classifyReferrer.
import { referrerCatalog } from './catalog.ts';

const MAX_BYTES = 1500;

/**
 * Minimal substring alternation: path-based hosts are dropped (document.referrer is usually origin-only and
 * "bing.com" alone would match all search traffic), and tokens containing a shorter token are redundant.
 */
function tokenRegex(tokens: string[]): string {
  const uniq = [...new Set(tokens.map((t) => t.toLowerCase().trim()).filter((t) => t && !t.includes('/')))];
  return uniq
    .filter((t) => !uniq.some((o) => o !== t && t.includes(o)))
    .sort()
    .map((t) => t.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'))
    .join('|');
}

function build(tokens: string[]): string {
  return `/*! ai visibility AI-referral pixel */(function(){try{var d=document,s=d.currentScript||d.querySelector('script[src*="px.js"][data-key]'),k=s&&s.getAttribute("data-key");if(!k)return;var l=location,r=d.referrer||"",u=new URLSearchParams(l.search).get("utm_source")||"",h="";try{h=r?new URL(r).hostname:""}catch(e){}if(h&&h===l.hostname)return;var re=/${tokenRegex(tokens)}/i;if(!re.test(h)&&!re.test(u))return;var i="";try{var st=sessionStorage;i=st.getItem("_ovt_s")||"";if(!i){i=Math.random().toString(36).slice(2)+Date.now().toString(36);st.setItem("_ovt_s",i)}}catch(e){}var b=JSON.stringify({p:l.pathname,r:r,u:l.href,s:i}),e=new URL(s.src,l.href).origin+"/api/collect/"+encodeURIComponent(k);if(!(navigator.sendBeacon&&navigator.sendBeacon(e,b)))fetch(e,{method:"POST",body:b,keepalive:true,mode:"no-cors"})}catch(e){}})();\n`;
}

let cached: string | null = null;

/** The served script. Uses catalog hosts + utm sources; falls back to referrer ids if that would exceed ~1.5 KB. */
export function pixelScript(): string {
  if (cached) return cached;
  const cat = referrerCatalog();
  const full = build(cat.flatMap((r) => [...r.hosts, ...(r.utmSources ?? [])]));
  cached = Buffer.byteLength(full) <= MAX_BYTES ? full : build(cat.map((r) => r.id.split('-')[0]!));
  return cached;
}

export function pixelTag(origin: string, siteKey: string): string {
  return `<script async src="${origin}/px.js" data-key="${siteKey}"></script>`;
}
