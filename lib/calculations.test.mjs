import assert from "node:assert/strict";
import test from "node:test";

import {
  calculatePricing,
  calculateViability,
  scoreHourlyEarnings,
  scoreProductionTime,
  scoreProfitMargin,
  scoreShippingBurden,
  validatePricingInput,
} from "./calculations.ts";

const defaults = {
  productName: "4-Piece Slate Coaster Set",
  materialCost: 5.5,
  packagingCost: 2.25,
  otherCost: 1,
  wastePercentage: 10,
  machineMinutes: 62,
  machineHourlyRate: 7.75,
  laborMinutes: 20,
  laborHourlyRate: 40,
  marketplaceFeePercentage: 10,
  processingFeePercentage: 3,
  fixedTransactionFee: 0.3,
  shippingCost: 7.25,
  customerPaysShipping: false,
  desiredMarginPercentage: 30,
};

const calculate = (overrides = {}) =>
  calculatePricing({ ...defaults, ...overrides });

test("calculates normal valid inputs with the existing formula", () => {
  const calculation = calculate({
    materialCost: 10,
    packagingCost: 2,
    otherCost: 0,
    wastePercentage: 5,
    machineMinutes: 30,
    machineHourlyRate: 12,
    laborMinutes: 15,
    laborHourlyRate: 20,
    marketplaceFeePercentage: 8,
    processingFeePercentage: 2,
    fixedTransactionFee: 0.5,
    shippingCost: 4,
    desiredMarginPercentage: 25,
  });

  assert.equal(calculation.valid, true);
  assert.equal(calculation.result.trueBaseCost, 27.5);
  assert.equal(calculation.result.recommendedPrice, 28 / 0.65);
});

test("preserves the default coaster pricing formula", () => {
  const calculation = calculate();
  assert.equal(calculation.valid, true);
  assert.equal(calculation.result.hardCost, 8.75);
  assert.equal(calculation.result.wasteCost, 0.55);
  assert.equal(calculation.result.machineCost, (62 / 60) * 7.75);
  assert.equal(calculation.result.laborCost, (20 / 60) * 40);
  assert.equal(calculation.result.trueBaseCost, 37.891666666666666);
  assert.equal(calculation.result.recommendedPrice, 67.00292397660819);
  assert.equal(calculation.result.profitMarginPercentage, 30);
});

test("rejects every negative or non-finite numeric field", () => {
  const fields = Object.keys(defaults).filter(
    (field) => typeof defaults[field] === "number"
  );
  for (const field of fields) {
    assert.equal(calculate({ [field]: -1 }).valid, false, field);
    assert.equal(calculate({ [field]: Number.NaN }).valid, false, field);
  }
});

test("accepts zero monetary costs when production time remains valid", () => {
  const calculation = calculate({
    materialCost: 0,
    packagingCost: 0,
    otherCost: 0,
    wastePercentage: 0,
    fixedTransactionFee: 0,
    shippingCost: 0,
  });

  assert.equal(calculation.valid, true);
  assert.ok(Object.values(calculation.result).every(Number.isFinite));
});

test("validates every percentage on the same 0% to 100% range", () => {
  for (const field of [
    "wastePercentage",
    "marketplaceFeePercentage",
    "processingFeePercentage",
    "desiredMarginPercentage",
  ]) {
    assert.equal(calculate({ [field]: -0.01 }).valid, false, field);
    assert.equal(calculate({ [field]: 100.01 }).valid, false, field);
  }
});

test("rejects invalid time and rate combinations", () => {
  assert.equal(calculate({ machineHourlyRate: 0 }).valid, false);
  assert.equal(calculate({ laborHourlyRate: 0 }).valid, false);
  assert.equal(
    calculate({ machineMinutes: 0, laborMinutes: 0 }).valid,
    false
  );
});

test("rejects impossible margin and fee combinations", () => {
  assert.equal(
    calculate({ desiredMarginPercentage: 100, marketplaceFeePercentage: 0, processingFeePercentage: 0 }).valid,
    false
  );
  assert.equal(
    calculate({ desiredMarginPercentage: 80, marketplaceFeePercentage: 15, processingFeePercentage: 5 }).valid,
    false
  );
  assert.equal(
    calculate({ desiredMarginPercentage: 80, marketplaceFeePercentage: 15, processingFeePercentage: 6 }).valid,
    false
  );
});

test("calculates very large but finite valid inputs", () => {
  const calculation = calculate({
    materialCost: 1e100,
    packagingCost: 1e100,
    otherCost: 1e100,
    machineMinutes: 1e100,
    machineHourlyRate: 1e100,
    laborMinutes: 1e100,
    laborHourlyRate: 1e100,
    fixedTransactionFee: 1e100,
    shippingCost: 1e100,
  });

  assert.equal(calculation.valid, true);
  assert.ok(Object.values(calculation.result).every(Number.isFinite));
});

test("returns the requested non-blocking warnings", () => {
  const calculation = calculate({
    desiredMarginPercentage: 60,
    marketplaceFeePercentage: 16,
    processingFeePercentage: 15,
    wastePercentage: 51,
    machineMinutes: 91,
    laborMinutes: 1,
    shippingCost: 100,
  });
  assert.equal(calculation.valid, true);
  assert.equal(calculation.validation.warnings.length, 3);
  assert.match(calculation.validation.warnings.join(" "), /above 30%/);
  assert.match(calculation.validation.warnings.join(" "), /above 50%/);
  assert.match(calculation.validation.warnings.join(" "), /above 90 minutes/);
  const highMargin = calculate({ desiredMarginPercentage: 71 });
  assert.equal(highMargin.valid, true);
  assert.match(highMargin.validation.warnings.join(" "), /above 70%/);

  const shippingBurden = calculate({
    materialCost: 0,
    packagingCost: 0,
    otherCost: 0,
    wastePercentage: 0,
    machineMinutes: 1,
    machineHourlyRate: 1,
    laborMinutes: 0,
    fixedTransactionFee: 0,
    marketplaceFeePercentage: 0,
    processingFeePercentage: 0,
    desiredMarginPercentage: 0,
    shippingCost: 100,
  });
  assert.equal(shippingBurden.valid, true);
  assert.match(shippingBurden.validation.warnings.join(" "), /more than 25%/);
  assert.match(shippingBurden.validation.warnings.join(" "), /below \$40/);
});

test("validation is structured and viability names the primary weakness", () => {
  assert.deepEqual(validatePricingInput(defaults).errors, []);
  const calculation = calculate();
  assert.equal(calculation.valid, true);
  assert.match(
    calculateViability(defaults, calculation.result).summary,
    /Low effective hourly earnings/
  );
});

test("preserves the default coaster viability score and exposes its factors", () => {
  const calculation = calculate();
  assert.equal(calculation.valid, true);

  const viability = calculateViability(defaults, calculation.result);
  assert.equal(viability.score, 51);
  assert.equal(viability.label, "Caution");
  assert.equal(
    viability.summary,
    "Low effective hourly earnings are the primary weakness."
  );
  assert.deepEqual(
    viability.factors.map(({ id, points, maxPoints, status }) => ({
      id,
      points,
      maxPoints,
      status,
    })),
    [
      { id: "profit_margin", points: 20, maxPoints: 30, status: "watch" },
      { id: "hourly_earnings", points: 8, maxPoints: 30, status: "weak" },
      { id: "production_time", points: 7, maxPoints: 20, status: "watch" },
      { id: "shipping_burden", points: 16, maxPoints: 20, status: "strong" },
    ]
  );
  assert.deepEqual(
    viability.factors.map((factor) => factor.explanation),
    [
      "30.0% profit margin earns 20 of 30 viability points.",
      "$14.71 effective hourly earnings earns 8 of 30 viability points.",
      "82 minutes of combined machine and labor time earns 7 of 20 viability points.",
      "Shipping is 10.8% of the recommended selling price, earning 16 of 20 viability points.",
    ]
  );
});

test("preserves every profit-margin scoring threshold", () => {
  assert.deepEqual(
    [50, 40, 30, 20, 19.9].map((value) => {
      const factor = scoreProfitMargin(value);
      return [factor.points, factor.status];
    }),
    [[30, "strong"], [25, "strong"], [20, "watch"], [12, "watch"], [4, "weak"]]
  );
});

test("preserves every effective-hourly-earnings scoring threshold", () => {
  assert.deepEqual(
    [40, 30, 20, 10, 9.99].map((value) => {
      const factor = scoreHourlyEarnings(value);
      return [factor.points, factor.status];
    }),
    [[30, "strong"], [24, "strong"], [16, "watch"], [8, "weak"], [2, "weak"]]
  );
});

test("preserves every production-time scoring threshold", () => {
  assert.deepEqual(
    [15, 30, 60, 90, 90.01].map((value) => {
      const factor = scoreProductionTime(value);
      return [factor.points, factor.status];
    }),
    [[20, "strong"], [16, "strong"], [12, "watch"], [7, "watch"], [3, "weak"]]
  );
});

test("preserves every shipping-burden scoring threshold", () => {
  assert.deepEqual(
    [0.1, 0.15, 0.25, 0.2501].map((ratio) => {
      const factor = scoreShippingBurden(false, ratio);
      return [factor.points, factor.status];
    }),
    [[20, "strong"], [16, "strong"], [10, "watch"], [4, "weak"]]
  );
  const customerPays = scoreShippingBurden(true, 0.9);
  assert.equal(customerPays.points, 20);
  assert.equal(customerPays.status, "strong");
  assert.equal(
    customerPays.explanation,
    "The customer pays shipping separately, earning 20 of 20 viability points."
  );
});

test("keeps factor totals in parity with the overall viability score", () => {
  const scenarios = [
    {},
    { desiredMarginPercentage: 50 },
    { customerPaysShipping: true },
    { machineMinutes: 10, laborMinutes: 5 },
  ];

  for (const overrides of scenarios) {
    const input = { ...defaults, ...overrides };
    const calculation = calculatePricing(input);
    assert.equal(calculation.valid, true);
    const viability = calculateViability(input, calculation.result);

    assert.equal(
      viability.score,
      viability.factors.reduce((sum, factor) => sum + factor.points, 0)
    );
    assert.equal(
      viability.factors.reduce((sum, factor) => sum + factor.maxPoints, 0),
      100
    );
    assert.ok(
      viability.factors.every((factor) => factor.points <= factor.maxPoints)
    );
  }
});

test("rejects calculations that overflow", () => {
  assert.equal(
    calculate({ materialCost: Number.MAX_VALUE, packagingCost: Number.MAX_VALUE }).valid,
    false
  );
});
