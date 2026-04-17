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
  calculateWindowEstimate,
  calculateChristmasEstimate,
  formatCurrency,
  getTierForPanes,
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
  User,
} from "lucide-react";

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

  // Customer / job info
  const [customerName, setCustomerName] = useState("");
  const [copied, setCopied] = useState(false);

  // Window cleaning state
  const [paneCount, setPaneCount] = useState(0);
  const [frenchPaneCount, setFrenchPaneCount] = useState(0);
  const [selectedServices, setSelectedServices] = useState<Set<ServiceKey>>(new Set<ServiceKey>(["exterior"]));
  const [useScreenSpecial, setUseScreenSpecial] = useState(false);
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

  const totalPanes = paneCount + frenchPaneCount;

  const estimate =
    appMode === "windows"
      ? calculateWindowEstimate(totalPanes, selectedServices, servicePlan, useScreenSpecial, [])
      : calculateChristmasEstimate(linearFeet, lightType, addGoveePanel, "none");

  // One-time price points (no plan discount)
  const calledOutPrice = estimate.subtotal;
  const alreadyOutPrice = Math.max(estimate.subtotal - 100, appMode === "windows" ? 125 : 0);

  const tier = appMode === "windows" ? getTierForPanes(totalPanes) : null;
  const currentTierIndex = tier ? PANE_TIERS.findIndex((t) => t.maxPanes === tier.maxPanes) : -1;
  const hasScreenSpecial = !!(tier?.screenSpecial) && selectedServices.has("screens");
  const hasAnyTotal = estimate.total > 0 || calledOutPrice > 0;
  const perks = SERVICE_PLAN_PERKS[servicePlan];

  useEffect(() => {
    if (estimate.total !== prevTotalRef.current && estimate.total > 0) {
      setTotalPulse(true);
      const t = setTimeout(() => setTotalPulse(false), 300);
      prevTotalRef.current = estimate.total;
      return () => clearTimeout(t);
    }
  }, [estimate.total]);

  const handleModeChange = (mode: AppMode) => {
    setAppMode(mode);
    setShowBreakdown(false);
    setShowInfo(false);
  };

  const reset = () => {
    setCustomerName("");
    setPaneCount(0);
    setFrenchPaneCount(0);
    setSelectedServices(new Set<ServiceKey>(["exterior"]));
    setUseScreenSpecial(false);
    setLinearFeet(0);
    setLightType("classic");
    setAddGoveePanel(false);
    setServicePlan("none");
    setShowBreakdown(false);
  };

  const toggleService = useCallback((key: ServiceKey) => {
    setSelectedServices((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const handleCopyQuote = () => {
    const modeLabel = MODE_CONFIG.find((m) => m.key === appMode)?.label ?? appMode;
    const planLabel = SERVICE_PLAN_LABELS[servicePlan];
    const lines: string[] = [];

    lines.push("🍃 Leaf Cleaning — Quote");
    lines.push("──────────────────────────");
    if (customerName.trim()) lines.push(`Customer: ${customerName.trim()}`);
    lines.push(`Service: ${modeLabel}`);
    lines.push("");

    if (estimate.breakdown.length > 0) {
      lines.push("Services:");
      estimate.breakdown.forEach((item) => {
        lines.push(`  • ${item.label} — ${formatCurrency(item.price)}`);
      });
      lines.push("");
    }

    if (estimate.planDiscount > 0) {
      lines.push(`Plan: ${planLabel} (−${formatCurrency(estimate.planDiscount)})`);
    } else {
      lines.push(`Plan: ${planLabel}`);
    }

    lines.push("──────────────────────────");
    if (appMode === "windows" && servicePlan !== "none") {
      lines.push(`${SERVICE_PLAN_LABELS[servicePlan]}: ${formatCurrency(estimate.total)}`);
      if (estimate.annualValue) lines.push(`Annual Value: ${formatCurrency(estimate.annualValue)}`);
      lines.push("");
    }
    lines.push(`Called Out (one-time): ${formatCurrency(calledOutPrice)}`);
    lines.push(`Already Out (−$100):   ${formatCurrency(alreadyOutPrice)}`);

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

  // Christmas linear-feet helpers
  const incFt = (n: number) => setLinearFeet((c) => Math.min(c + n, 2000));
  const decFt = (n: number) => setLinearFeet((c) => Math.max(c - n, 0));

  return (
    <div className="min-h-screen bg-background pb-10">

      {/* ── Sticky Header ── */}
      <div className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-border shadow-sm">
        <div className="max-w-[480px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src="/logo.png" alt="Leaf Cleaning" className="w-9 h-9 rounded-full object-cover" />
            <div>
              <p className="text-xs text-muted-foreground font-medium leading-none">Leaf Cleaning</p>
              <p className="text-sm font-bold text-foreground leading-tight font-display">Estimator</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={reset}
              className="h-9 px-3 rounded-xl border border-border flex items-center gap-2 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors text-sm font-semibold"
            >
              <RefreshCw size={14} />
              Reset
            </button>
            <div className={`text-right transition-all duration-200 ${totalPulse ? "total-pulse" : ""}`}>
              <p className="text-xs text-muted-foreground font-medium leading-none">
                {calledOutPrice > 0 ? (appMode === "windows" && servicePlan !== "none" ? SERVICE_PLAN_LABELS[servicePlan] : "Called Out") : "No quote yet"}
              </p>
              <p className="text-2xl font-bold leading-tight text-primary font-display">
                {calledOutPrice > 0 ? formatCurrency(appMode === "windows" && servicePlan !== "none" ? estimate.total : calledOutPrice) : "—"}
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

        {/* ── Customer / Job Name ── */}
        <div className="bg-white rounded-2xl border border-border shadow-sm px-4 py-3 flex items-center gap-3">
          <User size={16} className="text-muted-foreground flex-shrink-0" />
          <input
            type="text"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Customer name (optional)"
            className="flex-1 bg-transparent text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          {customerName && (
            <button onClick={() => setCustomerName("")} className="text-muted-foreground hover:text-foreground transition-colors">
              <X size={14} />
            </button>
          )}
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
                      <p className="text-[11px] text-muted-foreground">Divided-light / grille windows — add to total</p>
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
                      Total: {totalPanes} panes ({paneCount} standard + {frenchPaneCount} French)
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
                        {tier ? tier.label : `Custom (${paneCount} panes)`}
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

              {hasScreenSpecial && tier?.screenSpecial !== null && (
                <div className="px-4 pb-4">
                  <button
                    onClick={() => setUseScreenSpecial(!useScreenSpecial)}
                    className={`w-full rounded-xl border-2 px-4 py-3 flex items-center justify-between transition-all duration-200 ${
                      useScreenSpecial ? "border-amber-400 bg-amber-50" : "border-border bg-secondary"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Sparkles size={16} className={useScreenSpecial ? "text-amber-500" : "text-muted-foreground"} />
                      <div className="text-left">
                        <p className={`text-sm font-bold ${useScreenSpecial ? "text-amber-700" : "text-foreground"}`}>Screen Cleaning Special</p>
                        <p className="text-xs text-muted-foreground">15 screens for $25</p>
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
                  {estimate.breakdown.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className="font-semibold text-foreground font-display">{formatCurrency(item.price)}</span>
                    </div>
                  ))}
                  {estimate.planDiscount > 0 && (
                    <div className="flex items-center justify-between text-sm border-t border-border pt-2">
                      <span className="text-primary font-medium">{SERVICE_PLAN_LABELS[servicePlan]} Discount</span>
                      <span className="font-bold text-primary font-display">−{formatCurrency(estimate.planDiscount)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Plan price (Windows only when plan is active) */}
              {appMode === "windows" && servicePlan !== "none" && (
                <div className="rounded-xl bg-primary px-4 py-4 flex items-center justify-between mb-3">
                  <div>
                    <p className="text-primary-foreground/80 text-xs font-medium">{SERVICE_PLAN_LABELS[servicePlan]} Price</p>
                    <p className="text-4xl font-bold text-primary-foreground leading-tight font-display">
                      {formatCurrency(estimate.total)}
                    </p>
                  </div>
                  {estimate.annualValue && (
                    <div className="text-right">
                      <p className="text-primary-foreground/70 text-xs font-medium">Annual Value</p>
                      <p className="text-xl font-bold text-primary-foreground/90 font-display">
                        {formatCurrency(estimate.annualValue)}
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
                    {estimate.isCustom ? " — custom rate" : ""}
                    {frenchPaneCount > 0 ? ` · incl. ${frenchPaneCount} French panes` : ""}
                  </span>
                </div>
              )}

              {estimate.total >= 275 && (
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

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground pb-2">
          Leaf Cleaning · Spotless Views. Every Time.
        </p>
      </div>
    </div>
  );
}
