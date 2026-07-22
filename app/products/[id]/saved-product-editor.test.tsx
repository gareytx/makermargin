import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { customProductTemplate } from "@/lib/product-presets";
import { createCurrentSnapshots } from "@/lib/saved-product-snapshots";
import { CASH_PROFILE_VERSION, PRODUCTION_PROFILE_VERSION } from "@/lib/product-profiles";
import type { SavedProduct } from "@/lib/saved-products";

const mocks = vi.hoisted(() => ({ push: vi.fn(), update: vi.fn(), updateProfiles: vi.fn(), rename: vi.fn(), duplicate: vi.fn(), remove: vi.fn(), preview: vi.fn(), savePreview: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/lib/saved-product-actions", () => ({ updateSavedProductAction: mocks.update, updateSavedProductProfilesAction: mocks.updateProfiles, renameSavedProductAction: mocks.rename, duplicateSavedProductAction: mocks.duplicate, deleteSavedProductAction: mocks.remove, previewSavedProductRecalculationAction: mocks.preview, saveRecalculatedProductAction: mocks.savePreview }));

import { SavedProductEditor } from "./saved-product-editor";

const snapshots = createCurrentSnapshots(customProductTemplate.values, "2026-07-21T00:00:00Z");
const product: SavedProduct = { id: "one", userId: "user", name: "Custom Product", sourcePresetId: "digital-print", ...snapshots, rawPricingInputs: snapshots.pricingInputs, rawCalculationSnapshot: snapshots.calculationSnapshot, createdAt: "2026-07-20T00:00:00Z", updatedAt: "2026-07-21T00:00:00Z" };
const profiledSnapshots = createCurrentSnapshots(customProductTemplate.values, "2026-07-21T00:00:00Z", {
  productionProfile: { schemaVersion: PRODUCTION_PROFILE_VERSION, unitsPerBatch: 2 },
  cashProfile: { schemaVersion: CASH_PROFILE_VERSION, upfrontCashCostPerUnit: 0 },
});
const profiledProduct: SavedProduct = { ...product, ...profiledSnapshots, rawPricingInputs: profiledSnapshots.pricingInputs };

describe("saved product editor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.update.mockResolvedValue({ ok: true, data: product });
    mocks.updateProfiles.mockResolvedValue({ ok: true, data: product });
    mocks.rename.mockResolvedValue({ ok: true, data: { ...product, name: "Renamed" } });
    mocks.duplicate.mockResolvedValue({ ok: true, data: { id: "copy" } });
    mocks.remove.mockResolvedValue({ ok: true, data: { id: "one" } });
    mocks.preview.mockResolvedValue({ ok: true, data: { product, preview: snapshots } });
    mocks.savePreview.mockResolvedValue({ ok: true, data: product });
  });

  it("loads stored inputs and uses a neutral historical provenance fallback", () => { render(<SavedProductEditor initialProduct={product} />); expect(screen.getByText("Started from: Historical preset")).toBeTruthy(); expect(screen.getByLabelText("Material cost")).toHaveProperty("value", "5"); });
  it("shows Modified, validates edits, and suppresses saving invalid results", () => { render(<SavedProductEditor initialProduct={product} />); fireEvent.change(screen.getByLabelText("Desired profit margin"), { target: { value: "100" } }); expect(screen.getByText("Modified")).toBeTruthy(); expect(screen.getByRole("alert").textContent).toContain("Unable to calculate"); expect((screen.getByRole("button", { name: "Save changes" }) as HTMLButtonElement).disabled).toBe(true); });
  it("resets to the saved snapshot after confirmation", () => { vi.spyOn(window, "confirm").mockReturnValue(true); render(<SavedProductEditor initialProduct={product} />); fireEvent.change(screen.getByLabelText("Material cost"), { target: { value: "99" } }); fireEvent.click(screen.getByRole("button", { name: "Reset" })); expect(screen.getByLabelText("Material cost")).toHaveProperty("value", "5"); });
  it("renames and saves edited inputs", async () => { render(<SavedProductEditor initialProduct={product} />); fireEvent.change(screen.getByLabelText("Product name"), { target: { value: "Renamed" } }); fireEvent.click(screen.getByRole("button", { name: "Rename only" })); await waitFor(() => expect(mocks.rename).toHaveBeenCalledWith("one", "Renamed")); fireEvent.change(screen.getByLabelText("Material cost"), { target: { value: "6" } }); fireEvent.click(screen.getByRole("button", { name: "Save changes" })); await waitFor(() => expect(mocks.update).toHaveBeenCalled()); });
  it("duplicates and confirms deletion", async () => { vi.spyOn(window, "confirm").mockReturnValue(true); render(<SavedProductEditor initialProduct={product} />); fireEvent.click(screen.getByRole("button", { name: "Duplicate" })); await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/products/copy")); fireEvent.click(screen.getByRole("button", { name: "Delete" })); await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("one")); });
  it("previews recalculation without saving and cancel preserves the record", async () => { render(<SavedProductEditor initialProduct={product} />); fireEvent.click(screen.getByRole("button", { name: "Recalculate with current formula" })); await screen.findByText("Recalculation preview"); expect(mocks.savePreview).not.toHaveBeenCalled(); const cancel = screen.getByRole("button", { name: "Cancel" }); await waitFor(() => expect((cancel as HTMLButtonElement).disabled).toBe(false)); fireEvent.click(cancel); await waitFor(() => expect(screen.queryByText("Recalculation preview")).toBeNull()); });
  it("requires explicit save for recalculation", async () => { render(<SavedProductEditor initialProduct={product} />); fireEvent.click(screen.getByRole("button", { name: "Recalculate with current formula" })); const save = await screen.findByRole("button", { name: "Save updated calculation" }); await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false)); fireEvent.click(save); await waitFor(() => expect(mocks.savePreview).toHaveBeenCalledWith("one")); });
  it("keeps unsupported historical snapshots intact and disables recalculation", () => { render(<SavedProductEditor initialProduct={{ ...product, pricingInputs: null, calculationSnapshot: null }} />); expect(screen.getByText("Historical inputs unavailable")).toBeTruthy(); expect(screen.queryByRole("button", { name: "Recalculate with current formula" })).toBeNull(); expect(screen.getByRole("button", { name: "Duplicate" })).toBeTruthy(); expect(screen.getByRole("button", { name: "Delete" })).toBeTruthy(); });

  it("shows clear per-product and per-batch profile fields", () => {
    render(<SavedProductEditor initialProduct={product} />);
    expect(screen.getByRole("heading", { name: "Production & cash profile" })).toBeTruthy();
    expect(screen.getByLabelText("Setup labor per batch (minutes)")).toBeTruthy();
    expect(screen.getByLabelText("Active production labor per product (minutes)")).toBeTruthy();
    expect(screen.getByText(/do not change your recommended price/i)).toBeTruthy();
  });

  it("loads existing profile values including explicit zero", () => {
    render(<SavedProductEditor initialProduct={profiledProduct} />);
    expect(screen.getByLabelText("Sellable products per batch")).toHaveProperty("value", "2");
    expect(screen.getByLabelText("Upfront cash cost per product ($)")).toHaveProperty("value", "0");
  });

  it("announces profile validation errors", () => {
    render(<SavedProductEditor initialProduct={product} />);
    fireEvent.change(screen.getByLabelText("Sellable products per batch"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    expect(screen.getByRole("alert").textContent).toContain("positive whole number");
  });

  it("saves profiles without sending pricing, formula, or ownership fields", async () => {
    render(<SavedProductEditor initialProduct={product} />);
    fireEvent.change(screen.getByLabelText("Sellable products per batch"), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(mocks.updateProfiles).toHaveBeenCalledWith("one", {
      productionProfile: { schemaVersion: PRODUCTION_PROFILE_VERSION, unitsPerBatch: 3 },
      cashProfile: undefined,
    }));
    expect(mocks.updateProfiles.mock.calls[0][1]).not.toHaveProperty("userId");
    expect(mocks.updateProfiles.mock.calls[0][1]).not.toHaveProperty("formulaVersion");
    expect(screen.getByText("$55.35")).toBeTruthy();
  });

  it("clearing every profile field removes both profile envelopes", async () => {
    render(<SavedProductEditor initialProduct={profiledProduct} />);
    fireEvent.change(screen.getByLabelText("Sellable products per batch"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Upfront cash cost per product ($)"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(mocks.updateProfiles).toHaveBeenCalledWith("one", { productionProfile: undefined, cashProfile: undefined }));
  });

  it("preserves profile form contents when saving fails", async () => {
    mocks.updateProfiles.mockResolvedValue({ ok: false, error: "Unable to save profile.", code: "database" });
    render(<SavedProductEditor initialProduct={product} />);
    fireEvent.change(screen.getByLabelText("Sellable products per batch"), { target: { value: "7" } });
    fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
    await screen.findByText("Unable to save profile.");
    expect(screen.getByLabelText("Sellable products per batch")).toHaveProperty("value", "7");
  });
});
