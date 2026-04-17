/**
 * MiNT Window Cleaning Estimator
 * Design: Clean Contractor / Modern Trade App
 * - DM Sans body, Space Grotesk for numbers/headings
 * - MiNT emerald green primary, cool slate background
 * - Sticky live total header, card-stack layout, thumb-friendly
 * - Mobile-first, max-width 480px centered
 */

import { useState, useEffect, useRef, useCallback } from "react";
import {
  PANE_TIERS,
  SERVICE_PLAN_LABELS,
  SERVICE_PLAN_DESCRIPTIONS,
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

export default function Home() {
  const [paneCount, setPaneCount] = useState(0);
  const [selectedServices, setSelectedServices] = useState<Set<ServiceKey>>(
    new Set<ServiceKey>(["exterior"])
  );
  const [servicePlan, setServicePlan] = useState<ServicePlanType>("none");
  const [useScreenSpecial, setUseScreenSpecial] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [totalPulse, setTotalPulse] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const prevTotalRef = useRef(0);

  const estimate = calculateEstimate(
    paneCount,
    selectedServices,
    servicePlan,
    useScreenSpecial
  );

  const tier = getTierForPanes(paneCount);

  // Pulse animation when total changes
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
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const increment = () => setPaneCount((c) => Math.min(c + 1, 200));
  const decrement = () => setPaneCount((c) => Math.max(c - 1, 0));
  const incrementBy = (n: number) => setPaneCount((c) => Math.min(c + n, 200));
  const decrementBy = (n: number) => setPaneCount((c) => Math.max(c - n, 0));

  const reset = () => {
    setPaneCount(0);
    setSelectedServices(new Set<ServiceKey>(["exterior"]));
    setServicePlan("none");
    setUseScreenSpecial(false);
    setShowBreakdown(false);
  };

  const currentTierIndex = tier
    ? PANE_TIERS.findIndex((t) => t.maxPanes === tier.maxPanes)
    : -1;

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
              <p className="text-xs text-muted-foreground font-medium leading-none">MiNT</p>
              <p className="text-sm font-bold text-foreground leading-tight" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
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
            <div
              className={`text-right transition-all duration-200 ${totalPulse ? "total-pulse" : ""}`}
            >
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

        {/* ── Step 1: Pane Count ── */}
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>1</span>
              <h2 className="font-bold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Count the Panes</h2>
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
              <p>Every individual piece of glass = 1 pane. A standard window with a fixed top + sliding bottom = <strong>2 panes</strong>. Count all glass on the house.</p>
            </div>
          )}

          <div className="px-4 py-5">
            {/* Big pane counter */}
            <div className="flex items-center justify-between gap-4 mb-4">
              <button
                onClick={decrement}
                className="pane-btn bg-secondary text-foreground hover:bg-border active:scale-95"
              >
                <Minus size={22} />
              </button>

              <div className="flex-1 text-center">
                <p
                  className="text-6xl font-bold text-foreground leading-none"
                  style={{ fontFamily: "'Space Grotesk', sans-serif" }}
                >
                  {paneCount}
                </p>
                <p className="text-sm text-muted-foreground mt-1 font-medium">panes</p>
              </div>

              <button
                onClick={increment}
                className="pane-btn bg-primary text-primary-foreground hover:bg-primary/90 active:scale-95"
              >
                <Plus size={22} />
              </button>
            </div>

            {/* Quick-add buttons */}
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

            {/* Direct input */}
            <div className="mt-3 flex items-center gap-2">
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
                className="flex-1 h-11 rounded-xl border border-border bg-secondary px-3 text-center text-lg font-bold text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                style={{ fontFamily: "'Space Grotesk', sans-serif" }}
              />
            </div>
          </div>

          {/* Tier indicator */}
          {paneCount > 0 && (
            <div className="px-4 pb-4">
              <div className="rounded-xl bg-accent px-3 py-2 flex items-center justify-between">
                <div>
                  <p className="text-xs text-accent-foreground/70 font-medium">Pricing Tier</p>
                  <p className="text-sm font-bold text-accent-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
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

              {/* Tier progress bar */}
              <div className="mt-3">
                <div className="flex gap-1">
                  {PANE_TIERS.map((t, i) => (
                    <div
                      key={t.maxPanes}
                      className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${
                        i <= currentTierIndex
                          ? "bg-primary"
                          : "bg-border"
                      }`}
                    />
                  ))}
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-muted-foreground">25</span>
                  <span className="text-[10px] text-muted-foreground">40</span>
                  <span className="text-[10px] text-muted-foreground">60</span>
                  <span className="text-[10px] text-muted-foreground">80</span>
                  <span className="text-[10px] text-muted-foreground">100</span>
                  <span className="text-[10px] text-muted-foreground">120+</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Step 2: Services ── */}
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-border flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>2</span>
            <h2 className="font-bold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Select Services</h2>
          </div>

          <div className="p-4 grid grid-cols-2 gap-3">
            {SERVICE_CONFIG.map((svc) => {
              const isSelected = selectedServices.has(svc.key);
              const price = tier
                ? svc.key === "screens" && useScreenSpecial && tier.screenSpecial !== null
                  ? tier.screenSpecial
                  : tier[svc.key as keyof typeof tier] as number
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
                  <p className={`font-bold text-sm ${isSelected ? "text-primary" : "text-foreground"}`} style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                    {svc.label}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">{svc.description}</p>
                  {price !== null && price > 0 && !isUnavailable && (
                    <p className={`text-sm font-bold mt-2 ${isSelected ? "text-primary" : "text-muted-foreground"}`} style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
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

          {/* Screen Special toggle */}
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

        {/* ── Step 3: Service Plan ── */}
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-3 border-b border-border flex items-center gap-2">
            <span className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-bold flex items-center justify-center" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>3</span>
            <h2 className="font-bold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Service Plan</h2>
            <span className="ml-auto text-xs font-semibold text-primary bg-accent px-2 py-0.5 rounded-full">Save $100</span>
          </div>

          <div className="p-4 space-y-2">
            {(["none", "quarterly", "biannual"] as ServicePlanType[]).map((plan) => {
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
                    <p className={`font-bold text-sm ${isSelected ? "text-primary" : "text-foreground"}`} style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                      {SERVICE_PLAN_LABELS[plan]}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {SERVICE_PLAN_DESCRIPTIONS[plan]}
                    </p>
                  </div>
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${isSelected ? "border-primary bg-primary" : "border-border"}`}>
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
              <h2 className="font-bold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Quote Summary</h2>
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
                  {estimate.breakdown.map((item, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">{item.label}</span>
                      <span className="font-semibold text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
                        {formatCurrency(item.price)}
                      </span>
                    </div>
                  ))}
                  {estimate.planDiscount > 0 && (
                    <div className="flex items-center justify-between text-sm border-t border-border pt-2">
                      <span className="text-primary font-medium">Service Plan Discount</span>
                      <span className="font-bold text-primary" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
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
                    {servicePlan !== "none" ? SERVICE_PLAN_LABELS[servicePlan] + " Price" : "One-Time Price"}
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
                    {estimate.isCustom ? " — custom rate applied" : ""}
                  </span>
                </div>
              )}

              {/* Profitability note */}
              {estimate.total >= 275 && (
                <div className="mt-3 rounded-xl bg-accent px-3 py-2 text-xs text-accent-foreground">
                  <span className="font-semibold">Tech Pay (20% commission):</span>{" "}
                  {formatCurrency(Math.round(estimate.total * 0.20))} · Target revenue/hr: $125+
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Quick Reference ── */}
        <div className="bg-white rounded-2xl border border-border shadow-sm overflow-hidden">
          <button
            onClick={() => setShowBreakdown(!showBreakdown)}
            className="w-full px-4 py-3 flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <ClipboardList size={16} className="text-muted-foreground" />
              <span className="font-bold text-sm text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>Price Book Reference</span>
            </div>
            {showBreakdown ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
          </button>

          {showBreakdown && (
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
                        <td className="text-right py-2 px-1 text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>${t.exterior}</td>
                        <td className="text-right py-2 px-1 text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{t.interior > 0 ? `$${t.interior}` : "—"}</td>
                        <td className="text-right py-2 px-1 text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{t.screens > 0 ? `$${t.screens}` : "—"}</td>
                        <td className="text-right py-2 pl-1 text-foreground" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>{t.tracks > 0 ? `$${t.tracks}` : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Custom homes (120+ panes): <strong>$8/pane</strong> exterior baseline
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-muted-foreground pb-2">
          MiNT Window Cleaning · Pricing based on Gatlin McBride's system
        </p>
      </div>
    </div>
  );
}
