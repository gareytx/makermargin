import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { customProductTemplate } from "@/lib/product-presets";
import { createCurrentSnapshots } from "@/lib/saved-product-snapshots";
import type { SavedProduct } from "@/lib/saved-products";

const mocks = vi.hoisted(() => ({ push: vi.fn(), duplicate: vi.fn(), remove: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push, refresh: vi.fn() }) }));
vi.mock("@/lib/saved-product-actions", () => ({ duplicateSavedProductAction: mocks.duplicate, deleteSavedProductAction: mocks.remove }));

import { ProductsList } from "./products-list";

const snapshots = createCurrentSnapshots(customProductTemplate.values, "2026-07-21T00:00:00Z");
const product: SavedProduct = { id: "one", userId: "user", name: "Journal", sourcePresetId: null, ...snapshots, rawPricingInputs: snapshots.pricingInputs, rawCalculationSnapshot: snapshots.calculationSnapshot, createdAt: "2026-07-20T00:00:00Z", updatedAt: "2026-07-21T00:00:00Z" };

describe("saved products list", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.duplicate.mockResolvedValue({ ok: true, data: { id: "copy" } }); mocks.remove.mockResolvedValue({ ok: true, data: { id: "one" } }); });
  it("shows an empty state", () => { render(<ProductsList initialProducts={[]} />); expect(screen.getByText("No products saved yet.")).toBeTruthy(); });
  it("shows saved metrics and accessible actions", () => { render(<ProductsList initialProducts={[product]} />); expect(screen.getByText("Journal")).toBeTruthy(); expect(screen.getByText("Recommended price")).toBeTruthy(); expect(screen.getByRole("link", { name: "Open" })).toBeTruthy(); });
  it("duplicates and opens the independent copy", async () => { render(<ProductsList initialProducts={[product]} />); fireEvent.click(screen.getByRole("button", { name: "Duplicate" })); await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/products/copy")); });
  it("cancels deletion without a write", () => { vi.spyOn(window, "confirm").mockReturnValue(false); render(<ProductsList initialProducts={[product]} />); fireEvent.click(screen.getByRole("button", { name: "Delete" })); expect(mocks.remove).not.toHaveBeenCalled(); });
  it("confirms deletion and removes only the selected row", async () => { vi.spyOn(window, "confirm").mockReturnValue(true); render(<ProductsList initialProducts={[product]} />); fireEvent.click(screen.getByRole("button", { name: "Delete" })); await waitFor(() => expect(screen.queryByText("Journal")).toBeNull()); });
  it("announces database action failures", async () => { mocks.duplicate.mockResolvedValue({ ok: false, error: "Database unavailable", code: "database" }); render(<ProductsList initialProducts={[product]} />); fireEvent.click(screen.getByRole("button", { name: "Duplicate" })); expect((await screen.findByRole("alert")).textContent).toContain("Database unavailable"); });
});
