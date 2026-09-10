/**
 * Shark Exterior Estimator
 * Plans: One-Time | Monthly (-$150) | Quarterly (-$100) | Tri-Annual (-$75) | Bi-Annual (-$50) | Summer
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import {
  PANE_TIERS,
  SERVICE_PLAN_LABELS,
  SERVICE_PLAN_DESCRIPTIONS,
  SERVICE_PLAN_PERKS,
  SERVICE_PLAN_DISCOUNTS,
  SERVICE_PLAN_ORDER,
  FRENCH_PANE_MULTIPLIER,
  frenchPanesToStandard,
  calculateEstimate,
  CUSTOM_PRICE_PER_PANE,
  formatCurrency,
  type ServiceKey,
  type ServicePlanType,
} from "@/lib/pricing";
import {
  Home as HomeIcon,
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

const LAYOUT_MODE_STORAGE_KEY = "shark:layoutMode:v1";

const MODE_CONFIG = {
  key: "windows" as const,
  label: "Windows",
  stepColor: "bg-primary text-primary-foreground",
  btnColor: "bg-primary text-primary-foreground hover:bg-primary/90",
  ringColor: "focus:ring-primary",
};

const SERVICE_CONFIG: {
  key: ServiceKey;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}[] = [
  { key: "exterior", label: "Exterior", description: "Outside glass surfaces", icon: <HomeIcon size={20} />, color: "text-primary" },
  { key: "screens", label: "Screens", description: "Window screen cleaning", icon: <Grid3x3 size={20} />, color: "text-orange-300" },
  {
    key: "tracks",
    label: "Tracks",
    description: "Full-house track detailing (add-on with exterior)",
    icon: <Wind size={20} />,
    color: "text-orange-200/80",
  },
];

const UPSELL_SERVICE_CONFIG = SERVICE_CONFIG.filter((s) => s.key === "screens" || s.key === "tracks");

/** Unified Shark navy / orange plan cards (no rainbow accents). */
const PLAN_CARD_STYLES: Record<
  ServicePlanType,
  { selected: string; idle: string; badge: string; title: string }
> = {
  none: {
    idle: "border-white/10 bg-[#0f172a]/60 hover:border-white/20",
    selected: "border-white/35 bg-white/10 shadow-md ring-2 ring-white/15",
    badge: "bg-white/20 text-white",
    title: "text-zinc-100",
  },
  monthly: {
    idle: "border-orange-500/30 bg-orange-500/5 hover:border-orange-400/45",
    selected: "border-primary bg-primary/20 shadow-md ring-2 ring-primary/40",
    badge: "bg-primary text-white",
    title: "text-orange-100",
  },
  quarterly: {
    idle: "border-orange-500/22 bg-orange-500/[0.04] hover:border-orange-400/35",
    selected: "border-primary/90 bg-primary/18 shadow-md ring-2 ring-primary/35",
    badge: "bg-primary text-white",
    title: "text-orange-100",
  },
  triannual: {
    idle: "border-white/12 bg-[#0a2443]/50 hover:border-orange-400/30",
    selected: "border-orange-400/70 bg-orange-500/15 shadow-md ring-2 ring-orange-400/30",
    badge: "bg-[#f15a24] text-white",
    title: "text-orange-50",
  },
  biannual: {
    idle: "border-white/10 bg-[#0f172a]/50 hover:border-orange-400/25",
    selected: "border-orange-400/55 bg-orange-500/12 shadow-md ring-2 ring-orange-400/25",
    badge: "bg-orange-500/90 text-white",
    title: "text-orange-50",
  },
  summer: {
    idle: "border-orange-400/20 bg-[#0a2443]/40 hover:border-orange-300/35",
    selected: "border-orange-300/70 bg-orange-400/12 shadow-md ring-2 ring-orange-300/25",
    badge: "bg-orange-400 text-[#0b1220]",
    title: "text-orange-50",
  },
};

const PLAN_PERKS_LIST = [
  { key: "rainblock" as const, label: "Rainblock Treatment" },
  { key: "rainGuarantee" as const, label: "7-Day Rain Guarantee" },
  { key: "hardWaterRemoval" as const, label: "Hard Water Removal" },
  { key: "sharkTech" as const, label: "Shark Tech Service" },
];

function isRecurringPlan(plan: ServicePlanType): boolean {
  return plan !== "none" && plan !== "summer";
}

export default function Home() {
  const [copied, setCopied] = useState(false);
  const [layoutMode, setLayoutMode] = useState<"scroll" | "pages">(() => {
    try {
      return localStorage.getItem(LAYOUT_MODE_STORAGE_KEY) === "pages" ? "pages" : "scroll";
    } catch {
      return "scroll";
    }
  });
  const [pageIndex, setPageIndex] = useState(0);

  const [paneCount, setPaneCount] = useState(0);
  const [frenchPaneCount, setFrenchPaneCount] = useState(0);
  const [countMode, setCountMode] = useState<"standard" | "french">("standard");
  const [selectedServices, setSelectedServices] = useState<Set<ServiceKey>>(
    () => new Set<ServiceKey>(["exterior"])
  );
  const [useScreenSpecial, setUseScreenSpecial] = useState(false);
  const [useOnSiteScreenUpsell, setUseOnSiteScreenUpsell] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [servicePlan, setServicePlan] = useState<ServicePlanType>("none");
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [totalPulse, setTotalPulse] = useState(false);
  const prevTotalRef = useRef(0);

  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_MODE_STORAGE_KEY, layoutMode);
    } catch {
      /* ignore */
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

  const oneTimeEstimate = calculateEstimate(
    paneCount,
    frenchPaneCount,
    selectedServices,
    "none",
    useScreenSpecial,
    { onSiteScreenUpsell: useOnSiteScreenUpsell }
  );

  const planBundleServices = useCallback(() => new Set<ServiceKey>(["exterior"]), []);
  const planEstimate = calculateEstimate(paneCount, frenchPaneCount, planBundleServices(), servicePlan, false);

  const calledOutPrice = oneTimeEstimate.subtotal;
  const alreadyOutPrice = Math.max(oneTimeEstimate.subtotal - 100, 125);
  const frenchEquivalent = frenchPanesToStandard(frenchPaneCount);
  const totalPanes = paneCount + frenchEquivalent;
  const tier = oneTimeEstimate.tier;
  const currentTierIndex = tier ? PANE_TIERS.findIndex((t) => t.maxPanes === tier.maxPanes) : -1;
  const hasScreenSpecial = !!(tier?.screenSpecial) && selectedServices.has("screens");
  const hasAnyTotal = calledOutPrice > 0;
  const perks = SERVICE_PLAN_PERKS[servicePlan];
  const showPlanPricing = isRecurringPlan(servicePlan) || servicePlan === "summer";

  useEffect(() => {
    const displayedTotal = showPlanPricing ? planEstimate.total : calledOutPrice;
    if (displayedTotal !== prevTotalRef.current && displayedTotal > 0) {
      setTotalPulse(true);
      const t = setTimeout(() => setTotalPulse(false), 300);
      prevTotalRef.current = displayedTotal;
      return () => clearTimeout(t);
    }
  }, [calledOutPrice, planEstimate.total, showPlanPricing]);

  useEffect(() => {
    if (tier?.maxPanes === 25 && useOnSiteScreenUpsell) {
      setUseOnSiteScreenUpsell(false);
    }
  }, [tier?.maxPanes, useOnSiteScreenUpsell]);

  const fullReset = () => {
    setPaneCount(0);
    setFrenchPaneCount(0);
    setCountMode("standard");
    setSelectedServices(new Set<ServiceKey>(["exterior"]));
    setUseScreenSpecial(false);
    setUseOnSiteScreenUpsell(false);
    setServicePlan("none");
    setShowBreakdown(false);
    setCopied(false);
    setShowInfo(false);
    setPageIndex(0);
  };

  const toggleService = useCallback((key: ServiceKey) => {
    if (key === "exterior" || key === "interior") return;
    setSelectedServices((prev) => {
      const next = new Set(prev);
      next.add("exterior");
      next.delete("interior");
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleCopyQuote = () => {
    const lines: string[] = [];
    lines.push("Shark Exterior — Quote");
    lines.push("──────────────────────────");
    lines.push("Service: Windows");
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

    if (showPlanPricing) {
      lines.push("");
      lines.push("Plan pricing (exterior):");
      lines.push(`Plan: ${SERVICE_PLAN_LABELS[servicePlan]}`);
      if (planEstimate.planDiscount > 0) {
        lines.push(`Discount: −${formatCurrency(planEstimate.planDiscount)} / visit`);
      }
      lines.push(`Per visit: ${formatCurrency(planEstimate.total)}`);
      if (planEstimate.annualValue) lines.push(`Annual value: ${formatCurrency(planEstimate.annualValue)}`);
    }

    if (showPlanPricing) {
      const includedPerks = PLAN_PERKS_LIST.filter((p) => perks[p.key]).map((p) => p.label);
      if (includedPerks.length > 0) {
        lines.push("");
        lines.push("Plan Perks:");
        includedPerks.forEach((p) => lines.push(`  ✓ ${p}`));
      }
    }

    lines.push("");
    lines.push("Shark Exterior Cleaning");
    lines.push("sharkexteriorcalendar.netlify.app");

    navigator.clipboard.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const adjustActiveCount = (delta: number) => {
    if (countMode === "french") {
      setFrenchPaneCount((c) => Math.min(Math.max(c + delta, 0), 200));
    } else {
      setPaneCount((c) => Math.min(Math.max(c + delta, 0), 200));
    }
  };
  const setActiveCount = (value: number) => {
    const next = Math.min(Math.max(value, 0), 200);
    if (countMode === "french") setFrenchPaneCount(next);
    else setPaneCount(next);
  };
  const activeCount = countMode === "french" ? frenchPaneCount : paneCount;
  const increment = () => adjustActiveCount(1);
  const decrement = () => adjustActiveCount(-1);
  const incrementBy = (n: number) => adjustActiveCount(n);
  const decrementBy = (n: number) => adjustActiveCount(-n);

  const showPage = (n: number) => layoutMode === "scroll" || pageIndex === n;
  const PAGE_LAST = 2;

  const renderInlineStepNav = (step: number) => {
    if (layoutMode !== "pages" || pageIndex !== step) return null;
    return (
      <div
        className="shark-step-nav"
        style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={pageIndex <= 0}
            onClick={() => setPageIndex((i) => Math.max(0, i - 1))}
            className="shark-btn-ghost"
          >
            <ChevronLeft size={18} aria-hidden />
            Back
          </button>
          <p className="text-xs font-bold text-muted-foreground font-display text-center flex-1 min-w-0 tracking-wide">
            Step {pageIndex + 1} / {PAGE_LAST + 1}
          </p>
          <button
            type="button"
            disabled={pageIndex >= PAGE_LAST}
            onClick={() => setPageIndex((i) => Math.min(PAGE_LAST, i + 1))}
            className="shark-btn-primary-solid"
          >
            Next
            <ChevronRight size={18} aria-hidden />
          </button>
        </div>
      </div>
    );
  };

  const headerTotal = showPlanPricing && calledOutPrice > 0 ? planEstimate.total : calledOutPrice;

  return (
    <div className="min-h-screen bg-background pb-10">
      <div
        className="sticky top-0 z-50 border-b border-white/[0.07] shadow-[0_10px_40px_-12px_rgba(0,0,0,0.55)] transition-[box-shadow,border-color] duration-500"
        style={{
          background: "rgba(10, 36, 67, 0.92)",
          backdropFilter: "blur(18px) saturate(1.25)",
          WebkitBackdropFilter: "blur(18px) saturate(1.25)",
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        <div className="max-w-[480px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <BrandLogo />
            <div>
              <p className="text-[10px] uppercase tracking-[0.14em] text-primary font-semibold leading-none">
                Shark Exterior
              </p>
              <p className="text-sm font-bold text-white leading-tight font-display mt-0.5">Pricing Estimator</p>
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
              className="h-9 px-2.5 rounded-xl border border-white/15 flex items-center gap-1.5 text-white/80 hover:text-white hover:bg-white/10 transition-all duration-300 ease-out text-xs font-semibold"
            >
              {layoutMode === "scroll" ? <LayoutList size={15} /> : <SquareStack size={15} />}
              <span className="hidden min-[380px]:inline">{layoutMode === "scroll" ? "Scroll" : "Steps"}</span>
            </button>
            <button
              type="button"
              onClick={fullReset}
              className="h-9 px-3 rounded-xl border border-white/15 flex items-center gap-2 text-white/80 hover:text-white hover:bg-white/10 transition-all duration-300 ease-out text-sm font-semibold"
            >
              <RefreshCw size={14} />
              Reset
            </button>
            <div className={`text-right transition-all duration-300 ease-out ${totalPulse ? "total-pulse" : ""}`}>
              <p className="text-xs text-white/70 font-medium leading-none">
                {calledOutPrice > 0
                  ? showPlanPricing
                    ? `${SERVICE_PLAN_LABELS[servicePlan]} (Exterior)`
                    : "Called Out"
                  : "No quote yet"}
              </p>
              <p className="text-2xl font-bold leading-tight text-white font-display">
                {calledOutPrice > 0 ? formatCurrency(headerTotal) : "—"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[480px] mx-auto px-4 pt-5 space-y-5">
        {showPage(0) && (
          <>
            <div className="shark-panel overflow-hidden">
              <div className="px-4 pt-4 pb-3 border-b border-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span
                    className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center font-display ${MODE_CONFIG.stepColor}`}
                  >
                    1
                  </span>
                  <h2 className="font-bold text-foreground font-display">Count the Panes</h2>
                </div>
                <button
                  onClick={() => setShowInfo(!showInfo)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Info size={16} />
                </button>
              </div>

              {showInfo && (
                <div className="px-4 py-3 bg-accent/50 border-b border-border text-sm text-accent-foreground">
                  <p className="font-semibold mb-1">How to count panes:</p>
                  <p>
                    Every individual piece of glass = 1 pane. A standard window with a fixed top + sliding bottom ={" "}
                    <strong>2 panes</strong>. Count all glass on the house.
                  </p>
                </div>
              )}

              <div className="px-4 py-5">
                <div className="grid grid-cols-2 gap-2 mb-4 p-1 rounded-xl bg-zinc-800/80 border border-white/10">
                  <button
                    type="button"
                    onClick={() => setCountMode("standard")}
                    className={`h-11 rounded-lg text-sm font-bold font-display transition-all ${
                      countMode === "standard"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-zinc-300 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    Standard
                  </button>
                  <button
                    type="button"
                    onClick={() => setCountMode("french")}
                    className={`h-11 rounded-lg text-sm font-bold font-display transition-all ${
                      countMode === "french"
                        ? "bg-primary text-primary-foreground shadow-sm"
                        : "text-zinc-300 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    French
                    {frenchPaneCount > 0 ? (
                      <span className="ml-1.5 text-[11px] opacity-90">({frenchPaneCount})</span>
                    ) : null}
                  </button>
                </div>

                {countMode === "french" && (
                  <p className="mb-3 text-center text-xs text-zinc-300">
                    French panes convert at <strong className="text-orange-300">×{FRENCH_PANE_MULTIPLIER}</strong> and
                    add into your total.
                  </p>
                )}

                <div className="flex items-center justify-between gap-4 mb-4">
                  <button onClick={decrement} className="pane-btn bg-zinc-800 text-zinc-100 border border-white/10 hover:bg-zinc-700">
                    <Minus size={22} />
                  </button>
                  <div className="flex-1 text-center">
                    <p className="text-6xl font-bold text-white leading-none font-display">{activeCount}</p>
                    <p className="text-sm text-zinc-300 mt-1 font-medium">
                      {countMode === "french" ? "French panes" : "standard panes"}
                    </p>
                  </div>
                  <button onClick={increment} className={`pane-btn ${MODE_CONFIG.btnColor}`}>
                    <Plus size={22} />
                  </button>
                </div>

                <div className="grid grid-cols-4 gap-2">
                  {(countMode === "french" ? [10, 20, 30, 40] : [-5, -1, +1, +5]).map((n) => (
                    <button
                      key={`${countMode}-${n}`}
                      type="button"
                      onClick={() => (n > 0 ? incrementBy(n) : decrementBy(Math.abs(n)))}
                      className="py-2.5 rounded-xl text-sm font-semibold border border-white/12 bg-zinc-800 text-zinc-100 hover:bg-zinc-700 transition-colors active:scale-95"
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
                    value={activeCount === 0 ? "" : activeCount}
                    placeholder="Or type a number"
                    onChange={(e) => {
                      const v = parseInt(e.target.value);
                      if (!isNaN(v)) setActiveCount(v);
                      else if (e.target.value === "") setActiveCount(0);
                    }}
                    className={`w-full h-11 rounded-xl border border-white/12 bg-zinc-800 px-3 text-center text-lg font-bold text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 font-display ${MODE_CONFIG.ringColor}`}
                  />
                </div>
              </div>

              {totalPanes > 0 && (
                <div className="px-4 pb-4">
                  <div className="rounded-xl bg-zinc-800/90 border border-white/10 px-3 py-2.5 flex items-center justify-between">
                    <div>
                      <p className="text-xs text-zinc-400 font-medium">Pricing Tier</p>
                      <p className="text-sm font-bold text-zinc-100 font-display">
                        {tier ? tier.label : `Custom (${totalPanes} panes)`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-zinc-400 font-medium">Est. Home Size</p>
                      <p className="text-sm font-semibold text-zinc-200">
                        {tier ? tier.sqftRange : "9,999+ SqFt"}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="flex gap-1">
                      {PANE_TIERS.map((t, i) => (
                        <div
                          key={t.maxPanes}
                          className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                            i <= currentTierIndex ? "bg-primary" : "bg-zinc-700"
                          }`}
                        />
                      ))}
                    </div>
                    <div className="flex justify-between mt-1">
                      {["25", "40", "60", "80", "100", "120+"].map((l) => (
                        <span key={l} className="text-[10px] text-zinc-400">
                          {l}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="mt-4 rounded-2xl border border-primary/40 bg-zinc-800 px-4 py-4 text-center">
                    <p className="text-[11px] font-extrabold uppercase tracking-wide text-orange-300 font-display">
                      Total panes for pricing
                    </p>
                    <p className="text-5xl font-black text-primary font-display leading-none mt-1">{totalPanes}</p>
                    <p className="text-xs text-zinc-300 mt-2">
                      {paneCount} standard
                      {frenchPaneCount > 0 ? (
                        <span>
                          {" "}
                          · +{frenchEquivalent} from {frenchPaneCount} French
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
            <div className="shark-panel overflow-hidden">
              <div className="px-4 pt-4 pb-3 border-b border-border flex items-center gap-2">
                <span
                  className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center font-display ${MODE_CONFIG.stepColor}`}
                >
                  2
                </span>
                <div>
                  <h2 className="font-bold text-foreground font-display">Services</h2>
                  <p className="text-xs text-zinc-300 mt-0.5">
                    Exterior window cleaning is included — add screens & tracks below if needed.
                  </p>
                </div>
              </div>

              <div className="p-4">
                <div className="rounded-2xl border-2 border-primary/30 bg-accent/25 px-4 py-4 flex items-center gap-3">
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

            <div className="shark-panel overflow-hidden mt-4">
              <div className="px-4 pt-4 pb-3 border-b border-border">
                <h3 className="font-bold text-foreground font-display text-sm">Add-ons (screens & tracks)</h3>
                <p className="text-xs text-zinc-300 mt-1">Optional upsells priced with your one-time quote.</p>
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
                    tier !== null && (tier[svc.key as keyof typeof tier] as number) === 0 && svc.key !== "tracks";

                  return (
                    <button
                      key={svc.key}
                      type="button"
                      onClick={() => !isUnavailable && toggleService(svc.key)}
                      disabled={isUnavailable}
                      className={`service-card relative rounded-2xl border-2 p-4 text-left transition-all duration-200 active:scale-[0.97] ${
                        isSelected && !isUnavailable
                          ? "border-primary/80 bg-primary/15"
                          : isUnavailable
                            ? "border-border bg-secondary/50 opacity-50 cursor-not-allowed"
                            : "border-border bg-secondary/40 hover:border-primary/40 hover:bg-primary/10"
                      }`}
                    >
                      <div className={`mb-2 ${isSelected ? "text-primary" : svc.color}`}>{svc.icon}</div>
                      <p className={`font-bold text-sm font-display ${isSelected ? "text-orange-100" : "text-foreground"}`}>
                        {svc.label}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">{svc.description}</p>
                      {price !== null && price > 0 && (
                        <p
                          className={`text-sm font-bold mt-2 font-display ${
                            isSelected ? "text-primary" : "text-muted-foreground"
                          }`}
                        >
                          {formatCurrency(price)}
                        </p>
                      )}
                      {tracksCustomQuote && (
                        <p className="text-xs font-semibold text-orange-300 mt-2">Full house — custom quote</p>
                      )}
                      {isUnavailable && <p className="text-xs text-muted-foreground mt-2">Custom quote</p>}
                      {isSelected && !isUnavailable && (
                        <div className="absolute top-2 right-2 text-primary">
                          <CheckCircle2 size={16} />
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {tier?.maxPanes === 25 && selectedServices.has("screens") && (
                <p className="px-4 text-[11px] text-muted-foreground -mt-1 mb-2">
                  On-site <strong>$60</strong> screens apply from the <strong>26+</strong> panes tier. Up to 25 panes, screens
                  stay <strong>{formatCurrency(tier.screens)}</strong> unless you use the special below.
                </p>
              )}

              {selectedServices.has("screens") && !oneTimeEstimate.isCustom && tier && tier.maxPanes > 25 && (
                <div className="px-4 pb-2">
                  <button
                    type="button"
                    onClick={() => {
                      const next = !useOnSiteScreenUpsell;
                      setUseOnSiteScreenUpsell(next);
                      if (next) setUseScreenSpecial(false);
                    }}
                    className={`w-full rounded-xl border-2 px-4 py-3 flex items-center justify-between transition-all duration-200 ${
                      useOnSiteScreenUpsell ? "border-primary bg-primary/15" : "border-border bg-secondary"
                    }`}
                  >
                    <div className="text-left">
                      <p className={`text-sm font-bold ${useOnSiteScreenUpsell ? "text-orange-100" : "text-foreground"}`}>
                        On-site screen upsell ($60)
                      </p>
                      <p className="text-xs text-muted-foreground">
                        From 26+ panes tier. First tier (≤25) stays the listed screen price ($50).
                      </p>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        useOnSiteScreenUpsell ? "border-primary bg-primary" : "border-border"
                      }`}
                    >
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
                      useScreenSpecial ? "border-primary bg-primary/15" : "border-border bg-secondary"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles size={16} className={useScreenSpecial ? "text-primary" : "text-muted-foreground"} />
                      <div className="text-left">
                        <p className={`text-sm font-bold ${useScreenSpecial ? "text-primary" : "text-foreground"}`}>
                          Screen Cleaning Special
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {tier?.maxPanes === 25 ? "Up to 5 screens for $25" : "$25 special available"}
                        </p>
                      </div>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                        useScreenSpecial ? "border-primary bg-primary" : "border-border"
                      }`}
                    >
                      {useScreenSpecial && <div className="w-2 h-2 rounded-full bg-white" />}
                    </div>
                  </button>
                </div>
              )}
            </div>
            {renderInlineStepNav(1)}
          </>
        )}

        {showPage(2) && (
          <div className="shark-panel overflow-hidden">
            <div className="px-4 pt-4 pb-3 border-b border-border flex items-center gap-2">
              <span
                className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center font-display ${MODE_CONFIG.stepColor}`}
              >
                3
              </span>
              <h2 className="font-bold text-foreground font-display">Service Plan</h2>
              <span className="ml-auto text-xs font-semibold text-primary bg-accent px-2 py-0.5 rounded-full">
                Save up to $150
              </span>
            </div>

            <div className="px-4 pt-4">
              <p className="text-xs text-zinc-300">
                Recurring plans are priced for <strong className="text-zinc-100">exterior</strong> visits only. Screens and
                tracks stay separate add-ons.
              </p>
            </div>

            <div className="p-4 space-y-2">
              {SERVICE_PLAN_ORDER.map((plan) => {
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
                        <span
                          className={`text-xs font-bold font-display px-1.5 py-0.5 rounded-lg ${
                            isSelected ? ps.badge : "bg-secondary text-muted-foreground"
                          }`}
                        >
                          −${discount}
                        </span>
                      )}
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                          isSelected ? "border-white/90 bg-white/20" : "border-border bg-secondary"
                        }`}
                      >
                        {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            {showPlanPricing && (
              <div className="px-4 pb-4">
                <div className="rounded-xl p-3 bg-accent border border-primary/25">
                  <p className="text-xs font-bold mb-2.5 font-display text-accent-foreground">
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
                          <span
                            className={`text-xs ${
                              included ? "text-foreground font-medium" : "text-muted-foreground line-through"
                            }`}
                          >
                            {perk.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                  {(servicePlan === "biannual" || servicePlan === "summer") && (
                    <p className="text-[11px] text-orange-300 mt-2.5 font-medium">
                      Upgrade to Monthly, Quarterly, or Tri-Annual to unlock all perks.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {showPage(2) && hasAnyTotal && calledOutPrice > 0 && (
          <div className="shark-panel-highlight overflow-hidden">
            <div className="px-4 pt-4 pb-3 border-b border-primary/25 flex items-center gap-2">
              <ClipboardList size={18} className="text-primary" />
              <h2 className="font-bold text-foreground font-display">Quote Summary</h2>
            </div>
            <div className="p-4">
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

              {showPlanPricing && (
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

              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl bg-secondary px-3 py-3 text-center border border-border">
                  <p className="text-xs font-semibold text-muted-foreground mb-1 font-display">Called Out</p>
                  <p className="text-2xl font-bold text-foreground leading-tight font-display">
                    {formatCurrency(calledOutPrice)}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-1">One-time, drive out</p>
                </div>

                <div className="rounded-xl bg-primary/90 px-3 py-3 text-center">
                  <p className="text-xs font-semibold text-primary-foreground/70 mb-1 font-display">Already Out</p>
                  <p className="text-2xl font-bold text-primary-foreground leading-tight font-display">
                    {formatCurrency(alreadyOutPrice)}
                  </p>
                  <p className="text-[10px] text-primary-foreground/60 mt-1">In-area discount −$100</p>
                </div>
              </div>

              {tier && (
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
                  {formatCurrency(Math.round(calledOutPrice * 0.2))} · Target revenue/hr: $125+
                </div>
              )}

              <button
                onClick={handleCopyQuote}
                className={`mt-3 w-full rounded-xl border-2 py-3 flex items-center justify-center gap-2 text-sm font-bold font-display transition-all duration-200 active:scale-[0.98] ${
                  copied
                    ? "border-primary bg-primary text-primary-foreground"
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

        <p className="text-center text-xs text-muted-foreground pb-6 pt-2">
          Shark Exterior · Exterior Cleaning Done Right.
        </p>
      </div>
    </div>
  );
}
