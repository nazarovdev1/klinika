import type { Problem, TokenResponse } from '@shifo/contracts';

let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;

export const setAccessToken = (t: string | null): void => {
  accessToken = t;
};

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: Problem | null,
  ) {
    super(problem?.detail ?? problem?.title ?? `HTTP ${status}`);
  }
}

async function refresh(): Promise<boolean> {
  refreshing ??= fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' })
    .then(async (res) => {
      if (!res.ok) return false;
      accessToken = ((await res.json()) as TokenResponse).accessToken;
      return true;
    })
    .catch(() => false)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

/** Thin typed fetch: JSON in/out, bearer token, 401 -> refresh -> retry once. */
export async function api<T>(
  path: string,
  init: RequestInit & { json?: unknown } = {},
): Promise<T> {
  const run = (): Promise<Response> => {
    const headers = new Headers(init.headers);
    if (init.json !== undefined) headers.set('content-type', 'application/json');
    if (accessToken) headers.set('authorization', `Bearer ${accessToken}`);
    return fetch(`/api/v1${path}`, {
      ...init,
      headers,
      credentials: 'include',
      body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    });
  };
  let res = await run();
  if (res.status === 401 && !path.startsWith('/auth/') && (await refresh())) res = await run();
  if (!res.ok) {
    const problem = (await res.json().catch(() => null)) as Problem | null;
    throw new ApiError(res.status, problem);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export async function login(loginName: string, password: string): Promise<TokenResponse> {
  const data = await api<TokenResponse>('/auth/login', {
    method: 'POST',
    json: { login: loginName, password },
  });
  accessToken = data.accessToken;
  return data;
}
