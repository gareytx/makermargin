import type { PricingInput } from "./calculations";
import type { ProductPresetId } from "./product-presets";
import type { PendingSaveDraft, PricingInputSnapshot } from "./saved-products";
import { safeDraftId } from "./auth-navigation";

const PREFIX = "makermargin:pending-save:v1:";
const LIFETIME_MS = 24 * 60 * 60 * 1000;

export type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

function defaultStorage(): DraftStorage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPricingInput(value: unknown): value is PricingInput {
  if (!isRecord(value) || typeof value.productName !== "string" || typeof value.customerPaysShipping !== "boolean") return false;
  const numericFields = [
    "materialCost", "packagingCost", "otherCost", "wastePercentage",
    "machineMinutes", "machineHourlyRate", "laborMinutes", "laborHourlyRate",
    "marketplaceFeePercentage", "processingFeePercentage", "fixedTransactionFee",
    "shippingCost", "desiredMarginPercentage",
  ];
  return numericFields.every((field) => typeof value[field] === "number" && Number.isFinite(value[field]));
}

function isPricingInputSnapshot(value: unknown): value is PricingInputSnapshot {
  return (
    isRecord(value) &&
    value.schemaVersion === "pricing-input-v1" &&
    value.basis === "per_sellable_product" &&
    isPricingInput(value.data)
  );
}

export function validatePendingSaveDraft(value: unknown, now = Date.now()): PendingSaveDraft | null {
  if (!isRecord(value) || value.version !== 1 || safeDraftId(value.id as string) !== value.id) return null;
  if (typeof value.createdAt !== "string" || typeof value.expiresAt !== "string") return null;
  if (value.intendedAction !== "save-product" || !isPricingInputSnapshot(value.pricingInputs)) return null;
  if (typeof value.intendedProductName !== "string" || value.returnPath !== "/") return null;
  if (value.sourcePresetId !== null && typeof value.sourcePresetId !== "string") return null;
  const created = Date.parse(value.createdAt);
  const expires = Date.parse(value.expiresAt);
  if (!Number.isFinite(created) || !Number.isFinite(expires) || expires <= now) return null;
  if (expires - created !== LIFETIME_MS) return null;
  return value as PendingSaveDraft;
}

export function createPendingSaveDraft(
  pricingInputs: PricingInput,
  sourcePresetId: ProductPresetId | null,
  options: { storage?: DraftStorage | null; now?: number } = {}
): PendingSaveDraft | null {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  if (!storage) return null;
  const now = options.now ?? Date.now();
  const draft: PendingSaveDraft = {
    version: 1,
    id: crypto.randomUUID(),
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + LIFETIME_MS).toISOString(),
    pricingInputs: {
      schemaVersion: "pricing-input-v1",
      basis: "per_sellable_product",
      data: structuredClone(pricingInputs),
    },
    sourcePresetId,
    intendedProductName: pricingInputs.productName,
    returnPath: "/",
    intendedAction: "save-product",
  };
  try {
    storage.setItem(`${PREFIX}${draft.id}`, JSON.stringify(draft));
    return draft;
  } catch {
    return null;
  }
}

export function getPendingSaveDraft(
  id: string,
  options: { storage?: DraftStorage | null; now?: number } = {}
) {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  if (!storage) return null;
  try {
    const raw = storage.getItem(`${PREFIX}${id}`);
    if (!raw) return null;
    const draft = validatePendingSaveDraft(JSON.parse(raw), options.now);
    if (!draft) storage.removeItem(`${PREFIX}${id}`);
    return draft ? structuredClone(draft) : null;
  } catch {
    return null;
  }
}

export function deletePendingSaveDraft(id: string, storage = defaultStorage()) {
  try {
    storage?.removeItem(`${PREFIX}${id}`);
    return Boolean(storage);
  } catch {
    return false;
  }
}

export function pruneExpiredPendingSaveDrafts(
  options: { storage?: DraftStorage | null; now?: number } = {}
) {
  const storage = options.storage === undefined ? defaultStorage() : options.storage;
  if (!storage) return 0;
  let removed = 0;
  try {
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index))
      .filter((key): key is string => Boolean(key?.startsWith(PREFIX)));
    for (const key of keys) {
      const raw = storage.getItem(key);
      let valid = false;
      try {
        valid = Boolean(raw && validatePendingSaveDraft(JSON.parse(raw), options.now));
      } catch {}
      if (!valid) {
        storage.removeItem(key);
        removed += 1;
      }
    }
  } catch {
    return removed;
  }
  return removed;
}
