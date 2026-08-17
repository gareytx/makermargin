"use client";

import { useRef, useState, useTransition } from "react";
import {
  CASH_PROFILE_VERSION,
  PRODUCTION_PROFILE_VERSION,
  normalizeMachineKey,
  validateCashProfile,
  validateProductionProfile,
  type CashProfileV1,
  type ProductionProfileV1,
} from "@/lib/product-profiles";
import { updateSavedProductProfilesAction } from "@/lib/saved-product-actions";
import type { SavedProduct } from "@/lib/saved-products";
import { ProfileAssistant } from "./profile-assistant";

export type ProfileForm = Record<Field, string>;
export type Field = "unitsPerBatch" | "setupLaborMinutesPerBatch" | "activeLaborMinutesPerUnit" |
  "finishingLaborMinutesPerUnit" | "machineLabel" | "occupiedMinutesPerBatch" |
  "supervisedMinutesPerBatch" | "passiveWaitMinutesPerBatch" | "totalElapsedMinutesPerBatch" |
  "cashCostPerSale" | "upfrontCashCostPerUnit" | "fixedUpfrontCashCostPerBatch" | "fixedProductLaunchCost";

const productionFields: Field[] = ["unitsPerBatch", "setupLaborMinutesPerBatch", "activeLaborMinutesPerUnit", "finishingLaborMinutesPerUnit", "machineLabel", "occupiedMinutesPerBatch", "supervisedMinutesPerBatch", "passiveWaitMinutesPerBatch", "totalElapsedMinutesPerBatch"];
const cashFields: Field[] = ["cashCostPerSale", "upfrontCashCostPerUnit", "fixedUpfrontCashCostPerBatch", "fixedProductLaunchCost"];

export function ProductProfileEditor({ product, onSaved, onDirtyChange }: {
  product: SavedProduct;
  onSaved: (product: SavedProduct) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const initial = formFromProduct(product);
  const [form, setForm] = useState(initial);
  const [machineKey, setMachineKey] = useState(existingProfiles(product).productionProfile?.primaryMachine?.key ?? "");
  const [message, setMessage] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const feedbackRef = useRef<HTMLDivElement>(null);

  function change(field: Field, value: string) {
    const next = { ...form, [field]: value };
    setForm(next);
    setMessage("");
    setErrors([]);
    onDirtyChange(JSON.stringify(next) !== JSON.stringify(initial));
  }

  function save() {
    const built = buildProfiles(form, machineKey);
    if (!built.valid) {
      setErrors(built.errors);
      setMessage("");
      queueMicrotask(() => feedbackRef.current?.focus());
      return;
    }
    startTransition(async () => {
      const result = await updateSavedProductProfilesAction(product.id, built.value);
      if (!result.ok) {
        setMessage(result.error);
        queueMicrotask(() => feedbackRef.current?.focus());
        return;
      }
      const nextForm = formFromProduct(result.data);
      setForm(nextForm);
      setMachineKey(existingProfiles(result.data).productionProfile?.primaryMachine?.key ?? "");
      setErrors([]);
      setMessage("Production and cash profile saved.");
      onDirtyChange(false);
      onSaved(result.data);
      queueMicrotask(() => feedbackRef.current?.focus());
    });
  }

  function applyAssistant(next: ProfileForm) {
    setForm(next);
    setMessage("");
    setErrors([]);
    onDirtyChange(JSON.stringify(next) !== JSON.stringify(initial));
  }

  const profiles = existingProfiles(product);
  const assistantContext = product.pricingInputs && product.calculationSnapshot ? {
    pricingInput: product.pricingInputs.data,
    calculationSnapshot: product.calculationSnapshot,
    productionProfile: profiles.productionProfile,
    cashProfile: profiles.cashProfile,
  } : null;

  return <section id="production-cash-profile" className="mt-6 scroll-mt-6 rounded-lg border border-slate-700 bg-slate-900 p-4">
    <h2 className="text-xl font-semibold">Production &amp; cash profile</h2>
    <p className="mt-1 text-sm text-slate-300">Representative-batch production details used by comparison and planning. They are separate from pricing-level per-sale machine and labor time and do not change your recommended price.</p>
    {assistantContext ? <ProfileAssistant context={assistantContext} form={form} onApply={applyAssistant} /> : <p className="mt-4 rounded border border-amber-700 bg-amber-950/40 p-3 text-sm">Profile suggestions are unavailable for this historical snapshot. Manual profile behavior remains unchanged.</p>}
    <div ref={feedbackRef} tabIndex={-1} className="outline-none">
      {errors.length ? <div role="alert" className="mt-4 rounded border border-red-700 bg-red-950 p-3"><p className="font-semibold">Check the profile details</p><ul className="list-disc pl-5 text-sm">{errors.map((error) => <li key={error}>{error}</li>)}</ul></div> : null}
      {message ? <p role={message.includes("saved") ? "status" : "alert"} aria-live="polite" className="mt-4 rounded border border-slate-600 p-3">{message}</p> : null}
    </div>

    <h3 className="mt-5 font-semibold text-emerald-300">Representative production batch</h3>
    <p className="mt-1 text-sm text-slate-400">Per-product values apply to one sellable item; per-batch values apply once to the representative run. Machine occupied time is how long the primary machine is engaged for the batch; observed total elapsed time is wall-clock duration and may include overlapping work or waits. Use 0 when none and leave blank when unknown.</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <ProfileField label="Sellable products per batch" value={form.unitsPerBatch} onChange={(value) => change("unitsPerBatch", value)} step="1" />
      <ProfileField label="Setup labor per batch (minutes)" value={form.setupLaborMinutesPerBatch} onChange={(value) => change("setupLaborMinutesPerBatch", value)} />
      <ProfileField label="Active production labor per product (minutes)" value={form.activeLaborMinutesPerUnit} onChange={(value) => change("activeLaborMinutesPerUnit", value)} />
      <ProfileField label="Finishing labor per product (minutes)" value={form.finishingLaborMinutesPerUnit} onChange={(value) => change("finishingLaborMinutesPerUnit", value)} />
      <label className="text-sm">Primary machine name<input value={form.machineLabel} onChange={(event) => change("machineLabel", event.target.value)} className={inputClass} /></label>
      <ProfileField label="Machine occupied time per batch (minutes)" value={form.occupiedMinutesPerBatch} onChange={(value) => change("occupiedMinutesPerBatch", value)} />
      <ProfileField label="Supervised machine time per batch (minutes)" value={form.supervisedMinutesPerBatch} onChange={(value) => change("supervisedMinutesPerBatch", value)} />
      <ProfileField label="Passive wait time per batch (minutes)" value={form.passiveWaitMinutesPerBatch} onChange={(value) => change("passiveWaitMinutesPerBatch", value)} />
      <ProfileField label="Observed total elapsed time per batch (minutes)" value={form.totalElapsedMinutesPerBatch} onChange={(value) => change("totalElapsedMinutesPerBatch", value)} />
    </div>

    <h3 className="mt-6 font-semibold text-emerald-300">Cash requirements</h3>
    <p className="mt-1 text-sm text-slate-400">Enter actual cash amounts only. Owner labor and allocated machine cost are economic costs, not cash. Observed elapsed time is wall-clock time; supervised machine time is hands-on labor during a run.</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <ProfileField label="Variable cash cost per sale ($)" value={form.cashCostPerSale} onChange={(value) => change("cashCostPerSale", value)} />
      <ProfileField label="Upfront cash cost per product ($)" value={form.upfrontCashCostPerUnit} onChange={(value) => change("upfrontCashCostPerUnit", value)} />
      <ProfileField label="Fixed upfront cash cost per batch ($)" value={form.fixedUpfrontCashCostPerBatch} onChange={(value) => change("fixedUpfrontCashCostPerBatch", value)} />
      <ProfileField label="Assigned product launch cost ($)" value={form.fixedProductLaunchCost} onChange={(value) => change("fixedProductLaunchCost", value)} />
    </div>
    <button type="button" disabled={pending} onClick={save} className="mt-5 rounded bg-emerald-500 px-3 py-2 font-semibold text-slate-950 disabled:opacity-50">{pending ? "Saving..." : "Save profile"}</button>
  </section>;
}

function existingProfiles(product: SavedProduct) {
  return product.pricingInputs?.schemaVersion === "pricing-input-v2"
    ? product.pricingInputs
    : { productionProfile: undefined, cashProfile: undefined };
}

function formFromProduct(product: SavedProduct): ProfileForm {
  const { productionProfile: production, cashProfile: cash } = existingProfiles(product);
  const value = (input: number | undefined) => input === undefined ? "" : String(input);
  return {
    unitsPerBatch: value(production?.unitsPerBatch), setupLaborMinutesPerBatch: value(production?.setupLaborMinutesPerBatch),
    activeLaborMinutesPerUnit: value(production?.activeLaborMinutesPerUnit), finishingLaborMinutesPerUnit: value(production?.finishingLaborMinutesPerUnit),
    machineLabel: production?.primaryMachine?.label ?? "", occupiedMinutesPerBatch: value(production?.primaryMachine?.occupiedMinutesPerBatch),
    supervisedMinutesPerBatch: value(production?.primaryMachine?.supervisedMinutesPerBatch), passiveWaitMinutesPerBatch: value(production?.passiveWaitMinutesPerBatch),
    totalElapsedMinutesPerBatch: value(production?.totalElapsedMinutesPerBatch), cashCostPerSale: value(cash?.cashCostPerSale),
    upfrontCashCostPerUnit: value(cash?.upfrontCashCostPerUnit), fixedUpfrontCashCostPerBatch: value(cash?.fixedUpfrontCashCostPerBatch),
    fixedProductLaunchCost: value(cash?.fixedProductLaunchCost),
  };
}

function buildProfiles(form: ProfileForm, existingMachineKey: string): ProfileValidation {
  const errors: string[] = [];
  const number = (field: Field) => form[field].trim() === "" ? undefined : Number(form[field]);
  let productionProfile: ProductionProfileV1 | undefined;
  let cashProfile: CashProfileV1 | undefined;
  if (productionFields.some((field) => form[field].trim() !== "")) {
    const hasMachine = ["machineLabel", "occupiedMinutesPerBatch", "supervisedMinutesPerBatch"].some((field) => form[field as Field].trim() !== "");
    const label = form.machineLabel.trim();
    productionProfile = {
      schemaVersion: PRODUCTION_PROFILE_VERSION,
      unitsPerBatch: number("unitsPerBatch") as number,
      ...optional("setupLaborMinutesPerBatch", number("setupLaborMinutesPerBatch")),
      ...optional("activeLaborMinutesPerUnit", number("activeLaborMinutesPerUnit")),
      ...optional("finishingLaborMinutesPerUnit", number("finishingLaborMinutesPerUnit")),
      ...(hasMachine ? { primaryMachine: {
        key: existingMachineKey || normalizeMachineKey(label), label,
        occupiedMinutesPerBatch: number("occupiedMinutesPerBatch") as number,
        ...optional("supervisedMinutesPerBatch", number("supervisedMinutesPerBatch")),
      } } : {}),
      ...optional("passiveWaitMinutesPerBatch", number("passiveWaitMinutesPerBatch")),
      ...optional("totalElapsedMinutesPerBatch", number("totalElapsedMinutesPerBatch")),
    };
    const validation = validateProductionProfile(productionProfile);
    if (!validation.valid) errors.push(...validation.errors);
  }
  if (cashFields.some((field) => form[field].trim() !== "")) {
    cashProfile = { schemaVersion: CASH_PROFILE_VERSION,
      ...optional("cashCostPerSale", number("cashCostPerSale")),
      ...optional("upfrontCashCostPerUnit", number("upfrontCashCostPerUnit")),
      ...optional("fixedUpfrontCashCostPerBatch", number("fixedUpfrontCashCostPerBatch")),
      ...optional("fixedProductLaunchCost", number("fixedProductLaunchCost")) };
    const validation = validateCashProfile(cashProfile);
    if (!validation.valid) errors.push(...validation.errors);
  }
  return errors.length ? { valid: false, errors } : { valid: true, value: { productionProfile, cashProfile } };
}

type ProfileValidation = { valid: true; value: { productionProfile?: ProductionProfileV1; cashProfile?: CashProfileV1 } } | { valid: false; errors: string[] };
function optional(key: string, value: number | undefined) { return value === undefined ? {} : { [key]: value }; }
const inputClass = "mt-1 w-full rounded border border-slate-600 bg-slate-950 px-3 py-2 text-white";
function ProfileField({ label, value, onChange, step = "0.01" }: { label: string; value: string; onChange: (value: string) => void; step?: string }) { return <label className="text-sm">{label}<input type="number" min="0" step={step} value={value} onChange={(event) => onChange(event.target.value)} className={inputClass} /></label>; }
