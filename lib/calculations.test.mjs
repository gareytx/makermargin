import assert from "node:assert/strict";
import test from "node:test";

import {
  calculatePricing,
  calculateViability,
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

test("rejects calculations that overflow", () => {
  assert.equal(
    calculate({ materialCost: Number.MAX_VALUE, packagingCost: Number.MAX_VALUE }).valid,
    false
  );
});
