import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { customProductTemplate } from "@/lib/product-presets";
import { createCurrentSnapshots } from "@/lib/saved-product-snapshots";
import type { ProfileForm } from "./product-profile-editor";
import { ProfileAssistant } from "./profile-assistant";

const snapshots = createCurrentSnapshots(customProductTemplate.values, "2026-07-22T00:00:00Z");
const context = {
  pricingInput: snapshots.pricingInputs.data,
  calculationSnapshot: snapshots.calculationSnapshot,
};
const blankForm: ProfileForm = {
  unitsPerBatch: "", setupLaborMinutesPerBatch: "", activeLaborMinutesPerUnit: "",
  finishingLaborMinutesPerUnit: "", machineLabel: "", occupiedMinutesPerBatch: "",
  supervisedMinutesPerBatch: "", passiveWaitMinutesPerBatch: "",
  totalElapsedMinutesPerBatch: "", cashCostPerSale: "", upfrontCashCostPerUnit: "",
  fixedUpfrontCashCostPerBatch: "", fixedProductLaunchCost: "",
};

function start() {
  fireEvent.click(screen.getByRole("button", { name: "Help me complete this profile" }));
}

function continueStep() {
  fireEvent.click(screen.getByRole("button", { name: "Continue" }));
}

function reachReview() {
  start();
  fireEvent.change(screen.getByLabelText(/How many sellable products/), { target: { value: "10" } });
  continueStep();
  fireEvent.click(screen.getByLabelText("No primary machine"));
  continueStep();
  fireEvent.click(screen.getByLabelText(/enter production labor directly/));
  fireEvent.change(screen.getByLabelText("Setup labor per batch (minutes)"), { target: { value: "10" } });
  fireEvent.change(screen.getByLabelText("Active production labor per product (minutes)"), { target: { value: "15" } });
  fireEvent.change(screen.getByLabelText("Finishing labor per product (minutes)"), { target: { value: "2" } });
  continueStep();
  fireEvent.change(screen.getByLabelText("Passive wait time per batch (minutes)"), { target: { value: "0" } });
  continueStep();
  for (const select of screen.getAllByRole("combobox")) fireEvent.change(select, { target: { value: "not-cash" } });
  continueStep();
  fireEvent.click(screen.getAllByLabelText("No")[0]);
  fireEvent.click(screen.getAllByLabelText("No")[1]);
  fireEvent.click(screen.getByRole("button", { name: "Review suggestions" }));
}

describe("profile assistant interface", () => {
  it("opens with pricing context, accessible step status, and preserves manual cancellation", () => {
    const onApply = vi.fn();
    render(<ProfileAssistant context={context} form={blankForm} onApply={onApply} />);
    start();
    expect(screen.getByRole("heading", { name: "Production & Cash Profile Assistant" })).toBeTruthy();
    expect(screen.getByText(/Step 1 of 7/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onApply).not.toHaveBeenCalled();
    expect(screen.queryByRole("heading", { name: "Production & Cash Profile Assistant" })).toBeNull();
  });

  it("navigates steps and displays stored calculator labor and machine context", () => {
    render(<ProfileAssistant context={context} form={blankForm} onApply={vi.fn()} />);
    start(); continueStep();
    expect(screen.getByText(/Stored calculator machine time/).textContent).toContain(`${context.pricingInput.machineMinutes} minutes`);
    fireEvent.click(screen.getByLabelText("No primary machine")); continueStep();
    expect(screen.getByText(/Stored calculator labor/).textContent).toContain(`${context.pricingInput.laborMinutes} minutes per product`);
    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByText(/Stored calculator machine time/)).toBeTruthy();
  });

  it("shows accessible errors and a semantic current-versus-proposed review", () => {
    render(<ProfileAssistant context={context} form={blankForm} onApply={vi.fn()} />);
    reachReview();
    expect(screen.getByRole("table")).toBeTruthy();
    expect(screen.getByText("Current")).toBeTruthy();
    expect(screen.getByText("Proposed")).toBeTruthy();
    expect((screen.getByLabelText("Apply Products per batch") as HTMLInputElement).checked).toBe(true);
  });

  it("applies checked suggestions to the form only and announces they are unsaved", () => {
    const onApply = vi.fn();
    render(<ProfileAssistant context={context} form={{ ...blankForm, activeLaborMinutesPerUnit: "99" }} onApply={onApply} />);
    reachReview();
    expect((screen.getByLabelText("Apply Active labor per product") as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Apply selected suggestions to profile form" }));
    expect(onApply).toHaveBeenCalledOnce();
    expect(onApply.mock.calls[0][0]).toMatchObject({ unitsPerBatch: "10", activeLaborMinutesPerUnit: "99" });
    expect(screen.getByRole("status").textContent).toContain("not been saved yet");
  });
});
