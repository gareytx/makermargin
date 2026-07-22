"use client";

import { useMemo, useRef, useState } from "react";
import {
  applySelectedProposals,
  buildProfileAssistantProposal,
  cashCandidates,
  type CashComponentId,
  type CashComponentTiming,
  type ProfileAssistantAnswers,
  type ProfileAssistantContext,
  type ProfileAssistantField,
} from "@/lib/profile-assistant";
import type { ProfileForm } from "./product-profile-editor";

export function ProfileAssistant({ context, form, onApply }: {
  context: ProfileAssistantContext;
  form: ProfileForm;
  onApply: (form: ProfileForm) => void;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [answers, setAnswers] = useState<ProfileAssistantAnswers>(() => initialAnswers(context));
  const [selected, setSelected] = useState<Set<ProfileAssistantField>>(new Set());
  const [status, setStatus] = useState("");
  const launchRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const result = useMemo(() => buildProfileAssistantProposal(context, answers), [context, answers]);
  const reviewResult = useMemo(() => ({ ...result, proposals: result.proposals.map((item) => {
    const formValue = form[item.field];
    if (formValue === undefined || formValue === "") return item;
    const alreadyCurrent = formValue === String(item.value);
    return { ...item, currentValue: formValue, targetBlank: false, replacesExisting: !alreadyCurrent,
      alreadyCurrent, selectedByDefault: false, conflict: alreadyCurrent ? "already-current" as const : "replaces-existing" as const };
  }) }), [form, result]);
  const candidates = useMemo(() => cashCandidates(context), [context]);
  const stepSixErrors = [
    ...(answers.fixedBatchCostAnswer === "amount" && (answers.fixedBatchCost === undefined || !Number.isFinite(answers.fixedBatchCost) || answers.fixedBatchCost < 0) ? ["Enter a valid nonnegative fixed batch amount after selecting Yes."] : []),
    ...(answers.launchCostAnswer === "amount" && (answers.launchCost === undefined || !Number.isFinite(answers.launchCost) || answers.launchCost < 0) ? ["Enter a valid nonnegative launch-cost amount after selecting Yes."] : []),
  ];
  const elapsedErrors = result.errors.filter((error) => error.includes("elapsed wall-clock time"));

  function update<K extends keyof ProfileAssistantAnswers>(field: K, value: ProfileAssistantAnswers[K]) {
    setAnswers((current) => ({ ...current, [field]: value }));
  }
  function begin() { setOpen(true); setStep(1); setStatus(""); queueMicrotask(() => headingRef.current?.focus()); }
  function close() { setOpen(false); setStep(1); setStatus(""); queueMicrotask(() => launchRef.current?.focus()); }
  function showReview() {
    const defaults = new Set(reviewResult.proposals.filter((item) => item.selectedByDefault).map((item) => item.field));
    setSelected(defaults); setStep(7);
  }
  function apply() {
    onApply(applySelectedProposals(form, reviewResult.proposals, selected) as ProfileForm);
    setOpen(false);
    setStatus("Suggestions applied to the profile form. They have not been saved yet.");
    queueMicrotask(() => launchRef.current?.focus());
  }

  return <div className="mt-4 border-y border-slate-700 py-4">
    <button ref={launchRef} type="button" onClick={begin} className="rounded border border-emerald-500 px-3 py-2 font-semibold text-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-400">Help me complete this profile</button>
    {status ? <p role="status" aria-live="polite" className="mt-3 rounded border border-emerald-700 bg-emerald-950/40 p-3 text-sm">{status}</p> : null}
    {open ? <section aria-labelledby="profile-assistant-title" className="mt-4 rounded border border-slate-600 bg-slate-950 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h3 ref={headingRef} tabIndex={-1} id="profile-assistant-title" className="text-lg font-semibold outline-none">Production &amp; Cash Profile Assistant</h3><p aria-live="polite" className="mt-1 text-sm text-slate-400">Step {step} of 7: {stepNames[step - 1]}</p></div>
        <button type="button" onClick={close} className="rounded border border-slate-600 px-3 py-2 focus:outline-none focus:ring-2 focus:ring-emerald-400">Cancel</button>
      </div>
      <div className="mt-4">{step === 1 ? <BatchStep answers={answers} update={update} /> : null}
        {step === 2 ? <MachineStep context={context} answers={answers} update={update} /> : null}
        {step === 3 ? <LaborStep context={context} answers={answers} update={update} /> : null}
        {step === 4 ? <><TimingStep answers={answers} update={update} />{elapsedErrors.length ? <ErrorList errors={elapsedErrors} /> : null}</> : null}
        {step === 5 ? <CashStep candidates={candidates} answers={answers} update={update} /> : null}
        {step === 6 ? <><FixedCostsStep answers={answers} update={update} />{stepSixErrors.length ? <ErrorList errors={stepSixErrors} /> : null}</> : null}
        {step === 7 ? <Review result={reviewResult} selected={selected} setSelected={setSelected} /> : null}
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        {step > 1 ? <button type="button" onClick={() => setStep((value) => value - 1)} className="rounded border border-slate-600 px-3 py-2">Back</button> : null}
        {step < 6 ? <button type="button" onClick={() => setStep((value) => value + 1)} className="rounded bg-emerald-500 px-3 py-2 font-semibold text-slate-950">Continue</button> : null}
        {step === 6 ? <button type="button" disabled={stepSixErrors.length > 0} onClick={showReview} className="rounded bg-emerald-500 px-3 py-2 font-semibold text-slate-950 disabled:opacity-50">Review suggestions</button> : null}
        {step === 7 ? <button type="button" disabled={!result.valid || selected.size === 0} onClick={apply} className="rounded bg-emerald-500 px-3 py-2 font-semibold text-slate-950 disabled:opacity-50">Apply selected suggestions to profile form</button> : null}
      </div>
    </section> : null}
  </div>;
}

const stepNames = ["Representative batch", "Machine use", "Labor allocation", "Wait and elapsed time", "Cash classification", "Fixed costs", "Review"];
type Update = <K extends keyof ProfileAssistantAnswers>(field: K, value: ProfileAssistantAnswers[K]) => void;
const number = (value: string) => value === "" ? undefined : Number(value);
const inputClass = "mt-1 w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-emerald-400";
function NumberAnswer({ label, value, onChange, whole = false }: { label: string; value?: number; onChange: (value?: number) => void; whole?: boolean }) { return <label className="block text-sm">{label}<input type="number" min="0" step={whole ? "1" : "0.01"} value={value ?? ""} onChange={(event) => onChange(number(event.target.value))} className={inputClass} /></label>; }
function Choice({ legend, value, onChange, options }: { legend: string; value?: string | boolean; onChange: (value: string) => void; options: readonly [string, string][] }) { return <fieldset><legend className="font-medium">{legend}</legend><div className="mt-2 space-y-2">{options.map(([option, label]) => <label key={option} className="flex gap-2 text-sm"><input type="radio" checked={String(value) === option} onChange={() => onChange(option)} />{label}</label>)}</div></fieldset>; }
function BatchStep({ answers, update }: { answers: ProfileAssistantAnswers; update: Update }) { return <><h4 className="font-semibold">Representative batch</h4><p className="mt-1 text-sm text-slate-300">One sellable product means one item offered for one standard sale. A four-piece coaster set is one product; batch size is production output, not order quantity.</p><div className="mt-3 max-w-sm"><NumberAnswer whole label="How many sellable products do you make in one representative batch?" value={answers.unitsPerBatch} onChange={(value) => update("unitsPerBatch", value)} /></div></>; }
function MachineStep({ context, answers, update }: { context: ProfileAssistantContext; answers: ProfileAssistantAnswers; update: Update }) { return <><h4 className="font-semibold">Machine use</h4><p className="mt-1 text-sm text-slate-300">Stored calculator machine time: {context.pricingInput.machineMinutes} minutes. Confirm its production meaning before MakerMargin uses it.</p><div className="mt-3"><Choice legend="Does this product use a primary production machine?" value={answers.usesMachine} onChange={(value) => update("usesMachine", value === "yes")} options={[["yes", "Yes"], ["no", "No primary machine"]]} /></div>{answers.usesMachine ? <div className="mt-4 space-y-4"><label className="block text-sm">Primary machine name<input value={answers.machineName ?? ""} onChange={(event) => update("machineName", event.target.value)} className={inputClass} /></label><Choice legend="What does the stored calculator machine time represent?" value={answers.machineTimeBasis} onChange={(value) => update("machineTimeBasis", value as ProfileAssistantAnswers["machineTimeBasis"])} options={[["per-product", "Machine time for one sellable product"], ["whole-batch", "Machine time for the representative batch"], ["different", "A different batch time"]]} />{answers.machineTimeBasis === "different" ? <NumberAnswer label="Actual occupied machine minutes per representative batch" value={answers.differentMachineMinutesPerBatch} onChange={(value) => update("differentMachineMinutesPerBatch", value)} /> : null}<Choice legend="How much of the machine run requires hands-on supervision?" value={answers.machineSupervision} onChange={(value) => update("machineSupervision", value as ProfileAssistantAnswers["machineSupervision"])} options={[["none", "No hands-on supervision"], ["full-run", "The full machine run"], ["specific", "A specific number of minutes"], ["unknown", "I do not know yet"]]} />{answers.machineSupervision === "specific" ? <NumberAnswer label="Supervised machine minutes per batch" value={answers.specificSupervisedMinutesPerBatch} onChange={(value) => update("specificSupervisedMinutesPerBatch", value)} /> : null}</div> : null}</>; }
function LaborStep({ context, answers, update }: { context: ProfileAssistantContext; answers: ProfileAssistantAnswers; update: Update }) { return <><h4 className="font-semibold">Labor allocation</h4><p className="mt-1 text-sm text-slate-300">Stored calculator labor: {context.pricingInput.laborMinutes} minutes per product. It determines owner labor compensation, but is not treated as active production labor without your confirmation.</p><div className="mt-3"><Choice legend="How should MakerMargin use this labor value?" value={answers.laborBasis} onChange={(value) => update("laborBasis", value as ProfileAssistantAnswers["laborBasis"])} options={[["calculator", "Use it as total hands-on owner labor per product and allocate it"], ["direct", "Do not use it; I will enter production labor directly"]]} /></div>{answers.laborBasis ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><NumberAnswer label="Setup labor per batch (minutes)" value={answers.setupLaborMinutesPerBatch} onChange={(value) => update("setupLaborMinutesPerBatch", value)} />{answers.laborBasis === "direct" ? <NumberAnswer label="Active production labor per product (minutes)" value={answers.activeLaborMinutesPerUnit} onChange={(value) => update("activeLaborMinutesPerUnit", value)} /> : null}<NumberAnswer label="Finishing labor per product (minutes)" value={answers.finishingLaborMinutesPerUnit} onChange={(value) => update("finishingLaborMinutesPerUnit", value)} /></div> : null}</>; }
function TimingStep({ answers, update }: { answers: ProfileAssistantAnswers; update: Update }) { return <><h4 className="font-semibold">Passive wait and elapsed time</h4><p className="mt-1 text-sm text-slate-300">Use zero when there is none; leave blank when unknown. Elapsed time is observed wall-clock time and is never calculated by adding stages that may overlap.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><NumberAnswer label="Passive wait time per batch (minutes)" value={answers.passiveWaitMinutesPerBatch} onChange={(value) => update("passiveWaitMinutesPerBatch", value)} /><NumberAnswer label="Observed total elapsed time per batch (minutes)" value={answers.totalElapsedMinutesPerBatch} onChange={(value) => update("totalElapsedMinutesPerBatch", value)} /></div></>; }
function CashStep({ candidates, answers, update }: { candidates: ReturnType<typeof cashCandidates>; answers: ProfileAssistantAnswers; update: Update }) { function timing(id: CashComponentId, value: CashComponentTiming) { update("cashTimings", { ...answers.cashTimings, [id]: value }); } return <><h4 className="font-semibold">Cash classification</h4><p className="mt-1 text-sm text-slate-300">Review each actual cash component. Owner labor, allocated machine cost, and true base cost are never included.</p><div className="mt-3 space-y-4">{candidates.map((candidate) => <fieldset key={candidate.id} className="rounded border border-slate-700 p-3"><legend className="px-1 font-medium">{candidate.label}: ${candidate.amount.toFixed(2)}</legend><p className="mb-2 text-xs text-slate-400">{candidate.explanation} Suggested: {candidate.suggestedTiming.replace("-", " ")}.</p><select aria-label={`${candidate.label} cash timing`} value={answers.cashTimings?.[candidate.id] ?? "unknown"} onChange={(event) => timing(candidate.id, event.target.value as CashComponentTiming)} className={inputClass}><option value="before-payout">Paid before customer payout</option><option value="after-payout">Paid after customer payout</option><option value="not-cash">Not an actual cash cost</option><option value="unknown">Unknown</option></select></fieldset>)}</div></>; }
function FixedCostsStep({ answers, update }: { answers: ProfileAssistantAnswers; update: Update }) { return <><h4 className="font-semibold">Fixed batch and launch costs</h4><div className="mt-3 space-y-5"><Choice legend="Additional fixed upfront cash required for each batch?" value={answers.fixedBatchCostAnswer} onChange={(value) => update("fixedBatchCostAnswer", value as ProfileAssistantAnswers["fixedBatchCostAnswer"])} options={[["zero", "No"], ["amount", "Yes"], ["unknown", "Unknown"]]} />{answers.fixedBatchCostAnswer === "amount" ? <NumberAnswer label="Fixed upfront cash per batch ($)" value={answers.fixedBatchCost} onChange={(value) => update("fixedBatchCost", value)} /> : null}<Choice legend="Assigned fixed product launch cost to recover?" value={answers.launchCostAnswer} onChange={(value) => update("launchCostAnswer", value as ProfileAssistantAnswers["launchCostAnswer"])} options={[["zero", "No"], ["amount", "Yes"], ["unknown", "Unknown"]]} />{answers.launchCostAnswer === "amount" ? <NumberAnswer label="Assigned product launch cost ($)" value={answers.launchCost} onChange={(value) => update("launchCost", value)} /> : null}</div></>; }
function Review({ result, selected, setSelected }: { result: ReturnType<typeof buildProfileAssistantProposal>; selected: Set<ProfileAssistantField>; setSelected: (value: Set<ProfileAssistantField>) => void }) { return <><h4 className="font-semibold">Review suggestions</h4>{result.errors.length ? <ErrorList errors={result.errors} /> : null}{result.warnings.length ? <div className="mt-3 rounded border border-amber-700 bg-amber-950/40 p-3"><p className="font-semibold">Review notes</p><ul className="list-disc pl-5 text-sm">{result.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div> : null}<div className="mt-4 overflow-x-auto"><table className="min-w-full text-left text-sm"><thead><tr className="border-b border-slate-600"><th className="p-2">Apply</th><th className="p-2">Profile field</th><th className="p-2">Current</th><th className="p-2">Proposed</th><th className="p-2">Source or formula</th></tr></thead><tbody>{result.proposals.map((item) => <tr key={item.field} className="border-b border-slate-800"><td className="p-2"><input aria-label={`Apply ${label(item.field)}`} type="checkbox" disabled={item.alreadyCurrent} checked={selected.has(item.field)} onChange={(event) => { const next = new Set(selected); if (event.target.checked) next.add(item.field); else next.delete(item.field); setSelected(next); }} /></td><th scope="row" className="p-2 font-medium">{label(item.field)}</th><td className="p-2">{item.currentValue === undefined ? "Blank" : String(item.currentValue)}</td><td className="p-2">{item.alreadyCurrent ? "Already current" : item.value === "" ? "Remove" : String(item.value)}</td><td className="p-2 text-slate-300"><span className="block font-medium text-slate-200">{item.source.replaceAll("-", " ")}</span>{item.explanation}</td></tr>)}</tbody></table></div></>; }
function ErrorList({ errors }: { errors: string[] }) { return <div role="alert" className="mt-3 rounded border border-red-700 bg-red-950 p-3"><p className="font-semibold">Check your answers</p><ul className="list-disc pl-5 text-sm">{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>; }
function initialAnswers(context: ProfileAssistantContext): ProfileAssistantAnswers { const production = context.productionProfile; return { unitsPerBatch: production?.unitsPerBatch, usesMachine: production?.primaryMachine ? true : undefined, machineName: production?.primaryMachine?.label, setupLaborMinutesPerBatch: production?.setupLaborMinutesPerBatch, activeLaborMinutesPerUnit: production?.activeLaborMinutesPerUnit, finishingLaborMinutesPerUnit: production?.finishingLaborMinutesPerUnit, specificSupervisedMinutesPerBatch: production?.primaryMachine?.supervisedMinutesPerBatch, passiveWaitMinutesPerBatch: production?.passiveWaitMinutesPerBatch, totalElapsedMinutesPerBatch: production?.totalElapsedMinutesPerBatch }; }
function label(field: ProfileAssistantField) { return ({ unitsPerBatch: "Products per batch", setupLaborMinutesPerBatch: "Setup labor per batch", activeLaborMinutesPerUnit: "Active labor per product", finishingLaborMinutesPerUnit: "Finishing labor per product", machineLabel: "Primary machine", occupiedMinutesPerBatch: "Occupied machine time per batch", supervisedMinutesPerBatch: "Supervised machine time per batch", passiveWaitMinutesPerBatch: "Passive wait per batch", totalElapsedMinutesPerBatch: "Observed elapsed time per batch", cashCostPerSale: "Variable cash cost per sale", upfrontCashCostPerUnit: "Upfront cash cost per product", fixedUpfrontCashCostPerBatch: "Fixed upfront cash per batch", fixedProductLaunchCost: "Assigned launch cost" } satisfies Record<ProfileAssistantField, string>)[field]; }
