'use client';

import type { AuthUser } from '@shifo/contracts';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, getAccessToken, refreshSession, setAccessToken } from '@/lib/api';

interface Session {
  user: AuthUser | null;
  /** True until the first refresh attempt finished. */
  loading: boolean;
  setUser: (u: AuthUser | null) => void;
  can: (permission: string) => boolean;
  logout: () => Promise<void>;
}

const Ctx = createContext<Session | null>(null);
let cachedUser: AuthUser | null = null;

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUserState] = useState<AuthUser | null>(() =>
    getAccessToken() ? cachedUser : null,
  );
  const [loading, setLoading] = useState(() => !(getAccessToken() && cachedUser));

  const setUser = useCallback((u: AuthUser | null) => {
    cachedUser = u;
    setUserState(u);
  }, []);

  // The access token lives in memory only; on reload the httpOnly refresh cookie restores the session.
  // Deduplicated via refreshSession() so StrictMode double-effects do not trigger refresh-token reuse.
  useEffect(() => {
    if (getAccessToken() && cachedUser) {
      setUserState(cachedUser);
      setLoading(false);
      return;
    }
    let alive = true;
    void refreshSession().then((data) => {
      const u = data?.user ?? null;
      cachedUser = u;
      if (alive) {
        setUserState(u);
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
        cachedUser = null;
        setUserState(null);
      },
    }),
    [user, loading, setUser],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): Session {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}
