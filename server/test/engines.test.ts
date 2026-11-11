import './setup.ts';
import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import type { EngineId } from '../../shared/types.ts';
import { PROVIDERS } from '../src/engines/providers.ts';
import { countryOf, languageName, marketInstruction } from '../src/engines/shared.ts';

test('market: codes and country names resolve; regions and "global" do not', () => {
  assert.equal(countryOf('TR'), 'TR');
  assert.equal(countryOf('tr'), 'TR');
  assert.equal(countryOf('Turkey'), 'TR');
  assert.equal(countryOf(' Türkiye '), 'TR');
  assert.equal(countryOf('United States'), 'US');
  assert.equal(countryOf('UK'), 'GB');
  assert.equal(countryOf('germany'), 'DE');
  assert.equal(countryOf('DACH'), undefined);
  assert.equal(countryOf('ZZ'), undefined);
  assert.equal(countryOf('EU'), undefined, 'a union is not a country an API location accepts');
  assert.equal(countryOf('Netherlands'), 'NL');
  assert.equal(countryOf('Japan'), 'JP');
  assert.equal(countryOf(''), undefined);
});

test('market instruction: none for the US or "global", a country by name, free text as written', () => {
  assert.equal(marketInstruction('US'), '');
  assert.equal(marketInstruction('United States'), '');
  assert.equal(marketInstruction('Global'), '');
  assert.equal(marketInstruction(undefined), '');
  assert.match(marketInstruction('tr'), /this market: T[uü]rk/);
  assert.equal(marketInstruction('Germany'), 'The person asking is in this market: Germany. Answer for that market, in the language of the question.');
  assert.match(marketInstruction('Latin\nAmerica "x"'), /this market: Latin America x\./);
});

test('language names', () => {
  assert.equal(languageName('tr'), 'Turkish');
  assert.equal(languageName('en'), 'English');
  assert.equal(languageName('zz'), undefined);
  assert.equal(languageName(''), undefined);
  assert.equal(languageName('not a code'), undefined);
});

// ---- what each provider is actually sent, with fetch replaced by a recorder

const REPLIES: Record<string, unknown> = {
  'api.openai.com': { model: 'm', output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }], usage: {} },
  'api.x.ai': { model: 'm', output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }], usage: {} },
  'api.perplexity.ai': { model: 'm', output: [{ type: 'message', content: [{ type: 'output_text', text: 'ok' }] }], usage: {} },
  'generativelanguage.googleapis.com': { candidates: [{ content: { parts: [{ text: 'ok' }] } }], usageMetadata: {} },
  'api.deepseek.com': { model: 'm', choices: [{ message: { content: 'ok' } }], usage: {} },
  'api.anthropic.com': { id: 'msg_1', type: 'message', role: 'assistant', model: 'm', content: [{ type: 'text', text: 'ok' }], stop_reason: 'end_turn', stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } },
};

// One recorder for the whole file: the Anthropic client keeps the fetch it was created with.
const realFetch = globalThis.fetch;
let lastBody = '';
before(() => {
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    lastBody = typeof init?.body === 'string' ? init.body : input instanceof Request ? await input.clone().text() : '';
    return new Response(JSON.stringify(REPLIES[url.hostname]), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
});
after(() => {
  globalThis.fetch = realFetch;
});

async function sentBody(engine: EngineId, market: string): Promise<string> {
  lastBody = '';
  const r = await PROVIDERS[engine].search('best help desk for a small team?', { apiKey: 'test-key-not-real', model: 'm', market });
  assert.equal(r.text, 'ok');
  assert.notEqual(lastBody, '', `${engine}: request body was recorded`);
  return lastBody;
}

const ENGINES: EngineId[] = ['chatgpt', 'claude', 'gemini', 'perplexity', 'grok', 'deepseek'];

test('every engine is told the market', async () => {
  for (const engine of ENGINES) {
    const body = await sentBody(engine, 'Turkey');
    assert.match(body, /The person asking is in this market: T[uü]rk/, engine);
    assert.match(body, /best help desk for a small team\?/, engine);
  }
});

test('a United States project sends what it sent before: no market sentence', async () => {
  for (const engine of ENGINES) assert.doesNotMatch(await sentBody(engine, 'US'), /The person asking/, engine);
});

test('a market typed as a country name also sets the structured location where the API has one', async () => {
  for (const engine of ['chatgpt', 'claude'] as const) assert.match(await sentBody(engine, 'Germany'), /"country":"DE"/, engine);
});
