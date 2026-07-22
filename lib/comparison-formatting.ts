import type { MetricResult, MetricUnit } from "./product-comparison";
import type { ProductComparisonMetrics } from "./product-comparison";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const decimal = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

export function formatComparisonValue(value: number, unit: MetricUnit): string {
  if (!Number.isFinite(value)) return "Unavailable";
  switch (unit) {
    case "currency": return currency.format(value);
    case "percentage": return `${decimal.format(value)}%`;
    case "currency_per_hour": return `${currency.format(value)}/hr`;
    case "units_per_hour": return `${decimal.format(value)}/hr`;
    case "units": return `${Math.round(value)} ${Math.round(value) === 1 ? "unit" : "units"}`;
    case "ratio": return `${decimal.format(value * 100)}%`;
    case "minutes": return formatMinutes(value);
  }
}

export function formatMinutes(value: number): string {
  if (!Number.isFinite(value)) return "Unavailable";
  if (value < 60) return `${decimal.format(value)} min`;
  const hours = Math.floor(value / 60);
  const minutes = Math.round(value % 60);
  return minutes ? `${hours} hr ${minutes} min` : `${hours} hr`;
}

export function formatMetric(metric: MetricResult): string {
  return metric.status === "available" ? formatComparisonValue(metric.value, metric.unit) : "Unavailable";
}

export function utilizationLabel(value: number): string {
  if (value > 1) return "Exceeds the supplied limit";
  if (value >= 0.8) return "Near the supplied limit";
  return "Within the supplied limit";
}

export const comparisonMetricLabels: Record<keyof ProductComparisonMetrics, string> = {
  sellingPrice: "selling price",
  ownerLaborCompensation: "owner labor compensation",
  machineCost: "allocated economic machine cost",
  netBusinessProfit: "net business profit",
  profitMarginPercentage: "profit margin",
  ownerEconomicBenefit: "owner economic benefit",
  totalCashCostPerSale: "total cash cost per standard sale",
  upfrontCashRequiredPerUnit: "upfront cash per sellable product",
  upfrontCashRequiredPerBatch: "upfront cash per representative batch",
  activeLaborMinutesPerBatch: "total hands-on owner labor per representative batch",
  activeLaborMinutesPerSellableProduct: "total hands-on owner labor per sellable product",
  occupiedMachineMinutesPerSellableProduct: "occupied machine time per sellable product",
  totalElapsedMinutesPerBatch: "observed elapsed time per representative batch",
  businessProfitPerLaborHour: "business profit per hands-on owner labor hour",
  ownerEconomicBenefitPerLaborHour: "owner benefit per hands-on owner labor hour",
  businessProfitPerMachineHour: "business profit per occupied machine hour",
  unitsPerLaborHour: "units per hands-on owner labor hour",
  unitsPerMachineHour: "units per occupied machine hour",
  netBusinessProfitPerBatch: "net business profit per representative batch",
  ownerEconomicBenefitPerBatch: "owner economic benefit per representative batch",
  setupLaborMinutesPerSellableProduct: "setup labor per sellable product",
  breakEvenUnits: "break-even sellable products",
};
