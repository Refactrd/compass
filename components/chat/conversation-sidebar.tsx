"use client";

import {
  MessageSquarePlus,
  PanelLeftClose,
  Search,
  Shield,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { deleteConversation } from "@/app/(consultant)/actions";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { LiveClock } from "@/components/ui/live-clock";
import { Logo } from "@/components/ui/logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useToast } from "@/components/ui/toast";
import type { SessionProfile } from "@/lib/supabase/server";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

export type ConversationSummary = {
  id: string;
  title: string | null;
  updated_at: string;
};

/**
 * Conversation history.
 *
 * Search filters on the client because the list is one consultant's own
 * conversations, which is small enough that a round trip per keystroke would be
 * slower and worse than filtering in place. The documents table is server
 * filtered for the opposite reason.
 */
export function ConversationSidebar({
  conversations,
  profile,
  theme,
  onClose,
}: {
  conversations: ConversationSummary[];
  profile: SessionProfile;
  theme: Theme;
  onClose?: () => void;
}) {
  const params = useParams<{ conversationId?: string }>();
  const router = useRouter();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [pendingDelete, setPendingDelete] = useState<ConversationSummary | null>(
    null,
  );
  const [, startTransition] = useTransition();

  const groups = useMemo(() => groupByRecency(conversations, query), [
    conversations,
    query,
  ]);

  const isEmpty = conversations.length === 0;
  const noMatches = !isEmpty && groups.every((g) => g.items.length === 0);

  return (
    <div className="flex h-full flex-col bg-surface-sunken">
      <div className="flex items-center justify-between px-4 py-3.5">
        <Link href="/" aria-label="Compass">
          <Logo width={104} />
        </Link>
        {onClose ? (
          <Button
            variant="ghost"
            className="px-2 py-2 lg:hidden"
            onClick={onClose}
            aria-label="Close sidebar"
          >
            <PanelLeftClose className="h-4 w-4" aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      <div className="px-3 pb-2">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm font-medium text-brass-strong transition-colors hover:bg-surface"
        >
          <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
          New
        </Link>
      </div>

      {!isEmpty ? (
        <div className="px-3 pb-2">
          <div className="relative flex items-center">
            <Search
              className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-slate-light"
              aria-hidden="true"
            />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search"
              aria-label="Search conversations"
              className="w-full rounded-lg border border-transparent bg-surface/70 py-1.5 pr-2.5 pl-8 text-sm text-ink placeholder:text-slate-light focus:border-border-strong focus:bg-surface focus:outline-none"
            />
          </div>
        </div>
      ) : null}

      <nav className="flex-1 overflow-y-auto px-2 pb-3">
        {isEmpty ? (
          <p className="px-2 py-6 text-xs leading-relaxed text-slate">
            Nothing here yet. Describe a client situation and Compass will keep
            the thread.
          </p>
        ) : noMatches ? (
          <p className="px-2 py-6 text-xs leading-relaxed text-slate">
            No conversation title matches {`"${query}"`}.
          </p>
        ) : (
          groups.map((group) =>
            group.items.length === 0 ? null : (
              <div key={group.label} className="mb-3">
                <p className="px-2 pt-3 pb-1 text-xs font-medium text-slate-light">
                  {group.label}
                </p>
                <ul>
                  {group.items.map((conversation) => {
                    const active = params.conversationId === conversation.id;
                    return (
                      <li key={conversation.id} className="group/row relative">
                        <Link
                          href={`/c/${conversation.id}`}
                          className={cn(
                            "block truncate rounded-lg py-1.5 pr-9 pl-2 text-sm transition-colors",
                            active
                              ? "bg-surface text-ink"
                              : "text-ink-muted hover:bg-surface/70 hover:text-ink",
                          )}
                          title={conversation.title ?? "Untitled conversation"}
                        >
                          {conversation.title ?? "Untitled conversation"}
                        </Link>
                        <button
                          type="button"
                          onClick={() => setPendingDelete(conversation)}
                          aria-label={`Delete ${conversation.title ?? "conversation"}`}
                          title="Delete conversation"
                          className="absolute top-1 right-1 rounded-md p-1.5 text-slate-light opacity-0 transition-opacity group-hover/row:opacity-100 focus-visible:opacity-100 hover:text-danger"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ),
          )
        )}
      </nav>

      <div className="flex flex-col gap-3 border-t border-border/60 px-4 py-3.5">
        {profile.role === "admin" ? (
          <Link
            href="/admin"
            className="flex items-center gap-2 text-xs text-slate transition-colors hover:text-ink"
          >
            <Shield className="h-3.5 w-3.5" aria-hidden="true" />
            Admin dashboard
          </Link>
        ) : null}

        <p className="text-xs text-slate-light">
          <LiveClock />
        </p>

        <ThemeToggle theme={theme} compact />

        <div className="border-t border-border pt-3">
          <p className="truncate text-xs font-medium text-ink" title={profile.email}>
            {profile.email}
          </p>
          <form action="/auth/signout" method="post" className="mt-1.5">
            <Button type="submit" variant="ghost" className="px-0 py-0 text-xs">
              Sign out
            </Button>
          </form>
        </div>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        onClose={() => setPendingDelete(null)}
        action={(formData) => {
          const target = pendingDelete;
          setPendingDelete(null);
          startTransition(async () => {
            const result = await deleteConversation(formData);
            if (result?.error) {
              toast("error", result.error);
              return;
            }
            toast("success", "Conversation deleted.");
            if (params.conversationId === target?.id) router.push("/");
            else router.refresh();
          });
        }}
        heading="Delete this conversation?"
        description="The whole thread goes with it, and nobody else could see it anyway. This cannot be undone."
        confirmValue="delete"
        confirmLabel="Delete conversation"
      >
        <input type="hidden" name="conversationId" value={pendingDelete?.id ?? ""} />
      </ConfirmDialog>
    </div>
  );
}

type Group = { label: string; items: ConversationSummary[] };

/**
 * Buckets by recency the way the design calls for, rather than one flat list.
 * A consultant looking for yesterday's thread scans a short group, not fifty
 * rows.
 */
function groupByRecency(
  conversations: ConversationSummary[],
  query: string,
): Group[] {
  const needle = query.trim().toLowerCase();
  const filtered = needle
    ? conversations.filter((c) =>
        (c.title ?? "").toLowerCase().includes(needle),
      )
    : conversations;

  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const day = 86_400_000;

  const groups: Group[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Previous 7 days", items: [] },
    { label: "Older", items: [] },
  ];

  for (const conversation of filtered) {
    const at = new Date(conversation.updated_at).getTime();
    if (at >= startOfToday) groups[0].items.push(conversation);
    else if (at >= startOfToday - day) groups[1].items.push(conversation);
    else if (at >= startOfToday - 7 * day) groups[2].items.push(conversation);
    else groups[3].items.push(conversation);
  }

  return groups;
}
