import { redirect } from "next/navigation";
import { getVerifiedClaims } from "@/lib/auth";
import { listSavedProducts, SavedProductError } from "@/lib/saved-product-service";
import { getSupabasePublicConfig } from "@/lib/supabase/environment";
import { SiteNav } from "../site-nav";
import { PlanWorkspace } from "./plan-workspace";

export default async function PlanPage() {
  if (!getSupabasePublicConfig()) return <PlanShell><p role="alert" className="rounded border border-amber-700 bg-amber-950/40 p-4">Cloud production planning is unavailable. The calculator remains available.</p></PlanShell>;
  if (!await getVerifiedClaims()) redirect("/login?next=%2Fplan");
  let products = null;
  let message = "";
  try { products = await listSavedProducts(); }
  catch (error) { message = error instanceof SavedProductError ? error.message : "Production planning is temporarily unavailable."; }
  return <PlanShell>{products ? <PlanWorkspace initialProducts={products} /> : <p role="alert" className="rounded border border-red-800 bg-red-950 p-4">{message}</p>}</PlanShell>;
}

function PlanShell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6"><div className="mx-auto max-w-7xl"><SiteNav /><h1 className="text-3xl font-bold">Plan production</h1><p className="mt-2 max-w-3xl text-slate-300">Test a temporary mix of complete production batches against the resources and demand assumptions you provide. Nothing here is saved.</p><div className="mt-6">{children}</div></div></main>;
}
