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
  assert.ok(digitalPrint.laborMinutes > 0);
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
