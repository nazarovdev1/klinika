import { describe, expect, it } from 'vitest';
import { problemSchema } from './errors.js';

describe('problemSchema', () => {
  it('defaults type to about:blank', () => {
    const p = problemSchema.parse({
      title: 'Not found',
      status: 404,
      code: 'NOT_FOUND',
    });
    expect(p.type).toBe('about:blank');
  });

  it('rejects unknown codes', () => {
    expect(() => problemSchema.parse({ title: 'x', status: 400, code: 'NOPE' })).toThrow();
  });
});
