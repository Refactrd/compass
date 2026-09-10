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

  return (
    <WorkspaceShell
      profile={profile}
      theme={theme}
      conversations={conversations ?? []}
    >
      {children}
    </WorkspaceShell>
  );
}
