import { describe, expect, it } from "vitest";
import { customProductTemplate } from "./product-presets";
import { CASH_PROFILE_VERSION, PRODUCTION_PROFILE_VERSION } from "./product-profiles";
import {
  BOTTLENECK_NEAR_TIE_TOLERANCE,
  COMPARISON_COMPATIBILITY_MATRIX,
  COMPARISON_ENGINE_VERSION,
  RANKING_TOLERANCE,
  compareSavedProducts,
  type ComparisonConstraints,
} from "./product-comparison";
import {
  createCurrentSnapshots,
  PRICING_INPUT_SNAPSHOT_VERSION_V1,
  type PricingInputSnapshotV1,
  type PricingInputSnapshotV2,
} from "./saved-product-snapshots";
import type { SavedProduct } from "./saved-products";

const generatedAt = "2026-07-21T12:00:00.000Z";

function product(
  id: string,
  name: string,
  options: {
    netProfit?: number;
    margin?: number;
    laborCost?: number;
    machineCost?: number;
    price?: number;
    production?: PricingInputSnapshotV2["productionProfile"];
    cash?: PricingInputSnapshotV2["cashProfile"];
    v1?: boolean;
  } = {}
): SavedProduct {
  const pair = createCurrentSnapshots(customProductTemplate.values, generatedAt, {
    productionProfile: options.production,
    cashProfile: options.cash,
  });
  pair.calculationSnapshot.data.result.netProfit = options.netProfit ?? 20;
  pair.calculationSnapshot.data.result.profitMarginPercentage = options.margin ?? 30;
  pair.calculationSnapshot.data.result.laborCost = options.laborCost ?? 10;
  pair.calculationSnapshot.data.result.machineCost = options.machineCost ?? 4;
  pair.calculationSnapshot.data.result.recommendedPrice = options.price ?? 50;
  const pricingInputs = options.v1 ? {
    schemaVersion: PRICING_INPUT_SNAPSHOT_VERSION_V1,
    basis: pair.pricingInputs.basis,
    data: structuredClone(pair.pricingInputs.data),
  } satisfies PricingInputSnapshotV1 : pair.pricingInputs;
  return {
    id,
    userId: "user-1",
    name,
    sourcePresetId: null,
    pricingInputs,
    calculationSnapshot: pair.calculationSnapshot,
    formulaVersion: pair.formulaVersion,
    rawPricingInputs: structuredClone(pricingInputs) as never,
    rawCalculationSnapshot: structuredClone(pair.calculationSnapshot) as never,
    createdAt: generatedAt,
    updatedAt: generatedAt,
  };
}

const production = (overrides: Partial<NonNullable<PricingInputSnapshotV2["productionProfile"]>> = {}) => ({
  schemaVersion: PRODUCTION_PROFILE_VERSION,
  unitsPerBatch: 4,
  setupLaborMinutesPerBatch: 8,
  activeLaborMinutesPerUnit: 3,
  finishingLaborMinutesPerUnit: 2,
  primaryMachine: { key: "laser-a", label: "Laser A", occupiedMinutesPerBatch: 40, supervisedMinutesPerBatch: 4 },
  passiveWaitMinutesPerBatch: 30,
  totalElapsedMinutesPerBatch: 75,
  ...overrides,
});

const cash = (overrides: Partial<NonNullable<PricingInputSnapshotV2["cashProfile"]>> = {}) => ({
  schemaVersion: CASH_PROFILE_VERSION,
  cashCostPerSale: 12,
  upfrontCashCostPerUnit: 5,
  fixedUpfrontCashCostPerBatch: 6,
  fixedProductLaunchCost: 100,
  ...overrides,
});

const constraints: ComparisonConstraints = {
  availableLaborMinutes: 80,
  availableMachineMinutesByKey: { "laser-a": 100 },
  workingCapitalCeiling: 52,
};

function compare(products = [
  product("a", "Product A", { production: production(), cash: cash() }),
  product("b", "Product B", { netProfit: 15, production: production({ activeLaborMinutesPerUnit: 5 }), cash: cash({ upfrontCashCostPerUnit: 8 }) }),
], suppliedConstraints: ComparisonConstraints | undefined = constraints) {
  return compareSavedProducts({ products, constraints: suppliedConstraints, generatedAt });
}

describe("comparison-v1 core and profile metrics", () => {
  it("uses stored pricing results and stable owner-benefit meanings", () => {
    const metrics = compare().products[0].metrics;
    expect(metrics.sellingPrice).toMatchObject({ status: "available", value: 50 });
    expect(metrics.ownerLaborCompensation).toMatchObject({ status: "available", value: 10 });
    expect(metrics.machineCost).toMatchObject({ status: "available", value: 4, source: expect.stringContaining("allocated economic") });
    expect(metrics.netBusinessProfit).toMatchObject({ status: "available", value: 20 });
    expect(metrics.profitMarginPercentage).toMatchObject({ status: "available", value: 30 });
    expect(metrics.ownerEconomicBenefit).toMatchObject({ status: "available", value: 30 });
  });

  it("supports v1 and v2 stored core metrics without giving v1 profile metrics", () => {
    const result = compare([product("v1", "Historical", { v1: true }), product("v2", "Current", { production: production(), cash: cash() })]);
    expect(result.products[0].metrics.netBusinessProfit.status).toBe("available");
    expect(result.products[0].metrics.activeLaborMinutesPerBatch).toMatchObject({ status: "unavailable", reason: { code: "missing_production_profile" } });
    expect(result.compatibilityWarnings).toContainEqual(expect.objectContaining({ productId: "v1", code: "historical_profile_unavailable" }));
  });

  it("uses only explicit cash fields and preserves known zero", () => {
    const result = compare([product("a", "A", { production: production(), cash: cash({ cashCostPerSale: 0, upfrontCashCostPerUnit: 0, fixedUpfrontCashCostPerBatch: 0 }) }), product("b", "B")]);
    expect(result.products[0].metrics.totalCashCostPerSale).toMatchObject({ status: "available", value: 0, source: "cash-profile-v1.cashCostPerSale" });
    expect(result.products[0].metrics.upfrontCashRequiredPerUnit).toMatchObject({ status: "available", value: 0 });
    expect(result.products[0].metrics.upfrontCashRequiredPerBatch).toMatchObject({ status: "available", value: 0 });
  });

  it("does not substitute trueBaseCost for missing cash data", () => {
    const metrics = compare([product("a", "A", { production: production(), cash: cash({ cashCostPerSale: undefined }) }), product("b", "B")]).products[0].metrics;
    expect(metrics.totalCashCostPerSale).toMatchObject({ status: "unavailable", reason: { code: "missing_cash_cost" } });
    expect(metrics.totalCashCostPerSale).not.toMatchObject({ value: expect.any(Number) });
  });

  it("calculates batch labor, supervised labor, per-unit machine time, and explicit elapsed time", () => {
    const metrics = compare().products[0].metrics;
    expect(metrics.activeLaborMinutesPerBatch).toMatchObject({ status: "available", value: 32 });
    expect(metrics.activeLaborMinutesPerSellableProduct).toMatchObject({ status: "available", value: 8 });
    expect(metrics.occupiedMachineMinutesPerSellableProduct).toMatchObject({ status: "available", value: 10 });
    expect(metrics.totalElapsedMinutesPerBatch).toMatchObject({ status: "available", value: 75 });
  });

  it("never derives elapsed time by summing component durations", () => {
    const profile = production();
    delete profile.totalElapsedMinutesPerBatch;
    const metrics = compare([product("a", "A", { production: profile, cash: cash() }), product("b", "B")]).products[0].metrics;
    expect(metrics.totalElapsedMinutesPerBatch).toMatchObject({ status: "unavailable", reason: { code: "missing_elapsed_time" } });
  });

  it("calculates labor, machine, throughput, and batch efficiency metrics", () => {
    const metrics = compare().products[0].metrics;
    expect(metrics.businessProfitPerLaborHour).toMatchObject({ status: "available", value: 150 });
    expect(metrics.ownerEconomicBenefitPerLaborHour).toMatchObject({ status: "available", value: 225 });
    expect(metrics.businessProfitPerMachineHour).toMatchObject({ status: "available", value: 120 });
    expect(metrics.unitsPerLaborHour).toMatchObject({ status: "available", value: 7.5 });
    expect(metrics.unitsPerMachineHour).toMatchObject({ status: "available", value: 6 });
    expect(metrics.netBusinessProfitPerBatch).toMatchObject({ status: "available", value: 80 });
    expect(metrics.ownerEconomicBenefitPerBatch).toMatchObject({ status: "available", value: 120 });
    expect(metrics.setupLaborMinutesPerSellableProduct).toMatchObject({ status: "available", value: 2 });
  });

  it("returns precise unavailable reasons instead of infinity for zero labor and machine time", () => {
    const zero = production({
      setupLaborMinutesPerBatch: 0,
      activeLaborMinutesPerUnit: 0,
      finishingLaborMinutesPerUnit: 0,
      primaryMachine: { key: "laser-a", label: "Laser A", occupiedMinutesPerBatch: 0, supervisedMinutesPerBatch: 0 },
    });
    const metrics = compare([product("a", "A", { production: zero, cash: cash() }), product("b", "B")]).products[0].metrics;
    expect(metrics.businessProfitPerLaborHour).toMatchObject({ status: "unavailable", reason: { code: "zero_active_labor" } });
    expect(metrics.businessProfitPerMachineHour).toMatchObject({ status: "unavailable", reason: { code: "zero_machine_time" } });
    expect(JSON.stringify(metrics)).not.toMatch(/Infinity|NaN/);
  });
});

describe("break-even and version compatibility", () => {
  it("uses a whole-number cash contribution ceiling", () => {
    expect(compare().products[0].metrics.breakEvenUnits).toMatchObject({ status: "available", value: 3, unit: "units" });
  });

  it("returns zero for zero launch cost and rejects missing or nonpositive contribution", () => {
    const products = [
      product("zero", "Zero", { production: production(), cash: cash({ fixedProductLaunchCost: 0 }) }),
      product("missing", "Missing", { production: production(), cash: cash({ fixedProductLaunchCost: undefined }) }),
      product("equal", "Equal", { price: 12, production: production(), cash: cash({ cashCostPerSale: 12 }) }),
      product("negative", "Negative", { price: 10, production: production(), cash: cash({ cashCostPerSale: 12 }) }),
    ];
    const result = compare(products).products;
    expect(result[0].metrics.breakEvenUnits).toMatchObject({ status: "available", value: 0 });
    expect(result[1].metrics.breakEvenUnits).toMatchObject({ status: "unavailable", reason: { code: "missing_fixed_launch_cost" } });
    expect(result[2].metrics.breakEvenUnits).toMatchObject({ status: "unavailable", reason: { code: "nonpositive_contribution_margin" } });
    expect(result[3].metrics.breakEvenUnits).toMatchObject({ status: "unavailable", reason: { code: "nonpositive_contribution_margin" } });
  });

  it("fails closed for unknown input, calculation, and formula versions", () => {
    const unknownInput = product("input", "Input");
    unknownInput.pricingInputs = null;
    const unknownCalculation = product("calculation", "Calculation");
    unknownCalculation.calculationSnapshot = null;
    const unknownFormula = product("formula", "Formula");
    unknownFormula.formulaVersion = "pricing-v2";
    const result = compare([unknownInput, unknownCalculation, unknownFormula]);
    expect(result.products[0].metrics.activeLaborMinutesPerBatch.status).toBe("unavailable");
    expect(result.products[1].metrics.netBusinessProfit).toMatchObject({ status: "unavailable", reason: { code: "unsupported_snapshot" } });
    expect(result.products[2].metrics.netBusinessProfit).toMatchObject({ status: "unavailable", reason: { code: "unsupported_formula_version" } });
    expect(result.compatibilityWarnings.map((warning) => warning.code)).toEqual(expect.arrayContaining(["unsupported_input_snapshot", "unsupported_calculation_snapshot", "unsupported_formula_version"]));
  });

  it("publishes an explicit fail-closed v1/v2 compatibility matrix", () => {
    expect(COMPARISON_COMPATIBILITY_MATRIX["pricing-input-v1"]["pricing-v1"]["calculation-snapshot-v1"]).toEqual({
      corePricing: true, ownerEconomicBenefit: true, productionProfile: false, cashProfile: false,
    });
    expect(COMPARISON_COMPATIBILITY_MATRIX["pricing-input-v2"]["pricing-v1"]["calculation-snapshot-v1"].productionProfile).toBe(true);
    expect(COMPARISON_COMPATIBILITY_MATRIX).not.toHaveProperty("pricing-input-v3");
  });

  it("does not substitute net profit or true base cost for contribution margin", () => {
    const item = product("a", "A", { price: 50, netProfit: -999, production: production(), cash: cash({ cashCostPerSale: 10, fixedProductLaunchCost: 80 }) });
    item.calculationSnapshot!.data.result.trueBaseCost = 49;
    expect(compare([item, product("b", "B")]).products[0].metrics.breakEvenUnits).toMatchObject({ status: "available", value: 2 });
  });
});

describe("transparent rankings and batch economics", () => {
  it("selects highest and lowest leaders without an overall winner", () => {
    const result = compare();
    expect(result.categoryLeaders.highestProfitPerUnit).toMatchObject({ status: "available", productIds: ["a"] });
    expect(result.categoryLeaders.lowestUpfrontCashRequirement).toMatchObject({ status: "available", productIds: ["a"] });
    expect(result).not.toHaveProperty("overallWinner");
  });

  it("preserves exact and tolerance-based ties", () => {
    const result = compare([
      product("a", "A", { netProfit: 20 }),
      product("b", "B", { netProfit: 20 + RANKING_TOLERANCE / 2 }),
    ]);
    expect(result.categoryLeaders.highestProfitPerUnit).toMatchObject({ status: "available", productIds: ["a", "b"] });
  });

  it("excludes missing and zero-machine metrics and requires two comparable products", () => {
    const zero = production({ primaryMachine: { key: "laser-a", label: "Laser A", occupiedMinutesPerBatch: 0, supervisedMinutesPerBatch: 0 } });
    const result = compare([product("zero", "Zero", { production: zero }), product("missing", "Missing")]);
    expect(result.categoryLeaders.highestBusinessProfitPerMachineHour).toMatchObject({ status: "unavailable", reason: { code: "insufficient_comparable_products" } });
  });

  it("reports independent dominant or mixed batch economics without scores", () => {
    const dominant = compare([
      product("a", "A", { netProfit: 30, production: production({ setupLaborMinutesPerBatch: 2, activeLaborMinutesPerUnit: 1 }), cash: cash({ upfrontCashCostPerUnit: 1 }) }),
      product("b", "B", { netProfit: 10, production: production({ setupLaborMinutesPerBatch: 20, activeLaborMinutesPerUnit: 8 }), cash: cash({ upfrontCashCostPerUnit: 10 }) }),
    ]).batchEconomics;
    expect(dominant).toMatchObject({ status: "dominant", dominantProductIds: ["a"] });
    expect(dominant).not.toHaveProperty("score");

    const mixed = compare([
      product("a", "A", { netProfit: 25, production: production({ setupLaborMinutesPerBatch: 20 }), cash: cash({ upfrontCashCostPerUnit: 8 }) }),
      product("b", "B", { netProfit: 15, production: production({ setupLaborMinutesPerBatch: 2 }), cash: cash({ upfrontCashCostPerUnit: 1 }) }),
    ]).batchEconomics;
    expect(mixed.status).toBe("mixed");
    expect(mixed.explanation).toContain("different products");
  });
});

describe("runtime bottlenecks and explanations", () => {
  it("calculates unclamped utilization using the stable machine key", () => {
    const bottleneck = compare(undefined, { ...constraints, availableLaborMinutes: 20 }).bottlenecksByProduct.a;
    expect(bottleneck.utilizations.labor).toMatchObject({ status: "available", value: 1.6 });
    expect(bottleneck.utilizations.machine).toMatchObject({ status: "available", value: 0.4 });
    expect(bottleneck.utilizations.working_capital).toMatchObject({ status: "available", value: 0.5 });
    expect(bottleneck.primaryResources).toEqual(["labor"]);
  });

  it("preserves exact ties and resources within five percentage points as near ties", () => {
    expect(BOTTLENECK_NEAR_TIE_TOLERANCE).toBe(0.05);
    const bottleneck = compare(undefined, { availableLaborMinutes: 64, availableMachineMinutesByKey: { "laser-a": 80 }, workingCapitalCeiling: 26 / 0.47 }).bottlenecksByProduct.a;
    expect(bottleneck.primaryResources).toEqual(["labor", "machine"]);
    expect(bottleneck.nearTiedResources).toEqual(["labor", "machine", "working_capital"]);
  });

  it("reports missing capacity and unmatched machine keys explicitly", () => {
    const result = compare(undefined, { availableLaborMinutes: 80, availableMachineMinutesByKey: { other: 100 } }).bottlenecksByProduct.a;
    expect(result.utilizations.machine).toMatchObject({ status: "unavailable", reason: { code: "machine_capacity_not_found" } });
    expect(result.status).toBe("unavailable");
  });

  it("requires at least two valid resources and does not infer from magnitude", () => {
    const result = compare(undefined, { availableLaborMinutes: 1 }).bottlenecksByProduct.a;
    expect(result.status).toBe("unavailable");
    expect(result.primaryResources).toEqual([]);
  });

  it("rejects every explicitly supplied invalid capacity", () => {
    const products = [product("a", "A"), product("b", "B")];
    expect(() => compareSavedProducts({ products, generatedAt, constraints: { availableLaborMinutes: 0 } })).toThrow("availableLaborMinutes");
    expect(() => compareSavedProducts({ products, generatedAt, constraints: { workingCapitalCeiling: Number.POSITIVE_INFINITY } })).toThrow("workingCapitalCeiling");
    expect(() => compareSavedProducts({ products, generatedAt, constraints: { availableMachineMinutesByKey: { laser: -1 } } })).toThrow("laser");
  });

  it("generates deterministic factual leader, tie, mixed, and compatibility sentences", () => {
    const products = [product("a", "Alpha", { v1: true }), product("b", "Beta", { netProfit: 10 })];
    const first = compare(products).explanation;
    const second = compare(products).explanation;
    expect(first).toEqual(second);
    expect(first.join(" ")).toContain("Alpha generates the greatest net business profit per sale");
    expect(first.join(" ")).toContain("version-compatibility warning");
    expect(first.join(" ")).not.toMatch(/overall best|best product/i);
  });

  it("mentions ties without presenting unsupported metrics as facts", () => {
    const result = compare([product("a", "Alpha", { v1: true }), product("b", "Beta", { v1: true })]);
    expect(result.explanation.some((line) => line.includes("Alpha and Beta tie"))).toBe(true);
    expect(result.explanation.join(" ")).not.toContain("active labor hour");
  });
});

describe("purity", () => {
  it("does not mutate products or constraints and returns detached output", () => {
    const products = [product("a", "A", { production: production(), cash: cash() }), product("b", "B", { production: production(), cash: cash() })];
    const supplied = structuredClone(constraints);
    const beforeProducts = structuredClone(products);
    const beforeConstraints = structuredClone(supplied);
    const result = compareSavedProducts({ products, constraints: supplied, generatedAt });
    result.products[0].productName = "Changed";
    expect(products).toEqual(beforeProducts);
    expect(supplied).toEqual(beforeConstraints);
  });

  it("identifies its independent engine version and rejects invalid timestamps", () => {
    expect(compare().engineVersion).toBe(COMPARISON_ENGINE_VERSION);
    expect(() => compareSavedProducts({ products: [], generatedAt: "invalid" })).toThrow("generatedAt");
  });
});
