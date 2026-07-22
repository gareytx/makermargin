"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { currency, percent } from "@/lib/calculations";
import { formatComparisonValue, formatMetric, utilizationLabel } from "@/lib/comparison-formatting";
import {
  compareSavedProducts,
  type BatchSubleaderKey,
  type BottleneckResource,
  type ComparisonConstraints,
  type LeaderCategory,
  type LeaderResult,
  type MetricResult,
  type ProductComparisonMetrics,
  type ProductComparisonOutput,
} from "@/lib/product-comparison";
import type { SavedProduct } from "@/lib/saved-products";

type CapacityFields = { labor: string; cash: string; machines: Record<string, string> };
type FieldErrors = Record<string, string>;

const emptyCapacity: CapacityFields = { labor: "", cash: "", machines: {} };

const leaderDefinitions: Array<[LeaderCategory, string, string]> = [
  ["highestProfitPerUnit", "Highest profit per sale", "Greatest stored net business profit per standard sale."],
  ["highestProfitMargin", "Highest profit margin", "Greatest stored net business profit as a percentage of selling price."],
  ["highestOwnerBenefitPerLaborHour", "Highest owner benefit per active labor hour", "Greatest owner labor compensation plus business profit per active labor hour."],
  ["highestBusinessProfitPerMachineHour", "Highest business profit per occupied machine hour", "Greatest business profit per hour of occupied primary-machine time."],
  ["lowestUpfrontCashRequirement", "Lowest upfront cash per sellable product", "Least explicitly recorded upfront cash per sellable product."],
  ["fastestActiveProduction", "Fastest active production", "Least active labor time per sellable product."],
];

const metricGroups: Array<[string, Array<[keyof ProductComparisonMetrics, string]>]> = [
  ["Profitability", [
    ["sellingPrice", "Selling price"], ["totalCashCostPerSale", "Total cash cost per standard sale"],
    ["ownerLaborCompensation", "Owner labor compensation"], ["machineCost", "Allocated economic machine cost"],
    ["netBusinessProfit", "Net business profit"], ["profitMarginPercentage", "Profit margin"],
    ["ownerEconomicBenefit", "Owner economic benefit"],
  ]],
  ["Production and throughput", [
    ["activeLaborMinutesPerSellableProduct", "Active labor per sellable product"], ["activeLaborMinutesPerBatch", "Active labor per representative batch"],
    ["occupiedMachineMinutesPerSellableProduct", "Occupied machine time per sellable product"], ["totalElapsedMinutesPerBatch", "Explicit elapsed time per representative batch"],
    ["unitsPerLaborHour", "Units per active labor hour"], ["unitsPerMachineHour", "Units per occupied machine hour"],
  ]],
  ["Efficiency", [
    ["businessProfitPerLaborHour", "Business profit per active labor hour"], ["ownerEconomicBenefitPerLaborHour", "Owner economic benefit per active labor hour"],
    ["businessProfitPerMachineHour", "Business profit per occupied machine hour"],
  ]],
  ["Representative batch", [
    ["netBusinessProfitPerBatch", "Net business profit per batch"], ["ownerEconomicBenefitPerBatch", "Owner economic benefit per batch"],
    ["upfrontCashRequiredPerBatch", "Upfront cash required per batch"], ["setupLaborMinutesPerSellableProduct", "Setup labor per sellable product"],
  ]],
  ["Cash and break-even", [
    ["upfrontCashRequiredPerUnit", "Upfront cash required per sellable product"], ["breakEvenUnits", "Break-even sellable products"],
  ]],
];

const batchLabels: Record<BatchSubleaderKey, string> = {
  highestProfitPerRepresentativeBatch: "Highest profit per representative batch",
  highestOwnerBenefitPerLaborHour: "Highest owner benefit per labor hour",
  lowestUpfrontCashPerRepresentativeBatch: "Lowest upfront cash per representative batch",
  lowestSetupLaborPerSellableProduct: "Lowest setup labor per sellable product",
};

const resourceLabels: Record<BottleneckResource, string> = { labor: "Owner labor", machine: "Primary machine", working_capital: "Working capital" };

export function CompareWorkspace({ initialProducts }: { initialProducts: SavedProduct[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [capacities, setCapacities] = useState<CapacityFields>(emptyCapacity);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const [result, setResult] = useState<ProductComparisonOutput | null>(null);
  const [showCapacityResult, setShowCapacityResult] = useState(false);

  const selectedProducts = initialProducts.filter((product) => selected.has(product.id));
  const machines = useMemo(() => {
    const unique = new Map<string, string>();
    for (const product of selectedProducts) {
      const machine = product.pricingInputs?.schemaVersion === "pricing-input-v2" ? product.pricingInputs.productionProfile?.primaryMachine : undefined;
      if (machine && !unique.has(machine.key)) unique.set(machine.key, machine.label);
    }
    return [...unique].map(([key, label]) => ({ key, label }));
  }, [selectedProducts]);

  if (!initialProducts.length) return <EmptyState title="No saved products yet" body="Save products from the calculator before comparing them." linkLabel="Open the calculator" />;
  if (initialProducts.length === 1) return <div role="status" className="rounded border border-slate-700 bg-slate-900 p-5"><h2 className="text-xl font-semibold">One more product is needed</h2><p className="mt-2 text-slate-300">Comparison requires at least two saved products. Your saved product, <strong>{initialProducts[0].name}</strong>, remains available.</p><Link href="/" className="mt-4 inline-block text-emerald-400">Create another product</Link></div>;

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setMessage("");
  }

  function setCapacity(field: "labor" | "cash", value: string) {
    setCapacities((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  }

  function setMachineCapacity(key: string, value: string) {
    setCapacities((current) => ({ ...current, machines: { ...current.machines, [key]: value } }));
    setErrors((current) => ({ ...current, [`machine-${key}`]: "" }));
  }

  function runComparison() {
    if (selectedProducts.length < 2) {
      setMessage("Select at least two products before comparing.");
      return;
    }
    const built = buildConstraints(capacities, machines);
    if (!built.valid) {
      setErrors(built.errors);
      setMessage("Check the optional capacity limits.");
      return;
    }
    try {
      const next = compareSavedProducts({ products: selectedProducts, constraints: built.constraints, generatedAt: new Date().toISOString() });
      setResult(next);
      setShowCapacityResult(built.hasValues);
      setErrors({});
      setMessage(`Comparison updated for ${selectedProducts.length} products.`);
    } catch {
      setMessage("The comparison could not be generated. Check the selected products and capacity limits.");
    }
  }

  return <div className="space-y-8">
    <section aria-labelledby="selection-heading">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="selection-heading" className="text-2xl font-semibold">Choose products</h2><p role="status" aria-live="polite" className="mt-1 text-sm text-slate-300">{selected.size} products selected</p></div><div className="flex gap-2"><button type="button" onClick={() => setSelected(new Set(initialProducts.map((product) => product.id)))} className={secondaryButton}>Select all</button><button type="button" onClick={() => setSelected(new Set())} className={secondaryButton}>Clear selection</button></div></div>
      <fieldset className="mt-4"><legend className="sr-only">Products to compare</legend><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{initialProducts.map((product) => <ProductChoice key={product.id} product={product} checked={selected.has(product.id)} onChange={() => toggle(product.id)} />)}</div></fieldset>
      {selected.size < 2 ? <p id="comparison-requirement" className="mt-3 text-sm text-amber-300">Select at least two products to enable comparison.</p> : null}
    </section>

    <fieldset className="rounded border border-slate-700 bg-slate-900 p-4"><legend className="px-2 text-xl font-semibold">Test your capacity limits</legend><p id="capacity-description" className="text-sm text-slate-300">These optional limits should describe the same planning period, such as one week. They are used only for this comparison and are not saved.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><CapacityInput id="labor" label="Available owner labor hours" value={capacities.labor} error={errors.labor} onChange={(value) => setCapacity("labor", value)} /><CapacityInput id="cash" label="Working-capital ceiling ($)" value={capacities.cash} error={errors.cash} onChange={(value) => setCapacity("cash", value)} />{machines.map((machine) => <CapacityInput key={machine.key} id={`machine-${machine.key}`} label={`Available hours for ${machine.label}`} description={`Machine capacity key: ${machine.key}`} value={capacities.machines[machine.key] ?? ""} error={errors[`machine-${machine.key}`]} onChange={(value) => setMachineCapacity(machine.key, value)} />)}</div>
      {selectedProducts.some((product) => !(product.pricingInputs?.schemaVersion === "pricing-input-v2" && product.pricingInputs.productionProfile?.primaryMachine)) ? <p className="mt-3 text-sm text-slate-400">Some selected products have no primary machine details, so no machine limit can be tested for them.</p> : null}
      <button type="button" onClick={() => { setCapacities(emptyCapacity); setErrors({}); }} className={`mt-4 ${secondaryButton}`}>Clear capacity limits</button>
    </fieldset>

    {message ? <p role={Object.values(errors).some(Boolean) || selected.size < 2 ? "alert" : "status"} aria-live="polite" className="rounded border border-slate-700 bg-slate-900 p-3">{message}</p> : null}
    <button type="button" disabled={selected.size < 2} aria-describedby={selected.size < 2 ? "comparison-requirement" : undefined} onClick={runComparison} className="min-h-11 rounded bg-emerald-500 px-5 py-3 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50">{result ? "Update comparison" : "Compare selected products"}</button>

    {result ? <ComparisonResults result={result} products={initialProducts} showCapacity={showCapacityResult} /> : null}
  </div>;
}

function ProductChoice({ product, checked, onChange }: { product: SavedProduct; checked: boolean; onChange: () => void }) {
  const result = product.calculationSnapshot?.data.result;
  const profile = product.pricingInputs?.schemaVersion === "pricing-input-v2" ? product.pricingInputs : null;
  const statuses = [result ? "Pricing ready" : "Some comparison details unavailable"];
  if (product.pricingInputs?.schemaVersion === "pricing-input-v1") statuses.push("Historical pricing only");
  if (profile?.productionProfile) statuses.push("Production details added");
  if (profile?.cashProfile) statuses.push("Cash details added");
  return <label className={`block cursor-pointer rounded border p-4 focus-within:ring-2 focus-within:ring-emerald-400 ${checked ? "border-emerald-500 bg-emerald-950/30" : "border-slate-700 bg-slate-900"}`}><span className="flex items-start gap-3"><input type="checkbox" checked={checked} onChange={onChange} className="mt-1 size-5 accent-emerald-500" /><span className="min-w-0 flex-1"><span className="block break-words font-semibold">{product.name}</span><span className="mt-1 block text-xs text-slate-400">Updated {new Date(product.updatedAt).toLocaleDateString()}</span></span></span>{result ? <dl className="mt-4 grid gap-2 text-sm"><Summary label="Recommended price" value={currency(result.recommendedPrice)} /><Summary label="Net business profit" value={currency(result.netProfit)} /><Summary label="Profit margin" value={percent(result.profitMarginPercentage)} /></dl> : <p className="mt-3 text-sm text-amber-300">Stored pricing summary unavailable.</p>}<ul className="mt-3 flex flex-wrap gap-2 text-xs">{statuses.map((status) => <li key={status} className="rounded border border-slate-600 px-2 py-1 text-slate-300">{status}</li>)}</ul></label>;
}

function CapacityInput({ id, label, description, value, error, onChange }: { id: string; label: string; description?: string; value: string; error?: string; onChange: (value: string) => void }) {
  const descriptionId = `${id}-description`; const errorId = `${id}-error`;
  return <label htmlFor={id} className="text-sm"><span className="block font-medium">{label}</span>{description ? <span id={descriptionId} className="block text-xs text-slate-400">{description}</span> : null}<input id={id} type="number" min="0" step="0.01" inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={[description ? descriptionId : "", error ? errorId : ""].filter(Boolean).join(" ") || "capacity-description"} className="mt-1 w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-white" />{error ? <span id={errorId} className="mt-1 block text-xs text-red-300">{error}</span> : null}</label>;
}

function ComparisonResults({ result, products, showCapacity }: { result: ProductComparisonOutput; products: SavedProduct[]; showCapacity: boolean }) {
  const name = (id: string) => products.find((product) => product.id === id)?.name ?? "Unavailable product";
  return <div className="space-y-10 border-t border-slate-700 pt-8">
    <section aria-labelledby="decision-heading"><h2 id="decision-heading" className="text-2xl font-semibold">Decision summary</h2><ul className="mt-4 space-y-2 border-l-4 border-emerald-500 pl-4 text-slate-200">{result.explanation.map((line) => <li key={line}>{line}</li>)}</ul></section>
    <section aria-labelledby="leaders-heading"><h2 id="leaders-heading" className="text-2xl font-semibold">Category leaders</h2><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{leaderDefinitions.map(([key, label, description]) => <LeaderCard key={key} label={label} description={description} result={result.categoryLeaders[key]} name={name} />)}</div></section>
    <section aria-labelledby="details-heading"><h2 id="details-heading" className="text-2xl font-semibold">Detailed comparison</h2><p className="mt-1 text-sm text-slate-400">One column represents one sellable product in one standard sale.</p><ComparisonTable result={result} /></section>
    <BatchEconomics result={result} name={name} />
    {showCapacity ? <CapacityResults result={result} name={name} /> : null}
    <CompatibilityGuidance result={result} products={products} />
  </div>;
}

function LeaderCard({ label, description, result, name }: { label: string; description: string; result: LeaderResult; name: (id: string) => string }) {
  return <article className="rounded border border-slate-700 bg-slate-900 p-4"><h3 className="font-semibold">{label}</h3>{result.status === "available" ? <><p className="mt-3 break-words text-lg font-semibold text-emerald-300">{result.productIds.map(name).join(" and ")}</p><p className="mt-1 text-xl">{formatComparisonValue(result.value, result.unit)}</p><p className="mt-2 text-sm text-slate-400">{result.productIds.length > 1 ? "These products are tied. " : ""}{description}</p></> : <><p className="mt-3 font-semibold text-amber-300">Unavailable</p><p className="mt-1 text-sm text-slate-400">{result.reason.message} More production or cash details may be required.</p></>}</article>;
}

function ComparisonTable({ result }: { result: ProductComparisonOutput }) {
  return <div className="mt-4 overflow-x-auto rounded border border-slate-700"><table className="min-w-[760px] w-full border-collapse text-sm"><thead><tr className="bg-slate-900"><th scope="col" className="sticky left-0 z-10 min-w-56 border-b border-r border-slate-700 bg-slate-900 p-3 text-left">Metric</th>{result.products.map((product) => <th scope="col" key={product.productId} className="min-w-52 border-b border-slate-700 p-3 text-left"><Link className="break-words text-emerald-400" href={`/products/${product.productId}`}>{product.productName}</Link></th>)}</tr></thead><tbody>{metricGroups.flatMap(([group, rows]) => [<tr key={group}><th colSpan={result.products.length + 1} className="bg-slate-800 p-3 text-left text-emerald-300">{group}</th></tr>, ...rows.map(([key, label]) => <tr key={key} className="border-t border-slate-800"><th scope="row" className="sticky left-0 z-10 border-r border-slate-700 bg-slate-950 p-3 text-left font-medium">{label}</th>{result.products.map((product) => <MetricCell key={product.productId} metric={product.metrics[key]} productId={product.productId} />)}</tr>)])}</tbody></table></div>;
}

function MetricCell({ metric, productId }: { metric: MetricResult; productId: string }) {
  return <td className="p-3 align-top">{metric.status === "available" ? <span className="font-medium">{formatMetric(metric)}</span> : <div><span className="font-semibold text-amber-300">Unavailable</span><p className="mt-1 max-w-64 text-xs text-slate-400">{metric.reason.message}</p>{metric.reason.missingFields?.length ? <p className="mt-1 text-xs text-slate-500">Missing: {metric.reason.missingFields.join(", ")}</p> : null}<Link href={`/products/${productId}#production-cash-profile`} className="mt-2 inline-block text-xs text-emerald-400">Add comparison details</Link></div>}</td>;
}

function BatchEconomics({ result, name }: { result: ProductComparisonOutput; name: (id: string) => string }) {
  const batch = result.batchEconomics;
  return <section aria-labelledby="batch-heading"><h2 id="batch-heading" className="text-2xl font-semibold">Batch economics</h2><p className="mt-2 text-slate-300">{batch.status === "dominant" ? `${batch.dominantProductIds?.map(name).join(" and ")} leads every available batch measure.` : batch.explanation}</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{Object.entries(batch.subleaders).map(([key, subleader]) => <LeaderCard key={key} label={batchLabels[key as BatchSubleaderKey]} description="Independent representative-batch measure." result={subleader} name={name} />)}</div></section>;
}

function CapacityResults({ result, name }: { result: ProductComparisonOutput; name: (id: string) => string }) {
  return <section aria-labelledby="capacity-results-heading"><h2 id="capacity-results-heading" className="text-2xl font-semibold">Capacity and bottlenecks</h2><p className="mt-1 text-sm text-slate-400">Utilization reflects only the limits supplied for this comparison and may exceed 100%.</p><div className="mt-4 grid gap-4 lg:grid-cols-2">{Object.entries(result.bottlenecksByProduct).map(([productId, bottleneck]) => <article key={productId} className="rounded border border-slate-700 bg-slate-900 p-4"><h3 className="break-words text-lg font-semibold">{name(productId)}</h3><dl className="mt-3 space-y-3">{Object.entries(bottleneck.utilizations).map(([resource, metric]) => <div key={resource}><dt className="text-sm text-slate-400">{resourceLabels[resource as BottleneckResource]} utilization</dt><dd>{metric.status === "available" ? <><span className="font-semibold">{formatMetric(metric)}</span><span className="ml-2 text-xs text-slate-400">{utilizationLabel(metric.value)}</span></> : <><span className="text-amber-300">Unavailable</span><span className="ml-2 text-xs text-slate-400">{metric.reason.message}</span></>}</dd></div>)}</dl>{bottleneck.status === "available" ? <div className="mt-4 border-t border-slate-700 pt-3 text-sm"><p><strong>Primary bottleneck:</strong> {bottleneck.primaryResources.map((resource) => resourceLabels[resource]).join(" and ")}</p><p className="mt-1"><strong>Near-tied resources:</strong> {bottleneck.nearTiedResources.map((resource) => resourceLabels[resource]).join(", ")}</p></div> : <p className="mt-4 text-sm text-amber-300">{bottleneck.reason?.message}</p>}</article>)}</div></section>;
}

function CompatibilityGuidance({ result, products }: { result: ProductComparisonOutput; products: SavedProduct[] }) {
  const unavailableByProduct = result.products.map((product) => ({ product, codes: new Set(Object.values(product.metrics).flatMap((metric) => metric.status === "unavailable" ? [metric.reason.code] : [])) })).filter(({ codes }) => codes.size);
  const name = (id: string) => products.find((product) => product.id === id)?.name ?? "Saved product";
  return <section aria-labelledby="guidance-heading"><h2 id="guidance-heading" className="text-2xl font-semibold">Compatibility and missing data</h2>{result.compatibilityWarnings.length ? <div className="mt-4 rounded border border-amber-700 bg-amber-950/30 p-4"><h3 className="font-semibold">Historical compatibility</h3><ul className="mt-2 list-disc space-y-2 pl-5 text-sm">{result.compatibilityWarnings.map((warning) => <li key={`${warning.productId}-${warning.code}`}><Link href={`/products/${warning.productId}`} className="text-emerald-400">{name(warning.productId)}</Link>: {warning.message}</li>)}</ul></div> : <p className="mt-2 text-slate-300">The selected stored pricing versions are compatible with comparison-v1.</p>}{unavailableByProduct.length ? <div className="mt-5"><h3 className="text-lg font-semibold">Improve this comparison</h3><ul className="mt-3 grid gap-3 sm:grid-cols-2">{unavailableByProduct.map(({ product, codes }) => <li key={product.productId} className="rounded border border-slate-700 p-4"><p className="break-words font-semibold">{product.productName}</p><p className="mt-1 text-sm text-slate-400">{guidanceFor(codes)}</p><Link href={`/products/${product.productId}#production-cash-profile`} className="mt-2 inline-block text-sm text-emerald-400">Add comparison details</Link></li>)}</ul></div> : null}</section>;
}

function guidanceFor(codes: Set<string>) {
  const guidance: string[] = [];
  if (["missing_production_profile", "missing_active_labor", "missing_machine_time", "missing_elapsed_time"].some((code) => codes.has(code))) guidance.push("Add production details, including explicit elapsed batch time where available.");
  if (["missing_cash_profile", "missing_cash_cost", "missing_upfront_cash", "missing_fixed_launch_cost"].some((code) => codes.has(code))) guidance.push("Add actual cash, upfront cash, and assigned launch-cost details where known.");
  if (["unsupported_snapshot", "unsupported_formula_version", "incompatible_metric_definition"].some((code) => codes.has(code))) guidance.push("Some historical definitions are not compatible with this comparison version.");
  return guidance.join(" ") || "Additional structured details are needed for some metrics.";
}

export function buildConstraints(capacities: CapacityFields, machines: Array<{ key: string; label: string }>): { valid: true; constraints?: ComparisonConstraints; hasValues: boolean } | { valid: false; errors: FieldErrors } {
  const errors: FieldErrors = {};
  const parse = (value: string, field: string, label: string, multiplier = 1) => {
    if (value.trim() === "") return undefined;
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) { errors[field] = `${label} must be greater than zero.`; return undefined; }
    return number * multiplier;
  };
  const availableLaborMinutes = parse(capacities.labor, "labor", "Available owner labor hours", 60);
  const workingCapitalCeiling = parse(capacities.cash, "cash", "Working-capital ceiling");
  const availableMachineMinutesByKey: Record<string, number> = {};
  for (const machine of machines) {
    const value = parse(capacities.machines[machine.key] ?? "", `machine-${machine.key}`, `Available hours for ${machine.label}`, 60);
    if (value !== undefined) availableMachineMinutesByKey[machine.key] = value;
  }
  if (Object.values(errors).some(Boolean)) return { valid: false, errors };
  const hasMachine = Object.keys(availableMachineMinutesByKey).length > 0;
  const hasValues = availableLaborMinutes !== undefined || workingCapitalCeiling !== undefined || hasMachine;
  return { valid: true, hasValues, constraints: hasValues ? { ...(availableLaborMinutes !== undefined ? { availableLaborMinutes } : {}), ...(workingCapitalCeiling !== undefined ? { workingCapitalCeiling } : {}), ...(hasMachine ? { availableMachineMinutesByKey } : {}) } : undefined };
}

function Summary({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-3"><dt className="text-slate-400">{label}</dt><dd className="font-semibold">{value}</dd></div>; }
function EmptyState({ title, body, linkLabel }: { title: string; body: string; linkLabel: string }) { return <div role="status" className="rounded border border-slate-700 bg-slate-900 p-5"><h2 className="text-xl font-semibold">{title}</h2><p className="mt-2 text-slate-300">{body}</p><Link href="/" className="mt-4 inline-block text-emerald-400">{linkLabel}</Link></div>; }
const secondaryButton = "min-h-11 rounded border border-slate-600 px-3 py-2 text-sm hover:border-slate-400 focus-visible:outline-2 focus-visible:outline-emerald-400";
