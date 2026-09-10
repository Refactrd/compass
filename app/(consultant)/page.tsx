import { ChatPanel } from "@/components/chat/chat-panel";
import { requireActiveMember } from "@/lib/auth/guards";

export const metadata = { title: "Compass" };

/** A conversation that does not exist yet. Sending the first message creates it. */
export default async function NewConversationPage() {
  const profile = await requireActiveMember();
  return <ChatPanel
      conversationId={null}
      initialMessages={[]}
      email={profile.email}
      initialClient={null}
    />;
}
