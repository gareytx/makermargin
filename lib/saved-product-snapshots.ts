import {
  calculatePricing,
  calculateViability,
  type PricingInput,
  type PricingResult,
  type ProductViability,
} from "./calculations";

export const CURRENT_FORMULA_VERSION = "pricing-v1" as const;
export const CURRENT_PRICING_INPUT_SNAPSHOT_VERSION = "pricing-input-v1" as const;
export const CURRENT_CALCULATION_SNAPSHOT_VERSION = "calculation-snapshot-v1" as const;
export const CURRENT_SNAPSHOT_BASIS = "per_sellable_product" as const;

export type FormulaVersion = typeof CURRENT_FORMULA_VERSION;
export type PricingInputSnapshotVersion = typeof CURRENT_PRICING_INPUT_SNAPSHOT_VERSION;
export type CalculationSnapshotVersion = typeof CURRENT_CALCULATION_SNAPSHOT_VERSION;
export type SnapshotBasis = typeof CURRENT_SNAPSHOT_BASIS;

export type PricingInputSnapshot = {
  schemaVersion: PricingInputSnapshotVersion;
  basis: SnapshotBasis;
  data: PricingInput;
};

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

export function serializePricingInputSnapshot(input: PricingInput): PricingInputSnapshot {
  if (!isPricingInput(input)) throw new Error("Pricing inputs are malformed.");
  return {
    schemaVersion: CURRENT_PRICING_INPUT_SNAPSHOT_VERSION,
    basis: CURRENT_SNAPSHOT_BASIS,
    data: structuredClone(input),
  };
}

export function parsePricingInputSnapshot(value: unknown): PricingInputSnapshot | null {
  if (!isRecord(value) || value.schemaVersion !== CURRENT_PRICING_INPUT_SNAPSHOT_VERSION ||
    value.basis !== CURRENT_SNAPSHOT_BASIS || !isPricingInput(value.data)) return null;
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

export function createCurrentSnapshots(input: PricingInput, calculatedAt?: string): SnapshotPair {
  const calculation = calculatePricing(input);
  if (!calculation.valid) throw new Error(calculation.validation.errors.join(" "));
  const viability = calculateViability(input, calculation.result);
  return {
    pricingInputs: serializePricingInputSnapshot(input),
    calculationSnapshot: serializeCalculationSnapshot(
      calculation.result,
      viability,
      calculation.validation.warnings,
      calculatedAt
    ),
    formulaVersion: CURRENT_FORMULA_VERSION,
  };
}
