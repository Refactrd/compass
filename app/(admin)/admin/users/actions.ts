"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { requireActiveAdmin } from "@/lib/auth/guards";
import { siteUrl } from "@/lib/env";

export type UserActionState =
  | { error: string }
  | { ok: string; inviteLink?: string }
  | null;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Every action re-checks the caller. The admin layout already gated the page,
 * but a server action is its own HTTP endpoint and can be invoked directly, so
 * it cannot inherit that guarantee.
 */
async function assertAdmin() {
  return requireActiveAdmin();
}

export async function inviteConsultant(
  _prev: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const caller = await assertAdmin();

  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const role = formData.get("role") === "admin" ? "admin" : "consultant";

  if (!EMAIL.test(email)) {
    return { error: "Enter a valid email address." };
  }

  const admin = createAdminClient();

  const { data: existing } = await admin
    .from("users")
    .select("email, status")
    .eq("email", email)
    .maybeSingle();

  if (existing) {
    return {
      error: `${email} already has an account (${existing.status}). Re-enable it below rather than inviting again.`,
    };
  }

  // Supabase Auth sends the invitation and owns the token. The mirror trigger
  // on auth.users reads `role` out of this metadata, so the profile row lands
  // with the right role without a second write.
  const { error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { role, invited_by: caller.id },
    redirectTo: `${siteUrl()}/auth/confirm?next=/set-password`,
  });

  if (error) {
    return { error: `Invitation failed: ${error.message}` };
  }

  revalidatePath("/admin/users");
  return {
    ok: `Invited ${email} as ${role}. If the email does not arrive, use "Copy link" on their row.`,
  };
}

/**
 * Produces a usable sign-in link without sending an email.
 *
 * Email now goes through Resend (see README "Email"), so this is no longer
 * the primary path, but it stays as the manual fallback for when Resend or
 * DNS is misconfigured and an admin needs to hand someone a working link
 * directly rather than wait on deliverability.
 */
export async function createInviteLink(
  _prev: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  await assertAdmin();

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL.test(email)) return { error: "Enter a valid email address." };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
  });

  if (error || !data.properties?.hashed_token) {
    return {
      error: `Could not generate a link: ${error?.message ?? "no token returned"}`,
    };
  }

  revalidatePath("/admin/users");
  return {
    ok: `One time link for ${email}. It expires and can only be used once.`,
    inviteLink: `${siteUrl()}/auth/confirm?token_hash=${data.properties.hashed_token}&type=invite&next=/set-password`,
  };
}

export async function setUserStatus(
  _prev: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const caller = await assertAdmin();

  const userId = String(formData.get("userId") ?? "");
  const disable = formData.get("intent") === "disable";

  if (userId === caller.id) {
    return { error: "You cannot disable your own account." };
  }

  const admin = createAdminClient();

  if (disable && (await wouldRemoveLastAdmin(userId))) {
    return { error: "That is the only active admin. Promote another first." };
  }

  const { error } = await admin
    .from("users")
    .update({ status: disable ? "disabled" : "active" })
    .eq("id", userId);

  if (error) return { error: error.message };

  // Two layers, deliberately. The status flip is what our RLS policies and
  // route guards read, so access stops on the very next request. The auth ban
  // additionally invalidates the refresh token at the Auth layer, so the
  // existing session cannot be silently renewed either.
  const { error: banError } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: disable ? "876000h" : "none",
  });

  if (banError) {
    return {
      error: `Status changed, but revoking the session failed: ${banError.message}`,
    };
  }

  revalidatePath("/admin/users");
  return { ok: disable ? "Account disabled and signed out." : "Account re-enabled." };
}

export async function deleteUser(
  _prev: UserActionState,
  formData: FormData,
): Promise<UserActionState> {
  const caller = await assertAdmin();

  const userId = String(formData.get("userId") ?? "");
  const confirmation = String(formData.get("confirm") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();

  if (userId === caller.id) {
    return { error: "You cannot delete your own account." };
  }
  // Typing the address is the guard against deleting the wrong row from a
  // table where every row looks alike. Deletion cascades to conversations.
  if (confirmation.toLowerCase() !== email.toLowerCase()) {
    return { error: "Type the email address exactly to confirm deletion." };
  }
  if (await wouldRemoveLastAdmin(userId)) {
    return { error: "That is the only active admin. Promote another first." };
  }

  // Deleting the auth user cascades to public.users, and from there to that
  // person's conversations and messages.
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { error: error.message };

  revalidatePath("/admin/users");
  return { ok: `Deleted ${email} and everything they owned.` };
}

/** True when removing this user would leave nobody able to administer Compass. */
async function wouldRemoveLastAdmin(userId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("users")
    .select("id")
    .eq("role", "admin")
    .eq("status", "active");

  const activeAdmins = data ?? [];
  return activeAdmins.length <= 1 && activeAdmins.some((u) => u.id === userId);
}
