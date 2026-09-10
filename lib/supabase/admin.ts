import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import { supabaseServiceRoleKey, supabaseUrl } from "@/lib/env";

import type { Database } from "@/lib/types/database";

/**
 * Service-role Supabase client. **Bypasses row-level security entirely.**
 *
 * The `server-only` import above makes importing this from a client component a
 * build error, which is the mechanical guarantee behind the "API keys absent
 * from any client-side bundle" item on the production-readiness checklist.
 *
 * Legitimate uses, and only these:
 *   - inviting, disabling and deleting users (admin routes)
 *   - writing documents and document_chunks during ingestion
 *   - incrementing usage_events for the daily rate limit
 *
 * Every route that uses it must check the caller's role itself first — RLS is
 * not doing that job here. For ordinary user-scoped reads and writes, use
 * lib/supabase/server.ts instead.
 */
export function createAdminClient() {
  return createSupabaseClient<Database, "compass">(
    supabaseUrl(),
    supabaseServiceRoleKey(),
    {
      db: { schema: "compass" },
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}
