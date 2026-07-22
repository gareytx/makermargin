import { describe, expect, it } from "vitest";
import { customProductTemplate } from "./product-presets";
import { CASH_PROFILE_VERSION, PRODUCTION_PROFILE_VERSION } from "./product-profiles";
import { createCurrentSnapshots } from "./saved-product-snapshots";
import {
  applySelectedProposals,
  buildProfileAssistantProposal,
  cashCandidates,
  type ProfileAssistantAnswers,
  type ProfileAssistantContext,
} from "./profile-assistant";

function context(overrides: Partial<ProfileAssistantContext> = {}): ProfileAssistantContext {
  const pricingInput = { ...customProductTemplate.values, machineMinutes: 20, laborMinutes: 20 };
  const snapshots = createCurrentSnapshots(pricingInput, "2026-07-22T00:00:00Z");
  return { pricingInput, calculationSnapshot: snapshots.calculationSnapshot, ...overrides };
}

const direct: ProfileAssistantAnswers = {
  unitsPerBatch: 10, usesMachine: false, laborBasis: "direct",
  setupLaborMinutesPerBatch: 10, activeLaborMinutesPerUnit: 15,
  finishingLaborMinutesPerUnit: 2,
};

describe("profile assistant proposals", () => {
  it.each([undefined, 0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid batch size %s", (unitsPerBatch) => {
    expect(buildProfileAssistantProposal(context(), { ...direct, unitsPerBatch }).errors[0]).toContain("positive whole number");
  });

  it("keeps machine-free products machine-free", () => {
    const result = buildProfileAssistantProposal(context(), direct);
    expect(result.valid).toBe(true);
    expect(result.proposals.some((item) => item.field === "machineLabel")).toBe(false);
    expect(result.proposals.find((item) => item.field === "activeLaborMinutesPerUnit")?.value).toBe(15);
  });

  it.each([
    ["per-product", undefined, 200],
    ["whole-batch", undefined, 20],
    ["different", 75, 75],
  ] as const)("uses confirmed %s machine-time basis", (machineTimeBasis, differentMachineMinutesPerBatch, expected) => {
    const result = buildProfileAssistantProposal(context(), { ...direct, usesMachine: true, machineName: "Laser One", machineTimeBasis, differentMachineMinutesPerBatch, machineSupervision: "none" });
    expect(result.proposals.find((item) => item.field === "occupiedMinutesPerBatch")?.value).toBe(expected);
  });

  it("allocates calculator labor without double-counting supervision", () => {
    const result = buildProfileAssistantProposal(context(), {
      unitsPerBatch: 10, usesMachine: true, machineName: "Laser", machineTimeBasis: "whole-batch",
      machineSupervision: "specific", specificSupervisedMinutesPerBatch: 20,
      laborBasis: "calculator", setupLaborMinutesPerBatch: 10, finishingLaborMinutesPerUnit: 2,
    });
    const active = result.proposals.find((item) => item.field === "activeLaborMinutesPerUnit");
    expect(active?.value).toBe(15);
    expect(active?.explanation).toContain("(20 × 10 − 10 − 2 × 10 − 20) ÷ 10");
  });

  it("supports zero/full/unknown supervision and rejects excess supervision", () => {
    const base = { ...direct, usesMachine: true, machineName: "Laser", machineTimeBasis: "whole-batch" as const };
    expect(buildProfileAssistantProposal(context(), { ...base, machineSupervision: "none" }).proposals.find((item) => item.field === "supervisedMinutesPerBatch")?.value).toBe(0);
    expect(buildProfileAssistantProposal(context(), { ...base, machineSupervision: "full-run" }).proposals.find((item) => item.field === "supervisedMinutesPerBatch")?.value).toBe(20);
    expect(buildProfileAssistantProposal(context(), { ...base, machineSupervision: "unknown" }).proposals.some((item) => item.field === "supervisedMinutesPerBatch")).toBe(false);
    expect(buildProfileAssistantProposal(context(), { ...base, machineSupervision: "specific", specificSupervisedMinutesPerBatch: 21 }).valid).toBe(false);
  });

  it("leaves unknown supervision missing without converting it to zero", () => {
    const result = buildProfileAssistantProposal(context(), {
      unitsPerBatch: 10, usesMachine: true, machineName: "Laser", machineTimeBasis: "whole-batch",
      machineSupervision: "unknown", laborBasis: "calculator",
      setupLaborMinutesPerBatch: 10, finishingLaborMinutesPerUnit: 2,
    });
    expect(result.valid).toBe(true);
    expect(result.proposals.some((item) => item.field === "supervisedMinutesPerBatch")).toBe(false);
    expect(result.proposals.some((item) => item.field === "activeLaborMinutesPerUnit")).toBe(false);
    expect(result.warnings.join(" ")).toContain("cannot yet be derived");
  });

  it("rejects a negative calculator-labor residual", () => {
    const result = buildProfileAssistantProposal(context(), { unitsPerBatch: 2, usesMachine: false, laborBasis: "calculator", setupLaborMinutesPerBatch: 50, finishingLaborMinutesPerUnit: 0 });
    expect(result.errors.join(" ")).toContain("would be negative");
  });

  it("preserves existing values, keys, and conflicts for review", () => {
    const productionProfile = { schemaVersion: PRODUCTION_PROFILE_VERSION, unitsPerBatch: 4, primaryMachine: { key: "stable-laser", label: "Stable Laser", occupiedMinutesPerBatch: 40, supervisedMinutesPerBatch: 0 } } as const;
    const result = buildProfileAssistantProposal(context({ productionProfile }), { ...direct, usesMachine: true, machineName: "Renamed Laser", machineTimeBasis: "whole-batch", machineSupervision: "none" });
    const units = result.proposals.find((item) => item.field === "unitsPerBatch")!;
    expect(units).toMatchObject({ currentValue: 4, replacesExisting: true, selectedByDefault: false });
    expect(productionProfile.primaryMachine.key).toBe("stable-laser");
  });

  it("classifies supported cash components independently and excludes economic costs", () => {
    const ctx = context();
    const ids = cashCandidates(ctx).map((item) => item.id);
    expect(ids).toEqual(expect.arrayContaining(["material", "packaging", "waste", "shipping", "fees"]));
    expect(ids).not.toEqual(expect.arrayContaining(["labor", "machine", "trueBaseCost"]));
    const result = buildProfileAssistantProposal(ctx, { ...direct, cashTimings: { material: "before-payout", packaging: "after-payout", waste: "not-cash", shipping: "unknown", fees: "after-payout" } });
    const total = result.proposals.find((item) => item.field === "cashCostPerSale")?.value as number;
    const upfront = result.proposals.find((item) => item.field === "upfrontCashCostPerUnit")?.value;
    expect(total).toBeCloseTo(ctx.pricingInput.materialCost + ctx.pricingInput.packagingCost + ctx.calculationSnapshot.data.result.estimatedFees);
    expect(upfront).toBe(ctx.pricingInput.materialCost);
    expect(result.warnings.join(" ")).toContain("Shipping included in price remains unknown");
  });

  it("does not insert separately charged shipping", () => {
    const pricingInput = { ...context().pricingInput, shippingCost: 25, customerPaysShipping: true };
    const snapshots = createCurrentSnapshots(pricingInput, "2026-07-22T00:00:00Z");
    expect(cashCandidates({ pricingInput, calculationSnapshot: snapshots.calculationSnapshot }).some((item) => item.id === "shipping")).toBe(false);
  });

  it("preserves explicit zero fixed costs and warns on implausible elapsed time", () => {
    const result = buildProfileAssistantProposal(context(), { ...direct, usesMachine: true, machineName: "Laser", machineTimeBasis: "whole-batch", machineSupervision: "full-run", totalElapsedMinutesPerBatch: 10, fixedBatchCostAnswer: "zero", launchCostAnswer: "zero" });
    expect(result.proposals.find((item) => item.field === "fixedUpfrontCashCostPerBatch")).toMatchObject({ value: 0, source: "explicit-zero" });
    expect(result.proposals.find((item) => item.field === "fixedProductLaunchCost")).toMatchObject({ value: 0, source: "explicit-zero" });
    expect(result.warnings.join(" ")).toContain("shorter");
  });

  it("derives explicit zero cash when every reviewed component is not a cash cost", () => {
    const ctx = context();
    const cashTimings = Object.fromEntries(cashCandidates(ctx).map((candidate) => [candidate.id, "not-cash"])) as ProfileAssistantAnswers["cashTimings"];
    const result = buildProfileAssistantProposal(ctx, { ...direct, cashTimings });
    expect(result.proposals.find((item) => item.field === "cashCostPerSale")).toMatchObject({ value: 0, source: "explicit-zero" });
    expect(result.proposals.find((item) => item.field === "upfrontCashCostPerUnit")).toMatchObject({ value: 0, source: "explicit-zero" });
  });

  it("selects blank fields only, identifies current values, and applies selected proposals only", () => {
    const cashProfile = { schemaVersion: CASH_PROFILE_VERSION, fixedProductLaunchCost: 0 } as const;
    const result = buildProfileAssistantProposal(context({ cashProfile }), { ...direct, fixedBatchCostAnswer: "zero", launchCostAnswer: "zero" });
    expect(result.proposals.find((item) => item.field === "fixedProductLaunchCost")).toMatchObject({ alreadyCurrent: true, selectedByDefault: false });
    const next = applySelectedProposals({ unitsPerBatch: "", activeLaborMinutesPerUnit: "99" }, result.proposals, new Set(["unitsPerBatch"]));
    expect(next.unitsPerBatch).toBe("10");
    expect(next.activeLaborMinutesPerUnit).toBe("99");
  });
});
