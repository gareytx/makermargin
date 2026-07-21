"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { withAuthContext } from "@/lib/auth-navigation";
import { AuthUnavailable, buttonClass, inputClass } from "../auth/auth-shell";

const GENERIC = "If an account exists for that email, a password reset link has been sent.";

export function ForgotPasswordForm({ next, draft }: { next: string; draft: string | null }) {
  const supabase = createBrowserSupabaseClient();
  const [message, setMessage] = useState("");
  const messageRef = useRef<HTMLParagraphElement>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (message) messageRef.current?.focus(); }, [message]);
  if (!supabase) return <AuthUnavailable />;
  const client = supabase;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email") ?? "");
    const updatePath = withAuthContext("/update-password", next, draft);
    const callback = new URL("/auth/callback", window.location.origin);
    callback.searchParams.set("next", updatePath);
    if (draft) callback.searchParams.set("draft", draft);
    setBusy(true);
    await client.auth.resetPasswordForEmail(email, { redirectTo: callback.toString() });
    setBusy(false);
    setMessage(GENERIC);
  }
  return <>
    {message && <p ref={messageRef} role="status" tabIndex={-1} className="mb-4 rounded border border-slate-700 p-3">{message}</p>}
    <form onSubmit={submit} className="space-y-4">
      <label className="block">Email<input className={inputClass} name="email" type="email" autoComplete="email" required /></label>
      <button className={buttonClass} disabled={busy}>{busy ? "Requesting reset..." : "Send reset link"}</button>
    </form>
    <p className="mt-4 text-sm"><Link className="text-emerald-400" href={withAuthContext("/login", next, draft)}>Return to sign in</Link></p>
  </>;
}
