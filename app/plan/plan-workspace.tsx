"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { formatMinutes } from "@/lib/comparison-formatting";
import { projectSavedProduct } from "@/lib/product-comparison";
import {
  MAX_PORTFOLIO_WHOLE_NUMBER,
  PORTFOLIO_PLAN_INPUT_VERSION,
  planPortfolio,
  type PlanningPeriodType,
  type PortfolioCapacityResult,
  type PortfolioEngineResult,
  type PortfolioProductLine,
  type PortfolioResourceReference,
  type PortfolioSuccessResult,
} from "@/lib/product-portfolio";
import type { SavedProduct } from "@/lib/saved-products";

type LineFields = { batches: string; demand: string };
type CapacityFields = { labor: string; capital: string; machines: Record<string, string> };
const emptyCapacity: CapacityFields = { labor: "", capital: "", machines: {} };
const secondaryButton = "min-h-11 rounded border border-slate-600 px-4 py-2 font-semibold text-slate-100 hover:border-slate-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400";
const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const number = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const periodNames: Record<PlanningPeriodType, string> = { week: "Week", month: "Month", event: "Craft show or event", custom: "Custom period" };

export function PlanWorkspace({ initialProducts }: { initialProducts: SavedProduct[] }) {
  const projections = useMemo(() => initialProducts.map(projectSavedProduct), [initialProducts]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [periodType, setPeriodType] = useState<PlanningPeriodType>("week");
  const [periodLabel, setPeriodLabel] = useState("");
  const [lines, setLines] = useState<Record<string, LineFields>>({});
  const [capacities, setCapacities] = useState<CapacityFields>(emptyCapacity);
  const [result, setResult] = useState<PortfolioEngineResult | null>(null);
  const [notice, setNotice] = useState("");
  const selectedProducts = initialProducts.filter(({ id }) => selected.has(id));
  const selectedProjections = projections.filter(({ productId }) => selected.has(productId));
  const machines = useMemo(() => {
    const values = new Map<string, string[]>();
    for (const projection of selectedProjections) if (projection.profile.machine) {
      const labels = values.get(projection.profile.machine.key) ?? [];
      if (!labels.includes(projection.profile.machine.label)) labels.push(projection.profile.machine.label);
      values.set(projection.profile.machine.key, labels);
    }
    return [...values].sort(([a], [b]) => a.localeCompare(b)).map(([key, labels]) => ({ key, labels }));
  }, [selectedProjections]);
  const readinessById = useMemo(() => {
    if (selectedProjections.length < 2) return new Map<string, PortfolioProductLine["readiness"]>();
    const review = planPortfolio({ products: selectedProjections, input: {
      version: PORTFOLIO_PLAN_INPUT_VERSION,
      period: { type: "custom", label: "Readiness review" },
      products: selectedProjections.map(({ productId }) => ({ savedProductId: productId, plannedBatches: 0 })),
      constraints: { machineMinutesByKey: {} },
    } });
    return new Map(review.status === "readiness_blocked" ? review.products.map(({ productId, readiness }) => [productId, readiness]) : []);
  }, [selectedProjections]);
  const dirty = periodType !== "week" || selected.size > 0 || periodLabel !== "" || Object.values(lines).some(({ batches, demand }) => batches !== "" || demand !== "") || capacities.labor !== "" || capacities.capital !== "" || Object.values(capacities.machines).some(Boolean);

  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    const protectLinks = (event: MouseEvent) => {
      const anchor = (event.target as Element | null)?.closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.target === "_blank" || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (!window.confirm("Leave this page? Your production scenario will be lost.")) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    document.addEventListener("click", protectLinks, true);
    return () => { window.removeEventListener("beforeunload", warn); document.removeEventListener("click", protectLinks, true); };
  }, [dirty]);

  if (!initialProducts.length) return <MinimumState title="No saved products yet" body="Save at least two products before planning production." />;
  if (initialProducts.length === 1) return <MinimumState title="One more product is needed" body={`Production planning requires at least two saved products. ${initialProducts[0].name} remains available.`} />;

  function invalidateCalculation() {
    setResult(null);
    setNotice("");
  }
  function toggle(id: string) {
    setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
    invalidateCalculation();
  }
  function updateLine(id: string, field: keyof LineFields, value: string) {
    setLines((current) => ({ ...current, [id]: { batches: current[id]?.batches ?? "", demand: current[id]?.demand ?? "", [field]: value } }));
    invalidateCalculation();
  }
  function updateCapacity(field: "labor" | "capital", value: string) { setCapacities((current) => ({ ...current, [field]: value })); invalidateCalculation(); }
  function updateMachine(key: string, value: string) { setCapacities((current) => ({ ...current, machines: { ...current.machines, [key]: value } })); invalidateCalculation(); }
  function updatePeriodType(value: PlanningPeriodType) { setPeriodType(value); invalidateCalculation(); }
  function updatePeriodLabel(value: string) { setPeriodLabel(value); invalidateCalculation(); }
  function selectEveryProduct() { setSelected(new Set(initialProducts.map(({ id }) => id))); invalidateCalculation(); }
  function clearProductSelection() { setSelected(new Set()); invalidateCalculation(); }
  function runPlan() {
    const next = planPortfolio({
      products: projections,
      input: {
        version: PORTFOLIO_PLAN_INPUT_VERSION,
        period: { type: periodType, label: periodLabel },
        products: selectedProducts.map((product) => {
          const fields = lines[product.id] ?? { batches: "", demand: "" };
          return { savedProductId: product.id, plannedBatches: parseWhole(fields.batches), ...(fields.demand === "" ? {} : { demandCeilingUnits: parseWhole(fields.demand) }) };
        }),
        constraints: {
          ...(capacities.labor === "" ? {} : { ownerLaborMinutes: parseCapacity(capacities.labor) * 60 }),
          ...(capacities.capital === "" ? {} : { workingCapital: parseCapacity(capacities.capital) }),
          machineMinutesByKey: Object.fromEntries(machines.map(({ key }) => [key, capacities.machines[key] === "" || capacities.machines[key] === undefined ? undefined : parseCapacity(capacities.machines[key]) * 60])),
        },
      },
    });
    setResult(next);
    setNotice(next.status === "success" ? "Production plan updated." : next.status === "readiness_blocked" ? "The plan needs ready products with positive batches." : "Check the highlighted planning requirements.");
  }
  function reset() {
    if (dirty && !window.confirm("Reset this scenario? All planning inputs and results will be cleared.")) return;
    setSelected(new Set()); setPeriodType("week"); setPeriodLabel(""); setLines({}); setCapacities(emptyCapacity); setResult(null); setNotice("");
  }

  return <div className="space-y-8">
    <section aria-labelledby="period-heading" className="rounded border border-slate-700 bg-slate-900 p-4">
      <h2 id="period-heading" className="text-xl font-semibold">1. Planning period</h2><p className="mt-1 text-sm text-slate-300">Context only. MakerMargin does not infer dates, demand, or resources.</p>
      <div className="mt-4 grid gap-4 sm:grid-cols-2"><Field label="Period type" id="period-type"><select id="period-type" value={periodType} onChange={(event) => updatePeriodType(event.target.value as PlanningPeriodType)} className={inputClass}>{Object.entries(periodNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field><Field label="Period label" id="period-label" description="1–80 characters, such as Aug 17–23 or Fall Market."><input id="period-label" aria-describedby="period-label-description" value={periodLabel} maxLength={80} onChange={(event) => updatePeriodLabel(event.target.value)} className={inputClass} /></Field></div>
    </section>
    <section aria-labelledby="products-heading"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 id="products-heading" className="text-2xl font-semibold">2. Products and quantities</h2><p role="status" aria-live="polite" className="mt-1 text-sm text-slate-300">{selected.size} products selected; at least 2 required</p></div><div className="flex flex-wrap gap-2"><button type="button" className={secondaryButton} onClick={selectEveryProduct}>Select all</button><button type="button" className={secondaryButton} onClick={clearProductSelection}>Clear selection</button></div></div>
      <fieldset className="mt-4"><legend className="sr-only">Products to include in the production plan</legend><div className="grid gap-3 lg:grid-cols-2">{initialProducts.map((product) => { const projection = projections.find(({ productId }) => productId === product.id)!; const checked = selected.has(product.id); const fields = lines[product.id] ?? { batches: "", demand: "" }; const readiness = readinessById.get(product.id); return <div key={product.id} className={`rounded border p-4 ${checked ? "border-emerald-500 bg-emerald-950/20" : "border-slate-700 bg-slate-900"}`}><label className="flex cursor-pointer items-start gap-3 focus-within:ring-2 focus-within:ring-emerald-400"><input type="checkbox" checked={checked} onChange={() => toggle(product.id)} className="mt-1 size-5 accent-emerald-500"/><span><span className="block font-semibold">{product.name}</span><span className="text-xs text-slate-400">Stored snapshot · Updated {new Date(product.updatedAt).toLocaleDateString()}</span></span></label>{checked ? <>{readiness ? <div className={`mt-3 rounded border px-3 py-2 text-sm ${readiness.status === "ready" ? "border-emerald-800 text-emerald-200" : "border-amber-800 text-amber-200"}`}><strong>{readiness.status === "ready" ? "Ready for positive batches" : "Not ready for positive batches"}</strong>{readiness.reasons.length ? <ul className="mt-1 list-disc pl-5">{readiness.reasons.map((reason) => <li key={reason.code}>{reason.message}</li>)}</ul> : null}</div> : <p className="mt-3 text-sm text-slate-400">Select at least two products to run the portfolio readiness review.</p>}<div className="mt-4 grid gap-3 sm:grid-cols-2"><Field label="Planned complete batches" id={`batches-${product.id}`} description={projection.profile.unitsPerBatch === undefined ? "Batch size unavailable" : `${projection.profile.unitsPerBatch} sellable products per batch`}><input id={`batches-${product.id}`} aria-describedby={`batches-${product.id}-description`} type="number" min="0" max={MAX_PORTFOLIO_WHOLE_NUMBER} step="1" inputMode="numeric" value={fields.batches} onChange={(event) => updateLine(product.id, "batches", event.target.value)} className={inputClass}/></Field><Field label="Demand ceiling (optional)" id={`demand-${product.id}`} description="Sellable products; a planning assumption, not a forecast."><input id={`demand-${product.id}`} aria-describedby={`demand-${product.id}-description`} type="number" min="0" max={MAX_PORTFOLIO_WHOLE_NUMBER} step="1" inputMode="numeric" value={fields.demand} onChange={(event) => updateLine(product.id, "demand", event.target.value)} className={inputClass}/></Field></div></> : null}</div>; })}</div></fieldset>
    </section>
    <fieldset className="rounded border border-slate-700 bg-slate-900 p-4"><legend className="px-2 text-xl font-semibold">3. Optional resource capacities</legend><p className="text-sm text-slate-300">Leave a capacity empty when it is unavailable. Enter 0 only when the available capacity is explicitly zero.</p><div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><CapacityInput id="owner-labor" label="Available owner labor hours" value={capacities.labor} onChange={(value) => updateCapacity("labor", value)} /><CapacityInput id="working-capital" label="Available working capital ($)" value={capacities.capital} onChange={(value) => updateCapacity("capital", value)} />{machines.map(({ key, labels }) => <CapacityInput key={key} id={`machine-${key}`} label={`Available hours for ${labels.join(" / ")}`} description={`Stable machine key: ${key}`} value={capacities.machines[key] ?? ""} onChange={(value) => updateMachine(key, value)} />)}</div></fieldset>
    {notice ? <p role={result?.status === "success" ? "status" : "alert"} aria-live="polite" className="rounded border border-slate-700 bg-slate-900 p-3">{notice}</p> : null}
    <div className="flex flex-wrap gap-3"><button type="button" disabled={selected.size < 2} onClick={runPlan} className="min-h-11 rounded bg-emerald-500 px-5 py-3 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50">{result ? "Update plan" : "Calculate plan"}</button><button type="button" onClick={reset} className={secondaryButton}>Reset scenario</button></div>
    {result ? <PlanResult result={result} /> : null}
  </div>;
}

function PlanResult({ result }: { result: PortfolioEngineResult }) {
  if (result.status === "invalid") return <section aria-labelledby="invalid-heading" className="rounded border border-red-700 bg-red-950/40 p-5"><h2 id="invalid-heading" className="text-2xl font-semibold">Plan inputs are invalid</h2><ul className="mt-3 list-disc space-y-2 pl-5">{result.errors.map((error, index) => <li key={`${error.code}-${index}`}>{error.message}</li>)}</ul></section>;
  if (result.status === "readiness_blocked") return <section aria-labelledby="blocked-heading" className="space-y-5"><div className="rounded border border-amber-700 bg-amber-950/40 p-5"><h2 id="blocked-heading" className="text-2xl font-semibold">Plan is blocked by product readiness</h2><ul className="mt-3 list-disc space-y-2 pl-5">{result.reasons.map((reason, index) => <li key={`${reason.code}-${index}`}>{reason.message}</li>)}</ul></div><Readiness products={result.products} />{result.warnings.length ? <Messages title="Warnings" messages={result.warnings.map(({ message }) => message)} /> : null}<Messages title="Engine explanations" messages={result.explanations} /></section>;
  return <SuccessResult result={result} />;
}

function SuccessResult({ result }: { result: PortfolioSuccessResult }) {
  const totals = result.totals;
  const over = [result.capacity.ownerLabor, result.capacity.workingCapital, ...result.capacity.machines.map(({ capacity }) => capacity)].some((capacity) => capacity.status === "available" && capacity.overCapacity);
  return <section aria-labelledby="results-heading" className="space-y-7"><div><h2 id="results-heading" className="text-3xl font-bold">Production plan results</h2><p className="mt-1 text-slate-300">{periodNames[result.period.type]} · {result.period.label}</p></div>
    <section aria-labelledby="economics-heading"><h3 id="economics-heading" className="text-2xl font-semibold">Portfolio totals</h3><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric label="Complete batches" value={number.format(totals.plannedBatches)} /><Metric label="Sellable products" value={number.format(totals.plannedSellableProducts)} /><Metric label="Planned revenue" value={money.format(totals.revenue)} /><Metric label="Total cash cost" value={money.format(totals.totalCashCost)} /><Metric label="Working capital required" value={money.format(totals.workingCapitalRequirement)} /><Metric label="Owner labor required" value={formatMinutes(totals.ownerLaborMinutes)} /><Metric label="Owner labor compensation" value={money.format(totals.ownerLaborCompensation)} /><Metric label="Net business profit" value={money.format(totals.netBusinessProfit)} /><Metric label="Owner economic benefit" value={money.format(totals.ownerEconomicBenefit)} /></div></section>
    <section aria-labelledby="capacity-heading"><div className="flex flex-wrap items-center gap-3"><h3 id="capacity-heading" className="text-2xl font-semibold">Resource utilization</h3>{over ? <span className="rounded bg-red-900 px-2 py-1 text-sm font-semibold text-red-100">Over capacity</span> : null}</div><div className="mt-3 grid gap-3 lg:grid-cols-3"><CapacityCard title="Owner labor" capacity={result.capacity.ownerLabor} unit="minutes" /><CapacityCard title="Working capital" capacity={result.capacity.workingCapital} unit="currency" />{result.capacity.machines.map((machine) => <CapacityCard key={machine.key} title={machine.sourceLabels.join(" / ") || machine.key} subtitle={`Machine key: ${machine.key}`} capacity={machine.capacity} unit="minutes" />)}</div><Limiting capacity={result.capacity} /></section>
    <Demand products={result.products} />
    {result.warnings.length ? <Messages title="Warnings" messages={result.warnings.map(({ message }) => message)} /> : null}<Messages title="Engine explanations" messages={result.explanations} />
    <Contributions products={result.products} />
    <Readiness products={result.products} />
  </section>;
}

function CapacityCard({ title, subtitle, capacity, unit }: { title: string; subtitle?: string; capacity: PortfolioCapacityResult; unit: "minutes" | "currency" }) {
  const format = (value: number) => unit === "currency" ? money.format(value) : formatMinutes(value);
  if (capacity.status === "unavailable") return <article className="rounded border border-slate-700 bg-slate-900 p-4"><h4 className="font-semibold">{title}</h4>{subtitle ? <p className="text-xs text-slate-400">{subtitle}</p> : null}<dl className="mt-3 space-y-2 text-sm"><Row label="Required" value={format(capacity.required)} /><Row label="Available" value="Not provided" /><Row label="Utilization" value="Unavailable" /></dl><p className="mt-3 text-sm text-amber-300">{capacity.reason.message}</p></article>;
  return <article className={`rounded border p-4 ${capacity.overCapacity ? "border-red-700 bg-red-950/30" : "border-slate-700 bg-slate-900"}`}><h4 className="font-semibold">{title}</h4>{subtitle ? <p className="text-xs text-slate-400">{subtitle}</p> : null}<dl className="mt-3 space-y-2 text-sm"><Row label="Required" value={format(capacity.required)} /><Row label="Available" value={format(capacity.available)} /><Row label={capacity.remaining < 0 ? "Overage" : "Remaining"} value={format(Math.abs(capacity.remaining))} /><Row label="Utilization" value={capacity.utilization === null ? "No finite ratio (zero capacity)" : `${number.format(capacity.utilization * 100)}%`} /></dl>{capacity.overCapacity ? <p className="mt-3 font-semibold text-red-300">Exceeds supplied capacity</p> : null}{capacity.limiting ? <p className="mt-2 font-semibold text-amber-300">Primary limiting resource</p> : null}</article>;
}

function Limiting({ capacity }: { capacity: PortfolioSuccessResult["capacity"] }) {
  const label = (resource: PortfolioResourceReference) => resource.resourceType === "owner_labor" ? "Owner labor" : resource.resourceType === "working_capital" ? "Working capital" : capacity.machines.find(({ key }) => key === resource.key)?.sourceLabels.join(" / ") || `Machine ${resource.key}`;
  return <div className="mt-4 rounded border border-slate-700 p-4"><h4 className="font-semibold">Limiting resources</h4>{capacity.primaryLimitingResources.length ? <p className="mt-2">Primary: {capacity.primaryLimitingResources.map(label).join(", ")}</p> : <p className="mt-2 text-slate-300">No limiting resource can be identified from the supplied capacities.</p>}{capacity.nearTiedResources.length ? <p className="mt-1 text-sm text-slate-300">Within the engine&apos;s near-tie range: {capacity.nearTiedResources.map(label).join(", ")}</p> : null}</div>;
}

function Demand({ products }: { products: PortfolioProductLine[] }) {
  const lines = products.filter(({ demand }) => demand);
  if (!lines.length) return <section aria-labelledby="demand-heading"><h3 id="demand-heading" className="text-2xl font-semibold">Demand analysis</h3><p className="mt-2 text-slate-300">No demand ceilings were supplied. Missing ceilings are not evidence of unlimited demand.</p></section>;
  return <section aria-labelledby="demand-heading"><h3 id="demand-heading" className="text-2xl font-semibold">Demand analysis</h3><p className="mt-1 text-sm text-slate-300">User-entered planning assumptions only; economics are not reduced for excess production.</p><div className="mt-3 grid gap-3 md:grid-cols-2">{lines.map((line) => <article key={line.productId} className={`rounded border p-4 ${line.demand?.status === "available" && line.demand.state === "excess" ? "border-amber-700 bg-amber-950/30" : "border-slate-700 bg-slate-900"}`}><h4 className="font-semibold">{line.productName}</h4>{line.demand?.status === "available" ? <dl className="mt-3 space-y-2 text-sm"><Row label="Planned units" value={number.format(line.demand.plannedUnits)} /><Row label="Demand ceiling" value={number.format(line.demand.demandCeilingUnits)} /><Row label="Excess production" value={number.format(line.demand.excessProductionUnits)} /><Row label="Unfilled demand" value={number.format(line.demand.unfilledDemandUnits)} /></dl> : <p className="mt-2 text-amber-300">{line.demand?.reason.message}</p>}</article>)}</div></section>;
}

function Contributions({ products }: { products: PortfolioProductLine[] }) {
  return <section aria-labelledby="contributions-heading"><h3 id="contributions-heading" className="text-2xl font-semibold">Per-product contributions</h3><p className="mt-1 text-sm text-slate-300">Stored snapshot order and scenario order are preserved. Percentages describe categories, not an overall score or winner.</p><div className="mt-3 overflow-x-auto rounded border border-slate-700"><table className="min-w-[1050px] w-full border-collapse text-left text-sm"><thead className="bg-slate-800"><tr>{["Product", "Batches", "Units", "Revenue", "Profit", "Owner labor", "Machine", "Working capital", "Owner benefit"].map((label) => <th key={label} scope="col" className="p-3">{label}</th>)}</tr></thead><tbody>{products.map((line) => <tr key={line.productId} className="border-t border-slate-700 align-top"><th scope="row" className="p-3 font-semibold">{line.productName}</th>{line.economics && line.contributions ? <><td className="p-3">{line.plannedBatches}</td><td className="p-3">{line.economics.plannedSellableProducts}</td><td className="p-3">{money.format(line.economics.plannedRevenue)}<Share value={line.contributions.revenue}/></td><td className="p-3">{money.format(line.economics.plannedBusinessProfit)}<Share value={line.contributions.businessProfit}/></td><td className="p-3">{formatMinutes(line.economics.plannedOwnerLaborMinutes)}<Share value={line.contributions.ownerLabor}/></td><td className="p-3">{formatMinutes(line.economics.plannedOccupiedMachineMinutes)}<Share value={line.contributions.occupiedMachine}/></td><td className="p-3">{money.format(line.economics.plannedWorkingCapitalRequirement)}<Share value={line.contributions.workingCapital}/></td><td className="p-3">{money.format(line.economics.plannedOwnerEconomicBenefit)}<Share value={line.contributions.ownerEconomicBenefit}/></td></> : <td colSpan={8} className="p-3 text-amber-300">No contribution: this zero-batch product is not portfolio-ready.</td>}</tr>)}</tbody></table></div></section>;
}

function Readiness({ products }: { products: Array<Pick<PortfolioProductLine, "productId" | "productName" | "plannedBatches" | "readiness" | "provenance">> }) {
  return <section aria-labelledby="readiness-heading"><h3 id="readiness-heading" className="text-2xl font-semibold">Product readiness and provenance</h3><div className="mt-3 grid gap-3 md:grid-cols-2">{products.map((line) => <article key={line.productId} className="rounded border border-slate-700 bg-slate-900 p-4"><div className="flex items-start justify-between gap-3"><h4 className="font-semibold">{line.productName}</h4><span className={`rounded px-2 py-1 text-xs font-semibold ${line.readiness.status === "ready" ? "bg-emerald-900 text-emerald-100" : "bg-amber-900 text-amber-100"}`}>{line.readiness.status === "ready" ? "Ready" : "Not ready"}</span></div>{line.readiness.reasons.length ? <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-amber-200">{line.readiness.reasons.map((reason) => <li key={reason.code}>{reason.message}</li>)}</ul> : null}<dl className="mt-3 space-y-1 text-xs text-slate-400"><Row label="Pricing snapshot" value={line.provenance.pricingInputSnapshotVersion ?? "Unavailable"} /><Row label="Calculation snapshot" value={line.provenance.calculationSnapshotVersion ?? "Unavailable"} /><Row label="Formula" value={line.provenance.formulaVersion} /><Row label="Production profile" value={line.provenance.productionProfileVersion ?? "Unavailable"} /><Row label="Cash profile" value={line.provenance.cashProfileVersion ?? "Unavailable"} /><Row label="Machine source" value={line.provenance.machineInterpretationSource} /></dl><Link href={`/products/${line.productId}#production-cash-profile`} className="mt-3 inline-block text-sm font-semibold text-emerald-400">Review saved product details</Link></article>)}</div></section>;
}

function Field({ label, id, description, children }: { label: string; id: string; description?: string; children: React.ReactNode }) { return <div><label htmlFor={id} className="block text-sm font-semibold">{label}</label>{description ? <p id={`${id}-description`} className="mt-1 text-xs text-slate-400">{description}</p> : null}<div className="mt-2">{children}</div></div>; }
function CapacityInput({ id, label, description, value, onChange }: { id: string; label: string; description?: string; value: string; onChange: (value: string) => void }) { return <Field id={id} label={label} description={description}><input id={id} aria-describedby={description ? `${id}-description` : undefined} type="number" min="0" step="any" value={value} onChange={(event) => onChange(event.target.value)} className={inputClass}/></Field>; }
function Metric({ label, value }: { label: string; value: string }) { return <div className="rounded border border-slate-700 bg-slate-900 p-4"><dt className="text-sm text-slate-400">{label}</dt><dd className="mt-1 text-xl font-semibold">{value}</dd></div>; }
function Row({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-4"><dt className="text-slate-400">{label}</dt><dd className="text-right">{value}</dd></div>; }
function Share({ value }: { value: number | null }) { return <span className="mt-1 block text-xs text-slate-400">{value === null ? "Share unavailable" : `${number.format(value * 100)}% of total`}</span>; }
function Messages({ title, messages }: { title: string; messages: string[] }) { return <section><h3 className="text-2xl font-semibold">{title}</h3><ul className="mt-3 list-disc space-y-2 rounded border border-slate-700 bg-slate-900 p-5 pl-9">{messages.map((message, index) => <li key={index}>{message}</li>)}</ul></section>; }
function MinimumState({ title, body }: { title: string; body: string }) { return <div role="status" className="rounded border border-slate-700 bg-slate-900 p-5"><h2 className="text-xl font-semibold">{title}</h2><p className="mt-2 text-slate-300">{body}</p><Link href="/" className="mt-4 inline-block font-semibold text-emerald-400">Open the calculator</Link></div>; }
function parseWhole(value: string) { return value === "" ? 0 : Number(value); }
function parseCapacity(value: string) { return Number(value); }
const inputClass = "min-h-11 w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-white focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400";
