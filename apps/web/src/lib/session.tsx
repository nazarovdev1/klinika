'use client';

import type { AuthUser, TokenResponse } from '@shifo/contracts';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setAccessToken } from '@/lib/api';

interface Session {
  user: AuthUser | null;
  /** True until the first refresh attempt finished. */
  loading: boolean;
  setUser: (u: AuthUser | null) => void;
  can: (permission: string) => boolean;
  logout: () => Promise<void>;
}

const Ctx = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  // The access token lives in memory only; on reload the httpOnly refresh cookie restores the session.
  useEffect(() => {
    let alive = true;
    fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) return null;
        const data = (await res.json()) as TokenResponse;
        setAccessToken(data.accessToken);
        return data.user;
      })
      .catch(() => null)
      .then((u) => {
        if (alive) {
          setUser(u);
          setLoading(false);
        }
      });
    return () => {
      alive = false;
    };
  }, []);

  const value = useMemo<Session>(
    () => ({
      user,
      loading,
      setUser,
      can: (p) => user?.permissions.includes(p) ?? false,
      logout: async () => {
        await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
        setAccessToken(null);
        setUser(null);
      },
    }),
    [user, loading],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}
