import type { ReactNode } from "react";
import Link from "next/link";

export function AuthShell({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <main className="min-h-screen bg-slate-950 px-4 py-10 text-white sm:px-6">
      <section className="mx-auto max-w-md rounded-lg border border-slate-800 bg-slate-900 p-5 shadow-xl sm:p-7">
        <Link href="/" className="text-sm font-semibold text-emerald-400">MakerMargin</Link>
        <h1 className="mt-4 text-3xl font-bold">{title}</h1>
        <p className="mt-2 text-slate-300">{description}</p>
        <div className="mt-6">{children}</div>
      </section>
    </main>
  );
}

export function AuthUnavailable() {
  return <p role="alert" className="rounded border border-amber-600 bg-amber-950 p-3 text-amber-100">Authentication is unavailable. The pricing calculator remains available.</p>;
}

export const inputClass = "mt-1 w-full rounded border border-slate-700 bg-slate-950 px-3 py-2 text-white";
export const buttonClass = "w-full rounded bg-emerald-500 px-4 py-2 font-semibold text-slate-950 disabled:opacity-60";
