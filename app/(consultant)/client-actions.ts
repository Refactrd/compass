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

/**
 * Resolves a link suggestion, in one direction or the other.
 *
 * Both outcomes are an explicit choice by the consultant. Nothing here happens
 * on its own, which is the whole point of confirm-before-link: a wrong merge
 * silently folds two engagements' context into one record.
 */
export async function resolveClientLink(
  formData: FormData,
): Promise<{ error: string } | { client: ClientPanelRecord }> {
  const profile = await requireActiveMember();

  const conversationId = String(formData.get("conversationId") ?? "");
  const intent = String(formData.get("intent") ?? "");
  if (!conversationId) return { error: "No conversation." };

  const supabase = await createClient();

  if (intent === "link") {
    const existingId = String(formData.get("existingClientId") ?? "");
    if (!existingId) return { error: "No client to link to." };

    const { data: client } = await supabase
      .from("clients")
      .select("id, name, industry, size, notes")
      .eq("id", existingId)
      .maybeSingle();

    if (!client) return { error: "That client no longer exists." };

    // Only the link is written. Facts from this conversation are deliberately
    // not merged in: the consultant confirmed these are the same organization,
    // not that this conversation's version of the details should win.
    const { error } = await supabase
      .from("conversations")
      .update({ client_id: client.id, pending_client_link: null })
      .eq("id", conversationId);

    if (error) return { error: error.message };

    revalidatePath("/", "layout");
    return { client };
  }

  if (intent === "separate") {
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return { error: "No name to record." };

    const nullable = (key: string) => {
      const value = String(formData.get(key) ?? "").trim();
      return value || null;
    };

    const { data: created, error } = await supabase
      .from("clients")
      .insert({
        name,
        industry: nullable("industry"),
        size: nullable("size"),
        notes: nullable("notes"),
        created_by: profile.id,
      })
      .select("id, name, industry, size, notes")
      .single();

    if (error || !created) {
      return { error: error?.message ?? "Could not create that client." };
    }

    await supabase
      .from("conversations")
      .update({ client_id: created.id, pending_client_link: null })
      .eq("id", conversationId);

    revalidatePath("/", "layout");
    return { client: created };
  }

  return { error: "Unknown action." };
}
