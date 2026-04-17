import type { QuoteRecord, SalesTrackerStats } from "@/types/leafData";

export const SALES_TRACKER_STORAGE_KEY = "leaf:salesTracker:v1";
export const QUOTE_HISTORY_STORAGE_KEY = "leaf:quoteHistory:v1";

export function clampNonNegInt(n: unknown): number {
  const num = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.floor(num));
}

export function clampNonNegMoney(n: unknown): number {
  const num = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.round(num));
}

const defaultStats: SalesTrackerStats = {
  quotes: 0,
  sales: 0,
  upsells: 0,
  soldRevenueOneTime: 0,
  soldAnnualValue: 0,
};

export function readLocalSalesStats(): SalesTrackerStats {
  try {
    const raw = localStorage.getItem(SALES_TRACKER_STORAGE_KEY);
    if (!raw) return { ...defaultStats };
    const parsed = JSON.parse(raw) as Partial<SalesTrackerStats> | null;
    return {
      quotes: clampNonNegInt(parsed?.quotes),
      sales: clampNonNegInt(parsed?.sales),
      upsells: clampNonNegInt(parsed?.upsells),
      soldRevenueOneTime: Number.isFinite(Number(parsed?.soldRevenueOneTime))
        ? Number(parsed?.soldRevenueOneTime)
        : 0,
      soldAnnualValue: Number.isFinite(Number(parsed?.soldAnnualValue))
        ? Number(parsed?.soldAnnualValue)
        : 0,
    };
  } catch {
    return { ...defaultStats };
  }
}

export function writeLocalSalesStats(next: SalesTrackerStats) {
  try {
    localStorage.setItem(SALES_TRACKER_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // private mode / quota
  }
}

export function readLocalQuoteHistory(): QuoteRecord[] {
  try {
    const raw = localStorage.getItem(QUOTE_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as QuoteRecord[]) : [];
  } catch {
    return [];
  }
}

export function writeLocalQuoteHistory(next: QuoteRecord[]) {
  try {
    localStorage.setItem(QUOTE_HISTORY_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

export function normalizeSalesStats(input: unknown): SalesTrackerStats {
  if (!input || typeof input !== "object") return { ...defaultStats };
  const o = input as Record<string, unknown>;
  return {
    quotes: clampNonNegInt(o.quotes),
    sales: clampNonNegInt(o.sales),
    upsells: clampNonNegInt(o.upsells),
    soldRevenueOneTime: clampNonNegMoney(o.soldRevenueOneTime),
    soldAnnualValue: clampNonNegMoney(o.soldAnnualValue),
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function normalizeQuoteHistory(input: unknown): QuoteRecord[] {
  if (!Array.isArray(input)) return [];
  const out: QuoteRecord[] = [];
  for (const row of input) {
    if (!isRecord(row)) continue;
    if (typeof row.id !== "string" || typeof row.createdAt !== "number") continue;
    out.push(row as QuoteRecord);
  }
  return out;
}

export function isStatsEmpty(s: SalesTrackerStats): boolean {
  return (
    s.quotes === 0 &&
    s.sales === 0 &&
    s.upsells === 0 &&
    s.soldRevenueOneTime === 0 &&
    s.soldAnnualValue === 0
  );
}
