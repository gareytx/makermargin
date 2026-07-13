"use client";

import { useMemo, useState } from "react";

type PricingInput = {
  productName: string;
  materialCost: number;
  packagingCost: number;
  otherCost: number;
  wastePercentage: number;
  machineMinutes: number;
  machineHourlyRate: number;
  laborMinutes: number;
  laborHourlyRate: number;
  marketplaceFeePercentage: number;
  processingFeePercentage: number;
  fixedTransactionFee: number;
  shippingCost: number;
  customerPaysShipping: boolean;
  desiredMarginPercentage: number;
};

type PricingResult = {
  hardCost: number;
  wasteCost: number;
  machineCost: number;
  laborCost: number;
  shippingCostIncluded: number;
  trueBaseCost: number;
  recommendedPrice: number;
  estimatedFees: number;
  netProfit: number;
  profitMarginPercentage: number;
  effectiveHourlyEarnings: number;
};

const defaultInput: PricingInput = {
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

function calculatePricing(input: PricingInput): PricingResult {
  const hardCost = input.materialCost + input.packagingCost + input.otherCost;

  const wasteCost = input.materialCost * (input.wastePercentage / 100);

  const machineCost = (input.machineMinutes / 60) * input.machineHourlyRate;

  const laborCost = (input.laborMinutes / 60) * input.laborHourlyRate;

  const shippingCostIncluded = input.customerPaysShipping ? 0 : input.shippingCost;

  const trueBaseCost =
    hardCost + wasteCost + machineCost + laborCost + shippingCostIncluded;

  const desiredMargin = input.desiredMarginPercentage / 100;

  const percentageFees =
    (input.marketplaceFeePercentage + input.processingFeePercentage) / 100;

  const denominator = 1 - desiredMargin - percentageFees;

  const recommendedPrice =
    denominator > 0
      ? (trueBaseCost + input.fixedTransactionFee) / denominator
      : 0;

  const estimatedFees =
    recommendedPrice * percentageFees + input.fixedTransactionFee;

  const netProfit = recommendedPrice - trueBaseCost - estimatedFees;

  const profitMarginPercentage =
    recommendedPrice > 0 ? (netProfit / recommendedPrice) * 100 : 0;

  const totalProductionHours =
    (input.machineMinutes + input.laborMinutes) / 60;

  const effectiveHourlyEarnings =
    totalProductionHours > 0 ? netProfit / totalProductionHours : 0;

  return {
    hardCost,
    wasteCost,
    machineCost,
    laborCost,
    shippingCostIncluded,
    trueBaseCost,
    recommendedPrice,
    estimatedFees,
    netProfit,
    profitMarginPercentage,
    effectiveHourlyEarnings,
  };
}

function calculateViability(input: PricingInput, result: PricingResult) {
  let score = 0;

  if (result.profitMarginPercentage >= 50) score += 30;
  else if (result.profitMarginPercentage >= 40) score += 25;
  else if (result.profitMarginPercentage >= 30) score += 20;
  else if (result.profitMarginPercentage >= 20) score += 12;
  else score += 4;

  if (result.effectiveHourlyEarnings >= 40) score += 30;
  else if (result.effectiveHourlyEarnings >= 30) score += 24;
  else if (result.effectiveHourlyEarnings >= 20) score += 16;
  else if (result.effectiveHourlyEarnings >= 10) score += 8;
  else score += 2;

  const totalMinutes = input.machineMinutes + input.laborMinutes;

  if (totalMinutes <= 15) score += 20;
  else if (totalMinutes <= 30) score += 16;
  else if (totalMinutes <= 60) score += 12;
  else if (totalMinutes <= 90) score += 7;
  else score += 3;

  const shippingRatio =
    result.recommendedPrice > 0
      ? input.shippingCost / result.recommendedPrice
      : 1;

  if (input.customerPaysShipping) score += 20;
  else if (shippingRatio <= 0.1) score += 20;
  else if (shippingRatio <= 0.15) score += 16;
  else if (shippingRatio <= 0.25) score += 10;
  else score += 4;

  if (score >= 85) {
    return {
      score,
      label: "Excellent",
      summary: "This looks like a strong product with healthy profit potential.",
      recommendation:
        "This is worth testing online, locally, or as part of a product bundle.",
    };
  }

  if (score >= 70) {
    return {
      score,
      label: "Good",
      summary: "This product looks workable, but there may be room to improve.",
      recommendation:
        "Review labor time, batching, shipping, and market price before scaling it.",
    };
  }

  if (score >= 50) {
    return {
      score,
      label: "Caution",
      summary: "This product may work, but the numbers are not especially strong.",
      recommendation:
        "This may be better as a craft show item, add-on product, or higher-priced custom order.",
    };
  }

  return {
    score,
    label: "Weak",
    summary: "This product may not be worth selling at the current numbers.",
    recommendation:
      "Consider raising the price, reducing time, lowering costs, or selling it only as a premium custom item.",
  };
}

function currency(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number.isFinite(value) ? value : 0);
}

function percent(value: number): string {
  return `${(Number.isFinite(value) ? value : 0).toFixed(1)}%`;
}

export default function Home() {
  const [input, setInput] = useState<PricingInput>(defaultInput);

  const result = useMemo(() => calculatePricing(input), [input]);

  const viability = useMemo(
    () => calculateViability(input, result),
    [input, result]
  );

  function updateField(
    field: keyof PricingInput,
    value: string | number | boolean
  ) {
    setInput((current) => ({
      ...current,
      [field]: typeof current[field] === "number" ? Number(value) : value,
    }));
  }

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-10 text-white">
      <div className="mx-auto max-w-6xl">
        <section className="mb-10">
          <p className="mb-2 text-sm font-semibold uppercase tracking-widest text-emerald-400">
            MakerMargin Prototype
          </p>

          <h1 className="mb-4 text-4xl font-bold tracking-tight md:text-6xl">
            Stop guessing what to charge.
          </h1>

          <p className="max-w-3xl text-lg text-slate-300">
            Enter your material costs, labor, machine time, fees, and shipping.
            MakerMargin calculates your true cost, recommended price, profit,
            margin, hourly earnings, and product viability.
          </p>
        </section>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-xl">
            <h2 className="mb-6 text-2xl font-semibold">
              Product Calculator
            </h2>

            <div className="grid gap-4 md:grid-cols-2">
              <TextInput
                label="Product name"
                value={input.productName}
                onChange={(value) => updateField("productName", value)}
              />

              <NumberInput
                label="Material cost"
                value={input.materialCost}
                onChange={(value) => updateField("materialCost", value)}
              />

              <NumberInput
                label="Packaging cost"
                value={input.packagingCost}
                onChange={(value) => updateField("packagingCost", value)}
              />

              <NumberInput
                label="Other cost"
                value={input.otherCost}
                onChange={(value) => updateField("otherCost", value)}
              />

              <NumberInput
                label="Waste percentage"
                value={input.wastePercentage}
                onChange={(value) => updateField("wastePercentage", value)}
              />

              <NumberInput
                label="Machine time in minutes"
                value={input.machineMinutes}
                onChange={(value) => updateField("machineMinutes", value)}
              />

              <NumberInput
                label="Machine hourly rate"
                value={input.machineHourlyRate}
                onChange={(value) => updateField("machineHourlyRate", value)}
              />

              <NumberInput
                label="Labor time in minutes"
                value={input.laborMinutes}
                onChange={(value) => updateField("laborMinutes", value)}
              />

              <NumberInput
                label="Labor hourly rate"
                value={input.laborHourlyRate}
                onChange={(value) => updateField("laborHourlyRate", value)}
              />

              <NumberInput
                label="Marketplace fee percentage"
                value={input.marketplaceFeePercentage}
                onChange={(value) =>
                  updateField("marketplaceFeePercentage", value)
                }
              />

              <NumberInput
                label="Processing fee percentage"
                value={input.processingFeePercentage}
                onChange={(value) =>
                  updateField("processingFeePercentage", value)
                }
              />

              <NumberInput
                label="Fixed transaction fee"
                value={input.fixedTransactionFee}
                onChange={(value) => updateField("fixedTransactionFee", value)}
              />

              <NumberInput
                label="Shipping cost"
                value={input.shippingCost}
                onChange={(value) => updateField("shippingCost", value)}
              />

              <NumberInput
                label="Desired profit margin"
                value={input.desiredMarginPercentage}
                onChange={(value) =>
                  updateField("desiredMarginPercentage", value)
                }
              />
            </div>

            <label className="mt-5 flex items-center gap-3 rounded-xl border border-slate-700 bg-slate-950 p-4 text-sm text-slate-200">
              <input
                type="checkbox"
                checked={input.customerPaysShipping}
                onChange={(event) =>
                  updateField("customerPaysShipping", event.target.checked)
                }
                className="h-5 w-5"
              />
              Customer pays shipping separately
            </label>
          </section>

          <section className="rounded-2xl border border-slate-800 bg-white p-6 text-slate-950 shadow-xl">
            <div className="mb-6">
              <p className="text-sm font-semibold uppercase tracking-widest text-slate-500">
                Recommended Price
              </p>

              <p className="mt-2 text-5xl font-bold">
                {currency(result.recommendedPrice)}
              </p>

              <p className="mt-2 text-sm text-slate-600">
                Suggested selling price for{" "}
                <span className="font-semibold">{input.productName}</span>
              </p>
            </div>

            <div className="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-lg font-semibold">Product Viability</h3>
                <span className="rounded-full bg-slate-950 px-3 py-1 text-sm font-bold text-white">
                  {viability.score}/100
                </span>
              </div>

              <p className="mb-1 text-xl font-bold">{viability.label}</p>
              <p className="text-sm text-slate-700">{viability.summary}</p>
              <p className="mt-3 text-sm font-medium text-slate-900">
                {viability.recommendation}
              </p>
            </div>

            <div className="grid gap-3">
              <ResultRow
                label="True base cost"
                value={currency(result.trueBaseCost)}
              />
              <ResultRow label="Hard cost" value={currency(result.hardCost)} />
              <ResultRow label="Waste cost" value={currency(result.wasteCost)} />
              <ResultRow
                label="Machine cost"
                value={currency(result.machineCost)}
              />
              <ResultRow label="Labor cost" value={currency(result.laborCost)} />
              <ResultRow
                label="Shipping included in price"
                value={currency(result.shippingCostIncluded)}
              />
              <ResultRow
                label="Estimated fees"
                value={currency(result.estimatedFees)}
              />
              <ResultRow label="Net profit" value={currency(result.netProfit)} />
              <ResultRow
                label="Profit margin"
                value={percent(result.profitMarginPercentage)}
              />
              <ResultRow
                label="Effective hourly earnings"
                value={`${currency(result.effectiveHourlyEarnings)}/hr`}
              />
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}

function TextInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-300">
        {label}
      </span>
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none ring-emerald-400 focus:ring-2"
      />
    </label>
  );
}

function NumberInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-slate-300">
        {label}
      </span>
      <input
        type="number"
        step="0.01"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none ring-emerald-400 focus:ring-2"
      />
    </label>
  );
}

function ResultRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-200 py-2">
      <span className="text-sm text-slate-600">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
