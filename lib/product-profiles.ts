export const PRODUCTION_PROFILE_VERSION = "production-profile-v1" as const;
export const CASH_PROFILE_VERSION = "cash-profile-v1" as const;

export type PrimaryMachineV1 = {
  key: string;
  label: string;
  occupiedMinutesPerBatch: number;
  supervisedMinutesPerBatch?: number;
};

export type ProductionProfileV1 = {
  schemaVersion: typeof PRODUCTION_PROFILE_VERSION;
  unitsPerBatch: number;
  setupLaborMinutesPerBatch?: number;
  activeLaborMinutesPerUnit?: number;
  finishingLaborMinutesPerUnit?: number;
  primaryMachine?: PrimaryMachineV1;
  passiveWaitMinutesPerBatch?: number;
  totalElapsedMinutesPerBatch?: number;
};

export type CashProfileV1 = {
  schemaVersion: typeof CASH_PROFILE_VERSION;
  cashCostPerSale?: number;
  upfrontCashCostPerUnit?: number;
  fixedUpfrontCashCostPerBatch?: number;
  fixedProductLaunchCost?: number;
};

export type ProfileValidation<T> =
  | { valid: true; value: T }
  | { valid: false; errors: string[] };

export type DerivedProfileValue =
  | { available: true; value: number }
  | { available: false; missingField: string; reason: string };

const productionNumbers = [
  "setupLaborMinutesPerBatch", "activeLaborMinutesPerUnit",
  "finishingLaborMinutesPerUnit", "passiveWaitMinutesPerBatch",
  "totalElapsedMinutesPerBatch",
] as const satisfies readonly (keyof ProductionProfileV1)[];

const cashNumbers = [
  "cashCostPerSale", "upfrontCashCostPerUnit",
  "fixedUpfrontCashCostPerBatch", "fixedProductLaunchCost",
] as const satisfies readonly (keyof CashProfileV1)[];

export function hasCashProfileValues(profile: CashProfileV1) {
  return cashNumbers.some((field) => profile[field] !== undefined);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function optionalNonnegative(value: unknown, label: string, errors: string[]) {
  if (value === undefined) return;
  if (typeof value !== "number" || !Number.isFinite(value)) errors.push(`${label} must be a finite number.`);
  else if (value < 0) errors.push(`${label} cannot be negative.`);
}

export function validateProductionProfile(value: unknown): ProfileValidation<ProductionProfileV1> {
  const errors: string[] = [];
  if (!isRecord(value) || value.schemaVersion !== PRODUCTION_PROFILE_VERSION) {
    return { valid: false, errors: ["Production profile version is unsupported."] };
  }
  if (typeof value.unitsPerBatch !== "number" || !Number.isFinite(value.unitsPerBatch) ||
    !Number.isInteger(value.unitsPerBatch) || value.unitsPerBatch <= 0) {
    errors.push("Units per batch must be a positive whole number.");
  }
  for (const field of productionNumbers) optionalNonnegative(value[field], field, errors);

  if (value.primaryMachine !== undefined) {
    if (!isRecord(value.primaryMachine)) errors.push("Primary machine is malformed.");
    else {
      const machine = value.primaryMachine;
      if (typeof machine.key !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(machine.key)) errors.push("Machine key must be a lowercase slug.");
      if (typeof machine.label !== "string" || !machine.label.trim() || machine.label !== machine.label.trim()) errors.push("Machine name must be trimmed and non-empty.");
      optionalNonnegative(machine.occupiedMinutesPerBatch, "Occupied machine minutes per batch", errors);
      if (machine.occupiedMinutesPerBatch === undefined) errors.push("Occupied machine minutes per batch is required when a machine is provided.");
      optionalNonnegative(machine.supervisedMinutesPerBatch, "Supervised machine minutes per batch", errors);
      if (typeof machine.supervisedMinutesPerBatch === "number" && typeof machine.occupiedMinutesPerBatch === "number" &&
        machine.supervisedMinutesPerBatch > machine.occupiedMinutesPerBatch) errors.push("Supervised machine time cannot exceed occupied machine time.");
    }
  }
  return errors.length ? { valid: false, errors } : { valid: true, value: structuredClone(value) as ProductionProfileV1 };
}

export function validateCashProfile(value: unknown): ProfileValidation<CashProfileV1> {
  const errors: string[] = [];
  if (!isRecord(value) || value.schemaVersion !== CASH_PROFILE_VERSION) {
    return { valid: false, errors: ["Cash profile version is unsupported."] };
  }
  for (const field of cashNumbers) optionalNonnegative(value[field], field, errors);
  return errors.length ? { valid: false, errors } : { valid: true, value: structuredClone(value) as CashProfileV1 };
}

export function normalizeMachineKey(label: string) {
  return label.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function missing(field: string): DerivedProfileValue {
  return { available: false, missingField: field, reason: `${field} is required for this calculation.` };
}

export function deriveActiveLaborMinutesPerBatch(profile: ProductionProfileV1): DerivedProfileValue {
  if (profile.setupLaborMinutesPerBatch === undefined) return missing("setupLaborMinutesPerBatch");
  if (profile.activeLaborMinutesPerUnit === undefined) return missing("activeLaborMinutesPerUnit");
  if (profile.finishingLaborMinutesPerUnit === undefined) return missing("finishingLaborMinutesPerUnit");
  if (profile.primaryMachine && profile.primaryMachine.supervisedMinutesPerBatch === undefined) return missing("primaryMachine.supervisedMinutesPerBatch");
  const supervisedMinutes = profile.primaryMachine?.supervisedMinutesPerBatch ?? 0;
  return { available: true, value: profile.setupLaborMinutesPerBatch +
    profile.unitsPerBatch * profile.activeLaborMinutesPerUnit +
    profile.unitsPerBatch * profile.finishingLaborMinutesPerUnit +
    supervisedMinutes };
}

export function deriveActiveLaborMinutesPerUnit(profile: ProductionProfileV1): DerivedProfileValue {
  const batch = deriveActiveLaborMinutesPerBatch(profile);
  return batch.available ? { available: true, value: batch.value / profile.unitsPerBatch } : batch;
}

export function deriveOccupiedMachineMinutesPerUnit(profile: ProductionProfileV1): DerivedProfileValue {
  if (!profile.primaryMachine) return missing("primaryMachine");
  return { available: true, value: profile.primaryMachine.occupiedMinutesPerBatch / profile.unitsPerBatch };
}

export function deriveUpfrontCashRequiredPerBatch(
  production: ProductionProfileV1,
  cash: CashProfileV1
): DerivedProfileValue {
  if (cash.upfrontCashCostPerUnit === undefined) return missing("upfrontCashCostPerUnit");
  if (cash.fixedUpfrontCashCostPerBatch === undefined) return missing("fixedUpfrontCashCostPerBatch");
  return { available: true, value: production.unitsPerBatch * cash.upfrontCashCostPerUnit + cash.fixedUpfrontCashCostPerBatch };
}
