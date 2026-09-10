/**
 * Creates the first admin account.
 *
 * Account creation is invite-only through the admin dashboard, which leaves a
 * chicken-and-egg problem: there is no admin to send the first invitation. This
 * script is the way out, and it is intended to be run once per environment.
 *
 *   npm run bootstrap:admin -- someone@refactrd.com
 *
 * It uses the same Supabase invite path the dashboard will use, so the person
 * still sets their own password from an emailed link — no credentials are
 * generated here. It only sets role=admin, which the dashboard cannot do for
 * the very first account.
 *
 * Refuses to run if an admin already exists, so it cannot be used to quietly
 * add a second one later.
 */
import { createClient } from "@supabase/supabase-js";

const email = process.argv[2]?.trim();

if (!email || !email.includes("@")) {
  console.error("Usage: npm run bootstrap:admin -- someone@refactrd.com");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

if (!url || !serviceRoleKey) {
  console.error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.\n" +
      "Copy the environment template in README.md into .env.local first.",
  );
  process.exit(1);
}

const admin = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: existingAdmins, error: lookupError } = await admin
  .from("users")
  .select("email")
  .eq("role", "admin");

if (lookupError) {
  console.error(`Could not read public.users: ${lookupError.message}`);
  console.error("Has supabase/migrations/0001_schema_and_rls.sql been applied?");
  process.exit(1);
}

if (existingAdmins && existingAdmins.length > 0) {
  console.error(
    `An admin already exists (${existingAdmins.map((a) => a.email).join(", ")}).\n` +
      "Invite further accounts from the admin dashboard instead.",
  );
  process.exit(1);
}

// The mirror trigger on auth.users reads `role` out of user metadata, so the
// profile row lands with role=admin, status=invited without a second write.
const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
  data: { role: "admin" },
  redirectTo: `${siteUrl}/auth/confirm?next=/set-password`,
});

if (error) {
  console.error(`Invite failed: ${error.message}`);
  process.exit(1);
}

console.log(`Invited ${email} as admin (auth id ${data.user.id}).`);
console.log(
  "They set their own password from the emailed link, which activates the account.",
);
