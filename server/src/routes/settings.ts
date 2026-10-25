// Settings (API keys, model overrides, analysis engine) and the engine catalog.
import { Hono } from 'hono';
import { z } from 'zod';
import { getSetting, secret, setSetting } from '../db/index.ts';
import type { SettingsView } from '../../../shared/types.ts';
import { ANALYSIS_ENGINE_SETTING, analysisEngine, ENGINE_IDS, ENGINES, engineModel, listEngines } from '../engines/catalog.ts';
import { readJson, validate } from './projects.ts';
import { costSettings, updateCostSettings } from '../services/cost.ts';
import { getUsage } from '../services/usage.ts';

const KEY_SETTINGS = ENGINES.map((e) => e.keySetting) as [string, ...string[]];
const MODEL_SETTINGS = ENGINES.map((e) => e.modelSetting) as [string, ...string[]];

const SettingsUpdateSchema = z.object({
  // Printable ASCII without spaces: API keys never contain anything else, and a stray newline would make the
  // HTTP client reject the header (with an error message that echoes the key).
  keys: z.partialRecord(z.enum(KEY_SETTINGS), z.string().trim().max(500).regex(/^[\x21-\x7e]*$/, 'API keys can only contain printable characters without spaces').nullable()).optional(),
  models: z.partialRecord(z.enum(MODEL_SETTINGS), z.string().trim().max(120).regex(/^[\w.:@/-]*$/, 'invalid model id')).optional(),
  analysisEngine: z.enum(ENGINE_IDS).nullable().optional(),
  cost: z.object({
    monthlyBudgetUsd: z.number().min(0).max(100_000).optional(),
    scheduledMode: z.enum(['realtime', 'batch']).optional(),
    reuseSameDay: z.boolean().optional(),
  }).strict().optional(),
}).strict();

/** "sk-proj-abc…a1b2" → "sk-…a1b2"; values too short to keep most characters hidden are fully masked. */
function mask(value: string): string {
  return value.length < 24 ? '••••' : `${value.slice(0, 3)}…${value.slice(-4)}`;
}

function settingsView(): SettingsView {
  const keys: SettingsView['keys'] = {};
  const models: SettingsView['models'] = {};
  const defaultModels: Record<string, string> = {};
  for (const e of ENGINES) {
    const v = secret(e.keySetting);
    keys[e.keySetting] = v ? mask(v) : null;
    models[e.modelSetting] = engineModel(e.id);
    defaultModels[e.modelSetting] = e.defaultModel;
  }
  const preferred = getSetting(ANALYSIS_ENGINE_SETTING);
  return {
    keys,
    models,
    defaultModels,
    analysisEngine: analysisEngine(),
    analysisEnginePreference: ENGINE_IDS.find((id) => id === preferred) ?? null,
    cost: costSettings(),
  };
}

const app = new Hono();

app.get('/settings', (c) => c.json(settingsView()));

app.put('/settings', async (c) => {
  const body = validate(SettingsUpdateSchema, await readJson(c));
  for (const [key, value] of Object.entries(body.keys ?? {})) setSetting(key, value || null);
  for (const [key, value] of Object.entries(body.models ?? {})) setSetting(key, value || null);
  if (body.analysisEngine !== undefined) setSetting(ANALYSIS_ENGINE_SETTING, body.analysisEngine);
  if (body.cost) updateCostSettings(body.cost);
  return c.json(settingsView());
});

app.get('/engines', (c) => c.json(listEngines()));

app.get('/usage', (c) => {
  const days = Number(c.req.query('days') ?? 30);
  return c.json(getUsage(Number.isInteger(days) && days >= 1 && days <= 366 ? days : 30));
});

export default app;
