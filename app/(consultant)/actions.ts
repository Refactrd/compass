"use server";

import { revalidatePath } from "next/cache";

import { requireActiveMember } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

/**
 * Deletes one of the caller's own conversations.
 *
 * Uses the RLS-scoped client on purpose. The policy already restricts deletes
 * to the owning user, so a forged id deletes nothing rather than needing an
 * application-level ownership check to be remembered here.
 */
export async function deleteConversation(
  formData: FormData,
): Promise<{ error: string } | void> {
  await requireActiveMember();

  const conversationId = String(formData.get("conversationId") ?? "");
  if (!conversationId) return { error: "No conversation selected." };

  const supabase = await createClient();
  const { error, count } = await supabase
    .from("conversations")
    .delete({ count: "exact" })
    .eq("id", conversationId);

  if (error) return { error: error.message };
  if (count === 0) return { error: "That conversation no longer exists." };

  revalidatePath("/", "layout");
}
