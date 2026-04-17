import type { ServiceKey, ServicePlanType } from "@/lib/pricing";

export type UpsellKind = "screens" | "tracks";

export type QuoteStatus = "quoted" | "sold" | "sold_upsell" | "lost";

export type QuoteRecord = {
  id: string;
  createdAt: number;
  panes: number;
  frenchPanes: number;
  frenchEquivalent: number;
  totalPanesForTier: number;
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
  quotedScreenSpecial?: boolean;
  quotedOnSiteScreenUpsell?: boolean;
  upsellKinds?: UpsellKind[];
  planSummary?: string;
  addonsSummary?: string;
};

export type SalesTrackerStats = {
  quotes: number;
  sales: number;
  upsells: number;
  soldRevenueOneTime: number;
  soldAnnualValue: number;
};
