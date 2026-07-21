"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { normalizeAuthError } from "@/lib/auth-errors";
import { withAuthContext } from "@/lib/auth-navigation";
import { AuthUnavailable, buttonClass, inputClass } from "../auth/auth-shell";

export function RegisterForm({ next, draft }: { next: string; draft: string | null }) {
  const supabase = createBrowserSupabaseClient();
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string } | null>(null);
  const messageRef = useRef<HTMLParagraphElement>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (message) messageRef.current?.focus(); }, [message]);
  if (!supabase) return <AuthUnavailable />;
  const client = supabase;

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const email = String(data.get("email") ?? "");
    const password = String(data.get("password") ?? "");
    const confirmation = String(data.get("confirmation") ?? "");
    if (password.length < 6) return setMessage({ kind: "error", text: "Password must contain at least 6 characters." });
    if (password !== confirmation) return setMessage({ kind: "error", text: "Passwords do not match." });
    setBusy(true);
    const callback = new URL("/auth/callback", window.location.origin);
    callback.searchParams.set("next", next);
    if (draft) callback.searchParams.set("draft", draft);
    const { error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: callback.toString() } });
    setBusy(false);
    setMessage(error
      ? { kind: "error", text: normalizeAuthError(error.message) }
      : { kind: "success", text: "Check your email to confirm your account before signing in." });
  }

  return <>
    {message && <p ref={messageRef} role={message.kind === "error" ? "alert" : "status"} tabIndex={-1} className="mb-4 rounded border border-slate-700 p-3">{message.text}</p>}
    <form onSubmit={submit} className="space-y-4">
      <label className="block">Email<input className={inputClass} name="email" type="email" autoComplete="email" required /></label>
      <label className="block">Password<input className={inputClass} name="password" type="password" autoComplete="new-password" minLength={6} required /></label>
      <label className="block">Confirm password<input className={inputClass} name="confirmation" type="password" autoComplete="new-password" minLength={6} required /></label>
      <button className={buttonClass} disabled={busy}>{busy ? "Creating account..." : "Create account"}</button>
    </form>
    <p className="mt-4 text-sm text-slate-300">Already registered? <Link className="text-emerald-400" href={withAuthContext("/login", next, draft)}>Sign in</Link></p>
  </>;
}
