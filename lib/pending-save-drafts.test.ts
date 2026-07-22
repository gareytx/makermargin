import { describe, expect, it, vi } from "vitest";
import { customProductTemplate } from "./product-presets";
import { createPendingSaveDraft, deletePendingSaveDraft, getPendingSaveDraft, pruneExpiredPendingSaveDrafts, validatePendingSaveDraft, type DraftStorage } from "./pending-save-drafts";

class MemoryStorage implements DraftStorage {
  data = new Map<string, string>();
  get length() { return this.data.size; }
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
  removeItem(key: string) { this.data.delete(key); }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
}

describe("pending save drafts", () => {
  it("creates and retrieves an independent opaque 24-hour snapshot", () => {
    const storage = new MemoryStorage();
    const now = Date.UTC(2026, 6, 20);
    const draft = createPendingSaveDraft(customProductTemplate.values, null, { storage, now });
    expect(draft?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(Date.parse(draft!.expiresAt) - Date.parse(draft!.createdAt)).toBe(86_400_000);
    expect(draft?.pricingInputs).toEqual({
      schemaVersion: "pricing-input-v2",
      basis: "per_sellable_product",
      data: customProductTemplate.values,
    });
    expect(draft).toMatchObject({
      intendedProductName: customProductTemplate.values.productName,
      returnPath: "/",
      intendedAction: "save-product",
    });
    expect(getPendingSaveDraft(draft!.id, { storage, now })).toEqual(draft);
  });
  it("supports multiple drafts and explicit deletion", () => {
    const storage = new MemoryStorage();
    const one = createPendingSaveDraft(customProductTemplate.values, null, { storage })!;
    const two = createPendingSaveDraft(customProductTemplate.values, "slate-coasters", { storage })!;
    expect(one.id).not.toBe(two.id);
    expect(deletePendingSaveDraft(one.id, storage)).toBe(true);
    expect(getPendingSaveDraft(one.id, { storage })).toBeNull();
    expect(getPendingSaveDraft(two.id, { storage })?.sourcePresetId).toBe("slate-coasters");
  });
  it("rejects malformed, unsupported, and expired records and prunes them", () => {
    const storage = new MemoryStorage();
    storage.setItem("makermargin:pending-save:v1:bad", "not-json");
    const draft = createPendingSaveDraft(customProductTemplate.values, null, { storage, now: 0 })!;
    expect(getPendingSaveDraft(draft.id, { storage, now: 86_400_001 })).toBeNull();
    expect(pruneExpiredPendingSaveDrafts({ storage, now: 86_400_001 })).toBe(1);
    expect(validatePendingSaveDraft({ version: 2 })).toBeNull();
    expect(validatePendingSaveDraft({ ...draft, id: "calculator-contents" })).toBeNull();
  });
  it("rejects unsupported input snapshots and distinguishes missing values from zero", () => {
    const storage = new MemoryStorage();
    const draft = createPendingSaveDraft(customProductTemplate.values, null, { storage })!;
    const unsupported = structuredClone(draft) as Record<string, unknown>;
    unsupported.pricingInputs = {
      schemaVersion: "pricing-input-v3",
      basis: "per_sellable_product",
      data: customProductTemplate.values,
    };
    expect(validatePendingSaveDraft(unsupported)).toBeNull();

    const missing = structuredClone(draft) as typeof draft;
    const missingData = missing.pricingInputs.data as Partial<typeof missing.pricingInputs.data>;
    delete missingData.materialCost;
    expect(validatePendingSaveDraft(missing)).toBeNull();

    const zero = structuredClone(draft);
    zero.pricingInputs.data.materialCost = 0;
    expect(validatePendingSaveDraft(zero)?.pricingInputs.data.materialCost).toBe(0);
  });
  it("returns independent snapshots so reading a draft cannot mutate stored state", () => {
    const storage = new MemoryStorage();
    const draft = createPendingSaveDraft(customProductTemplate.values, null, { storage })!;
    const restored = getPendingSaveDraft(draft.id, { storage })!;
    restored.pricingInputs.data.productName = "Changed locally";
    expect(getPendingSaveDraft(draft.id, { storage })?.pricingInputs.data.productName)
      .toBe(customProductTemplate.values.productName);
  });
  it("preserves a legacy digital-print source and its stored inputs", () => {
    const draft = createPendingSaveDraft(customProductTemplate.values, null)!;
    const legacyDraft = structuredClone(draft);
    legacyDraft.sourcePresetId = "digital-print";
    legacyDraft.pricingInputs.data.productName = "Legacy Digital Download";
    legacyDraft.pricingInputs.data.materialCost = 12.34;

    const validated = validatePendingSaveDraft(legacyDraft);
    expect(validated?.sourcePresetId).toBe("digital-print");
    expect(validated?.pricingInputs.data.productName).toBe("Legacy Digital Download");
    expect(validated?.pricingInputs.data.materialCost).toBe(12.34);
  });
  it("handles unavailable or quota-failing storage", () => {
    const broken = new MemoryStorage();
    vi.spyOn(broken, "setItem").mockImplementation(() => { throw new Error("quota"); });
    expect(createPendingSaveDraft(customProductTemplate.values, null, { storage: broken })).toBeNull();
    expect(createPendingSaveDraft(customProductTemplate.values, null, { storage: null })).toBeNull();
  });
});
