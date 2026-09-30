import { WorkspaceShell } from "@/components/chat/workspace-shell";
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

  // Engagements are shared (migration 0007), not per-user like conversations,
  // so this is every active member's immersion days, not just this
  // consultant's own. Restricted to in_progress and non-archived: a real
  // dry run flagged that a flat "5 most recent regardless of status" list
  // cramps up the moment a few immersion days finish, when in practice there
  // is rarely more than one or two actually in flight at once. Completed and
  // archived ones stay reachable at /engagements instead of permanently
  // occupying sidebar space for work that is already done.
  const { data: engagements } = await supabase
    .from("engagements")
    .select("id, updated_at, clients(name)")
    .eq("status", "in_progress")
    .is("archived_at", null)
    .order("updated_at", { ascending: false })
    .limit(5);

  return (
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
  );
}
