import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { customProductTemplate } from "@/lib/product-presets";
import { CASH_PROFILE_VERSION, PRODUCTION_PROFILE_VERSION } from "@/lib/product-profiles";
import { createCurrentSnapshots, PRICING_INPUT_SNAPSHOT_VERSION_V1 } from "@/lib/saved-product-snapshots";
import type { SavedProduct } from "@/lib/saved-products";
import { PlanWorkspace } from "./plan-workspace";

function saved(id: string, name: string, options: { historical?: boolean; machineKey?: string; machineLabel?: string; machineMinutes?: number } = {}): SavedProduct {
  const snapshots = createCurrentSnapshots({ ...customProductTemplate.values, laborMinutes: 8 }, "2026-08-10T12:00:00Z", {
    productionProfile: {
      schemaVersion: PRODUCTION_PROFILE_VERSION, unitsPerBatch: 4, setupLaborMinutesPerBatch: 8,
      activeLaborMinutesPerUnit: 3, finishingLaborMinutesPerUnit: 2, totalElapsedMinutesPerBatch: 75,
      primaryMachine: { key: options.machineKey ?? "laser-a", label: options.machineLabel ?? "Laser A", occupiedMinutesPerBatch: options.machineMinutes ?? 40, supervisedMinutesPerBatch: 4 },
    },
    cashProfile: { schemaVersion: CASH_PROFILE_VERSION, cashCostPerSale: 12, upfrontCashCostPerUnit: 5, fixedUpfrontCashCostPerBatch: 6, fixedProductLaunchCost: 100 },
  });
  const pricingInputs = options.historical ? { schemaVersion: PRICING_INPUT_SNAPSHOT_VERSION_V1, basis: snapshots.pricingInputs.basis, data: snapshots.pricingInputs.data } as const : snapshots.pricingInputs;
  return { id, userId: "owner", name, sourcePresetId: null, pricingInputs, calculationSnapshot: snapshots.calculationSnapshot, formulaVersion: snapshots.formulaVersion, rawPricingInputs: pricingInputs as never, rawCalculationSnapshot: snapshots.calculationSnapshot as never, createdAt: "2026-08-01T00:00:00Z", updatedAt: "2026-08-10T00:00:00Z" };
}

const products = [saved("a", "First Product"), saved("b", "Second Product")];
function setup(items = products) { render(<PlanWorkspace initialProducts={items} />); }
function selectAll() { fireEvent.click(screen.getByRole("button", { name: "Select all" })); }
function fillValidPlan() {
  selectAll();
  fireEvent.change(screen.getByLabelText("Period label"), { target: { value: "August launch" } });
  fireEvent.change(screen.getByLabelText("Planned complete batches", { selector: "#batches-a" }), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "Calculate plan" }));
}
function expectCalculationInvalidated() {
  expect(screen.queryByRole("heading", { name: "Production plan results" })).toBeNull();
  expect(screen.queryByText("Production plan updated.")).toBeNull();
  expect(screen.getByRole("button", { name: "Calculate plan" })).toBeTruthy();
}

describe("PlanWorkspace setup", () => {
  it("requires two saved products and preserves the available product name", () => {
    const { rerender } = render(<PlanWorkspace initialProducts={[]} />);
    expect(screen.getByText("No saved products yet")).toBeTruthy();
    rerender(<PlanWorkspace initialProducts={[products[0]]} />);
    expect(screen.getByText(/First Product remains available/)).toBeTruthy();
  });

  it("starts empty, requires two selections, and exposes all planning periods", () => {
    setup();
    expect(screen.getByText("0 products selected; at least 2 required")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Calculate plan" }).hasAttribute("disabled")).toBe(true);
    expect(within(screen.getByLabelText("Period type")).getAllByRole("option").map((option) => option.textContent)).toEqual(["Week", "Month", "Craft show or event", "Custom period"]);
  });

  it("shows whole-batch and optional demand inputs only for selected products", () => {
    setup();
    fireEvent.click(screen.getByRole("checkbox", { name: /First Product/ }));
    expect(screen.getAllByLabelText("Planned complete batches")).toHaveLength(1);
    expect(screen.getByLabelText("Demand ceiling (optional)").getAttribute("step")).toBe("1");
    expect(screen.getByText("4 sellable products per batch")).toBeTruthy();
  });

  it("deduplicates shared machines by stable key while preserving labels", () => {
    setup([saved("a", "A", { machineLabel: "Laser A" }), saved("b", "B", { machineLabel: "laser a" })]);
    selectAll();
    expect(screen.getAllByLabelText(/Available hours for/)).toHaveLength(1);
    expect(screen.getByText("Stable machine key: laser-a")).toBeTruthy();
  });
});

describe("PlanWorkspace engine states and results", () => {
  it("renders invalid engine requests without partial totals", () => {
    setup(); selectAll();
    fireEvent.change(screen.getByLabelText("Period label"), { target: { value: " " } });
    fireEvent.click(screen.getByRole("button", { name: "Calculate plan" }));
    expect(screen.getByRole("heading", { name: "Plan inputs are invalid" })).toBeTruthy();
    expect(screen.getByText(/1 to 80 characters/)).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Portfolio totals" })).toBeNull();
  });

  it("faithfully renders readiness-blocked products and provenance", () => {
    setup([saved("legacy", "Historical", { historical: true }), saved("ready", "Ready")]);
    selectAll();
    fireEvent.change(screen.getByLabelText("Period label"), { target: { value: "Market week" } });
    fireEvent.change(screen.getAllByLabelText("Planned complete batches")[0], { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Calculate plan" }));
    expect(screen.getByRole("heading", { name: "Plan is blocked by product readiness" })).toBeTruthy();
    expect(screen.getAllByText(/Historical is not ready/).length).toBeGreaterThan(0);
    expect(screen.getByText("pricing-input-v1")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Portfolio totals" })).toBeNull();
  });

  it("renders repeated readiness-reason codes without duplicate React keys", () => {
    const missingStoredMetrics = saved("missing", "Missing stored metrics");
    missingStoredMetrics.calculationSnapshot = null;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    setup([missingStoredMetrics, saved("ready", "Ready")]);
    selectAll();
    expect(screen.getAllByText(/Stored .* is required\./)).toHaveLength(4);
    expect(consoleError.mock.calls.flat().join(" ")).not.toContain("Encountered two children with the same key");
  });

  it("renders totals, capacity, demand, explanations, readiness, and ordered contributions", () => {
    setup(); selectAll();
    fireEvent.change(screen.getByLabelText("Period type"), { target: { value: "event" } });
    fireEvent.change(screen.getByLabelText("Period label"), { target: { value: " Fall Market " } });
    fireEvent.change(screen.getByLabelText("Planned complete batches", { selector: "#batches-a" }), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Demand ceiling (optional)", { selector: "#demand-a" }), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Available owner labor hours"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Available working capital ($)"), { target: { value: "0" } });
    fireEvent.change(screen.getByLabelText("Available hours for Laser A"), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Calculate plan" }));
    expect(screen.getByText("Craft show or event · Fall Market")).toBeTruthy();
    for (const heading of ["Portfolio totals", "Resource utilization", "Demand analysis", "Engine explanations", "Per-product contributions", "Product readiness and provenance"]) expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
    expect(screen.getAllByText("No finite ratio (zero capacity)").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Excess production").parentElement?.textContent).toContain("3");
    const table = screen.getByRole("table");
    expect(within(table).getAllByRole("rowheader").map((cell) => cell.textContent)).toEqual(["First Product", "Second Product"]);
    expect(document.body.textContent).not.toMatch(/overall winner|weighted score/i);
  });

  it("distinguishes missing capacities from explicit zero", () => {
    setup(); fillValidPlan();
    const capacity = screen.getByRole("heading", { name: "Resource utilization" }).closest("section");
    expect(capacity).not.toBeNull();
    expect(within(capacity).getAllByText("Not provided").length).toBeGreaterThanOrEqual(3);
    expect(within(capacity).getAllByText("Unavailable").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText(/No limiting resource can be identified/)).toBeTruthy();
  });

  it("rejects fractional and negative batches through the engine", () => {
    setup(); selectAll();
    fireEvent.change(screen.getByLabelText("Period label"), { target: { value: "Week 1" } });
    fireEvent.change(screen.getByLabelText("Planned complete batches", { selector: "#batches-a" }), { target: { value: "1.5" } });
    fireEvent.change(screen.getByLabelText("Planned complete batches", { selector: "#batches-b" }), { target: { value: "-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Calculate plan" }));
    expect(screen.getAllByText(/nonnegative safe whole number/)).toHaveLength(2);
  });
});

describe("PlanWorkspace scenario lifecycle", () => {
  it("invalidates a successful result when planned batches change", () => {
    setup(); fillValidPlan();
    expect(screen.getByRole("heading", { name: "Production plan results" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Planned complete batches", { selector: "#batches-a" }), { target: { value: "3" } });
    expectCalculationInvalidated();
  });

  it("invalidates a successful result when a demand ceiling changes", () => {
    setup(); fillValidPlan();
    fireEvent.change(screen.getByLabelText("Demand ceiling (optional)", { selector: "#demand-a" }), { target: { value: "6" } });
    expectCalculationInvalidated();
  });

  it.each([
    ["owner labor", "Available owner labor hours"],
    ["working capital", "Available working capital ($)"],
    ["machine", "Available hours for Laser A"],
  ])("invalidates a successful result when %s capacity changes", (_name, label) => {
    setup(); fillValidPlan();
    fireEvent.change(screen.getByLabelText(label), { target: { value: "8" } });
    expectCalculationInvalidated();
  });

  it.each([
    ["type", "Period type", "month"],
    ["label", "Period label", "September launch"],
  ])("invalidates a successful result when period %s changes", (_name, label, value) => {
    setup(); fillValidPlan();
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
    expectCalculationInvalidated();
  });

  it("Select all and Clear selection remove stale results and notices", () => {
    setup(); fillValidPlan();
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expectCalculationInvalidated();

    fireEvent.click(screen.getByRole("button", { name: "Calculate plan" }));
    expect(screen.getByText("Production plan updated.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expectCalculationInvalidated();
    expect(screen.getByText("0 products selected; at least 2 required")).toBeTruthy();
  });

  it("treats changing only the period type as unsaved work", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    setup();
    fireEvent.change(screen.getByLabelText("Period type"), { target: { value: "month" } });
    const beforeUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);
  });

  it("protects dirty scenarios from refresh and resets only after confirmation", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    setup(); selectAll();
    const beforeUnload = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(beforeUnload);
    expect(beforeUnload.defaultPrevented).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Reset scenario" }));
    expect(screen.getByText("2 products selected; at least 2 required")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reset scenario" }));
    expect(screen.getByText("0 products selected; at least 2 required")).toBeTruthy();
    expect(confirm).toHaveBeenCalledTimes(2);
  });

  it("clears inputs and results without mutating saved products", () => {
    const input = structuredClone(products); const before = structuredClone(input);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<PlanWorkspace initialProducts={input} />); fillValidPlan();
    expect(screen.getByRole("heading", { name: "Production plan results" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Reset scenario" }));
    expect(screen.queryByRole("heading", { name: "Production plan results" })).toBeNull();
    expect((screen.getByLabelText("Period label") as HTMLInputElement).value).toBe("");
    expect(input).toEqual(before);
  });
});
