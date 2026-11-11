// Encryption at rest for secret settings (engine API keys, the notification webhook URL), so the database file and its
// backups (Litestream → R2) don't hold them in plain text. The key comes from the SECRETS_KEY environment variable and
// never touches the database. Without SECRETS_KEY, values are stored as before (plain text).
// Format: "enc:v1:" + base64url(12-byte IV | 16-byte GCM tag | ciphertext); the setting's name is authenticated data,
// so an encrypted value only decrypts under the name it was written for.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const PREFIX = 'enc:v1:';
const SALT = 'ai-visibility/settings/v1';

/** Settings that hold credentials. */
export const isSecretSetting = (name: string): boolean => /_API_KEY$/.test(name) || name === 'NOTIFY_WEBHOOK_URL';
export const isEncrypted = (value: string): boolean => value.startsWith(PREFIX);

let derived: { raw: string; key: Buffer } | null = null;
/** 32-byte key derived from SECRETS_KEY (any string; `openssl rand -base64 32` makes a good one), or null when unset. */
function encryptionKey(): Buffer | null {
  const raw = process.env.SECRETS_KEY?.trim() ?? '';
  if (!raw) return null;
  if (derived?.raw !== raw) derived = { raw, key: scryptSync(raw, SALT, 32) };
  return derived.key;
}

export const encryptionEnabled = (): boolean => encryptionKey() !== null;

/** Encrypts `value` for the setting `name`. Requires SECRETS_KEY. */
export function encryptSetting(name: string, value: string): string {
  const key = encryptionKey();
  if (!key) throw new Error('SECRETS_KEY is not set');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(name));
  const body = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
  return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64url');
}

/** The plain value of an encrypted setting, or null when SECRETS_KEY is missing or isn't the key it was written with. */
export function decryptSetting(name: string, stored: string): string | null {
  const key = encryptionKey();
  if (!key || !isEncrypted(stored)) return null;
  try {
    const raw = Buffer.from(stored.slice(PREFIX.length), 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', key, raw.subarray(0, 12));
    decipher.setAAD(Buffer.from(name));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
