import assert from "node:assert/strict";
import test from "node:test";

import { calculatePricing, validatePricingInput } from "./calculations.ts";
import { getProductPreset, productPresets } from "./product-presets.ts";

const requiredIds = [
  "custom",
  "slate-coasters",
  "metal-wallet-card",
  "leather-journal",
  "cutting-board",
  "digital-print",
];

test("preset IDs are unique and all required presets exist", () => {
  const ids = productPresets.map((preset) => preset.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual([...ids].sort(), [...requiredIds].sort());
});

test("every preset has valid assumption metadata", () => {
  const validTypes = new Set([
    "verified-supplier",
    "business-baseline",
    "amortized-estimate",
    "template",
  ]);

  for (const preset of productPresets) {
    assert.ok(validTypes.has(preset.assumptionType), preset.id);
    assert.match(preset.lastReviewed, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(
      Number.isNaN(Date.parse(`${preset.lastReviewed}T00:00:00Z`)),
      false,
      `${preset.id} must have a valid review date`
    );
    if (preset.assumptionType !== "template") {
      assert.ok(preset.assumptionNotes.length > 0, `${preset.id} needs notes`);
    }
  }
});

test("every preset has finite, non-negative numeric values", () => {
  for (const preset of productPresets) {
    for (const [field, value] of Object.entries(preset.values)) {
      if (typeof value !== "number") continue;
      assert.equal(Number.isFinite(value), true, `${preset.id}.${field} must be finite`);
      assert.ok(value >= 0, `${preset.id}.${field} must not be negative`);
    }
  }
});

test("every preset passes Version 0.1.1 input validation", () => {
  for (const preset of productPresets) {
    assert.deepEqual(
      validatePricingInput(preset.values).errors,
      [],
      `${preset.id} should be valid`
    );
  }
});

test("digital print has no physical shipping or machine time", () => {
  const digitalPrint = getProductPreset("digital-print").values;
  assert.equal(digitalPrint.shippingCost, 0);
  assert.equal(digitalPrint.customerPaysShipping, true);
  assert.equal(digitalPrint.machineMinutes, 0);
  assert.equal(digitalPrint.laborMinutes, 5);
  assert.equal(digitalPrint.fixedTransactionFee, 0.45);
  assert.equal(digitalPrint.marketplaceFeePercentage, 6.5);
  assert.equal(digitalPrint.processingFeePercentage, 3);
});

test("supplier-backed presets preserve their verified material costs", () => {
  assert.equal(getProductPreset("leather-journal").values.materialCost, 11.95);
  assert.equal(getProductPreset("cutting-board").values.materialCost, 23.95);
});

test("slate coaster preset preserves the Version 0.1.1 calculation", () => {
  const slate = getProductPreset("slate-coasters").values;
  assert.deepEqual(slate, {
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
  });

  const calculation = calculatePricing(slate);
  assert.equal(calculation.valid, true);
  assert.equal(calculation.result.trueBaseCost, 37.891666666666666);
  assert.equal(calculation.result.recommendedPrice, 67.00292397660819);
  assert.equal(calculation.result.profitMarginPercentage, 30);
});

test("wallet card values and calculation remain unchanged", () => {
  const wallet = getProductPreset("metal-wallet-card").values;
  assert.deepEqual(wallet, {
    productName: "Metal Wallet Card",
    materialCost: 0.5,
    packagingCost: 0.5,
    otherCost: 0,
    wastePercentage: 5,
    machineMinutes: 1,
    machineHourlyRate: 7.75,
    laborMinutes: 10,
    laborHourlyRate: 40,
    marketplaceFeePercentage: 10,
    processingFeePercentage: 3,
    fixedTransactionFee: 0.3,
    shippingCost: 0,
    customerPaysShipping: true,
    desiredMarginPercentage: 30,
  });

  const calculation = calculatePricing(wallet);
  assert.equal(calculation.valid, true);
  assert.deepEqual(calculation.result, {
    hardCost: 1,
    wasteCost: 0.025,
    machineCost: 0.12916666666666665,
    laborCost: 6.666666666666666,
    shippingCostIncluded: 0,
    trueBaseCost: 7.820833333333333,
    recommendedPrice: 14.247076023391815,
    estimatedFees: 2.152119883040936,
    netProfit: 4.274122807017546,
    profitMarginPercentage: 30.000000000000014,
    effectiveHourlyEarnings: 23.31339712918662,
  });
});
