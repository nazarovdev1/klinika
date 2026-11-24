import { describe, expect, it } from 'vitest';
import { createPii } from '../pii.js';

const k = (n: number) => Buffer.alloc(32, n).toString('base64');
const hmac = Buffer.alloc(48, 9).toString('base64');

describe('pii', () => {
  const pii = createPii({ PII_KEYS: `k1:${k(1)}`, PII_ACTIVE_KEY_ID: 'k1', PII_HMAC_KEY: hmac });

  it('round-trips and uses a random IV', () => {
    const a = pii.encrypt('12345678901234');
    expect(a).not.toBe(pii.encrypt('12345678901234'));
    expect(pii.decrypt(a)).toBe('12345678901234');
    expect(a.startsWith('k1.')).toBe(true);
  });

  it('hash is deterministic and keyed', () => {
    const other = createPii({
      PII_KEYS: `k1:${k(1)}`,
      PII_ACTIVE_KEY_ID: 'k1',
      PII_HMAC_KEY: Buffer.alloc(48, 3).toString('base64'),
    });
    expect(pii.hash('x')).toBe(pii.hash('x'));
    expect(pii.hash('x')).not.toBe(other.hash('x'));
  });

  it('decrypts data written with a rotated-out key', () => {
    const old = createPii({ PII_KEYS: `k1:${k(1)}`, PII_ACTIVE_KEY_ID: 'k1', PII_HMAC_KEY: hmac });
    const rotated = createPii({
      PII_KEYS: `k1:${k(1)},k2:${k(2)}`,
      PII_ACTIVE_KEY_ID: 'k2',
      PII_HMAC_KEY: hmac,
    });
    expect(rotated.decrypt(old.encrypt('secret'))).toBe('secret');
    expect(rotated.encrypt('secret').startsWith('k2.')).toBe(true);
  });

  it('detects tampering', () => {
    const enc = pii.encrypt('secret');
    const parts = enc.split('.');
    parts[3] = Buffer.from('tampered!').toString('base64url');
    expect(() => pii.decrypt(parts.join('.'))).toThrow();
  });

  it('rejects an active key that is not configured', () => {
    expect(() =>
      createPii({ PII_KEYS: `k1:${k(1)}`, PII_ACTIVE_KEY_ID: 'k9', PII_HMAC_KEY: hmac }),
    ).toThrow(/k9/);
  });
});
