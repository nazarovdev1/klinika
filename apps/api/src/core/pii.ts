import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';
import type { Env } from '../config/env.js';

/**
 * Application-level encryption for sensitive columns (PINFL, passport).
 * Format: `<keyId>.<iv>.<tag>.<ciphertext>` (base64url). Old key ids stay in PII_KEYS to allow rotation.
 */
export interface Pii {
  encrypt(plain: string): string;
  decrypt(stored: string): string;
  /** Deterministic keyed hash for exact-match lookups and uniqueness. */
  hash(plain: string): string;
}

function parseKeys(raw: string): Map<string, Buffer> {
  const keys = new Map<string, Buffer>();
  for (const part of raw.split(',')) {
    const [id, b64] = part.trim().split(':');
    if (!id || !b64) throw new Error('PII_KEYS must look like keyId:base64key[,keyId2:base64key2]');
    const key = Buffer.from(b64, 'base64');
    if (key.length !== 32) throw new Error(`PII key ${id} must be 32 bytes (base64)`);
    keys.set(id, key);
  }
  return keys;
}

export function createPii(env: Pick<Env, 'PII_KEYS' | 'PII_ACTIVE_KEY_ID' | 'PII_HMAC_KEY'>): Pii {
  const keys = parseKeys(env.PII_KEYS);
  const activeId = env.PII_ACTIVE_KEY_ID;
  const active = keys.get(activeId);
  if (!active) throw new Error(`PII_ACTIVE_KEY_ID ${activeId} is not present in PII_KEYS`);
  const hmacKey = Buffer.from(env.PII_HMAC_KEY, 'base64');

  return {
    encrypt(plain) {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', active, iv);
      const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
      return [activeId, iv, cipher.getAuthTag(), ct]
        .map((p) => (typeof p === 'string' ? p : p.toString('base64url')))
        .join('.');
    },
    decrypt(stored) {
      const [id, iv, tag, ct] = stored.split('.');
      const key = id ? keys.get(id) : undefined;
      if (!key || !iv || !tag || !ct) throw new Error('Malformed or unknown-key ciphertext');
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'));
      decipher.setAuthTag(Buffer.from(tag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(ct, 'base64url')),
        decipher.final(),
      ]).toString('utf8');
    },
    hash: (plain) => createHmac('sha256', hmacKey).update(plain).digest('hex'),
  };
}
