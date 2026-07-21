import { redirect } from "next/navigation";
import { getVerifiedClaims } from "@/lib/auth";
import { listSavedProducts, SavedProductError } from "@/lib/saved-product-service";
import { getSupabasePublicConfig } from "@/lib/supabase/environment";
import { SiteNav } from "../site-nav";
import { ProductsList } from "./products-list";

export default async function ProductsPage() {
  if (!getSupabasePublicConfig()) return <ProductsShell><p role="alert">Cloud products are unavailable. The calculator remains available.</p></ProductsShell>;
  if (!await getVerifiedClaims()) redirect("/login?next=%2Fproducts");
  let products = null;
  let message = "";
  try {
    products = await listSavedProducts();
  } catch (error) {
    message = error instanceof SavedProductError ? error.message : "Saved products are temporarily unavailable.";
  }
  return <ProductsShell>{products ? <ProductsList initialProducts={products} /> : <p role="alert" className="rounded border border-red-800 bg-red-950 p-4">{message}</p>}</ProductsShell>;
}

function ProductsShell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6"><div className="mx-auto max-w-5xl"><SiteNav /><h1 className="text-3xl font-bold">Saved products</h1><div className="mt-6">{children}</div></div></main>;
}
