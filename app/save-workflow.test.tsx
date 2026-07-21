import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { customProductTemplate } from "@/lib/product-presets";

const mocks = vi.hoisted(() => ({
  configured: true,
  session: null as null | object,
  createDraft: vi.fn(),
  getDraft: vi.fn(),
  deleteDraft: vi.fn(),
  createProduct: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({ createBrowserSupabaseClient: () => mocks.configured ? { auth: { getSession: async () => ({ data: { session: mocks.session } }), onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }) } } : null }));
vi.mock("@/lib/pending-save-drafts", () => ({ createPendingSaveDraft: mocks.createDraft, getPendingSaveDraft: mocks.getDraft, deletePendingSaveDraft: mocks.deleteDraft }));
vi.mock("@/lib/saved-product-actions", () => ({ createSavedProductAction: mocks.createProduct }));
vi.mock("@/lib/browser-navigation", () => ({ navigateBrowser: mocks.navigate }));

import Home from "./page";

describe("calculator save workflow", () => {
  beforeEach(() => {
    mocks.configured = true; mocks.session = null; vi.clearAllMocks();
    mocks.createDraft.mockReturnValue({ id: "550e8400-e29b-41d4-a716-446655440000" });
    mocks.createProduct.mockResolvedValue({ ok: true, data: { id: "product-id" } });
    window.history.replaceState({}, "", "/");
  });

  it("creates a pending draft only after anonymous Save and navigates with only its ID", async () => {
    render(<Home />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save product" }).hasAttribute("disabled")).toBe(false));
    expect(mocks.createDraft).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save product" }));
    expect(mocks.createDraft).toHaveBeenCalledOnce();
    expect(mocks.navigate).toHaveBeenCalledWith(expect.stringMatching(/^\/login\?next=%2F&draft=[0-9a-f-]+$/));
    expect(mocks.navigate.mock.calls[0][0]).not.toContain("materialCost");
  });

  it("shows an accessible configured Save dialog and writes authenticated snapshots", async () => {
    mocks.session = {};
    render(<Home />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Save product" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Save product" }));
    expect(screen.getByRole("dialog", { name: "Save product" })).toBeTruthy();
    const dialog = screen.getByRole("dialog", { name: "Save product" });
    expect((dialog.querySelector("input") as HTMLInputElement).value).toBe("4-Piece Slate Coaster Set");
    fireEvent.submit(dialog.querySelector("form")!);
    await waitFor(() => expect(mocks.createProduct).toHaveBeenCalledWith(expect.objectContaining({ sourcePresetId: "slate-coasters" })));
    expect(mocks.navigate).toHaveBeenCalledWith("/products/product-id");
  });

  it("keeps the calculator operational when cloud configuration is missing", () => {
    mocks.configured = false;
    render(<Home />);
    expect(screen.getByText("$67.00")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save product" }));
    expect(screen.getByRole("alert").textContent).toContain("Cloud saving is unavailable");
  });

  it("offers explicit draft restoration without automatically overwriting inputs", async () => {
    mocks.session = {};
    mocks.getDraft.mockReturnValue({ id: "550e8400-e29b-41d4-a716-446655440000", pricingInputs: { schemaVersion: "pricing-input-v1", basis: "per_sellable_product", data: customProductTemplate.values }, sourcePresetId: null, intendedProductName: "Pending", version: 1, createdAt: "2026-07-21T00:00:00Z", expiresAt: "2026-07-22T00:00:00Z", returnPath: "/", intendedAction: "save-product" });
    window.history.replaceState({}, "", "/?draft=550e8400-e29b-41d4-a716-446655440000");
    render(<Home />);
    await screen.findByText("Resume saving this product?");
    expect((screen.getByLabelText("Product name") as HTMLInputElement).value).toBe("4-Piece Slate Coaster Set");
    fireEvent.click(screen.getByRole("button", { name: "Restore draft" }));
    expect((screen.getAllByLabelText("Product name")[0] as HTMLInputElement).value).toBe("Custom Product");
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("deletes a consumed pending draft only after a successful save", async () => {
    mocks.session = {};
    mocks.getDraft.mockReturnValue({ id: "550e8400-e29b-41d4-a716-446655440000", pricingInputs: { schemaVersion: "pricing-input-v1", basis: "per_sellable_product", data: customProductTemplate.values }, sourcePresetId: null, intendedProductName: "Pending", version: 1, createdAt: "2026-07-21T00:00:00Z", expiresAt: "2026-07-22T00:00:00Z", returnPath: "/", intendedAction: "save-product" });
    window.history.replaceState({}, "", "/?draft=550e8400-e29b-41d4-a716-446655440000");
    render(<Home />);
    await screen.findByText("Resume saving this product?");
    fireEvent.click(screen.getByRole("button", { name: "Restore draft" }));
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    await waitFor(() => expect(mocks.deleteDraft).toHaveBeenCalledWith("550e8400-e29b-41d4-a716-446655440000"));
  });

  it("retains a pending draft when the database save fails", async () => {
    mocks.session = {};
    mocks.createProduct.mockResolvedValue({ ok: false, error: "Unable to save this product right now." });
    mocks.getDraft.mockReturnValue({ id: "550e8400-e29b-41d4-a716-446655440000", pricingInputs: { schemaVersion: "pricing-input-v1", basis: "per_sellable_product", data: customProductTemplate.values }, sourcePresetId: null, intendedProductName: "Pending", version: 1, createdAt: "2026-07-21T00:00:00Z", expiresAt: "2026-07-22T00:00:00Z", returnPath: "/", intendedAction: "save-product" });
    window.history.replaceState({}, "", "/?draft=550e8400-e29b-41d4-a716-446655440000");
    render(<Home />);
    await screen.findByText("Resume saving this product?");
    fireEvent.click(screen.getByRole("button", { name: "Restore draft" }));
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    await screen.findByText("Unable to save this product right now.");
    expect(mocks.deleteDraft).not.toHaveBeenCalled();
  });

  it("discards a pending draft explicitly", async () => {
    mocks.getDraft.mockReturnValue({ id: "550e8400-e29b-41d4-a716-446655440000" });
    window.history.replaceState({}, "", "/?draft=550e8400-e29b-41d4-a716-446655440000");
    render(<Home />);
    await screen.findByText("Resume saving this product?");
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(mocks.deleteDraft).toHaveBeenCalledWith("550e8400-e29b-41d4-a716-446655440000");
  });
});
