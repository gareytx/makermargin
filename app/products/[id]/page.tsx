import { notFound, redirect } from "next/navigation";
import { getVerifiedClaims } from "@/lib/auth";
import { getSavedProduct, SavedProductError } from "@/lib/saved-product-service";
import { getSupabasePublicConfig } from "@/lib/supabase/environment";
import { SiteNav } from "../../site-nav";
import { SavedProductEditor } from "./saved-product-editor";

export default async function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  if (!getSupabasePublicConfig()) return <ProductShell><p role="alert">Cloud products are unavailable. The calculator remains available.</p></ProductShell>;
  const { id } = await params;
  if (!await getVerifiedClaims()) redirect(`/login?next=${encodeURIComponent(`/products/${id}`)}`);
  let product = null;
  let message = "";
  try { product = await getSavedProduct(id); }
  catch (error) {
    if (error instanceof SavedProductError && error.code === "not-found") notFound();
    message = error instanceof SavedProductError ? error.message : "Saved product is temporarily unavailable.";
  }
  return <ProductShell>{product ? <SavedProductEditor initialProduct={product} /> : <p role="alert" className="rounded border border-red-800 bg-red-950 p-4">{message}</p>}</ProductShell>;
}

function ProductShell({ children }: { children: React.ReactNode }) {
  return <main className="min-h-screen bg-slate-950 px-4 py-8 text-white sm:px-6"><div className="mx-auto max-w-5xl"><SiteNav />{children}</div></main>;
}
