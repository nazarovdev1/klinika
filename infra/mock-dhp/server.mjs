// Tiny FHIR mock for local dev and tests.
// TODO(external-spec): real DHP endpoints/auth are unknown; this only stores and echoes resources.
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT ?? 8090);
const store = new Map(); // "Type/id" -> resource

const send = (res, status, body) => {
  res.writeHead(status, { 'content-type': 'application/fhir+json' });
  res.end(JSON.stringify(body));
};

export const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean);

  if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { status: 'ok' });
  if (req.method === 'GET' && url.pathname === '/metadata') {
    return send(res, 200, {
      resourceType: 'CapabilityStatement',
      status: 'active',
      fhirVersion: '5.0.0',
    });
  }

  if (req.method === 'POST' && parts.length === 1) {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try {
        const resource = JSON.parse(raw);
        if (resource.resourceType !== parts[0]) {
          return send(res, 400, {
            resourceType: 'OperationOutcome',
            issue: [{ severity: 'error', code: 'invalid' }],
          });
        }
        const id = randomUUID();
        const saved = { ...resource, id };
        store.set(`${parts[0]}/${id}`, saved);
        send(res, 201, saved);
      } catch {
        send(res, 400, {
          resourceType: 'OperationOutcome',
          issue: [{ severity: 'error', code: 'structure' }],
        });
      }
    });
    return;
  }

  if (req.method === 'GET' && parts.length === 2) {
    const found = store.get(parts.join('/'));
    return found ? send(res, 200, found) : send(res, 404, { resourceType: 'OperationOutcome' });
  }

  send(res, 404, { resourceType: 'OperationOutcome' });
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => console.log(`mock-dhp listening on :${PORT}`));
}
