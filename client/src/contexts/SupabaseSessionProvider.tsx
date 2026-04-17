import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getSupabase } from "@/lib/supabase";

type SupabaseSessionContextValue = {
  /** Supabase env vars are present */
  enabled: boolean;
  /** Auth finished (success or failure); when disabled, true immediately */
  ready: boolean;
  /** Signed-in user id (anonymous ok) */
  userId: string | null;
  authError: string | null;
};

const SupabaseSessionContext = createContext<SupabaseSessionContextValue | null>(null);

export function SupabaseSessionProvider({ children }: { children: ReactNode }) {
  const enabled = useMemo(() => getSupabase() !== null, []);
  const [ready, setReady] = useState(!enabled);
  const [userId, setUserId] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const client = getSupabase();
    if (!client) {
      setReady(true);
      setUserId(null);
      return;
    }

    let cancelled = false;

    const run = async () => {
      setReady(false);
      setAuthError(null);
      try {
        const { data: sessionData, error: sessionError } = await client.auth.getSession();
        if (sessionError) throw sessionError;
        let session = sessionData.session;
        if (!session) {
          const { data, error } = await client.auth.signInAnonymously();
          if (error) throw error;
          session = data.session;
        }
        if (!cancelled) setUserId(session?.user.id ?? null);
      } catch (e) {
        if (!cancelled) {
          setAuthError(e instanceof Error ? e.message : String(e));
          setUserId(null);
        }
      } finally {
        if (!cancelled) setReady(true);
      }
    };

    void run();

    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
    });

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, [enabled]);

  const value = useMemo(
    () => ({ enabled, ready, userId, authError }),
    [enabled, ready, userId, authError]
  );

  return <SupabaseSessionContext.Provider value={value}>{children}</SupabaseSessionContext.Provider>;
}

export function useSupabaseSession(): SupabaseSessionContextValue {
  const ctx = useContext(SupabaseSessionContext);
  if (!ctx) {
    throw new Error("useSupabaseSession must be used within SupabaseSessionProvider");
  }
  return ctx;
}
