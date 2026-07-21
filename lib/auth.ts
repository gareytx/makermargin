import { createServerSupabaseClient } from "./supabase/server";

export async function getVerifiedClaims() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getClaims();
  return error ? null : data?.claims ?? null;
}
