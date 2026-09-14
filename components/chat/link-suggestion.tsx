"use client";

import { GitMerge, Link2, SplitSquareHorizontal } from "lucide-react";
import { useTransition } from "react";

import { resolveClientLink } from "@/app/(consultant)/client-actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type {
  ClientLinkSuggestion,
  ClientPanelRecord,
} from "@/lib/chat/stream-protocol";

/**
 * Confirm before linking.
 *
 * Compass has noticed that the organization in this conversation resembles a
 * client it already has. It will not decide that on its own, because a wrong
 * merge folds two engagements' context into one record and cannot really be
 * undone. Both buttons are a deliberate choice; neither is a default.
 *
 * Both candidates are shown side by side, because the difference between
 * "Northwind Logistics" and "Northwind Logistics Ltd" is the whole question,
 * and a prompt that hides one of them is asking the reader to guess.
 */
export function LinkSuggestion({
  conversationId,
  suggestion,
  onResolved,
}: {
  conversationId: string;
  suggestion: ClientLinkSuggestion;
  onResolved: (client: ClientPanelRecord) => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const resolve = (intent: "link" | "separate") => {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("conversationId", conversationId);
      formData.set("intent", intent);
      formData.set("existingClientId", suggestion.existing.id);
      formData.set("name", suggestion.proposed.name);
      formData.set("industry", suggestion.proposed.industry ?? "");
      formData.set("size", suggestion.proposed.size ?? "");
      formData.set("notes", suggestion.proposed.notes ?? "");

      const result = await resolveClientLink(formData);
      if ("error" in result) {
        toast("error", result.error);
        return;
      }
      toast(
        "success",
        intent === "link"
          ? `Linked to ${result.client.name}.`
          : `Created ${result.client.name} as a separate client.`,
      );
      onResolved(result.client);
    });
  };

  return (
    <div className="mx-4 mb-4 rounded-xl border border-brass/30 bg-brass-tint p-3">
      <p className="flex items-center gap-1.5 text-xs font-medium text-brass-strong">
        <GitMerge className="h-3.5 w-3.5" aria-hidden="true" />
        {suggestion.exact
          ? "This client already exists"
          : "This may be an existing client"}
      </p>

      <p className="mt-1.5 text-xs leading-relaxed text-ink-muted">
        Nothing is linked yet. Compass will not merge these on its own.
      </p>

      <dl className="mt-2.5 flex flex-col gap-1.5 text-xs">
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 text-slate">In this thread</dt>
          <dd className="font-medium text-ink">{suggestion.proposed.name}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-20 shrink-0 text-slate">On record</dt>
          <dd className="font-medium text-ink">
            {suggestion.existing.name}
            {suggestion.existing.industry ? (
              <span className="block font-normal text-slate">
                {suggestion.existing.industry}
              </span>
            ) : null}
          </dd>
        </div>
      </dl>

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Button
          className="px-2.5 py-1 text-xs"
          disabled={pending}
          onClick={() => resolve("link")}
        >
          <Link2 className="h-3.5 w-3.5" aria-hidden="true" />
          Same client
        </Button>
        <Button
          variant="secondary"
          className="px-2.5 py-1 text-xs"
          disabled={pending}
          onClick={() => resolve("separate")}
        >
          <SplitSquareHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
          Different one
        </Button>
      </div>
    </div>
  );
}
