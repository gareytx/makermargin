import { describe, expect, it } from "vitest";
import { formatComparisonValue, formatMetric, formatMinutes, utilizationLabel } from "./comparison-formatting";

describe("comparison presentation formatting", () => {
  it("formats currencies, percentages, rates, units, and utilization without false precision", () => {
    expect(formatComparisonValue(12.345, "currency")).toBe("$12.35");
    expect(formatComparisonValue(30.04, "percentage")).toBe("30%" );
    expect(formatComparisonValue(42.5, "currency_per_hour")).toBe("$42.50/hr");
    expect(formatComparisonValue(7.25, "units_per_hour")).toBe("7.3/hr");
    expect(formatComparisonValue(3, "units")).toBe("3 units");
    expect(formatComparisonValue(1.45, "ratio")).toBe("145%");
  });

  it("uses minutes or hours and minutes according to duration", () => {
    expect(formatMinutes(42.5)).toBe("42.5 min");
    expect(formatMinutes(60)).toBe("1 hr");
    expect(formatMinutes(92)).toBe("1 hr 32 min");
  });

  it("renders unavailable values explicitly and describes utilization", () => {
    expect(formatMetric({ status: "unavailable", reason: { code: "missing_capacity", message: "Missing" } })).toBe("Unavailable");
    expect(utilizationLabel(0.5)).toBe("Within the supplied limit");
    expect(utilizationLabel(0.85)).toBe("Near the supplied limit");
    expect(utilizationLabel(1.04)).toBe("Exceeds the supplied limit");
  });
});
