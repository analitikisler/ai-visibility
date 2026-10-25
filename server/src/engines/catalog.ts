// Engine catalog: static metadata + live/simulated resolution from settings.
import { getSetting, secret } from '../db/index.ts';
import type { EngineId, EngineInfo, EngineMode } from '../../../shared/types.ts';

export interface EngineDef {
  id: EngineId;
  name: string;
  vendor: string;
  /** Settings key holding the API key; its presence makes the engine live. */
  keySetting: string;
  /** Settings key overriding the model id. */
  modelSetting: string;
  defaultModel: string;
  /** Cheaper processing used by batch-mode checks (see providers.ts). */
  economy: 'batch' | 'flex' | null;
  supportsCitations: boolean;
}

export const ENGINES: readonly EngineDef[] = [
  { id: 'chatgpt', name: 'ChatGPT', vendor: 'OpenAI', keySetting: 'OPENAI_API_KEY', modelSetting: 'OPENAI_MODEL', defaultModel: 'gpt-5-mini', supportsCitations: true, economy: 'flex' },
  { id: 'claude', name: 'Claude', vendor: 'Anthropic', keySetting: 'ANTHROPIC_API_KEY', modelSetting: 'ANTHROPIC_MODEL', defaultModel: 'claude-sonnet-5-5', supportsCitations: true, economy: 'batch' },
  { id: 'gemini', name: 'Gemini', vendor: 'Google', keySetting: 'GEMINI_API_KEY', modelSetting: 'GEMINI_MODEL', defaultModel: 'gemini-2.5-flash', supportsCitations: true, economy: 'batch' },
  { id: 'perplexity', name: 'Perplexity', vendor: 'Perplexity', keySetting: 'PERPLEXITY_API_KEY', modelSetting: 'PERPLEXITY_MODEL', defaultModel: 'perplexity/sonar', supportsCitations: true, economy: null },
  { id: 'grok', name: 'Grok', vendor: 'xAI', keySetting: 'XAI_API_KEY', modelSetting: 'XAI_MODEL', defaultModel: 'grok-4.3', supportsCitations: true, economy: null },
  { id: 'deepseek', name: 'DeepSeek', vendor: 'DeepSeek', keySetting: 'DEEPSEEK_API_KEY', modelSetting: 'DEEPSEEK_MODEL', defaultModel: 'deepseek-flash', supportsCitations: false, economy: null },
];

export const ENGINE_IDS = ENGINES.map((e) => e.id) as [EngineId, ...EngineId[]];
export const ANALYSIS_ENGINE_SETTING = 'ANALYSIS_ENGINE';

export function engineDef(id: EngineId): EngineDef {
  const def = ENGINES.find((e) => e.id === id);
  if (!def) throw new Error(`Unknown engine: ${id}`);
  return def;
}

export function engineKey(id: EngineId): string | undefined {
  return secret(engineDef(id).keySetting);
}

export function engineMode(id: EngineId): EngineMode {
  return engineKey(id) ? 'live' : 'simulated';
}

/** Model id for live calls: settings override, then env (e.g. OPENAI_MODEL in .env), else the catalog default. */
export function engineModel(id: EngineId): string {
  const def = engineDef(id);
  return getSetting(def.modelSetting) || process.env[def.modelSetting]?.trim() || def.defaultModel;
}

export function liveEngines(): EngineId[] {
  return ENGINES.filter((e) => engineMode(e.id) === 'live').map((e) => e.id);
}

/** Configured analysis engine if it is live, else the first live engine, else null. */
export function analysisEngine(): EngineId | null {
  const live = liveEngines();
  const configured = getSetting(ANALYSIS_ENGINE_SETTING) as EngineId | undefined;
  if (configured && live.includes(configured)) return configured;
  return live[0] ?? null;
}

export function listEngines(): EngineInfo[] {
  return ENGINES.map((e) => {
    const mode = engineMode(e.id);
    return {
      id: e.id, name: e.name, vendor: e.vendor, mode,
      model: mode === 'live' ? engineModel(e.id) : 'simulated',
      keySetting: e.keySetting, supportsCitations: e.supportsCitations, economy: e.economy,
    };
  });
}
