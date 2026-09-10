import { FileText, SearchX } from "lucide-react";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { DocumentRowActions } from "@/components/admin/document-row-actions";
import { DocumentUpload } from "@/components/admin/document-upload";
import { PageHeader, StatCard } from "@/components/admin/page-header";
import { Pagination, TableControls } from "@/components/admin/table-controls";
import { requireActiveAdmin } from "@/lib/auth/guards";
import { embeddingModel } from "@/lib/ai/embeddings";
import { createAdminClient } from "@/lib/supabase/admin";
import { cn } from "@/lib/utils";

export const metadata = { title: "Documents · Compass admin" };

const PAGE_SIZE = 10;

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "deactivated", label: "Deactivated" },
];

const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "title", label: "Title A to Z" },
];

const SORTS = {
  newest: { column: "uploaded_at", ascending: false },
  oldest: { column: "uploaded_at", ascending: true },
  title: { column: "title", ascending: true },
} as const;

type SearchParams = {
  q?: string;
  status?: string;
  sort?: string;
  page?: string;
};

export default async function AdminDocumentsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireActiveAdmin();
  const params = await searchParams;

  const query = (params.q ?? "").trim();
  const status = params.status === "active" || params.status === "deactivated"
    ? params.status
    : "all";
  const sortKey = (params.sort ?? "newest") as keyof typeof SORTS;
  const sort = SORTS[sortKey] ?? SORTS.newest;
  const page = Math.max(1, Number(params.page) || 1);

  const supabase = createAdminClient();

  // Filtering and paging happen in Postgres rather than the browser, so this
  // stays correct as the knowledge base grows and the page only ever ships one
  // screen of rows.
  //
  // Escaped wildcards: a title containing % should be searched for literally,
  // not treated as a pattern.
  const titlePattern = query
    ? `%${query.replace(/[%_]/g, (c) => `\\${c}`)}%`
    : null;

  // Counted separately from the page fetch. PostgREST answers a range starting
  // past the last row with 416 and no count, so asking the paged query how many
  // rows exist reports zero and the clamp below would never fire.
  //
  // The two queries below apply the same filters and must stay in step.
  let countQuery = supabase
    .from("documents")
    .select("id", { count: "exact", head: true });
  if (titlePattern) countQuery = countQuery.ilike("title", titlePattern);
  if (status !== "all") countQuery = countQuery.eq("status", status);

  const { count: matched } = await countQuery;
  const total = matched ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // A page number past the end is not the same thing as an empty filter, and
  // showing "nothing matches" there reads as though the search was at fault.
  // Happens on a stale bookmark, or after deleting the last row of a page.
  if (page > pageCount && total > 0) {
    const target = new URLSearchParams();
    if (query) target.set("q", query);
    if (status !== "all") target.set("status", status);
    if (sortKey !== "newest") target.set("sort", sortKey);
    if (pageCount > 1) target.set("page", String(pageCount));
    redirect(`/admin/documents${target.size ? `?${target}` : ""}`);
  }

  const from = (page - 1) * PAGE_SIZE;

  let listQuery = supabase
    .from("documents")
    .select("id, title, status, uploaded_at, storage_path");
  if (titlePattern) listQuery = listQuery.ilike("title", titlePattern);
  if (status !== "all") listQuery = listQuery.eq("status", status);

  const [{ data: documents }, { count: totalDocuments }, { count: chunkTotal }] =
    await Promise.all([
      listQuery
        .order(sort.column, { ascending: sort.ascending })
        .range(from, from + PAGE_SIZE - 1),
      supabase.from("documents").select("id", { count: "exact", head: true }),
      supabase
        .from("document_chunks")
        .select("id", { count: "exact", head: true }),
    ]);

  const rows = documents ?? [];

  // Chunk counts only for the rows on screen, so this stays a bounded query
  // no matter how large the library gets.
  const chunkCounts = new Map<string, number>();
  if (rows.length > 0) {
    const { data: chunks } = await supabase
      .from("document_chunks")
      .select("document_id")
      .in("document_id", rows.map((d) => d.id));
    for (const chunk of chunks ?? []) {
      chunkCounts.set(
        chunk.document_id,
        (chunkCounts.get(chunk.document_id) ?? 0) + 1,
      );
    }
  }

  const activeCount = await supabase
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("status", "active");

  const isFiltering = query !== "" || status !== "all";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Documents"
        description="Refactrd source material. Each upload is read, split into chunks and embedded so answers can cite it. Deactivate to take a document out of retrieval without losing it."
        action={<DocumentUpload />}
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Active"
          value={activeCount.count ?? 0}
          hint="Available to retrieval"
        />
        <StatCard
          label="Chunks"
          value={chunkTotal ?? 0}
          hint="Embedded passages across all documents"
        />
        <StatCard
          label="Model"
          value={embeddingModel()}
          hint="1024 dimensions, cosine distance"
        />
      </div>

      {(totalDocuments ?? 0) === 0 ? (
        <EmptyState
          icon={<FileText className="h-5 w-5" aria-hidden="true" />}
          title="The knowledge base is empty"
          body="Until something is ingested, answers will say plainly that they are unsourced. Upload the methodology material you want consultants reasoning from."
        />
      ) : (
        <div className="flex flex-col gap-4">
          <Suspense fallback={null}>
            <TableControls
              statusOptions={STATUS_OPTIONS}
              sortOptions={SORT_OPTIONS}
              searchPlaceholder="Search by title"
            />
          </Suspense>

          {rows.length === 0 ? (
            <EmptyState
              icon={<SearchX className="h-5 w-5" aria-hidden="true" />}
              title="Nothing matches those filters"
              body={
                query
                  ? `No document title contains "${query}".`
                  : "No document has that status."
              }
            />
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-surface">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[40rem] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left">
                      <Th>Title</Th>
                      <Th>Status</Th>
                      <Th>Chunks</Th>
                      <Th>Ingested</Th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((document) => (
                      <tr
                        key={document.id}
                        className="border-b border-border last:border-b-0"
                      >
                        <td className="max-w-sm px-4 py-3">
                          <p className="font-medium text-ink">{document.title}</p>
                          <p className="mt-0.5 truncate text-xs text-slate-light">
                            {document.storage_path.split("/").pop()}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              "inline-block rounded-md border px-2 py-0.5 text-xs font-medium capitalize",
                              document.status === "active"
                                ? "border-brass/30 bg-brass-tint text-brass-strong"
                                : "border-border-strong bg-surface-sunken text-slate",
                            )}
                          >
                            {document.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate tabular-nums">
                          {chunkCounts.get(document.id) ?? 0}
                        </td>
                        <td className="px-4 py-3 text-slate tabular-nums">
                          {new Date(document.uploaded_at).toLocaleDateString(
                            undefined,
                            { day: "numeric", month: "short", year: "numeric" },
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <DocumentRowActions
                            documentId={document.id}
                            title={document.title}
                            status={document.status}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <Suspense fallback={null}>
            <Pagination
              page={Math.min(page, pageCount)}
              pageCount={pageCount}
              total={total}
              from={total === 0 ? 0 : from + 1}
              to={Math.min(from + PAGE_SIZE, total)}
              noun={isFiltering ? "matching documents" : "documents"}
            />
          </Suspense>
        </div>
      )}

      <p className="text-xs leading-relaxed text-slate-light">
        Files are stored in a private bucket and are never served by public URL.
        Only admins can upload, deactivate or delete. Consultants can read
        document titles so answers can name their sources.
      </p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-4 py-3 text-xs font-semibold tracking-[0.08em] text-slate uppercase">
      {children}
    </th>
  );
}

function EmptyState({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border-strong bg-surface p-10 text-center">
      <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-surface-sunken text-slate">
        {icon}
      </div>
      <h2 className="font-display mt-3 text-lg font-semibold text-ink">
        {title}
      </h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-slate">
        {body}
      </p>
    </div>
  );
}
