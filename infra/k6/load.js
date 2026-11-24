// k6 load test: realistic reception/doctor mix against a seeded environment.
//   k6 run -e BASE_URL=http://localhost:4000 -e LOGIN=owner.demo -e PASSWORD=... infra/k6/load.js
// Thresholds mirror the brief: search p95 < 300 ms, overall error rate < 1 %.
import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Trend } from 'k6/metrics';

const BASE = __ENV.BASE_URL || 'http://localhost:4000';
const searchTime = new Trend('patient_search_ms', true);

export const options = {
  scenarios: {
    reception: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '30s', target: 20 },
        { duration: '2m', target: 50 },
        { duration: '30s', target: 0 },
      ],
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    patient_search_ms: ['p(95)<300'],
    'http_req_duration{name:list_patients}': ['p(95)<500'],
  },
};

export function setup() {
  const res = http.post(
    `${BASE}/api/v1/auth/login`,
    JSON.stringify({ login: __ENV.LOGIN, password: __ENV.PASSWORD }),
    {
      headers: { 'content-type': 'application/json' },
    },
  );
  check(res, { 'login ok': (r) => r.status === 200 });
  return { token: res.json('accessToken') };
}

export default function (data) {
  const headers = { Authorization: `Bearer ${data.token}`, 'content-type': 'application/json' };
  const prefixes = ['ka', 'ab', 'ni', 'to', 'ra', 'sa'];

  group('patient search', () => {
    const q = prefixes[Math.floor(Math.random() * prefixes.length)];
    const res = http.get(`${BASE}/api/v1/patients?limit=25&q=${q}`, {
      headers,
      tags: { name: 'search_patients' },
    });
    searchTime.add(res.timings.duration);
    check(res, { 'search 200': (r) => r.status === 200 });
  });

  group('lists', () => {
    check(
      http.get(`${BASE}/api/v1/patients?limit=25`, { headers, tags: { name: 'list_patients' } }),
      {
        'list 200': (r) => r.status === 200,
      },
    );
    check(
      http.get(`${BASE}/api/v1/encounters?limit=25`, {
        headers,
        tags: { name: 'list_encounters' },
      }),
      {
        'encounters 200': (r) => r.status === 200,
      },
    );
    check(
      http.get(`${BASE}/api/v1/invoices?limit=25`, { headers, tags: { name: 'list_invoices' } }),
      {
        'invoices 200': (r) => r.status === 200,
      },
    );
  });

  sleep(1);
}
