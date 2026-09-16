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

/** Server-side only — never call this from a client component. */
export const resendApiKey = () =>
  required("RESEND_API_KEY", process.env.RESEND_API_KEY);

export const resendFromAddress = () =>
  required("RESEND_FROM_EMAIL", process.env.RESEND_FROM_EMAIL);

/**
 * Verifies that a Send Email Hook request actually came from Supabase Auth.
 * Server-side only. Set when the hook is enabled in Supabase Dashboard ->
 * Authentication -> Hooks; Supabase generates this value, it isn't chosen.
 */
export const sendEmailHookSecret = () =>
  required("SEND_EMAIL_HOOK_SECRET", process.env.SEND_EMAIL_HOOK_SECRET);

/**
 * Server-side only. Vercel Cron automatically sends this same value back as
 * `Authorization: Bearer <value>` on every invocation, as long as an env var
 * named exactly CRON_SECRET exists, no dashboard wiring beyond setting it.
 */
export const cronSecret = () =>
  required("CRON_SECRET", process.env.CRON_SECRET);
