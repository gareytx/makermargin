import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { getSupabasePublicConfig } from "./environment";

export function createBrowserSupabaseClient(): SupabaseClient<Database> | null {
  const config = getSupabasePublicConfig();
  return config
    ? createBrowserClient<Database>(config.url, config.publishableKey)
    : null;
}
