import { describe, expect, it } from "vitest";
import { customProductTemplate } from "./product-presets";
import { CASH_PROFILE_VERSION, PRODUCTION_PROFILE_VERSION } from "./product-profiles";
import {
  createCurrentSnapshots,
  CURRENT_CALCULATION_SNAPSHOT_VERSION,
  CURRENT_FORMULA_VERSION,
  CURRENT_PRICING_INPUT_SNAPSHOT_VERSION,
  PRICING_INPUT_SNAPSHOT_VERSION_V1,
  CURRENT_SNAPSHOT_BASIS,
  parseCalculationSnapshot,
  parsePricingInputSnapshot,
  serializePricingInputSnapshot,
} from "./saved-product-snapshots";

describe("saved product snapshots", () => {
  it("serializes complete input and calculation snapshots with authoritative versions", () => {
    const snapshots = createCurrentSnapshots(customProductTemplate.values, "2026-07-21T12:00:00.000Z");
    expect(snapshots.formulaVersion).toBe(CURRENT_FORMULA_VERSION);
    expect(snapshots.pricingInputs).toMatchObject({ schemaVersion: CURRENT_PRICING_INPUT_SNAPSHOT_VERSION, basis: CURRENT_SNAPSHOT_BASIS });
    expect(snapshots.calculationSnapshot).toMatchObject({ schemaVersion: CURRENT_CALCULATION_SNAPSHOT_VERSION, basis: CURRENT_SNAPSHOT_BASIS, formulaVersion: CURRENT_FORMULA_VERSION });
    expect(snapshots.calculationSnapshot.data.viability.summary).toBeTruthy();
  });

  it("preserves known zero and rejects a missing required numeric value", () => {
    const input = { ...customProductTemplate.values, materialCost: 0 };
    expect(serializePricingInputSnapshot(input).data.materialCost).toBe(0);
    const snapshot = serializePricingInputSnapshot(input) as unknown as { data: Record<string, unknown> };
    delete snapshot.data.materialCost;
    expect(parsePricingInputSnapshot(snapshot)).toBeNull();
  });

  it("rejects malformed and unsupported input snapshots", () => {
    expect(parsePricingInputSnapshot(null)).toBeNull();
    expect(parsePricingInputSnapshot({ schemaVersion: "pricing-input-v3", basis: CURRENT_SNAPSHOT_BASIS, data: customProductTemplate.values })).toBeNull();
    expect(parsePricingInputSnapshot({ schemaVersion: CURRENT_PRICING_INPUT_SNAPSHOT_VERSION, basis: "per_batch", data: customProductTemplate.values })).toBeNull();
  });

  it("continues to parse historical v1 inputs without rewriting them", () => {
    const historical = { schemaVersion: PRICING_INPUT_SNAPSHOT_VERSION_V1, basis: CURRENT_SNAPSHOT_BASIS, data: customProductTemplate.values } as const;
    const parsed = parsePricingInputSnapshot(historical);
    expect(parsed).toEqual(historical);
    expect(parsed?.schemaVersion).toBe("pricing-input-v1");
    expect(serializePricingInputSnapshot(parsed!.data).schemaVersion).toBe("pricing-input-v2");
  });

  it("requires calculation and database formula versions to agree", () => {
    const snapshot = createCurrentSnapshots(customProductTemplate.values).calculationSnapshot;
    expect(parseCalculationSnapshot(snapshot, CURRENT_FORMULA_VERSION)).toEqual(snapshot);
    expect(parseCalculationSnapshot(snapshot, "pricing-v2")).toBeNull();
    expect(parseCalculationSnapshot({ ...snapshot, formulaVersion: "pricing-v2" }, "pricing-v2")).toBeNull();
  });

  it("returns defensive copies without silently mutating historical values", () => {
    const original = serializePricingInputSnapshot(customProductTemplate.values);
    const parsed = parsePricingInputSnapshot(original)!;
    parsed.data.productName = "Changed";
    expect(original.data.productName).toBe(customProductTemplate.values.productName);
  });

  it("rejects non-finite and malformed calculation data", () => {
    const snapshot = createCurrentSnapshots(customProductTemplate.values).calculationSnapshot;
    const malformed = structuredClone(snapshot);
    malformed.data.result.netProfit = Number.NaN;
    expect(parseCalculationSnapshot(malformed, CURRENT_FORMULA_VERSION)).toBeNull();
  });

  it("writes v2 profiles while calculation and formula versions remain v1", () => {
    const snapshots = createCurrentSnapshots(customProductTemplate.values, undefined, {
      productionProfile: { schemaVersion: PRODUCTION_PROFILE_VERSION, unitsPerBatch: 2, setupLaborMinutesPerBatch: 0 },
      cashProfile: { schemaVersion: CASH_PROFILE_VERSION, upfrontCashCostPerUnit: 0 },
    });
    expect(snapshots.pricingInputs).toMatchObject({
      schemaVersion: "pricing-input-v2",
      productionProfile: { unitsPerBatch: 2, setupLaborMinutesPerBatch: 0 },
      cashProfile: { upfrontCashCostPerUnit: 0 },
    });
    expect(snapshots.calculationSnapshot.schemaVersion).toBe("calculation-snapshot-v1");
    expect(snapshots.formulaVersion).toBe("pricing-v1");
  });

  it("preserves missing optional profile values as missing", () => {
    const snapshot = serializePricingInputSnapshot(customProductTemplate.values, {
      productionProfile: { schemaVersion: PRODUCTION_PROFILE_VERSION, unitsPerBatch: 1 },
    });
    expect(snapshot.productionProfile).not.toHaveProperty("setupLaborMinutesPerBatch");
    expect(snapshot).not.toHaveProperty("cashProfile");
    const emptyCash = serializePricingInputSnapshot(customProductTemplate.values, { cashProfile: { schemaVersion: CASH_PROFILE_VERSION } });
    expect(emptyCash).not.toHaveProperty("cashProfile");
  });

  it("rejects malformed nested profiles and incorrect v2 basis", () => {
    const base = serializePricingInputSnapshot(customProductTemplate.values);
    expect(parsePricingInputSnapshot({ ...base, productionProfile: { schemaVersion: PRODUCTION_PROFILE_VERSION, unitsPerBatch: 0 } })).toBeNull();
    expect(parsePricingInputSnapshot({ ...base, cashProfile: { schemaVersion: CASH_PROFILE_VERSION, cashCostPerSale: -1 } })).toBeNull();
    expect(parsePricingInputSnapshot({ ...base, cashProfile: { schemaVersion: CASH_PROFILE_VERSION } })).toBeNull();
    expect(parsePricingInputSnapshot({ ...base, basis: "per_batch" })).toBeNull();
  });
});
