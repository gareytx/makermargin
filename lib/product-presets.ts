import type { PricingInput } from "./calculations";

export type ProductPresetId =
  | "custom"
  | "slate-coasters"
  | "metal-wallet-card"
  | "leather-journal"
  | "cutting-board"
  | "digital-print";

export type ProductPreset = {
  id: ProductPresetId;
  label: string;
  description: string;
  assumptionType:
    | "verified-supplier"
    | "business-baseline"
    | "amortized-estimate"
    | "template";
  lastReviewed: string;
  assumptionNotes: string[];
  sourceLabel?: string;
  values: PricingInput;
};

export const productPresets: readonly ProductPreset[] = [
  {
    id: "custom",
    label: "Custom product",
    description: "A blank custom template with sample values that must all be replaced.",
    assumptionType: "template",
    lastReviewed: "2026-07-14",
    assumptionNotes: [
      "Every value is a placeholder, not an industry average or verified cost.",
      "Replace all costs, rates, fees, percentages, and production times before using the result.",
    ],
    values: {
      productName: "Custom Product",
      materialCost: 5,
      packagingCost: 1,
      otherCost: 0,
      wastePercentage: 5,
      machineMinutes: 0,
      machineHourlyRate: 7.75,
      laborMinutes: 30,
      laborHourlyRate: 40,
      marketplaceFeePercentage: 10,
      processingFeePercentage: 3,
      fixedTransactionFee: 0.3,
      shippingCost: 5,
      customerPaysShipping: false,
      desiredMarginPercentage: 30,
    },
  },
  {
    id: "slate-coasters",
    label: "4-piece slate coaster set",
    description: "The original MakerMargin slate coaster operating baseline.",
    assumptionType: "business-baseline",
    lastReviewed: "2026-07-14",
    sourceLabel: "Maker documented operating costs",
    assumptionNotes: [
      "Values reflect the maker's documented material, production, fee, and shipping costs.",
      "Replace the baseline with your own supplier prices, workflow times, and selling fees.",
    ],
    values: {
      productName: "4-Piece Slate Coaster Set",
      materialCost: 5.5,
      packagingCost: 2.25,
      otherCost: 1,
      wastePercentage: 10,
      machineMinutes: 62,
      machineHourlyRate: 7.75,
      laborMinutes: 20,
      laborHourlyRate: 40,
      marketplaceFeePercentage: 10,
      processingFeePercentage: 3,
      fixedTransactionFee: 0.3,
      shippingCost: 7.25,
      customerPaysShipping: false,
      desiredMarginPercentage: 30,
    },
  },
  {
    id: "metal-wallet-card",
    label: "Metal wallet card",
    description: "The maker's documented baseline for a small engraved metal card.",
    assumptionType: "business-baseline",
    lastReviewed: "2026-07-14",
    sourceLabel: "Maker documented operating costs",
    assumptionNotes: [
      "Values reflect the maker's documented material, production, fee, and fulfillment costs.",
      "Production time and costs remain editable for each maker's equipment and workflow.",
    ],
    values: {
      productName: "Metal Wallet Card",
      materialCost: 0.5,
      packagingCost: 0.5,
      otherCost: 0,
      wastePercentage: 5,
      machineMinutes: 1,
      machineHourlyRate: 7.75,
      laborMinutes: 10,
      laborHourlyRate: 40,
      marketplaceFeePercentage: 10,
      processingFeePercentage: 3,
      fixedTransactionFee: 0.3,
      shippingCost: 0,
      customerPaysShipping: true,
      desiredMarginPercentage: 30,
    },
  },
  {
    id: "leather-journal",
    label: "Leather journal",
    description: "Supplier-backed blank cost with editable production and fulfillment estimates.",
    assumptionType: "verified-supplier",
    lastReviewed: "2026-07-14",
    sourceLabel: "MakerFlo Laserette Journal",
    assumptionNotes: [
      "The $11.95 material cost is the current single-unit supplier price.",
      "Case and bulk purchasing may reduce the blank cost.",
      "The blank includes gift-ready product packaging.",
      "The $1.50 packaging value represents an estimated outbound mailer and protective material.",
      "Machine time, labor time, and shipping remain editable production estimates.",
    ],
    values: {
      productName: "Engraved Leatherette Journal",
      materialCost: 11.95,
      packagingCost: 1.5,
      otherCost: 0.5,
      wastePercentage: 5,
      machineMinutes: 6,
      machineHourlyRate: 7.75,
      laborMinutes: 12,
      laborHourlyRate: 40,
      marketplaceFeePercentage: 6.5,
      processingFeePercentage: 3,
      fixedTransactionFee: 0.45,
      shippingCost: 6.5,
      customerPaysShipping: false,
      desiredMarginPercentage: 30,
    },
  },
  {
    id: "cutting-board",
    label: "Cutting board",
    description: "Supplier-backed premium blank cost with editable production estimates.",
    assumptionType: "verified-supplier",
    lastReviewed: "2026-07-14",
    sourceLabel: "MakerFlo Premium Marble and Wood Cutting Board",
    assumptionNotes: [
      "The $23.95 material cost represents a current premium single-unit blank.",
      "Case and bulk costs may be lower.",
      "Packaging, production time, and shipping are conservative editable estimates.",
      "Makers using a less expensive wood blank should replace the material cost.",
    ],
    values: {
      productName: "Engraved Premium Cutting Board",
      materialCost: 23.95,
      packagingCost: 3.5,
      otherCost: 1,
      wastePercentage: 5,
      machineMinutes: 20,
      machineHourlyRate: 7.75,
      laborMinutes: 15,
      laborHourlyRate: 40,
      marketplaceFeePercentage: 6.5,
      processingFeePercentage: 3,
      fixedTransactionFee: 0.45,
      shippingCost: 12,
      customerPaysShipping: false,
      desiredMarginPercentage: 30,
    },
  },
  {
    id: "digital-print",
    label: "Digital print",
    description: "An amortized labor and Etsy US fee estimate for a digital download.",
    assumptionType: "amortized-estimate",
    lastReviewed: "2026-07-14",
    sourceLabel: "Etsy US fee baseline",
    assumptionNotes: [
      "The labor value allocates 45 minutes of creation work across 10 expected sales.",
      "Actual allocated labor equals total creation and listing time divided by expected sales.",
      "The fixed fee combines a $0.20 listing fee and the $0.25 US Etsy Payments flat fee.",
      "The percentage fees use a 6.5% Etsy transaction fee and 3% US payment-processing fee.",
      "Offsite Ads and optional advertising expenses are not included.",
      "Digital-product profitability depends heavily on the number of sales over which creation labor is spread.",
    ],
    values: {
      productName: "Digital Art Download",
      materialCost: 0,
      packagingCost: 0,
      otherCost: 0,
      wastePercentage: 0,
      machineMinutes: 0,
      machineHourlyRate: 7.75,
      laborMinutes: 5,
      laborHourlyRate: 40,
      marketplaceFeePercentage: 6.5,
      processingFeePercentage: 3,
      fixedTransactionFee: 0.45,
      shippingCost: 0,
      customerPaysShipping: true,
      desiredMarginPercentage: 30,
    },
  },
];

export function getProductPreset(id: ProductPresetId): ProductPreset {
  const preset = productPresets.find((candidate) => candidate.id === id);
  if (!preset) throw new Error(`Unknown product preset: ${id}`);
  return preset;
}
