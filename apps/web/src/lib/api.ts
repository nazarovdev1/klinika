import type { Problem, TokenResponse } from '@shifo/contracts';

let accessToken: string | null = null;
let refreshing: Promise<TokenResponse | null> | null = null;

export const getAccessToken = (): string | null => accessToken;

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

export async function refreshSession(): Promise<TokenResponse | null> {
  refreshing ??= fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' })
    .then(async (res) => {
      if (!res.ok) return null;
      const data = (await res.json()) as TokenResponse;
      accessToken = data.accessToken;
      return data;
    })
    .catch(() => null)
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function refresh(): Promise<boolean> {
  return (await refreshSession()) !== null;
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

/** Authenticated download (PDF, CSV): returns the body as a Blob. */
export async function apiBlob(path: string): Promise<Blob> {
  const doFetch = (): Promise<Response> =>
    fetch(`/api/v1${path}`, {
      credentials: 'include',
      headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {},
    });
  let res = await doFetch();
  if (res.status === 401 && (await refresh())) res = await doFetch();
  if (!res.ok)
    throw new ApiError(res.status, (await res.json().catch(() => null)) as Problem | null);
  return res.blob();
}

/** Opens a PDF/CSV from the API in a new tab (or downloads it when `download` is set). */
export async function openBlob(path: string, download?: string): Promise<void> {
  const url = URL.createObjectURL(await apiBlob(path));
  if (download) {
    const a = document.createElement('a');
    a.href = url;
    a.download = download;
    a.click();
  } else {
    window.open(url, '_blank', 'noopener');
  }
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 60_000);
}
