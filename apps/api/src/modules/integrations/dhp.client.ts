import type { FhirResource } from '@shifo/fhir';

export interface DhpClient {
  /** Sends a transaction Bundle; returns the remote id of the stored Encounter (or the bundle). */
  sendBundle(bundle: FhirResource): Promise<{ remoteId: string }>;
  ping(): Promise<boolean>;
}

/** In-memory fake: records bundles, can be told to fail. Used in dev and tests. */
export class MockDhpClient implements DhpClient {
  readonly sent: FhirResource[] = [];
  failNext = 0;

  sendBundle(bundle: FhirResource): Promise<{ remoteId: string }> {
    if (this.failNext > 0) {
      this.failNext--;
      return Promise.reject(new Error('mock DHP unavailable'));
    }
    this.sent.push(bundle);
    return Promise.resolve({ remoteId: `mock-${String(this.sent.length)}` });
  }

  ping(): Promise<boolean> {
    return Promise.resolve(true);
  }
}

/**
 * Talks to a FHIR endpoint over HTTP (the local mock server or, later, the real DHP).
 * TODO(external-spec): real DHP authentication (token flow / certificates) and base URLs are unknown;
 * until the IG is read, no Authorization header is sent. Do not point this at production.
 */
export class HttpDhpClient implements DhpClient {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 10_000,
  ) {}

  async sendBundle(bundle: FhirResource): Promise<{ remoteId: string }> {
    const res = await fetch(this.baseUrl.replace(/\/$/, '') + '/Bundle', {
      method: 'POST',
      headers: { 'content-type': 'application/fhir+json' },
      body: JSON.stringify(bundle),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`DHP responded ${String(res.status)}`);
    const body = (await res.json()) as { id?: string };
    return { remoteId: body.id ?? 'unknown' };
  }

  async ping(): Promise<boolean> {
    try {
      const res = await fetch(this.baseUrl.replace(/\/$/, '') + '/metadata', {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
