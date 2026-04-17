/**
 * Leaf Cleaning Estimator
 * Modes: Window Cleaning, Christmas Lights
 * Plans: One-Time | Monthly (-$150) | Quarterly (-$100) | Bi-Annual (-$50)
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSupabaseSession } from "@/contexts/SupabaseSessionProvider";
import {
  clampNonNegInt,
  clampNonNegMoney,
  readLocalQuoteHistory,
  readLocalSalesStats,
  writeLocalQuoteHistory,
  writeLocalSalesStats,
} from "@/lib/localEstimatorStorage";
import { fetchUserAppDataRow, mergeRemoteAndLocal, upsertUserAppData } from "@/lib/remoteEstimatorSync";
import type { QuoteRecord, QuoteStatus, SalesTrackerStats, UpsellKind } from "@/types/leafData";
import {
  PANE_TIERS,
  getTierForPanes,
  SERVICE_PLAN_LABELS,
  SERVICE_PLAN_DESCRIPTIONS,
  SERVICE_PLAN_PERKS,
  SERVICE_PLAN_DISCOUNTS,
  FRENCH_PANE_MULTIPLIER,
  frenchPanesToStandard,
  calculateEstimate,
  CUSTOM_PRICE_PER_PANE,
  formatCurrency,
  type EstimateResult,
  type PaneTier,
  type ServiceKey,
  type ServicePlanType,
} from "@/lib/pricing";
import {
  Home as HomeIcon,
  Layers,
  Wind,
  Grid3x3,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Minus,
  Plus,
  ClipboardList,
  Info,
  Sparkles,
  X,
  Copy,
  Check,
  LayoutList,
  SquareStack,
  ChevronLeft,
  ChevronRight,
  Pencil,
} from "lucide-react";

const LAYOUT_MODE_STORAGE_KEY = "leaf:layoutMode:v1";

function findTierByMaxPanes(maxPanes: number): PaneTier | null {
  if (!maxPanes || maxPanes < 0) return null;
  return PANE_TIERS.find((t) => t.maxPanes === maxPanes) ?? null;
}

function resolveTierForQuote(q: QuoteRecord): PaneTier | null {
  if (q.isCustom) return null;
  const bySaved = findTierByMaxPanes(q.tierMaxPanes ?? 0);
  if (bySaved) return bySaved;
  return getTierForPanes(q.totalPanesForTier);
}

function getUpsellLinePrice(
  q: QuoteRecord,
  kind: UpsellKind,
  screenOpts: { onSite: boolean; special: boolean }
): number {
  if (kind === "screens" && screenOpts.onSite) {
    const t = resolveTierForQuote(q);
    if (t?.maxPanes === 25) return t.screens;
    return 60;
  }
  if (q.isCustom) {
    if (kind === "screens") return Math.round(q.totalPanesForTier * 2.5);
    if (kind === "tracks") return 0;
    return 0;
  }
  const tier = resolveTierForQuote(q);
  if (!tier) return 0;
  if (kind === "tracks") return tier.tracks;
  const onSite = !!screenOpts.onSite;
  const hasSpecial = !!screenOpts.special && tier.screenSpecial !== null;
  if (onSite) return 60;
  if (hasSpecial) return tier.screenSpecial!;
  return tier.screens;
}

function incrementalUpsellTotal(
  q: QuoteRecord,
  kinds: UpsellKind[],
  screenOpts: { onSite: boolean; special: boolean }
): number {
  let sum = 0;
  for (const k of kinds) {
    if (q.services.includes(k)) continue;
    sum += getUpsellLinePrice(q, k, screenOpts);
  }
  return sum;
}

/** Each add-on kind sold beyond the logged quote counts as one upsell (e.g. screens + tracks = 2). */
function countExtraUpsellKindsOnQuote(q: QuoteRecord, kinds: UpsellKind[] | undefined): number {
  if (!kinds?.length) return 0;
  return kinds.filter((k) => !q.services.includes(k)).length;
}

function quoteServiceSet(q: QuoteRecord): Set<ServiceKey> {
  const svc = new Set<ServiceKey>(q.services);
  svc.add("exterior");
  svc.delete("interior");
  return svc;
}

function quoteOneTimeEstimate(q: QuoteRecord): EstimateResult {
  let onSite = !!q.quotedOnSiteScreenUpsell;
  const svc = quoteServiceSet(q);
  const prelim = calculateEstimate(q.panes, q.frenchPanes, svc, "none", !!q.quotedScreenSpecial, {
    onSiteScreenUpsell: onSite,
  });
  if (prelim.tier?.maxPanes === 25 && onSite) {
    onSite = false;
  }
  return calculateEstimate(q.panes, q.frenchPanes, svc, "none", !!q.quotedScreenSpecial, {
    onSiteScreenUpsell: onSite,
  });
}

function quotePlanEstimate(q: QuoteRecord): EstimateResult {
  return calculateEstimate(q.panes, q.frenchPanes, new Set<ServiceKey>(["exterior"]), q.planType, false);
}

function buildPlanSummaryLine(planType: ServicePlanType, pl: EstimateResult): string {
  if (planType === "none") return `Plan: ${SERVICE_PLAN_LABELS.none} (no recurring)`;
  return `Plan: ${SERVICE_PLAN_LABELS[planType]} (Exterior) — ${formatCurrency(pl.total)}/visit · ${pl.annualValue != null ? `${formatCurrency(pl.annualValue)} est./yr` : ""}`;
}

function buildAddonsSummaryFromOT(ot: EstimateResult): string {
  const addonLines = ot.breakdown
    .filter((b) => /screen|track/i.test(b.label))
    .map((b) => `${b.label} — ${formatCurrency(b.price)}`);
  return addonLines.length > 0 ? addonLines.join(" · ") : "Add-ons: none";
}

function recomputeQuoteRecord(q: QuoteRecord): QuoteRecord {
  const ot = quoteOneTimeEstimate(q);
  const pl = quotePlanEstimate(q);
  let quotedOnSiteScreenUpsell = !!q.quotedOnSiteScreenUpsell;
  if (ot.tier?.maxPanes === 25) quotedOnSiteScreenUpsell = false;
  const fe = frenchPanesToStandard(q.frenchPanes);
  return {
    ...q,
    frenchEquivalent: fe,
    totalPanesForTier: q.panes + fe,
    tierMaxPanes: ot.tier?.maxPanes ?? 0,
    isCustom: ot.isCustom,
    tierLabel: ot.tier?.label ?? "Custom",
    oneTimeSubtotal: ot.subtotal,
    alreadyOut: Math.max(ot.subtotal - 100, 125),
    planPerVisit: q.planType === "none" ? null : pl.total,
    planAnnualValue: q.planType === "none" ? null : pl.annualValue,
    quotedOnSiteScreenUpsell,
    planSummary: buildPlanSummaryLine(q.planType, pl),
    addonsSummary: buildAddonsSummaryFromOT(ot),
  };
}

// ── Mode config ──────────────────────────────────────────────────────────────

type AppMode = "windows";

const MODE_CONFIG = [
  {
    key: "windows" as const,
    label: "Windows",
    icon: <Layers size={18} />,
    activeClass: "border-primary bg-accent text-primary",
    stepColor: "bg-primary text-primary-foreground",
    btnColor: "bg-primary text-primary-foreground hover:bg-primary/90",
    ringColor: "focus:ring-primary",
  },
];

/** Quoted or already-sold rows: fix add-ons/plan in history after mistakes. */
function quoteAllowsHistoryAddonEdit(status: QuoteStatus): boolean {
  return status === "quoted" || status === "sold" || status === "sold_upsell";
}

const SERVICE_CONFIG: {
  key: ServiceKey;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}[] = [
  { key: "exterior", label: "Exterior", description: "Outside glass surfaces", icon: <HomeIcon size={20} />, color: "text-blue-500" },
  { key: "screens", label: "Screens", description: "Window screen cleaning", icon: <Grid3x3 size={20} />, color: "text-amber-500" },
  {
    key: "tracks",
    label: "Tracks",
    description: "Full-house track detailing (add-on with exterior)",
    icon: <Wind size={20} />,
    color: "text-rose-500",
  },
];

const UPSELL_SERVICE_CONFIG = SERVICE_CONFIG.filter((s) => s.key === "screens" || s.key === "tracks");

/** Saved on quotes; recurring plans are exterior-only in this app. */
const PLAN_BUNDLE_ACTIVE = "exterior" as const;

const PLAN_CARD_STYLES: Record<
  ServicePlanType,
  { selected: string; idle: string; badge: string; title: string }
> = {
  none: {
    idle: "border-slate-200 bg-gradient-to-br from-slate-50 to-white hover:border-slate-300",
    selected:
      "border-slate-500 bg-gradient-to-br from-slate-100 via-white to-slate-50 shadow-md ring-2 ring-slate-300/40",
    badge: "bg-slate-600 text-white",
    title: "text-slate-800",
  },
  monthly: {
    idle: "border-sky-200 bg-gradient-to-br from-sky-50/90 to-white hover:border-sky-300",
    selected:
      "border-sky-500 bg-gradient-to-br from-sky-400/30 via-sky-50 to-white shadow-md ring-2 ring-sky-400/50",
    badge: "bg-sky-600 text-white",
    title: "text-sky-900",
  },
  quarterly: {
    idle: "border-violet-200 bg-gradient-to-br from-violet-50/90 to-white hover:border-violet-300",
    selected:
      "border-violet-500 bg-gradient-to-br from-violet-400/25 via-violet-50 to-white shadow-md ring-2 ring-violet-400/45",
    badge: "bg-violet-600 text-white",
    title: "text-violet-950",
  },
  biannual: {
    idle: "border-amber-200 bg-gradient-to-br from-amber-50/90 to-white hover:border-amber-300",
    selected:
      "border-amber-500 bg-gradient-to-br from-amber-400/30 via-amber-50 to-white shadow-md ring-2 ring-amber-400/45",
    badge: "bg-amber-600 text-white",
    title: "text-amber-950",
  },
};

const PLAN_PERKS_LIST = [
  { key: "leafRainblock" as const, label: "Leaf Rainblock Treatment" },
  { key: "rainGuarantee" as const, label: "7-Day Rain Guarantee" },
  { key: "hardWaterRemoval" as const, label: "Hard Water Removal" },
  { key: "leafTech" as const, label: "Leaf Tech Service" },
];

// ── Component ────────────────────────────────────────────────────────────────

export default function Home() {
  const { enabled: supabaseEnabled, ready: supabaseReady, userId, authError } = useSupabaseSession();

  const [appMode, setAppMode] = useState<AppMode>("windows");
  const modeConfig = MODE_CONFIG.find((m) => m.key === appMode)!;

  const [copied, setCopied] = useState(false);
  const [salesStats, setSalesStats] = useState<SalesTrackerStats>(() => readLocalSalesStats());
  const [quoteHistory, setQuoteHistory] = useState<QuoteRecord[]>(() => readLocalQuoteHistory());
  const [activeQuoteId, setActiveQuoteId] = useState<string | null>(null);

  const [layoutMode, setLayoutMode] = useState<"scroll" | "pages">(() => {
    try {
      return localStorage.getItem(LAYOUT_MODE_STORAGE_KEY) === "pages" ? "pages" : "scroll";
    } catch {
      return "scroll";
    }
  });
  const [pageIndex, setPageIndex] = useState(0);

  const [saleModalOpen, setSaleModalOpen] = useState(false);
  const [includeExtraUpsellsOnSale, setIncludeExtraUpsellsOnSale] = useState(false);
  const [saleExtraKinds, setSaleExtraKinds] = useState<Set<UpsellKind>>(() => new Set());
  const [saleModalOnSite, setSaleModalOnSite] = useState(false);
  const [saleModalSpecial, setSaleModalSpecial] = useState(false);
  const [saleModalError, setSaleModalError] = useState<string | null>(null);

  const [editQuoteOpen, setEditQuoteOpen] = useState(false);
  const [editDraft, setEditDraft] = useState<QuoteRecord | null>(null);

  const [statsAdjustOpen, setStatsAdjustOpen] = useState(false);
  const [statsAdjustDraft, setStatsAdjustDraft] = useState<SalesTrackerStats | null>(null);

  // Window cleaning state
  const [paneCount, setPaneCount] = useState(0);
  const [frenchPaneCount, setFrenchPaneCount] = useState(0);
  const [selectedServices, setSelectedServices] = useState<Set<ServiceKey>>(new Set<ServiceKey>(["exterior"]));
  const [useScreenSpecial, setUseScreenSpecial] = useState(false);
  const [useOnSiteScreenUpsell, setUseOnSiteScreenUpsell] = useState(false);
  const [showInfo, setShowInfo] = useState(false);

  // Shared state
  const [servicePlan, setServicePlan] = useState<ServicePlanType>("none");
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [totalPulse, setTotalPulse] = useState(false);
  const prevTotalRef = useRef(0);

  /** After first cloud pull (or immediately when Supabase is off), allow pushes so we do not overwrite server with stale local. */
  const [cloudHydrationDone, setCloudHydrationDone] = useState(false);

  useEffect(() => {
    if (!supabaseEnabled) {
      setCloudHydrationDone(true);
      return;
    }
    setCloudHydrationDone(false);
  }, [supabaseEnabled]);

  useEffect(() => {
    if (!supabaseEnabled || !supabaseReady) return;
    if (!userId) {
      setCloudHydrationDone(true);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const row = await fetchUserAppDataRow(userId);
        if (cancelled) return;
        const merged = mergeRemoteAndLocal(row, readLocalSalesStats(), readLocalQuoteHistory());
        setSalesStats(merged.salesStats);
        setQuoteHistory(merged.quoteHistory);
      } catch (e) {
        console.error("[Leaf] Supabase hydrate failed", e);
      } finally {
        if (!cancelled) setCloudHydrationDone(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [supabaseEnabled, supabaseReady, userId]);

  useEffect(() => {
    writeLocalSalesStats(salesStats);
    writeLocalQuoteHistory(quoteHistory);
  }, [salesStats, quoteHistory]);

  useEffect(() => {
    if (!supabaseEnabled || !supabaseReady || !userId || !cloudHydrationDone) return;
    const t = window.setTimeout(() => {
      void upsertUserAppData(userId, salesStats, quoteHistory).catch((e) => {
        console.error("[Leaf] Supabase sync failed", e);
      });
    }, 750);
    return () => window.clearTimeout(t);
  }, [salesStats, quoteHistory, supabaseEnabled, supabaseReady, userId, cloudHydrationDone]);

  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_MODE_STORAGE_KEY, layoutMode);
    } catch {
      // ignore
    }
  }, [layoutMode]);

  useEffect(() => {
    setSelectedServices((prev) => {
      const next = new Set(prev);
      next.delete("interior");
      if (!next.has("exterior")) next.add("exterior");
      return next;
    });
  }, []);

  const isWindows = true;

  // 1) One-time visit quote (includes any selected add-ons; no plan discount)
  const oneTimeEstimate = calculateEstimate(paneCount, frenchPaneCount, selectedServices, "none", useScreenSpecial, {
    onSiteScreenUpsell: useOnSiteScreenUpsell,
  });

  // 2) Recurring plan quote (bundle only; screens/tracks excluded by default)
  const planBundleServices = useCallback(() => {
    if (!isWindows) return new Set<ServiceKey>();
    return new Set<ServiceKey>(["exterior"]);
  }, [isWindows]);

  const planEstimate = calculateEstimate(paneCount, frenchPaneCount, planBundleServices(), servicePlan, false);

  // One-time price points (no plan discount)
  const calledOutPrice = oneTimeEstimate.subtotal;
  const alreadyOutPrice = Math.max(oneTimeEstimate.subtotal - 100, appMode === "windows" ? 125 : 0);

  const frenchEquivalent = appMode === "windows" ? frenchPanesToStandard(frenchPaneCount) : 0;
  const totalPanes = appMode === "windows" ? paneCount + frenchEquivalent : 0;
  const tier = appMode === "windows" ? oneTimeEstimate.tier : null;
  const currentTierIndex = tier ? PANE_TIERS.findIndex((t) => t.maxPanes === tier.maxPanes) : -1;
  const hasScreenSpecial = !!(tier?.screenSpecial) && selectedServices.has("screens");
  const hasAnyTotal = calledOutPrice > 0;
  const perks = SERVICE_PLAN_PERKS[servicePlan];

  useEffect(() => {
    const displayedTotal =
      appMode === "windows" && servicePlan !== "none" ? planEstimate.total : calledOutPrice;
    if (displayedTotal !== prevTotalRef.current && displayedTotal > 0) {
      setTotalPulse(true);
      const t = setTimeout(() => setTotalPulse(false), 300);
      prevTotalRef.current = displayedTotal;
      return () => clearTimeout(t);
    }
  }, [appMode, calledOutPrice, planEstimate.total, servicePlan]);

  useEffect(() => {
    if (tier?.maxPanes === 25 && useOnSiteScreenUpsell) {
      setUseOnSiteScreenUpsell(false);
    }
  }, [tier?.maxPanes, useOnSiteScreenUpsell]);

  // Single-mode app (Windows). Keep this for future expansion.

  const fullReset = () => {
    setPaneCount(0);
    setFrenchPaneCount(0);
    setSelectedServices(new Set<ServiceKey>(["exterior"]));
    setUseScreenSpecial(false);
    setUseOnSiteScreenUpsell(false);
    setServicePlan("none");
    setShowBreakdown(false);
    setCopied(false);
    setShowInfo(false);
    setPageIndex(0);
    setSaleModalOpen(false);
    setIncludeExtraUpsellsOnSale(false);
    setSaleExtraKinds(new Set());
    setSaleModalOnSite(false);
    setSaleModalSpecial(false);
    setSaleModalError(null);
    setEditQuoteOpen(false);
    setEditDraft(null);
    setStatsAdjustOpen(false);
    setStatsAdjustDraft(null);
    setActiveQuoteId(null);
    const clearedStats = {
      quotes: 0,
      sales: 0,
      upsells: 0,
      soldRevenueOneTime: 0,
      soldAnnualValue: 0,
    };
    setSalesStats(clearedStats);
  };

  const toggleService = useCallback((key: ServiceKey) => {
    if (key === "exterior" || key === "interior") return;
    setSelectedServices((prev) => {
      const next = new Set(prev);
      next.add("exterior");
      next.delete("interior");
      const has = next.has(key);
      if (has) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const buildQuoteSnapshot = useCallback((): QuoteRecord | null => {
    if (calledOutPrice <= 0) return null;
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const tierLabel = oneTimeEstimate.tier?.label ?? "Custom";

    const addonsSummary = buildAddonsSummaryFromOT(oneTimeEstimate);
    const planSummary = buildPlanSummaryLine(servicePlan, planEstimate);

    return {
      id,
      createdAt: Date.now(),
      panes: paneCount,
      frenchPanes: frenchPaneCount,
      frenchEquivalent,
      totalPanesForTier: totalPanes,
      tierMaxPanes: oneTimeEstimate.tier?.maxPanes ?? 0,
      isCustom: oneTimeEstimate.isCustom,
      tierLabel,
      oneTimeSubtotal: calledOutPrice,
      alreadyOut: alreadyOutPrice,
      services: Array.from(selectedServices),
      planType: servicePlan,
      planBundle: PLAN_BUNDLE_ACTIVE,
      planPerVisit: servicePlan === "none" ? null : planEstimate.total,
      planAnnualValue: servicePlan === "none" ? null : planEstimate.annualValue,
      status: "quoted",
      quotedScreenSpecial: useScreenSpecial,
      quotedOnSiteScreenUpsell: useOnSiteScreenUpsell,
      planSummary,
      addonsSummary,
    };
  }, [
    alreadyOutPrice,
    calledOutPrice,
    frenchEquivalent,
    frenchPaneCount,
    paneCount,
    planEstimate.annualValue,
    planEstimate.total,
    selectedServices,
    servicePlan,
    totalPanes,
    oneTimeEstimate.tier,
    oneTimeEstimate.isCustom,
    oneTimeEstimate.breakdown,
    useScreenSpecial,
    useOnSiteScreenUpsell,
  ]);

  const logQuote = useCallback(() => {
    const snap = buildQuoteSnapshot();
    if (!snap) return;
    setQuoteHistory((prev) => {
      const next = [snap, ...prev].slice(0, 200);
      return next;
    });
    setActiveQuoteId(snap.id);
    setSalesStats((prev) => {
      const next = { ...prev, quotes: prev.quotes + 1 };
      return next;
    });
  }, [buildQuoteSnapshot]);

  const applyMarkSale = useCallback(
    (opts: {
      upsell: boolean;
      kinds?: UpsellKind[];
      screenOpts?: { onSite: boolean; special: boolean };
    }) => {
      const id = activeQuoteId;
      if (!id) return;
      const q = quoteHistory.find((x) => x.id === id);
      if (!q) return;
      if (q.status !== "quoted") return;

      const soldAnnual = q.planType !== "none" ? (q.planAnnualValue ?? 0) : 0;

      const screenOpts = opts.screenOpts ?? { onSite: false, special: false };
      const hasKinds = !!(opts.kinds && opts.kinds.length > 0);
      const extraUpsellKindsCount = countExtraUpsellKindsOnQuote(q, opts.kinds);
      const extra = hasKinds ? incrementalUpsellTotal(q, opts.kinds!, screenOpts) : 0;

      const oneTimeRevenueAdd =
        (q.planType === "none" ? q.oneTimeSubtotal : 0) + (hasKinds ? extra : 0);

      const upsellKindsFinal = hasKinds ? opts.kinds : undefined;

      setQuoteHistory((prev) => {
        const next = prev.map((x) =>
          x.id === id
            ? {
                ...x,
                status: (hasKinds ? "sold_upsell" : "sold") as QuoteStatus,
                ...(upsellKindsFinal ? { upsellKinds: upsellKindsFinal } : {}),
              }
            : x
        );
        return next;
      });

      setSalesStats((prev) => {
        const next = {
          ...prev,
          sales: prev.sales + 1,
          upsells: prev.upsells + extraUpsellKindsCount,
          soldRevenueOneTime: prev.soldRevenueOneTime + oneTimeRevenueAdd,
          soldAnnualValue: prev.soldAnnualValue + soldAnnual,
        };
        return next;
      });
    },
    [activeQuoteId, quoteHistory]
  );

  const activeQuoteTarget = activeQuoteId ? quoteHistory.find((x) => x.id === activeQuoteId) ?? null : null;
  const canMarkSale = activeQuoteTarget?.status === "quoted";

  const openMarkSaleModal = useCallback(() => {
    if (!activeQuoteTarget || activeQuoteTarget.status !== "quoted") return;
    setSaleModalError(null);
    setIncludeExtraUpsellsOnSale(false);
    setSaleExtraKinds(new Set());
    const t = resolveTierForQuote(activeQuoteTarget);
    const canOnSite60 = !!t && t.maxPanes > 25;
    setSaleModalOnSite(canOnSite60 && (activeQuoteTarget.quotedOnSiteScreenUpsell ?? false));
    setSaleModalSpecial(activeQuoteTarget.quotedScreenSpecial ?? false);
    setSaleModalOpen(true);
  }, [activeQuoteTarget]);

  const confirmMarkSale = useCallback(() => {
    if (!activeQuoteTarget) return;
    if (includeExtraUpsellsOnSale) {
      const kinds = Array.from(saleExtraKinds);
      if (kinds.length === 0) {
        setSaleModalError('Pick screens/tracks, or turn off “Extra upsells on this sale”.');
        return;
      }
      setSaleModalError(null);
      applyMarkSale({
        upsell: true,
        kinds,
        screenOpts: { onSite: saleModalOnSite, special: saleModalSpecial },
      });
    } else {
      setSaleModalError(null);
      applyMarkSale({ upsell: false });
    }
    setSaleModalOpen(false);
  }, [
    activeQuoteTarget,
    applyMarkSale,
    includeExtraUpsellsOnSale,
    saleExtraKinds,
    saleModalOnSite,
    saleModalSpecial,
  ]);

  const openEditQuote = useCallback((q: QuoteRecord) => {
    if (!quoteAllowsHistoryAddonEdit(q.status)) return;
    setEditDraft({ ...q });
    setEditQuoteOpen(true);
  }, []);

  const saveEditQuote = useCallback(() => {
    if (!editDraft) return;
    const saved = recomputeQuoteRecord(editDraft);
    setQuoteHistory((prev) => {
      const next = prev.map((x) => (x.id === saved.id ? saved : x));
      return next;
    });
    setEditQuoteOpen(false);
    setEditDraft(null);
  }, [editDraft]);

  const editPreview = useMemo(() => (editDraft ? recomputeQuoteRecord(editDraft) : null), [editDraft]);

  const openStatsAdjust = useCallback(() => {
    setStatsAdjustDraft({ ...salesStats });
    setStatsAdjustOpen(true);
  }, [salesStats]);

  const saveStatsAdjust = useCallback(() => {
    if (!statsAdjustDraft) return;
    const next: SalesTrackerStats = {
      quotes: clampNonNegInt(statsAdjustDraft.quotes),
      sales: clampNonNegInt(statsAdjustDraft.sales),
      upsells: clampNonNegInt(statsAdjustDraft.upsells),
      soldRevenueOneTime: clampNonNegMoney(statsAdjustDraft.soldRevenueOneTime),
      soldAnnualValue: clampNonNegMoney(statsAdjustDraft.soldAnnualValue),
    };
    setSalesStats(next);
    setStatsAdjustOpen(false);
    setStatsAdjustDraft(null);
  }, [statsAdjustDraft]);

  const handleCopyQuote = () => {
    const modeLabel = MODE_CONFIG.find((m) => m.key === appMode)?.label ?? appMode;
    const planLabel = SERVICE_PLAN_LABELS[servicePlan];
    const lines: string[] = [];

    lines.push("🍃 Leaf Cleaning — Quote");
    lines.push("──────────────────────────");
    lines.push(`Service: ${modeLabel}`);
    lines.push("");

    if (oneTimeEstimate.breakdown.length > 0) {
      lines.push("One-time services:");
      oneTimeEstimate.breakdown.forEach((item) => {
        lines.push(`  • ${item.label} — ${formatCurrency(item.price)}`);
      });
      lines.push("");
    }

    lines.push("Service plan:");
    lines.push(
      servicePlan === "none"
        ? `  • ${SERVICE_PLAN_LABELS.none} (no recurring)`
        : `  • ${SERVICE_PLAN_LABELS[servicePlan]} (Exterior) — ${formatCurrency(planEstimate.total)}/visit` +
            (planEstimate.annualValue ? ` · ${formatCurrency(planEstimate.annualValue)} est./yr` : "")
    );
    const addonBits = oneTimeEstimate.breakdown
      .filter((b) => /screen|track/i.test(b.label))
      .map((b) => `  • ${b.label} — ${formatCurrency(b.price)}`);
    lines.push("Add-ons / upsells:");
    if (addonBits.length > 0) addonBits.forEach((l) => lines.push(l));
    else lines.push("  • None");
    lines.push("");

    lines.push("──────────────────────────");
    lines.push(`Called Out (one-time): ${formatCurrency(calledOutPrice)}`);
    lines.push(`Already Out (−$100):   ${formatCurrency(alreadyOutPrice)}`);

    if (appMode === "windows" && servicePlan !== "none") {
      lines.push("");
      lines.push("Recurring plan (bundle only):");
      lines.push(`Plan: ${planLabel} (Exterior)`);
      if (planEstimate.planDiscount > 0) {
        lines.push(`Discount: −${formatCurrency(planEstimate.planDiscount)} / visit`);
      }
      lines.push(`Per visit: ${formatCurrency(planEstimate.total)}`);
      if (planEstimate.annualValue) lines.push(`Annual value: ${formatCurrency(planEstimate.annualValue)}`);
    }

    if (servicePlan !== "none") {
      const includedPerks = PLAN_PERKS_LIST.filter((p) => perks[p.key]).map((p) => p.label);
      if (includedPerks.length > 0) {
        lines.push("");
        lines.push("Plan Perks:");
        includedPerks.forEach((p) => lines.push(`  ✓ ${p}`));
      }
    }

    lines.push("");
    lines.push("Spotless Views. Every Time.");
    lines.push("www.dirtyleafcleaning.com");

    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Window pane counter helpers
  const increment = () => setPaneCount((c) => Math.min(c + 1, 200));
  const decrement = () => setPaneCount((c) => Math.max(c - 1, 0));
  const incrementBy = (n: number) => setPaneCount((c) => Math.min(c + n, 200));
  const decrementBy = (n: number) => setPaneCount((c) => Math.max(c - n, 0));

  const showPage = (n: number) => layoutMode === "scroll" || pageIndex === n;
  const PAGE_LAST = 3;

  const renderInlineStepNav = (step: number) => {
    if (layoutMode !== "pages" || pageIndex !== step) return null;
    return (
      <div
        className="mt-4 rounded-2xl border border-border bg-card px-3 py-3 shadow-sm"
        style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={pageIndex <= 0}
            onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
            className="h-11 px-3 rounded-xl border border-border bg-white font-bold text-sm font-display flex items-center gap-1 disabled:opacity-35"
          >
            <ChevronLeft size={18} aria-hidden />
            Back
          </button>
          <p className="text-xs font-bold text-muted-foreground font-display text-center flex-1 min-w-0">
            Step {pageIndex + 1} / {PAGE_LAST + 1}
          </p>
          <button
            type="button"
            disabled={pageIndex >= PAGE_LAST}
            onClick={() => setPageIndex((i) => Math.min(PAGE_LAST, i + 1))}
            className="h-11 px-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm font-display flex items-center gap-1 disabled:opacity-35"
          >
            Next
            <ChevronRight size={18} aria-hidden />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background pb-10">

      {/* ── Sticky Header ── */}
      <div
        className="sticky top-0 z-50 border-b border-white/10 shadow-sm"
        style={{
          background: "rgba(15, 27, 51, 0.92)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        <div className="max-w-[480px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Leaf Cleaning" className="w-9 h-9 rounded-full object-cover bg-white" />
            <div>
              <p className="text-xs text-white/70 font-medium leading-none">Leaf Cleaning</p>
              <p className="text-sm font-bold text-white leading-tight font-display">Estimator</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <button
              type="button"
              title={layoutMode === "scroll" ? "Switch to step-by-step pages" : "Show full scroll layout"}
              onClick={() => {
                setLayoutMode((m) => (m === "scroll" ? "pages" : "scroll"));
                setPageIndex(0);
              }}
              className="h-9 px-2.5 rounded-xl border border-white/15 flex items-center gap-1.5 text-white/80 hover:text-white hover:bg-white/10 transition-colors text-xs font-semibold"
            >
              {layoutMode === "scroll" ? <LayoutList size={15} /> : <SquareStack size={15} />}
              <span className="hidden min-[380px]:inline">{layoutMode === "scroll" ? "Scroll" : "Steps"}</span>
            </button>
            <button
              type="button"
              onClick={fullReset}
              className="h-9 px-3 rounded-xl border border-white/15 flex items-center gap-2 text-white/80 hover:text-white hover:bg-white/10 transition-colors text-sm font-semibold"
            >
              <RefreshCw size={14} />
              Reset
            </button>
            <div className={`text-right transition-all duration-200 ${totalPulse ? "total-pulse" : ""}`}>
              <p className="text-xs text-white/70 font-medium leading-none">
                {calledOutPrice > 0
                  ? appMode === "windows" && servicePlan !== "none"
                    ? `${SERVICE_PLAN_LABELS[servicePlan]} (Exterior)`
                    : "Called Out"
                  : "No quote yet"}
              </p>
              <p className="text-2xl font-bold leading-tight text-white font-display">
                {calledOutPrice > 0
                  ? formatCurrency(appMode === "windows" && servicePlan !== "none" ? planEstimate.total : calledOutPrice)
                  : "—"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[480px] mx-auto px-4 pt-5 space-y-4">

        {/* Single mode: Windows */}

        {/* ══════════════════════════════════════════
            WINDOW CLEANING MODE
        ══════════════════════════════════════════ */}
        {appMode === "windows" && (
          <>
            {showPage(0) && (
            <>
            {/* Step 1: Pane Count */}
            <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
              <div className="px-4 pt-4 pb-3 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center font-display ${modeConfig.stepColor}`}>1</span>
                  <h2 className="font-bold text-foreground font-display">Count the Panes</h2>
                </div>
                <button onClick={() => setShowInfo(!showInfo)} className="text-muted-foreground hover:text-foreground transition-colors">
                  <Info size={16} />
                </button>
              </div>

              {showInfo && (
                <div className="px-4 py-3 bg-accent/50 border-b border-border text-sm text-accent-foreground">
                  <p className="font-semibold mb-1">How to count panes:</p>
                  <p>Every individual piece of glass = 1 pane. A standard window with a fixed top + sliding bottom = <strong>2 panes</strong>. Count all glass on the house.</p>
                </div>
              )}

              <div className="px-4 py-5">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <button onClick={decrement} className="pane-btn bg-secondary text-foreground hover:bg-border">
                    <Minus size={22} />
                  </button>
                  <div className="flex-1 text-center">
                    <p className="text-6xl font-bold text-foreground leading-none font-display">{paneCount}</p>
                    <p className="text-sm text-muted-foreground mt-1 font-medium">panes</p>
                  </div>
                  <button onClick={increment} className={`pane-btn ${modeConfig.btnColor}`}>
                    <Plus size={22} />
                  </button>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {[-5, -1, +1, +5].map((n) => (
                    <button
                      key={n}
                      onClick={() => n > 0 ? incrementBy(n) : decrementBy(Math.abs(n))}
                      className="py-2 rounded-xl text-sm font-semibold border border-border bg-secondary text-secondary-foreground hover:bg-border transition-colors active:scale-95"
                    >
                      {n > 0 ? `+${n}` : `${n}`}
                    </button>
                  ))}
                </div>

                <div className="mt-3">
                  <input
                    type="number"
                    min={0}
                    max={200}
                    value={paneCount === 0 ? "" : paneCount}
                    placeholder="Or type a number"
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      if (!isNaN(v)) setPaneCount(Math.min(Math.max(v, 0), 200));
                      else if (e.target.value === "") setPaneCount(0);
                    }}
                    className={`w-full h-11 rounded-xl border border-border bg-secondary px-3 text-center text-lg font-bold text-foreground focus:outline-none focus:ring-2 font-display ${modeConfig.ringColor}`}
                  />
                </div>

                {/* French panes add-on counter */}
                <div className="mt-4 rounded-2xl border-2 border-primary/20 bg-accent/40 p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div>
                      <p className="text-sm font-extrabold text-foreground font-display">French Panes</p>
                      <p className="text-xs text-muted-foreground">
                        Count small panes, we convert using <strong>×{FRENCH_PANE_MULTIPLIER}</strong> (rounded up).
                      </p>
                    </div>
                    {frenchPaneCount > 0 && (
                      <span className="text-xs font-bold text-primary bg-white/70 border border-primary/20 px-2.5 py-1 rounded-full font-display">
                        +{frenchPaneCount}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setFrenchPaneCount((c) => Math.max(c - 1, 0))}
                      className="w-12 h-12 rounded-2xl bg-white border border-border flex items-center justify-center text-foreground hover:bg-secondary active:scale-95 transition-all"
                    >
                      <Minus size={18} />
                    </button>
                    <input
                      type="number"
                      min={0}
                      max={200}
                      value={frenchPaneCount === 0 ? "" : frenchPaneCount}
                      placeholder="0"
                      onChange={(e) => {
                        const v = parseInt(e.target.value);
                        if (!isNaN(v)) setFrenchPaneCount(Math.min(Math.max(v, 0), 200));
                        else if (e.target.value === "") setFrenchPaneCount(0);
                      }}
                      className="flex-1 h-12 rounded-2xl border border-border bg-white px-3 text-center text-lg font-extrabold text-foreground focus:outline-none focus:ring-2 focus:ring-primary font-display"
                    />
                    <button
                      onClick={() => setFrenchPaneCount((c) => Math.min(c + 1, 200))}
                      className="w-12 h-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all"
                    >
                      <Plus size={18} />
                    </button>
                  </div>

                  <div className="grid grid-cols-4 gap-2 mt-3">
                    {[10, 20, 30, 40].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setFrenchPaneCount((c) => Math.min(c + n, 200))}
                        className="h-10 rounded-xl text-sm font-bold border border-border bg-white hover:bg-secondary active:scale-95 transition-all font-display"
                      >
                        +{n}
                      </button>
                    ))}
                  </div>
                  {frenchPaneCount > 0 && (
                    <div className="mt-3 rounded-xl bg-white/70 border border-primary/15 px-3 py-2 text-center">
                      <p className="text-[11px] text-muted-foreground font-semibold">French equiv.</p>
                      <p className="text-lg font-extrabold text-primary font-display">{frenchEquivalent} panes</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Added toward your total below.</p>
                    </div>
                  )}
                </div>
              </div>

              {totalPanes > 0 && (
                <div className="px-4 pb-4">
                  <div className="rounded-xl bg-accent px-3 py-2 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-accent-foreground/70 font-medium">Pricing Tier</p>
                      <p className="text-sm font-bold text-accent-foreground font-display">
                        {tier ? tier.label : `Custom (${totalPanes} panes)`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-accent-foreground/70 font-medium">Est. Home Size</p>
                      <p className="text-sm font-semibold text-accent-foreground">
                        {tier ? tier.sqftRange : "9,999+ SqFt"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="flex gap-1">
                      {PANE_TIERS.map((t, i) => (
                        <div
                          key={t.maxPanes}
                          className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i <= currentTierIndex ? "bg-primary" : "bg-border"}`}
                        />
                      ))}
                    </div>
                    <div className="flex justify-between mt-1">
                      {["25", "40", "60", "80", "100", "120+"].map((l) => (
                        <span key={l} className="text-[10px] text-muted-foreground">{l}</span>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4 rounded-2xl border-2 border-primary/35 bg-gradient-to-br from-primary/12 via-white to-sky-50/40 px-4 py-4 text-center shadow-sm">
                    <p className="text-[11px] font-extrabold uppercase tracking-wide text-primary font-display">
                      Total panes for pricing
                    </p>
                    <p className="text-5xl font-black text-primary font-display leading-none mt-1">{totalPanes}</p>
                    <p className="text-xs text-muted-foreground mt-2">
                      {paneCount} standard
                      {frenchPaneCount > 0 ? (
                        <span>
                          {" "}
                          · {frenchEquivalent} equiv. from {frenchPaneCount} French
                        </span>
                      ) : null}
                    </p>
                  </div>
                </div>
              )}
            </div>
            {renderInlineStepNav(0)}
            </>
            )}

            {showPage(1) && (
            <>
            {/* Step 2: Services */}
            <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
              <div className="px-4 pt-4 pb-3 border-b border-border flex items-center gap-2">
                <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center font-display ${modeConfig.stepColor}`}>2</span>
                <div>
                  <h2 className="font-bold text-foreground font-display">Services</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Exterior window cleaning is included — add screens & tracks below if needed.</p>
                </div>
              </div>

              <div className="p-4">
                <div className="rounded-2xl border-2 border-primary/25 bg-accent/40 px-4 py-4 flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0">
                    <HomeIcon size={22} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-extrabold text-foreground font-display">Exterior window cleaning</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Outside glass — always included in your quote</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    {tier && !oneTimeEstimate.isCustom ? (
                      <p className="text-lg font-extrabold text-primary font-display">{formatCurrency(tier.exterior)}</p>
                    ) : oneTimeEstimate.isCustom && totalPanes > 0 ? (
                      <p className="text-lg font-extrabold text-primary font-display">
                        {formatCurrency(totalPanes * CUSTOM_PRICE_PER_PANE)}
                      </p>
                    ) : (
                      <p className="text-sm font-semibold text-muted-foreground">—</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden mt-4">
              <div className="px-4 pt-4 pb-3 border-b border-border">
                <h3 className="font-bold text-foreground font-display text-sm">Add-ons (screens & tracks)</h3>
                <p className="text-xs text-muted-foreground mt-1">
                  Optional upsells — same prices apply when you use <strong>Mark Sale + Upsell</strong> below.
                </p>
              </div>
              <div className="p-4 grid grid-cols-2 gap-3">
                {UPSELL_SERVICE_CONFIG.map((svc) => {
                  const isSelected = selectedServices.has(svc.key);
                  let price: number | null = null;
                  if (tier) {
                    if (svc.key === "screens") {
                      if (useOnSiteScreenUpsell && tier.maxPanes > 25) price = 60;
                      else if (useScreenSpecial && tier.screenSpecial !== null) price = tier.screenSpecial;
                      else price = tier.screens;
                    } else {
                      price = tier.tracks;
                    }
                  } else if (oneTimeEstimate.isCustom) {
                    if (svc.key === "screens") price = Math.round(totalPanes * 2.5);
                    else price = null;
                  }
                  const tracksCustomQuote =
                    svc.key === "tracks" && (oneTimeEstimate.isCustom || (tier !== null && tier.tracks === 0));
                  const isUnavailable =
                    tier !== null &&
                    (tier[svc.key as keyof typeof tier] as number) === 0 &&
                    svc.key !== "tracks";

                  return (
                    <button
                      key={svc.key}
                      type="button"
                      onClick={() => !isUnavailable && toggleService(svc.key)}
                      disabled={isUnavailable}
                      className={`service-card relative rounded-2xl border-2 p-4 text-left transition-all duration-200 active:scale-[0.97] ${
                        isSelected && !isUnavailable
                          ? "border-amber-500/80 bg-amber-50/80"
                          : isUnavailable
                          ? "border-border bg-secondary/50 opacity-50 cursor-not-allowed"
                          : "border-border bg-white hover:border-amber-400/50 hover:bg-amber-50/40"
                      }`}
                    >
                      <div className={`mb-2 ${isSelected ? "text-amber-600" : svc.color}`}>{svc.icon}</div>
                      <p className={`font-bold text-sm font-display ${isSelected ? "text-amber-800" : "text-foreground"}`}>{svc.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{svc.description}</p>
                      {price !== null && price > 0 && (
                        <p className={`text-sm font-bold mt-2 font-display ${isSelected ? "text-amber-700" : "text-muted-foreground"}`}>
                          {formatCurrency(price)}
                        </p>
                      )}
                      {tracksCustomQuote && (
                        <p className="text-xs font-semibold text-rose-700 mt-2">Full house — custom quote</p>
                      )}
                      {isUnavailable && <p className="text-xs text-muted-foreground mt-2">Custom quote</p>}
                      {isSelected && !isUnavailable && (
                        <div className="absolute top-2 right-2 text-amber-600"><CheckCircle2 size={16} /></div>
                      )}
                    </button>
                  );
                })}
              </div>

              {tier?.maxPanes === 25 && selectedServices.has("screens") && (
                <p className="px-4 text-[11px] text-muted-foreground -mt-1 mb-2">
                  On-site <strong>$60</strong> screens apply from the <strong>26+</strong> panes tier. Up to 25 panes, screens stay{" "}
                  <strong>{formatCurrency(tier.screens)}</strong> unless you use the special below.
                </p>
              )}

              {selectedServices.has("screens") &&
                appMode === "windows" &&
                !oneTimeEstimate.isCustom &&
                tier &&
                tier.maxPanes > 25 && (
                <div className="px-4 pb-2">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !useOnSiteScreenUpsell;
                      setUseOnSiteScreenUpsell(next);
                      if (next) setUseScreenSpecial(false);
                    }}
                    className={`w-full rounded-xl border-2 px-4 py-3 flex items-center justify-between transition-all duration-200 ${
                      useOnSiteScreenUpsell ? "border-slate-400 bg-slate-50" : "border-border bg-secondary"
                    }`}
                  >
                    <div className="text-left">
                      <p className={`text-sm font-bold ${useOnSiteScreenUpsell ? "text-slate-700" : "text-foreground"}`}>
                        On-site screen upsell ($60)
                      </p>
                      <p className="text-xs text-muted-foreground">
                        From 26+ panes tier. First tier (≤25) stays the listed screen price ($50).
                      </p>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${useOnSiteScreenUpsell ? "border-slate-400 bg-slate-400" : "border-border"}`}>
                      {useOnSiteScreenUpsell && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                  </button>
                </div>
              )}

              {hasScreenSpecial && tier?.screenSpecial !== null && selectedServices.has("screens") && (
                <div className="px-4 pb-4">
                  <button
                    onClick={() => setUseScreenSpecial(!useScreenSpecial)}
                    disabled={useOnSiteScreenUpsell}
                    className={`w-full rounded-xl border-2 px-4 py-3 flex items-center justify-between transition-all duration-200 ${
                      useScreenSpecial ? "border-amber-400 bg-amber-50" : "border-border bg-secondary"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles size={16} className={useScreenSpecial ? "text-amber-500" : "text-muted-foreground"} />
                      <div className="text-left">
                        <p className={`text-sm font-bold ${useScreenSpecial ? "text-amber-700" : "text-foreground"}`}>Screen Cleaning Special</p>
                        <p className="text-xs text-muted-foreground">
                          {tier?.maxPanes === 25 ? "Up to 5 screens for $25" : "$25 special available"}
                        </p>
                      </div>
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${useScreenSpecial ? "border-amber-400 bg-amber-400" : "border-border"}`}>
                      {useScreenSpecial && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                  </button>
                </div>
              )}
            </div>
            {renderInlineStepNav(1)}
          </>
          )}
          </>
        )}

        {/* ══════════════════════════════════════════
            CHRISTMAS LIGHTS MODE
        ══════════════════════════════════════════ */}
        {/* Christmas lights removed for now */}

        {/* ══════════════════════════════════════════
            SERVICE PLAN (Windows only)
        ══════════════════════════════════════════ */}
        {appMode === "windows" && showPage(2) && (
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-border flex items-center gap-2">
            <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center font-display ${modeConfig.stepColor}`}>
              3
            </span>
            <h2 className="font-bold text-foreground font-display">Service Plan</h2>
            <span className="ml-auto text-xs font-semibold text-primary bg-accent px-2 py-0.5 rounded-full">Save up to $150</span>
          </div>

          <div className="px-4 pt-4">
            <p className="text-xs text-muted-foreground">
              Recurring plans are priced for <strong>exterior</strong> visits only. Screens and tracks stay separate add-ons.
            </p>
          </div>

          <div className="p-4 space-y-2">
            {(["none", "monthly", "quarterly", "biannual"] as ServicePlanType[]).map((plan) => {
              const isSelected = servicePlan === plan;
              const discount = SERVICE_PLAN_DISCOUNTS[plan];
              const ps = PLAN_CARD_STYLES[plan];
              return (
                <button
                  key={plan}
                  onClick={() => setServicePlan(plan)}
                  className={`w-full rounded-xl border-2 px-4 py-3 flex items-center justify-between transition-all duration-200 active:scale-[0.98] ${
                    isSelected ? ps.selected : ps.idle
                  }`}
                >
                  <div className="text-left">
                    <p className={`font-bold text-sm font-display ${isSelected ? ps.title : "text-foreground"}`}>
                      {SERVICE_PLAN_LABELS[plan]}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{SERVICE_PLAN_DESCRIPTIONS[plan]}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {discount > 0 && (
                      <span className={`text-xs font-bold font-display px-1.5 py-0.5 rounded-lg ${isSelected ? ps.badge : "bg-secondary text-muted-foreground"}`}>
                        −${discount}
                      </span>
                    )}
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        isSelected ? "border-white/90 bg-white/20" : "border-border bg-white/50"
                      }`}
                    >
                      {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Plan perks */}
          {servicePlan !== "none" && (
            <div className="px-4 pb-4">
              <div className={`rounded-xl p-3 ${servicePlan === "biannual" ? "bg-amber-50 border border-amber-200" : "bg-accent"}`}>
                <p className={`text-xs font-bold mb-2.5 font-display ${servicePlan === "biannual" ? "text-amber-700" : "text-accent-foreground"}`}>
                  {SERVICE_PLAN_LABELS[servicePlan]} Includes:
                </p>
                <div className="space-y-1.5">
                  {PLAN_PERKS_LIST.map((perk) => {
                    const included = perks[perk.key];
                    return (
                      <div key={perk.key} className="flex items-center gap-2">
                        {included ? (
                          <CheckCircle2 size={13} className="text-primary flex-shrink-0" />
                        ) : (
                          <X size={13} className="text-muted-foreground flex-shrink-0" />
                        )}
                        <span className={`text-xs ${included ? "text-foreground font-medium" : "text-muted-foreground line-through"}`}>
                          {perk.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
                {servicePlan === "biannual" && (
                  <p className="text-[11px] text-amber-600 mt-2.5 font-medium">
                    Upgrade to Monthly or Quarterly to unlock all perks.
                  </p>
                )}
              </div>
            </div>
          )}
        </div>
        )}

        {/* ══════════════════════════════════════════
            QUOTE SUMMARY
        ══════════════════════════════════════════ */}
        {showPage(2) && hasAnyTotal && calledOutPrice > 0 && (
          <div className="bg-white rounded-2xl border-2 border-primary shadow-md overflow-hidden">
            <div className="px-4 pt-4 pb-3 border-b border-primary/20 flex items-center gap-2">
              <ClipboardList size={18} className="text-primary" />
              <h2 className="font-bold text-foreground font-display">Quote Summary</h2>
            </div>
            <div className="p-4">

              {/* Line item breakdown */}
              <button
                onClick={() => setShowBreakdown(!showBreakdown)}
                className="w-full flex items-center justify-between text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
              >
                <span className="font-medium">View line items</span>
                {showBreakdown ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {showBreakdown && (
                <div className="space-y-2 mb-4">
                  {oneTimeEstimate.breakdown.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className="font-semibold text-foreground font-display">{formatCurrency(item.price)}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Plan price (Windows only when plan is active) */}
              {appMode === "windows" && servicePlan !== "none" && (
                <div className="rounded-xl bg-primary px-4 py-4 flex items-center justify-between mb-3">
                  <div>
                    <p className="text-primary-foreground/80 text-xs font-medium">
                      {SERVICE_PLAN_LABELS[servicePlan]} (Exterior)
                    </p>
                    <p className="text-4xl font-bold text-primary-foreground leading-tight font-display">
                      {formatCurrency(planEstimate.total)}
                    </p>
                  </div>
                  {planEstimate.annualValue && (
                    <div className="text-right">
                      <p className="text-primary-foreground/70 text-xs font-medium">Annual Value</p>
                      <p className="text-xl font-bold text-primary-foreground/90 font-display">
                        {formatCurrency(planEstimate.annualValue)}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ── Two one-time price blocks ── */}
              <div className="grid grid-cols-2 gap-3">
                {/* Called Out */}
                <div className="rounded-xl bg-foreground px-3 py-3 text-center">
                  <p className="text-xs font-semibold text-white/70 mb-1 font-display">Called Out</p>
                  <p className="text-2xl font-bold text-white leading-tight font-display">
                    {formatCurrency(calledOutPrice)}
                  </p>
                  <p className="text-[10px] text-white/60 mt-1">One-time, drive out</p>
                </div>

                {/* Already Out */}
                <div className="rounded-xl bg-primary/90 px-3 py-3 text-center">
                  <p className="text-xs font-semibold text-primary-foreground/70 mb-1 font-display">Already Out</p>
                  <p className="text-2xl font-bold text-primary-foreground leading-tight font-display">
                    {formatCurrency(alreadyOutPrice)}
                  </p>
                  <p className="text-[10px] text-primary-foreground/60 mt-1">In-area discount −$100</p>
                </div>
              </div>

              {appMode === "windows" && tier && (
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <Info size={12} />
                  <span>
                    Priced at <strong>{tier.label}</strong> ({tier.sqftRange})
                    {oneTimeEstimate.isCustom ? " — custom rate" : ""}
                    {frenchPaneCount > 0 ? ` · incl. ${frenchPaneCount} French panes` : ""}
                  </span>
                </div>
              )}

              {calledOutPrice >= 275 && (
                <div className="mt-3 rounded-xl bg-accent px-3 py-2 text-xs text-accent-foreground">
                  <span className="font-semibold">Tech Pay (20%):</span>{" "}
                  {formatCurrency(Math.round(calledOutPrice * 0.20))} · Target revenue/hr: $125+
                </div>
              )}

              <button
                onClick={handleCopyQuote}
                className={`mt-3 w-full rounded-xl border-2 py-3 flex items-center justify-center gap-2 text-sm font-bold font-display transition-all duration-200 active:scale-[0.98] ${
                  copied
                    ? "border-green-400 bg-green-50 text-green-700"
                    : "border-primary bg-accent text-primary hover:bg-primary hover:text-primary-foreground"
                }`}
              >
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? "Copied to clipboard!" : "Copy Quote"}
              </button>
            </div>
          </div>
        )}
        {renderInlineStepNav(2)}

        {/* ══════════════════════════════════════════
            SALES TRACKER
        ══════════════════════════════════════════ */}
        {showPage(3) && (
        <>
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-border flex items-center gap-2">
            <CheckCircle2 size={18} className="text-primary" />
            <h2 className="font-bold text-foreground font-display">Sales Tracker</h2>
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={openStatsAdjust}
                className="text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                Edit counts
              </button>
              <button
                type="button"
                onClick={() => {
                  const next = { quotes: 0, sales: 0, upsells: 0, soldRevenueOneTime: 0, soldAnnualValue: 0 };
                  setSalesStats(next);
                }}
                className="text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                Reset
              </button>
            </div>
          </div>

          {authError && (
            <div className="px-4 py-2 border-b border-border bg-destructive/10">
              <p className="text-[11px] text-destructive font-medium">
                Cloud backup unavailable: {authError}
              </p>
            </div>
          )}
          {supabaseEnabled && !authError && supabaseReady && !cloudHydrationDone && (
            <div className="px-4 py-2 border-b border-border bg-secondary/40">
              <p className="text-[11px] text-muted-foreground">Loading saved data from cloud…</p>
            </div>
          )}
          {supabaseEnabled && !authError && supabaseReady && cloudHydrationDone && (
            <div className="px-4 py-2 border-b border-border bg-emerald-50/60">
              <p className="text-[11px] text-emerald-950">
                Cloud backup on — quote history and sales tracker sync to your Supabase project.
              </p>
            </div>
          )}

          <div className="p-4 space-y-3">
            {activeQuoteTarget && (
              <div className="rounded-xl border-2 border-primary/25 bg-accent/50 px-3 py-3">
                <p className="text-[11px] font-bold text-primary uppercase tracking-wide font-display">Active quote</p>
                <p className="text-sm font-extrabold text-foreground font-display mt-1">
                  {activeQuoteTarget.totalPanesForTier} panes · {activeQuoteTarget.tierLabel}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {activeQuoteTarget.planType === "none"
                    ? formatCurrency(activeQuoteTarget.oneTimeSubtotal)
                    : `${formatCurrency(activeQuoteTarget.planPerVisit ?? 0)}/visit · ${SERVICE_PLAN_LABELS[activeQuoteTarget.planType]}`}
                </p>
              </div>
            )}
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-xl bg-secondary px-3 py-3 text-center">
                <p className="text-[11px] text-muted-foreground font-semibold">Quotes</p>
                <p className="text-2xl font-bold font-display text-foreground">{salesStats.quotes}</p>
              </div>
              <div className="rounded-xl bg-secondary px-3 py-3 text-center">
                <p className="text-[11px] text-muted-foreground font-semibold">Sales</p>
                <p className="text-2xl font-bold font-display text-foreground">{salesStats.sales}</p>
              </div>
              <div className="rounded-xl bg-secondary px-3 py-3 text-center">
                <p className="text-[11px] text-muted-foreground font-semibold">Upsells</p>
                <p className="text-2xl font-bold font-display text-foreground">{salesStats.upsells}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-border bg-white px-3 py-3">
                <p className="text-[11px] text-muted-foreground font-semibold">Close rate</p>
                <p className="text-lg font-bold font-display text-foreground">
                  {salesStats.quotes > 0 ? `${Math.round((salesStats.sales / salesStats.quotes) * 100)}%` : "—"}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-white px-3 py-3">
                <p className="text-[11px] text-muted-foreground font-semibold">Avg upsells / sale</p>
                <p className="text-lg font-bold font-display text-foreground">
                  {salesStats.sales > 0 ? (salesStats.upsells / salesStats.sales).toFixed(1) : "—"}
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-accent px-3 py-3">
              <p className="text-xs font-bold text-accent-foreground mb-2 font-display">
                Today’s actions
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={logQuote}
                  className="h-11 rounded-xl bg-primary text-primary-foreground font-bold font-display active:scale-95 transition-all"
                >
                  Log Quote
                </button>
                <button
                  type="button"
                  disabled={!activeQuoteId || !canMarkSale}
                  onClick={openMarkSaleModal}
                  className="h-11 rounded-xl border-2 border-primary bg-white text-primary font-bold font-display active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none"
                >
                  Mark Sale
                </button>
              </div>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Select a <strong>quoted</strong> row, then Mark Sale (optional mid-sale upsells in the prompt). Use{" "}
                <strong>Edit quote</strong> under any quoted or sold row to add/remove add-ons or change plan — including
                after a sale was recorded by mistake. Use <strong>Edit counts</strong> above to fix quotes/sales/upsells
                and revenue totals directly. Extra screens <em>and</em> tracks beyond the quote each add +1 upsell.{" "}
                <strong>Reset</strong> clears tracker only. Clear wipes saved quotes.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-border bg-white px-3 py-3">
                <p className="text-[11px] text-muted-foreground font-semibold">Sold (one-time)</p>
                <p className="text-lg font-bold font-display text-foreground">
                  {formatCurrency(salesStats.soldRevenueOneTime)}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-white px-3 py-3">
                <p className="text-[11px] text-muted-foreground font-semibold">Sold (annual value)</p>
                <p className="text-lg font-bold font-display text-foreground">
                  {formatCurrency(salesStats.soldAnnualValue)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* ── Quote History ── */}
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-border flex items-center gap-2">
            <ClipboardList size={18} className="text-primary" />
            <h2 className="font-bold text-foreground font-display">Quote History</h2>
            <button
              type="button"
              onClick={() => {
                setQuoteHistory([]);
                setActiveQuoteId(null);
              }}
              className="ml-auto text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              Clear
            </button>
          </div>
          <div className="p-4 space-y-2">
            {quoteHistory.length === 0 ? (
              <p className="text-sm text-muted-foreground">No saved quotes yet. Tap “Log Quote” to save one.</p>
            ) : (
              quoteHistory.slice(0, 15).map((q) => {
                const isActive = q.id === activeQuoteId;
                const time = new Date(q.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
                const primary = q.planType === "none" ? formatCurrency(q.oneTimeSubtotal) : `${formatCurrency(q.planPerVisit ?? 0)}/visit`;
                const secondary = q.planType === "none" ? "One-time" : `${SERVICE_PLAN_LABELS[q.planType]} (${q.planBundle === "exterior" ? "Exterior" : "Ext + Int"})`;
                const planLine =
                  q.planSummary ??
                  (q.planType === "none"
                    ? `Plan: ${SERVICE_PLAN_LABELS.none}`
                    : `Plan: ${SERVICE_PLAN_LABELS[q.planType]} (${q.planBundle === "exterior" ? "Exterior" : "Ext + Int"})`);
                const addonsLine =
                  q.addonsSummary ??
                  (() => {
                    const bits: string[] = [];
                    if (q.services.includes("screens")) {
                      bits.push(
                        q.quotedOnSiteScreenUpsell
                          ? "Screens (on-site)"
                          : q.quotedScreenSpecial
                            ? "Screens (special)"
                            : "Screens"
                      );
                    }
                    if (q.services.includes("tracks")) bits.push("Tracks");
                    return bits.length ? `Add-ons: ${bits.join(", ")}` : "Add-ons: none";
                  })();
                const upsellNote =
                  q.status === "sold_upsell" && q.upsellKinds?.length
                    ? ` (${q.upsellKinds.map((k) => (k === "screens" ? "Screens" : "Tracks")).join(", ")})`
                    : "";
                const status =
                  q.status === "sold_upsell"
                    ? `Sold + Upsell${upsellNote}`
                    : q.status === "sold"
                      ? "Sold"
                      : "Quoted";
                return (
                  <div
                    key={q.id}
                    className={`rounded-xl border-2 overflow-hidden transition-all ${
                      isActive ? "border-primary bg-accent" : "border-border bg-white"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => setActiveQuoteId(q.id)}
                      className={`w-full px-3 py-3 text-left transition-all active:scale-[0.99] ${
                        isActive ? "bg-transparent" : "hover:bg-secondary"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className={`text-sm font-bold font-display ${isActive ? "text-primary" : "text-foreground"}`}>
                            {q.totalPanesForTier} panes · {q.tierLabel}
                          </p>
                          <p className="text-[11px] text-muted-foreground leading-snug">{planLine}</p>
                          <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">{addonsLine}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {time} · {secondary} · {status}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className={`text-sm font-extrabold font-display ${isActive ? "text-primary" : "text-foreground"}`}>
                            {primary}
                          </p>
                          {q.planType !== "none" && q.planAnnualValue !== null && (
                            <p className="text-[11px] text-muted-foreground">
                              {formatCurrency(q.planAnnualValue)}/yr
                            </p>
                          )}
                        </div>
                      </div>
                    </button>
                    {quoteAllowsHistoryAddonEdit(q.status) && (
                      <div className="border-t border-border px-2 py-2 flex justify-end bg-secondary/30">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditQuote(q);
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-bold font-display text-foreground hover:bg-secondary"
                        >
                          <Pencil size={14} aria-hidden />
                          Edit quote
                        </button>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
        {renderInlineStepNav(3)}
        </>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground pb-2">
          Leaf Cleaning · Spotless Views. Every Time.
        </p>
      </div>

      {saleModalOpen && activeQuoteTarget && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sale-modal-title"
        >
          <div className="w-full max-w-[400px] rounded-2xl bg-white shadow-2xl border border-border overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="px-4 pt-4 pb-3 border-b border-border bg-gradient-to-r from-emerald-50 to-sky-50">
              <h3 id="sale-modal-title" className="text-lg font-extrabold text-foreground font-display">
                Record sale
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Turn on the switch only if you sold <strong>extra</strong> screens or tracks that were{" "}
                <strong>not</strong> already on this logged quote. Otherwise leave it off — one tap records the sale.
              </p>
            </div>
            <div className="p-4 space-y-3">
              <label className="flex items-start gap-3 rounded-xl border-2 border-border bg-secondary/30 px-3 py-3 cursor-pointer">
                <input
                  type="checkbox"
                  className="mt-0.5 rounded border-border"
                  checked={includeExtraUpsellsOnSale}
                  onChange={() => {
                    setIncludeExtraUpsellsOnSale((v) => !v);
                    setSaleModalError(null);
                  }}
                />
                <span className="text-sm text-foreground">
                  <span className="font-bold font-display">Extra upsells on this sale</span>
                  <span className="block text-xs text-muted-foreground mt-0.5">
                    Mid-job add-ons that were not in the quote when you logged it.
                  </span>
                </span>
              </label>

              {includeExtraUpsellsOnSale && (
                <>
                  {(["screens", "tracks"] as UpsellKind[]).map((kind) => {
                    const label = kind === "screens" ? "Screens" : "Tracks";
                    const inQuote = activeQuoteTarget.services.includes(kind);
                    const price = getUpsellLinePrice(activeQuoteTarget, kind, {
                      onSite: saleModalOnSite,
                      special: saleModalSpecial,
                    });
                    const tracksCustom = kind === "tracks" && price === 0;
                    const checked = saleExtraKinds.has(kind);
                    return (
                      <button
                        key={kind}
                        type="button"
                        onClick={() => {
                          setSaleExtraKinds((prev) => {
                            const n = new Set(prev);
                            if (n.has(kind)) n.delete(kind);
                            else n.add(kind);
                            return n;
                          });
                          setSaleModalError(null);
                        }}
                        className={`w-full rounded-xl border-2 px-4 py-3 flex items-center justify-between text-left transition-all ${
                          checked ? "border-amber-500 bg-amber-50" : "border-border bg-secondary/40 hover:bg-secondary"
                        }`}
                      >
                        <div>
                          <p className="font-bold font-display text-foreground">{label}</p>
                          <p className="text-xs text-muted-foreground">
                            {inQuote
                              ? "Already in logged quote — won’t double-count revenue"
                              : tracksCustom
                                ? "Full-house tracks — custom quote (not auto-added to revenue)"
                                : `Adds ${formatCurrency(price)} if selected`}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-lg font-extrabold font-display text-amber-700">
                            {tracksCustom ? "Custom" : formatCurrency(price)}
                          </p>
                          {checked && <CheckCircle2 size={18} className="text-amber-600 inline-block mt-1" />}
                        </div>
                      </button>
                    );
                  })}

                  {saleExtraKinds.has("screens") && (
                    <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                      <p className="text-xs font-bold text-amber-900 font-display">Screen pricing mode</p>
                      {resolveTierForQuote(activeQuoteTarget)?.maxPanes === 25 && (
                        <p className="text-[11px] text-amber-900/80">
                          ≤25 panes: on-site <strong>$60</strong> does not apply — use tier screen price or the special below.
                        </p>
                      )}
                      {resolveTierForQuote(activeQuoteTarget) &&
                        resolveTierForQuote(activeQuoteTarget)!.maxPanes > 25 && (
                          <label className="flex items-center gap-2 text-sm">
                            <input
                              type="checkbox"
                              checked={saleModalOnSite}
                              onChange={() => {
                                setSaleModalOnSite((v) => {
                                  const next = !v;
                                  if (next) setSaleModalSpecial(false);
                                  return next;
                                });
                              }}
                              className="rounded border-border"
                            />
                            On-site upsell ($60)
                          </label>
                        )}
                      {!activeQuoteTarget.isCustom && resolveTierForQuote(activeQuoteTarget)?.screenSpecial != null && (
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={saleModalSpecial}
                            disabled={saleModalOnSite}
                            onChange={() => setSaleModalSpecial((v) => !v)}
                            className="rounded border-border"
                          />
                          $25 screen special (tier)
                        </label>
                      )}
                    </div>
                  )}
                </>
              )}

              {saleModalError && <p className="text-sm text-destructive font-medium">{saleModalError}</p>}

              {includeExtraUpsellsOnSale && (
                <p className="text-xs text-muted-foreground">
                  Extra from selections:{" "}
                  <strong>
                    {formatCurrency(
                      incrementalUpsellTotal(activeQuoteTarget, Array.from(saleExtraKinds), {
                        onSite: saleModalOnSite,
                        special: saleModalSpecial,
                      })
                    )}
                  </strong>
                </p>
              )}

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSaleModalOpen(false)}
                  className="h-11 rounded-xl border-2 border-border font-bold font-display"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmMarkSale}
                  className="h-11 rounded-xl bg-primary text-primary-foreground font-bold font-display"
                >
                  Confirm sale
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {editQuoteOpen && editDraft && editPreview && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-quote-modal-title"
        >
          <div className="w-full max-w-[400px] rounded-2xl bg-white shadow-2xl border border-border overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="px-4 pt-4 pb-3 border-b border-border bg-gradient-to-r from-violet-50 to-sky-50">
              <h3 id="edit-quote-modal-title" className="text-lg font-extrabold text-foreground font-display">
                Edit quote
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                {editDraft.status === "quoted"
                  ? "Add or remove screens/tracks and adjust the plan before you mark it sold. Totals update live."
                  : "This row is already marked sold — use this to correct what was on the quote (add-ons, plan). Totals update live."}
              </p>
            </div>
            <div className="p-4 space-y-4">
              {(editDraft.status === "sold" || editDraft.status === "sold_upsell") && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-950">
                  <strong className="font-display">Note:</strong> Sales tracker numbers (close rate, sold revenue) were
                  captured when you marked the sale and are <strong>not</strong> changed here. Use{" "}
                  <strong>Edit counts</strong> on the tracker to line them up, or <strong>Reset</strong> to zero everything.
                </div>
              )}
              <div className="rounded-xl border border-border bg-secondary/40 px-3 py-2 text-sm">
                <p className="font-bold font-display text-foreground">
                  {editPreview.totalPanesForTier} panes · {editPreview.tierLabel}
                </p>
                <p className="text-[11px] text-muted-foreground mt-0.5">Panes are fixed here — use the calculator for a new pane count.</p>
              </div>

              <div>
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide font-display mb-2">
                  Service plan
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {(["none", "monthly", "quarterly", "biannual"] as ServicePlanType[]).map((plan) => {
                    const on = editDraft.planType === plan;
                    const st = PLAN_CARD_STYLES[plan];
                    return (
                      <button
                        key={plan}
                        type="button"
                        onClick={() =>
                          setEditDraft((d) =>
                            d ? { ...d, planType: plan, planBundle: PLAN_BUNDLE_ACTIVE } : d
                          )
                        }
                        className={`rounded-xl border-2 px-3 py-2 text-left text-xs font-bold font-display transition-all ${
                          on ? st.selected : st.idle
                        }`}
                      >
                        {SERVICE_PLAN_LABELS[plan]}
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-muted-foreground mt-1.5">{SERVICE_PLAN_DESCRIPTIONS[editDraft.planType]}</p>
              </div>

              <div>
                <p className="text-[11px] font-bold text-muted-foreground uppercase tracking-wide font-display mb-2">
                  Add-ons on quote
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {UPSELL_SERVICE_CONFIG.map((s) => {
                    const on = editDraft.services.includes(s.key);
                    return (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() =>
                          setEditDraft((d) => {
                            if (!d) return d;
                            const nextSvc = new Set(d.services);
                            const has = nextSvc.has(s.key);
                            if (has) {
                              nextSvc.delete(s.key);
                              const arr = Array.from(nextSvc) as ServiceKey[];
                              if (s.key === "screens") {
                                return {
                                  ...d,
                                  services: arr,
                                  quotedScreenSpecial: false,
                                  quotedOnSiteScreenUpsell: false,
                                };
                              }
                              return { ...d, services: arr };
                            }
                            nextSvc.add(s.key);
                            return { ...d, services: Array.from(nextSvc) as ServiceKey[] };
                          })
                        }
                        className={`rounded-xl border-2 px-3 py-3 text-left transition-all ${
                          on ? "border-primary bg-accent" : "border-border bg-secondary/40 hover:bg-secondary"
                        }`}
                      >
                        <p className="font-bold font-display text-foreground text-sm">{s.label}</p>
                        <p className="text-[10px] text-muted-foreground leading-tight mt-0.5">{s.description}</p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {editDraft.services.includes("screens") && (
                <div className="space-y-2 rounded-xl border border-border bg-amber-50/40 p-3">
                  <p className="text-xs font-bold text-amber-950 font-display">Screen pricing on quote</p>
                  {resolveTierForQuote(editPreview)?.maxPanes === 25 && (
                    <p className="text-[11px] text-amber-900/85">
                      ≤25 panes: on-site <strong>$60</strong> is cleared automatically for this tier.
                    </p>
                  )}
                  {resolveTierForQuote(editPreview) && resolveTierForQuote(editPreview)!.maxPanes > 25 && (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="rounded border-border"
                        checked={!!editDraft.quotedOnSiteScreenUpsell}
                        onChange={() =>
                          setEditDraft((d) => {
                            if (!d) return d;
                            const next = !d.quotedOnSiteScreenUpsell;
                            return {
                              ...d,
                              quotedOnSiteScreenUpsell: next,
                              quotedScreenSpecial: next ? false : d.quotedScreenSpecial,
                            };
                          })
                        }
                      />
                      On-site ($60)
                    </label>
                  )}
                  {!editPreview.isCustom && resolveTierForQuote(editPreview)?.screenSpecial != null && (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="rounded border-border"
                        checked={!!editDraft.quotedScreenSpecial}
                        disabled={!!editDraft.quotedOnSiteScreenUpsell}
                        onChange={() => setEditDraft((d) => (d ? { ...d, quotedScreenSpecial: !d.quotedScreenSpecial } : d))}
                      />
                      Tier screen special
                    </label>
                  )}
                </div>
              )}

              <div className="rounded-xl border border-dashed border-border bg-secondary/20 px-3 py-2 space-y-1 text-[11px] text-muted-foreground">
                <p className="font-semibold text-foreground text-xs font-display">Preview</p>
                <p>{editPreview.planSummary}</p>
                <p>{editPreview.addonsSummary}</p>
                <p className="text-foreground font-bold font-display pt-1">
                  One-time subtotal: {formatCurrency(editPreview.oneTimeSubtotal)}
                </p>
                {editPreview.planType !== "none" && editPreview.planPerVisit != null && (
                  <p>
                    Plan: {formatCurrency(editPreview.planPerVisit)}/visit
                    {editPreview.planAnnualValue != null ? ` · ${formatCurrency(editPreview.planAnnualValue)} est./yr` : ""}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditQuoteOpen(false);
                    setEditDraft(null);
                  }}
                  className="h-11 rounded-xl border-2 border-border font-bold font-display"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveEditQuote}
                  className="h-11 rounded-xl bg-primary text-primary-foreground font-bold font-display"
                >
                  Save changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {statsAdjustOpen && statsAdjustDraft && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="stats-adjust-title"
        >
          <div className="w-full max-w-[400px] rounded-2xl bg-white shadow-2xl border border-border overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="px-4 pt-4 pb-3 border-b border-border bg-secondary/40">
              <h3 id="stats-adjust-title" className="text-lg font-extrabold text-foreground font-display">
                Edit sales tracker
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Correct quotes logged, closes, upsell line items, and sold revenue for today. Values save to this device.
              </p>
            </div>
            <div className="p-4 space-y-3">
              {(
                [
                  { key: "quotes" as const, label: "Quotes logged" },
                  { key: "sales" as const, label: "Sales (closed)" },
                  { key: "upsells" as const, label: "Upsells (line items)" },
                ] as const
              ).map(({ key, label }) => (
                <label key={key} className="block">
                  <span className="text-[11px] font-bold text-muted-foreground font-display">{label}</span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className="mt-1 w-full rounded-xl border-2 border-border px-3 py-2 text-sm font-semibold"
                    value={statsAdjustDraft[key]}
                    onChange={(e) => {
                      const v = clampNonNegInt(e.target.value === "" ? 0 : Number(e.target.value));
                      setStatsAdjustDraft((d) => (d ? { ...d, [key]: v } : d));
                    }}
                  />
                </label>
              ))}
              <label className="block">
                <span className="text-[11px] font-bold text-muted-foreground font-display">Sold (one-time revenue, $)</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  className="mt-1 w-full rounded-xl border-2 border-border px-3 py-2 text-sm font-semibold"
                  value={statsAdjustDraft.soldRevenueOneTime}
                  onChange={(e) => {
                    const v = clampNonNegMoney(e.target.value === "" ? 0 : Number(e.target.value));
                    setStatsAdjustDraft((d) => (d ? { ...d, soldRevenueOneTime: v } : d));
                  }}
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-bold text-muted-foreground font-display">Sold (annual value, $)</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  className="mt-1 w-full rounded-xl border-2 border-border px-3 py-2 text-sm font-semibold"
                  value={statsAdjustDraft.soldAnnualValue}
                  onChange={(e) => {
                    const v = clampNonNegMoney(e.target.value === "" ? 0 : Number(e.target.value));
                    setStatsAdjustDraft((d) => (d ? { ...d, soldAnnualValue: v } : d));
                  }}
                />
              </label>
              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setStatsAdjustOpen(false);
                    setStatsAdjustDraft(null);
                  }}
                  className="h-11 rounded-xl border-2 border-border font-bold font-display"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={saveStatsAdjust}
                  className="h-11 rounded-xl bg-primary text-primary-foreground font-bold font-display"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
