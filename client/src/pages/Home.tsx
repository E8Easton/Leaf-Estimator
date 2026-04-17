/**
 * Leaf Cleaning — Window Cleaning Estimator
 * Design: Clean Contractor / Modern Trade App
 * - DM Sans body, Space Grotesk for numbers/headings
 * - MiNT emerald green primary, cool slate background
 * - Sticky live total header, card-stack layout, thumb-friendly
 * - Mobile-first, max-width 480px centered
 * - French pane calculator (×0.4 rule from Gatlin McBride video [4])
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  PANE_TIERS,
  SERVICE_PLAN_LABELS,
  SERVICE_PLAN_DESCRIPTIONS,
  FRENCH_PANE_MULTIPLIER,
  frenchPanesToStandard,
  calculateEstimate,
  formatCurrency,
  getTierForPanes,
  type ServiceKey,
  type ServicePlanType,
} from "@/lib/pricing";
import {
  Droplets,
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
  LayoutGrid,
} from "lucide-react";

const SERVICE_CONFIG: {
  key: ServiceKey;
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}[] = [
  {
    key: "exterior",
    label: "Exterior",
    description: "Outside glass surfaces",
    icon: <HomeIcon size={20} />,
    color: "text-blue-500",
  },
  {
    key: "interior",
    label: "Interior",
    description: "Inside glass surfaces",
    icon: <Layers size={20} />,
    color: "text-violet-500",
  },
  {
    key: "screens",
    label: "Screens",
    description: "Window screen cleaning",
    icon: <Grid3x3 size={20} />,
    color: "text-amber-500",
  },
  {
    key: "tracks",
    label: "Tracks",
    description: "Window track detailing",
    icon: <Wind size={20} />,
    color: "text-rose-500",
  },
];

function PaneCounter({
  label,
  value,
  onChange,
  accentColor = "bg-primary text-primary-foreground",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  accentColor?: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => onChange(Math.max(value - 1, 0))}
        className="w-11 h-11 rounded-xl bg-secondary border border-border flex items-center justify-center text-foreground hover:bg-border transition-colors active:scale-95"
      >
        <Minus size={18} />
      </button>
      <div className="flex-1 text-center">
        <p
          className="text-4xl font-bold text-foreground leading-none"
          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
        >
          {value}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 font-medium">{label}</p>
      </div>
      <button
        onClick={() => onChange(Math.min(value + 1, 300))}
        className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold transition-colors active:scale-95 ${accentColor}`}
      >
        <Plus size={18} />
      </button>
    </div>
  );
}

export default function Home() {
  const [standardPanes, setStandardPanes] = useState(0);
  const [frenchPanes, setFrenchPanes] = useState(0);
  const [selectedServices, setSelectedServices] = useState<Set<ServiceKey>>(
    new Set<ServiceKey>(["exterior"])
  );
  const [servicePlan, setServicePlan] = useState<ServicePlanType>("none");
  const [useScreenSpecial, setUseScreenSpecial] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [showPriceBook, setShowPriceBook] = useState(false);
  const [showFrenchInfo, setShowFrenchInfo] = useState(false);
  const [totalPulse, setTotalPulse] = useState(false);
  const prevTotalRef = useRef(0);

  const frenchEquivalent = frenchPanesToStandard(frenchPanes);
  const totalPanes = standardPanes + frenchEquivalent;

  const estimate = calculateEstimate(
    standardPanes,
    frenchPanes,
    selectedServices,
    servicePlan,
    useScreenSpecial
  );

  const tier = getTierForPanes(totalPanes);
  const currentTierIndex = tier
    ? PANE_TIERS.findIndex((t) => t.maxPanes === tier.maxPanes)
    : -1;

  useEffect(() => {
    if (estimate.total !== prevTotalRef.current && estimate.total > 0) {
      setTotalPulse(true);
      const t = setTimeout(() => setTotalPulse(false), 300);
      prevTotalRef.current = estimate.total;
      return () => clearTimeout(t);
    }
  }, [estimate.total]);

  const toggleService = useCallback((key: ServiceKey) => {
    setSelectedServices((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const reset = () => {
    setStandardPanes(0);
    setFrenchPanes(0);
    setSelectedServices(new Set<ServiceKey>(["exterior"]));
    setServicePlan("none");
    setUseScreenSpecial(false);
    setShowBreakdown(false);
  };

  const hasScreenSpecial =
    tier?.screenSpecial !== null &&
    tier?.screenSpecial !== undefined &&
    selectedServices.has("screens");

  return (
    <div className="min-h-screen bg-background pb-10">
      {/* ── Sticky Header / Live Total ── */}
      <div className="sticky top-0 z-50 bg-white/95 backdrop-blur-sm border-b border-border shadow-sm">
        <div className="max-w-[480px] mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-primary flex items-center justify-center">
              <Droplets size={16} className="text-primary-foreground" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium leading-none">Leaf Cleaning</p>
              <p
                className="text-sm font-bold text-foreground leading-tight"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Estimator
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={reset}
              className="w-8 h-8 rounded-xl border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <RefreshCw size={14} />
            </button>
            <div className={`text-right transition-all duration-200 ${totalPulse ? "total-pulse" : ""}`}>
              <p className="text-xs text-muted-foreground font-medium leading-none">
                {estimate.total > 0 ? "Quote Total" : "No quote yet"}
              </p>
              <p
                className="text-2xl font-bold leading-tight text-primary"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                {estimate.total > 0 ? formatCurrency(estimate.total) : "—"}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-[480px] mx-auto px-4 pt-5 space-y-4">

        {/* ── Step 1: Count Panes ── */}
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >1</span>
              <h2 className="font-bold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Count the Panes
              </h2>
            </div>
            <button
              onClick={() => setShowFrenchInfo(!showFrenchInfo)}
              className="text-xs font-semibold text-primary flex items-center gap-1 bg-accent px-2 py-1 rounded-lg"
            >
              <Info size={12} />
              Pane guide
            </button>
          </div>

          {showFrenchInfo && (
            <div className="px-4 py-3 bg-blue-50 border-b border-blue-100 text-sm text-blue-900 space-y-1">
              <p className="font-semibold">How to count panes:</p>
              <p><strong>Standard pane:</strong> Each individual piece of glass = 1 pane. A double-hung window (fixed top + sliding bottom) = 2 panes.</p>
              <p><strong>French/divided-light pane:</strong> Count each small pane, then the app multiplies by <strong>×{FRENCH_PANE_MULTIPLIER}</strong> automatically to get the equivalent standard count.</p>
            </div>
          )}

          <div className="px-4 py-5 space-y-5">
            {/* Standard panes */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
                Standard Panes
              </p>
              <PaneCounter
                label="standard panes"
                value={standardPanes}
                onChange={setStandardPanes}
              />
              <div className="grid grid-cols-4 gap-2 mt-3">
                {[-5, -1, +1, +5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setStandardPanes((c) => Math.min(Math.max(c + n, 0), 300))}
                    className="py-2 rounded-xl text-sm font-semibold border border-border bg-secondary text-secondary-foreground hover:bg-border transition-colors active:scale-95"
                  >
                    {n > 0 ? `+${n}` : `${n}`}
                  </button>
                ))}
              </div>
              <input
                type="number"
                min={0}
                max={300}
                value={standardPanes === 0 ? "" : standardPanes}
                placeholder="Or type a number"
                onChange={(e) => {
                  const v = parseInt(e.target.value);
                  if (!isNaN(v)) setStandardPanes(Math.min(Math.max(v, 0), 300));
                  else if (e.target.value === "") setStandardPanes(0);
                }}
                className="mt-2 w-full h-11 rounded-xl border border-border bg-secondary px-3 text-center text-lg font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              />
            </div>

            {/* Divider */}
            <div className="border-t border-dashed border-border" />

            {/* French panes */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  French / Divided-Light Panes
                </p>
                <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">
                  ×{FRENCH_PANE_MULTIPLIER} rule
                </span>
              </div>
              <PaneCounter
                label="French panes"
                value={frenchPanes}
                onChange={setFrenchPanes}
                accentColor="bg-amber-500 text-white"
              />
              <div className="grid grid-cols-4 gap-2 mt-3">
                {[-5, -1, +1, +5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setFrenchPanes((c) => Math.min(Math.max(c + n, 0), 300))}
                    className="py-2 rounded-xl text-sm font-semibold border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors active:scale-95"
                  >
                    {n > 0 ? `+${n}` : `${n}`}
                  </button>
                ))}
              </div>
              {frenchPanes > 0 && (
                <div className="mt-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 flex items-center justify-between text-sm">
                  <span className="text-amber-700">
                    {frenchPanes} French panes × {FRENCH_PANE_MULTIPLIER}
                  </span>
                  <span className="font-bold text-amber-800" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    = {frenchEquivalent} standard panes
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Total pane count & tier */}
          {totalPanes > 0 && (
            <div className="px-4 pb-4">
              <div className="rounded-xl bg-accent px-3 py-2 flex items-center justify-between">
                <div>
                  <p className="text-xs text-accent-foreground/70 font-medium">Total Panes</p>
                  <p
                    className="text-xl font-bold text-accent-foreground"
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    {totalPanes}
                    {frenchPanes > 0 && (
                      <span className="text-sm font-normal text-accent-foreground/60 ml-1">
                        ({standardPanes} + {frenchEquivalent} French)
                      </span>
                    )}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-accent-foreground/70 font-medium">Pricing Tier</p>
                  <p
                    className="text-sm font-bold text-accent-foreground"
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    {tier ? tier.label : `Custom (${totalPanes} panes)`}
                  </p>
                  <p className="text-xs text-accent-foreground/60">
                    {tier ? tier.sqftRange : "10,000+ SqFt"}
                  </p>
                </div>
              </div>

              {/* Tier progress bar */}
              <div className="mt-3">
                <div className="flex gap-1">
                  {PANE_TIERS.map((t, i) => (
                    <div
                      key={t.maxPanes}
                      className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                        i <= currentTierIndex ? "bg-primary" : "bg-border"
                      }`}
                    />
                  ))}
                </div>
                <div className="flex justify-between mt-1">
                  {PANE_TIERS.map((t) => (
                    <span key={t.maxPanes} className="text-[10px] text-muted-foreground">
                      {t.maxPanes}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Step 2: Services ── */}
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-border flex items-center gap-2">
            <span
              className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >2</span>
            <h2 className="font-bold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Select Services
            </h2>
          </div>

          <div className="p-4 grid grid-cols-2 gap-3">
            {SERVICE_CONFIG.map((svc) => {
              const isSelected = selectedServices.has(svc.key);
              const price =
                tier
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
                  <div className={`mb-2 ${isSelected ? "text-primary" : svc.color}`}>
                    {svc.icon}
                  </div>
                  <p
                    className={`font-bold text-sm ${isSelected ? "text-primary" : "text-foreground"}`}
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    {svc.label}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{svc.description}</p>
                  {price !== null && price > 0 && !isUnavailable && (
                    <p
                      className={`text-sm font-bold mt-2 ${isSelected ? "text-primary" : "text-muted-foreground"}`}
                      style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                    >
                      {formatCurrency(price)}
                    </p>
                  )}
                  {isUnavailable && (
                    <p className="text-xs text-muted-foreground mt-2">Custom quote</p>
                  )}
                  {isSelected && !isUnavailable && (
                    <div className="absolute top-2 right-2 text-primary">
                      <CheckCircle2 size={16} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Screen Special */}
          {hasScreenSpecial && tier?.screenSpecial !== null && (
            <div className="px-4 pb-4">
              <button
                onClick={() => setUseScreenSpecial(!useScreenSpecial)}
                className={`w-full rounded-xl border-2 px-4 py-3 flex items-center justify-between transition-all duration-200 ${
                  useScreenSpecial
                    ? "border-amber-400 bg-amber-50"
                    : "border-border bg-secondary"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Sparkles size={16} className={useScreenSpecial ? "text-amber-500" : "text-muted-foreground"} />
                  <div className="text-left">
                    <p className={`text-sm font-bold ${useScreenSpecial ? "text-amber-700" : "text-foreground"}`}>
                      Screen Cleaning Special
                    </p>
                    <p className="text-xs text-muted-foreground">Up to 5 screens for $25</p>
                  </div>
                </div>
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                    useScreenSpecial ? "border-amber-400 bg-amber-400" : "border-border"
                  }`}
                >
                  {useScreenSpecial && <div className="w-2 h-2 rounded-full bg-white" />}
                </div>
              </button>
            </div>
          )}
        </div>

        {/* ── Step 3: Service Plan ── */}
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-border flex items-center gap-2">
            <span
              className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center"
              style={{ fontFamily: "'Space Grotesk', sans-serif" }}
            >3</span>
            <h2 className="font-bold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Service Plan
            </h2>
            <span className="ml-auto text-xs font-semibold text-primary bg-accent px-2 py-0.5 rounded-full">
              Up to $150 off
            </span>
          </div>

          <div className="p-4 space-y-2">
            {(["none", "biannual", "quarterly", "monthly"] as ServicePlanType[]).map((plan) => {
              const isSelected = servicePlan === plan;
              return (
                <button
                  key={plan}
                  onClick={() => setServicePlan(plan)}
                  className={`w-full rounded-xl border-2 px-4 py-3 flex items-center justify-between transition-all duration-200 active:scale-[0.98] ${
                    isSelected
                      ? "border-primary bg-accent"
                      : "border-border bg-white hover:border-primary/40"
                  }`}
                >
                  <div className="text-left">
                    <p
                      className={`font-bold text-sm ${isSelected ? "text-primary" : "text-foreground"}`}
                      style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                    >
                      {SERVICE_PLAN_LABELS[plan]}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {SERVICE_PLAN_DESCRIPTIONS[plan]}
                    </p>
                  </div>
                  <div
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      isSelected ? "border-primary bg-primary" : "border-border"
                    }`}
                  >
                    {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Quote Summary ── */}
        {estimate.total > 0 && (
          <div className="bg-white rounded-2xl border-2 border-primary shadow-md overflow-hidden">
            <div className="px-4 pt-4 pb-3 border-b border-primary/20 flex items-center gap-2">
              <ClipboardList size={18} className="text-primary" />
              <h2 className="font-bold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                Quote Summary
              </h2>
            </div>

            <div className="p-4">
              {/* Breakdown toggle */}
              <button
                onClick={() => setShowBreakdown(!showBreakdown)}
                className="w-full flex items-center justify-between text-sm text-muted-foreground hover:text-foreground transition-colors mb-3"
              >
                <span className="font-medium">View line items</span>
                {showBreakdown ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {showBreakdown && (
                <div className="space-y-2 mb-4">
                  {frenchPanes > 0 && (
                    <div className="flex items-center justify-between text-sm border border-amber-200 bg-amber-50 rounded-xl px-3 py-2">
                      <span className="text-amber-700 font-medium">
                        French panes ({frenchPanes} × {FRENCH_PANE_MULTIPLIER})
                      </span>
                      <span className="font-bold text-amber-800" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                        = {frenchEquivalent} std panes
                      </span>
                    </div>
                  )}
                  {estimate.breakdown.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span
                        className="font-semibold text-foreground"
                        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                      >
                        {formatCurrency(item.price)}
                      </span>
                    </div>
                  ))}
                  {estimate.subtotal !== estimate.total + estimate.planDiscount && (
                    <div className="flex items-center justify-between text-sm border-t border-border pt-2">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span className="font-semibold" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                        {formatCurrency(estimate.subtotal)}
                      </span>
                    </div>
                  )}
                  {estimate.planDiscount > 0 && (
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-primary font-medium">
                        {SERVICE_PLAN_LABELS[servicePlan]} Discount
                      </span>
                      <span
                        className="font-bold text-primary"
                        style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                      >
                        −{formatCurrency(estimate.planDiscount)}
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Total */}
              <div className="rounded-xl bg-primary px-4 py-4 flex items-center justify-between">
                <div>
                  <p className="text-primary-foreground/80 text-xs font-medium">
                    {servicePlan !== "none"
                      ? SERVICE_PLAN_LABELS[servicePlan] + " Price"
                      : "One-Time Price"}
                  </p>
                  <p
                    className="text-4xl font-bold text-primary-foreground leading-tight"
                    style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                  >
                    {formatCurrency(estimate.total)}
                  </p>
                </div>
                {estimate.annualValue && (
                  <div className="text-right">
                    <p className="text-primary-foreground/70 text-xs font-medium">Annual Value</p>
                    <p
                      className="text-xl font-bold text-primary-foreground/90"
                      style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                    >
                      {formatCurrency(estimate.annualValue)}
                    </p>
                  </div>
                )}
              </div>

              {/* Tier info */}
              {tier && (
                <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                  <Info size={12} />
                  <span>
                    Priced at the <strong>{tier.label}</strong> tier ({tier.sqftRange})
                  </span>
                </div>
              )}

              {/* Tech pay note */}
              {estimate.total >= 275 && (
                <div className="mt-3 rounded-xl bg-accent px-3 py-2 text-xs text-accent-foreground">
                  <span className="font-semibold">Tech Pay (20%):</span>{" "}
                  {formatCurrency(Math.round(estimate.total * 0.2))} · Target: $125+/hr revenue
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Price Book Reference ── */}
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          <button
            onClick={() => setShowPriceBook(!showPriceBook)}
            className="w-full px-4 py-3 flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <LayoutGrid size={16} className="text-muted-foreground" />
              <span
                className="font-bold text-sm text-foreground"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              >
                Price Book Reference
              </span>
            </div>
            {showPriceBook ? (
              <ChevronUp size={16} className="text-muted-foreground" />
            ) : (
              <ChevronDown size={16} className="text-muted-foreground" />
            )}
          </button>

          {showPriceBook && (
            <div className="px-4 pb-4">
              <div className="overflow-x-auto -mx-1">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-2 font-semibold text-muted-foreground">Tier</th>
                      <th className="text-right py-2 px-1 font-semibold text-muted-foreground">Ext.</th>
                      <th className="text-right py-2 px-1 font-semibold text-muted-foreground">Int.</th>
                      <th className="text-right py-2 px-1 font-semibold text-muted-foreground">Scrn.</th>
                      <th className="text-right py-2 pl-1 font-semibold text-muted-foreground">Trks.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PANE_TIERS.map((t, i) => (
                      <tr
                        key={t.maxPanes}
                        className={`border-b border-border/50 ${
                          currentTierIndex === i ? "bg-accent font-semibold" : ""
                        }`}
                      >
                        <td className="py-2 pr-2 text-foreground font-medium">{t.label}</td>
                        <td
                          className="text-right py-2 px-1 text-foreground"
                          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                        >
                          ${t.exterior}
                        </td>
                        <td
                          className="text-right py-2 px-1 text-foreground"
                          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                        >
                          {t.interior > 0 ? `$${t.interior}` : "—"}
                        </td>
                        <td
                          className="text-right py-2 px-1 text-foreground"
                          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                        >
                          {t.screens > 0 ? `$${t.screens}` : "—"}
                        </td>
                        <td
                          className="text-right py-2 pl-1 text-foreground"
                          style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                        >
                          {t.tracks > 0 ? `$${t.tracks}` : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* French pane rule reminder */}
              <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                <p className="font-semibold mb-1">French Pane Rule</p>
                <p>Count all small divided-light panes → multiply by <strong>×{FRENCH_PANE_MULTIPLIER}</strong> → add to standard pane total.</p>
              </div>

              {/* Plan discounts */}
              <div className="mt-3 rounded-xl bg-accent border border-primary/20 px-3 py-2 text-xs text-accent-foreground">
                <p className="font-semibold mb-1 text-primary">Service Plan Discounts</p>
                <div className="grid grid-cols-2 gap-1">
                  <span>One-Time:</span><span className="font-bold">$0 off</span>
                  <span>Biannual:</span><span className="font-bold text-primary">−$50/visit</span>
                  <span>Quarterly:</span><span className="font-bold text-primary">−$100/visit</span>
                  <span>Monthly:</span><span className="font-bold text-primary">−$150/visit</span>
                </div>
                <p className="mt-1 text-muted-foreground">Minimum charge: $125</p>
              </div>

              <p className="text-xs text-muted-foreground mt-2">
                Custom homes (121+ panes): <strong>$8.00/pane</strong> exterior baseline
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground pb-2">
          Leaf Cleaning · Pricing system by Gatlin McBride
        </p>
      </div>
    </div>
  );
}
