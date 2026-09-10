/**
 * Environment access with an actionable failure message.
 *
 * Without this, a missing Supabase URL surfaces as a Supabase-internal stack
 * trace from inside the proxy, which reads like a bug rather than "you haven't
 * created .env.local yet". See the README for the full template.
 */
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy the environment template in README.md into .env.local and restart the dev server.`,
    );
  }
  return value;
}

// Inlined at build time, so these must be referenced as full literal
// process.env.X expressions rather than looked up dynamically.
export const supabaseUrl = () =>
  required("NEXT_PUBLIC_SUPABASE_URL", process.env.NEXT_PUBLIC_SUPABASE_URL);

export const supabaseAnonKey = () =>
  required(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );

/** Server-side only — never call this from a client component. */
export const supabaseServiceRoleKey = () =>
  required("SUPABASE_SERVICE_ROLE_KEY", process.env.SUPABASE_SERVICE_ROLE_KEY);

export const siteUrl = () =>
  process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
