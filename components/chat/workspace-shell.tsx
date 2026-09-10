"use client";

import { PanelLeftOpen } from "lucide-react";
import { useState } from "react";

import {
  ConversationSidebar,
  type ConversationSummary,
} from "@/components/chat/conversation-sidebar";
import { Button } from "@/components/ui/button";
import type { SessionProfile } from "@/lib/supabase/server";
import type { Theme } from "@/lib/theme";
import { cn } from "@/lib/utils";

/**
 * Two-column workspace: history on the left, conversation on the right.
 *
 * The sidebar is permanent from lg up and a drawer below it. Client-side only
 * because it holds the drawer's open state; everything it renders is passed
 * down from the server layout.
 */
export function WorkspaceShell({
  profile,
  theme,
  conversations,
  children,
}: {
  profile: SessionProfile;
  theme: Theme;
  conversations: ConversationSummary[];
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex h-dvh overflow-hidden">
      <aside className="hidden w-72 shrink-0 lg:block">
        <ConversationSidebar
          conversations={conversations}
          profile={profile}
          theme={theme}
        />
      </aside>

      {/* Drawer for narrow viewports. */}
      <div
        className={cn(
          "fixed inset-0 z-40 lg:hidden",
          open ? "pointer-events-auto" : "pointer-events-none",
        )}
      >
        <div
          className={cn(
            "absolute inset-0 bg-ink/40 transition-opacity",
            open ? "opacity-100" : "opacity-0",
          )}
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
        <div
          className={cn(
            "absolute inset-y-0 left-0 w-72 transition-transform duration-200",
            open ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <ConversationSidebar
            conversations={conversations}
            profile={profile}
            theme={theme}
            onClose={() => setOpen(false)}
          />
        </div>
      </div>

      <main className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-2 border-b border-border px-3 py-2 lg:hidden">
          <Button
            variant="ghost"
            className="px-2 py-2"
            onClick={() => setOpen(true)}
            aria-label="Open conversations"
          >
            <PanelLeftOpen className="h-4 w-4" aria-hidden="true" />
          </Button>
          <span className="font-display text-sm font-semibold text-ink">
            Compass
          </span>
        </div>

        <div className="min-h-0 flex-1">{children}</div>
      </main>
    </div>
  );
}
