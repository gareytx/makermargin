import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ config: vi.fn(), claims: vi.fn(), list: vi.fn(), redirect: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("@/lib/auth", () => ({ getVerifiedClaims: mocks.claims }));
vi.mock("@/lib/supabase/environment", () => ({ getSupabasePublicConfig: mocks.config }));
vi.mock("@/lib/saved-product-service", () => ({ listSavedProducts: mocks.list, SavedProductError: class SavedProductError extends Error {} }));
vi.mock("../site-nav", () => ({ SiteNav: () => <nav>Navigation</nav> }));
vi.mock("./plan-workspace", () => ({ PlanWorkspace: ({ initialProducts }: { initialProducts: unknown[] }) => <div>Workspace products: {initialProducts.length}</div> }));

import PlanLoading from "./loading";
import PlanPage from "./page";

describe("plan route", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.config.mockReturnValue({}); mocks.claims.mockResolvedValue({ sub: "owner" }); mocks.list.mockResolvedValue([]); mocks.redirect.mockImplementation((path) => { throw new Error(`REDIRECT:${path}`); }); });

  it("checks cloud configuration before authentication", async () => {
    mocks.config.mockReturnValue(null);
    render(await PlanPage());
    expect(screen.getByRole("alert").textContent).toContain("Cloud production planning is unavailable");
    expect(mocks.claims).not.toHaveBeenCalled();
  });

  it("redirects unauthenticated users with the plan return path", async () => {
    mocks.claims.mockResolvedValue(null);
    await expect(PlanPage()).rejects.toThrow("REDIRECT:/login?next=%2Fplan");
    expect(mocks.list).not.toHaveBeenCalled();
  });

  it("loads owned saved products through the server service", async () => {
    mocks.list.mockResolvedValue([{}, {}]);
    render(await PlanPage());
    expect(screen.getByText("Workspace products: 2")).toBeTruthy();
    expect(mocks.list).toHaveBeenCalledOnce();
  });

  it("does not expose unexpected service errors", async () => {
    mocks.list.mockRejectedValue(new Error("database token details"));
    render(await PlanPage());
    expect(screen.getByRole("alert").textContent).toBe("Production planning is temporarily unavailable.");
  });

  it("announces the loading state", () => {
    render(<PlanLoading />);
    expect(screen.getByRole("status").textContent).toContain("Loading saved products");
  });
});
