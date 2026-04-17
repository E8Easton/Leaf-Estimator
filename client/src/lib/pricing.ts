// ============================================================
// MiNT Window Cleaning — Pricing Engine
// Based on Gatlin McBride's pricing system (pane-range model)
// Sources:
//   https://www.youtube.com/watch?v=SpDOvluhPNQ
//   https://www.youtube.com/watch?v=mDvNqrZPM0Q
// ============================================================

export interface PaneTier {
  label: string;
  maxPanes: number;
  sqftRange: string;
  exterior: number;
  interior: number;
  screens: number;
  tracks: number;
  screenSpecial: number | null; // $25 promo, null if not available
}

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
    exterior: 315,
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
    interior: 0, // custom
    screens: 0, // custom
    tracks: 0, // custom
    screenSpecial: null,
  },
];

export const CUSTOM_PRICE_PER_PANE = 8; // $8/pane for 120+ pane homes

export type ServiceKey = "exterior" | "interior" | "screens" | "tracks" | "screenSpecial";

export type ServicePlanType = "none" | "quarterly" | "biannual";

export const SERVICE_PLAN_DISCOUNT = 100; // $100 off per service

export const SERVICE_PLAN_LABELS: Record<ServicePlanType, string> = {
  none: "One-Time",
  quarterly: "Quarterly Plan",
  biannual: "Biannual Plan",
};

export const SERVICE_PLAN_DESCRIPTIONS: Record<ServicePlanType, string> = {
  none: "Single visit, no commitment",
  quarterly: "Every 3 months — $100 off each visit",
  biannual: "Every 6 months — $100 off each visit",
};

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
  // Find the lowest tier whose maxPanes >= paneCount
  const tier = PANE_TIERS.find((t) => paneCount <= t.maxPanes);
  return tier ?? null; // null means 120+ panes (custom)
}

export function calculateEstimate(
  paneCount: number,
  selectedServices: Set<ServiceKey>,
  servicePlan: ServicePlanType,
  useScreenSpecial: boolean
): EstimateResult {
  if (paneCount <= 0) {
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

  const tier = getTierForPanes(paneCount);
  const isCustom = tier === null;
  const breakdown: { label: string; price: number }[] = [];
  let subtotal = 0;

  if (isCustom) {
    // Custom pricing: $8/pane for exterior
    if (selectedServices.has("exterior")) {
      const price = paneCount * CUSTOM_PRICE_PER_PANE;
      breakdown.push({ label: `Exterior (${paneCount} panes × $${CUSTOM_PRICE_PER_PANE})`, price });
      subtotal += price;
    }
    if (selectedServices.has("interior")) {
      const price = Math.round(paneCount * CUSTOM_PRICE_PER_PANE * 0.5);
      breakdown.push({ label: `Interior (${paneCount} panes × $${CUSTOM_PRICE_PER_PANE * 0.5})`, price });
      subtotal += price;
    }
    if (selectedServices.has("screens")) {
      const price = Math.round(paneCount * 2.5);
      breakdown.push({ label: `Screen Cleaning (est.)`, price });
      subtotal += price;
    }
    if (selectedServices.has("tracks")) {
      const price = Math.round(paneCount * 4);
      breakdown.push({ label: `Track Detailing (est.)`, price });
      subtotal += price;
    }
  } else {
    if (selectedServices.has("exterior")) {
      breakdown.push({ label: "Exterior Window Cleaning", price: tier!.exterior });
      subtotal += tier!.exterior;
    }
    if (selectedServices.has("interior")) {
      breakdown.push({ label: "Interior Window Cleaning", price: tier!.interior });
      subtotal += tier!.interior;
    }
    if (selectedServices.has("screens")) {
      const screenPrice = useScreenSpecial && tier!.screenSpecial !== null
        ? tier!.screenSpecial
        : tier!.screens;
      const screenLabel = useScreenSpecial && tier!.screenSpecial !== null
        ? "Screen Cleaning (SPECIAL)"
        : "Screen Cleaning";
      breakdown.push({ label: screenLabel, price: screenPrice });
      subtotal += screenPrice;
    }
    if (selectedServices.has("tracks")) {
      breakdown.push({ label: "Track Detailing", price: tier!.tracks });
      subtotal += tier!.tracks;
    }
  }

  // Service plan discount
  const planDiscount = servicePlan !== "none" ? SERVICE_PLAN_DISCOUNT : 0;
  const total = Math.max(subtotal - planDiscount, 125); // $125 absolute floor

  // Annual value calculation
  let annualValue: number | null = null;
  if (servicePlan === "quarterly") annualValue = total * 4;
  if (servicePlan === "biannual") annualValue = total * 2;

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

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
