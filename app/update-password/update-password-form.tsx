"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";
import { normalizeAuthError } from "@/lib/auth-errors";
import { destinationWithDraft, withAuthContext } from "@/lib/auth-navigation";
import { AuthUnavailable, buttonClass, inputClass } from "../auth/auth-shell";

export function UpdatePasswordForm({ next, draft }: { next: string; draft: string | null }) {
  const supabase = createBrowserSupabaseClient();
  const [validSession, setValidSession] = useState<boolean | null>(null);
  const [message, setMessage] = useState<{ error?: string; success?: string }>({});
  const messageRef = useRef<HTMLParagraphElement>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (supabase) void supabase.auth.getSession().then(({ data }) => setValidSession(Boolean(data.session))); }, [supabase]);
  useEffect(() => { if (message.error || message.success) messageRef.current?.focus(); }, [message]);
  if (!supabase) return <AuthUnavailable />;
  const client = supabase;
  if (validSession === null) return <p role="status">Checking recovery session...</p>;
  if (!validSession) return <p role="alert" className="rounded border border-red-700 bg-red-950 p-3">This recovery link is invalid or expired. <Link className="text-emerald-400" href={withAuthContext("/forgot-password", next, draft)}>Request another link.</Link></p>;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    if (password.length < 6) return setMessage({ error: "Password must contain at least 6 characters." });
    if (password !== String(data.get("confirmation") ?? "")) return setMessage({ error: "Passwords do not match." });
    setBusy(true);
    const { error } = await client.auth.updateUser({ password });
    setBusy(false);
    if (error) return setMessage({ error: normalizeAuthError(error.message) });
    setMessage({ success: "Password updated. Redirecting..." });
    window.location.assign(destinationWithDraft(next, draft));
  }
  return <>
    {message.error && <p ref={messageRef} role="alert" tabIndex={-1} className="mb-4 rounded border border-red-700 p-3">{message.error}</p>}
    {message.success && <p ref={messageRef} role="status" tabIndex={-1} className="mb-4 rounded border border-emerald-700 p-3">{message.success}</p>}
    <form onSubmit={submit} className="space-y-4">
      <label className="block">New password<input className={inputClass} name="password" type="password" autoComplete="new-password" minLength={6} required /></label>
      <label className="block">Confirm new password<input className={inputClass} name="confirmation" type="password" autoComplete="new-password" minLength={6} required /></label>
      <button className={buttonClass} disabled={busy}>{busy ? "Updating password..." : "Update password"}</button>
    </form>
  </>;
}
