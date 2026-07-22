import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { customProductTemplate } from "@/lib/product-presets";
import { CASH_PROFILE_VERSION, PRODUCTION_PROFILE_VERSION } from "@/lib/product-profiles";
import { createCurrentSnapshots, PRICING_INPUT_SNAPSHOT_VERSION_V1 } from "@/lib/saved-product-snapshots";
import type { SavedProduct } from "@/lib/saved-products";
import { buildConstraints, CompareWorkspace } from "./compare-workspace";

function saved(id: string, name: string, options: { profile?: boolean; production?: boolean; cash?: boolean; historical?: boolean; machineKey?: string; machineLabel?: string; elapsed?: boolean; launch?: boolean } = {}): SavedProduct {
  const includeProduction = options.profile || options.production;
  const includeCash = options.profile || options.cash;
  const snapshots = createCurrentSnapshots(customProductTemplate.values, "2026-07-22T12:00:00Z", {
    ...(includeProduction ? { productionProfile: {
      schemaVersion: PRODUCTION_PROFILE_VERSION, unitsPerBatch: 4, setupLaborMinutesPerBatch: 4,
      activeLaborMinutesPerUnit: 2, finishingLaborMinutesPerUnit: 1, ...(options.elapsed === false ? {} : { totalElapsedMinutesPerBatch: 30 }),
      primaryMachine: { key: options.machineKey ?? "laser-a", label: options.machineLabel ?? "Laser A", occupiedMinutesPerBatch: 20, supervisedMinutesPerBatch: 4 },
    } } : {}),
    ...(includeCash ? { cashProfile: { schemaVersion: CASH_PROFILE_VERSION, cashCostPerSale: 8, upfrontCashCostPerUnit: 3, fixedUpfrontCashCostPerBatch: 4, ...(options.launch === false ? {} : { fixedProductLaunchCost: 50 }) } } : {}),
  });
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
    expect(screen.getByText("Production details missing")).toBeTruthy();
    expect(screen.getByText("Cash details missing")).toBeTruthy();
    expect(screen.queryByText(/invalid/i)).toBeNull();
    expect(screen.getAllByRole("link", { name: /comparison details/ })).toHaveLength(3);
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
    for (const heading of ["Core comparison", "Category leaders", "Additional comparison details", "Batch economics", "Compatibility and missing data"]) expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
    const tables = screen.getAllByRole("table");
    expect(tables.length).toBeGreaterThanOrEqual(2);
    for (const group of ["Production and throughput", "Efficiency", "Representative batch", "Cash and break-even"]) expect(screen.getByText(group)).toBeTruthy();
    expect(within(tables[0]).getByRole("columnheader", { name: "Slate Coasters" })).toBeTruthy();
    expect(screen.queryByText(/effective hourly/i)).toBeNull();
    expect(screen.queryByText(/overall winner|best overall/i)).toBeNull();
  });

  it("shows available and tied leaders without an overall winner", () => {
    render(<CompareWorkspace initialProducts={products} />);
    fireEvent.click(screen.getByRole("button", { name: "Select all" })); fireEvent.click(screen.getByRole("button", { name: "Compare selected products" }));
    expect(screen.getByRole("heading", { name: "Highest profit per sale" })).toBeTruthy();
    expect(screen.getAllByText(/These products are tied/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/overall winner|best overall/i)).toBeNull();
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

describe("CompareWorkspace profile-sparse polish", () => {
  const historical = [saved("h1", "Historical One", { historical: true }), saved("h2", "Historical Two", { historical: true })];

  function run(items: SavedProduct[]) {
    render(<CompareWorkspace initialProducts={items} />);
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    fireEvent.click(screen.getByRole("button", { name: "Compare selected products" }));
  }

  it("keeps all six core pricing metrics and owner economic benefit visible without profiles", () => {
    run(historical);
    const core = screen.getByRole("heading", { name: "Core comparison" }).closest("section")!;
    for (const label of ["Selling price", "Owner labor compensation", "Allocated economic machine cost", "Net business profit", "Profit margin", "Owner economic benefit"]) expect(within(core).getByRole("rowheader", { name: label })).toBeTruthy();
    expect(screen.getByText(/Stored profit and margin can be compared now/)).toBeTruthy();
    expect(screen.queryByText(/effective hourly/i)).toBeNull();
  });

  it("collapses all-profile metric rows by default with the correct count and original reasons", () => {
    run(historical);
    const summary = screen.getByText("Additional metrics requiring more details (16)");
    const disclosure = summary.closest("details")!;
    expect(disclosure.hasAttribute("open")).toBe(false);
    fireEvent.click(summary);
    expect(disclosure.hasAttribute("open")).toBe(true);
    expect(within(disclosure).getAllByText("A supported production profile is required for this metric.").length).toBeGreaterThan(0);
    expect(within(disclosure).getAllByText("A supported cash profile is required for this metric.").length).toBeGreaterThan(0);
    expect(within(disclosure).queryByRole("link", { name: "Add comparison details" })).toBeNull();
  });

  it("keeps a row visible when at least one product has a value", () => {
    run([saved("p", "Profiled", { profile: true }), historical[0]]);
    const row = screen.getByRole("rowheader", { name: "Active labor per sellable product" }).closest("tr")!;
    expect(within(row).getByText("5 min")).toBeTruthy();
    expect(within(row).getByText("Unavailable")).toBeTruthy();
  });

  it("uses readable category and batch names without exposing camelCase", () => {
    run(historical);
    const moreData = screen.getByText(/More data needed for 4 leader categories/);
    fireEvent.click(moreData);
    fireEvent.click(screen.getByText("Review 4 unavailable batch measures"));
    expect(document.body.textContent).toContain("owner benefit per active labor hour");
    expect(document.body.textContent).not.toMatch(/ownerEconomicBenefitPerLaborHour|netBusinessProfitPerBatch|upfrontCashRequiredPerBatch/);
  });

  it("groups unavailable leaders and batch economics into compact disclosures", () => {
    run(historical);
    expect(screen.getAllByRole("heading", { name: "Highest profit per sale" })).toHaveLength(1);
    expect(screen.getByText("More data needed for 4 leader categories")).toBeTruthy();
    expect(screen.getByText("More production and cash details are needed")).toBeTruthy();
    const batchSummary = screen.getByText("Review 4 unavailable batch measures");
    expect(batchSummary.closest("details")?.hasAttribute("open")).toBe(false);
    expect(screen.queryByText(/overall winner|weighted score|aggregate score/i)).toBeNull();
  });

  it("shows one concise capacity message when no utilization is available", () => {
    render(<CompareWorkspace initialProducts={historical} />);
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    fireEvent.change(screen.getByLabelText("Available owner labor hours"), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "Compare selected products" }));
    expect(screen.getAllByText("Capacity analysis unavailable")).toHaveLength(2);
    expect(document.body.textContent).not.toContain("UnavailableA");
  });

  it("shows available utilization and groups the remaining unavailable resources", () => {
    const partial = [saved("p1", "Production One", { production: true }), saved("p2", "Production Two", { production: true })];
    render(<CompareWorkspace initialProducts={partial} />);
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    fireEvent.change(screen.getByLabelText("Available owner labor hours"), { target: { value: "0.1" } });
    fireEvent.change(screen.getByLabelText("Working-capital ceiling ($)"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "Compare selected products" }));
    expect(screen.getAllByText("Exceeds the supplied limit").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Other capacity data unavailable")).toHaveLength(2);
    fireEvent.click(screen.getAllByText("Other capacity data unavailable")[0]);
    expect(screen.getAllByText("Working-capital utilization requires both upfront cash information and a representative batch size.")).toHaveLength(2);
  });

  it("derives concise production, cash, elapsed, and launch guidance only from reasons", () => {
    const tailored = [
      saved("production-only", "Production Only", { production: true, elapsed: false }),
      saved("cash-only", "Cash Only", { cash: true, launch: false }),
    ];
    run(tailored);
    const guidance = screen.getByRole("heading", { name: "Improve this comparison" }).parentElement!;
    expect(guidance.textContent).toContain("Add production details to compare active labor, machine efficiency, and batch economics.");
    expect(guidance.textContent).toContain("Add cash details to compare upfront cash requirements and break-even units.");
    expect(guidance.textContent).toContain("Add observed elapsed batch time to compare total production duration.");
    expect(guidance.textContent).toContain("Add an assigned product-launch cost to calculate break-even units.");
    expect(within(guidance).getAllByRole("link", { name: "Add comparison details" })).toHaveLength(2);
  });
});
