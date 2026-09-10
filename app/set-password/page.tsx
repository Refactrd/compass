import Link from "next/link";

import { SetPasswordForm } from "@/components/auth/set-password-form";
import { AuthShell } from "@/components/ui/auth-shell";
import { createClient } from "@/lib/supabase/server";
import { getTheme } from "@/lib/theme";

export const metadata = { title: "Set password · Compass" };

// Reasons come from /auth/confirm, which maps Supabase error codes onto this
// fixed set. Saying which of the three happened turns a dead end into something
// the reader can act on.
const LINK_FAILURES = {
  expired: {
    title: "That link has expired",
    intro:
      "Invitation and reset links are short lived. Request a new one and it will arrive with a fresh expiry.",
  },
  used: {
    title: "That link has already been used",
    intro:
      "Links work exactly once. If you did not use it yourself, your email provider may have followed it while scanning the message. Request a new one.",
  },
  invalid: {
    title: "This link is no longer valid",
    intro:
      "Invitation and reset links work once, and expire after a short time.",
  },
} as const;

type LinkFailure = keyof typeof LINK_FAILURES;

/**
 * Lands here from an invitation or a reset link, both of which sign the user in
 * before redirecting. Reached without that session, the link is spent, and
 * there is nothing to do but request another.
 */
export default async function SetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const theme = await getTheme();
  const { reason } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const failure =
      reason && reason in LINK_FAILURES
        ? LINK_FAILURES[reason as LinkFailure]
        : LINK_FAILURES.invalid;

    return (
      <AuthShell
        theme={theme}
        title={failure.title}
        intro={failure.intro}
        footer={
          <Link href="/reset-password" className="text-brass-strong underline">
            Request a new link
          </Link>
        }
      />
    );
  }

  return (
    <AuthShell
      theme={theme}
      title="Choose a password"
      intro={`Setting a password activates ${user.email}. You will use it to sign in from now on.`}
    >
      <SetPasswordForm email={user.email ?? ""} />
    </AuthShell>
  );
}
