import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { getSupabasePublicConfig } from "./environment";

describe("Supabase public configuration", () => {
  it("returns null when configuration is missing", () => {
    expect(getSupabasePublicConfig({})).toBeNull();
  });

  it("returns null when the URL is invalid", () => {
    expect(getSupabasePublicConfig({ NEXT_PUBLIC_SUPABASE_URL: "javascript:x", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "key" })).toBeNull();
  });

  it("accepts explicitly injected public values", () => {
    expect(getSupabasePublicConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-key" })).toEqual({
      url: "https://example.supabase.co",
      publishableKey: "public-key",
    });
  });

  it("never returns secret or service-role properties", () => {
    const result = getSupabasePublicConfig({ NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321", NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "public-key", SERVICE_ROLE_KEY: "never-exposed" } as never);
    expect(result).toEqual({ url: "http://127.0.0.1:54321", publishableKey: "public-key" });
    expect(result).not.toHaveProperty("SERVICE_ROLE_KEY");
  });

  it("uses direct static process.env references for browser inlining", () => {
    const source = readFileSync(join(process.cwd(), "lib/supabase/environment.ts"), "utf8");
    expect(source).toContain("process.env.NEXT_PUBLIC_SUPABASE_URL");
    expect(source).toContain("process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
    expect(source).not.toMatch(/\b(?:const|let|var)\s+\w+\s*=\s*process\.env\b/);
  });
});
