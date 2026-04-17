import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null | undefined;

/** Browser-only Supabase client; null if env vars are missing (local-only mode). */
export function getSupabase(): SupabaseClient | null {
  if (browserClient !== undefined) return browserClient;

  const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
  if (!url?.trim() || !anonKey?.trim()) {
    browserClient = null;
    return null;
  }

  browserClient = createClient(url.trim(), anonKey.trim(), {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
    },
  });
  return browserClient;
}
