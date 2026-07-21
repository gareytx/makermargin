"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  calculatePricing,
  calculateViability,
  currency,
  percent,
  type PricingInput,
} from "@/lib/calculations";
import {
  getCalculatorStartingPoint,
  productPresets,
  customProductTemplate,
  type CalculatorStartingPoint,
  type CalculatorStartingPointId,
} from "@/lib/product-presets";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { createPendingSaveDraft, deletePendingSaveDraft, getPendingSaveDraft } from "@/lib/pending-save-drafts";
import type { PendingSaveDraft } from "@/lib/saved-products";
import { withAuthContext } from "@/lib/auth-navigation";
import { createSavedProductAction } from "@/lib/saved-product-actions";
import { SiteNav } from "./site-nav";
import { navigateBrowser } from "@/lib/browser-navigation";

const initialPreset = getCalculatorStartingPoint("slate-coasters");

export default function Home() {
  const supabase = useMemo(() => createBrowserSupabaseClient(), []);
  const [selectedPresetId, setSelectedPresetId] =
    useState<CalculatorStartingPointId>(initialPreset.id);
  const [input, setInput] = useState<PricingInput>({ ...initialPreset.values });
  const [presetModified, setPresetModified] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveName, setSaveName] = useState(initialPreset.values.productName);
  const [saveMessage, setSaveMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);
  const [authReady, setAuthReady] = useState(!supabase);
  const [pendingDraft, setPendingDraft] = useState<PendingSaveDraft | null>(null);
  const [consumedDraftId, setConsumedDraftId] = useState<string | null>(null);
  const saveNameRef = useRef<HTMLInputElement>(null);
  const selectedPreset = getCalculatorStartingPoint(selectedPresetId);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => {
      setAuthenticated(Boolean(data.session));
      setAuthReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setAuthenticated(Boolean(session)));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  useEffect(() => {
    const id = new URL(window.location.href).searchParams.get("draft");
    if (id) queueMicrotask(() => setPendingDraft(getPendingSaveDraft(id)));
  }, []);

  useEffect(() => { if (saveOpen) saveNameRef.current?.focus(); }, [saveOpen]);

  const calculation = useMemo(() => calculatePricing(input), [input]);

  const viability = useMemo(
    () =>
      calculation.valid
        ? calculateViability(input, calculation.result)
        : null,
    [calculation, input]
  );

  function updateField(
    field: keyof PricingInput,
    value: string | number | boolean
  ) {
    setPresetModified(true);
    setInput((current) => ({
      ...current,
      [field]: typeof current[field] === "number" ? Number(value) : value,
    }));
  }

  function selectPreset(id: CalculatorStartingPointId): boolean {
    if (
      presetModified &&
      !window.confirm(
        "Replace your modified values with this starting point? Your edits will be lost."
      )
    ) {
      return false;
    }

    const preset = getCalculatorStartingPoint(id);
    setSelectedPresetId(id);
    setInput({ ...preset.values });
    setPresetModified(false);
    return true;
  }

  function resetPreset() {
    if (
      presetModified &&
      !window.confirm(
        "Reset this starting point? Your modified values will be lost."
      )
    ) {
      return;
    }

    setInput({ ...selectedPreset.values });
    setPresetModified(false);
  }

  function startSave() {
    setSaveMessage("");
    if (!calculation.valid) {
      setSaveMessage("Correct the pricing errors before saving.");
      return;
    }
    if (!supabase) {
      setSaveMessage("Cloud saving is unavailable. The calculator remains fully usable.");
      return;
    }
    if (!authReady) return;
    if (!authenticated) {
      const draft = createPendingSaveDraft(
        input,
        selectedPresetId === "custom" ? null : selectedPresetId
      );
      if (!draft) {
        setSaveMessage("This browser could not preserve the pending product. Your calculator values are unchanged.");
        return;
      }
      navigateBrowser(withAuthContext("/login", "/", draft.id));
      return;
    }
    setSaveName(input.productName);
    setSaveOpen(true);
  }

  function clearDraftUrl() {
    const url = new URL(window.location.href);
    url.searchParams.delete("draft");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function restorePendingDraft() {
    if (!pendingDraft) return;
    setInput(structuredClone(pendingDraft.pricingInputs.data));
    const source = pendingDraft.sourcePresetId;
    setSelectedPresetId(productPresets.some((preset) => preset.id === source)
      ? source as CalculatorStartingPointId : "custom");
    setPresetModified(true);
    setSaveName(pendingDraft.intendedProductName);
    setConsumedDraftId(pendingDraft.id);
    setPendingDraft(null);
    clearDraftUrl();
    setSaveOpen(true);
  }

  function discardPendingDraft() {
    if (pendingDraft) deletePendingSaveDraft(pendingDraft.id);
    setPendingDraft(null);
    clearDraftUrl();
  }

  async function submitSave(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setSaveMessage("");
    const result = await createSavedProductAction({
      name: saveName,
      pricingInput: input,
      sourcePresetId: selectedPresetId === "custom" ? null : selectedPresetId,
    });
    setSaving(false);
    if (!result.ok) { setSaveMessage(result.error); return; }
    if (consumedDraftId) deletePendingSaveDraft(consumedDraftId);
    navigateBrowser(`/products/${result.data.id}`);
  }

  return (
    <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <SiteNav />
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
          <section className="rounded-2xl border border-slate-800 bg-slate-900 p-4 shadow-xl sm:p-6">
            <h2 className="mb-5 text-2xl font-semibold">
              Product Calculator
            </h2>

            {pendingDraft ? (
              <div className="mb-5 rounded-lg border border-emerald-700 bg-emerald-950/50 p-4" role="status">
                <p className="font-semibold">Resume saving this product?</p>
                <p className="mt-1 text-sm text-slate-300">Your current calculator values will remain unchanged until you restore the pending draft.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={restorePendingDraft} className="rounded bg-emerald-400 px-3 py-2 font-semibold text-slate-950">Restore draft</button>
                  <button type="button" onClick={discardPendingDraft} className="rounded border border-slate-600 px-3 py-2">Discard</button>
                </div>
              </div>
            ) : null}

            <div className="mb-6 border-b border-slate-700 pb-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="min-w-0 flex-1">
                  <span className="mb-2 block text-sm font-medium text-slate-300">
                    Product preset
                  </span>
                  <select
                    value={selectedPresetId}
                    onChange={(event) => {
                      const changed = selectPreset(
                        event.target.value as CalculatorStartingPointId
                      );
                      if (!changed) event.target.value = selectedPresetId;
                    }}
                    className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none ring-emerald-400 focus:ring-2"
                  >
                    <optgroup label="Start from scratch">
                      <option value={customProductTemplate.id}>
                        {customProductTemplate.label}
                      </option>
                    </optgroup>
                    <optgroup label="Product presets">
                      {productPresets.map((preset) => (
                        <option key={preset.id} value={preset.id}>
                          {preset.label}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                </label>
                <button
                  type="button"
                  onClick={resetPreset}
                  className="shrink-0 rounded-xl border border-slate-600 px-4 py-3 text-sm font-semibold text-white hover:border-emerald-400 hover:text-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                >
                  Reset Preset
                </button>
              </div>

              <div className="mt-3 rounded-lg border border-emerald-900 bg-emerald-950/40 p-3 text-sm text-slate-200">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold text-emerald-300">
                    Starter estimate - verify your actual costs
                  </p>
                  {presetModified ? (
                    <span
                      aria-hidden="true"
                      className="rounded-full bg-amber-300 px-2 py-0.5 text-xs font-bold text-amber-950"
                    >
                      Modified
                    </span>
                  ) : null}
                  <span role="status" aria-live="polite" className="sr-only">
                    {presetModified
                      ? "Calculator values modified."
                      : "Calculator values match the selected starting point."}
                  </span>
                </div>
                <p className="mt-1">{selectedPreset.description}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                  <span className="rounded bg-slate-700 px-2 py-1 font-semibold text-white">
                    {assumptionLabel(selectedPreset.assumptionType)}
                  </span>
                  <span className="text-slate-400">
                    Reviewed {selectedPreset.lastReviewed}
                  </span>
                  {selectedPreset.sourceLabel ? (
                    <span className="min-w-0 break-words text-slate-300">
                      Basis: {selectedPreset.sourceLabel}
                    </span>
                  ) : null}
                </div>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-400">
                  {selectedPreset.assumptionNotes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              </div>
            </div>

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

          <section className="min-w-0 rounded-2xl border border-slate-800 bg-white p-4 text-slate-950 shadow-xl sm:p-6">
            <div className="mb-6">
              <p className="text-sm font-semibold uppercase tracking-widest text-slate-500">
                Recommended Price
              </p>

              {calculation.valid ? (
                <>
                  <p className="mt-2 break-words text-4xl font-bold sm:text-5xl">
                    {currency(calculation.result.recommendedPrice)}
                  </p>

                  <p className="mt-2 text-sm text-slate-600">
                    Suggested selling price for{" "}
                    <span className="font-semibold">{input.productName}</span>
                  </p>
                </>
              ) : (
                <div
                  role="alert"
                  className="mt-3 rounded-xl border border-red-200 bg-red-50 p-4 text-red-900"
                >
                  <p className="font-semibold">Unable to calculate a price</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                    {calculation.validation.errors.map((error) => (
                      <li key={error}>{error}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {calculation.validation.warnings.length > 0 ? (
              <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950">
                <p className="font-semibold">Things to review</p>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                  {calculation.validation.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {calculation.valid && viability ? (
              <>
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
                    value={currency(calculation.result.trueBaseCost)}
                  />
                  <ResultRow
                    label="Hard cost"
                    value={currency(calculation.result.hardCost)}
                  />
                  <ResultRow
                    label="Waste cost"
                    value={currency(calculation.result.wasteCost)}
                  />
                  <ResultRow
                    label="Machine cost"
                    value={currency(calculation.result.machineCost)}
                  />
                  <ResultRow
                    label="Labor cost"
                    value={currency(calculation.result.laborCost)}
                  />
                  <ResultRow
                    label="Shipping included in price"
                    value={currency(calculation.result.shippingCostIncluded)}
                  />
                  <ResultRow
                    label="Estimated fees"
                    value={currency(calculation.result.estimatedFees)}
                  />
                  <ResultRow
                    label="Net profit"
                    value={currency(calculation.result.netProfit)}
                  />
                  <ResultRow
                    label="Profit margin"
                    value={percent(calculation.result.profitMarginPercentage)}
                  />
                  <ResultRow
                    label="Effective hourly earnings"
                    value={`${currency(
                      calculation.result.effectiveHourlyEarnings
                    )}/hr`}
                  />
                </div>
                <button
                  type="button"
                  onClick={startSave}
                  disabled={!authReady}
                  className="mt-6 w-full rounded-lg bg-emerald-500 px-4 py-3 font-bold text-slate-950 disabled:opacity-60"
                >Save product</button>
              </>
            ) : null}
            {saveMessage && !saveOpen ? <p role="alert" className="mt-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">{saveMessage}</p> : null}
          </section>
        </div>
      </div>

      {saveOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="save-title" className="w-full max-w-md rounded-lg bg-white p-5 text-slate-950 shadow-2xl">
            <h2 id="save-title" className="text-xl font-bold">Save product</h2>
            <form className="mt-4" onSubmit={submitSave}>
              <label className="block text-sm font-medium">Product name
                <input ref={saveNameRef} value={saveName} onChange={(event) => setSaveName(event.target.value)} maxLength={120} required className="mt-2 w-full rounded border border-slate-400 px-3 py-2" />
              </label>
              {saveMessage ? <p role="alert" className="mt-3 text-sm text-red-700">{saveMessage}</p> : null}
              <div className="mt-5 flex justify-end gap-2">
                <button type="button" onClick={() => setSaveOpen(false)} className="rounded border border-slate-400 px-3 py-2">Cancel</button>
                <button disabled={saving} className="rounded bg-emerald-600 px-3 py-2 font-semibold text-white disabled:opacity-60">{saving ? "Saving..." : "Save"}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </main>
  );
}

function assumptionLabel(
  type: CalculatorStartingPoint["assumptionType"]
): string {
  const labels = {
    "business-baseline": "Business baseline",
    "verified-supplier": "Supplier price verified",
    "amortized-estimate": "Amortized estimate",
    template: "Custom template",
  } satisfies Record<CalculatorStartingPoint["assumptionType"], string>;

  return labels[type];
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
    <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-slate-200 py-2">
      <span className="min-w-0 text-sm text-slate-600">{label}</span>
      <span className="max-w-full break-all text-right font-semibold">{value}</span>
    </div>
  );
}
