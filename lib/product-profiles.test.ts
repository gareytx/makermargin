import { describe, expect, it } from "vitest";
import {
  CASH_PROFILE_VERSION,
  PRODUCTION_PROFILE_VERSION,
  deriveActiveLaborMinutesPerBatch,
  deriveActiveLaborMinutesPerUnit,
  deriveOccupiedMachineMinutesPerUnit,
  deriveUpfrontCashRequiredPerBatch,
  normalizeMachineKey,
  validateCashProfile,
  validateProductionProfile,
  type CashProfileV1,
  type ProductionProfileV1,
} from "./product-profiles";

const production: ProductionProfileV1 = {
  schemaVersion: PRODUCTION_PROFILE_VERSION,
  unitsPerBatch: 4,
  setupLaborMinutesPerBatch: 10,
  activeLaborMinutesPerUnit: 5,
  finishingLaborMinutesPerUnit: 2,
  primaryMachine: { key: "laser-one", label: "Laser One", occupiedMinutesPerBatch: 40, supervisedMinutesPerBatch: 5 },
};
const cash: CashProfileV1 = { schemaVersion: CASH_PROFILE_VERSION, upfrontCashCostPerUnit: 3, fixedUpfrontCashCostPerBatch: 8 };

describe("product profile contracts", () => {
  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid units per batch: %s", (unitsPerBatch) => {
    expect(validateProductionProfile({ ...production, unitsPerBatch }).valid).toBe(false);
  });

  it("accepts a positive whole batch size and preserves explicit zero", () => {
    const result = validateProductionProfile({ ...production, setupLaborMinutesPerBatch: 0 });
    expect(result.valid && result.value.setupLaborMinutesPerBatch).toBe(0);
  });

  it("rejects negative and non-finite production time", () => {
    expect(validateProductionProfile({ ...production, passiveWaitMinutesPerBatch: -1 }).valid).toBe(false);
    expect(validateProductionProfile({ ...production, totalElapsedMinutesPerBatch: Number.NaN }).valid).toBe(false);
  });

  it("rejects supervision beyond occupied machine time", () => {
    expect(validateProductionProfile({ ...production, primaryMachine: { ...production.primaryMachine!, supervisedMinutesPerBatch: 41 } }).valid).toBe(false);
  });

  it("validates and normalizes stable machine identifiers", () => {
    expect(normalizeMachineKey("  CO2 Laser / One ")).toBe("co2-laser-one");
    expect(validateProductionProfile({ ...production, primaryMachine: { ...production.primaryMachine!, key: "Bad Key" } }).valid).toBe(false);
    expect(validateProductionProfile({ ...production, primaryMachine: { ...production.primaryMachine!, label: " Laser " } }).valid).toBe(false);
  });

  it("rejects negative and non-finite cash values while retaining zero", () => {
    expect(validateCashProfile({ schemaVersion: CASH_PROFILE_VERSION, cashCostPerSale: -1 }).valid).toBe(false);
    expect(validateCashProfile({ schemaVersion: CASH_PROFILE_VERSION, cashCostPerSale: Number.POSITIVE_INFINITY }).valid).toBe(false);
    const zero = validateCashProfile({ schemaVersion: CASH_PROFILE_VERSION, cashCostPerSale: 0 });
    expect(zero.valid && zero.value.cashCostPerSale).toBe(0);
  });

  it("derives active labor per batch and per product", () => {
    expect(deriveActiveLaborMinutesPerBatch(production)).toEqual({ available: true, value: 43 });
    expect(deriveActiveLaborMinutesPerUnit(production)).toEqual({ available: true, value: 10.75 });
  });

  it("derives machine-free active labor without fabricating supervision", () => {
    const machineFree = { ...production, primaryMachine: undefined };
    expect(deriveActiveLaborMinutesPerBatch(machineFree)).toEqual({ available: true, value: 38 });
    expect(deriveActiveLaborMinutesPerUnit(machineFree)).toEqual({ available: true, value: 9.5 });
    expect(deriveOccupiedMachineMinutesPerUnit(machineFree)).toMatchObject({ available: false, missingField: "primaryMachine" });
  });

  it("still requires explicit supervision for machine products", () => {
    const missingSupervision = { ...production, primaryMachine: { ...production.primaryMachine!, supervisedMinutesPerBatch: undefined } };
    expect(deriveActiveLaborMinutesPerBatch(missingSupervision)).toMatchObject({ available: false, missingField: "primaryMachine.supervisedMinutesPerBatch" });
  });

  it("derives occupied machine minutes per product without infinity", () => {
    expect(deriveOccupiedMachineMinutesPerUnit(production)).toEqual({ available: true, value: 10 });
    expect(deriveOccupiedMachineMinutesPerUnit({ ...production, primaryMachine: undefined })).toMatchObject({ available: false, missingField: "primaryMachine" });
  });

  it("derives upfront cash required per batch", () => {
    expect(deriveUpfrontCashRequiredPerBatch(production, cash)).toEqual({ available: true, value: 20 });
  });

  it("returns structured missing-field reasons instead of zero", () => {
    expect(deriveActiveLaborMinutesPerBatch({ ...production, setupLaborMinutesPerBatch: undefined })).toMatchObject({ available: false, missingField: "setupLaborMinutesPerBatch" });
    expect(deriveUpfrontCashRequiredPerBatch(production, { schemaVersion: CASH_PROFILE_VERSION })).toMatchObject({ available: false, missingField: "upfrontCashCostPerUnit" });
  });
});
