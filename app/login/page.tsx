import Link from "next/link";

import { signIn } from "@/app/login/actions";
import { AuthForm } from "@/components/auth/auth-form";
import { Greeting } from "@/components/auth/greeting";
import { AuthShell } from "@/components/ui/auth-shell";
import { Field, Input } from "@/components/ui/field";
import { PasswordInput } from "@/components/ui/password-input";
import { getTheme } from "@/lib/theme";

export const metadata = { title: "Sign in · Compass" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const theme = await getTheme();
  // Set by proxy.ts when a session-timeout redirect lands here, and read by
  // signIn() below, so a forced re-authentication (the 3-day time-boxed
  // session, Authentication -> Sessions in the Supabase dashboard) returns a
  // consultant to the exact page they were on, not just the home screen.
  const { next } = await searchParams;

  return (
    <AuthShell
      theme={theme}
      greeting={<Greeting />}
      title="Sign in to Compass"
      intro="Accounts are created by invitation. There is no self service sign up."
      footer={
        <Link href="/reset-password" className="text-brass-strong underline">
          Forgotten your password?
        </Link>
      }
    >
      <AuthForm action={signIn} submitLabel="Sign in">
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <Field label="Email" htmlFor="email">
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            placeholder="you@refactrd.com"
            required
          />
        </Field>
        <Field label="Password" htmlFor="password">
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            required
          />
        </Field>
      </AuthForm>
    </AuthShell>
  );
}
