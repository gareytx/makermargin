import { describe, expect, it } from "vitest";
import { duplicateProductName, safeProductId } from "./saved-product-validation";

describe("saved product identifiers and duplicate names", () => {
  it("accepts UUID product IDs and rejects malformed IDs", () => {
    expect(safeProductId("550e8400-e29b-41d4-a716-446655440000")).toBe("550e8400-e29b-41d4-a716-446655440000");
    expect(safeProductId("not-a-product-id")).toBeNull();
  });

  it("keeps a copy of a 120-character name within the database limit", () => {
    const duplicate = duplicateProductName("x".repeat(120));
    expect(Array.from(duplicate)).toHaveLength(120);
    expect(duplicate).toBe(`${"x".repeat(113)} — Copy`);
  });

  it("does not split Unicode characters at the truncation boundary", () => {
    const duplicate = duplicateProductName(`${"x".repeat(112)}😀remainder`);
    expect(duplicate).toBe(`${"x".repeat(112)}😀 — Copy`);
    expect(Array.from(duplicate)).toHaveLength(120);
  });

  it("names repeated duplicates deterministically", () => {
    expect(duplicateProductName(duplicateProductName("Original"))).toBe("Original — Copy — Copy");
  });
});
