import { AdminSidebar } from "@/components/admin/admin-sidebar";
import { requireActiveAdmin } from "@/lib/auth/guards";
import { getTheme } from "@/lib/theme";

/**
 * Admin dashboard shell: navigation rail on the left, scrolling content on the
 * right. The rail collapses to a horizontal strip below the lg breakpoint.
 *
 * Gated to role=admin; a consultant who guesses the URL is redirected to their
 * own workspace rather than shown a permission error. This guard produces the
 * redirect. The database enforces the same boundary independently, so a forged
 * request that skipped this layout entirely would still fail against RLS.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const theme = await getTheme();
  const profile = await requireActiveAdmin();

  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      <AdminSidebar profile={profile} theme={theme} />
      <div className="flex-1 lg:h-dvh lg:overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl px-6 py-8 lg:px-10">
          {children}
        </div>
      </div>
    </div>
  );
}
