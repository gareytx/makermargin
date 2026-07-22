import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ config: vi.fn(), claims: vi.fn(), list: vi.fn(), redirect: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ getVerifiedClaims: mocks.claims }));
vi.mock("@/lib/supabase/environment", () => ({ getSupabasePublicConfig: mocks.config }));
vi.mock("@/lib/saved-product-service", () => ({ listSavedProducts: mocks.list, SavedProductError: class SavedProductError extends Error {} }));
vi.mock("../site-nav", () => ({ SiteNav: () => <nav>Navigation</nav> }));
vi.mock("./compare-workspace", () => ({ CompareWorkspace: ({ initialProducts }: { initialProducts: unknown[] }) => <div>Workspace products: {initialProducts.length}</div> }));

import ComparePage from "./page";
import CompareLoading from "./loading";

describe("compare route", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.config.mockReturnValue({}); mocks.claims.mockResolvedValue({ sub: "owner" }); mocks.list.mockResolvedValue([]); mocks.redirect.mockImplementation((path) => { throw new Error(`REDIRECT:${path}`); }); });

  it("shows cloud-unavailable state without attempting authentication", async () => {
    mocks.config.mockReturnValue(null);
    render(await ComparePage());
    expect(screen.getByRole("alert").textContent).toContain("Cloud comparison is unavailable");
    expect(mocks.claims).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated users with the compare return path", async () => {
    mocks.claims.mockResolvedValue(null);
    await expect(ComparePage()).rejects.toThrow("REDIRECT:/login?next=%2Fcompare");
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("loads owned products through the server-only service", async () => {
    mocks.list.mockResolvedValue([{}, {}]);
    render(await ComparePage());
    expect(screen.getByText("Workspace products: 2")).toBeTruthy();
    expect(mocks.list).toHaveBeenCalledOnce();
  });

  it("shows a safe service error", async () => {
    mocks.list.mockRejectedValue(new Error("database token details"));
    render(await ComparePage());
    expect(screen.getByRole("alert").textContent).toBe("Product comparison is temporarily unavailable.");
  });

  it("announces the loading state", () => {
    render(<CompareLoading />);
    expect(screen.getByRole("status").textContent).toContain("Loading saved products");
  });
});
