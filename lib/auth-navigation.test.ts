import { describe, expect, it } from "vitest";
import { destinationWithDraft, safeDraftId, safeReturnPath, withAuthContext } from "./auth-navigation";

const draft = "550e8400-e29b-41d4-a716-446655440000";

describe("auth navigation", () => {
  it.each(["/", "/products", "/update-password?next=%2F"])('accepts local path %s', (path) => expect(safeReturnPath(path)).toBe(path));
  it.each(["https://evil.test", "//evil.test/x", "/\\evil.test", "/%5Cevil.test", "/%ZZ", "javascript:alert(1)", ""])("rejects unsafe redirect %s", (path) => expect(safeReturnPath(path)).toBe("/"));
  it("accepts only opaque UUID draft IDs", () => {
    expect(safeDraftId(draft)).toBe(draft);
    expect(safeDraftId("calculator-data")).toBeNull();
  });
  it("round trips only next and the opaque draft ID", () => {
    const result = withAuthContext("/login", "/products", draft);
    expect(result).toContain("next=%2Fproducts");
    expect(result).toContain(`draft=${draft}`);
    expect(result).not.toContain("pricingInputs");
    expect(destinationWithDraft("/", draft)).toBe(`/?draft=${draft}`);
  });
});
