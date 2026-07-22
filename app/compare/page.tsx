import { redirect } from "next/navigation";
import { getVerifiedClaims } from "@/lib/auth";
import { listSavedProducts, SavedProductError } from "@/lib/saved-product-service";
import { getSupabasePublicConfig } from "@/lib/supabase/environment";
import { SiteNav } from "../site-nav";
import { CompareWorkspace } from "./compare-workspace";

export default async function ComparePage() {
  if (!getSupabasePublicConfig()) return <CompareShell><p role="alert" className="rounded border border-amber-700 bg-amber-950/40 p-4">Cloud comparison is unavailable. The calculator remains available.</p></CompareShell>;
  if (!await getVerifiedClaims()) redirect("/login?next=%2Fcompare");
  let products = null;
  let message = "";
  try { products = await listSavedProducts(); }
  catch (error) { message = error instanceof SavedProductError ? error.message : "Product comparison is temporarily unavailable."; }
  return <CompareShell>{products ? <CompareWorkspace initialProducts={products} /> : <p role="alert" className="rounded border border-red-800 bg-red-950 p-4">{message}</p>}</CompareShell>;
}

function CompareShell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6"><div className="mx-auto max-w-7xl"><SiteNav /><h1 className="text-3xl font-bold">Compare products</h1><p className="mt-2 max-w-3xl text-slate-300">Compare stored economics and optional production details without changing your saved products.</p><div className="mt-6">{children}</div></div></main>;
}
