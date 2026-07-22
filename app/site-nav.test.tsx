import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ session: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createBrowserSupabaseClient: () => ({ auth: { getSession: mocks.session, onAuthStateChange: mocks.subscribe } }) }));
vi.mock("@/lib/auth-actions", () => ({ signOutAction: vi.fn() }));
import { SiteNav } from "./site-nav";

describe("SiteNav comparison access", () => {
  it("shows Compare products only to authenticated users", async () => {
    mocks.session.mockResolvedValue({ data: { session: { user: {} } } });
    mocks.subscribe.mockReturnValue({ data: { subscription: { unsubscribe: mocks.unsubscribe } } });
    render(<SiteNav />);
    await waitFor(() => expect(screen.getByRole("link", { name: "Compare products" })).toBeTruthy());
  });

  it("does not show Compare products to anonymous users", async () => {
    mocks.session.mockResolvedValue({ data: { session: null } });
    mocks.subscribe.mockReturnValue({ data: { subscription: { unsubscribe: mocks.unsubscribe } } });
    render(<SiteNav />);
    await waitFor(() => expect(screen.getByRole("link", { name: "Sign in" })).toBeTruthy());
    expect(screen.queryByRole("link", { name: "Compare products" })).toBeNull();
  });
});
