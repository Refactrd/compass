import { NextResponse, type NextRequest } from "next/server";

import { requireActiveMember } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";

/**
 * Streams a generated department PDF. The RLS-scoped client, not the admin
 * client: compass-reports' select policy (migration 0008, shared read for
 * any active member) is what actually decides who may download this, the
 * same as every other read in this app.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ departmentId: string }> },
) {
  await requireActiveMember();
  const { departmentId } = await params;

  const supabase = await createClient();
  const { data: department } = await supabase
    .from("departments")
    .select("name, pdf_storage_path")
    .eq("id", departmentId)
    .maybeSingle();

  if (!department?.pdf_storage_path) {
    return NextResponse.json({ error: "No PDF has been generated yet." }, { status: 404 });
  }

  const { data, error } = await supabase.storage
    .from("compass-reports")
    .download(department.pdf_storage_path);

  if (error || !data) {
    return NextResponse.json({ error: "Could not retrieve the PDF." }, { status: 404 });
  }

  const filename = `${department.name.replace(/[^a-zA-Z0-9]+/g, "-")}-opportunity-mapping.pdf`;

  return new NextResponse(data, {
    headers: {
      "Content-Type": "application/pdf",
      // "inline", not "attachment": this same URL backs both the side
      // panel's <iframe> preview and the explicit Download link. attachment
      // makes a browser refuse to render it inline at all, which is why the
      // preview showed nothing. The Download link forces the save instead,
      // via the HTML `download` attribute rather than a server-side header.
      "Content-Disposition": `inline; filename="${filename}"`,
      // Without this, a browser (or an intermediate cache) can serve an
      // earlier download from this same URL after the PDF is regenerated,
      // since nothing about the URL itself changes between generations. A
      // consultant re-downloading after fixing something in the transcript
      // must never get the stale version back.
      "Cache-Control": "no-store",
    },
  });
}
