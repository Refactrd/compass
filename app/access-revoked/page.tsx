import { AuthShell } from "@/components/ui/auth-shell";
import { Button } from "@/components/ui/button";
import { getTheme } from "@/lib/theme";

export const metadata = { title: "No access · Compass" };

const REASONS = {
  disabled: {
    title: "Your access has been revoked",
    intro:
      "This account has been disabled. Any conversations you had remain stored and are not visible to anyone else. Contact your Compass administrator if you think this is a mistake.",
  },
  "no-account": {
    title: "You are signed in, but you have no Compass account",
    intro:
      "This sign-in is valid, but no Compass profile is attached to it. That happens when an account exists in the project's authentication but was never invited to Compass. An administrator needs to invite this address before it can be used.",
  },
} as const;

type Reason = keyof typeof REASONS;

/**
 * One of the four required error states: an account disabled mid-session lands
 * here rather than seeing a broken workspace (CLAUDE.md, "MVP scope"). It also
 * catches a signed-in user with no profile row, which would otherwise bounce
 * between the proxy and the route guard forever.
 *
 * States what happened and who to talk to, and nothing else — the only action
 * available to the reader is to sign out.
 */
export default async function AccessRevokedPage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const theme = await getTheme();
  const { reason } = await searchParams;
  const copy =
    reason && reason in REASONS ? REASONS[reason as Reason] : REASONS.disabled;

  return (
    <AuthShell theme={theme} title={copy.title} intro={copy.intro}>
      <form action="/auth/signout" method="post">
        <Button type="submit" variant="secondary">
          Sign out
        </Button>
      </form>
    </AuthShell>
  );
}
