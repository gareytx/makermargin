"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { signOutAction } from "@/lib/auth-actions";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

export function SiteNav() {
  const client = useMemo(() => createBrowserSupabaseClient(), []);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    if (!client) return;
    void client.auth.getSession().then(({ data }) => setAuthenticated(Boolean(data.session)));
    const { data } = client.auth.onAuthStateChange((_event, session) => setAuthenticated(Boolean(session)));
    return () => data.subscription.unsubscribe();
  }, [client]);

  return (
    <nav aria-label="Primary" className="mb-8 flex flex-wrap items-center gap-4 text-sm font-semibold">
      <Link className="text-emerald-400" href="/">Calculator</Link>
      {authenticated ? (
        <>
          <Link className="text-emerald-400" href="/products">Saved products</Link>
          <Link className="text-emerald-400" href="/compare">Compare products</Link>
          <Link className="text-emerald-400" href="/plan">Plan production</Link>
          <button className="text-slate-300 hover:text-white" type="button" onClick={async () => {
            await signOutAction();
            window.location.assign("/");
          }}>Sign out</button>
        </>
      ) : (
        <>
          <Link className="text-slate-300 hover:text-white" href="/login">Sign in</Link>
          <Link className="text-slate-300 hover:text-white" href="/register">Register</Link>
        </>
      )}
    </nav>
  );
}
