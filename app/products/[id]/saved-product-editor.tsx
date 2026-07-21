"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { calculatePricing, currency, percent, type PricingInput } from "@/lib/calculations";
import { productPresets } from "@/lib/product-presets";
import type { SavedProduct } from "@/lib/saved-products";
import type { CalculationSnapshot } from "@/lib/saved-product-snapshots";
import {
  deleteSavedProductAction,
  duplicateSavedProductAction,
  previewSavedProductRecalculationAction,
  renameSavedProductAction,
  saveRecalculatedProductAction,
  updateSavedProductAction,
} from "@/lib/saved-product-actions";
import { ProductProfileEditor } from "./product-profile-editor";

export function SavedProductEditor({ initialProduct }: { initialProduct: SavedProduct }) {
  const [product, setProduct] = useState(initialProduct);
  const [input, setInput] = useState<PricingInput | null>(() => product.pricingInputs ? structuredClone(product.pricingInputs.data) : null);
  const [name, setName] = useState(product.name);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<CalculationSnapshot | null>(null);
  const [profileDirty, setProfileDirty] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const calculation = useMemo(() => input ? calculatePricing(input) : null, [input]);
  const pricingModified = Boolean(input && product.pricingInputs &&
    (name !== product.name || JSON.stringify(input) !== JSON.stringify(product.pricingInputs.data)));
  const modified = pricingModified || profileDirty;
  const preset = productPresets.find((candidate) => candidate.id === product.sourcePresetId);
  const provenance = product.sourcePresetId === null ? "Started from scratch" :
    preset ? `Started from: ${preset.label}` : "Started from: Historical preset";

  function updateField(field: keyof PricingInput, value: string | boolean) {
    setPreview(null);
    setInput((current) => current ? ({ ...current, [field]: typeof current[field] === "number" ? Number(value) : value }) : current);
  }

  function reset() {
    if (modified && !window.confirm("Discard your unsaved edits and restore the saved snapshot?")) return;
    setName(product.name);
    setInput(product.pricingInputs ? structuredClone(product.pricingInputs.data) : null);
    setPreview(null);
    setMessage("");
  }

  function save() {
    if (!input || !calculation?.valid) return;
    setMessage("");
    startTransition(async () => {
      const result = await updateSavedProductAction(product.id, name, input);
      if (!result.ok) setMessage(result.error);
      else { setProduct(result.data); setInput(structuredClone(result.data.pricingInputs!.data)); setPreview(null); setMessage("Saved changes."); }
    });
  }

  function rename() {
    setMessage("");
    startTransition(async () => {
      const result = await renameSavedProductAction(product.id, name);
      if (!result.ok) setMessage(result.error);
      else { setProduct(result.data); setMessage("Product renamed."); }
    });
  }

  function duplicate() {
    startTransition(async () => {
      const result = await duplicateSavedProductAction(product.id);
      if (!result.ok) setMessage(result.error);
      else router.push(`/products/${result.data.id}`);
    });
  }

  function remove() {
    if (!window.confirm(`Delete ${product.name}? This cannot be undone.`)) return;
    startTransition(async () => {
      const result = await deleteSavedProductAction(product.id);
      if (!result.ok) setMessage(result.error);
      else router.push("/products");
    });
  }

  function recalculate() {
    setMessage("");
    startTransition(async () => {
      const result = await previewSavedProductRecalculationAction(product.id);
      if (!result.ok) setMessage(result.error);
      else setPreview(result.data.preview.calculationSnapshot);
    });
  }

  function savePreview() {
    startTransition(async () => {
      const result = await saveRecalculatedProductAction(product.id);
      if (!result.ok) setMessage(result.error);
      else { setProduct(result.data); setInput(result.data.pricingInputs ? structuredClone(result.data.pricingInputs.data) : null); setPreview(null); setMessage("Updated calculation saved."); }
    });
  }

  const savedResult = product.calculationSnapshot?.data.result;
  return <>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h1 className="break-words text-3xl font-bold">{product.name}</h1><p className="mt-1 text-sm text-slate-400">{provenance}</p></div>
      <Link href="/products" onClick={(event) => { if (modified && !window.confirm("Leave without saving your edits?")) event.preventDefault(); }} className="text-emerald-400">Back to products</Link>
    </div>
    <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-3"><Meta label="Formula version" value={product.formulaVersion} /><Meta label="Created" value={new Date(product.createdAt).toLocaleString()} /><Meta label="Updated" value={new Date(product.updatedAt).toLocaleString()} /></dl>
    {message ? <p role={message.includes("Saved") || message.includes("renamed") ? "status" : "alert"} className="mt-4 rounded border border-slate-700 p-3">{message}</p> : null}

    {!input ? <section className="mt-6 rounded-lg border border-amber-700 bg-amber-950/40 p-4"><h2 className="font-semibold">Historical inputs unavailable</h2><p className="mt-1 text-sm">This snapshot version is unsupported. Its stored record has not been changed, and recalculation is unavailable.</p><div className="mt-4 flex flex-wrap gap-2"><button disabled={pending} onClick={duplicate} className="rounded border border-slate-500 px-3 py-2">Duplicate</button><button disabled={pending} onClick={remove} className="rounded border border-red-500 px-3 py-2 text-red-200">Delete</button></div></section> : <div className="mt-6 grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="rounded-lg border border-slate-700 bg-slate-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-xl font-semibold">Saved inputs</h2>{modified ? <span role="status" className="rounded bg-amber-300 px-2 py-1 text-xs font-bold text-amber-950">Modified</span> : null}</div>
        <label className="mt-4 block text-sm">Product name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} className={inputClass} /></label>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">{numberFields.map(([field, label]) => <NumberField key={field} label={label} value={input[field]} onChange={(value) => updateField(field, value)} />)}</div>
        <label className="mt-4 flex gap-3"><input type="checkbox" checked={input.customerPaysShipping} onChange={(event) => updateField("customerPaysShipping", event.target.checked)} />Customer pays shipping separately</label>
        {calculation && !calculation.valid ? <div role="alert" className="mt-4 rounded border border-red-700 bg-red-950 p-3"><p className="font-semibold">Unable to calculate</p><ul className="list-disc pl-5 text-sm">{calculation.validation.errors.map((error) => <li key={error}>{error}</li>)}</ul></div> : null}
        <div className="mt-5 flex flex-wrap gap-2"><button disabled={pending || !pricingModified || !calculation?.valid} onClick={save} className="rounded bg-emerald-500 px-3 py-2 font-semibold text-slate-950 disabled:opacity-50">Save changes</button><button disabled={pending || name === product.name} onClick={rename} className="rounded border border-slate-600 px-3 py-2 disabled:opacity-50">Rename only</button><button disabled={pending || !pricingModified} onClick={reset} className="rounded border border-slate-600 px-3 py-2 disabled:opacity-50">Reset</button></div>
      </section>
      <section className="rounded-lg bg-white p-4 text-slate-950"><h2 className="text-xl font-semibold">Saved calculation</h2>{savedResult ? <ResultSummary result={savedResult} /> : <p className="mt-3 text-amber-800">Historical calculation snapshot is unsupported.</p>}
        <div className="mt-5 flex flex-wrap gap-2"><button disabled={pending || !product.pricingInputs} onClick={recalculate} className="rounded border border-slate-400 px-3 py-2">Recalculate with current formula</button><button disabled={pending} onClick={duplicate} className="rounded border border-slate-400 px-3 py-2">Duplicate</button><button disabled={pending} onClick={remove} className="rounded border border-red-500 px-3 py-2 text-red-700">Delete</button></div>
      </section>
    </div>}

    {preview && savedResult ? <section className="mt-6 rounded-lg border border-emerald-700 bg-slate-900 p-4"><h2 className="text-xl font-semibold">Recalculation preview</h2><p className="mt-1 text-sm text-slate-300">The saved record is unchanged until you explicitly save this preview.</p><div className="mt-4 grid gap-4 sm:grid-cols-2"><Comparison label="Recommended price" oldValue={currency(savedResult.recommendedPrice)} newValue={currency(preview.data.result.recommendedPrice)} /><Comparison label="Net business profit" oldValue={currency(savedResult.netProfit)} newValue={currency(preview.data.result.netProfit)} /><Comparison label="Profit margin" oldValue={percent(savedResult.profitMarginPercentage)} newValue={percent(preview.data.result.profitMarginPercentage)} /><Comparison label="Formula version" oldValue={product.formulaVersion} newValue={preview.formulaVersion} /></div><div className="mt-5 flex gap-2"><button disabled={pending} onClick={savePreview} className="rounded bg-emerald-500 px-3 py-2 font-semibold text-slate-950">Save updated calculation</button><button disabled={pending} onClick={() => setPreview(null)} className="rounded border border-slate-600 px-3 py-2">Cancel</button></div></section> : null}
    {input ? <ProductProfileEditor product={product} onSaved={setProduct} onDirtyChange={setProfileDirty} /> : null}
  </>;
}

const inputClass = "mt-1 w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-white";
const numberFields = [
  ["materialCost", "Material cost"], ["packagingCost", "Packaging cost"], ["otherCost", "Other cost"], ["wastePercentage", "Waste percentage"],
  ["machineMinutes", "Machine time in minutes"], ["machineHourlyRate", "Machine hourly rate"], ["laborMinutes", "Labor time in minutes"], ["laborHourlyRate", "Labor hourly rate"],
  ["marketplaceFeePercentage", "Marketplace fee percentage"], ["processingFeePercentage", "Processing fee percentage"], ["fixedTransactionFee", "Fixed transaction fee"], ["shippingCost", "Shipping cost"], ["desiredMarginPercentage", "Desired profit margin"],
] as const satisfies readonly (readonly [keyof PricingInput, string])[];

function NumberField({ label, value, onChange }: { label: string; value: number | string | boolean; onChange: (value: string) => void }) { return <label className="text-sm">{label}<input type="number" step="0.01" value={String(value)} onChange={(event) => onChange(event.target.value)} className={inputClass} /></label>; }
function Meta({ label, value }: { label: string; value: string }) { return <div><dt className="text-slate-400">{label}</dt><dd>{value}</dd></div>; }
function ResultSummary({ result }: { result: NonNullable<SavedProduct["calculationSnapshot"]>["data"]["result"] }) { return <dl className="mt-4 space-y-2"><Meta label="Recommended price" value={currency(result.recommendedPrice)} /><Meta label="True base cost" value={currency(result.trueBaseCost)} /><Meta label="Net business profit" value={currency(result.netProfit)} /><Meta label="Profit margin" value={percent(result.profitMarginPercentage)} /><Meta label="Effective hourly result" value={`${currency(result.effectiveHourlyEarnings)}/hr`} /></dl>; }
function Comparison({ label, oldValue, newValue }: { label: string; oldValue: string; newValue: string }) { return <div><p className="text-sm text-slate-400">{label}</p><p>Saved: {oldValue}</p><p className="font-semibold text-emerald-300">Proposed: {newValue}</p></div>; }
