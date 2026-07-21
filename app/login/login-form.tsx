"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { normalizeAuthError } from "@/lib/auth-errors";
import { destinationWithDraft, withAuthContext } from "@/lib/auth-navigation";
import { AuthUnavailable, buttonClass, inputClass } from "../auth/auth-shell";

export function LoginForm({ next, draft, callbackError }: { next: string; draft: string | null; callbackError: boolean }) {
  const supabase = createBrowserSupabaseClient();
  const [error, setError] = useState(callbackError ? "The authentication link is invalid or expired." : "");
  const errorRef = useRef<HTMLParagraphElement>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  if (!supabase) return <AuthUnavailable />;
  const client = supabase;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setBusy(true);
    const result = await client.auth.signInWithPassword({ email: String(data.get("email") ?? ""), password: String(data.get("password") ?? "") });
    setBusy(false);
    if (result.error) return setError(normalizeAuthError(result.error.message));
    window.location.assign(destinationWithDraft(next, draft));
  }
  return <>
    {error && <p ref={errorRef} role="alert" tabIndex={-1} className="mb-4 rounded border border-red-700 bg-red-950 p-3">{error}</p>}
    <form onSubmit={submit} className="space-y-4">
      <label className="block">Email<input className={inputClass} name="email" type="email" autoComplete="email" required /></label>
      <label className="block">Password<input className={inputClass} name="password" type="password" autoComplete="current-password" required /></label>
      <button className={buttonClass} disabled={busy}>{busy ? "Signing in..." : "Sign in"}</button>
    </form>
    <div className="mt-4 flex justify-between gap-4 text-sm"><Link className="text-emerald-400" href={withAuthContext("/register", next, draft)}>Register</Link><Link className="text-emerald-400" href={withAuthContext("/forgot-password", next, draft)}>Forgot password?</Link></div>
  </>;
}
