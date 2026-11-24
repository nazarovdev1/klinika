import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
const { server } = await import('./server.mjs');
let base;

before(async () => {
  await new Promise((r) => server.listen(0, r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

test('POST then GET a Patient', async () => {
  const created = await fetch(`${base}/Patient`, {
    method: 'POST',
    body: JSON.stringify({ resourceType: 'Patient' }),
  });
  assert.equal(created.status, 201);
  const { id } = await created.json();
  const got = await fetch(`${base}/Patient/${id}`);
  assert.equal(got.status, 200);
});

test('rejects mismatched resourceType', async () => {
  const res = await fetch(`${base}/Patient`, {
    method: 'POST',
    body: JSON.stringify({ resourceType: 'Encounter' }),
  });
  assert.equal(res.status, 400);
});
