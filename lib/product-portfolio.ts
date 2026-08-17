import {
  BOTTLENECK_NEAR_TIE_TOLERANCE,
  RANKING_TOLERANCE,
  type CompatibilityWarning,
  type MetricResult,
  type TrustedProductProjection,
} from "./product-comparison";
import {
  CASH_PROFILE_VERSION,
  PRODUCTION_PROFILE_VERSION,
  normalizeMachineKey,
} from "./product-profiles";
import {
  CURRENT_CALCULATION_SNAPSHOT_VERSION,
  CURRENT_FORMULA_VERSION,
  CURRENT_PRICING_INPUT_SNAPSHOT_VERSION,
} from "./saved-product-snapshots";

export const PORTFOLIO_PLAN_INPUT_VERSION = "portfolio-plan-v1" as const;
export const PORTFOLIO_ENGINE_VERSION = "portfolio-v1" as const;
export const MAX_PORTFOLIO_WHOLE_NUMBER = Number.MAX_SAFE_INTEGER;

export type PortfolioPlanInputVersion = typeof PORTFOLIO_PLAN_INPUT_VERSION;
export type PortfolioEngineVersion = typeof PORTFOLIO_ENGINE_VERSION;
export type PlanningPeriodType = "week" | "month" | "event" | "custom";

export type PortfolioPlanInput = {
  version: PortfolioPlanInputVersion;
  period: {
    type: PlanningPeriodType;
    label: string;
  };
  products: Array<{
    savedProductId: string;
    plannedBatches: number;
    demandCeilingUnits?: number;
  }>;
  constraints: {
    ownerLaborMinutes?: number;
    workingCapital?: number;
    machineMinutesByKey: Record<string, number | undefined>;
  };
};

export type PortfolioRequestErrorCode =
  | "malformed_request"
  | "unsupported_plan_input_version"
  | "invalid_period_type"
  | "invalid_period_label"
  | "insufficient_products"
  | "duplicate_product_id"
  | "unknown_product_id"
  | "invalid_planned_batches"
  | "invalid_demand_ceiling"
  | "invalid_capacity"
  | "unknown_machine_capacity_key"
  | "non_finite_result";

export type PortfolioRequestError = {
  code: PortfolioRequestErrorCode;
  message: string;
  path?: string;
  productId?: string;
  machineKey?: string;
};

export type PortfolioReadinessReasonCode =
  | "unsupported_input_snapshot"
  | "unsupported_calculation_snapshot"
  | "unsupported_formula_version"
  | "unsupported_production_profile"
  | "unsupported_cash_profile"
  | "historical_profile_unavailable"
  | "missing_production_profile"
  | "missing_units_per_batch"
  | "missing_active_labor"
  | "missing_cash_profile"
  | "missing_cash_cost"
  | "missing_upfront_cash"
  | "missing_fixed_batch_cash"
  | "missing_stored_metric"
  | "labor_profile_mismatch"
  | "machine_label_conflict"
  | "invalid_machine";

export type PortfolioReadinessReason = {
  code: PortfolioReadinessReasonCode;
  message: string;
  field?: string;
};

export type PortfolioWarningCode = "impossible_elapsed_time";

export type PortfolioWarning = {
  code: PortfolioWarningCode;
  message: string;
  productId: string;
};

export type PortfolioProductReadiness = {
  status: "ready" | "unready";
  reasons: PortfolioReadinessReason[];
  warnings: PortfolioWarning[];
};

export type PortfolioProductProvenance = TrustedProductProjection["provenance"] & {
  machineFreeInference: boolean;
  machineSourceLabels: string[];
};

export type PortfolioLineEconomics = {
  plannedBatches: number;
  plannedSellableProducts: number;
  plannedRevenue: number;
  plannedOwnerLaborMinutes: number;
  plannedOccupiedMachineMinutes: number;
  plannedTotalCashCost: number;
  plannedUpfrontVariableCash: number;
  plannedFixedBatchCash: number;
  plannedWorkingCapitalRequirement: number;
  plannedOwnerLaborCompensation: number;
  plannedBusinessProfit: number;
  plannedOwnerEconomicBenefit: number;
};

export type PortfolioContributionShares = {
  revenue: number | null;
  totalCashCost: number | null;
  workingCapital: number | null;
  ownerLabor: number | null;
  occupiedMachine: number | null;
  ownerLaborCompensation: number | null;
  businessProfit: number | null;
  ownerEconomicBenefit: number | null;
};

export type PortfolioDemandAnalysis =
  | {
      status: "available";
      plannedUnits: number;
      demandCeilingUnits: number;
      excessProductionUnits: number;
      unfilledDemandUnits: number;
      state: "excess" | "shortfall" | "exact";
    }
  | {
      status: "unavailable";
      reason: {
        code: "missing_units_per_batch";
        message: string;
      };
    };

export type PortfolioProductLine = {
  productId: string;
  productName: string;
  plannedBatches: number;
  demandCeilingUnits?: number;
  readiness: PortfolioProductReadiness;
  provenance: PortfolioProductProvenance;
  economics: PortfolioLineEconomics | null;
  contributions: PortfolioContributionShares | null;
  demand: PortfolioDemandAnalysis | null;
};

export type PortfolioTotals = {
  plannedBatches: number;
  plannedSellableProducts: number;
  revenue: number;
  totalCashCost: number;
  workingCapitalRequirement: number;
  ownerLaborMinutes: number;
  occupiedMachineMinutes: number;
  occupiedMachineMinutesByKey: Record<string, number>;
  ownerLaborCompensation: number;
  netBusinessProfit: number;
  ownerEconomicBenefit: number;
};

export type PortfolioCapacityUnavailable = {
  status: "unavailable";
  required: number;
  available: null;
  utilization: null;
  remaining: null;
  overCapacity: null;
  limiting: false;
  reason: {
    code: "missing_capacity";
    message: string;
  };
};

export type PortfolioCapacityAvailable = {
  status: "available";
  required: number;
  available: number;
  utilization: number | null;
  remaining: number;
  overCapacity: boolean;
  limiting: boolean;
};

export type PortfolioCapacityResult = PortfolioCapacityUnavailable | PortfolioCapacityAvailable;

export type PortfolioMachineResource = {
  resourceType: "machine";
  key: string;
  sourceLabels: string[];
  requiredMinutes: number;
  capacity: PortfolioCapacityResult;
};

export type PortfolioResourceReference = {
  resourceType: "owner_labor" | "machine" | "working_capital";
  key: string;
};

export type PortfolioCapacityAnalysis = {
  ownerLabor: PortfolioCapacityResult;
  workingCapital: PortfolioCapacityResult;
  machines: PortfolioMachineResource[];
  primaryLimitingResources: PortfolioResourceReference[];
  nearTiedResources: PortfolioResourceReference[];
};

export type PortfolioSuccessResult = {
  status: "success";
  planInputVersion: PortfolioPlanInputVersion;
  engineVersion: PortfolioEngineVersion;
  period: {
    type: PlanningPeriodType;
    label: string;
  };
  products: PortfolioProductLine[];
  totals: PortfolioTotals;
  capacity: PortfolioCapacityAnalysis;
  warnings: PortfolioWarning[];
  explanations: string[];
};

export type PortfolioInvalidResult = {
  status: "invalid";
  errors: PortfolioRequestError[];
};

export type PortfolioReadinessBlockCode =
  | "positive_batches_for_unready_product"
  | "no_ready_positive_batches";

export type PortfolioReadinessBlockReason = {
  code: PortfolioReadinessBlockCode;
  message: string;
  productId?: string;
};

export type PortfolioBlockedProductLine = Pick<
  PortfolioProductLine,
  "productId" | "productName" | "plannedBatches" | "demandCeilingUnits" | "readiness" | "provenance"
>;

export type PortfolioReadinessBlockedResult = {
  status: "readiness_blocked";
  planInputVersion: PortfolioPlanInputVersion;
  engineVersion: PortfolioEngineVersion;
  period: {
    type: PlanningPeriodType;
    label: string;
  };
  products: PortfolioBlockedProductLine[];
  warnings: PortfolioWarning[];
  reasons: PortfolioReadinessBlockReason[];
  explanations: string[];
};

export type PortfolioEngineResult =
  | PortfolioSuccessResult
  | PortfolioReadinessBlockedResult
  | PortfolioInvalidResult;

export type PortfolioEngineRequest = {
  input: unknown;
  products: readonly TrustedProductProjection[];
};

const periodTypes = new Set<PlanningPeriodType>(["week", "month", "event", "custom"]);

const requestErrorPriority: readonly PortfolioRequestErrorCode[] = [
  "malformed_request",
  "unsupported_plan_input_version",
  "invalid_period_type",
  "invalid_period_label",
  "insufficient_products",
  "duplicate_product_id",
  "unknown_product_id",
  "invalid_planned_batches",
  "invalid_demand_ceiling",
  "invalid_capacity",
  "unknown_machine_capacity_key",
  "non_finite_result",
];

const readinessPriority: readonly PortfolioReadinessReasonCode[] = [
  "unsupported_input_snapshot",
  "unsupported_calculation_snapshot",
  "unsupported_formula_version",
  "unsupported_production_profile",
  "unsupported_cash_profile",
  "historical_profile_unavailable",
  "missing_production_profile",
  "missing_units_per_batch",
  "missing_active_labor",
  "missing_cash_profile",
  "missing_cash_cost",
  "missing_upfront_cash",
  "missing_fixed_batch_cash",
  "missing_stored_metric",
  "labor_profile_mismatch",
  "machine_label_conflict",
  "invalid_machine",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function error(
  code: PortfolioRequestErrorCode,
  message: string,
  details: Omit<PortfolioRequestError, "code" | "message"> = {}
): PortfolioRequestError {
  return { code, message, ...details };
}

function sortRequestErrors(errors: PortfolioRequestError[]) {
  return errors.sort((a, b) =>
    requestErrorPriority.indexOf(a.code) - requestErrorPriority.indexOf(b.code) ||
    (a.path ?? "").localeCompare(b.path ?? "") ||
    (a.productId ?? "").localeCompare(b.productId ?? "") ||
    (a.machineKey ?? "").localeCompare(b.machineKey ?? ""));
}

function invalid(errors: PortfolioRequestError[]): PortfolioInvalidResult {
  return { status: "invalid", errors: sortRequestErrors(errors) };
}

function isWholeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 &&
    value <= MAX_PORTFOLIO_WHOLE_NUMBER;
}

function isCapacity(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function availableValue(metric: MetricResult): number | undefined {
  return metric.status === "available" ? metric.value : undefined;
}

function compatibilityReason(warning: CompatibilityWarning): PortfolioReadinessReason | null {
  switch (warning.code) {
    case "unsupported_input_snapshot":
    case "unsupported_calculation_snapshot":
    case "unsupported_formula_version":
    case "historical_profile_unavailable":
    case "labor_profile_mismatch":
      return { code: warning.code, message: warning.message };
    case "impossible_elapsed_time":
      return null;
  }
}

function readinessFor(projection: TrustedProductProjection): PortfolioProductReadiness {
  const reasons: PortfolioReadinessReason[] = [];
  const warnings: PortfolioWarning[] = [];
  for (const warning of projection.compatibilityWarnings) {
    if (warning.code === "impossible_elapsed_time") {
      warnings.push({ code: "impossible_elapsed_time", message: warning.message, productId: projection.productId });
    } else {
      const reason = compatibilityReason(warning);
      if (reason) reasons.push(reason);
    }
  }

  if (projection.provenance.pricingInputSnapshotVersion !== CURRENT_PRICING_INPUT_SNAPSHOT_VERSION) {
    reasons.push({
      code: projection.provenance.pricingInputSnapshotVersion === null
        ? "unsupported_input_snapshot"
        : "historical_profile_unavailable",
      message: "A current supported pricing-input snapshot with profiles is required.",
    });
  }
  if (projection.provenance.calculationSnapshotVersion !== CURRENT_CALCULATION_SNAPSHOT_VERSION) {
    reasons.push({ code: "unsupported_calculation_snapshot", message: "A supported calculation snapshot is required." });
  }
  if (projection.provenance.formulaVersion !== CURRENT_FORMULA_VERSION) {
    reasons.push({ code: "unsupported_formula_version", message: "A supported pricing formula version is required." });
  }
  if (projection.provenance.productionProfileVersion !== PRODUCTION_PROFILE_VERSION) {
    if (projection.provenance.productionProfileVersion !== null) {
      reasons.push({ code: "unsupported_production_profile", message: "The production profile version is unsupported." });
    }
    reasons.push({ code: "missing_production_profile", message: "A supported production profile is required." });
  }
  if (projection.profile.unitsPerBatch === undefined) {
    reasons.push({ code: "missing_units_per_batch", message: "Units per representative batch are required.", field: "unitsPerBatch" });
  }
  requireMetric(projection.metrics.activeLaborMinutesPerBatch, "missing_active_labor", "Hands-on owner labor per batch is required.", reasons);
  if (projection.provenance.cashProfileVersion !== CASH_PROFILE_VERSION) {
    if (projection.provenance.cashProfileVersion !== null) {
      reasons.push({ code: "unsupported_cash_profile", message: "The cash profile version is unsupported." });
    }
    reasons.push({ code: "missing_cash_profile", message: "A supported cash profile is required." });
  }
  requireMetric(projection.metrics.totalCashCostPerSale, "missing_cash_cost", "Total cash cost per standard sale is required.", reasons);
  requireMetric(projection.metrics.upfrontCashRequiredPerUnit, "missing_upfront_cash", "Upfront cash per sellable product is required.", reasons);
  requireMetric(projection.metrics.upfrontCashRequiredPerBatch, "missing_upfront_cash", "Upfront cash per representative batch is required.", reasons);
  if (projection.profile.fixedUpfrontCashCostPerBatch === undefined) {
    reasons.push({ code: "missing_fixed_batch_cash", message: "Fixed upfront cash per batch is required.", field: "fixedUpfrontCashCostPerBatch" });
  }
  for (const [field, metric] of [
    ["sellingPrice", projection.metrics.sellingPrice],
    ["ownerLaborCompensation", projection.metrics.ownerLaborCompensation],
    ["netBusinessProfit", projection.metrics.netBusinessProfit],
    ["ownerEconomicBenefit", projection.metrics.ownerEconomicBenefit],
  ] as const) {
    requireMetric(metric, "missing_stored_metric", `Stored ${field} is required.`, reasons, field);
  }
  if (projection.provenance.machineInterpretation === "unavailable") {
    reasons.push({ code: "invalid_machine", message: "A supported production profile is required to interpret machine use." });
  } else if (projection.provenance.machineInterpretation === "represented" && !projection.profile.machine) {
    reasons.push({ code: "invalid_machine", message: "The represented primary machine is unavailable." });
  }

  const unique = new Map<string, PortfolioReadinessReason>();
  for (const reason of reasons) unique.set(`${reason.code}:${reason.field ?? ""}`, reason);
  const sorted = [...unique.values()].sort((a, b) =>
    readinessPriority.indexOf(a.code) - readinessPriority.indexOf(b.code) ||
    a.code.localeCompare(b.code) ||
    (a.field ?? "").localeCompare(b.field ?? ""));
  return {
    status: sorted.length ? "unready" : "ready",
    reasons: sorted,
    warnings: warnings.sort((a, b) => a.code.localeCompare(b.code)),
  };
}

function requireMetric(
  metric: MetricResult,
  code: PortfolioReadinessReasonCode,
  message: string,
  reasons: PortfolioReadinessReason[],
  field?: string
) {
  if (metric.status === "unavailable") reasons.push({ code, message, ...(field ? { field } : {}) });
}

function projectionProvenance(
  projection: TrustedProductProjection,
  machineSourceLabels: readonly string[] = projection.profile.machine ? [projection.profile.machine.label] : []
): PortfolioProductProvenance {
  return {
    ...structuredClone(projection.provenance),
    machineFreeInference: projection.provenance.machineInterpretation === "legacy_absent_machine",
    machineSourceLabels: [...machineSourceLabels],
  };
}

function withReadinessReason(
  readiness: PortfolioProductReadiness,
  reason: PortfolioReadinessReason
): PortfolioProductReadiness {
  const reasons = [...readiness.reasons, reason].sort((a, b) =>
    readinessPriority.indexOf(a.code) - readinessPriority.indexOf(b.code) ||
    a.code.localeCompare(b.code) ||
    (a.field ?? "").localeCompare(b.field ?? ""));
  return { ...readiness, status: "unready", reasons };
}

function sortedWarnings(readiness: readonly PortfolioProductReadiness[]): PortfolioWarning[] {
  return readiness.flatMap((result) => result.warnings)
    .sort((a, b) => a.code.localeCompare(b.code) || a.productId.localeCompare(b.productId));
}

function multiply(a: number, b: number): number {
  const value = a * b;
  if (!Number.isFinite(value)) throw new Error("non_finite_result");
  return value;
}

function add(a: number, b: number): number {
  const value = a + b;
  if (!Number.isFinite(value)) throw new Error("non_finite_result");
  return value;
}

function lineEconomics(projection: TrustedProductProjection, plannedBatches: number): PortfolioLineEconomics {
  const unitsPerBatch = projection.profile.unitsPerBatch!;
  const plannedSellableProducts = multiply(plannedBatches, unitsPerBatch);
  const sellingPrice = availableValue(projection.metrics.sellingPrice)!;
  const laborPerBatch = availableValue(projection.metrics.activeLaborMinutesPerBatch)!;
  const cashPerSale = availableValue(projection.metrics.totalCashCostPerSale)!;
  const upfrontPerUnit = availableValue(projection.metrics.upfrontCashRequiredPerUnit)!;
  const upfrontPerBatch = availableValue(projection.metrics.upfrontCashRequiredPerBatch)!;
  const fixedBatchCash = projection.profile.fixedUpfrontCashCostPerBatch!;
  const laborCompensation = availableValue(projection.metrics.ownerLaborCompensation)!;
  const businessProfit = availableValue(projection.metrics.netBusinessProfit)!;
  const ownerBenefit = availableValue(projection.metrics.ownerEconomicBenefit)!;
  return {
    plannedBatches,
    plannedSellableProducts,
    plannedRevenue: multiply(plannedSellableProducts, sellingPrice),
    plannedOwnerLaborMinutes: multiply(plannedBatches, laborPerBatch),
    plannedOccupiedMachineMinutes: projection.profile.machine
      ? multiply(plannedBatches, projection.profile.machine.occupiedMinutesPerBatch)
      : 0,
    plannedTotalCashCost: multiply(plannedSellableProducts, cashPerSale),
    plannedUpfrontVariableCash: multiply(plannedSellableProducts, upfrontPerUnit),
    plannedFixedBatchCash: multiply(plannedBatches, fixedBatchCash),
    plannedWorkingCapitalRequirement: multiply(plannedBatches, upfrontPerBatch),
    plannedOwnerLaborCompensation: multiply(plannedSellableProducts, laborCompensation),
    plannedBusinessProfit: multiply(plannedSellableProducts, businessProfit),
    plannedOwnerEconomicBenefit: multiply(plannedSellableProducts, ownerBenefit),
  };
}

function emptyTotals(): PortfolioTotals {
  return {
    plannedBatches: 0,
    plannedSellableProducts: 0,
    revenue: 0,
    totalCashCost: 0,
    workingCapitalRequirement: 0,
    ownerLaborMinutes: 0,
    occupiedMachineMinutes: 0,
    occupiedMachineMinutesByKey: {},
    ownerLaborCompensation: 0,
    netBusinessProfit: 0,
    ownerEconomicBenefit: 0,
  };
}

function aggregateLine(totals: PortfolioTotals, line: PortfolioLineEconomics, machineKey?: string) {
  totals.plannedBatches = add(totals.plannedBatches, line.plannedBatches);
  totals.plannedSellableProducts = add(totals.plannedSellableProducts, line.plannedSellableProducts);
  totals.revenue = add(totals.revenue, line.plannedRevenue);
  totals.totalCashCost = add(totals.totalCashCost, line.plannedTotalCashCost);
  totals.workingCapitalRequirement = add(totals.workingCapitalRequirement, line.plannedWorkingCapitalRequirement);
  totals.ownerLaborMinutes = add(totals.ownerLaborMinutes, line.plannedOwnerLaborMinutes);
  totals.occupiedMachineMinutes = add(totals.occupiedMachineMinutes, line.plannedOccupiedMachineMinutes);
  totals.ownerLaborCompensation = add(totals.ownerLaborCompensation, line.plannedOwnerLaborCompensation);
  totals.netBusinessProfit = add(totals.netBusinessProfit, line.plannedBusinessProfit);
  totals.ownerEconomicBenefit = add(totals.ownerEconomicBenefit, line.plannedOwnerEconomicBenefit);
  if (machineKey) {
    totals.occupiedMachineMinutesByKey[machineKey] = add(
      totals.occupiedMachineMinutesByKey[machineKey] ?? 0,
      line.plannedOccupiedMachineMinutes
    );
  }
}

function share(value: number, total: number): number | null {
  if (total === 0) return null;
  const result = value / total;
  if (!Number.isFinite(result)) throw new Error("non_finite_result");
  return result;
}

function contributionShares(line: PortfolioLineEconomics, totals: PortfolioTotals): PortfolioContributionShares {
  return {
    revenue: share(line.plannedRevenue, totals.revenue),
    totalCashCost: share(line.plannedTotalCashCost, totals.totalCashCost),
    workingCapital: share(line.plannedWorkingCapitalRequirement, totals.workingCapitalRequirement),
    ownerLabor: share(line.plannedOwnerLaborMinutes, totals.ownerLaborMinutes),
    occupiedMachine: share(line.plannedOccupiedMachineMinutes, totals.occupiedMachineMinutes),
    ownerLaborCompensation: share(line.plannedOwnerLaborCompensation, totals.ownerLaborCompensation),
    businessProfit: share(line.plannedBusinessProfit, totals.netBusinessProfit),
    ownerEconomicBenefit: share(line.plannedOwnerEconomicBenefit, totals.ownerEconomicBenefit),
  };
}

function demandAnalysis(
  demandCeilingUnits: number | undefined,
  economics: PortfolioLineEconomics | null,
  plannedBatches: number,
  unitsPerBatch: number | undefined
): PortfolioDemandAnalysis | null {
  if (demandCeilingUnits === undefined) return null;
  if (!economics && unitsPerBatch === undefined) {
    return {
      status: "unavailable",
      reason: { code: "missing_units_per_batch", message: "Demand analysis requires units per representative batch." },
    };
  }
  const plannedUnits = economics?.plannedSellableProducts ?? multiply(plannedBatches, unitsPerBatch!);
  const excessProductionUnits = Math.max(0, plannedUnits - demandCeilingUnits);
  const unfilledDemandUnits = Math.max(0, demandCeilingUnits - plannedUnits);
  return {
    status: "available",
    plannedUnits,
    demandCeilingUnits,
    excessProductionUnits,
    unfilledDemandUnits,
    state: excessProductionUnits > 0 ? "excess" : unfilledDemandUnits > 0 ? "shortfall" : "exact",
  };
}

function capacityResult(required: number, available: number | undefined, label: string): PortfolioCapacityResult {
  if (available === undefined) {
    return {
      status: "unavailable",
      required,
      available: null,
      utilization: null,
      remaining: null,
      overCapacity: null,
      limiting: false,
      reason: { code: "missing_capacity", message: `Enter available ${label} to analyze utilization.` },
    };
  }
  if (available === 0) {
    return {
      status: "available",
      required,
      available,
      utilization: required === 0 ? 0 : null,
      remaining: -required,
      overCapacity: required > 0,
      limiting: false,
    };
  }
  const utilization = required / available;
  if (!Number.isFinite(utilization)) throw new Error("non_finite_result");
  return {
    status: "available",
    required,
    available,
    utilization,
    remaining: available - required,
    overCapacity: required > available,
    limiting: false,
  };
}

function resourceOrder(resource: PortfolioResourceReference): string {
  const typeOrder = resource.resourceType === "owner_labor" ? "0" : resource.resourceType === "machine" ? "1" : "2";
  return `${typeOrder}:${resource.key}`;
}

function capacityAnalysis(
  totals: PortfolioTotals,
  projections: readonly TrustedProductProjection[],
  input: PortfolioPlanInput
): PortfolioCapacityAnalysis {
  const ownerLabor = capacityResult(totals.ownerLaborMinutes, input.constraints.ownerLaborMinutes, "owner labor minutes");
  const workingCapital = capacityResult(totals.workingCapitalRequirement, input.constraints.workingCapital, "working capital");
  const machineMap = new Map<string, { labels: string[] }>();
  for (const projection of projections) {
    const machine = projection.profile.machine;
    if (!machine) continue;
    const current = machineMap.get(machine.key) ?? { labels: [] };
    if (!current.labels.includes(machine.label)) current.labels.push(machine.label);
    machineMap.set(machine.key, current);
  }
  const machines = [...machineMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => ({
    resourceType: "machine" as const,
    key,
    sourceLabels: value.labels,
    requiredMinutes: totals.occupiedMachineMinutesByKey[key] ?? 0,
    capacity: capacityResult(
      totals.occupiedMachineMinutesByKey[key] ?? 0,
      input.constraints.machineMinutesByKey[key],
      `minutes for machine ${key}`
    ),
  }));

  const candidates: Array<{ reference: PortfolioResourceReference; capacity: PortfolioCapacityAvailable }> = [];
  if (ownerLabor.status === "available" && ownerLabor.utilization !== null) {
    candidates.push({ reference: { resourceType: "owner_labor", key: "owner_labor" }, capacity: ownerLabor });
  }
  for (const machine of machines) {
    if (machine.capacity.status === "available" && machine.capacity.utilization !== null) {
      candidates.push({ reference: { resourceType: "machine", key: machine.key }, capacity: machine.capacity });
    }
  }
  if (workingCapital.status === "available" && workingCapital.utilization !== null) {
    candidates.push({ reference: { resourceType: "working_capital", key: "working_capital" }, capacity: workingCapital });
  }

  const highest = candidates.length ? Math.max(...candidates.map(({ capacity }) => capacity.utilization!)) : null;
  const exactTolerance = highest === null ? 0 : RANKING_TOLERANCE * Math.max(1, Math.abs(highest));
  const primary = highest === null || highest === 0 ? [] : candidates
    .filter(({ capacity }) => Math.abs(capacity.utilization! - highest) <= exactTolerance)
    .map(({ reference }) => reference)
    .sort((a, b) => resourceOrder(a).localeCompare(resourceOrder(b)));
  const near = highest === null || highest === 0 ? [] : candidates
    .filter(({ capacity }) => capacity.utilization! > 0 &&
      (highest - capacity.utilization!) / highest <= BOTTLENECK_NEAR_TIE_TOLERANCE)
    .map(({ reference }) => reference)
    .sort((a, b) => resourceOrder(a).localeCompare(resourceOrder(b)));

  const primaryKeys = new Set(primary.map(resourceOrder));
  if (ownerLabor.status === "available") ownerLabor.limiting = primaryKeys.has(resourceOrder({ resourceType: "owner_labor", key: "owner_labor" }));
  if (workingCapital.status === "available") workingCapital.limiting = primaryKeys.has(resourceOrder({ resourceType: "working_capital", key: "working_capital" }));
  for (const machine of machines) {
    if (machine.capacity.status === "available") {
      machine.capacity.limiting = primaryKeys.has(resourceOrder({ resourceType: "machine", key: machine.key }));
    }
  }
  return { ownerLabor, workingCapital, machines, primaryLimitingResources: primary, nearTiedResources: near };
}

function explanationsFor(
  totals: PortfolioTotals,
  capacity: PortfolioCapacityAnalysis,
  lines: PortfolioProductLine[]
): string[] {
  const explanations = [
    `The plan contains ${totals.plannedBatches} complete batches and ${totals.plannedSellableProducts} sellable products.`,
  ];
  const over = [
    capacity.ownerLabor.status === "available" && capacity.ownerLabor.overCapacity ? "owner labor" : null,
    ...capacity.machines.filter(({ capacity: result }) => result.status === "available" && result.overCapacity).map(({ key }) => `machine ${key}`),
    capacity.workingCapital.status === "available" && capacity.workingCapital.overCapacity ? "working capital" : null,
  ].filter((value): value is string => Boolean(value));
  if (over.length) explanations.push(`The plan exceeds supplied capacity for ${over.join(", ")}.`);
  const missing = [
    capacity.ownerLabor.status === "unavailable" ? "owner labor" : null,
    ...capacity.machines.filter(({ capacity: result }) => result.status === "unavailable").map(({ key }) => `machine ${key}`),
    capacity.workingCapital.status === "unavailable" ? "working capital" : null,
  ].filter((value): value is string => Boolean(value));
  if (missing.length) explanations.push(`Capacity analysis is unavailable for ${missing.join(", ")}.`);
  const demandRisk = lines.filter(({ demand }) => demand?.status === "available" && demand.state === "excess");
  if (demandRisk.length) explanations.push(`${demandRisk.length} product line${demandRisk.length === 1 ? " exceeds" : "s exceed"} user-supplied demand ceilings.`);
  const warnings = lines.reduce((count, line) => count + line.readiness.warnings.length, 0);
  if (warnings) explanations.push(`${warnings} non-blocking data-quality warning${warnings === 1 ? "" : "s"} remain visible.`);
  return explanations;
}

function parseInput(value: unknown): { input?: PortfolioPlanInput; errors: PortfolioRequestError[] } {
  if (!isRecord(value)) return { errors: [error("malformed_request", "Portfolio input must be an object.")] };
  const errors: PortfolioRequestError[] = [];
  if (value.version !== PORTFOLIO_PLAN_INPUT_VERSION) {
    errors.push(error("unsupported_plan_input_version", `Plan input version must be ${PORTFOLIO_PLAN_INPUT_VERSION}.`, { path: "version" }));
  }
  if (!isRecord(value.period)) {
    errors.push(error("malformed_request", "Planning period must be an object.", { path: "period" }));
  }
  const periodType = isRecord(value.period) ? value.period.type : undefined;
  const periodLabel = isRecord(value.period) ? value.period.label : undefined;
  if (typeof periodType !== "string" || !periodTypes.has(periodType as PlanningPeriodType)) {
    errors.push(error("invalid_period_type", "Planning period type is invalid.", { path: "period.type" }));
  }
  const trimmedLabel = typeof periodLabel === "string" ? periodLabel.trim() : "";
  if (typeof periodLabel !== "string" || [...trimmedLabel].length < 1 || [...trimmedLabel].length > 80) {
    errors.push(error("invalid_period_label", "Planning period label must contain 1 to 80 characters after trimming.", { path: "period.label" }));
  }
  if (!Array.isArray(value.products)) {
    errors.push(error("malformed_request", "Products must be an array.", { path: "products" }));
  }
  if (!isRecord(value.constraints) || !isRecord(value.constraints.machineMinutesByKey)) {
    errors.push(error("malformed_request", "Constraints and machineMinutesByKey must be objects.", { path: "constraints" }));
  }
  if (errors.some(({ code }) => code === "malformed_request")) return { errors };

  const products: PortfolioPlanInput["products"] = [];
  for (const [index, item] of (value.products as unknown[]).entries()) {
    if (!isRecord(item) || typeof item.savedProductId !== "string") {
      errors.push(error("malformed_request", "Each product line must include a saved product ID.", { path: `products.${index}` }));
      continue;
    }
    if (!isWholeNumber(item.plannedBatches)) {
      errors.push(error("invalid_planned_batches", "Planned batches must be a nonnegative safe whole number.", {
        path: `products.${index}.plannedBatches`, productId: item.savedProductId,
      }));
    }
    if (item.demandCeilingUnits !== undefined && !isWholeNumber(item.demandCeilingUnits)) {
      errors.push(error("invalid_demand_ceiling", "Demand ceiling must be a nonnegative safe whole number.", {
        path: `products.${index}.demandCeilingUnits`, productId: item.savedProductId,
      }));
    }
    products.push({
      savedProductId: item.savedProductId,
      plannedBatches: typeof item.plannedBatches === "number" ? item.plannedBatches : Number.NaN,
      ...(item.demandCeilingUnits !== undefined ? { demandCeilingUnits: item.demandCeilingUnits as number } : {}),
    });
  }

  const constraints = value.constraints as Record<string, unknown>;
  for (const [field, supplied] of [
    ["ownerLaborMinutes", constraints.ownerLaborMinutes],
    ["workingCapital", constraints.workingCapital],
  ] as const) {
    if (supplied !== undefined && !isCapacity(supplied)) {
      errors.push(error("invalid_capacity", `${field} must be a finite nonnegative number.`, { path: `constraints.${field}` }));
    }
  }
  const machineMinutesByKey: Record<string, number | undefined> = {};
  for (const [key, supplied] of Object.entries(constraints.machineMinutesByKey as Record<string, unknown>)) {
    if (supplied !== undefined && !isCapacity(supplied)) {
      errors.push(error("invalid_capacity", `Machine capacity for ${key} must be a finite nonnegative number.`, {
        path: `constraints.machineMinutesByKey.${key}`, machineKey: key,
      }));
    } else {
      machineMinutesByKey[key] = supplied as number | undefined;
    }
  }
  return {
    input: {
      version: PORTFOLIO_PLAN_INPUT_VERSION,
      period: { type: periodType as PlanningPeriodType, label: trimmedLabel },
      products,
      constraints: {
        ...(constraints.ownerLaborMinutes !== undefined ? { ownerLaborMinutes: constraints.ownerLaborMinutes as number } : {}),
        ...(constraints.workingCapital !== undefined ? { workingCapital: constraints.workingCapital as number } : {}),
        machineMinutesByKey,
      },
    },
    errors,
  };
}

export function planPortfolio(request: PortfolioEngineRequest): PortfolioEngineResult {
  const parsed = parseInput(request.input);
  if (!parsed.input || parsed.errors.length) return invalid(parsed.errors);
  const input = parsed.input;
  const errors: PortfolioRequestError[] = [];
  if (input.products.length < 2) {
    errors.push(error("insufficient_products", "Select at least two distinct saved products.", { path: "products" }));
  }
  const seenIds = new Set<string>();
  for (const [index, line] of input.products.entries()) {
    if (seenIds.has(line.savedProductId)) {
      errors.push(error("duplicate_product_id", `Saved product ${line.savedProductId} is selected more than once.`, {
        path: `products.${index}.savedProductId`, productId: line.savedProductId,
      }));
    }
    seenIds.add(line.savedProductId);
  }
  const projectionById = new Map(request.products.map((projection) => [projection.productId, projection] as const));
  for (const [index, line] of input.products.entries()) {
    if (!projectionById.has(line.savedProductId)) {
      errors.push(error("unknown_product_id", `Saved product ${line.savedProductId} is unavailable.`, {
        path: `products.${index}.savedProductId`, productId: line.savedProductId,
      }));
    }
  }
  if (errors.length) return invalid(errors);

  const selected = input.products.map((line) => projectionById.get(line.savedProductId)!);
  const representedKeys = new Set(selected.flatMap((projection) => projection.profile.machine ? [projection.profile.machine.key] : []));
  for (const key of Object.keys(input.constraints.machineMinutesByKey)) {
    if (!representedKeys.has(key)) {
      errors.push(error("unknown_machine_capacity_key", `Machine capacity key ${key} is not represented by a selected product.`, {
        path: `constraints.machineMinutesByKey.${key}`, machineKey: key,
      }));
    }
  }
  const labelsByKey = new Map<string, Map<string, string[]>>();
  const sourceLabelsByKey = new Map<string, string[]>();
  for (const projection of selected) {
    const machine = projection.profile.machine;
    if (!machine) continue;
    const sourceLabels = sourceLabelsByKey.get(machine.key) ?? [];
    if (!sourceLabels.includes(machine.label)) sourceLabels.push(machine.label);
    sourceLabelsByKey.set(machine.key, sourceLabels);
    const normalized = normalizeMachineKey(machine.label);
    if (!normalized) continue;
    const labels = labelsByKey.get(machine.key) ?? new Map<string, string[]>();
    const products = labels.get(normalized) ?? [];
    products.push(projection.productId);
    labels.set(normalized, products);
    labelsByKey.set(machine.key, labels);
  }
  const conflictingMachineKeys = new Set(
    [...labelsByKey.entries()].filter(([, labels]) => labels.size > 1).map(([key]) => key)
  );
  const readiness = selected.map((projection) => {
    const result = readinessFor(projection);
    const machineKey = projection.profile.machine?.key;
    return machineKey && conflictingMachineKeys.has(machineKey)
      ? withReadinessReason(result, {
          code: "machine_label_conflict",
          message: `Machine key ${machineKey} has conflicting historical labels across selected products.`,
          field: "primaryMachine.label",
        })
      : result;
  });
  const readinessBlockReasons: PortfolioReadinessBlockReason[] = [];
  for (const [index, line] of input.products.entries()) {
    if (line.plannedBatches > 0 && readiness[index].status === "unready") {
      readinessBlockReasons.push({
        code: "positive_batches_for_unready_product",
        message: `${selected[index].productName} is not ready for positive planned batches.`,
        productId: line.savedProductId,
      });
    }
  }
  if (!input.products.some((line, index) => line.plannedBatches > 0 && readiness[index].status === "ready")) {
    readinessBlockReasons.push({
      code: "no_ready_positive_batches",
      message: "At least one ready product must have positive planned batches.",
    });
  }
  if (errors.length) return invalid(errors);
  if (readinessBlockReasons.length) {
    const products = input.products.map((line, index): PortfolioBlockedProductLine => ({
      productId: selected[index].productId,
      productName: selected[index].productName,
      plannedBatches: line.plannedBatches,
      ...(line.demandCeilingUnits !== undefined ? { demandCeilingUnits: line.demandCeilingUnits } : {}),
      readiness: readiness[index],
      provenance: projectionProvenance(
        selected[index],
        selected[index].profile.machine
          ? sourceLabelsByKey.get(selected[index].profile.machine.key)
          : undefined
      ),
    }));
    const warnings = sortedWarnings(readiness);
    return structuredClone({
      status: "readiness_blocked",
      planInputVersion: PORTFOLIO_PLAN_INPUT_VERSION,
      engineVersion: PORTFOLIO_ENGINE_VERSION,
      period: input.period,
      products,
      warnings,
      reasons: readinessBlockReasons,
      explanations: [
        ...readinessBlockReasons.map((reason) => reason.message),
        ...(warnings.length
          ? [`${warnings.length} non-blocking data-quality warning${warnings.length === 1 ? "" : "s"} remain visible.`]
          : []),
      ],
    });
  }

  try {
    const totals = emptyTotals();
    const lineEconomicsResults = input.products.map((line, index) =>
      readiness[index].status === "ready" ? lineEconomics(selected[index], line.plannedBatches) : null);
    for (const [index, economics] of lineEconomicsResults.entries()) {
      if (economics) aggregateLine(totals, economics, selected[index].profile.machine?.key);
    }
    totals.occupiedMachineMinutesByKey = Object.fromEntries(
      Object.entries(totals.occupiedMachineMinutesByKey).sort(([a], [b]) => a.localeCompare(b))
    );
    const products = input.products.map((line, index): PortfolioProductLine => {
      const economics = lineEconomicsResults[index];
      return {
        productId: selected[index].productId,
        productName: selected[index].productName,
        plannedBatches: line.plannedBatches,
        ...(line.demandCeilingUnits !== undefined ? { demandCeilingUnits: line.demandCeilingUnits } : {}),
        readiness: readiness[index],
        provenance: projectionProvenance(
          selected[index],
          selected[index].profile.machine
            ? sourceLabelsByKey.get(selected[index].profile.machine.key)
            : undefined
        ),
        economics,
        contributions: economics ? contributionShares(economics, totals) : null,
        demand: demandAnalysis(line.demandCeilingUnits, economics, line.plannedBatches, selected[index].profile.unitsPerBatch),
      };
    });
    const capacity = capacityAnalysis(totals, selected, input);
    const warnings = sortedWarnings(readiness);
    return structuredClone({
      status: "success",
      planInputVersion: PORTFOLIO_PLAN_INPUT_VERSION,
      engineVersion: PORTFOLIO_ENGINE_VERSION,
      period: input.period,
      products,
      totals,
      capacity,
      warnings,
      explanations: explanationsFor(totals, capacity, products),
    });
  } catch (caught) {
    if (caught instanceof Error && caught.message === "non_finite_result") {
      return invalid([error("non_finite_result", "A derived portfolio result was non-finite.")]);
    }
    throw caught;
  }
}
