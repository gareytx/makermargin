import { describe, expect, it } from "vitest";
import { customProductTemplate } from "./product-presets";
import {
  createCurrentSnapshots,
  CURRENT_CALCULATION_SNAPSHOT_VERSION,
  CURRENT_FORMULA_VERSION,
  CURRENT_PRICING_INPUT_SNAPSHOT_VERSION,
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
    expect(parsePricingInputSnapshot({ schemaVersion: "pricing-input-v2", basis: CURRENT_SNAPSHOT_BASIS, data: customProductTemplate.values })).toBeNull();
    expect(parsePricingInputSnapshot({ schemaVersion: CURRENT_PRICING_INPUT_SNAPSHOT_VERSION, basis: "per_batch", data: customProductTemplate.values })).toBeNull();
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
});
