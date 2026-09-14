import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { extractClientContext } from "@/lib/ai/extraction";
import { findClientMatch } from "@/lib/chat/client-matching";
import type { Database } from "@/lib/types/database";

export type ClientRecord = {
  id: string;
  name: string;
  industry: string | null;
  size: string | null;
  notes: string | null;
};

/** An organization named in conversation that looks like an existing client. */
export type ClientLinkSuggestion = {
  /** Fields extracted from this conversation, not yet saved anywhere. */
  proposed: {
    name: string;
    industry: string | null;
    size: string | null;
    notes: string | null;
  };
  /** The existing record it resembles. */
  existing: ClientRecord;
  exact: boolean;
};

export type ContextSyncResult = {
  client: ClientRecord | null;
  suggestion: ClientLinkSuggestion | null;
  followUps: string[];
};

/**
 * Runs extraction for a turn, then either updates the linked client, creates a
 * new one, or raises a link suggestion for the consultant to confirm.
 *
 * The one thing it will never do is decide on its own that two conversations
 * are about the same organization. CLAUDE.md rules out silent auto-merge, and
 * a wrong merge is close to unrecoverable: two engagements' context becomes one
 * record and nobody can tell which facts came from which.
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
}): Promise<ContextSyncResult> {
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

  const { client: extracted, followUps } = await extractClientContext({
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

  if (!extracted || !extracted.name) {
    // Facts about an organization the consultant has not named yet are held
    // rather than filed under "a regional insurer", which nobody can find again.
    return { client: existing, suggestion: null, followUps };
  }

  const named = { ...extracted, name: extracted.name };

  if (existing) {
    return {
      client: await applyUpdates(supabase, existing, named),
      suggestion: null,
      followUps,
    };
  }

  // Nothing linked yet, so this may be an organization Compass already knows.
  const { data: candidates } = await supabase
    .from("clients")
    .select("id, name")
    .limit(500);

  const match = findClientMatch(named.name, candidates ?? []);

  if (match) {
    const { data: full } = await supabase
      .from("clients")
      .select("id, name, industry, size, notes")
      .eq("id", match.candidate.id)
      .maybeSingle();

    if (full) {
      // Persisted so the prompt survives a refresh. Without this the
      // conversation stays unlinked with nothing left on screen to resolve it.
      await supabase
        .from("conversations")
        .update({
          pending_client_link: {
            proposed: {
              name: named.name,
              industry: named.industry,
              size: named.size,
              notes: named.notes,
            },
            existingClientId: full.id,
          },
        })
        .eq("id", conversationId);

      return {
        client: null,
        suggestion: {
          proposed: {
            name: named.name,
            industry: named.industry,
            size: named.size,
            notes: named.notes,
          },
          existing: full,
          exact: match.exact,
        },
        followUps,
      };
    }
  }

  return {
    client: await createAndLink(supabase, conversationId, userId, named),
    suggestion: null,
    followUps,
  };
}

/**
 * Writes back only the fields extraction actually found, so a value the
 * consultant cleared by hand is not refilled from a stale transcript.
 */
async function applyUpdates(
  supabase: SupabaseClient<Database, "compass">,
  existing: ClientRecord,
  extracted: { name: string; industry: string | null; size: string | null; notes: string | null },
): Promise<ClientRecord> {
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

  const { data } = await supabase
    .from("clients")
    .update(patch)
    .eq("id", existing.id)
    .select("id, name, industry, size, notes")
    .maybeSingle();

  return data ?? existing;
}

async function createAndLink(
  supabase: SupabaseClient<Database, "compass">,
  conversationId: string,
  userId: string,
  extracted: { name: string; industry: string | null; size: string | null; notes: string | null },
): Promise<ClientRecord | null> {
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
