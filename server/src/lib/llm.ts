// One-shot LLM completions for analysis/drafting on the configured analysis engine (no web search).
// Onboarding suggestions and drafts call these signatures — keep them stable.
import type { EngineId } from '../../../shared/types.ts';
import { analysisEngine, engineMode, liveEngines } from '../engines/catalog.ts';
import { complete } from '../engines/index.ts';

export interface LlmRequest {
  system?: string;
  prompt: string;
  maxTokens?: number;
  /** Ask for JSON output; implementation should extract the first JSON object/array from the reply. */
  json?: boolean;
  /** Prefer a specific engine; falls back to the configured analysis engine. */
  engine?: EngineId;
  /** For usage accounting (llm_usage) and per-project prompt-cache routing. */
  projectId?: string;
  purpose?: string;
}
export interface LlmResult {
  text: string;
  engine: EngineId;
  model: string;
}

/** True if any live LLM provider is configured (an API key exists). */
export function hasLlm(): boolean {
  return liveEngines().length > 0;
}

/** Extracts the first balanced JSON object/array from a reply (handles ```json fences and surrounding prose). */
export function extractJson(text: string): string | null {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const src = fenced?.[1] ?? text;
  for (let start = 0; start < src.length; start++) {
    const open = src[start];
    if (open !== '{' && open !== '[') continue;
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    for (let i = start; i < src.length; i++) {
      const ch = src[i];
      if (inString) {
        if (ch === '\\') i++;
        else if (ch === '"') inString = false;
      } else if (ch === '"') inString = true;
      else if (ch === open) depth++;
      else if (ch === close && --depth === 0) {
        const candidate = src.slice(start, i + 1);
        try {
          JSON.parse(candidate);
          return candidate;
        } catch {
          break;
        }
      }
    }
  }
  return null;
}

/**
 * One-shot completion on the configured analysis engine.
 * Returns null when no live provider is configured or the call fails — callers MUST fall back to templates/heuristics.
 */
export async function llmComplete(req: LlmRequest): Promise<LlmResult | null> {
  const engine = req.engine && engineMode(req.engine) === 'live' ? req.engine : analysisEngine();
  if (!engine) return null;
  const system = req.json ? `${req.system ? `${req.system}\n\n` : ''}Respond with valid JSON only, no commentary.` : req.system;
  const res = await complete(engine, {
    system, prompt: req.prompt, maxTokens: req.maxTokens, json: req.json,
    projectId: req.projectId, purpose: req.purpose, cacheKey: req.projectId ? `ai-visibility-${req.projectId}` : undefined,
  });
  if (!res) return null;
  if (!req.json) return { text: res.text.trim(), engine, model: res.model };
  const json = extractJson(res.text);
  return json ? { text: json, engine, model: res.model } : null;
}
