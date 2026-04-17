import { isStatsEmpty, normalizeQuoteHistory, normalizeSalesStats } from "@/lib/localEstimatorStorage";
import type { QuoteRecord, SalesTrackerStats } from "@/types/leafData";
import { getSupabase } from "@/lib/supabase";

type UserAppRow = {
  user_id: string;
  sales_stats: unknown;
  quote_history: unknown;
  updated_at?: string;
};

export async function fetchUserAppDataRow(
  userId: string
): Promise<{ sales_stats: unknown; quote_history: unknown } | null> {
  const sb = getSupabase();
  if (!sb) return null;

  const { data, error } = await sb
    .from("user_app_data")
    .select("sales_stats, quote_history")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;
  return data as { sales_stats: unknown; quote_history: unknown };
}

export async function upsertUserAppData(
  userId: string,
  salesStats: SalesTrackerStats,
  quoteHistory: QuoteRecord[]
): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;

  const payload: UserAppRow = {
    user_id: userId,
    sales_stats: salesStats,
    quote_history: quoteHistory,
    updated_at: new Date().toISOString(),
  };

  const { error } = await sb.from("user_app_data").upsert(payload, { onConflict: "user_id" });
  if (error) throw error;
}

/**
 * If the server row is empty but this browser has data, seed the cloud from local.
 * Otherwise prefer server so the same account syncs across devices.
 */
export function mergeRemoteAndLocal(
  remote: { sales_stats: unknown; quote_history: unknown } | null,
  localStats: SalesTrackerStats,
  localQuotes: QuoteRecord[]
): { salesStats: SalesTrackerStats; quoteHistory: QuoteRecord[] } {
  if (!remote) {
    return { salesStats: localStats, quoteHistory: localQuotes };
  }

  const rStats = normalizeSalesStats(remote.sales_stats);
  const rQuotes = normalizeQuoteHistory(remote.quote_history);

  const remoteEmpty = rQuotes.length === 0 && isStatsEmpty(rStats);
  const localEmpty =
    localQuotes.length === 0 &&
    localStats.quotes === 0 &&
    localStats.sales === 0 &&
    localStats.upsells === 0 &&
    localStats.soldRevenueOneTime === 0 &&
    localStats.soldAnnualValue === 0;

  if (remoteEmpty && !localEmpty) {
    return { salesStats: localStats, quoteHistory: localQuotes };
  }

  return { salesStats: rStats, quoteHistory: rQuotes };
}
