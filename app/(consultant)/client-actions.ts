"use server";

import { revalidatePath } from "next/cache";

import { requireActiveMember } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import type { ClientPanelRecord } from "@/lib/chat/stream-protocol";

/**
 * Inline edits from the context panel.
 *
 * Client records are shared with no ownership boundary, which is a deliberate
 * decision, so any active consultant may correct any field. RLS enforces the
 * "active consultant" half; there is nothing further to check here.
 *
 * One field at a time, because the panel saves on blur rather than behind a
 * form with a submit button. The panel is a correction surface, and corrections
 * should not require ceremony.
 */
export async function updateClientField(
  formData: FormData,
): Promise<{ error: string } | { client: ClientPanelRecord }> {
  await requireActiveMember();

  const clientId = String(formData.get("clientId") ?? "");
  const field = String(formData.get("field") ?? "");
  const raw = String(formData.get("value") ?? "").trim();

  if (!clientId) return { error: "No client record." };
  if (!["name", "industry", "size", "notes"].includes(field)) {
    return { error: "That field cannot be edited." };
  }
  if (field === "name" && !raw) {
    return { error: "A client needs a name. Clear the other fields instead." };
  }
  if (raw.length > 2000) {
    return { error: "That is too long for this field." };
  }

  // Empty means "not established", which is null rather than an empty string,
  // so a cleared field reads the same as one never filled in. Built by branch
  // rather than a computed key, which the generated Update type rejects.
  const value = raw || null;
  const patch =
    field === "name"
      ? { name: raw }
      : field === "industry"
        ? { industry: value }
        : field === "size"
          ? { size: value }
          : { notes: value };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .update(patch)
    .eq("id", clientId)
    .select("id, name, industry, size, notes")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!data) return { error: "That client record no longer exists." };

  revalidatePath("/", "layout");
  return { client: data };
}
