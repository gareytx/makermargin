import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { customProductTemplate } from "@/lib/product-presets";
import { CASH_PROFILE_VERSION, PRODUCTION_PROFILE_VERSION } from "@/lib/product-profiles";
import { createCurrentSnapshots, PRICING_INPUT_SNAPSHOT_VERSION_V1 } from "@/lib/saved-product-snapshots";
import type { SavedProduct } from "@/lib/saved-products";
import { PlanWorkspace } from "./plan-workspace";

function saved(id: string, name: string, options: { historical?: boolean; machineKey?: string; machineLabel?: string; machineMinutes?: number; elapsedMinutes?: number } = {}): SavedProduct {
  const snapshots = createCurrentSnapshots({ ...customProductTemplate.values, laborMinutes: 8 }, "2026-08-10T12:00:00Z", {
    productionProfile: {
      schemaVersion: PRODUCTION_PROFILE_VERSION, unitsPerBatch: 4, setupLaborMinutesPerBatch: 8,
      activeLaborMinutesPerUnit: 3, finishingLaborMinutesPerUnit: 2, totalElapsedMinutesPerBatch: options.elapsedMinutes ?? 75,
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
  fireEvent.change(screen.getByLabelText("Planned production: complete batches", { selector: "#batches-a" }), { target: { value: "2" } });
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
    const batches = screen.getByLabelText("Planned production: complete batches");
    const demand = screen.getByLabelText("Demand ceiling assumption (optional)");
    expect(screen.getAllByLabelText("Planned production: complete batches")).toHaveLength(1);
    expect(demand.getAttribute("step")).toBe("1");
    expect(screen.getByText(/whole representative production batches to make/i)).toBeTruthy();
    expect(screen.getByText(/sellable units, not batches/i)).toBeTruthy();
    expect(screen.getByText(/not a forecast/i)).toBeTruthy();
    expect(batches.getAttribute("aria-describedby")).toBe("batches-a-description");
    expect(demand.getAttribute("aria-describedby")).toBe("demand-a-description");
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
    fireEvent.change(screen.getAllByLabelText("Planned production: complete batches")[0], { target: { value: "1" } });
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
    fireEvent.change(screen.getByLabelText("Planned production: complete batches", { selector: "#batches-a" }), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Demand ceiling assumption (optional)", { selector: "#demand-a" }), { target: { value: "5" } });
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

  it("shows only additional resources in the near-tie sentence", () => {
    setup(); selectAll();
    fireEvent.change(screen.getByLabelText("Period label"), { target: { value: "Capacity check" } });
    fireEvent.change(screen.getByLabelText("Planned production: complete batches", { selector: "#batches-a" }), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Available owner labor hours"), { target: { value: "1.0666666666666667" } });
    fireEvent.change(screen.getByLabelText("Available hours for Laser A"), { target: { value: "1.4" } });
    fireEvent.click(screen.getByRole("button", { name: "Calculate plan" }));
    expect(screen.getByText("Primary: Owner labor")).toBeTruthy();
    const nearTie = screen.getByText(/Additional resources within the engine's near-tie range:/);
    expect(nearTie.textContent).toContain("Laser A");
    expect(nearTie.textContent).not.toContain("Owner labor");
  });

  it("omits the near-tie sentence when it contains only primary resources", () => {
    setup(); selectAll();
    fireEvent.change(screen.getByLabelText("Period label"), { target: { value: "Tied capacity" } });
    fireEvent.change(screen.getByLabelText("Planned production: complete batches", { selector: "#batches-a" }), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText("Available owner labor hours"), { target: { value: "1.0666666666666667" } });
    fireEvent.change(screen.getByLabelText("Available hours for Laser A"), { target: { value: "1.3333333333333333" } });
    fireEvent.click(screen.getByRole("button", { name: "Calculate plan" }));
    expect(screen.getByText("Primary: Owner labor, Laser A")).toBeTruthy();
    expect(screen.queryByText(/near-tie range/)).toBeNull();
  });

  it("names and links every product affected by the same warning type", () => {
    setup([saved("a", "First Product", { elapsedMinutes: 20 }), saved("b", "Second Product", { elapsedMinutes: 20 })]);
    selectAll();
    fireEvent.change(screen.getByLabelText("Period label"), { target: { value: "Warning check" } });
    fireEvent.change(screen.getByLabelText("Planned production: complete batches", { selector: "#batches-a" }), { target: { value: "1" } });
    fireEvent.change(screen.getByLabelText("Planned production: complete batches", { selector: "#batches-b" }), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Calculate plan" }));
    const warnings = screen.getByRole("heading", { name: "Warnings" }).closest("section");
    expect(warnings).not.toBeNull();
    expect(within(warnings).getByText("First Product:")).toBeTruthy();
    expect(within(warnings).getByText("Second Product:")).toBeTruthy();
    expect(within(warnings).getAllByText(/shorter than its 40-minute occupied primary-machine run/)).toHaveLength(2);
    expect(within(warnings).getAllByRole("link", { name: "Review Production & Cash Profile" }).map((link) => link.getAttribute("href"))).toEqual([
      "/products/a#production-cash-profile",
      "/products/b#production-cash-profile",
    ]);
  });

  it("rejects fractional and negative batches through the engine", () => {
    setup(); selectAll();
    fireEvent.change(screen.getByLabelText("Period label"), { target: { value: "Week 1" } });
    fireEvent.change(screen.getByLabelText("Planned production: complete batches", { selector: "#batches-a" }), { target: { value: "1.5" } });
    fireEvent.change(screen.getByLabelText("Planned production: complete batches", { selector: "#batches-b" }), { target: { value: "-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Calculate plan" }));
    expect(screen.getAllByText(/nonnegative safe whole number/)).toHaveLength(2);
  });
});

describe("PlanWorkspace scenario lifecycle", () => {
  it("invalidates a successful result when planned batches change", () => {
    setup(); fillValidPlan();
    expect(screen.getByRole("heading", { name: "Production plan results" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Planned production: complete batches", { selector: "#batches-a" }), { target: { value: "3" } });
    expectCalculationInvalidated();
  });

  it("invalidates a successful result when a demand ceiling changes", () => {
    setup(); fillValidPlan();
    fireEvent.change(screen.getByLabelText("Demand ceiling assumption (optional)", { selector: "#demand-a" }), { target: { value: "6" } });
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
