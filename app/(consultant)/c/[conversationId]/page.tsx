import { notFound } from "next/navigation";

import { ChatPanel } from "@/components/chat/chat-panel";
import { requireActiveMember } from "@/lib/auth/guards";
import { getUsage } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const profile = await requireActiveMember();
  const { conversationId } = await params;

  const supabase = await createClient();

  // RLS turns someone else's conversation into a 404 rather than a 403, which
  // is the right answer: whether it exists is not their business either.
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, title, client_id, pending_client_link")
    .eq("id", conversationId)
    .maybeSingle();

  if (!conversation) notFound();

  const usage = await getUsage(supabase, profile.id);

  // Rehydrated from the row so a refresh does not lose an unanswered
  // confirm-before-link prompt.
  const pending = conversation.pending_client_link;
  const { data: pendingExisting } = pending
    ? await supabase
        .from("clients")
        .select("id, name, industry, size, notes")
        .eq("id", pending.existingClientId)
        .maybeSingle()
    : { data: null };

  const suggestion =
    pending && pendingExisting
      ? { proposed: pending.proposed, existing: pendingExisting, exact: false }
      : null;

  const { data: client } = conversation.client_id
    ? await supabase
        .from("clients")
        .select("id, name, industry, size, notes")
        .eq("id", conversation.client_id)
        .maybeSingle()
    : { data: null };

  const { data: messages } = await supabase
    .from("messages")
    .select("id, role, content, source_chunk_ids")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  const rows = messages ?? [];

  // Chunk ids are stored on the message; the titles a reader needs live on the
  // document. Resolved here in one query for the whole thread rather than
  // denormalising titles onto every message.
  const referenced = [
    ...new Set(rows.flatMap((m) => m.source_chunk_ids ?? [])),
  ];

  // Two plain queries rather than a PostgREST embed: the hand-maintained
  // Database type carries no relationship metadata, and adding it by hand is a
  // worse trade than one extra round trip on a page load.
  const titleByChunk = new Map<string, string>();
  if (referenced.length > 0) {
    const { data: chunks } = await supabase
      .from("document_chunks")
      .select("id, document_id")
      .in("id", referenced);

    const documentIds = [...new Set((chunks ?? []).map((c) => c.document_id))];
    const { data: documents } = await supabase
      .from("documents")
      .select("id, title")
      .in("id", documentIds);

    const titleByDocument = new Map(
      (documents ?? []).map((d) => [d.id, d.title]),
    );
    for (const chunk of chunks ?? []) {
      const title = titleByDocument.get(chunk.document_id);
      if (title) titleByChunk.set(chunk.id, title);
    }
  }

  return (
    <ChatPanel
      conversationId={conversation.id}
      initialMessages={rows.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        sourceTitles:
          message.role === "assistant"
            ? [
                ...new Set(
                  (message.source_chunk_ids ?? [])
                    .map((id) => titleByChunk.get(id))
                    .filter((title): title is string => Boolean(title)),
                ),
              ]
            : undefined,
      }))}
      email={profile.email}
      initialClient={client}
      initialSuggestion={suggestion}
      initialUsage={usage}
    />
  );
}
