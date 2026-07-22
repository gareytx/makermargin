import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { customProductTemplate } from "@/lib/product-presets";
import { CASH_PROFILE_VERSION, PRODUCTION_PROFILE_VERSION } from "@/lib/product-profiles";
import { createCurrentSnapshots, PRICING_INPUT_SNAPSHOT_VERSION_V1 } from "@/lib/saved-product-snapshots";
import type { SavedProduct } from "@/lib/saved-products";
import { buildConstraints, CompareWorkspace } from "./compare-workspace";

function saved(id: string, name: string, options: { profile?: boolean; historical?: boolean; machineKey?: string; machineLabel?: string } = {}): SavedProduct {
  const snapshots = createCurrentSnapshots(customProductTemplate.values, "2026-07-22T12:00:00Z", options.profile ? {
    productionProfile: {
      schemaVersion: PRODUCTION_PROFILE_VERSION, unitsPerBatch: 4, setupLaborMinutesPerBatch: 4,
      activeLaborMinutesPerUnit: 2, finishingLaborMinutesPerUnit: 1, totalElapsedMinutesPerBatch: 30,
      primaryMachine: { key: options.machineKey ?? "laser-a", label: options.machineLabel ?? "Laser A", occupiedMinutesPerBatch: 20, supervisedMinutesPerBatch: 4 },
    },
    cashProfile: { schemaVersion: CASH_PROFILE_VERSION, cashCostPerSale: 8, upfrontCashCostPerUnit: 3, fixedUpfrontCashCostPerBatch: 4, fixedProductLaunchCost: 50 },
  } : {});
  const pricingInputs = options.historical ? { schemaVersion: PRICING_INPUT_SNAPSHOT_VERSION_V1, basis: snapshots.pricingInputs.basis, data: snapshots.pricingInputs.data } as const : snapshots.pricingInputs;
  return { id, userId: "owner", name, sourcePresetId: null, pricingInputs, calculationSnapshot: snapshots.calculationSnapshot, formulaVersion: snapshots.formulaVersion, rawPricingInputs: pricingInputs as never, rawCalculationSnapshot: snapshots.calculationSnapshot as never, createdAt: "2026-07-20T00:00:00Z", updatedAt: "2026-07-22T00:00:00Z" };
}

const products = [saved("a", "Slate Coasters", { profile: true }), saved("b", "Leather Journal", { profile: true }), saved("c", "Digital Print", { historical: true })];

function select(name: string) { fireEvent.click(screen.getByRole("checkbox", { name: new RegExp(name) })); }

describe("CompareWorkspace selection and empty states", () => {
  it("links zero-product users to the calculator", () => {
    render(<CompareWorkspace initialProducts={[]} />);
    expect(screen.getByText("No saved products yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open the calculator" }).getAttribute("href")).toBe("/");
  });

  it("explains the one-product minimum while preserving product context", () => {
    render(<CompareWorkspace initialProducts={[products[0]]} />);
    expect(screen.getByText("One more product is needed")).toBeTruthy();
    expect(screen.getByText(/Slate Coasters/)).toBeTruthy();
  });

  it("does not silently select products and disables comparison below two", () => {
    render(<CompareWorkspace initialProducts={products} />);
    expect(screen.getByText("0 products selected")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Compare selected products" }).hasAttribute("disabled")).toBe(true);
    select("Slate Coasters");
    expect(screen.getByText("1 products selected")).toBeTruthy();
  });

  it("selects all, clears selection, and supports more than two products", () => {
    render(<CompareWorkspace initialProducts={products} />);
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(screen.getByText("3 products selected")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Compare selected products" }).hasAttribute("disabled")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Clear selection" }));
    expect(screen.getByText("0 products selected")).toBeTruthy();
  });

  it("uses a fieldset, legend, full checkbox names, summaries, and readiness language", () => {
    render(<CompareWorkspace initialProducts={products} />);
    expect(screen.getByRole("group", { name: "Products to compare" })).toBeTruthy();
    expect(screen.getAllByText("Recommended price").length).toBe(3);
    expect(screen.getAllByText("Production details added")).toHaveLength(2);
    expect(screen.getByText("Historical pricing only")).toBeTruthy();
  });
});

describe("CompareWorkspace constraints", () => {
  it("converts decimal labor and stable-key machine hours to minutes", () => {
    expect(buildConstraints({ labor: "1.5", cash: "250", machines: { "laser-a": "2.25" } }, [{ key: "laser-a", label: "Laser A" }])).toEqual({
      valid: true, hasValues: true, constraints: { availableLaborMinutes: 90, workingCapitalCeiling: 250, availableMachineMinutesByKey: { "laser-a": 135 } },
    });
  });

  it("keeps empty constraints missing and rejects zero, negative, NaN, and infinity", () => {
    expect(buildConstraints({ labor: "", cash: "", machines: {} }, [])).toEqual({ valid: true, hasValues: false, constraints: undefined });
    expect(buildConstraints({ labor: "0", cash: "-1", machines: { laser: "NaN" } }, [{ key: "laser", label: "Laser" }])).toMatchObject({ valid: false, errors: { labor: expect.any(String), cash: expect.any(String), "machine-laser": expect.any(String) } });
    expect(buildConstraints({ labor: "Infinity", cash: "", machines: {} }, [])).toMatchObject({ valid: false });
  });

  it("creates one machine field per unique stable key and preserves selection while editing", () => {
    const sameMachine = [saved("a", "A", { profile: true }), saved("b", "B", { profile: true, machineLabel: "Historical Laser Label" })];
    render(<CompareWorkspace initialProducts={sameMachine} />);
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(screen.getAllByLabelText(/Available hours for/)).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Available owner labor hours"), { target: { value: "12.5" } });
    expect(screen.getByText("2 products selected")).toBeTruthy();
    expect(screen.getByText("Machine capacity key: laser-a")).toBeTruthy();
  });

  it("clears limits without clearing selection or an existing comparison", () => {
    render(<CompareWorkspace initialProducts={products.slice(0, 2)} />);
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    fireEvent.change(screen.getByLabelText("Available owner labor hours"), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "Compare selected products" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear capacity limits" }));
    expect(screen.getByText("2 products selected")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Decision summary" })).toBeTruthy();
    expect((screen.getByLabelText("Available owner labor hours") as HTMLInputElement).value).toBe("");
  });

  it("associates inline capacity validation and announces errors", () => {
    render(<CompareWorkspace initialProducts={products.slice(0, 2)} />);
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    const labor = screen.getByLabelText("Available owner labor hours");
    fireEvent.change(labor, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Compare selected products" }));
    expect(screen.getByRole("alert").textContent).toContain("Check the optional capacity limits");
    expect(labor.getAttribute("aria-describedby")).toContain("labor-error");
  });
});

describe("CompareWorkspace results", () => {
  it("runs comparison explicitly without mutating saved-product input", () => {
    const input = structuredClone(products.slice(0, 2)); const before = structuredClone(input);
    render(<CompareWorkspace initialProducts={input} />);
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect(screen.queryByRole("heading", { name: "Decision summary" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Compare selected products" }));
    expect(screen.getByRole("heading", { name: "Decision summary" })).toBeTruthy();
    expect(input).toEqual(before);
    expect(screen.getByRole("button", { name: "Update comparison" })).toBeTruthy();
  });

  it("renders every result section and all required metric groups in a semantic table", () => {
    render(<CompareWorkspace initialProducts={products.slice(0, 2)} />);
    fireEvent.click(screen.getByRole("button", { name: "Select all" })); fireEvent.click(screen.getByRole("button", { name: "Compare selected products" }));
    for (const heading of ["Category leaders", "Detailed comparison", "Batch economics", "Compatibility and missing data"]) expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
    const table = screen.getByRole("table");
    for (const group of ["Profitability", "Production and throughput", "Efficiency", "Representative batch", "Cash and break-even"]) expect(within(table).getByText(group)).toBeTruthy();
    expect(within(table).getByRole("columnheader", { name: "Slate Coasters" })).toBeTruthy();
    expect(screen.queryByText(/effective hourly/i)).toBeNull();
    expect(screen.queryByText(/overall winner|best overall/i)).toBeNull();
  });

  it("shows available, tied, and unavailable leaders with reasons", () => {
    render(<CompareWorkspace initialProducts={products} />);
    fireEvent.click(screen.getByRole("button", { name: "Select all" })); fireEvent.click(screen.getByRole("button", { name: "Compare selected products" }));
    expect(screen.getByRole("heading", { name: "Highest profit per sale" })).toBeTruthy();
    expect(screen.getAllByText(/These products are tied/).length).toBeGreaterThan(0);
    expect(screen.getAllByText("Unavailable").length).toBeGreaterThan(0);
  });

  it("keeps capacity results hidden until a supplied limit is explicitly compared", () => {
    render(<CompareWorkspace initialProducts={products.slice(0, 2)} />);
    fireEvent.click(screen.getByRole("button", { name: "Select all" })); fireEvent.click(screen.getByRole("button", { name: "Compare selected products" }));
    expect(screen.queryByRole("heading", { name: "Capacity and bottlenecks" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Available owner labor hours"), { target: { value: "0.1" } });
    fireEvent.change(screen.getByLabelText("Working-capital ceiling ($)"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Update comparison" }));
    expect(screen.getByRole("heading", { name: "Capacity and bottlenecks" })).toBeTruthy();
    expect(screen.getAllByText("Exceeds the supplied limit").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Primary bottleneck/).length).toBeGreaterThan(0);
  });

  it("keeps historical products selectable and links missing guidance to profile details", () => {
    render(<CompareWorkspace initialProducts={[products[0], products[2]]} />);
    fireEvent.click(screen.getByRole("button", { name: "Select all" })); fireEvent.click(screen.getByRole("button", { name: "Compare selected products" }));
    expect(screen.getByText("Historical compatibility")).toBeTruthy();
    const links = screen.getAllByRole("link", { name: "Add comparison details" });
    expect(links.some((link) => link.getAttribute("href") === "/products/c#production-cash-profile")).toBe(true);
  });
});
