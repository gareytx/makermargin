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
  values: PricingInput;
};

export const productPresets: readonly ProductPreset[] = [
  {
    id: "custom",
    label: "Custom product",
    description: "A clean starting point for pricing your own product.",
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
    description: "The original MakerMargin slate coaster starting point.",
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
    description: "A small engraved metal card with simple packaging.",
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
    description: "Starter estimate for a hand-finished journal with purchased inserts.",
    values: {
      productName: "Leather Journal",
      materialCost: 18,
      packagingCost: 3,
      otherCost: 2,
      wastePercentage: 15,
      machineMinutes: 12,
      machineHourlyRate: 7.75,
      laborMinutes: 50,
      laborHourlyRate: 40,
      marketplaceFeePercentage: 10,
      processingFeePercentage: 3,
      fixedTransactionFee: 0.3,
      shippingCost: 8,
      customerPaysShipping: false,
      desiredMarginPercentage: 30,
    },
  },
  {
    id: "cutting-board",
    label: "Cutting board",
    description: "Starter estimate for a personalized hardwood cutting board.",
    values: {
      productName: "Personalized Cutting Board",
      materialCost: 24,
      packagingCost: 6,
      otherCost: 3,
      wastePercentage: 12,
      machineMinutes: 25,
      machineHourlyRate: 7.75,
      laborMinutes: 45,
      laborHourlyRate: 40,
      marketplaceFeePercentage: 10,
      processingFeePercentage: 3,
      fixedTransactionFee: 0.3,
      shippingCost: 14,
      customerPaysShipping: false,
      desiredMarginPercentage: 30,
    },
  },
  {
    id: "digital-print",
    label: "Digital print",
    description: "Starter estimate for a downloadable print with design and listing time.",
    values: {
      productName: "Digital Print",
      materialCost: 0,
      packagingCost: 0,
      otherCost: 1,
      wastePercentage: 0,
      machineMinutes: 0,
      machineHourlyRate: 7.75,
      laborMinutes: 45,
      laborHourlyRate: 40,
      marketplaceFeePercentage: 10,
      processingFeePercentage: 3,
      fixedTransactionFee: 0.3,
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
