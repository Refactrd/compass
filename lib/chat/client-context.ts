import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { extractClientContext } from "@/lib/ai/extraction";
import type { Database } from "@/lib/types/database";

export type ClientRecord = {
  id: string;
  name: string;
  industry: string | null;
  size: string | null;
  notes: string | null;
};

/**
 * Runs extraction for a turn and persists the result.
 *
 * Client records are shared across consultants by design, so this creates or
 * updates a row anyone can later read and edit. What it will not do is
 * repoint a conversation at a different client on its own: linking two
 * conversations to the same client is the confirm-before-link flow on day 5,
 * and silently merging is exactly what CLAUDE.md rules out.
 *
 * Returns the record the panel should show, or null when the conversation has
 * not yet established anything worth recording.
 */
export async function syncClientContext({
  supabase,
  conversationId,
  userId,
  turns,
}: {
  supabase: SupabaseClient<Database, "compass">;
  conversationId: string;
  userId: string;
  turns: { role: "user" | "assistant"; content: string }[];
}): Promise<ClientRecord | null> {
  const { data: conversation } = await supabase
    .from("conversations")
    .select("client_id")
    .eq("id", conversationId)
    .maybeSingle();

  const linkedId = conversation?.client_id ?? null;

  let existing: ClientRecord | null = null;
  if (linkedId) {
    const { data } = await supabase
      .from("clients")
      .select("id, name, industry, size, notes")
      .eq("id", linkedId)
      .maybeSingle();
    existing = data ?? null;
  }

  const extracted = await extractClientContext({
    turns,
    existing: existing
      ? {
          name: existing.name,
          industry: existing.industry,
          size: existing.size,
          notes: existing.notes,
        }
      : null,
  });

  if (!extracted) return existing;

  // A record needs a name to be a client. Facts about an organization the
  // consultant has not named yet are held until they name it, rather than
  // creating a row called "a regional insurer" that nobody can find again.
  if (!extracted.name) return existing;

  if (existing) {
    // The consultant's own edits are not overwritten wholesale: only fields
    // extraction actually found are written back, so clearing a field by hand
    // is not undone by the next turn re-filling it from stale transcript.
    const patch: Database["compass"]["Tables"]["clients"]["Update"] = {};
    if (extracted.name !== existing.name) patch.name = extracted.name;
    if (extracted.industry && extracted.industry !== existing.industry) {
      patch.industry = extracted.industry;
    }
    if (extracted.size && extracted.size !== existing.size) {
      patch.size = extracted.size;
    }
    if (extracted.notes && extracted.notes !== existing.notes) {
      patch.notes = extracted.notes;
    }

    if (Object.keys(patch).length === 0) return existing;

    const { data: updated } = await supabase
      .from("clients")
      .update(patch)
      .eq("id", existing.id)
      .select("id, name, industry, size, notes")
      .maybeSingle();

    return updated ?? existing;
  }

  const { data: created, error } = await supabase
    .from("clients")
    .insert({
      name: extracted.name,
      industry: extracted.industry,
      size: extracted.size,
      notes: extracted.notes,
      created_by: userId,
    })
    .select("id, name, industry, size, notes")
    .single();

  if (error || !created) {
    console.error("[client-context] could not create client", error);
    return null;
  }

  await supabase
    .from("conversations")
    .update({ client_id: created.id })
    .eq("id", conversationId);

  return created;
}
