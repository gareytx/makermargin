export type PricingInput = {
  productName: string;
  materialCost: number;
  packagingCost: number;
  otherCost: number;
  wastePercentage: number;
  machineMinutes: number;
  machineHourlyRate: number;
  laborMinutes: number;
  laborHourlyRate: number;
  marketplaceFeePercentage: number;
  processingFeePercentage: number;
  fixedTransactionFee: number;
  shippingCost: number;
  customerPaysShipping: boolean;
  desiredMarginPercentage: number;
};

export type PricingResult = {
  hardCost: number;
  wasteCost: number;
  machineCost: number;
  laborCost: number;
  shippingCostIncluded: number;
  trueBaseCost: number;
  recommendedPrice: number;
  estimatedFees: number;
  netProfit: number;
  profitMarginPercentage: number;
  effectiveHourlyEarnings: number;
};

export type ViabilityResult = {
  score: number;
  label: string;
  summary: string;
  recommendation: string;
};

export function calculatePricing(input: PricingInput): PricingResult {
  const hardCost =
    input.materialCost + input.packagingCost + input.otherCost;

  const wasteCost =
    input.materialCost * (input.wastePercentage / 100);

  const machineCost =
    (input.machineMinutes / 60) * input.machineHourlyRate;

  const laborCost =
    (input.laborMinutes / 60) * input.laborHourlyRate;

  const shippingCostIncluded =
    input.customerPaysShipping ? 0 : input.shippingCost;

  const trueBaseCost =
    hardCost + wasteCost + machineCost + laborCost + shippingCostIncluded;

  const desiredMargin = input.desiredMarginPercentage / 100;

  const percentageFees =
    (input.marketplaceFeePercentage + input.processingFeePercentage) / 100;

  const denominator = 1 - desiredMargin - percentageFees;

  const recommendedPrice =
    denominator > 0
      ? (trueBaseCost + input.fixedTransactionFee) / denominator
      : 0;

  const estimatedFees =
    recommendedPrice * percentageFees + input.fixedTransactionFee;

  const netProfit =
    recommendedPrice - trueBaseCost - estimatedFees;

  const profitMarginPercentage =
    recommendedPrice > 0 ? (netProfit / recommendedPrice) * 100 : 0;

  const totalProductionHours =
    (input.machineMinutes + input.laborMinutes) / 60;

  const effectiveHourlyEarnings =
    totalProductionHours > 0 ? netProfit / totalProductionHours : 0;

  return {
    hardCost,
    wasteCost,
    machineCost,
    laborCost,
    shippingCostIncluded,
    trueBaseCost,
    recommendedPrice,
    estimatedFees,
    netProfit,
    profitMarginPercentage,
    effectiveHourlyEarnings,
  };
}

export function calculateViability(
  input: PricingInput,
  result: PricingResult
): ViabilityResult {
  let score = 0;

  // Profit margin score
  if (result.profitMarginPercentage >= 50) score += 30;
  else if (result.profitMarginPercentage >= 40) score += 25;
  else if (result.profitMarginPercentage >= 30) score += 20;
  else if (result.profitMarginPercentage >= 20) score += 12;
  else score += 4;

  // Hourly earnings score
  if (result.effectiveHourlyEarnings >= 40) score += 30;
  else if (result.effectiveHourlyEarnings >= 30) score += 24;
  else if (result.effectiveHourlyEarnings >= 20) score += 16;
  else if (result.effectiveHourlyEarnings >= 10) score += 8;
  else score += 2;

  // Production time score
  const totalMinutes = input.machineMinutes + input.laborMinutes;

  if (totalMinutes <= 15) score += 20;
  else if (totalMinutes <= 30) score += 16;
  else if (totalMinutes <= 60) score += 12;
  else if (totalMinutes <= 90) score += 7;
  else score += 3;

  // Shipping score
  const shippingRatio =
    result.recommendedPrice > 0
      ? input.shippingCost / result.recommendedPrice
      : 1;

  if (input.customerPaysShipping) score += 20;
  else if (shippingRatio <= 0.1) score += 20;
  else if (shippingRatio <= 0.15) score += 16;
  else if (shippingRatio <= 0.25) score += 10;
  else score += 4;

  let label = "Weak";
  let summary = "This product may not be worth selling at the current numbers.";
  let recommendation =
    "Consider raising the price, reducing time, lowering costs, or selling it only as a premium custom item.";

  if (score >= 85) {
    label = "Excellent";
    summary = "This looks like a strong product with healthy profit potential.";
    recommendation =
      "This is worth testing online, locally, or as part of a product bundle.";
  } else if (score >= 70) {
    label = "Good";
    summary = "This product looks workable, but there may be room to improve.";
    recommendation =
      "Review labor time, batching, shipping, and market price before scaling it.";
  } else if (score >= 50) {
    label = "Caution";
    summary = "This product may work, but the numbers are not especially strong.";
    recommendation =
      "This may be better as a craft show item, add-on product, or higher-priced custom order.";
  }

  return {
    score,
    label,
    summary,
    recommendation,
  };
}

export function currency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isFinite(value) ? value : 0);
}

export function percent(value: number): string {
  return `${(Number.isFinite(value) ? value : 0).toFixed(1)}%`;
}