import type { PricingInput } from "./calculations";
import type { CashProfileV1, ProductionProfileV1 } from "./product-profiles";
import type { CalculationSnapshot } from "./saved-product-snapshots";

export type MachineTimeBasis = "per-product" | "whole-batch" | "different";
export type LaborAllocationBasis = "calculator" | "direct";
export type MachineSupervision = "none" | "full-run" | "specific" | "unknown";
export type CashComponentTiming = "before-payout" | "after-payout" | "not-cash" | "unknown";
export type OptionalAmountAnswer = "zero" | "amount" | "unknown";
export type ProposalProvenance = "user-entered" | "derived-from-pricing" |
  "calculated-from-confirmed-answers" | "explicit-zero" | "existing-profile";
export type ProposalConflict = "blank-target" | "replaces-existing" | "already-current";

export type ProfileAssistantField =
  "unitsPerBatch" | "setupLaborMinutesPerBatch" | "activeLaborMinutesPerUnit" |
  "finishingLaborMinutesPerUnit" | "machineLabel" | "occupiedMinutesPerBatch" |
  "supervisedMinutesPerBatch" | "passiveWaitMinutesPerBatch" |
  "totalElapsedMinutesPerBatch" | "cashCostPerSale" | "upfrontCashCostPerUnit" |
  "fixedUpfrontCashCostPerBatch" | "fixedProductLaunchCost";

export type CashComponentId = "material" | "packaging" | "waste" | "other" | "shipping" | "fees";

export type ProfileAssistantAnswers = {
  unitsPerBatch?: number;
  usesMachine?: boolean;
  machineName?: string;
  machineTimeBasis?: MachineTimeBasis;
  differentMachineMinutesPerBatch?: number;
  laborBasis?: LaborAllocationBasis;
  setupLaborMinutesPerBatch?: number;
  activeLaborMinutesPerUnit?: number;
  finishingLaborMinutesPerUnit?: number;
  machineSupervision?: MachineSupervision;
  specificSupervisedMinutesPerBatch?: number;
  passiveWaitMinutesPerBatch?: number;
  totalElapsedMinutesPerBatch?: number;
  cashTimings?: Partial<Record<CashComponentId, CashComponentTiming>>;
  fixedBatchCostAnswer?: OptionalAmountAnswer;
  fixedBatchCost?: number;
  launchCostAnswer?: OptionalAmountAnswer;
  launchCost?: number;
};

export type ProfileAssistantContext = {
  pricingInput: PricingInput;
  calculationSnapshot: CalculationSnapshot;
  productionProfile?: ProductionProfileV1;
  cashProfile?: CashProfileV1;
};

export type ProfileProposal = {
  field: ProfileAssistantField;
  group: "Production" | "Machine" | "Labor" | "Cash";
  value: number | string;
  source: ProposalProvenance;
  explanation: string;
  currentValue?: number | string;
  targetBlank: boolean;
  replacesExisting: boolean;
  alreadyCurrent: boolean;
  selectedByDefault: boolean;
  conflict: ProposalConflict;
};

export type ProfileAssistantResult = {
  valid: boolean;
  proposals: ProfileProposal[];
  errors: string[];
  warnings: string[];
};

export type CashCandidate = {
  id: CashComponentId;
  label: string;
  amount: number;
  suggestedTiming: CashComponentTiming;
  explanation: string;
};

const fieldGroup: Record<ProfileAssistantField, ProfileProposal["group"]> = {
  unitsPerBatch: "Production", setupLaborMinutesPerBatch: "Labor",
  activeLaborMinutesPerUnit: "Labor", finishingLaborMinutesPerUnit: "Labor",
  machineLabel: "Machine", occupiedMinutesPerBatch: "Machine",
  supervisedMinutesPerBatch: "Machine", passiveWaitMinutesPerBatch: "Production",
  totalElapsedMinutesPerBatch: "Production", cashCostPerSale: "Cash",
  upfrontCashCostPerUnit: "Cash", fixedUpfrontCashCostPerBatch: "Cash",
  fixedProductLaunchCost: "Cash",
};

export function cashCandidates(context: ProfileAssistantContext): CashCandidate[] {
  const input = context.pricingInput;
  const result = context.calculationSnapshot.data.result;
  const candidates: CashCandidate[] = [
    { id: "material", label: "Material cost", amount: input.materialCost, suggestedTiming: "before-payout", explanation: "Stored calculator material cost." },
    { id: "packaging", label: "Packaging cost", amount: input.packagingCost, suggestedTiming: "before-payout", explanation: "Stored calculator packaging cost." },
    { id: "waste", label: "Expected waste cost", amount: result.wasteCost, suggestedTiming: "before-payout", explanation: "Waste cost from the stored calculation snapshot." },
    { id: "other", label: "Other cost", amount: input.otherCost, suggestedTiming: "unknown", explanation: "Its cash timing depends on what this cost represents." },
    { id: "shipping", label: "Shipping included in price", amount: result.shippingCostIncluded, suggestedTiming: "before-payout", explanation: "Only shipping included in the stored selling price." },
    { id: "fees", label: "Estimated selling and payment fees", amount: result.estimatedFees, suggestedTiming: "after-payout", explanation: "Estimated fees from the stored calculation snapshot." },
  ];
  return candidates.filter((candidate) => candidate.amount > 0 && Number.isFinite(candidate.amount));
}

function currentValue(context: ProfileAssistantContext, field: ProfileAssistantField) {
  const production = context.productionProfile;
  const cash = context.cashProfile;
  const values: Partial<Record<ProfileAssistantField, number | string>> = {
    unitsPerBatch: production?.unitsPerBatch,
    setupLaborMinutesPerBatch: production?.setupLaborMinutesPerBatch,
    activeLaborMinutesPerUnit: production?.activeLaborMinutesPerUnit,
    finishingLaborMinutesPerUnit: production?.finishingLaborMinutesPerUnit,
    machineLabel: production?.primaryMachine?.label,
    occupiedMinutesPerBatch: production?.primaryMachine?.occupiedMinutesPerBatch,
    supervisedMinutesPerBatch: production?.primaryMachine?.supervisedMinutesPerBatch,
    passiveWaitMinutesPerBatch: production?.passiveWaitMinutesPerBatch,
    totalElapsedMinutesPerBatch: production?.totalElapsedMinutesPerBatch,
    cashCostPerSale: cash?.cashCostPerSale,
    upfrontCashCostPerUnit: cash?.upfrontCashCostPerUnit,
    fixedUpfrontCashCostPerBatch: cash?.fixedUpfrontCashCostPerBatch,
    fixedProductLaunchCost: cash?.fixedProductLaunchCost,
  };
  return values[field];
}

function proposal(context: ProfileAssistantContext, field: ProfileAssistantField, value: number | string,
  source: ProposalProvenance, explanation: string): ProfileProposal {
  const current = currentValue(context, field);
  const targetBlank = current === undefined;
  const alreadyCurrent = current === value;
  return { field, group: fieldGroup[field], value, source, explanation, currentValue: current,
    targetBlank, replacesExisting: !targetBlank && !alreadyCurrent, alreadyCurrent,
    selectedByDefault: targetBlank && !alreadyCurrent,
    conflict: alreadyCurrent ? "already-current" : targetBlank ? "blank-target" : "replaces-existing" };
}

function validNonnegative(value: number | undefined) {
  return value !== undefined && Number.isFinite(value) && value >= 0;
}

export function buildProfileAssistantProposal(
  context: ProfileAssistantContext,
  answers: ProfileAssistantAnswers
): ProfileAssistantResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const proposals: ProfileProposal[] = [];
  const units = answers.unitsPerBatch;
  if (!Number.isInteger(units) || (units ?? 0) <= 0) errors.push("Sellable products per batch must be a positive whole number.");
  if (errors.length) return { valid: false, proposals, errors, warnings };
  proposals.push(proposal(context, "unitsPerBatch", units!, "user-entered", "Representative batch output confirmed by you."));

  let occupied: number | undefined;
  let supervised: number | undefined;
  if (answers.usesMachine === true) {
    if (!answers.machineName?.trim()) errors.push("Primary machine name is required.");
    if (!answers.machineTimeBasis) errors.push("Confirm what the calculator machine time represents.");
    if (answers.machineTimeBasis === "per-product") occupied = context.pricingInput.machineMinutes * units!;
    if (answers.machineTimeBasis === "whole-batch") occupied = context.pricingInput.machineMinutes;
    if (answers.machineTimeBasis === "different") occupied = answers.differentMachineMinutesPerBatch;
    if (!validNonnegative(occupied)) errors.push("Occupied machine minutes per batch must be a nonnegative number.");
    if (answers.machineSupervision === "none") supervised = 0;
    if (answers.machineSupervision === "full-run") supervised = occupied;
    if (answers.machineSupervision === "specific") supervised = answers.specificSupervisedMinutesPerBatch;
    if (answers.machineSupervision === "specific" && !validNonnegative(supervised)) errors.push("Specific supervised machine minutes must be nonnegative.");
    if (supervised !== undefined && occupied !== undefined && supervised > occupied) errors.push("Supervised machine time cannot exceed occupied machine time.");
    if (answers.machineName?.trim()) proposals.push(proposal(context, "machineLabel", answers.machineName.trim(), "user-entered", "Primary machine name confirmed by you."));
    if (occupied !== undefined) {
      const explanation = answers.machineTimeBasis === "per-product"
        ? `${context.pricingInput.machineMinutes} calculator minutes × ${units} products.`
        : answers.machineTimeBasis === "whole-batch" ? "Calculator machine time confirmed as the whole batch run."
          : "Different batch machine time entered by you.";
      proposals.push(proposal(context, "occupiedMinutesPerBatch", occupied, answers.machineTimeBasis === "different" ? "user-entered" : "calculated-from-confirmed-answers", explanation));
    }
    if (supervised !== undefined) proposals.push(proposal(context, "supervisedMinutesPerBatch", supervised,
      supervised === 0 ? "explicit-zero" : answers.machineSupervision === "full-run" ? "calculated-from-confirmed-answers" : "user-entered",
      answers.machineSupervision === "full-run" ? "Full machine run confirmed as supervised." : supervised === 0 ? "No hands-on supervision confirmed." : "Supervised minutes entered by you."));
  } else if (answers.usesMachine === false) {
    if (context.productionProfile?.primaryMachine) {
      proposals.push(proposal(context, "machineLabel", "", "user-entered", "Remove the existing primary machine as explicitly requested."));
      proposals.push(proposal(context, "occupiedMinutesPerBatch", "", "user-entered", "Remove existing occupied machine time with the machine."));
      proposals.push(proposal(context, "supervisedMinutesPerBatch", "", "user-entered", "Remove existing supervision time with the machine."));
    }
  } else errors.push("Confirm whether this product uses a primary production machine.");

  if (!answers.laborBasis) errors.push("Choose how to enter hands-on owner labor.");
  const setup = answers.setupLaborMinutesPerBatch;
  const finishing = answers.finishingLaborMinutesPerUnit;
  if (answers.laborBasis === "calculator") {
    const allocationsValid = validNonnegative(setup) && validNonnegative(finishing);
    if (!allocationsValid) errors.push("Setup and finishing labor need confirmed nonnegative values when allocating calculator labor.");
    if (answers.usesMachine && answers.machineSupervision === "unknown") warnings.push("Machine supervision remains unknown, so active production labor cannot yet be derived from calculator labor.");
    if (answers.usesMachine && answers.machineSupervision === undefined) errors.push("Choose a machine supervision option.");
    if (allocationsValid) {
      proposals.push(proposal(context, "setupLaborMinutesPerBatch", setup!, setup === 0 ? "explicit-zero" : "user-entered", "Setup labor allocated by you."));
      proposals.push(proposal(context, "finishingLaborMinutesPerUnit", finishing!, finishing === 0 ? "explicit-zero" : "user-entered", "Finishing labor allocated by you."));
    }
    const canDerive = allocationsValid && (answers.usesMachine === false ||
      (answers.usesMachine === true && answers.machineSupervision !== "unknown" &&
        answers.machineSupervision !== undefined && supervised !== undefined));
    if (canDerive) {
      const supervisionForLabor = answers.usesMachine ? supervised! : 0;
      const total = context.pricingInput.laborMinutes * units!;
      const residual = (total - setup! - finishing! * units! - supervisionForLabor) / units!;
      if (residual < 0) {
        errors.push("Labor allocations exceed the labor represented by pricing; active production labor would be negative.");
        warnings.push("The entered setup, finishing, and supervised components exceed the total labor represented by pricing.");
      }
      else {
        proposals.push(proposal(context, "activeLaborMinutesPerUnit", residual, "calculated-from-confirmed-answers",
          `(${context.pricingInput.laborMinutes} × ${units} − ${setup} − ${finishing} × ${units} − ${supervisionForLabor}) ÷ ${units}.`));
      }
    }
  } else if (answers.laborBasis === "direct") {
    for (const [field, value, label] of [
      ["setupLaborMinutesPerBatch", setup, "Setup labor"],
      ["activeLaborMinutesPerUnit", answers.activeLaborMinutesPerUnit, "Active production labor"],
      ["finishingLaborMinutesPerUnit", finishing, "Finishing labor"],
    ] as const) {
      if (value !== undefined && !validNonnegative(value)) errors.push(`${label} must be nonnegative.`);
      else if (value !== undefined) proposals.push(proposal(context, field, value, value === 0 ? "explicit-zero" : "user-entered", `${label} entered directly by you.`));
    }
  }

  if (answers.passiveWaitMinutesPerBatch !== undefined) {
    if (!validNonnegative(answers.passiveWaitMinutesPerBatch)) errors.push("Passive wait time must be nonnegative.");
    else proposals.push(proposal(context, "passiveWaitMinutesPerBatch", answers.passiveWaitMinutesPerBatch,
      answers.passiveWaitMinutesPerBatch === 0 ? "explicit-zero" : "user-entered", "Passive batch waiting confirmed by you."));
  }
  if (answers.totalElapsedMinutesPerBatch !== undefined) {
    if (!validNonnegative(answers.totalElapsedMinutesPerBatch)) errors.push("Observed elapsed time must be nonnegative.");
    else {
      proposals.push(proposal(context, "totalElapsedMinutesPerBatch", answers.totalElapsedMinutesPerBatch, "user-entered", "Observed wall-clock time entered by you; not calculated from component times."));
      if (occupied !== undefined && answers.totalElapsedMinutesPerBatch < occupied) errors.push("Observed elapsed wall-clock time cannot be shorter than confirmed occupied primary-machine time.");
      else if (supervised !== undefined && answers.totalElapsedMinutesPerBatch < supervised) errors.push("Observed elapsed wall-clock time cannot be shorter than confirmed supervised machine time.");
    }
  }

  const candidates = cashCandidates(context);
  let totalCash = 0;
  let upfrontCash = 0;
  let classifiedCash = 0;
  for (const candidate of candidates) {
    const timing = answers.cashTimings?.[candidate.id];
    if (!timing || timing === "unknown") { warnings.push(`${candidate.label} remains unknown, so cash suggestions may be incomplete.`); continue; }
    classifiedCash += 1;
    if (timing === "before-payout" || timing === "after-payout") totalCash += candidate.amount;
    if (timing === "before-payout") upfrontCash += candidate.amount;
  }
  if (classifiedCash > 0 || candidates.length === 0) {
    proposals.push(proposal(context, "cashCostPerSale", totalCash, totalCash === 0 ? "explicit-zero" : "calculated-from-confirmed-answers", "Sum of components confirmed as cash costs before or after payout."));
    proposals.push(proposal(context, "upfrontCashCostPerUnit", upfrontCash, upfrontCash === 0 ? "explicit-zero" : "calculated-from-confirmed-answers", "Sum of components confirmed as paid before customer payout."));
  }

  addOptionalCost(context, proposals, errors, answers.fixedBatchCostAnswer, answers.fixedBatchCost, "fixedUpfrontCashCostPerBatch", "Fixed batch cash");
  addOptionalCost(context, proposals, errors, answers.launchCostAnswer, answers.launchCost, "fixedProductLaunchCost", "Assigned launch cost");
  return { valid: errors.length === 0, proposals, errors, warnings };
}

function addOptionalCost(context: ProfileAssistantContext, proposals: ProfileProposal[], errors: string[], answer: OptionalAmountAnswer | undefined,
  amount: number | undefined, field: "fixedUpfrontCashCostPerBatch" | "fixedProductLaunchCost", label: string) {
  if (answer === "zero") proposals.push(proposal(context, field, 0, "explicit-zero", `${label} explicitly confirmed as none.`));
  if (answer === "amount") {
    if (!validNonnegative(amount)) errors.push(`${label} must be a nonnegative amount.`);
    else proposals.push(proposal(context, field, amount!, "user-entered", `${label} entered by you.`));
  }
}

export function applySelectedProposals(current: Record<string, string>, proposals: ProfileProposal[], selected: ReadonlySet<ProfileAssistantField>) {
  const next = { ...current };
  for (const item of proposals) if (selected.has(item.field) && !item.alreadyCurrent) next[item.field] = String(item.value);
  return next;
}
