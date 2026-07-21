import { describe, expect, it } from "vitest";
import { getSupabasePublicConfig } from "./environment";

describe("Supabase public configuration", () => {
  it("returns null when configuration is missing or malformed", () => {
    expect(getSupabasePublicConfig({})).toBeNull();
    expect(getSupabasePublicConfig({ NEXT_PUBLIC_SUPABASE_URL: "javascript:x", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "key" })).toBeNull();
  });
  it("accepts only the two public application values", () => {
    const result = getSupabasePublicConfig({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-key", SERVICE_ROLE_KEY: "never-exposed" } as never);
    expect(result).toEqual({ url: "http://127.0.0.1:54321", publishableKey: "public-key" });
    expect(result).not.toHaveProperty("SERVICE_ROLE_KEY");
  });
});
