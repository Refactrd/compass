"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type AuthState = { error: string } | { sent: true } | null;

/**
 * Password sign-in.
 *
 * Supabase Auth owns the password check. What this adds is the application-level
 * status gate: a disabled account must not end up with a usable session even if
 * its password is still valid, so the session is torn down again immediately.
 */
export async function signIn(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter your email address and password." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  // Deliberately generic: distinguishing "no such account" from "wrong
  // password" tells an attacker which emails have accounts.
  if (error || !data.user) {
    return { error: "Those credentials do not match an account." };
  }

  // Read through the service role. The signed-in user could read their own row
  // under RLS, but this runs before we are willing to trust the session at all.
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("users")
    .select("status")
    .eq("id", data.user.id)
    .single();

  if (!profile || profile.status === "disabled") {
    await supabase.auth.signOut();
    redirect("/access-revoked");
  }

  if (profile.status === "invited") redirect("/set-password");

  redirect("/");
}

export async function requestPasswordReset(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter your email address." };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/auth/confirm?next=/set-password`,
  });

  // Always report success. Whether an email exists is not something an
  // unauthenticated caller should be able to probe.
  return { sent: true };
}

/**
 * Sets a password for an invited user or one completing a reset.
 *
 * Requires the session minted by the emailed link, so it cannot be used to
 * change someone else's password.
 */
export async function setPassword(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 12) {
    return { error: "Use at least 12 characters." };
  }
  if (password !== confirm) {
    return { error: "The two passwords do not match." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error:
        "That link has expired or was already used. Request a new one below.",
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  // Setting a password is what turns an invitation into a working account.
  // public.users has no write policy, so this has to go through the service
  // role — the browser cannot promote itself.
  const admin = createAdminClient();
  const { data: profile } = await admin
    .from("users")
    .select("status")
    .eq("id", user.id)
    .single();

  if (profile?.status === "disabled") {
    await supabase.auth.signOut();
    redirect("/access-revoked");
  }

  if (profile?.status === "invited") {
    await admin.from("users").update({ status: "active" }).eq("id", user.id);
  }

  redirect("/");
}
