import { describe, expect, it } from 'vitest';
import { buildOpenApiDocument } from '../openapi.js';
import { documentedOperationCount } from '../openapi-routes.js';

describe('openapi document', () => {
  const doc = buildOpenApiDocument() as {
    openapi: string;
    paths: Record<string, Record<string, { security?: unknown[]; description?: string }>>;
  };

  it('is OpenAPI 3.1 and documents every module', () => {
    expect(doc.openapi).toBe('3.1.0');
    const paths = Object.keys(doc.paths);
    expect(paths.length).toBeGreaterThan(60);
    for (const p of [
      '/api/v1/patients',
      '/api/v1/appointments',
      '/api/v1/encounters/{id}/sign',
      '/api/v1/invoices/{id}/payments',
      '/api/v1/lab/orders/{id}/validate',
      '/api/v1/reports/{name}',
      '/api/v1/integrations/dhp/status',
    ]) {
      expect(paths).toContain(p);
    }
    expect(documentedOperationCount).toBeGreaterThan(70);
  });

  it('marks public routes without security and protected routes with it', () => {
    expect(doc.paths['/api/v1/screen/{token}']?.get?.security).toBeUndefined();
    expect(doc.paths['/api/v1/invoices']?.get?.security).toBeDefined();
    expect(doc.paths['/api/v1/invoices/{id}/payments']?.post?.description).toContain(
      'billing:write',
    );
  });
});
