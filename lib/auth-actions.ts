"use server";

import { createServerSupabaseClient } from "./supabase/server";

export async function signOutAction() {
  const supabase = await createServerSupabaseClient();
  if (supabase) await supabase.auth.signOut();
}
