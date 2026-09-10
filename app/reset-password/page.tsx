import Link from "next/link";

import { requestPasswordReset } from "@/app/login/actions";
import { AuthForm } from "@/components/auth/auth-form";
import { AuthShell } from "@/components/ui/auth-shell";
import { Field, Input } from "@/components/ui/field";
import { getTheme } from "@/lib/theme";

export const metadata = { title: "Reset password · Compass" };

export default async function ResetPasswordPage() {
  const theme = await getTheme();

  return (
    <AuthShell
      theme={theme}
      title="Reset your password"
      intro="We will email you a link to set a new one. The link works once and expires after an hour."
      footer={
        <Link href="/login" className="text-brass-strong underline">
          Back to sign in
        </Link>
      }
    >
      <AuthForm
        action={requestPasswordReset}
        submitLabel="Send reset link"
        // Shown whether or not the address has an account — the response must
        // not reveal which emails are registered.
        successMessage="If that address has an account, a reset link is on its way. The link expires after one hour."
      >
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            required
          />
        </Field>
      </AuthForm>
    </AuthShell>
  );
}
