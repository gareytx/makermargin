import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const exchangeCodeForSession = vi.fn();
let configured = true;
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: async () => configured ? { auth: { exchangeCodeForSession } } : null,
}));

const draft = "550e8400-e29b-41d4-a716-446655440000";

describe("auth callback", () => {
  beforeEach(() => { configured = true; exchangeCodeForSession.mockReset(); exchangeCodeForSession.mockResolvedValue({ error: null }); });
  it("exchanges a code and preserves safe next and draft values", async () => {
    const response = await GET(new NextRequest(`http://localhost:3000/auth/callback?code=ok&next=%2Fproducts&draft=${draft}`));
    expect(exchangeCodeForSession).toHaveBeenCalledWith("ok");
    expect(response.headers.get("location")).toBe(`http://localhost:3000/products?draft=${draft}`);
  });
  it.each([
    "http://localhost:3000/auth/callback",
    "http://localhost:3000/auth/callback?code=bad",
  ])("returns a safe error for missing or failed code: %s", async (url) => {
    if (url.includes("code=")) exchangeCodeForSession.mockResolvedValue({ error: new Error("bad") });
    const response = await GET(new NextRequest(url));
    expect(response.headers.get("location")).toContain("/login?next=%2F&error=callback");
  });
  it("blocks open redirects and preserves only valid draft IDs", async () => {
    const response = await GET(new NextRequest(`http://localhost:3000/auth/callback?code=ok&next=https://evil.test&draft=${draft}`));
    expect(response.headers.get("location")).toBe(`http://localhost:3000/?draft=${draft}`);
  });
  it("fails safely when authentication is not configured", async () => {
    configured = false;
    const response = await GET(new NextRequest("http://localhost:3000/auth/callback?code=ok"));
    expect(response.headers.get("location")).toContain("/login?next=%2F&error=callback");
  });
});
