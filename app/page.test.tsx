import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";

import Home from "./page";

const presetCases = [
  ["slate-coasters", "4-Piece Slate Coaster Set"],
  ["metal-wallet-card", "Metal Wallet Card"],
  ["leather-journal", "Engraved Leatherette Journal"],
  ["cutting-board", "Engraved Premium Cutting Board"],
  ["digital-print", "Digital Art Download"],
] as const;

function presetSelector(): HTMLSelectElement {
  return screen.getByLabelText("Product preset") as HTMLSelectElement;
}

function materialInput(): HTMLInputElement {
  return screen.getByLabelText("Material cost") as HTMLInputElement;
}

describe("product preset calculator", () => {
  test.each(presetCases)("selects %s", (id, productName) => {
    render(<Home />);
    fireEvent.change(presetSelector(), { target: { value: id } });
    expect(screen.getByLabelText("Product name")).toHaveProperty(
      "value",
      productName
    );
  });

  test("visually separates Custom product from product presets", () => {
    render(<Home />);
    const selector = presetSelector();
    const groups = Array.from(selector.querySelectorAll("optgroup"));
    expect(groups.map((group) => group.label)).toEqual([
      "Start from scratch",
      "Product presets",
    ]);
    expect(groups[0]?.querySelectorAll("option")).toHaveLength(1);
    expect(groups[1]?.querySelectorAll("option")).toHaveLength(5);
  });

  test("editing a populated value shows and announces Modified", () => {
    render(<Home />);
    fireEvent.change(materialInput(), { target: { value: "99" } });
    expect(screen.getByText("Modified")).toBeDefined();
    expect(screen.getByRole("status").textContent).toBe(
      "Calculator values modified."
    );
  });

  test("canceling a preset switch retains values and selection", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Home />);
    fireEvent.change(materialInput(), { target: { value: "99" } });
    fireEvent.change(presetSelector(), {
      target: { value: "metal-wallet-card" },
    });
    expect(presetSelector().value).toBe("slate-coasters");
    expect(materialInput().value).toBe("99");
  });

  test("confirming a preset switch replaces edits", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Home />);
    fireEvent.change(materialInput(), { target: { value: "99" } });
    fireEvent.change(presetSelector(), {
      target: { value: "metal-wallet-card" },
    });
    expect(presetSelector().value).toBe("metal-wallet-card");
    expect(materialInput().value).toBe("0.5");
  });

  test("selecting Custom product while modified requires confirmation", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Home />);
    fireEvent.change(materialInput(), { target: { value: "99" } });
    fireEvent.change(presetSelector(), { target: { value: "custom" } });
    expect(confirm).toHaveBeenCalledOnce();
    expect(presetSelector().value).toBe("slate-coasters");
    expect(materialInput().value).toBe("99");
  });

  test("canceling Reset retains modified values", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Home />);
    fireEvent.change(materialInput(), { target: { value: "99" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset Preset" }));
    expect(materialInput().value).toBe("99");
    expect(screen.getByText("Modified")).toBeDefined();
  });

  test("confirming Reset restores pristine values", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Home />);
    fireEvent.change(materialInput(), { target: { value: "99" } });
    fireEvent.click(screen.getByRole("button", { name: "Reset Preset" }));
    expect(materialInput().value).toBe("5.5");
    expect(screen.queryByText("Modified")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe(
      "Calculator values match the selected starting point."
    );
  });

  test("returning to a preset loads its pristine values", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Home />);
    fireEvent.change(materialInput(), { target: { value: "99" } });
    fireEvent.change(presetSelector(), {
      target: { value: "metal-wallet-card" },
    });
    fireEvent.change(presetSelector(), {
      target: { value: "slate-coasters" },
    });
    expect(materialInput().value).toBe("5.5");
  });

  test("invalid edits show validation and suppress calculated results", () => {
    render(<Home />);
    fireEvent.change(screen.getByLabelText("Desired profit margin"), {
      target: { value: "100" },
    });
    expect(screen.getByRole("alert").textContent).toContain(
      "Unable to calculate a price"
    );
    expect(screen.queryByText("$67.00")).toBeNull();
    expect(screen.queryByText("Product Viability")).toBeNull();
  });
});
