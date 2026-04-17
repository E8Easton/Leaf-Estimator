/**
 * Leaf Cleaning Estimator
 * Modes: Window Cleaning, Christmas Lights
 * Plans: One-Time | Monthly (-$150) | Quarterly (-$100) | Bi-Annual (-$50)
 */

import { useState, useEffect, useRef, useCallback } from "react";
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
  formatCurrency,
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
} from "lucide-react";

type UpsellKind = "screens" | "tracks";

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
  if (kind === "screens" && screenOpts.onSite) return 60;
  if (q.isCustom) {
    if (kind === "screens") return Math.round(q.totalPanesForTier * 2.5);
    return Math.round(q.totalPanesForTier * 4);
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

type SalesTrackerStats = {
  quotes: number;
  sales: number;
  upsells: number;
  soldRevenueOneTime: number;
  soldAnnualValue: number;
};

const SALES_TRACKER_STORAGE_KEY = "leaf:salesTracker:v1";
const QUOTE_HISTORY_STORAGE_KEY = "leaf:quoteHistory:v1";

function clampNonNegInt(n: unknown): number {
  const num = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.floor(num));
}

function safeReadSalesStats(): SalesTrackerStats {
  try {
    const raw = localStorage.getItem(SALES_TRACKER_STORAGE_KEY);
    if (!raw) return { quotes: 0, sales: 0, upsells: 0, soldRevenueOneTime: 0, soldAnnualValue: 0 };
    const parsed = JSON.parse(raw) as Partial<SalesTrackerStats> | null;
    return {
      quotes: clampNonNegInt(parsed?.quotes),
      sales: clampNonNegInt(parsed?.sales),
      upsells: clampNonNegInt(parsed?.upsells),
      soldRevenueOneTime: Number.isFinite(Number(parsed?.soldRevenueOneTime)) ? Number(parsed?.soldRevenueOneTime) : 0,
      soldAnnualValue: Number.isFinite(Number(parsed?.soldAnnualValue)) ? Number(parsed?.soldAnnualValue) : 0,
    };
  } catch {
    return { quotes: 0, sales: 0, upsells: 0, soldRevenueOneTime: 0, soldAnnualValue: 0 };
  }
}

function safeWriteSalesStats(next: SalesTrackerStats) {
  try {
    localStorage.setItem(SALES_TRACKER_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore write failures (private mode / storage disabled)
  }
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

type QuoteStatus = "quoted" | "sold" | "sold_upsell" | "lost";

type QuoteRecord = {
  id: string;
  createdAt: number;
  panes: number;
  frenchPanes: number;
  frenchEquivalent: number;
  totalPanesForTier: number;
  /** Saved tier boundary for upsell pricing + history */
  tierMaxPanes?: number;
  isCustom?: boolean;
  tierLabel: string;
  oneTimeSubtotal: number;
  alreadyOut: number;
  services: ServiceKey[];
  planType: ServicePlanType;
  planBundle: "exterior" | "exterior+interior";
  planPerVisit: number | null;
  planAnnualValue: number | null;
  status: QuoteStatus;
  /** Logged add-on flags for screen pricing context */
  quotedScreenSpecial?: boolean;
  quotedOnSiteScreenUpsell?: boolean;
  /** Set when status is sold_upsell */
  upsellKinds?: UpsellKind[];
};

function safeReadQuoteHistory(): QuoteRecord[] {
  try {
    const raw = localStorage.getItem(QUOTE_HISTORY_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QuoteRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeWriteQuoteHistory(next: QuoteRecord[]) {
  try {
    localStorage.setItem(QUOTE_HISTORY_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore
  }
}

const SERVICE_CONFIG: {
  key: ServiceKey;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}[] = [
  { key: "exterior", label: "Exterior", description: "Outside glass surfaces", icon: <HomeIcon size={20} />, color: "text-blue-500" },
  { key: "interior", label: "Interior", description: "Inside glass surfaces", icon: <Layers size={20} />, color: "text-violet-500" },
  { key: "screens", label: "Screens", description: "Window screen cleaning", icon: <Grid3x3 size={20} />, color: "text-amber-500" },
  { key: "tracks", label: "Tracks", description: "Window track detailing", icon: <Wind size={20} />, color: "text-rose-500" },
];

const BASE_SERVICE_CONFIG = SERVICE_CONFIG.filter((s) => s.key === "exterior" || s.key === "interior");
const UPSELL_SERVICE_CONFIG = SERVICE_CONFIG.filter((s) => s.key === "screens" || s.key === "tracks");

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
  const [appMode, setAppMode] = useState<AppMode>("windows");
  const modeConfig = MODE_CONFIG.find((m) => m.key === appMode)!;

  const [copied, setCopied] = useState(false);
  const [salesStats, setSalesStats] = useState<SalesTrackerStats>(() => ({
    quotes: 0,
    sales: 0,
    upsells: 0,
    soldRevenueOneTime: 0,
    soldAnnualValue: 0,
  }));
  const [quoteHistory, setQuoteHistory] = useState<QuoteRecord[]>([]);
  const [activeQuoteId, setActiveQuoteId] = useState<string | null>(null);

  const [layoutMode, setLayoutMode] = useState<"scroll" | "pages">(() => {
    try {
      return localStorage.getItem(LAYOUT_MODE_STORAGE_KEY) === "pages" ? "pages" : "scroll";
    } catch {
      return "scroll";
    }
  });
  const [pageIndex, setPageIndex] = useState(0);

  const [upsellModalOpen, setUpsellModalOpen] = useState(false);
  const [upsellModalKinds, setUpsellModalKinds] = useState<Set<UpsellKind>>(() => new Set());
  const [upsellModalOnSite, setUpsellModalOnSite] = useState(false);
  const [upsellModalSpecial, setUpsellModalSpecial] = useState(false);
  const [upsellModalError, setUpsellModalError] = useState<string | null>(null);

  // Window cleaning state
  const [paneCount, setPaneCount] = useState(0);
  const [frenchPaneCount, setFrenchPaneCount] = useState(0);
  const [selectedServices, setSelectedServices] = useState<Set<ServiceKey>>(new Set<ServiceKey>(["exterior"]));
  const [useScreenSpecial, setUseScreenSpecial] = useState(false);
  const [useOnSiteScreenUpsell, setUseOnSiteScreenUpsell] = useState(false);
  const [planBundle, setPlanBundle] = useState<"exterior" | "exterior+interior">("exterior");
  const [showInfo, setShowInfo] = useState(false);

  // Shared state
  const [servicePlan, setServicePlan] = useState<ServicePlanType>("none");
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [totalPulse, setTotalPulse] = useState(false);
  const prevTotalRef = useRef(0);

  useEffect(() => {
    setSalesStats(safeReadSalesStats());
    setQuoteHistory(safeReadQuoteHistory());
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_MODE_STORAGE_KEY, layoutMode);
    } catch {
      // ignore
    }
  }, [layoutMode]);

  const isWindows = true;

  // 1) One-time visit quote (includes any selected add-ons; no plan discount)
  const oneTimeEstimate = calculateEstimate(paneCount, frenchPaneCount, selectedServices, "none", useScreenSpecial, {
    onSiteScreenUpsell: useOnSiteScreenUpsell,
  });

  // 2) Recurring plan quote (bundle only; screens/tracks excluded by default)
  const planBundleServices = useCallback(() => {
    if (!isWindows) return new Set<ServiceKey>();
    const s = new Set<ServiceKey>();
    s.add("exterior");
    if (planBundle === "exterior+interior") s.add("interior");
    return s;
  }, [isWindows, planBundle]);

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

  // Single-mode app (Windows). Keep this for future expansion.

  const fullReset = () => {
    setPaneCount(0);
    setFrenchPaneCount(0);
    setSelectedServices(new Set<ServiceKey>(["exterior"]));
    setUseScreenSpecial(false);
    setUseOnSiteScreenUpsell(false);
    setPlanBundle("exterior");
    setServicePlan("none");
    setShowBreakdown(false);
    setCopied(false);
    setShowInfo(false);
    setPageIndex(0);
    setUpsellModalOpen(false);
    setUpsellModalKinds(new Set());
    setUpsellModalOnSite(false);
    setUpsellModalSpecial(false);
    setUpsellModalError(null);
  };

  const toggleService = useCallback((key: ServiceKey) => {
    setSelectedServices((prev) => {
      const next = new Set(prev);
      const has = next.has(key);
      if (has) {
        next.delete(key);
        // Interior can never exist without exterior.
        if (key === "exterior") next.delete("interior");
      } else {
        next.add(key);
        // Interior is always an add-on to exterior per quoting guide.
        if (key === "interior") next.add("exterior");
      }
      return next;
    });
  }, []);

  const applyBasePreset = useCallback((preset: "outside" | "both") => {
    setSelectedServices((prev) => {
      const next = new Set(prev);
      // Preserve add-ons while changing the base.
      const keepScreens = next.has("screens");
      const keepTracks = next.has("tracks");

      next.delete("exterior");
      next.delete("interior");

      if (preset === "outside") next.add("exterior");
      if (preset === "both") {
        next.add("exterior");
        next.add("interior");
      }

      if (keepScreens) next.add("screens");
      if (keepTracks) next.add("tracks");

      return next;
    });

    // Keep the plan bundle in sync with the quick pick
    setPlanBundle(preset === "both" ? "exterior+interior" : "exterior");
  }, []);

  const buildQuoteSnapshot = useCallback((): QuoteRecord | null => {
    if (calledOutPrice <= 0) return null;
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const tierLabel = oneTimeEstimate.tier?.label ?? "Custom";
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
      planBundle,
      planPerVisit: servicePlan === "none" ? null : planEstimate.total,
      planAnnualValue: servicePlan === "none" ? null : planEstimate.annualValue,
      status: "quoted",
      quotedScreenSpecial: useScreenSpecial,
      quotedOnSiteScreenUpsell: useOnSiteScreenUpsell,
    };
  }, [
    alreadyOutPrice,
    calledOutPrice,
    frenchEquivalent,
    frenchPaneCount,
    paneCount,
    planBundle,
    planEstimate.annualValue,
    planEstimate.total,
    selectedServices,
    servicePlan,
    totalPanes,
    oneTimeEstimate.tier,
    oneTimeEstimate.isCustom,
    useScreenSpecial,
    useOnSiteScreenUpsell,
  ]);

  const logQuote = useCallback(() => {
    const snap = buildQuoteSnapshot();
    if (!snap) return;
    setQuoteHistory((prev) => {
      const next = [snap, ...prev].slice(0, 200);
      safeWriteQuoteHistory(next);
      return next;
    });
    setActiveQuoteId(snap.id);
    setSalesStats((prev) => {
      const next = { ...prev, quotes: prev.quotes + 1 };
      safeWriteSalesStats(next);
      return next;
    });
  }, [buildQuoteSnapshot]);

  const applyMarkSale = useCallback(
    (opts: {
      upsell: boolean;
      kinds?: UpsellKind[];
      screenOpts?: { onSite: boolean; special: boolean };
    }) => {
      const id = activeQuoteId ?? quoteHistory[0]?.id ?? null;
      if (!id) return;
      const q = quoteHistory.find((x) => x.id === id);
      if (!q) return;

      const soldAnnual = q.planType !== "none" ? (q.planAnnualValue ?? 0) : 0;

      const screenOpts = opts.screenOpts ?? { onSite: false, special: false };
      const extra =
        opts.upsell && opts.kinds && opts.kinds.length > 0
          ? incrementalUpsellTotal(q, opts.kinds, screenOpts)
          : 0;

      const oneTimeRevenueAdd =
        (q.planType === "none" ? q.oneTimeSubtotal : 0) + (opts.upsell ? extra : 0);

      const upsellKindsFinal = opts.upsell && opts.kinds && opts.kinds.length > 0 ? opts.kinds : undefined;

      setQuoteHistory((prev) => {
        const next = prev.map((x) =>
          x.id === id
            ? {
                ...x,
                status: (opts.upsell ? "sold_upsell" : "sold") as QuoteStatus,
                ...(upsellKindsFinal ? { upsellKinds: upsellKindsFinal } : {}),
              }
            : x
        );
        safeWriteQuoteHistory(next);
        return next;
      });

      setSalesStats((prev) => {
        const next = {
          ...prev,
          sales: prev.sales + 1,
          upsells: prev.upsells + (opts.upsell ? 1 : 0),
          soldRevenueOneTime: prev.soldRevenueOneTime + oneTimeRevenueAdd,
          soldAnnualValue: prev.soldAnnualValue + soldAnnual,
        };
        safeWriteSalesStats(next);
        return next;
      });
    },
    [activeQuoteId, quoteHistory]
  );

  const activeQuoteTarget =
    quoteHistory.find((x) => x.id === activeQuoteId) ?? quoteHistory[0] ?? null;

  const openUpsellModal = useCallback(() => {
    if (!activeQuoteTarget) return;
    setUpsellModalError(null);
    setUpsellModalOnSite(activeQuoteTarget.quotedOnSiteScreenUpsell ?? false);
    setUpsellModalSpecial(activeQuoteTarget.quotedScreenSpecial ?? false);
    setUpsellModalKinds(new Set());
    setUpsellModalOpen(true);
  }, [activeQuoteTarget]);

  const confirmUpsellSale = useCallback(() => {
    const kinds = Array.from(upsellModalKinds);
    if (kinds.length === 0) {
      setUpsellModalError("Choose Screens and/or Tracks before confirming.");
      return;
    }
    setUpsellModalError(null);
    applyMarkSale({
      upsell: true,
      kinds,
      screenOpts: { onSite: upsellModalOnSite, special: upsellModalSpecial },
    });
    setUpsellModalOpen(false);
  }, [applyMarkSale, upsellModalKinds, upsellModalOnSite, upsellModalSpecial]);

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

    lines.push("──────────────────────────");
    lines.push(`Called Out (one-time): ${formatCurrency(calledOutPrice)}`);
    lines.push(`Already Out (−$100):   ${formatCurrency(alreadyOutPrice)}`);

    if (appMode === "windows" && servicePlan !== "none") {
      lines.push("");
      lines.push("Recurring plan (bundle only):");
      lines.push(`Plan: ${planLabel} (${planBundle === "exterior" ? "Exterior" : "Exterior + Interior"})`);
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

  return (
    <div className={`min-h-screen bg-background ${layoutMode === "pages" ? "pb-28" : "pb-10"}`}>

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
                    ? `${SERVICE_PLAN_LABELS[servicePlan]} (${planBundle === "exterior" ? "Exterior" : "Ext + Int"})`
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
            </>
            )}

            {showPage(1) && (
            <>
            {/* Step 2: Services */}
            <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
              <div className="px-4 pt-4 pb-3 border-b border-border flex items-center gap-2">
                <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center font-display ${modeConfig.stepColor}`}>2</span>
                <div>
                  <h2 className="font-bold text-foreground font-display">Select Services</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">Start with exterior / interior — screens & tracks are add-ons below.</p>
                </div>
              </div>

              {/* Quick presets for faster quoting */}
              <div className="px-4 pt-4">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide font-display mb-2">
                  Quick Pick
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => applyBasePreset("outside")}
                    className={`h-11 rounded-xl border-2 text-sm font-bold font-display transition-all active:scale-95 ${
                      selectedServices.has("exterior") && !selectedServices.has("interior")
                        ? "border-primary bg-accent text-primary"
                        : "border-border bg-secondary text-foreground hover:bg-border"
                    }`}
                  >
                    Exterior
                  </button>
                  <button
                    type="button"
                    onClick={() => applyBasePreset("both")}
                    className={`h-11 rounded-xl border-2 text-sm font-bold font-display transition-all active:scale-95 ${
                      selectedServices.has("exterior") && selectedServices.has("interior")
                        ? "border-primary bg-accent text-primary"
                        : "border-border bg-secondary text-foreground hover:bg-border"
                    }`}
                  >
                    Ext + Int
                  </button>
                </div>
              </div>

              <div className="p-4 grid grid-cols-2 gap-3">
                {BASE_SERVICE_CONFIG.map((svc) => {
                  const isSelected = selectedServices.has(svc.key);
                  const price = tier ? (tier[svc.key as keyof typeof tier] as number) : null;
                  const isUnavailable =
                    tier !== null &&
                    svc.key !== "exterior" &&
                    (tier[svc.key as keyof typeof tier] as number) === 0;

                  return (
                    <button
                      key={svc.key}
                      onClick={() => !isUnavailable && toggleService(svc.key)}
                      disabled={isUnavailable}
                      className={`service-card relative rounded-2xl border-2 p-4 text-left transition-all duration-200 active:scale-[0.97] ${
                        isSelected && !isUnavailable
                          ? "border-primary bg-accent"
                          : isUnavailable
                          ? "border-border bg-secondary/50 opacity-50 cursor-not-allowed"
                          : "border-border bg-white hover:border-primary/40 hover:bg-accent/30"
                      }`}
                    >
                      <div className={`mb-2 ${isSelected ? "text-primary" : svc.color}`}>{svc.icon}</div>
                      <p className={`font-bold text-sm font-display ${isSelected ? "text-primary" : "text-foreground"}`}>{svc.label}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">{svc.description}</p>
                      {price !== null && price > 0 && !isUnavailable && (
                        <p className={`text-sm font-bold mt-2 font-display ${isSelected ? "text-primary" : "text-muted-foreground"}`}>
                          {formatCurrency(price)}
                        </p>
                      )}
                      {isUnavailable && <p className="text-xs text-muted-foreground mt-2">Custom quote</p>}
                      {isSelected && !isUnavailable && (
                        <div className="absolute top-2 right-2 text-primary"><CheckCircle2 size={16} /></div>
                      )}
                    </button>
                  );
                })}
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
                  const price = tier
                    ? svc.key === "screens" && useScreenSpecial && tier.screenSpecial !== null
                      ? tier.screenSpecial
                      : (tier[svc.key as keyof typeof tier] as number)
                    : oneTimeEstimate.isCustom                      ? svc.key === "screens"
                        ? Math.round(totalPanes * 2.5)
                        : Math.round(totalPanes * 4)
                      : null;
                  const isUnavailable =
                    tier !== null &&
                    (tier[svc.key as keyof typeof tier] as number) === 0;

                  return (
                    <button
                      key={svc.key}
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
                      {price !== null && price > 0 && !isUnavailable && (
                        <p className={`text-sm font-bold mt-2 font-display ${isSelected ? "text-amber-700" : "text-muted-foreground"}`}>
                          {formatCurrency(price)}
                        </p>
                      )}
                      {isUnavailable && <p className="text-xs text-muted-foreground mt-2">Custom quote</p>}
                      {isSelected && !isUnavailable && (
                        <div className="absolute top-2 right-2 text-amber-600"><CheckCircle2 size={16} /></div>
                      )}
                    </button>
                  );
                })}
              </div>

              {selectedServices.has("screens") && appMode === "windows" && !oneTimeEstimate.isCustom && (
                <div className="px-4 pb-2">
                  <button
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
                        On-site screen upsell
                      </p>
                      <p className="text-xs text-muted-foreground">If you’re already there: quote screens for $60</p>
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
            <p className="text-xs font-bold text-muted-foreground uppercase tracking-wide font-display mb-2">
              Plan applies to
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPlanBundle("exterior")}
                className={`h-10 rounded-xl border-2 text-sm font-bold font-display transition-all active:scale-95 ${
                  planBundle === "exterior" ? "border-primary bg-accent text-primary" : "border-border bg-secondary text-foreground hover:bg-border"
                }`}
              >
                Exterior
              </button>
              <button
                type="button"
                onClick={() => setPlanBundle("exterior+interior")}
                className={`h-10 rounded-xl border-2 text-sm font-bold font-display transition-all active:scale-95 ${
                  planBundle === "exterior+interior" ? "border-primary bg-accent text-primary" : "border-border bg-secondary text-foreground hover:bg-border"
                }`}
              >
                Ext + Int
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Plan pricing is based on the recurring bundle only. Screens/tracks are quoted separately as needed.
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
                      {SERVICE_PLAN_LABELS[servicePlan]} ({planBundle === "exterior" ? "Exterior" : "Ext + Int"})
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

        {/* ══════════════════════════════════════════
            SALES TRACKER
        ══════════════════════════════════════════ */}
        {showPage(3) && (
        <>
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-border flex items-center gap-2">
            <CheckCircle2 size={18} className="text-primary" />
            <h2 className="font-bold text-foreground font-display">Sales Tracker</h2>
            <button
              type="button"
              onClick={() => {
                const next = { quotes: 0, sales: 0, upsells: 0, soldRevenueOneTime: 0, soldAnnualValue: 0 };
                setSalesStats(next);
                safeWriteSalesStats(next);
              }}
              className="ml-auto text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              Reset
            </button>
          </div>

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
                <p className="text-[11px] text-muted-foreground font-semibold">Upsell rate</p>
                <p className="text-lg font-bold font-display text-foreground">
                  {salesStats.sales > 0 ? `${Math.round((salesStats.upsells / salesStats.sales) * 100)}%` : "—"}
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
                  disabled={!activeQuoteTarget}
                  onClick={() => applyMarkSale({ upsell: false })}
                  className="h-11 rounded-xl border-2 border-primary bg-white text-primary font-bold font-display active:scale-95 transition-all disabled:opacity-40 disabled:pointer-events-none"
                >
                  Mark Sale
                </button>
              </div>
              <button
                type="button"
                disabled={!activeQuoteTarget}
                onClick={openUpsellModal}
                className="mt-2 w-full h-11 rounded-xl bg-gradient-to-r from-amber-600 to-rose-600 text-white font-bold font-display active:scale-95 transition-all shadow-md disabled:opacity-40 disabled:pointer-events-none"
              >
                Mark Sale + Upsell…
              </button>
              <p className="mt-2 text-[11px] text-muted-foreground">
                Tip: tap a saved quote below to make it “active”, then mark it sold. Upsell opens a picker for screens / tracks.
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
                safeWriteQuoteHistory([]);
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
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => setActiveQuoteId(q.id)}
                    className={`w-full rounded-xl border-2 px-3 py-3 text-left transition-all active:scale-[0.99] ${
                      isActive ? "border-primary bg-accent" : "border-border bg-white hover:bg-secondary"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className={`text-sm font-bold font-display ${isActive ? "text-primary" : "text-foreground"}`}>
                          {q.totalPanesForTier} panes · {q.tierLabel}
                        </p>
                        <p className="text-xs text-muted-foreground">
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
                );
              })
            )}
          </div>
        </div>
        </>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground pb-2">
          Leaf Cleaning · Spotless Views. Every Time.
        </p>
      </div>

      {layoutMode === "pages" && (
        <div
          className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-card/95 backdrop-blur-md px-4 py-3"
          style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}
        >
          <div className="max-w-[480px] mx-auto flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={pageIndex <= 0}
              onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
              className="h-11 px-3 rounded-xl border border-border bg-white font-bold text-sm font-display flex items-center gap-1 disabled:opacity-35"
            >
              <ChevronLeft size={18} />
              Back
            </button>
            <p className="text-xs font-bold text-muted-foreground font-display text-center flex-1">
              Step {pageIndex + 1} / {PAGE_LAST + 1}
            </p>
            <button
              type="button"
              disabled={pageIndex >= PAGE_LAST}
              onClick={() => setPageIndex((i) => Math.min(PAGE_LAST, i + 1))}
              className="h-11 px-3 rounded-xl bg-primary text-primary-foreground font-bold text-sm font-display flex items-center gap-1 disabled:opacity-35"
            >
              Next
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

      {upsellModalOpen && activeQuoteTarget && (
        <div
          className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-4 bg-black/50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="upsell-modal-title"
        >
          <div className="w-full max-w-[400px] rounded-2xl bg-white shadow-2xl border border-border overflow-hidden max-h-[90vh] overflow-y-auto">
            <div className="px-4 pt-4 pb-3 border-b border-border bg-gradient-to-r from-amber-50 to-rose-50">
              <h3 id="upsell-modal-title" className="text-lg font-extrabold text-foreground font-display">
                Mark sale + upsell
              </h3>
              <p className="text-xs text-muted-foreground mt-1">
                Choose what was upsold on this job. Extra revenue counts only for add-ons <strong>not</strong> already in the logged quote.
              </p>
            </div>
            <div className="p-4 space-y-3">
              {(["screens", "tracks"] as UpsellKind[]).map((kind) => {
                const label = kind === "screens" ? "Screens" : "Tracks";
                const inQuote = activeQuoteTarget.services.includes(kind);
                const price = getUpsellLinePrice(activeQuoteTarget, kind, {
                  onSite: upsellModalOnSite,
                  special: upsellModalSpecial,
                });
                const checked = upsellModalKinds.has(kind);
                return (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => {
                      setUpsellModalKinds((prev) => {
                        const n = new Set(prev);
                        if (n.has(kind)) n.delete(kind);
                        else n.add(kind);
                        return n;
                      });
                      setUpsellModalError(null);
                    }}
                    className={`w-full rounded-xl border-2 px-4 py-3 flex items-center justify-between text-left transition-all ${
                      checked ? "border-amber-500 bg-amber-50" : "border-border bg-secondary/40 hover:bg-secondary"
                    }`}
                  >
                    <div>
                      <p className="font-bold font-display text-foreground">{label}</p>
                      <p className="text-xs text-muted-foreground">
                        {inQuote ? "Already in logged quote — won’t double-count revenue" : `Adds ${formatCurrency(price)} if selected`}
                      </p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-lg font-extrabold font-display text-amber-700">{formatCurrency(price)}</p>
                      {checked && <CheckCircle2 size={18} className="text-amber-600 inline-block mt-1" />}
                    </div>
                  </button>
                );
              })}

              {upsellModalKinds.has("screens") && (
                <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/50 p-3">
                  <p className="text-xs font-bold text-amber-900 font-display">Screen pricing mode</p>
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={upsellModalOnSite}
                      onChange={() => {
                        setUpsellModalOnSite((v) => {
                          const next = !v;
                          if (next) setUpsellModalSpecial(false);
                          return next;
                        });
                      }}
                      className="rounded border-border"
                    />
                    On-site upsell ($60)
                  </label>
                  {!activeQuoteTarget.isCustom && resolveTierForQuote(activeQuoteTarget)?.screenSpecial != null && (
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={upsellModalSpecial}
                        disabled={upsellModalOnSite}
                        onChange={() => setUpsellModalSpecial((v) => !v)}
                        className="rounded border-border"
                      />
                      $25 screen special (tier)
                    </label>
                  )}
                </div>
              )}

              {upsellModalError && <p className="text-sm text-destructive font-medium">{upsellModalError}</p>}

              <p className="text-xs text-muted-foreground">
                Extra from selections:{" "}
                <strong>
                  {formatCurrency(
                    incrementalUpsellTotal(activeQuoteTarget, Array.from(upsellModalKinds), {
                      onSite: upsellModalOnSite,
                      special: upsellModalSpecial,
                    })
                  )}
                </strong>
              </p>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setUpsellModalOpen(false)}
                  className="h-11 rounded-xl border-2 border-border font-bold font-display"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={confirmUpsellSale}
                  className="h-11 rounded-xl bg-gradient-to-r from-amber-600 to-rose-600 text-white font-bold font-display"
                >
                  Confirm sale
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
