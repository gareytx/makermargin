import { describe, expect, it } from "vitest";
import {
  BOTTLENECK_NEAR_TIE_TOLERANCE,
  RANKING_TOLERANCE,
  projectSavedProduct,
} from "./product-comparison";
import {
  MAX_PORTFOLIO_WHOLE_NUMBER,
  PORTFOLIO_ENGINE_VERSION,
  PORTFOLIO_PLAN_INPUT_VERSION,
  planPortfolio,
  type PortfolioPlanInput,
} from "./product-portfolio";
import { customProductTemplate } from "./product-presets";
import { CASH_PROFILE_VERSION, PRODUCTION_PROFILE_VERSION } from "./product-profiles";
import {
  createCurrentSnapshots,
  PRICING_INPUT_SNAPSHOT_VERSION_V1,
  type PricingInputSnapshotV1,
  type PricingInputSnapshotV2,
} from "./saved-product-snapshots";
import type { SavedProduct } from "./saved-products";

const timestamp = "2026-07-23T12:00:00.000Z";

const production = (overrides: Partial<NonNullable<PricingInputSnapshotV2["productionProfile"]>> = {}) => ({
  schemaVersion: PRODUCTION_PROFILE_VERSION,
  unitsPerBatch: 4,
  setupLaborMinutesPerBatch: 8,
  activeLaborMinutesPerUnit: 3,
  finishingLaborMinutesPerUnit: 2,
  primaryMachine: {
    key: "laser-a",
    label: "Laser A",
    occupiedMinutesPerBatch: 40,
    supervisedMinutesPerBatch: 4,
  },
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

function savedProduct(
  id: string,
  options: {
    name?: string;
    production?: PricingInputSnapshotV2["productionProfile"];
    cash?: PricingInputSnapshotV2["cashProfile"];
    pricingLaborMinutes?: number;
    price?: number;
    laborCompensation?: number;
    profit?: number;
    v1?: boolean;
  } = {}
): SavedProduct {
  const pair = createCurrentSnapshots(customProductTemplate.values, timestamp, {
    productionProfile: options.production === undefined ? production() : options.production,
    cashProfile: options.cash === undefined ? cash() : options.cash,
  });
  pair.pricingInputs.data.laborMinutes = options.pricingLaborMinutes ?? 8;
  pair.calculationSnapshot.data.result.recommendedPrice = options.price ?? 50;
  pair.calculationSnapshot.data.result.laborCost = options.laborCompensation ?? 10;
  pair.calculationSnapshot.data.result.netProfit = options.profit ?? 20;
  const pricingInputs = options.v1
    ? {
        schemaVersion: PRICING_INPUT_SNAPSHOT_VERSION_V1,
        basis: pair.pricingInputs.basis,
        data: structuredClone(pair.pricingInputs.data),
      } satisfies PricingInputSnapshotV1
    : pair.pricingInputs;
  return {
    id,
    userId: "owner",
    name: options.name ?? `Product ${id}`,
    sourcePresetId: null,
    pricingInputs,
    calculationSnapshot: pair.calculationSnapshot,
    formulaVersion: pair.formulaVersion,
    rawPricingInputs: structuredClone(pricingInputs) as never,
    rawCalculationSnapshot: structuredClone(pair.calculationSnapshot) as never,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function projections(...products: SavedProduct[]) {
  return products.map(projectSavedProduct);
}

function input(
  productLines: PortfolioPlanInput["products"] = [
    { savedProductId: "a", plannedBatches: 2 },
    { savedProductId: "b", plannedBatches: 1 },
  ],
  constraints: PortfolioPlanInput["constraints"] = { machineMinutesByKey: {} }
): PortfolioPlanInput {
  return {
    version: PORTFOLIO_PLAN_INPUT_VERSION,
    period: { type: "month", label: "  August launch  " },
    products: productLines,
    constraints,
  };
}

function validResult(
  suppliedInput = input(),
  suppliedProjections = projections(savedProduct("a"), savedProduct("b"))
) {
  const result = planPortfolio({ input: suppliedInput, products: suppliedProjections });
  expect(result.status).toBe("success");
  if (result.status !== "success") throw new Error(JSON.stringify(result.errors));
  return result;
}

function errorCodes(value: ReturnType<typeof planPortfolio>) {
  expect(value.status).toBe("invalid");
  return value.status === "invalid" ? value.errors.map(({ code }) => code) : [];
}

describe("trusted projection readiness and provenance", () => {
  it("accepts a supported v2 projection and reports authoritative versions", () => {
    const result = validResult();
    expect(result.planInputVersion).toBe(PORTFOLIO_PLAN_INPUT_VERSION);
    expect(result.engineVersion).toBe(PORTFOLIO_ENGINE_VERSION);
    expect(result.period).toEqual({ type: "month", label: "August launch" });
    expect(result.products[0].readiness).toEqual({ status: "ready", reasons: [], warnings: [] });
    expect(result.products[0].provenance).toMatchObject({
      pricingInputSnapshotVersion: "pricing-input-v2",
      calculationSnapshotVersion: "calculation-snapshot-v1",
      formulaVersion: "pricing-v1",
      productionProfileVersion: "production-profile-v1",
      cashProfileVersion: "cash-profile-v1",
      machineInterpretation: "represented",
      machineFreeInference: false,
      machineSourceLabels: ["Laser A"],
    });
  });

  it("keeps a historical pricing-only product visible when it has zero batches", () => {
    const legacy = projectSavedProduct(savedProduct("legacy", { v1: true }));
    const result = validResult(
      input([
        { savedProductId: "legacy", plannedBatches: 0 },
        { savedProductId: "ready", plannedBatches: 1 },
      ]),
      [legacy, projectSavedProduct(savedProduct("ready"))]
    );
    expect(result.products[0].readiness.status).toBe("unready");
    expect(result.products[0].readiness.reasons.map(({ code }) => code)).toContain("historical_profile_unavailable");
    expect(result.products[0].economics).toBeNull();
    expect(result.products[0].contributions).toBeNull();
  });

  it("blocks unsupported input, calculation, formula, production, and cash versions", () => {
    const unsupported = projectSavedProduct(savedProduct("unsupported"));
    unsupported.provenance.pricingInputSnapshotVersion = "pricing-input-v3";
    unsupported.provenance.calculationSnapshotVersion = "calculation-snapshot-v2";
    unsupported.provenance.formulaVersion = "pricing-v2";
    unsupported.provenance.productionProfileVersion = "production-profile-v2";
    unsupported.provenance.cashProfileVersion = "cash-profile-v2";
    const result = validResult(
      input([
        { savedProductId: "unsupported", plannedBatches: 0 },
        { savedProductId: "ready", plannedBatches: 1 },
      ]),
      [unsupported, projectSavedProduct(savedProduct("ready"))]
    );
    expect(result.products[0].readiness.reasons.map(({ code }) => code)).toEqual(expect.arrayContaining([
      "historical_profile_unavailable",
      "unsupported_calculation_snapshot",
      "unsupported_formula_version",
      "unsupported_production_profile",
      "unsupported_cash_profile",
    ]));
  });

  it("blocks missing labor, supervision, and required cash without converting them to zero", () => {
    const missing = projectSavedProduct(savedProduct("missing", {
      production: production({
        setupLaborMinutesPerBatch: undefined,
        primaryMachine: {
          key: "laser-a",
          label: "Laser A",
          occupiedMinutesPerBatch: 40,
          supervisedMinutesPerBatch: undefined,
        },
      }),
      cash: cash({
        cashCostPerSale: undefined,
        upfrontCashCostPerUnit: undefined,
        fixedUpfrontCashCostPerBatch: undefined,
      }),
    }));
    const result = validResult(
      input([
        { savedProductId: "missing", plannedBatches: 0 },
        { savedProductId: "ready", plannedBatches: 1 },
      ]),
      [missing, projectSavedProduct(savedProduct("ready"))]
    );
    const codes = result.products[0].readiness.reasons.map(({ code }) => code);
    expect(codes).toEqual(expect.arrayContaining([
      "missing_active_labor",
      "missing_cash_cost",
      "missing_upfront_cash",
      "missing_fixed_batch_cash",
    ]));
  });

  it("blocks labor mismatch but keeps impossible elapsed time as a visible warning", () => {
    const item = projectSavedProduct(savedProduct("quality", {
      pricingLaborMinutes: 99,
      production: production({ totalElapsedMinutesPerBatch: 39 }),
    }));
    const result = validResult(
      input([
        { savedProductId: "quality", plannedBatches: 0 },
        { savedProductId: "ready", plannedBatches: 1 },
      ]),
      [item, projectSavedProduct(savedProduct("ready"))]
    );
    expect(result.products[0].readiness.reasons.map(({ code }) => code)).toContain("labor_profile_mismatch");
    expect(result.products[0].readiness.warnings).toEqual([
      expect.objectContaining({ code: "impossible_elapsed_time", productId: "quality" }),
    ]);
    expect(result.warnings).toEqual(result.products[0].readiness.warnings);
  });

  it("records the legacy absent-machine inference and retains represented zero-time machines", () => {
    const machineFree = projectSavedProduct(savedProduct("free", {
      production: production({ primaryMachine: undefined }),
      pricingLaborMinutes: 7,
    }));
    const zeroMachine = projectSavedProduct(savedProduct("zero", {
      production: production({
        primaryMachine: {
          key: "laser-zero",
          label: "Laser Zero",
          occupiedMinutesPerBatch: 0,
          supervisedMinutesPerBatch: 0,
        },
      }),
      pricingLaborMinutes: 7,
    }));
    const result = validResult(input([
      { savedProductId: "free", plannedBatches: 1 },
      { savedProductId: "zero", plannedBatches: 1 },
    ]), [machineFree, zeroMachine]);
    expect(result.products[0].provenance).toMatchObject({
      machineInterpretation: "legacy_absent_machine",
      machineFreeInference: true,
      machineSourceLabels: [],
    });
    expect(result.capacity.machines).toEqual([
      expect.objectContaining({ key: "laser-zero", requiredMinutes: 0, sourceLabels: ["Laser Zero"] }),
    ]);
  });
});

describe("request validation", () => {
  const ready = () => projections(savedProduct("a"), savedProduct("b"));

  it("rejects malformed input, unsupported versions, invalid period types, and label boundaries", () => {
    expect(errorCodes(planPortfolio({ input: null, products: ready() }))).toContain("malformed_request");
    expect(errorCodes(planPortfolio({ input: { ...input(), version: "portfolio-plan-v2" }, products: ready() }))).toContain("unsupported_plan_input_version");
    expect(errorCodes(planPortfolio({ input: { ...input(), period: { type: "year", label: "Year" } }, products: ready() }))).toContain("invalid_period_type");
    expect(errorCodes(planPortfolio({ input: { ...input(), period: { type: "month", label: " " } }, products: ready() }))).toContain("invalid_period_label");
    expect(errorCodes(planPortfolio({ input: { ...input(), period: { type: "month", label: "x".repeat(81) } }, products: ready() }))).toContain("invalid_period_label");
    expect(validResult({ ...input(), period: { type: "custom", label: "x".repeat(80) } }).period.label).toHaveLength(80);
  });

  it("rejects fewer than two, duplicate, and unknown product IDs", () => {
    expect(errorCodes(planPortfolio({ input: input([{ savedProductId: "a", plannedBatches: 1 }]), products: ready() }))).toContain("insufficient_products");
    expect(errorCodes(planPortfolio({
      input: input([{ savedProductId: "a", plannedBatches: 1 }, { savedProductId: "a", plannedBatches: 0 }]),
      products: ready(),
    }))).toContain("duplicate_product_id");
    expect(errorCodes(planPortfolio({
      input: input([{ savedProductId: "a", plannedBatches: 1 }, { savedProductId: "unknown", plannedBatches: 0 }]),
      products: ready(),
    }))).toContain("unknown_product_id");
  });

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, MAX_PORTFOLIO_WHOLE_NUMBER + 1])(
    "rejects invalid planned batches: %s",
    (plannedBatches) => {
      const result = planPortfolio({
        input: input([{ savedProductId: "a", plannedBatches }, { savedProductId: "b", plannedBatches: 1 }]),
        products: ready(),
      });
      expect(errorCodes(result)).toContain("invalid_planned_batches");
    }
  );

  it.each([-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, MAX_PORTFOLIO_WHOLE_NUMBER + 1])(
    "rejects invalid demand ceilings: %s",
    (demandCeilingUnits) => {
      const result = planPortfolio({
        input: input([
          { savedProductId: "a", plannedBatches: 1, demandCeilingUnits },
          { savedProductId: "b", plannedBatches: 0 },
        ]),
        products: ready(),
      });
      expect(errorCodes(result)).toContain("invalid_demand_ceiling");
    }
  );

  it("rejects negative and non-finite capacities while accepting missing and zero", () => {
    for (const ownerLaborMinutes of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(errorCodes(planPortfolio({
        input: input(undefined, { ownerLaborMinutes, machineMinutesByKey: {} }),
        products: ready(),
      }))).toContain("invalid_capacity");
    }
    expect(validResult(input(undefined, { ownerLaborMinutes: 0, workingCapital: 0, machineMinutesByKey: { "laser-a": 0 } })).status).toBe("success");
    expect(validResult(input(undefined, { machineMinutesByKey: {} })).status).toBe("success");
  });

  it("rejects unknown machine keys and conflicting labels for one shared key", () => {
    expect(errorCodes(planPortfolio({
      input: input(undefined, { machineMinutesByKey: { unknown: 10 } }),
      products: ready(),
    }))).toContain("unknown_machine_capacity_key");
    const conflicting = projections(
      savedProduct("a"),
      savedProduct("b", {
        production: production({
          primaryMachine: {
            key: "laser-a",
            label: "Different Laser",
            occupiedMinutesPerBatch: 40,
            supervisedMinutesPerBatch: 4,
          },
        }),
      })
    );
    expect(errorCodes(planPortfolio({ input: input(), products: conflicting }))).toContain("conflicting_machine_labels");
  });

  it("does not merge different keys whose labels normalize identically", () => {
    const separate = projections(
      savedProduct("a"),
      savedProduct("b", {
        production: production({
          primaryMachine: {
            key: "laser-b",
            label: "Laser A",
            occupiedMinutesPerBatch: 40,
            supervisedMinutesPerBatch: 4,
          },
        }),
      })
    );
    expect(validResult(input(), separate).capacity.machines.map(({ key }) => key)).toEqual(["laser-a", "laser-b"]);
  });

  it("rejects all-zero plans and positive batches assigned to an unready product", () => {
    expect(errorCodes(planPortfolio({
      input: input([{ savedProductId: "a", plannedBatches: 0 }, { savedProductId: "b", plannedBatches: 0 }]),
      products: ready(),
    }))).toContain("no_ready_positive_batches");
    const legacy = projectSavedProduct(savedProduct("legacy", { v1: true }));
    const result = planPortfolio({
      input: input([{ savedProductId: "legacy", plannedBatches: 1 }, { savedProductId: "b", plannedBatches: 1 }]),
      products: [legacy, projectSavedProduct(savedProduct("b"))],
    });
    expect(errorCodes(result)).toContain("positive_batches_for_unready_product");
  });

  it("fails closed with non_finite_result when derived arithmetic overflows", () => {
    const huge = projectSavedProduct(savedProduct("a"));
    huge.metrics.sellingPrice = { status: "available", value: Number.MAX_VALUE, unit: "currency", source: "test finite value" };
    const result = planPortfolio({
      input: input([{ savedProductId: "a", plannedBatches: 2 }, { savedProductId: "b", plannedBatches: 0 }]),
      products: [huge, projectSavedProduct(savedProduct("b"))],
    });
    expect(errorCodes(result)).toEqual(["non_finite_result"]);
  });
});

describe("calculations, aggregation, capacity, and demand", () => {
  it("uses whole-batch authoritative values and reconciles line contributions", () => {
    const result = validResult();
    expect(result.products[0].economics).toEqual({
      plannedBatches: 2,
      plannedSellableProducts: 8,
      plannedRevenue: 400,
      plannedOwnerLaborMinutes: 64,
      plannedOccupiedMachineMinutes: 80,
      plannedTotalCashCost: 96,
      plannedUpfrontVariableCash: 40,
      plannedFixedBatchCash: 12,
      plannedWorkingCapitalRequirement: 52,
      plannedOwnerLaborCompensation: 80,
      plannedBusinessProfit: 160,
      plannedOwnerEconomicBenefit: 240,
    });
    expect(result.totals).toEqual({
      plannedBatches: 3,
      plannedSellableProducts: 12,
      revenue: 600,
      totalCashCost: 144,
      workingCapitalRequirement: 78,
      ownerLaborMinutes: 96,
      occupiedMachineMinutes: 120,
      occupiedMachineMinutesByKey: { "laser-a": 120 },
      ownerLaborCompensation: 120,
      netBusinessProfit: 240,
      ownerEconomicBenefit: 360,
    });
    expect(result.products[0].contributions?.revenue).toBeCloseTo(2 / 3);
    for (const key of Object.keys(result.products[0].contributions!) as Array<keyof NonNullable<typeof result.products[0]["contributions"]>>) {
      const totalShare = result.products.reduce((sum, line) => sum + (line.contributions?.[key] ?? 0), 0);
      expect(totalShare).toBeCloseTo(1);
    }
    expect(result.totals.workingCapitalRequirement).not.toBe(278);
    expect(result.products[0].economics!.plannedOwnerEconomicBenefit).toBe(
      result.products[0].economics!.plannedOwnerLaborCompensation +
      result.products[0].economics!.plannedBusinessProfit
    );
  });

  it("aggregates shared machines and sorts distinct machine resources by stable key", () => {
    const distinct = projections(
      savedProduct("a", {
        production: production({
          primaryMachine: {
            key: "z-machine",
            label: "Z Machine",
            occupiedMinutesPerBatch: 10,
            supervisedMinutesPerBatch: 4,
          },
        }),
      }),
      savedProduct("b", {
        production: production({
          primaryMachine: {
            key: "a-machine",
            label: "A Machine",
            occupiedMinutesPerBatch: 20,
            supervisedMinutesPerBatch: 4,
          },
        }),
      })
    );
    const result = validResult(input(), distinct);
    expect(result.capacity.machines.map(({ key, requiredMinutes }) => [key, requiredMinutes])).toEqual([
      ["a-machine", 20],
      ["z-machine", 20],
    ]);
    expect(Object.keys(result.totals.occupiedMachineMinutesByKey)).toEqual(["a-machine", "z-machine"]);
  });

  it("returns structured unavailable analysis for missing capacities", () => {
    const result = validResult();
    expect(result.capacity.ownerLabor).toMatchObject({ status: "unavailable", required: 96, utilization: null });
    expect(result.capacity.workingCapital).toMatchObject({ status: "unavailable", required: 78, utilization: null });
    expect(result.capacity.machines[0].capacity).toMatchObject({ status: "unavailable", required: 120, utilization: null });
    expect(result.totals.revenue).toBe(600);
    expect(result.capacity.primaryLimitingResources).toEqual([]);
  });

  it("handles explicit zero capacities without Infinity or NaN", () => {
    const result = validResult(input(undefined, {
      ownerLaborMinutes: 0,
      workingCapital: 0,
      machineMinutesByKey: { "laser-a": 0 },
    }));
    expect(result.capacity.ownerLabor).toMatchObject({ status: "available", utilization: null, overCapacity: true });
    expect(result.capacity.workingCapital).toMatchObject({ status: "available", utilization: null, overCapacity: true });
    expect(result.capacity.machines[0].capacity).toMatchObject({ status: "available", utilization: null, overCapacity: true });
    expect(JSON.stringify(result)).not.toMatch(/Infinity|NaN/);
  });

  it("reports zero required against zero available as 0% and non-limiting", () => {
    const zeroProduction = production({
      setupLaborMinutesPerBatch: 0,
      activeLaborMinutesPerUnit: 0,
      finishingLaborMinutesPerUnit: 0,
      primaryMachine: {
        key: "zero-machine",
        label: "Zero Machine",
        occupiedMinutesPerBatch: 0,
        supervisedMinutesPerBatch: 0,
      },
    });
    const zeroCash = cash({ upfrontCashCostPerUnit: 0, fixedUpfrontCashCostPerBatch: 0 });
    const result = validResult(
      input(undefined, {
        ownerLaborMinutes: 0,
        workingCapital: 0,
        machineMinutesByKey: { "zero-machine": 0 },
      }),
      projections(
        savedProduct("a", { production: zeroProduction, cash: zeroCash, pricingLaborMinutes: 0 }),
        savedProduct("b", { production: zeroProduction, cash: zeroCash, pricingLaborMinutes: 0 })
      )
    );
    expect(result.capacity.ownerLabor).toMatchObject({ utilization: 0, overCapacity: false, limiting: false });
    expect(result.capacity.workingCapital).toMatchObject({ utilization: 0, overCapacity: false, limiting: false });
    expect(result.capacity.machines[0].capacity).toMatchObject({ utilization: 0, overCapacity: false, limiting: false });
  });

  it("supports under, exact, over, exact-tied, and relative near-tied utilization without clamping", () => {
    const tied = validResult(input(undefined, {
      ownerLaborMinutes: 192,
      workingCapital: 156,
      machineMinutesByKey: { "laser-a": 240 },
    }));
    expect(tied.capacity.ownerLabor).toMatchObject({ utilization: 0.5, overCapacity: false });
    expect(tied.capacity.workingCapital).toMatchObject({ utilization: 0.5, overCapacity: false });
    expect(tied.capacity.machines[0].capacity).toMatchObject({ utilization: 0.5, overCapacity: false });
    expect(tied.capacity.primaryLimitingResources).toEqual([
      { resourceType: "owner_labor", key: "owner_labor" },
      { resourceType: "machine", key: "laser-a" },
      { resourceType: "working_capital", key: "working_capital" },
    ]);
    const near = validResult(input(undefined, {
      ownerLaborMinutes: 192,
      workingCapital: 78 / 0.49,
      machineMinutesByKey: { "laser-a": 300 },
    }));
    expect(near.capacity.primaryLimitingResources).toEqual([
      { resourceType: "owner_labor", key: "owner_labor" },
    ]);
    expect(near.capacity.nearTiedResources).toEqual([
      { resourceType: "owner_labor", key: "owner_labor" },
      { resourceType: "working_capital", key: "working_capital" },
    ]);
    const over = validResult(input(undefined, {
      ownerLaborMinutes: 48,
      workingCapital: 78,
      machineMinutesByKey: { "laser-a": 240 / (1 - BOTTLENECK_NEAR_TIE_TOLERANCE / 2) },
    }));
    expect(over.capacity.ownerLabor).toMatchObject({ utilization: 2, overCapacity: true });
    expect(over.capacity.workingCapital).toMatchObject({ utilization: 1, overCapacity: false });
    expect(over.capacity.ownerLabor.status === "available" && over.capacity.ownerLabor.utilization).toBeGreaterThan(1);
    expect(RANKING_TOLERANCE).toBe(1e-9);
  });

  it("analyzes demand excess, shortfall, exact match, and missing ceilings without changing economics", () => {
    const result = validResult(input([
      { savedProductId: "a", plannedBatches: 2, demandCeilingUnits: 6 },
      { savedProductId: "b", plannedBatches: 1, demandCeilingUnits: 8 },
      { savedProductId: "c", plannedBatches: 1, demandCeilingUnits: 4 },
      { savedProductId: "d", plannedBatches: 0 },
    ]), projections(savedProduct("a"), savedProduct("b"), savedProduct("c"), savedProduct("d")));
    expect(result.products[0].demand).toMatchObject({ state: "excess", plannedUnits: 8, excessProductionUnits: 2, unfilledDemandUnits: 0 });
    expect(result.products[1].demand).toMatchObject({ state: "shortfall", plannedUnits: 4, excessProductionUnits: 0, unfilledDemandUnits: 4 });
    expect(result.products[2].demand).toMatchObject({ state: "exact", plannedUnits: 4, excessProductionUnits: 0, unfilledDemandUnits: 0 });
    expect(result.products[3].demand).toBeNull();
    expect(result.totals.revenue).toBe(800);
  });
});

describe("purity and determinism", () => {
  it("preserves input order and returns equal detached outputs without mutation", () => {
    const suppliedInput = input([
      { savedProductId: "b", plannedBatches: 1 },
      { savedProductId: "a", plannedBatches: 2 },
    ]);
    const suppliedProducts = projections(savedProduct("a"), savedProduct("b"));
    const beforeInput = structuredClone(suppliedInput);
    const beforeProducts = structuredClone(suppliedProducts);
    const first = planPortfolio({ input: suppliedInput, products: suppliedProducts });
    const second = planPortfolio({ input: structuredClone(suppliedInput), products: structuredClone(suppliedProducts) });
    expect(first).toEqual(second);
    expect(suppliedInput).toEqual(beforeInput);
    expect(suppliedProducts).toEqual(beforeProducts);
    expect(first.status).toBe("success");
    if (first.status === "success") {
      expect(first.products.map(({ productId }) => productId)).toEqual(["b", "a"]);
      first.products[0].productName = "Changed";
      expect(suppliedProducts.find(({ productId }) => productId === "b")?.productName).toBe("Product b");
    }
  });

  it("uses deterministic validation, warning, resource, tie, and explanation ordering", () => {
    const first = validResult(input(undefined, {
      ownerLaborMinutes: 192,
      workingCapital: 156,
      machineMinutesByKey: { "laser-a": 240 },
    }));
    const second = validResult(input(undefined, {
      ownerLaborMinutes: 192,
      workingCapital: 156,
      machineMinutesByKey: { "laser-a": 240 },
    }));
    expect(first.capacity.primaryLimitingResources).toEqual(second.capacity.primaryLimitingResources);
    expect(first.capacity.nearTiedResources).toEqual(second.capacity.nearTiedResources);
    expect(first.warnings).toEqual(second.warnings);
    expect(first.explanations).toEqual(second.explanations);
  });
});
