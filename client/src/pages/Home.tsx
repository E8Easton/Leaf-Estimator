/**
 * Leaf Cleaning Estimator
 * Modes: Window Cleaning, Christmas Lights
 * Plans: One-Time | Monthly (-$150) | Quarterly (-$100) | Bi-Annual (-$50)
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  PANE_TIERS,
  SERVICE_PLAN_LABELS,
  SERVICE_PLAN_DESCRIPTIONS,
  SERVICE_PLAN_PERKS,
  SERVICE_PLAN_DISCOUNTS,
  CHRISTMAS_LIGHT_OPTIONS,
  FRENCH_PANE_MULTIPLIER,
  frenchPanesToStandard,
  calculateEstimate,
  calculateChristmasEstimate,
  formatCurrency,
  type ServiceKey,
  type ServicePlanType,
  type ChristmasLightType,
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
  Star,
  X,
  Copy,
  Check,
} from "lucide-react";

type SalesTrackerStats = {
  quotes: number;
  sales: number;
  upsells: number;
};

const SALES_TRACKER_STORAGE_KEY = "leaf:salesTracker:v1";

function clampNonNegInt(n: unknown): number {
  const num = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.floor(num));
}

function safeReadSalesStats(): SalesTrackerStats {
  try {
    const raw = localStorage.getItem(SALES_TRACKER_STORAGE_KEY);
    if (!raw) return { quotes: 0, sales: 0, upsells: 0 };
    const parsed = JSON.parse(raw) as Partial<SalesTrackerStats> | null;
    return {
      quotes: clampNonNegInt(parsed?.quotes),
      sales: clampNonNegInt(parsed?.sales),
      upsells: clampNonNegInt(parsed?.upsells),
    };
  } catch {
    return { quotes: 0, sales: 0, upsells: 0 };
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

type AppMode = "windows" | "christmas";

const MODE_CONFIG: {
  key: AppMode;
  label: string;
  icon: React.ReactNode;
  activeClass: string;
  stepColor: string;
  btnColor: string;
  ringColor: string;
}[] = [
  {
    key: "windows",
    label: "Windows",
    icon: <Layers size={18} />,
    activeClass: "border-primary bg-accent text-primary",
    stepColor: "bg-primary text-primary-foreground",
    btnColor: "bg-primary text-primary-foreground hover:bg-primary/90",
    ringColor: "focus:ring-primary",
  },
  {
    key: "christmas",
    label: "Xmas Lights",
    icon: <Star size={18} />,
    activeClass: "border-red-500 bg-red-50 text-red-700",
    stepColor: "bg-red-500 text-white",
    btnColor: "bg-red-500 text-white hover:bg-red-600",
    ringColor: "focus:ring-red-400",
  },
];

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
  }));
  const [pendingQuoteToScore, setPendingQuoteToScore] = useState(false);

  // Window cleaning state
  const [paneCount, setPaneCount] = useState(0);
  const [frenchPaneCount, setFrenchPaneCount] = useState(0);
  const [selectedServices, setSelectedServices] = useState<Set<ServiceKey>>(new Set<ServiceKey>(["exterior"]));
  const [useScreenSpecial, setUseScreenSpecial] = useState(false);
  const [useOnSiteScreenUpsell, setUseOnSiteScreenUpsell] = useState(false);
  const [planBundle, setPlanBundle] = useState<"exterior" | "exterior+interior">("exterior");
  const [showInfo, setShowInfo] = useState(false);

  // Christmas lights state
  const [linearFeet, setLinearFeet] = useState(0);
  const [lightType, setLightType] = useState<ChristmasLightType>("classic");
  const [addGoveePanel, setAddGoveePanel] = useState(false);

  // Shared state
  const [servicePlan, setServicePlan] = useState<ServicePlanType>("none");
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [totalPulse, setTotalPulse] = useState(false);
  const prevTotalRef = useRef(0);

  useEffect(() => {
    setSalesStats(safeReadSalesStats());
  }, []);

  const isWindows = appMode === "windows";

  // 1) One-time visit quote (includes any selected add-ons; no plan discount)
  const oneTimeEstimate =
    appMode === "windows"
      ? calculateEstimate(paneCount, frenchPaneCount, selectedServices, "none", useScreenSpecial, {
          onSiteScreenUpsell: useOnSiteScreenUpsell,
        })
      : calculateChristmasEstimate(linearFeet, lightType, addGoveePanel, "none");

  // 2) Recurring plan quote (bundle only; screens/tracks excluded by default)
  const planBundleServices = useCallback(() => {
    if (!isWindows) return new Set<ServiceKey>();
    const s = new Set<ServiceKey>();
    s.add("exterior");
    if (planBundle === "exterior+interior") s.add("interior");
    return s;
  }, [isWindows, planBundle]);

  const planEstimate =
    appMode === "windows"
      ? calculateEstimate(paneCount, frenchPaneCount, planBundleServices(), servicePlan, false)
      : calculateChristmasEstimate(linearFeet, lightType, addGoveePanel, "none");

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

  const handleModeChange = (mode: AppMode) => {
    setAppMode(mode);
    setShowBreakdown(false);
    setShowInfo(false);
  };

  const reset = () => {
    setPaneCount(0);
    setFrenchPaneCount(0);
    setSelectedServices(new Set<ServiceKey>(["exterior"]));
    setUseScreenSpecial(false);
    setUseOnSiteScreenUpsell(false);
    setPlanBundle("exterior");
    setLinearFeet(0);
    setLightType("classic");
    setAddGoveePanel(false);
    setServicePlan("none");
    setShowBreakdown(false);
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
      setSalesStats((prev) => {
        const next = { ...prev, quotes: prev.quotes + 1 };
        safeWriteSalesStats(next);
        return next;
      });
      setPendingQuoteToScore(true);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // Window pane counter helpers
  const increment = () => setPaneCount((c) => Math.min(c + 1, 200));
  const decrement = () => setPaneCount((c) => Math.max(c - 1, 0));
  const incrementBy = (n: number) => setPaneCount((c) => Math.min(c + n, 200));
  const decrementBy = (n: number) => setPaneCount((c) => Math.max(c - n, 0));

  // Christmas linear-feet helpers
  const incFt = (n: number) => setLinearFeet((c) => Math.min(c + n, 2000));
  const decFt = (n: number) => setLinearFeet((c) => Math.max(c - n, 0));

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
          <div className="flex items-center gap-3">
            <button
              onClick={reset}
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

        {/* ── Mode Selector ── */}
        <div className="bg-white rounded-2xl border border-border shadow-sm p-3">
          <div className="grid grid-cols-2 gap-2">
            {MODE_CONFIG.map((m) => {
              const isActive = appMode === m.key;
              return (
                <button
                  key={m.key}
                  onClick={() => handleModeChange(m.key)}
                  className={`rounded-xl py-2.5 px-2 flex flex-col items-center gap-1.5 border-2 transition-all duration-150 active:scale-95 ${
                    isActive
                      ? m.activeClass
                      : "border-transparent bg-secondary text-muted-foreground hover:bg-border"
                  }`}
                >
                  {m.icon}
                  <span className="text-[11px] font-bold leading-none font-display text-center">{m.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ══════════════════════════════════════════
            WINDOW CLEANING MODE
        ══════════════════════════════════════════ */}
        {appMode === "windows" && (
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
                <div className="mt-4 rounded-xl border border-border bg-secondary/50 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-xs font-bold text-foreground font-display">French Panes</p>
                      <p className="text-[11px] text-muted-foreground">Divided-light / grille windows — counted at ×{FRENCH_PANE_MULTIPLIER}</p>
                    </div>
                    {frenchPaneCount > 0 && (
                      <span className="text-xs font-bold text-primary bg-accent px-2 py-0.5 rounded-full font-display">
                        +{frenchPaneCount}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setFrenchPaneCount((c) => Math.max(c - 1, 0))}
                      className="w-9 h-9 rounded-xl bg-secondary border border-border flex items-center justify-center text-foreground hover:bg-border active:scale-95 transition-all"
                    >
                      <Minus size={16} />
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
                      className="flex-1 h-9 rounded-xl border border-border bg-white px-3 text-center text-sm font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary font-display"
                    />
                    <button
                      onClick={() => setFrenchPaneCount((c) => Math.min(c + 1, 200))}
                      className="w-9 h-9 rounded-xl bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-all"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  {frenchPaneCount > 0 && (
                    <p className="text-xs text-primary font-semibold mt-2 text-center font-display">
                      Total: {totalPanes} panes ({paneCount} standard + {frenchEquivalent} French equiv.)
                    </p>
                  )}
                </div>
              </div>

              {paneCount > 0 && (
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
                </div>
              )}
            </div>

            {/* Step 2: Services */}
            <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
              <div className="px-4 pt-4 pb-3 border-b border-border flex items-center gap-2">
                <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center font-display ${modeConfig.stepColor}`}>2</span>
                <h2 className="font-bold text-foreground font-display">Select Services</h2>
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
                {SERVICE_CONFIG.map((svc) => {
                  const isSelected = selectedServices.has(svc.key);
                  const price = tier
                    ? svc.key === "screens" && useScreenSpecial && tier.screenSpecial !== null
                      ? tier.screenSpecial
                      : (tier[svc.key as keyof typeof tier] as number)
                    : null;
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

              {/* On-site upsell: screens for $60 when already there */}
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

              {hasScreenSpecial && tier?.screenSpecial !== null && (
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

        {/* ══════════════════════════════════════════
            CHRISTMAS LIGHTS MODE
        ══════════════════════════════════════════ */}
        {appMode === "christmas" && (
          <>
            {/* Step 1: Linear Feet */}
            <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
              <div className="px-4 pt-4 pb-3 border-b border-border flex items-center gap-2">
                <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center font-display ${modeConfig.stepColor}`}>1</span>
                <h2 className="font-bold text-foreground font-display">Linear Feet</h2>
              </div>
              <div className="px-4 py-5">
                <div className="flex items-center justify-between gap-4 mb-4">
                  <button onClick={() => decFt(1)} className="pane-btn bg-secondary text-foreground hover:bg-border">
                    <Minus size={22} />
                  </button>
                  <div className="flex-1 text-center">
                    <p className="text-6xl font-bold text-foreground leading-none font-display">{linearFeet}</p>
                    <p className="text-sm text-muted-foreground mt-1 font-medium">linear feet</p>
                  </div>
                  <button onClick={() => incFt(1)} className={`pane-btn ${modeConfig.btnColor}`}>
                    <Plus size={22} />
                  </button>
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[-25, -10, +10, +25].map((n) => (
                    <button
                      key={n}
                      onClick={() => n > 0 ? incFt(n) : decFt(Math.abs(n))}
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
                    max={2000}
                    value={linearFeet === 0 ? "" : linearFeet}
                    placeholder="Or type feet"
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      if (!isNaN(v)) setLinearFeet(Math.min(Math.max(v, 0), 2000));
                      else if (e.target.value === "") setLinearFeet(0);
                    }}
                    className={`w-full h-11 rounded-xl border border-border bg-secondary px-3 text-center text-lg font-bold text-foreground focus:outline-none focus:ring-2 font-display ${modeConfig.ringColor}`}
                  />
                </div>
              </div>
            </div>

            {/* Step 2: Light Type */}
            <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
              <div className="px-4 pt-4 pb-3 border-b border-border flex items-center gap-2">
                <span className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center font-display ${modeConfig.stepColor}`}>2</span>
                <h2 className="font-bold text-foreground font-display">Light Type</h2>
              </div>
              <div className="p-4 space-y-2">
                {CHRISTMAS_LIGHT_OPTIONS.map((opt) => {
                  const isSelected = lightType === opt.key;
                  return (
                    <button
                      key={opt.key}
                      onClick={() => setLightType(opt.key)}
                      className={`w-full rounded-xl border-2 px-4 py-3 flex items-center justify-between transition-all duration-200 active:scale-[0.98] ${
                        isSelected ? "border-red-400 bg-red-50" : "border-border bg-white hover:border-red-300"
                      }`}
                    >
                      <div className="text-left flex-1">
                        <p className={`font-bold text-sm font-display ${isSelected ? "text-red-700" : "text-foreground"}`}>{opt.label}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">{opt.description}</p>
                      </div>
                      <div className="text-right ml-3 flex-shrink-0">
                        <p className={`font-bold text-base font-display ${isSelected ? "text-red-700" : "text-muted-foreground"}`}>${opt.totalPerFt}/ft</p>
                        <p className="text-[10px] text-muted-foreground">labor ${opt.laborPerFt} + mat ${opt.materialsPerFt}</p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {lightType === "smart" && (
                <div className="px-4 pb-4">
                  <button
                    onClick={() => setAddGoveePanel(!addGoveePanel)}
                    className={`w-full rounded-xl border-2 px-4 py-3 flex items-center justify-between transition-all duration-200 ${
                      addGoveePanel ? "border-amber-400 bg-amber-50" : "border-border bg-secondary"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles size={16} className={addGoveePanel ? "text-amber-500" : "text-muted-foreground"} />
                      <div className="text-left">
                        <p className={`text-sm font-bold ${addGoveePanel ? "text-amber-700" : "text-foreground"}`}>GOVEE SMART Control Panel</p>
                        <p className="text-xs text-muted-foreground">App control hub — sold separately</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-bold font-display ${addGoveePanel ? "text-amber-700" : "text-muted-foreground"}`}>$599</span>
                      <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${addGoveePanel ? "border-amber-400 bg-amber-400" : "border-border"}`}>
                        {addGoveePanel && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                    </div>
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* ══════════════════════════════════════════
            SERVICE PLAN (Windows only)
        ══════════════════════════════════════════ */}
        {appMode === "windows" && <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
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
              return (
                <button
                  key={plan}
                  onClick={() => setServicePlan(plan)}
                  className={`w-full rounded-xl border-2 px-4 py-3 flex items-center justify-between transition-all duration-200 active:scale-[0.98] ${
                    isSelected ? "border-primary bg-accent" : "border-border bg-white hover:border-primary/40"
                  }`}
                >
                  <div className="text-left">
                    <p className={`font-bold text-sm font-display ${isSelected ? "text-primary" : "text-foreground"}`}>
                      {SERVICE_PLAN_LABELS[plan]}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">{SERVICE_PLAN_DESCRIPTIONS[plan]}</p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {discount > 0 && (
                      <span className={`text-xs font-bold font-display px-1.5 py-0.5 rounded-lg ${isSelected ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground"}`}>
                        −${discount}
                      </span>
                    )}
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${isSelected ? "border-primary bg-primary" : "border-border"}`}>
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
        </div>}

        {/* ══════════════════════════════════════════
            QUOTE SUMMARY
        ══════════════════════════════════════════ */}
        {hasAnyTotal && calledOutPrice > 0 && (
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
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-border flex items-center gap-2">
            <CheckCircle2 size={18} className="text-primary" />
            <h2 className="font-bold text-foreground font-display">Sales Tracker</h2>
            <button
              type="button"
              onClick={() => {
                const next = { quotes: 0, sales: 0, upsells: 0 };
                setSalesStats(next);
                safeWriteSalesStats(next);
                setPendingQuoteToScore(false);
              }}
              className="ml-auto text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              Reset
            </button>
          </div>

          <div className="p-4 space-y-3">
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

            {pendingQuoteToScore && (
              <div className="rounded-xl bg-accent px-3 py-3">
                <p className="text-xs font-bold text-accent-foreground mb-2 font-display">
                  Score the last quote
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSalesStats((prev) => {
                        const next = { ...prev, sales: prev.sales + 1 };
                        safeWriteSalesStats(next);
                        return next;
                      });
                      setPendingQuoteToScore(false);
                    }}
                    className="h-11 rounded-xl bg-primary text-primary-foreground font-bold font-display active:scale-95 transition-all"
                  >
                    Sold
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSalesStats((prev) => {
                        const next = { ...prev, sales: prev.sales + 1, upsells: prev.upsells + 1 };
                        safeWriteSalesStats(next);
                        return next;
                      });
                      setPendingQuoteToScore(false);
                    }}
                    className="h-11 rounded-xl border-2 border-primary bg-white text-primary font-bold font-display active:scale-95 transition-all"
                  >
                    Sold + Upsell
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingQuoteToScore(false)}
                  className="mt-2 w-full text-xs font-semibold text-muted-foreground hover:text-foreground"
                >
                  Not sold / skip
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground pb-2">
          Leaf Cleaning · Spotless Views. Every Time.
        </p>
      </div>
    </div>
  );
}
