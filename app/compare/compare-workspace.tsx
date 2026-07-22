"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { currency, percent } from "@/lib/calculations";
import { comparisonMetricLabels, formatComparisonValue, formatMetric, utilizationLabel } from "@/lib/comparison-formatting";
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

const leaderDefinitions: Array<[LeaderCategory, string, string, string]> = [
  ["highestProfitPerUnit", "Highest profit per sale", "Greatest stored net business profit per standard sale.", "Stored pricing is needed to compare profit per sale."],
  ["highestProfitMargin", "Highest profit margin", "Greatest stored net business profit as a percentage of selling price.", "Stored pricing is needed to compare profit margin."],
  ["highestOwnerBenefitPerLaborHour", "Highest owner benefit per active labor hour", "Greatest owner labor compensation plus business profit per active labor hour.", "Production details are needed to compare owner benefit per active labor hour."],
  ["highestBusinessProfitPerMachineHour", "Highest business profit per occupied machine hour", "Greatest business profit per hour of occupied primary-machine time.", "Production and primary-machine details are needed to compare business profit per occupied machine hour."],
  ["lowestUpfrontCashRequirement", "Lowest upfront cash per sellable product", "Least explicitly recorded upfront cash per sellable product.", "Cash details are needed to compare upfront cash per sellable product."],
  ["fastestActiveProduction", "Fastest active production", "Least active labor time per sellable product.", "Production details are needed to compare active-production speed."],
];

type MetricRow = [keyof ProductComparisonMetrics, string];
const coreRows: MetricRow[] = [
  ["sellingPrice", "Selling price"], ["ownerLaborCompensation", "Owner labor compensation"],
  ["machineCost", "Allocated economic machine cost"], ["netBusinessProfit", "Net business profit"],
  ["profitMarginPercentage", "Profit margin"], ["ownerEconomicBenefit", "Owner economic benefit"],
];

const metricGroups: Array<[string, MetricRow[]]> = [
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
    ["totalCashCostPerSale", "Total cash cost per standard sale"], ["upfrontCashRequiredPerUnit", "Upfront cash required per sellable product"],
    ["breakEvenUnits", "Break-even sellable products"],
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
  const readiness = [
    result ? "Pricing ready" : "Pricing summary unavailable",
    profile?.productionProfile ? "Production details added" : "Production details missing",
    profile?.cashProfile ? "Cash details added" : "Cash details missing",
  ];
  return <div className={`rounded border p-4 ${checked ? "border-emerald-500 bg-emerald-950/30" : "border-slate-700 bg-slate-900"}`}><label className="block cursor-pointer focus-within:ring-2 focus-within:ring-emerald-400"><span className="flex items-start gap-3"><input type="checkbox" checked={checked} onChange={onChange} className="mt-1 size-5 accent-emerald-500" /><span className="min-w-0 flex-1"><span className="block break-words font-semibold">{product.name}</span><span className="mt-1 block text-xs text-slate-400">Updated {new Date(product.updatedAt).toLocaleDateString()}</span></span></span>{result ? <dl className="mt-4 grid gap-2 text-sm"><Summary label="Recommended price" value={currency(result.recommendedPrice)} /><Summary label="Net business profit" value={currency(result.netProfit)} /><Summary label="Profit margin" value={percent(result.profitMarginPercentage)} /></dl> : <p className="mt-3 text-sm text-amber-300">Stored pricing summary unavailable.</p>}<ul aria-label={`${product.name} comparison readiness`} className="mt-3 grid gap-1 text-xs">{readiness.map((status) => <li key={status} className="flex items-center gap-2 text-slate-300"><span aria-hidden="true">{status.endsWith("missing") || status.endsWith("unavailable") ? "○" : "✓"}</span>{status}</li>)}</ul></label><Link href={`/products/${product.id}#production-cash-profile`} className="mt-4 inline-block text-sm font-semibold text-emerald-400">{profile?.productionProfile || profile?.cashProfile ? "Edit comparison details" : "Add comparison details"}</Link></div>;
}

function CapacityInput({ id, label, description, value, error, onChange }: { id: string; label: string; description?: string; value: string; error?: string; onChange: (value: string) => void }) {
  const descriptionId = `${id}-description`; const errorId = `${id}-error`;
  return <label htmlFor={id} className="text-sm"><span className="block font-medium">{label}</span>{description ? <span id={descriptionId} className="block text-xs text-slate-400">{description}</span> : null}<input id={id} type="number" min="0" step="0.01" inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} aria-invalid={Boolean(error)} aria-describedby={[description ? descriptionId : "", error ? errorId : ""].filter(Boolean).join(" ") || "capacity-description"} className="mt-1 w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-white" />{error ? <span id={errorId} className="mt-1 block text-xs text-red-300">{error}</span> : null}</label>;
}

function ComparisonResults({ result, products, showCapacity }: { result: ProductComparisonOutput; products: SavedProduct[]; showCapacity: boolean }) {
  const name = (id: string) => products.find((product) => product.id === id)?.name ?? "Unavailable product";
  const selected = products.filter((product) => result.products.some((compared) => compared.productId === product.id));
  const missingProduction = selected.some((product) => product.pricingInputs?.schemaVersion !== "pricing-input-v2" || !product.pricingInputs.productionProfile);
  const missingCash = selected.some((product) => product.pricingInputs?.schemaVersion !== "pricing-input-v2" || !product.pricingInputs.cashProfile);
  return <div className="space-y-10 border-t border-slate-700 pt-8">
    <section aria-labelledby="decision-heading"><h2 id="decision-heading" className="text-2xl font-semibold">Decision summary</h2>{missingProduction || missingCash ? <p className="mt-3 rounded border border-amber-700 bg-amber-950/30 p-3 text-sm text-amber-100">Stored profit and margin can be compared now. {missingProduction ? "Some labor-efficiency, production, batch, and bottleneck metrics require production details. " : ""}{missingCash ? "Some cash, break-even, and working-capital metrics require cash details." : ""}</p> : null}<ul className="mt-4 space-y-2 border-l-4 border-emerald-500 pl-4 text-slate-200">{result.explanation.map((line) => <li key={line}>{line}</li>)}</ul></section>
    <section aria-labelledby="core-heading"><h2 id="core-heading" className="text-2xl font-semibold">Core comparison</h2><p className="mt-1 text-sm text-slate-400">Stored pricing economics for one sellable product in one standard sale.</p><MetricTable result={result} groups={[["Stored pricing", coreRows]]} /></section>
    <CategoryLeaders result={result} name={name} />
    <section aria-labelledby="details-heading"><h2 id="details-heading" className="text-2xl font-semibold">Additional comparison details</h2><p className="mt-1 text-sm text-slate-400">Rows with available information stay visible. Rows unavailable for every selected product are grouped below.</p><ComparisonTable result={result} /></section>
    <BatchEconomics result={result} name={name} />
    {showCapacity ? <CapacityResults result={result} name={name} /> : null}
    <CompatibilityGuidance result={result} products={products} />
  </div>;
}

function CategoryLeaders({ result, name }: { result: ProductComparisonOutput; name: (id: string) => string }) {
  const available = leaderDefinitions.filter(([key]) => result.categoryLeaders[key].status === "available");
  const unavailable = leaderDefinitions.filter(([key]) => result.categoryLeaders[key].status === "unavailable");
  return <section aria-labelledby="leaders-heading"><h2 id="leaders-heading" className="text-2xl font-semibold">Category leaders</h2>{available.length ? <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{available.map(([key, label, description]) => <LeaderCard key={key} label={label} description={description} result={result.categoryLeaders[key]} name={name} />)}</div> : null}{unavailable.length ? <details className="mt-4 rounded border border-slate-700 bg-slate-900 p-4"><summary className="cursor-pointer font-semibold text-amber-300 focus-visible:outline-2 focus-visible:outline-emerald-400">More data needed for {unavailable.length} leader {unavailable.length === 1 ? "category" : "categories"}</summary><ul className="mt-3 space-y-3 text-sm">{unavailable.map(([key, label, , unavailableMessage]) => <li key={key}><span className="font-medium">{label}</span><p className="text-slate-400">{unavailableMessage}</p></li>)}</ul></details> : null}</section>;
}

function LeaderCard({ label, description, result, name }: { label: string; description: string; result: LeaderResult; name: (id: string) => string }) {
  return <article className="rounded border border-slate-700 bg-slate-900 p-4"><h3 className="font-semibold">{label}</h3>{result.status === "available" ? <><p className="mt-3 break-words text-lg font-semibold text-emerald-300">{result.productIds.map(name).join(" and ")}</p><p className="mt-1 text-xl">{formatComparisonValue(result.value, result.unit)}</p><p className="mt-2 text-sm text-slate-400">{result.productIds.length > 1 ? "These products are tied. " : ""}{description}</p></> : <><p className="mt-3 font-semibold text-amber-300">Unavailable</p><p className="mt-1 text-sm text-slate-400">More comparison details are needed.</p></>}</article>;
}

function ComparisonTable({ result }: { result: ProductComparisonOutput }) {
  const visibleGroups = metricGroups.map(([group, rows]) => [group, rows.filter(([key]) => result.products.some((product) => product.metrics[key].status === "available"))] as [string, MetricRow[]]).filter(([, rows]) => rows.length);
  const unavailableGroups = metricGroups.map(([group, rows]) => [group, rows.filter(([key]) => result.products.every((product) => product.metrics[key].status === "unavailable"))] as [string, MetricRow[]]).filter(([, rows]) => rows.length);
  const unavailableCount = unavailableGroups.reduce((total, [, rows]) => total + rows.length, 0);
  return <>{visibleGroups.length ? <MetricTable result={result} groups={visibleGroups} /> : null}{unavailableCount ? <details className="mt-4 rounded border border-slate-700 bg-slate-900 p-4"><summary className="cursor-pointer font-semibold text-amber-300 focus-visible:outline-2 focus-visible:outline-emerald-400">Additional metrics requiring more details ({unavailableCount})</summary><p className="mt-2 text-sm text-slate-400">Expand to review every unavailable metric and its stored reason.</p><MetricTable result={result} groups={unavailableGroups} compact /></details> : null}</>;
}

function MetricTable({ result, groups, compact = false }: { result: ProductComparisonOutput; groups: Array<[string, MetricRow[]]>; compact?: boolean }) {
  return <div className="mt-4 overflow-x-auto rounded border border-slate-700"><table className="w-full min-w-[760px] border-collapse text-sm"><thead><tr className="bg-slate-900"><th scope="col" className="sticky left-0 z-10 min-w-56 border-b border-r border-slate-700 bg-slate-900 p-3 text-left">Metric</th>{result.products.map((product) => <th scope="col" key={product.productId} className="min-w-52 border-b border-slate-700 p-3 text-left"><Link className="break-words text-emerald-400" href={`/products/${product.productId}`}>{product.productName}</Link></th>)}</tr></thead><tbody>{groups.flatMap(([group, rows]) => [<tr key={group}><th colSpan={result.products.length + 1} className="bg-slate-800 p-3 text-left text-emerald-300">{group}</th></tr>, ...rows.map(([key, label]) => <tr key={key} className="border-t border-slate-800"><th scope="row" className="sticky left-0 z-10 border-r border-slate-700 bg-slate-950 p-3 text-left font-medium">{label}</th>{result.products.map((product) => <MetricCell key={product.productId} metric={product.metrics[key]} concise={compact} />)}</tr>)])}</tbody></table></div>;
}

function MetricCell({ metric, concise = false }: { metric: MetricResult; concise?: boolean }) {
  return <td className="p-3 align-top">{metric.status === "available" ? <span className="font-medium">{formatMetric(metric)}</span> : <div className="space-y-1"><p className="font-semibold text-amber-300">Unavailable</p>{" "}<p className={`text-slate-400 ${concise ? "text-xs" : "text-sm"}`}>{metric.reason.message}</p></div>}</td>;
}

function BatchEconomics({ result, name }: { result: ProductComparisonOutput; name: (id: string) => string }) {
  const batch = result.batchEconomics;
  const entries = Object.entries(batch.subleaders) as Array<[BatchSubleaderKey, LeaderResult]>;
  const available = entries.filter(([, leader]) => leader.status === "available");
  const unavailable = entries.filter(([, leader]) => leader.status === "unavailable");
  if (!available.length) return <section aria-labelledby="batch-heading"><h2 id="batch-heading" className="text-2xl font-semibold">Batch economics</h2><div className="mt-4 rounded border border-slate-700 bg-slate-900 p-4"><p className="font-semibold text-amber-300">More production and cash details are needed</p><p className="mt-1 text-sm text-slate-300">Batch economics require representative batch details such as batch size, setup labor, active labor, and applicable upfront cash information.</p><details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-emerald-400 focus-visible:outline-2 focus-visible:outline-emerald-400">Review 4 unavailable batch measures</summary><ul className="mt-2 space-y-2 text-sm">{unavailable.map(([key, leader]) => <li key={key}><span className="font-medium">{batchLabels[key]}</span><p className="text-slate-400">{leader.status === "unavailable" ? readableUnavailable(leader.reason.message, key === "highestOwnerBenefitPerLaborHour" ? "ownerEconomicBenefitPerLaborHour" : batchMetricKey(key)) : ""}</p></li>)}</ul></details></div></section>;
  return <section aria-labelledby="batch-heading"><h2 id="batch-heading" className="text-2xl font-semibold">Batch economics</h2><p className="mt-2 text-slate-300">{batch.status === "dominant" ? `${batch.dominantProductIds?.map(name).join(" and ")} leads every available batch measure.` : batch.explanation}</p><div className="mt-4 grid gap-3 sm:grid-cols-2">{available.map(([key, subleader]) => <LeaderCard key={key} label={batchLabels[key]} description="Independent representative-batch measure." result={subleader} name={name} />)}</div>{unavailable.length ? <details className="mt-4 rounded border border-slate-700 p-3"><summary className="cursor-pointer text-sm font-semibold text-amber-300 focus-visible:outline-2 focus-visible:outline-emerald-400">{unavailable.length} other batch {unavailable.length === 1 ? "measure needs" : "measures need"} more details</summary><ul className="mt-2 space-y-2 text-sm">{unavailable.map(([key, leader]) => <li key={key}><span className="font-medium">{batchLabels[key]}</span><p className="text-slate-400">{leader.status === "unavailable" ? readableUnavailable(leader.reason.message, batchMetricKey(key)) : ""}</p></li>)}</ul></details> : null}</section>;
}

function CapacityResults({ result, name }: { result: ProductComparisonOutput; name: (id: string) => string }) {
  return <section aria-labelledby="capacity-results-heading"><h2 id="capacity-results-heading" className="text-2xl font-semibold">Capacity and bottlenecks</h2><p className="mt-1 text-sm text-slate-400">Utilization reflects only the limits supplied for this comparison and may exceed 100%.</p><div className="mt-4 grid gap-4 lg:grid-cols-2">{Object.entries(result.bottlenecksByProduct).map(([productId, bottleneck]) => {
    const entries = Object.entries(bottleneck.utilizations) as Array<[BottleneckResource, MetricResult]>;
    const available = entries.filter(([, metric]) => metric.status === "available");
    const unavailable = entries.filter(([, metric]) => metric.status === "unavailable");
    return <article key={productId} className="rounded border border-slate-700 bg-slate-900 p-4"><h3 className="break-words text-lg font-semibold">{name(productId)}</h3>{available.length ? <dl className="mt-3 space-y-3">{available.map(([resource, metric]) => <div key={resource}><dt className="text-sm text-slate-400">{resourceLabels[resource]} utilization</dt><dd>{metric.status === "available" ? <><span className="font-semibold">{formatMetric(metric)}</span><span className="ml-2 text-xs text-slate-400">{utilizationLabel(metric.value)}</span></> : null}</dd></div>)}</dl> : <div className="mt-3"><p className="font-semibold text-amber-300">Capacity analysis unavailable</p><p className="mt-1 text-sm text-slate-400">Representative batch, active labor, and applicable upfront-cash details are needed before this product can be evaluated against supplied limits.</p></div>}{unavailable.length ? <details className="mt-3"><summary className="cursor-pointer text-sm font-semibold text-emerald-400 focus-visible:outline-2 focus-visible:outline-emerald-400">{available.length ? "Other capacity data unavailable" : "Review unavailable capacity details"}</summary><ul className="mt-2 space-y-2 text-sm">{unavailable.map(([resource, metric]) => <li key={resource}><p className="font-medium">{resourceLabels[resource]}</p><p className="text-slate-400">{metric.status === "unavailable" ? capacityReason(resource, metric.reason.message) : ""}</p></li>)}</ul></details> : null}{bottleneck.status === "available" ? <div className="mt-4 border-t border-slate-700 pt-3 text-sm"><p><strong>Primary bottleneck:</strong> {bottleneck.primaryResources.map((resource) => resourceLabels[resource]).join(" and ")}</p><p className="mt-1"><strong>Near-tied resources:</strong> {bottleneck.nearTiedResources.map((resource) => resourceLabels[resource]).join(", ")}</p></div> : <p className="mt-4 text-sm text-amber-300">A primary bottleneck cannot be determined until at least two resource utilizations are available.</p>}</article>;
  })}</div></section>;
}

function CompatibilityGuidance({ result, products }: { result: ProductComparisonOutput; products: SavedProduct[] }) {
  const unavailableByProduct = result.products.map((product) => ({ product, codes: new Set(Object.values(product.metrics).flatMap((metric) => metric.status === "unavailable" ? [metric.reason.code] : [])) })).filter(({ codes }) => codes.size);
  const name = (id: string) => products.find((product) => product.id === id)?.name ?? "Saved product";
  return <section aria-labelledby="guidance-heading"><h2 id="guidance-heading" className="text-2xl font-semibold">Compatibility and missing data</h2>{result.compatibilityWarnings.length ? <div className="mt-4 rounded border border-amber-700 bg-amber-950/30 p-4"><h3 className="font-semibold">Historical compatibility</h3><ul className="mt-2 list-disc space-y-2 pl-5 text-sm">{result.compatibilityWarnings.map((warning) => <li key={`${warning.productId}-${warning.code}`}><Link href={`/products/${warning.productId}`} className="text-emerald-400">{name(warning.productId)}</Link>: {warning.message}</li>)}</ul></div> : <p className="mt-2 text-slate-300">The selected stored pricing versions are compatible with comparison-v1.</p>}{unavailableByProduct.length ? <div className="mt-5"><h3 className="text-lg font-semibold">Improve this comparison</h3><ul className="mt-3 grid gap-3 sm:grid-cols-2">{unavailableByProduct.map(({ product, codes }) => <li key={product.productId} className="rounded border border-slate-700 p-4"><p className="break-words font-semibold">{product.productName}</p><p className="mt-1 text-sm text-slate-400">{guidanceFor(codes)}</p><Link href={`/products/${product.productId}#production-cash-profile`} className="mt-2 inline-block text-sm text-emerald-400">Add comparison details</Link></li>)}</ul></div> : null}</section>;
}

function guidanceFor(codes: Set<string>) {
  const guidance: string[] = [];
  if (["missing_production_profile", "missing_units_per_batch", "missing_active_labor", "missing_machine_time"].some((code) => codes.has(code))) guidance.push("Add production details to compare active labor, machine efficiency, and batch economics.");
  if (["missing_cash_profile", "missing_cash_cost", "missing_upfront_cash"].some((code) => codes.has(code))) guidance.push("Add cash details to compare upfront cash requirements and break-even units.");
  if (codes.has("missing_elapsed_time")) guidance.push("Add observed elapsed batch time to compare total production duration.");
  if (codes.has("missing_fixed_launch_cost")) guidance.push("Add an assigned product-launch cost to calculate break-even units.");
  if (["unsupported_snapshot", "unsupported_formula_version", "incompatible_metric_definition"].some((code) => codes.has(code))) guidance.push("Some historical definitions are not compatible with this comparison version.");
  return guidance.join(" ") || "Additional structured details are needed for some metrics.";
}

function batchMetricKey(key: BatchSubleaderKey): keyof ProductComparisonMetrics {
  return {
    highestProfitPerRepresentativeBatch: "netBusinessProfitPerBatch",
    highestOwnerBenefitPerLaborHour: "ownerEconomicBenefitPerLaborHour",
    lowestUpfrontCashPerRepresentativeBatch: "upfrontCashRequiredPerBatch",
    lowestSetupLaborPerSellableProduct: "setupLaborMinutesPerSellableProduct",
  }[key] as keyof ProductComparisonMetrics;
}

function readableUnavailable(message: string, metric: keyof ProductComparisonMetrics) {
  const camelCaseName = String(metric);
  return message.replaceAll(camelCaseName, comparisonMetricLabels[metric]);
}

function capacityReason(resource: BottleneckResource, message: string) {
  if (resource === "working_capital" && /production profile|upfront cash|required/i.test(message)) {
    return "Working-capital utilization requires both upfront cash information and a representative batch size.";
  }
  return message;
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
