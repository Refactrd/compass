import { createBrowserClient } from "@supabase/ssr";

import { supabaseAnonKey, supabaseUrl } from "@/lib/env";

import type { Database } from "@/lib/types/database";

/**
 * Browser-side Supabase client. Carries the signed-in user's session, so every
 * query it makes is subject to row-level security.
 *
 * Only the anon key is ever reachable from here. The service-role key lives in
 * lib/supabase/admin.ts and is never imported into a client component.
 */
export function createClient() {
  return createBrowserClient<Database, "compass">(
    supabaseUrl(),
    supabaseAnonKey(),
    { db: { schema: "compass" } },
  );
}
