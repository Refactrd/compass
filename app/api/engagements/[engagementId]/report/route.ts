import { NextResponse, type NextRequest } from "next/server";

import { requireActiveMember } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

/**
 * Streams the generated Comprehensive Report. Same shape as the department
 * PDF route: the RLS-scoped client, compass-reports' select policy (shared
 * read for any active member) is what actually decides who may download it.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ engagementId: string }> },
) {
  await requireActiveMember();
  const { engagementId } = await params;

  const supabase = await createClient();
  const { data: engagement } = await supabase
    .from("engagements")
    .select("report_storage_path, clients(name)")
    .eq("id", engagementId)
    .maybeSingle();

  if (!engagement?.report_storage_path) {
    return NextResponse.json({ error: "No report has been generated yet." }, { status: 404 });
  }

  const { data, error } = await supabase.storage
    .from("compass-reports")
    .download(engagement.report_storage_path);

  if (error || !data) {
    return NextResponse.json({ error: "Could not retrieve the report." }, { status: 404 });
  }

  const client = (engagement as unknown as { clients: { name: string } | null }).clients;
  const filename = `${(client?.name ?? "client").replace(/[^a-zA-Z0-9]+/g, "-")}-comprehensive-report.pdf`;

  return new NextResponse(data, {
    headers: {
      "Content-Type": "application/pdf",
      // "inline": see the department PDF route for why, same fix.
      "Content-Disposition": `inline; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
