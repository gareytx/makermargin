import {
  calculatePricing,
  calculateViability,
  type PricingInput,
  type PricingResult,
  type ProductViability,
} from "./calculations";
import {
  validateCashProfile,
  validateProductionProfile,
  hasCashProfileValues,
  type CashProfileV1,
  type ProductionProfileV1,
} from "./product-profiles";

export const CURRENT_FORMULA_VERSION = "pricing-v1" as const;
export const PRICING_INPUT_SNAPSHOT_VERSION_V1 = "pricing-input-v1" as const;
export const CURRENT_PRICING_INPUT_SNAPSHOT_VERSION = "pricing-input-v2" as const;
export const CURRENT_CALCULATION_SNAPSHOT_VERSION = "calculation-snapshot-v1" as const;
export const CURRENT_SNAPSHOT_BASIS = "per_sellable_product" as const;

export type FormulaVersion = typeof CURRENT_FORMULA_VERSION;
export type PricingInputSnapshotVersion = typeof PRICING_INPUT_SNAPSHOT_VERSION_V1 | typeof CURRENT_PRICING_INPUT_SNAPSHOT_VERSION;
export type CalculationSnapshotVersion = typeof CURRENT_CALCULATION_SNAPSHOT_VERSION;
export type SnapshotBasis = typeof CURRENT_SNAPSHOT_BASIS;

export type PricingInputSnapshotV1 = {
  schemaVersion: typeof PRICING_INPUT_SNAPSHOT_VERSION_V1;
  basis: SnapshotBasis;
  data: PricingInput;
};

export type PricingInputSnapshotV2 = {
  schemaVersion: typeof CURRENT_PRICING_INPUT_SNAPSHOT_VERSION;
  basis: SnapshotBasis;
  data: PricingInput;
  productionProfile?: ProductionProfileV1;
  cashProfile?: CashProfileV1;
};

export type PricingInputSnapshot = PricingInputSnapshotV1 | PricingInputSnapshotV2;

export type CalculationSnapshot = {
  schemaVersion: CalculationSnapshotVersion;
  basis: SnapshotBasis;
  formulaVersion: FormulaVersion;
  data: {
    result: PricingResult;
    viability: ProductViability;
    calculatedAt: string;
    warnings: string[];
  };
};

type SnapshotPair = {
  pricingInputs: PricingInputSnapshot;
  calculationSnapshot: CalculationSnapshot;
  formulaVersion: FormulaVersion;
};

const inputNumberFields = [
  "materialCost", "packagingCost", "otherCost", "wastePercentage",
  "machineMinutes", "machineHourlyRate", "laborMinutes", "laborHourlyRate",
  "marketplaceFeePercentage", "processingFeePercentage", "fixedTransactionFee",
  "shippingCost", "desiredMarginPercentage",
] as const satisfies readonly (keyof PricingInput)[];

const resultNumberFields = [
  "hardCost", "wasteCost", "machineCost", "laborCost", "shippingCostIncluded",
  "trueBaseCost", "recommendedPrice", "estimatedFees", "netProfit",
  "profitMarginPercentage", "effectiveHourlyEarnings",
] as const satisfies readonly (keyof PricingResult)[];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteFields<T extends object>(value: T, fields: readonly (keyof T)[]) {
  return fields.every((field) => typeof value[field] === "number" && Number.isFinite(value[field]));
}

function isPricingInput(value: unknown): value is PricingInput {
  return isRecord(value) && typeof value.productName === "string" &&
    typeof value.customerPaysShipping === "boolean" &&
    isFiniteFields(value as PricingInput, inputNumberFields);
}

function isPricingResult(value: unknown): value is PricingResult {
  return isRecord(value) && isFiniteFields(value as PricingResult, resultNumberFields);
}

function isViability(value: unknown): value is ProductViability {
  return isRecord(value) && typeof value.score === "number" && Number.isFinite(value.score) &&
    typeof value.label === "string" && typeof value.summary === "string" &&
    typeof value.recommendation === "string";
}

export function serializePricingInputSnapshot(
  input: PricingInput,
  profiles: { productionProfile?: ProductionProfileV1; cashProfile?: CashProfileV1 } = {}
): PricingInputSnapshotV2 {
  if (!isPricingInput(input)) throw new Error("Pricing inputs are malformed.");
  if (profiles.productionProfile && !validateProductionProfile(profiles.productionProfile).valid) throw new Error("Production profile is malformed.");
  if (profiles.cashProfile && !validateCashProfile(profiles.cashProfile).valid) throw new Error("Cash profile is malformed.");
  return {
    schemaVersion: CURRENT_PRICING_INPUT_SNAPSHOT_VERSION,
    basis: CURRENT_SNAPSHOT_BASIS,
    data: structuredClone(input),
    ...(profiles.productionProfile ? { productionProfile: structuredClone(profiles.productionProfile) } : {}),
    ...(profiles.cashProfile && hasCashProfileValues(profiles.cashProfile) ? { cashProfile: structuredClone(profiles.cashProfile) } : {}),
  };
}

export function parsePricingInputSnapshot(value: unknown): PricingInputSnapshot | null {
  if (!isRecord(value) || value.basis !== CURRENT_SNAPSHOT_BASIS || !isPricingInput(value.data)) return null;
  if (value.schemaVersion === PRICING_INPUT_SNAPSHOT_VERSION_V1) return structuredClone(value) as PricingInputSnapshotV1;
  if (value.schemaVersion !== CURRENT_PRICING_INPUT_SNAPSHOT_VERSION) return null;
  if (value.productionProfile !== undefined && !validateProductionProfile(value.productionProfile).valid) return null;
  if (value.cashProfile !== undefined &&
    (!validateCashProfile(value.cashProfile).valid || !hasCashProfileValues(value.cashProfile as CashProfileV1))) return null;
  return structuredClone(value) as PricingInputSnapshot;
}

export function serializeCalculationSnapshot(
  result: PricingResult,
  viability: ProductViability,
  warnings: string[],
  calculatedAt = new Date().toISOString()
): CalculationSnapshot {
  if (!isPricingResult(result) || !isViability(viability) ||
    !warnings.every((warning) => typeof warning === "string") || !Number.isFinite(Date.parse(calculatedAt))) {
    throw new Error("Calculation snapshot is malformed.");
  }
  return {
    schemaVersion: CURRENT_CALCULATION_SNAPSHOT_VERSION,
    basis: CURRENT_SNAPSHOT_BASIS,
    formulaVersion: CURRENT_FORMULA_VERSION,
    data: { result: structuredClone(result), viability: structuredClone(viability), calculatedAt, warnings: [...warnings] },
  };
}

export function parseCalculationSnapshot(
  value: unknown,
  formulaVersion: string
): CalculationSnapshot | null {
  if (!isRecord(value) || value.schemaVersion !== CURRENT_CALCULATION_SNAPSHOT_VERSION ||
    value.basis !== CURRENT_SNAPSHOT_BASIS || value.formulaVersion !== CURRENT_FORMULA_VERSION ||
    value.formulaVersion !== formulaVersion || !isRecord(value.data) ||
    !isPricingResult(value.data.result) || !isViability(value.data.viability) ||
    typeof value.data.calculatedAt !== "string" || !Number.isFinite(Date.parse(value.data.calculatedAt)) ||
    !Array.isArray(value.data.warnings) || !value.data.warnings.every((warning) => typeof warning === "string")) return null;
  return structuredClone(value) as CalculationSnapshot;
}

export function createCurrentSnapshots(
  input: PricingInput,
  calculatedAt?: string,
  profiles: { productionProfile?: ProductionProfileV1; cashProfile?: CashProfileV1 } = {}
): SnapshotPair {
  const calculation = calculatePricing(input);
  if (!calculation.valid) throw new Error(calculation.validation.errors.join(" "));
  const viability = calculateViability(input, calculation.result);
  return {
    pricingInputs: serializePricingInputSnapshot(input, profiles),
    calculationSnapshot: serializeCalculationSnapshot(
      calculation.result,
      viability,
      calculation.validation.warnings,
      calculatedAt
    ),
    formulaVersion: CURRENT_FORMULA_VERSION,
  };
}
