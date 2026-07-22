"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { currency, percent } from "@/lib/calculations";
import type { SavedProduct } from "@/lib/saved-products";
import { deleteSavedProductAction, duplicateSavedProductAction } from "@/lib/saved-product-actions";

export function ProductsList({ initialProducts }: { initialProducts: SavedProduct[] }) {
  const [products, setProducts] = useState(initialProducts);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!products.length) return <div><p>No products saved yet.</p><Link className="mt-3 inline-block text-emerald-400" href="/">Price and save a product</Link></div>;

  function duplicate(id: string) {
    setMessage("");
    startTransition(async () => {
      const result = await duplicateSavedProductAction(id);
      if (!result.ok) setMessage(result.error);
      else router.push(`/products/${result.data.id}`);
    });
  }

  function remove(product: SavedProduct) {
    if (!window.confirm(`Delete ${product.name}? This cannot be undone.`)) return;
    setMessage("");
    startTransition(async () => {
      const result = await deleteSavedProductAction(product.id);
      if (!result.ok) setMessage(result.error);
      else setProducts((current) => current.filter((item) => item.id !== product.id));
    });
  }

  return <>
    {message ? <p role="alert" className="mb-4 rounded border border-red-800 bg-red-950 p-3">{message}</p> : null}
    <div className="mb-4 flex justify-end"><Link className="rounded border border-emerald-600 px-3 py-2 text-sm font-semibold text-emerald-300" href="/compare">Compare products</Link></div>
    <div className="grid gap-3">
      {products.map((product) => {
        const result = product.calculationSnapshot?.data.result;
        return <article key={product.id} className="rounded-lg border border-slate-700 bg-slate-900 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0"><h2 className="break-words text-lg font-semibold">{product.name}</h2><p className="text-xs text-slate-400">Updated {new Date(product.updatedAt).toLocaleDateString()}</p></div>
            <div className="flex flex-wrap gap-2">
              <Link className="rounded bg-emerald-500 px-3 py-2 text-sm font-semibold text-slate-950" href={`/products/${product.id}`}>Open</Link>
              <button disabled={pending} onClick={() => duplicate(product.id)} className="rounded border border-slate-600 px-3 py-2 text-sm">Duplicate</button>
              <button disabled={pending} onClick={() => remove(product)} className="rounded border border-red-700 px-3 py-2 text-sm text-red-200">Delete</button>
            </div>
          </div>
          {result ? <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3"><Metric label="Recommended price" value={currency(result.recommendedPrice)} /><Metric label="Net business profit" value={currency(result.netProfit)} /><Metric label="Profit margin" value={percent(result.profitMarginPercentage)} /></dl> : <p className="mt-3 text-sm text-amber-300">Historical snapshot is unavailable for current-version summaries.</p>}
        </article>;
      })}
    </div>
  </>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-slate-400">{label}</dt><dd className="font-semibold">{value}</dd></div>;
}
