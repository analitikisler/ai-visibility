import './setup.ts';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { get, getSetting, sealSecretSettings, secret, setSetting } from '../src/db/index.ts';
import { decryptSetting, encryptSetting, isEncrypted } from '../src/lib/secrets.ts';

const KEY = 'sk-proj-abcdefghijklmnopqrstuvwxyz0123456789';
const stored = (name: string) => get<{ value: string }>('SELECT value FROM settings WHERE key = ?', [name])?.value;
const withKey = (k: string | undefined) => {
  if (k === undefined) delete process.env.SECRETS_KEY;
  else process.env.SECRETS_KEY = k;
};

test('without SECRETS_KEY values are stored as before', () => {
  withKey(undefined);
  setSetting('OPENAI_API_KEY', KEY);
  assert.equal(stored('OPENAI_API_KEY'), KEY);
  assert.equal(secret('OPENAI_API_KEY'), KEY);
});

test('with SECRETS_KEY, secret settings are encrypted on write and read back in plain', () => {
  withKey('a-long-random-test-secret-not-a-real-one');
  setSetting('ANTHROPIC_API_KEY', KEY);
  setSetting('NOTIFY_WEBHOOK_URL', 'https://hooks.example.com/T0/B0/token');
  setSetting('OPENAI_MODEL', 'gpt-5-mini');
  assert.ok(isEncrypted(stored('ANTHROPIC_API_KEY')!));
  assert.ok(!stored('ANTHROPIC_API_KEY')!.includes('abcdefgh'), 'no part of the key in the database');
  assert.ok(isEncrypted(stored('NOTIFY_WEBHOOK_URL')!));
  assert.equal(stored('OPENAI_MODEL'), 'gpt-5-mini', 'ordinary settings stay readable');
  assert.equal(getSetting('ANTHROPIC_API_KEY'), KEY);
  assert.equal(getSetting('NOTIFY_WEBHOOK_URL'), 'https://hooks.example.com/T0/B0/token');
  assert.notEqual(encryptSetting('X_API_KEY', KEY), encryptSetting('X_API_KEY', KEY), 'a fresh IV each time');
});

test('startup encrypts keys saved before SECRETS_KEY was set', () => {
  withKey(undefined);
  setSetting('GEMINI_API_KEY', 'AIzaSyTESTKEYTESTKEYTESTKEY12345');
  assert.equal(stored('GEMINI_API_KEY'), 'AIzaSyTESTKEYTESTKEYTESTKEY12345');
  withKey('a-long-random-test-secret-not-a-real-one');
  sealSecretSettings();
  assert.ok(isEncrypted(stored('GEMINI_API_KEY')!));
  assert.ok(isEncrypted(stored('OPENAI_API_KEY')!), 'the one from the first test too');
  assert.equal(getSetting('GEMINI_API_KEY'), 'AIzaSyTESTKEYTESTKEYTESTKEY12345');
  sealSecretSettings(); // nothing left to do; nothing double-encrypted
  assert.equal(getSetting('GEMINI_API_KEY'), 'AIzaSyTESTKEYTESTKEYTESTKEY12345');
});

test('a missing or different SECRETS_KEY reads as unset, and the env key is used instead; saving again recovers', () => {
  withKey('a-long-random-test-secret-not-a-real-one');
  setSetting('XAI_API_KEY', 'xai-stored-in-database-0000');
  process.env.XAI_API_KEY = 'xai-from-environment-1111';
  try {
    withKey('a-different-secret');
    assert.equal(getSetting('XAI_API_KEY'), undefined);
    assert.equal(secret('XAI_API_KEY'), 'xai-from-environment-1111');
    withKey(undefined);
    assert.equal(getSetting('XAI_API_KEY'), undefined);
    withKey('a-different-secret');
    setSetting('XAI_API_KEY', 'xai-saved-again-2222');
    assert.equal(getSetting('XAI_API_KEY'), 'xai-saved-again-2222');
  } finally {
    delete process.env.XAI_API_KEY;
  }
});

test('an encrypted value only decrypts under the setting name it was written for', () => {
  withKey('a-long-random-test-secret-not-a-real-one');
  const sealed = encryptSetting('OPENAI_API_KEY', KEY);
  assert.equal(decryptSetting('OPENAI_API_KEY', sealed), KEY);
  assert.equal(decryptSetting('DEEPSEEK_API_KEY', sealed), null);
  assert.equal(decryptSetting('OPENAI_API_KEY', `${sealed.slice(0, -4)}AAAA`), null, 'a tampered value is refused');
});
