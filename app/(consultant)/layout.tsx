import { WorkspaceShell } from "@/components/chat/workspace-shell";
import { SessionExpiryBanner } from "@/components/ui/session-expiry-banner";
import { requireActiveMember } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { getTheme } from "@/lib/theme";

/**
 * Consultant workspace. Open to any active account, admins included, since an
 * admin is also a consultant here (CLAUDE.md, "Suggested project structure").
 *
 * The conversation list is fetched here rather than in each page so it survives
 * navigation between threads without refetching.
 */
export default async function ConsultantLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const theme = await getTheme();
  const profile = await requireActiveMember();

  // RLS restricts this to the caller's own conversations; no user_id filter is
  // needed, and adding one would imply the policy might not hold.
  const supabase = await createClient();
  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, title, updated_at")
    .order("updated_at", { ascending: false })
    .limit(200);

  // Engagements are shared data (migration 0007: any active member can open
  // any Engagement), but the sidebar is not a place to broadcast who is
  // working with whom. A real dry run flagged this directly: other
  // consultants' client names showing up here by default is a real
  // confidentiality concern in a consulting tool, not just visual noise, so
  // this is scoped to the signed-in consultant's own engagement, not
  // "every active member's." Still capped at a handful and restricted to
  // in_progress, non-archived: completed and archived ones stay reachable
  // at /engagements rather than permanently occupying sidebar space.
  const { data: engagements } = await supabase
    .from("engagements")
    .select("id, updated_at, clients(name)")
    .eq("consultant_id", profile.id)
    .eq("status", "in_progress")
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(5);

  return (
    <div className="flex h-dvh flex-col">
      <SessionExpiryBanner expiresAt={profile.sessionExpiresAt} />
      <div className="min-h-0 flex-1">
        <WorkspaceShell
          profile={profile}
          theme={theme}
          conversations={conversations ?? []}
          engagements={
            (engagements ?? []).map((e) => ({
              id: e.id,
              clientName:
                (e as unknown as { clients: { name: string } | null }).clients?.name ??
                "Unnamed client",
            }))
          }
        >
          {children}
        </WorkspaceShell>
      </div>
    </div>
  );
}
