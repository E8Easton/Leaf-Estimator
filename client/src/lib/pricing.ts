// ============================================================
// Leaf Cleaning — Master Pricing Engine
// Based on Gatlin McBride's pricing system (5 videos)
// Sources:
//   [1] https://www.youtube.com/watch?v=mDvNqrZPM0Q
//   [2] https://www.youtube.com/watch?v=YMj1qQf7qBQ
//   [3] https://www.youtube.com/watch?v=SpDOvluhPNQ
//   [4] https://www.youtube.com/watch?v=fAJjxpqH-h4  ← French pane rule
//   [5] https://www.youtube.com/watch?v=NeC265l3DWw
// ============================================================

export interface PaneTier {
  label: string;
  maxPanes: number;
  sqftRange: string;
  exterior: number;
  interior: number;
  screens: number;
  /** Full-house track detailing; 0 = custom quote (not auto-priced here). */
  tracks: number;
  screenSpecial: number | null;
}

// Track Detailing (FULL HOUSE) — upsell with exterior only (not standalone).
// ≤25 $100 | ≤40 $240 | ≤60 $320 | ≤80 $400 | ≤100 $480 | 101–120 & 121+ → custom quote (no auto price here).
export const PANE_TIERS: PaneTier[] = [
  {
    label: "Up to 25 Panes",
    maxPanes: 25,
    sqftRange: "0 – 2,499 SqFt",
    exterior: 275,
    interior: 100,
    screens: 50,
    tracks: 100,
    screenSpecial: 25,
  },
  {
    label: "Up to 40 Panes",
    maxPanes: 40,
    sqftRange: "2,500 – 3,499 SqFt",
    exterior: 345,
    interior: 160,
    screens: 80,
    tracks: 240,
    screenSpecial: null,
  },
  {
    label: "Up to 60 Panes",
    maxPanes: 60,
    sqftRange: "3,500 – 4,999 SqFt",
    exterior: 495,
    interior: 320,
    screens: 150,
    tracks: 320,
    screenSpecial: 25,
  },
  {
    label: "Up to 80 Panes",
    maxPanes: 80,
    sqftRange: "5,000 – 6,499 SqFt",
    exterior: 595,
    interior: 400,
    screens: 200,
    tracks: 400,
    screenSpecial: 25,
  },
  {
    label: "Up to 100 Panes",
    maxPanes: 100,
    sqftRange: "6,500 – 7,999 SqFt",
    exterior: 695,
    interior: 480,
    screens: 240,
    tracks: 480,
    screenSpecial: 25,
  },
  {
    label: "Up to 120 Panes",
    maxPanes: 120,
    sqftRange: "8,000 – 9,999 SqFt",
    exterior: 895,
    interior: 0,
    screens: 0,
    /** 101–120 panes: full-house tracks are custom (quote in office). */
    tracks: 0,
    screenSpecial: null,
  },
];

export const CUSTOM_PRICE_PER_PANE = 8; // $8/pane for 121+ pane homes [3]

export type ServiceKey = "exterior" | "interior" | "screens" | "tracks" | "screenSpecial";

// Service plan discount structure from [2]
export type ServicePlanType = "none" | "monthly" | "quarterly" | "biannual";

export const SERVICE_PLAN_DISCOUNT: Record<ServicePlanType, number> = {
  none: 0,
  biannual: 50,    // $50 off per visit [2]
  quarterly: 100,  // $100 off per visit [2]
  monthly: 150,    // $150 off per visit [2]
};

// Compatibility alias (older UI naming)
export const SERVICE_PLAN_DISCOUNTS = SERVICE_PLAN_DISCOUNT;

export const SERVICE_PLAN_LABELS: Record<ServicePlanType, string> = {
  none: "One-Time",
  biannual: "Biannual Plan",
  quarterly: "Quarterly Plan",
  monthly: "Monthly Plan",
};

export const SERVICE_PLAN_DESCRIPTIONS: Record<ServicePlanType, string> = {
  none: "Single visit, no commitment",
  biannual: "Every 6 months — save $50 each visit",
  quarterly: "Every 3 months — save $100 each visit",
  monthly: "Every month — save $150 each visit",
};

export const SERVICE_PLAN_VISITS: Record<ServicePlanType, number> = {
  none: 1,
  biannual: 2,
  quarterly: 4,
  monthly: 12,
};

export interface PlanPerks {
  leafRainblock: boolean;
  rainGuarantee: boolean;
  hardWaterRemoval: boolean;
  leafTech: boolean;
}

// Used by the UI to show “included perks”.
export const SERVICE_PLAN_PERKS: Record<ServicePlanType, PlanPerks> = {
  none: {
    leafRainblock: false,
    rainGuarantee: false,
    hardWaterRemoval: false,
    leafTech: false,
  },
  monthly: {
    leafRainblock: true,
    rainGuarantee: true,
    hardWaterRemoval: true,
    leafTech: true,
  },
  quarterly: {
    leafRainblock: true,
    rainGuarantee: true,
    hardWaterRemoval: true,
    leafTech: true,
  },
  biannual: {
    leafRainblock: false,
    rainGuarantee: false,
    hardWaterRemoval: false,
    leafTech: false,
  },
};

// French pane multiplier — from video [4]
// Count all small French/divided-light panes, then multiply by 0.4
// to get the equivalent standard pane count for pricing
export const FRENCH_PANE_MULTIPLIER = 0.4;

export function frenchPanesToStandard(frenchPaneCount: number): number {
  return Math.ceil(frenchPaneCount * FRENCH_PANE_MULTIPLIER);
}

export const MINIMUM_CHARGE = 125; // Absolute floor [1]

export interface EstimateResult {
  tier: PaneTier | null;
  isCustom: boolean;
  subtotal: number;
  planDiscount: number;
  total: number;
  annualValue: number | null;
  breakdown: { label: string; price: number }[];
}

export function getTierForPanes(paneCount: number): PaneTier | null {
  if (paneCount <= 0) return null;
  const tier = PANE_TIERS.find((t) => paneCount <= t.maxPanes);
  return tier ?? null;
}

export function calculateEstimate(
  standardPanes: number,
  frenchPanes: number,
  selectedServices: Set<ServiceKey>,
  servicePlan: ServicePlanType,
  useScreenSpecial: boolean,
  opts: {
    onSiteScreenUpsell?: boolean;
  } = {}
): EstimateResult {
  const frenchEquivalent = frenchPanesToStandard(frenchPanes);
  const totalPanes = standardPanes + frenchEquivalent;

  if (totalPanes <= 0) {
    return {
      tier: null,
      isCustom: false,
      subtotal: 0,
      planDiscount: 0,
      total: 0,
      annualValue: null,
      breakdown: [],
    };
  }

  const tier = getTierForPanes(totalPanes);
  const isCustom = tier === null;
  const breakdown: { label: string; price: number }[] = [];
  let subtotal = 0;

  // Interior is never quoted standalone per quoting guide.
  const hasExterior = selectedServices.has("exterior");
  const hasInterior = selectedServices.has("interior");
  const effectiveHasInterior = hasInterior && hasExterior;

  if (isCustom) {
    if (hasExterior) {
      const price = totalPanes * CUSTOM_PRICE_PER_PANE;
      breakdown.push({ label: `Exterior (${totalPanes} panes × $${CUSTOM_PRICE_PER_PANE})`, price });
      subtotal += price;
    }
    if (effectiveHasInterior) {
      const price = Math.round(totalPanes * CUSTOM_PRICE_PER_PANE * 0.5);
      breakdown.push({ label: `Interior (${totalPanes} panes × $${CUSTOM_PRICE_PER_PANE * 0.5})`, price });
      subtotal += price;
    }
    if (selectedServices.has("screens")) {
      const price = Math.round(totalPanes * 2.5);
      breakdown.push({ label: `Screen Cleaning (est.)`, price });
      subtotal += price;
    }
    // Tracks: upsell with exterior only; 121+ full-house tracks = custom quote (no auto price).
    if (hasExterior && selectedServices.has("tracks")) {
      breakdown.push({
        label: "Track Detailing (FULL HOUSE — custom quote)",
        price: 0,
      });
    }
  } else {
    if (hasExterior) {
      breakdown.push({ label: "Exterior Window Cleaning", price: tier!.exterior });
      subtotal += tier!.exterior;
    }
    if (effectiveHasInterior) {
      breakdown.push({ label: "Interior Window Cleaning", price: tier!.interior });
      subtotal += tier!.interior;
    }
    if (selectedServices.has("screens")) {
      const onSite = !!opts.onSiteScreenUpsell;
      const hasSpecial = useScreenSpecial && tier!.screenSpecial !== null;
      // On-site $60 applies from 26+ panes tier up; first tier (≤25) stays tier screen price ($50).
      const firstTier = tier!.maxPanes === 25;
      const screenPrice =
        onSite && !firstTier ? 60 : hasSpecial ? tier!.screenSpecial! : tier!.screens;
      const screenLabel =
        onSite && !firstTier
          ? "Screen Cleaning (ON-SITE UPSALE)"
          : onSite && firstTier
            ? "Screen Cleaning"
            : hasSpecial
              ? "Screen Cleaning (SPECIAL $25)"
              : "Screen Cleaning";
      breakdown.push({ label: screenLabel, price: screenPrice });
      subtotal += screenPrice;
    }
    if (hasExterior && selectedServices.has("tracks")) {
      const trackPrice = tier!.tracks;
      breakdown.push({
        label:
          trackPrice === 0
            ? "Track Detailing (FULL HOUSE — custom quote)"
            : "Track Detailing (FULL HOUSE)",
        price: trackPrice,
      });
      subtotal += trackPrice;
    }
  }

  const planDiscount = SERVICE_PLAN_DISCOUNT[servicePlan];
  const total = Math.max(subtotal - planDiscount, MINIMUM_CHARGE);

  const visits = SERVICE_PLAN_VISITS[servicePlan];
  const annualValue = visits > 1 ? total * visits : null;

  return {
    tier: tier ?? null,
    isCustom,
    subtotal,
    planDiscount,
    total,
    annualValue,
    breakdown,
  };
}

// ── Christmas Lights (per linear foot) ──────────────────────────────────────

export type ChristmasLightType = "classic" | "smart" | "permanent";

export interface ChristmasLightOption {
  key: ChristmasLightType;
  label: string;
  description: string;
  laborPerFt: number;
  materialsPerFt: number;
  totalPerFt: number;
}

export const CHRISTMAS_LIGHT_OPTIONS: ChristmasLightOption[] = [
  {
    key: "classic",
    label: "Classic Installation",
    description: "Takedown, storage & 3-year material warranty included",
    laborPerFt: 6,
    materialsPerFt: 2,
    totalPerFt: 8,
  },
  {
    key: "smart",
    label: "Seasonal SMART Lights",
    description: "GOVEE app-controlled — takedown & storage included",
    laborPerFt: 8,
    materialsPerFt: 5,
    totalPerFt: 13,
  },
  {
    key: "permanent",
    label: "Permanent Lights",
    description: "Year-round install, subcontracted — takedown & storage included",
    laborPerFt: 20,
    materialsPerFt: 8,
    totalPerFt: 28,
  },
];

export const GOVEE_PANEL_PRICE = 599;

export function calculateChristmasEstimate(
  linearFeet: number,
  lightType: ChristmasLightType,
  addGoveePanel: boolean,
  plan: ServicePlanType
): EstimateResult {
  if (linearFeet <= 0) {
    return {
      tier: null,
      isCustom: false,
      subtotal: 0,
      planDiscount: 0,
      total: 0,
      annualValue: null,
      breakdown: [],
    };
  }

  const opt = CHRISTMAS_LIGHT_OPTIONS.find((o) => o.key === lightType);
  if (!opt) {
    throw new Error(`Unknown ChristmasLightType: ${lightType}`);
  }

  const breakdown: EstimateResult["breakdown"] = [];
  const labor = linearFeet * opt.laborPerFt;
  const materials = linearFeet * opt.materialsPerFt;
  breakdown.push({ label: `Labor (${linearFeet} ln. ft. × $${opt.laborPerFt})`, price: labor });
  breakdown.push({ label: `Materials (${linearFeet} ln. ft. × $${opt.materialsPerFt})`, price: materials });

  let subtotal = labor + materials;
  if (addGoveePanel && lightType === "smart") {
    breakdown.push({ label: "GOVEE SMART Control Panel", price: GOVEE_PANEL_PRICE });
    subtotal += GOVEE_PANEL_PRICE;
  }

  const planDiscount = SERVICE_PLAN_DISCOUNT[plan];
  const total = Math.max(subtotal - planDiscount, 0);

  return {
    tier: null,
    isCustom: false,
    subtotal,
    planDiscount,
    total,
    annualValue: null,
    breakdown,
  };
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
