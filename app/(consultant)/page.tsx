import { ChatPanel } from "@/components/chat/chat-panel";
import { requireActiveMember } from "@/lib/auth/guards";
import { getUsage } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Compass" };

/** A conversation that does not exist yet. Sending the first message creates it. */
export default async function NewConversationPage() {
  const profile = await requireActiveMember();
  const supabase = await createClient();
  const usage = await getUsage(supabase, profile.id);

  return (
    <ChatPanel
      conversationId={null}
      initialMessages={[]}
      email={profile.email}
      initialClient={null}
      initialSuggestion={null}
      initialUsage={usage}
    />
  );
}
