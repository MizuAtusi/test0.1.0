import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

type AuthState = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isDevAuth: boolean;
};

const AuthContext = createContext<AuthState | null>(null);
const DEV_AUTH_KEY = 'trpg:devAuth';
const ALLOW_DEV_AUTH = import.meta.env.VITE_ALLOW_TEST_LOGIN === 'true';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [devUser, setDevUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (ALLOW_DEV_AUTH) {
      try {
        const flag = localStorage.getItem(DEV_AUTH_KEY);
        if (flag === '1') {
          setDevUser({
            id: 'dev-user',
            email: 'test',
            user_metadata: { display_name: 'test' },
          } as any);
          setSession(null);
          setLoading(false);
          return;
        }
      } catch {
        // ignore
      }
    }

    let mounted = true;
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        setSession(data.session ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        setSession(null);
        setLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user: devUser ?? session?.user ?? null,
      session,
      loading,
      isDevAuth: !!devUser,
    }),
    [session, loading, devUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
