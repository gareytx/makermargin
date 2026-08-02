import {
  deriveActiveLaborMinutesPerBatch,
  deriveActiveLaborMinutesPerUnit,
  deriveOccupiedMachineMinutesPerUnit,
  deriveUpfrontCashRequiredPerBatch,
  type CashProfileV1,
  type ProductionProfileV1,
} from "./product-profiles";
import {
  CURRENT_CALCULATION_SNAPSHOT_VERSION,
  CURRENT_FORMULA_VERSION,
  CURRENT_PRICING_INPUT_SNAPSHOT_VERSION,
  PRICING_INPUT_SNAPSHOT_VERSION_V1,
} from "./saved-product-snapshots";
import type { SavedProduct } from "./saved-products";

export const COMPARISON_ENGINE_VERSION = "comparison-v1" as const;
export const RANKING_TOLERANCE = 1e-9;
export const BOTTLENECK_NEAR_TIE_TOLERANCE = 0.05;
export const LABOR_PROFILE_TOLERANCE_MINUTES = 0.01;

export const COMPARISON_COMPATIBILITY_MATRIX = {
  "pricing-input-v1": {
    "pricing-v1": {
      "calculation-snapshot-v1": { corePricing: true, ownerEconomicBenefit: true, productionProfile: false, cashProfile: false },
    },
  },
  "pricing-input-v2": {
    "pricing-v1": {
      "calculation-snapshot-v1": { corePricing: true, ownerEconomicBenefit: true, productionProfile: true, cashProfile: true },
    },
  },
} as const;

export type MetricUnit =
  | "currency"
  | "percentage"
  | "minutes"
  | "currency_per_hour"
  | "units_per_hour"
  | "units"
  | "ratio";

export type UnavailableReasonCode =
  | "unsupported_snapshot"
  | "unsupported_formula_version"
  | "incompatible_metric_definition"
  | "missing_production_profile"
  | "missing_cash_profile"
  | "missing_units_per_batch"
  | "missing_active_labor"
  | "zero_active_labor"
  | "missing_machine_time"
  | "zero_machine_time"
  | "missing_elapsed_time"
  | "missing_cash_cost"
  | "missing_upfront_cash"
  | "missing_fixed_launch_cost"
  | "nonpositive_contribution_margin"
  | "missing_capacity"
  | "machine_capacity_not_found"
  | "labor_profile_mismatch"
  | "impossible_elapsed_time"
  | "insufficient_comparable_products";

export type AvailableMetric = {
  status: "available";
  value: number;
  unit: MetricUnit;
  source: string;
};

export type UnavailableMetric = {
  status: "unavailable";
  reason: {
    code: UnavailableReasonCode;
    message: string;
    missingFields?: string[];
  };
};

export type MetricResult = AvailableMetric | UnavailableMetric;

export type ProductComparisonMetrics = {
  sellingPrice: MetricResult;
  ownerLaborCompensation: MetricResult;
  machineCost: MetricResult;
  netBusinessProfit: MetricResult;
  profitMarginPercentage: MetricResult;
  ownerEconomicBenefit: MetricResult;
  totalCashCostPerSale: MetricResult;
  upfrontCashRequiredPerUnit: MetricResult;
  upfrontCashRequiredPerBatch: MetricResult;
  activeLaborMinutesPerBatch: MetricResult;
  activeLaborMinutesPerSellableProduct: MetricResult;
  occupiedMachineMinutesPerSellableProduct: MetricResult;
  totalElapsedMinutesPerBatch: MetricResult;
  businessProfitPerLaborHour: MetricResult;
  ownerEconomicBenefitPerLaborHour: MetricResult;
  businessProfitPerMachineHour: MetricResult;
  unitsPerLaborHour: MetricResult;
  unitsPerMachineHour: MetricResult;
  netBusinessProfitPerBatch: MetricResult;
  ownerEconomicBenefitPerBatch: MetricResult;
  setupLaborMinutesPerSellableProduct: MetricResult;
  breakEvenUnits: MetricResult;
};

export type ProductComparisonResult = {
  productId: string;
  productName: string;
  metrics: ProductComparisonMetrics;
};

export type TrustedMachineProjection = {
  key: string;
  label: string;
  occupiedMinutesPerBatch: number;
};

export type TrustedProductProjection = {
  productId: string;
  productName: string;
  metrics: ProductComparisonMetrics;
  compatibilityWarnings: CompatibilityWarning[];
  profile: {
    unitsPerBatch?: number;
    fixedUpfrontCashCostPerBatch?: number;
    machine?: TrustedMachineProjection;
    machineFree: boolean;
  };
  provenance: {
    pricingInputSnapshotVersion: string | null;
    calculationSnapshotVersion: string | null;
    formulaVersion: string;
    productionProfileVersion: string | null;
    cashProfileVersion: string | null;
    machineInterpretation: "represented" | "legacy_absent_machine" | "unavailable";
    machineInterpretationSource: string;
  };
};

export type ComparisonConstraints = {
  availableLaborMinutes?: number;
  availableMachineMinutesByKey?: Readonly<Record<string, number>>;
  workingCapitalCeiling?: number;
};

export type ComparisonRequest = {
  products: readonly SavedProduct[];
  constraints?: ComparisonConstraints;
  generatedAt: string;
};

export type CompatibilityWarning = {
  productId: string;
  code: "unsupported_input_snapshot" | "unsupported_calculation_snapshot" | "unsupported_formula_version" | "historical_profile_unavailable" |
    "labor_profile_mismatch" | "impossible_elapsed_time";
  message: string;
};

export type LeaderCategory =
  | "highestProfitPerUnit"
  | "highestProfitMargin"
  | "highestOwnerBenefitPerLaborHour"
  | "highestBusinessProfitPerMachineHour"
  | "lowestUpfrontCashRequirement"
  | "fastestActiveProduction";

export type AvailableLeader = {
  status: "available";
  productIds: string[];
  value: number;
  unit: MetricUnit;
  direction: "highest" | "lowest";
};

export type LeaderResult = AvailableLeader | UnavailableMetric;
export type CategoryLeaderResults = Record<LeaderCategory, LeaderResult>;

export type BatchSubleaderKey =
  | "highestProfitPerRepresentativeBatch"
  | "highestOwnerBenefitPerLaborHour"
  | "lowestUpfrontCashPerRepresentativeBatch"
  | "lowestSetupLaborPerSellableProduct";

export type BatchEconomicsResult = {
  status: "dominant" | "mixed" | "unavailable";
  dominantProductIds?: string[];
  subleaders: Record<BatchSubleaderKey, LeaderResult>;
  explanation: string;
};

export type BottleneckResource = "labor" | "machine" | "working_capital";
export type ResourceUtilization = AvailableMetric | UnavailableMetric;
export type AvailableResourceCapacity = {
  status: "available";
  maxCompleteBatches: number | null;
  maxSellableProducts: number | null;
  nonLimiting: boolean;
  source: string;
};
export type ResourceCapacity = AvailableResourceCapacity | UnavailableMetric;

export type BottleneckResult = {
  status: "available" | "unavailable";
  utilizations: Record<BottleneckResource, ResourceUtilization>;
  capacities: Record<BottleneckResource, ResourceCapacity>;
  primaryResources: BottleneckResource[];
  nearTiedResources: BottleneckResource[];
  reason?: UnavailableMetric["reason"];
};

export type ProductComparisonOutput = {
  engineVersion: typeof COMPARISON_ENGINE_VERSION;
  generatedAt: string;
  products: ProductComparisonResult[];
  categoryLeaders: CategoryLeaderResults;
  batchEconomics: BatchEconomicsResult;
  bottlenecksByProduct: Record<string, BottleneckResult>;
  compatibilityWarnings: CompatibilityWarning[];
  explanation: string[];
};

const unavailable = (
  code: UnavailableReasonCode,
  message: string,
  missingFields?: string[]
): UnavailableMetric => ({ status: "unavailable", reason: { code, message, ...(missingFields?.length ? { missingFields } : {}) } });

const available = (value: number, unit: MetricUnit, source: string): MetricResult =>
  Number.isFinite(value)
    ? { status: "available", value, unit, source }
    : unavailable("incompatible_metric_definition", "The metric did not produce a finite value.");

const missingProfileMetric = (kind: "production" | "cash") => unavailable(
  kind === "production" ? "missing_production_profile" : "missing_cash_profile",
  `A supported ${kind} profile is required for this metric.`
);

function metricFromDerived(
  derived: ReturnType<typeof deriveActiveLaborMinutesPerBatch>,
  unit: MetricUnit,
  source: string,
  code: UnavailableReasonCode
): MetricResult {
  return derived.available
    ? available(derived.value, unit, source)
    : unavailable(code, derived.reason, [derived.missingField]);
}

function divideMetric(
  numerator: MetricResult,
  denominator: MetricResult,
  multiplier: number,
  unit: MetricUnit,
  source: string,
  zeroCode: UnavailableReasonCode
): MetricResult {
  if (numerator.status === "unavailable") return numerator;
  if (denominator.status === "unavailable") return denominator;
  if (denominator.value === 0) {
    return unavailable(zeroCode, zeroCode === "zero_machine_time"
      ? "Machine-hour metrics are not applicable when occupied machine time is zero."
      : "Labor-hour metrics are unavailable when total hands-on owner labor is zero.");
  }
  return available((numerator.value / denominator.value) * multiplier, unit, source);
}

function compatibleCore(product: SavedProduct): boolean {
  return product.formulaVersion === CURRENT_FORMULA_VERSION &&
    product.calculationSnapshot?.schemaVersion === CURRENT_CALCULATION_SNAPSHOT_VERSION &&
    product.calculationSnapshot.formulaVersion === CURRENT_FORMULA_VERSION;
}

function profileFor(product: SavedProduct): { production?: ProductionProfileV1; cash?: CashProfileV1 } {
  if (product.pricingInputs?.schemaVersion !== CURRENT_PRICING_INPUT_SNAPSHOT_VERSION) return {};
  return {
    production: product.pricingInputs.productionProfile,
    cash: product.pricingInputs.cashProfile,
  };
}

function buildMetrics(product: SavedProduct): ProductComparisonMetrics {
  const coreUnavailable = product.formulaVersion !== CURRENT_FORMULA_VERSION
    ? unavailable("unsupported_formula_version", "This pricing formula version is not supported by comparison-v1.")
    : unavailable("unsupported_snapshot", "This calculation snapshot version is not supported by comparison-v1.");
  const core = compatibleCore(product) ? product.calculationSnapshot!.data.result : null;
  const stored = (field: keyof NonNullable<typeof core>, unit: MetricUnit, source: string): MetricResult =>
    core ? available(core[field], unit, source) : coreUnavailable;

  const sellingPrice = stored("recommendedPrice", "currency", "calculation-snapshot-v1.result.recommendedPrice");
  const laborCompensation = stored("laborCost", "currency", "calculation-snapshot-v1.result.laborCost");
  const machineCost = stored("machineCost", "currency", "calculation-snapshot-v1.result.machineCost (allocated economic machine cost)");
  const netProfit = stored("netProfit", "currency", "calculation-snapshot-v1.result.netProfit");
  const profitMargin = stored("profitMarginPercentage", "percentage", "calculation-snapshot-v1.result.profitMarginPercentage");
  const ownerBenefit = core
    ? available(core.laborCost + core.netProfit, "currency", "stored laborCost + stored netProfit")
    : coreUnavailable;

  const { production, cash } = profileFor(product);
  const activeBatch = production
    ? metricFromDerived(deriveActiveLaborMinutesPerBatch(production), "minutes", "production-profile-v1 total hands-on owner labor batch definition", "missing_active_labor")
    : missingProfileMetric("production");
  const activeUnit = production
    ? metricFromDerived(deriveActiveLaborMinutesPerUnit(production), "minutes", "production-profile-v1 total hands-on owner labor per sellable product", "missing_active_labor")
    : missingProfileMetric("production");
  const laborMismatch = product.pricingInputs?.schemaVersion === CURRENT_PRICING_INPUT_SNAPSHOT_VERSION &&
    activeUnit.status === "available" &&
    Math.abs(product.pricingInputs.data.laborMinutes - activeUnit.value) > LABOR_PROFILE_TOLERANCE_MINUTES;
  const machineUnit = production
    ? metricFromDerived(deriveOccupiedMachineMinutesPerUnit(production), "minutes", "production-profile-v1 occupied machine time / unitsPerBatch", "missing_machine_time")
    : missingProfileMetric("production");
  const elapsed = !production
    ? missingProfileMetric("production")
    : production.totalElapsedMinutesPerBatch === undefined
    ? unavailable("missing_elapsed_time", "Explicit total elapsed minutes per batch are required.", ["totalElapsedMinutesPerBatch"])
    : production.primaryMachine && production.totalElapsedMinutesPerBatch < production.primaryMachine.occupiedMinutesPerBatch
    ? unavailable("impossible_elapsed_time", "Observed elapsed wall-clock time cannot be shorter than occupied primary-machine time.", ["totalElapsedMinutesPerBatch", "primaryMachine.occupiedMinutesPerBatch"])
    : available(production.totalElapsedMinutesPerBatch, "minutes", "production-profile-v1.totalElapsedMinutesPerBatch");
  const totalCash = !cash
    ? missingProfileMetric("cash")
    : cash.cashCostPerSale === undefined
    ? unavailable("missing_cash_cost", "Explicit cash cost per sale is required.", ["cashCostPerSale"])
    : available(cash.cashCostPerSale, "currency", "cash-profile-v1.cashCostPerSale");
  const upfrontUnit = !cash
    ? missingProfileMetric("cash")
    : cash.upfrontCashCostPerUnit === undefined
    ? unavailable("missing_upfront_cash", "Explicit upfront cash cost per unit is required.", ["upfrontCashCostPerUnit"])
    : available(cash.upfrontCashCostPerUnit, "currency", "cash-profile-v1.upfrontCashCostPerUnit");
  const upfrontBatch = production && cash
    ? metricFromDerived(deriveUpfrontCashRequiredPerBatch(production, cash), "currency", "unitsPerBatch * upfrontCashCostPerUnit + fixedUpfrontCashCostPerBatch", "missing_upfront_cash")
    : missingProfileMetric(production ? "cash" : "production");
  const setupPerUnit = !production
    ? missingProfileMetric("production")
    : production.setupLaborMinutesPerBatch === undefined
    ? unavailable("missing_active_labor", "Setup labor minutes per batch are required.", ["setupLaborMinutesPerBatch"])
    : available(production.setupLaborMinutesPerBatch / production.unitsPerBatch, "minutes", "setupLaborMinutesPerBatch / unitsPerBatch");
  const profitBatch = production && netProfit.status === "available"
    ? available(netProfit.value * production.unitsPerBatch, "currency", "stored netProfit * unitsPerBatch")
    : production ? netProfit : missingProfileMetric("production");
  const benefitBatch = production && ownerBenefit.status === "available"
    ? available(ownerBenefit.value * production.unitsPerBatch, "currency", "owner economic benefit * unitsPerBatch")
    : production ? ownerBenefit : missingProfileMetric("production");

  let breakEven: MetricResult;
  if (!cash) {
    breakEven = missingProfileMetric("cash");
  } else if (cash.fixedProductLaunchCost === undefined) {
    breakEven = unavailable("missing_fixed_launch_cost", "Fixed product launch cost is required.", ["fixedProductLaunchCost"]);
  } else if (totalCash.status === "unavailable") {
    breakEven = totalCash;
  } else if (sellingPrice.status === "unavailable") {
    breakEven = sellingPrice;
  } else {
    const contribution = sellingPrice.value - totalCash.value;
    breakEven = contribution <= 0
      ? unavailable("nonpositive_contribution_margin", "Selling price must exceed explicit cash cost per sale for break-even units.")
      : available(Math.ceil(cash.fixedProductLaunchCost / contribution), "units", "ceil(fixedProductLaunchCost / (sellingPrice - cashCostPerSale))");
  }

  return {
    sellingPrice,
    ownerLaborCompensation: laborCompensation,
    machineCost,
    netBusinessProfit: netProfit,
    profitMarginPercentage: profitMargin,
    ownerEconomicBenefit: ownerBenefit,
    totalCashCostPerSale: totalCash,
    upfrontCashRequiredPerUnit: upfrontUnit,
    upfrontCashRequiredPerBatch: upfrontBatch,
    activeLaborMinutesPerBatch: activeBatch,
    activeLaborMinutesPerSellableProduct: activeUnit,
    occupiedMachineMinutesPerSellableProduct: machineUnit,
    totalElapsedMinutesPerBatch: elapsed,
    businessProfitPerLaborHour: divideMetric(netProfit, activeUnit, 60, "currency_per_hour", "stored netProfit / total hands-on owner labor hours", "zero_active_labor"),
    ownerEconomicBenefitPerLaborHour: laborMismatch
      ? unavailable("labor_profile_mismatch", "Owner economic benefit per hands-on owner labor hour is unavailable because calculator labor and profile labor conflict.")
      : divideMetric(ownerBenefit, activeUnit, 60, "currency_per_hour", "owner economic benefit / total hands-on owner labor hours", "zero_active_labor"),
    businessProfitPerMachineHour: divideMetric(netProfit, machineUnit, 60, "currency_per_hour", "stored netProfit / occupied machine hours", "zero_machine_time"),
    unitsPerLaborHour: divideMetric(available(60, "minutes", "one hour"), activeUnit, 1, "units_per_hour", "60 / total hands-on owner labor minutes per sellable product", "zero_active_labor"),
    unitsPerMachineHour: divideMetric(available(60, "minutes", "one hour"), machineUnit, 1, "units_per_hour", "60 / occupied machine minutes per sellable product", "zero_machine_time"),
    netBusinessProfitPerBatch: profitBatch,
    ownerEconomicBenefitPerBatch: benefitBatch,
    setupLaborMinutesPerSellableProduct: setupPerUnit,
    breakEvenUnits: breakEven,
  };
}

function leader(
  products: ProductComparisonResult[],
  metric: keyof ProductComparisonMetrics,
  direction: "highest" | "lowest"
): LeaderResult {
  const candidates = products.flatMap((product) => {
    const value = product.metrics[metric];
    return value.status === "available" ? [{ productId: product.productId, metric: value }] : [];
  });
  if (candidates.length < 2) {
    return unavailable("insufficient_comparable_products", `At least two products with available ${metric} values are required.`);
  }
  const best = candidates.reduce((current, candidate) =>
    direction === "highest"
      ? Math.max(current, candidate.metric.value)
      : Math.min(current, candidate.metric.value), candidates[0].metric.value);
  const tolerance = RANKING_TOLERANCE * Math.max(1, Math.abs(best));
  return {
    status: "available",
    productIds: candidates.filter(({ metric: value }) => Math.abs(value.value - best) <= tolerance).map(({ productId }) => productId),
    value: best,
    unit: candidates[0].metric.unit,
    direction,
  };
}

function categoryLeaders(products: ProductComparisonResult[]): CategoryLeaderResults {
  return {
    highestProfitPerUnit: leader(products, "netBusinessProfit", "highest"),
    highestProfitMargin: leader(products, "profitMarginPercentage", "highest"),
    highestOwnerBenefitPerLaborHour: leader(products, "ownerEconomicBenefitPerLaborHour", "highest"),
    highestBusinessProfitPerMachineHour: leader(products, "businessProfitPerMachineHour", "highest"),
    lowestUpfrontCashRequirement: leader(products, "upfrontCashRequiredPerUnit", "lowest"),
    fastestActiveProduction: leader(products, "activeLaborMinutesPerSellableProduct", "lowest"),
  };
}

function buildBatchEconomics(products: ProductComparisonResult[]): BatchEconomicsResult {
  const subleaders = {
    highestProfitPerRepresentativeBatch: leader(products, "netBusinessProfitPerBatch", "highest"),
    highestOwnerBenefitPerLaborHour: leader(products, "ownerEconomicBenefitPerLaborHour", "highest"),
    lowestUpfrontCashPerRepresentativeBatch: leader(products, "upfrontCashRequiredPerBatch", "lowest"),
    lowestSetupLaborPerSellableProduct: leader(products, "setupLaborMinutesPerSellableProduct", "lowest"),
  } satisfies Record<BatchSubleaderKey, LeaderResult>;
  const availableLeaders = Object.values(subleaders).filter((value): value is AvailableLeader => value.status === "available");
  if (!availableLeaders.length) return { status: "unavailable", subleaders, explanation: "Insufficient profile data is available for batch-economics comparison." };
  const shared = availableLeaders.reduce<string[]>((ids, result) => ids.filter((id) => result.productIds.includes(id)), [...availableLeaders[0].productIds]);
  if (shared.length) {
    return { status: "dominant", dominantProductIds: shared, subleaders, explanation: `${shared.join(" and ")} leads every available batch-economics category.` };
  }
  return { status: "mixed", subleaders, explanation: "Batch economics are mixed: different products lead profit, labor efficiency, upfront cash, or setup efficiency." };
}

function validateCapacity(value: number | undefined): boolean {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

function capacityFrom(demand: MetricResult, capacity: number | undefined, unitsPerBatch: number | undefined, source: string): ResourceCapacity {
  if (demand.status === "unavailable") return demand;
  if (!validateCapacity(capacity)) return unavailable("missing_capacity", "A finite positive capacity is required.");
  if (unitsPerBatch === undefined) return unavailable("missing_units_per_batch", "A representative batch size is required.");
  if (demand.value === 0) return { status: "available", maxCompleteBatches: null, maxSellableProducts: null, nonLimiting: true, source };
  const batches = Math.floor(capacity! / demand.value);
  return { status: "available", maxCompleteBatches: batches, maxSellableProducts: batches * unitsPerBatch, nonLimiting: false, source };
}

function bottleneckFor(product: SavedProduct, metrics: ProductComparisonMetrics, constraints?: ComparisonConstraints): BottleneckResult {
  const production = profileFor(product).production;
  const labor = !constraints || !validateCapacity(constraints.availableLaborMinutes)
    ? unavailable("missing_capacity", "A finite positive labor capacity is required.", ["availableLaborMinutes"])
    : metrics.activeLaborMinutesPerBatch.status === "unavailable"
      ? metrics.activeLaborMinutesPerBatch
      : available(metrics.activeLaborMinutesPerBatch.value / constraints.availableLaborMinutes!, "ratio", "total hands-on owner labor minutes per batch / available owner labor minutes");

  let machine: MetricResult;
  if (!production?.primaryMachine) machine = unavailable("missing_machine_time", "A primary machine profile is required for machine utilization.");
  else {
    const capacity = constraints?.availableMachineMinutesByKey?.[production.primaryMachine.key];
    machine = capacity === undefined
      ? unavailable("machine_capacity_not_found", `No capacity was supplied for machine key ${production.primaryMachine.key}.`, [`availableMachineMinutesByKey.${production.primaryMachine.key}`])
      : !validateCapacity(capacity)
        ? unavailable("missing_capacity", "Machine capacity must be finite and greater than zero.", [`availableMachineMinutesByKey.${production.primaryMachine.key}`])
        : available(production.primaryMachine.occupiedMinutesPerBatch / capacity, "ratio", "occupied primary-machine minutes per batch / matching machine capacity");
  }

  const cash = !constraints || !validateCapacity(constraints.workingCapitalCeiling)
    ? unavailable("missing_capacity", "A finite positive working-capital ceiling is required.", ["workingCapitalCeiling"])
    : metrics.upfrontCashRequiredPerBatch.status === "unavailable"
      ? metrics.upfrontCashRequiredPerBatch
      : available(metrics.upfrontCashRequiredPerBatch.value / constraints.workingCapitalCeiling!, "ratio", "upfront cash required per batch / working-capital ceiling");

  const utilizations = { labor, machine, working_capital: cash };
  const units = production?.unitsPerBatch;
  const capacities: Record<BottleneckResource, ResourceCapacity> = {
    labor: capacityFrom(metrics.activeLaborMinutesPerBatch, constraints?.availableLaborMinutes, units, "floor(available owner labor minutes / total hands-on owner labor minutes per batch)"),
    machine: production?.primaryMachine
      ? machine.status === "unavailable" ? machine
        : capacityFrom(available(production.primaryMachine.occupiedMinutesPerBatch, "minutes", "occupied machine minutes per batch"), constraints?.availableMachineMinutesByKey?.[production.primaryMachine.key], units, "floor(matching machine minutes / occupied machine minutes per batch)")
      : unavailable("missing_machine_time", "A primary machine profile is required for machine capacity."),
    working_capital: capacityFrom(metrics.upfrontCashRequiredPerBatch, constraints?.workingCapitalCeiling, units, "floor(working-capital ceiling / upfront cash required per batch)"),
  };
  const valid = Object.entries(utilizations).filter((entry): entry is [BottleneckResource, AvailableMetric] => entry[1].status === "available");
  const limiting = (Object.entries(capacities) as Array<[BottleneckResource, ResourceCapacity]>).filter((entry): entry is [BottleneckResource, AvailableResourceCapacity] => entry[1].status === "available" && !entry[1].nonLimiting);
  if (!limiting.length) return {
    status: "unavailable", utilizations, capacities, primaryResources: [], nearTiedResources: [],
    reason: unavailable("missing_capacity", "At least one resource with a positive batch demand and matching capacity is required to determine a bottleneck.").reason,
  };
  const lowestBatches = Math.min(...limiting.map(([, value]) => value.maxCompleteBatches!));
  const primaryResources = limiting.filter(([, value]) => value.maxCompleteBatches === lowestBatches).map(([resource]) => resource);
  const highest = Math.max(...valid.map(([, metric]) => metric.value));
  const nearTiedResources = highest === 0 ? [] : valid.filter(([, metric]) => metric.value > 0 &&
    (highest - metric.value) / highest <= BOTTLENECK_NEAR_TIE_TOLERANCE).map(([resource]) => resource);
  return { status: "available", utilizations, capacities, primaryResources, nearTiedResources };
}

function warningsFor(product: SavedProduct): CompatibilityWarning[] {
  const warnings: CompatibilityWarning[] = [];
  if (product.formulaVersion !== CURRENT_FORMULA_VERSION) warnings.push({ productId: product.id, code: "unsupported_formula_version", message: `${product.name} uses an unsupported pricing formula version; stored pricing metrics are unavailable.` });
  else if (!product.calculationSnapshot) warnings.push({ productId: product.id, code: "unsupported_calculation_snapshot", message: `${product.name} has an unsupported calculation snapshot; stored pricing metrics are unavailable.` });
  if (!product.pricingInputs) warnings.push({ productId: product.id, code: "unsupported_input_snapshot", message: `${product.name} has an unsupported pricing-input snapshot; profile metrics are unavailable.` });
  else if (product.pricingInputs.schemaVersion === PRICING_INPUT_SNAPSHOT_VERSION_V1) warnings.push({ productId: product.id, code: "historical_profile_unavailable", message: `${product.name} uses pricing-input-v1, which has no Version 0.4 production or cash profiles.` });
  else if (product.pricingInputs.productionProfile) {
    const production = product.pricingInputs.productionProfile;
    const derived = deriveActiveLaborMinutesPerUnit(production);
    if (derived.available && Math.abs(product.pricingInputs.data.laborMinutes - derived.value) > LABOR_PROFILE_TOLERANCE_MINUTES) {
      warnings.push({ productId: product.id, code: "labor_profile_mismatch", message: `The pricing calculator compensates ${product.pricingInputs.data.laborMinutes} minutes of owner labor per product, while the production profile records ${derived.value} minutes. Review these values before relying on labor-efficiency metrics.` });
    }
    if (production.primaryMachine && production.totalElapsedMinutesPerBatch !== undefined && production.totalElapsedMinutesPerBatch < production.primaryMachine.occupiedMinutesPerBatch) {
      warnings.push({ productId: product.id, code: "impossible_elapsed_time", message: `The production profile records ${production.totalElapsedMinutesPerBatch} minutes of elapsed time, shorter than its ${production.primaryMachine.occupiedMinutesPerBatch}-minute occupied primary-machine run. Elapsed-time comparison is unavailable until this is corrected.` });
    }
  }
  return warnings;
}

export function projectSavedProduct(product: SavedProduct): TrustedProductProjection {
  const profiles = profileFor(product);
  const production = profiles.production;
  const cash = profiles.cash;
  const machineInterpretation = production?.primaryMachine
    ? "represented"
    : production
      ? "legacy_absent_machine"
      : "unavailable";
  return structuredClone({
    productId: product.id,
    productName: product.name,
    metrics: buildMetrics(product),
    compatibilityWarnings: warningsFor(product),
    profile: {
      ...(production ? { unitsPerBatch: production.unitsPerBatch } : {}),
      ...(cash?.fixedUpfrontCashCostPerBatch !== undefined
        ? { fixedUpfrontCashCostPerBatch: cash.fixedUpfrontCashCostPerBatch }
        : {}),
      ...(production?.primaryMachine
        ? {
            machine: {
              key: production.primaryMachine.key,
              label: production.primaryMachine.label,
              occupiedMinutesPerBatch: production.primaryMachine.occupiedMinutesPerBatch,
            },
          }
        : {}),
      machineFree: machineInterpretation === "legacy_absent_machine",
    },
    provenance: {
      pricingInputSnapshotVersion: product.pricingInputs?.schemaVersion ?? null,
      calculationSnapshotVersion: product.calculationSnapshot?.schemaVersion ?? null,
      formulaVersion: product.formulaVersion,
      productionProfileVersion: production?.schemaVersion ?? null,
      cashProfileVersion: cash?.schemaVersion ?? null,
      machineInterpretation,
      machineInterpretationSource: machineInterpretation === "represented"
        ? "production-profile-v1.primaryMachine"
        : machineInterpretation === "legacy_absent_machine"
          ? "production-profile-v1 absent primaryMachine compatibility inference"
          : "supported production profile unavailable",
    },
  });
}

function productNames(products: ProductComparisonResult[], ids: string[]) {
  return ids.map((id) => products.find((product) => product.productId === id)?.productName ?? id).join(" and ");
}

function explanationFor(
  products: ProductComparisonResult[],
  categories: CategoryLeaderResults,
  batch: BatchEconomicsResult,
  warnings: CompatibilityWarning[]
): string[] {
  const lines: string[] = [];
  const descriptions: Array<[LeaderCategory, string]> = [
    ["highestProfitPerUnit", "generates the greatest net business profit per sale"],
    ["highestProfitMargin", "has the highest stored profit margin"],
    ["highestOwnerBenefitPerLaborHour", "provides the greatest owner economic benefit per hands-on owner labor hour"],
    ["highestBusinessProfitPerMachineHour", "generates the greatest business profit per occupied machine hour"],
    ["lowestUpfrontCashRequirement", "requires the least upfront cash per sellable product"],
    ["fastestActiveProduction", "requires the least hands-on owner labor per sellable product"],
  ];
  for (const [key, description] of descriptions) {
    const result = categories[key];
    if (result.status === "available") {
      const names = productNames(products, result.productIds);
      lines.push(result.productIds.length > 1 ? `${names} tie and ${description}.` : `${names} ${description}.`);
    }
  }
  if (batch.status === "mixed") lines.push(batch.explanation);
  if (warnings.length) lines.push(`${warnings.length} compatibility or data-quality warning${warnings.length === 1 ? "" : "s"} limit some comparison metrics.`);
  if (!lines.length) lines.push("Insufficient compatible data is available for a meaningful comparison.");
  return lines;
}

export function compareSavedProducts(request: ComparisonRequest): ProductComparisonOutput {
  if (!Number.isFinite(Date.parse(request.generatedAt))) throw new Error("generatedAt must be a valid timestamp.");
  const constraints = request.constraints;
  if (constraints?.availableLaborMinutes !== undefined && !validateCapacity(constraints.availableLaborMinutes)) {
    throw new Error("availableLaborMinutes must be finite and greater than zero.");
  }
  if (constraints?.workingCapitalCeiling !== undefined && !validateCapacity(constraints.workingCapitalCeiling)) {
    throw new Error("workingCapitalCeiling must be finite and greater than zero.");
  }
  for (const [key, value] of Object.entries(constraints?.availableMachineMinutesByKey ?? {})) {
    if (!validateCapacity(value)) throw new Error(`Machine capacity for ${key} must be finite and greater than zero.`);
  }
  const projections = request.products.map(projectSavedProduct);
  const products = projections.map(({ productId, productName, metrics }) => ({ productId, productName, metrics }));
  const categories = categoryLeaders(products);
  const batch = buildBatchEconomics(products);
  const warnings = projections.flatMap(({ compatibilityWarnings }) => compatibilityWarnings);
  const bottlenecksByProduct = Object.fromEntries(request.products.map((product, index) => [product.id, bottleneckFor(product, products[index].metrics, request.constraints)]));
  return structuredClone({
    engineVersion: COMPARISON_ENGINE_VERSION,
    generatedAt: request.generatedAt,
    products,
    categoryLeaders: categories,
    batchEconomics: batch,
    bottlenecksByProduct,
    compatibilityWarnings: warnings,
    explanation: explanationFor(products, categories, batch, warnings),
  });
}
