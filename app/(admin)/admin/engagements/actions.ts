"use server";

import { revalidatePath } from "next/cache";

import { requireActiveAdmin } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

export type ArchiveActionState = { error: string } | { ok: string } | null;

/**
 * Archiving an immersion day is a soft delete (migration 0010): it sets
 * archived_at rather than removing the row, so the real client deliverables
 * it produced stay recoverable and still answerable from in chat, just out of
 * the everyday lists. Admin-only, re-checked here even though the admin
 * layout already gates the page a server action is its own endpoint and does
 * not inherit that guarantee, and enforced again underneath by
 * engagements_enforce_archive_admin_only, the same relationship guards.ts
 * documents between app guards and RLS everywhere else in this app.
 */
export async function archiveEngagement(
  _prev: ArchiveActionState,
  formData: FormData,
): Promise<ArchiveActionState> {
  await requireActiveAdmin();

  const engagementId = String(formData.get("engagementId") ?? "");
  if (!engagementId) return { error: "No immersion day specified." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("engagements")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", engagementId);

  if (error) return { error: error.message };

  revalidatePath("/engagements", "layout");
  revalidatePath("/admin/engagements");
  return { ok: "Immersion day archived." };
}

export async function restoreEngagement(
  _prev: ArchiveActionState,
  formData: FormData,
): Promise<ArchiveActionState> {
  await requireActiveAdmin();

  const engagementId = String(formData.get("engagementId") ?? "");
  if (!engagementId) return { error: "No immersion day specified." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("engagements")
    .update({ archived_at: null })
    .eq("id", engagementId);

  if (error) return { error: error.message };

  revalidatePath("/engagements", "layout");
  revalidatePath("/admin/engagements");
  return { ok: "Immersion day restored." };
}
