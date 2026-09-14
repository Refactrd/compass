"use client";

import { Building2, PanelRightClose, Pencil } from "lucide-react";
import { useState, useTransition } from "react";

import { updateClientField } from "@/app/(consultant)/client-actions";
import { LinkSuggestion } from "@/components/chat/link-suggestion";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import type {
  ClientLinkSuggestion,
  ClientPanelRecord,
} from "@/lib/chat/stream-protocol";
import { cn } from "@/lib/utils";

type Field = "name" | "industry" | "size" | "notes";

const FIELDS: { key: Field; label: string; placeholder: string; multiline?: boolean }[] =
  [
    { key: "name", label: "Client", placeholder: "Not named yet" },
    { key: "industry", label: "Industry", placeholder: "Not established" },
    { key: "size", label: "Size", placeholder: "Not established" },
    {
      key: "notes",
      label: "Situation",
      placeholder: "Nothing recorded yet",
      multiline: true,
    },
  ];

/**
 * The client record for this conversation.
 *
 * A correction surface, not an input method. Nothing here has to be filled in:
 * the fields populate themselves from what the consultant says, and this is
 * where they fix what came out wrong.
 *
 * Every field is editable in place and saves on blur. Extraction only writes
 * fields it actually found, so a value cleared by hand is not silently refilled
 * from the transcript on the next turn.
 */
export function ContextPanel({
  client,
  suggestion,
  conversationId,
  onClientChange,
  onClose,
}: {
  client: ClientPanelRecord | null;
  suggestion: ClientLinkSuggestion | null;
  conversationId: string | null;
  /** Lifts a saved edit back to the owner of the record. */
  onClientChange: (client: ClientPanelRecord) => void;
  onClose?: () => void;
}) {
  return (
    <div className="flex h-full flex-col bg-surface-sunken">
      <div className="flex items-center justify-between px-4 py-3.5">
        <h2 className="flex items-center gap-2 text-sm font-medium text-ink">
          <Building2 className="h-4 w-4 text-slate-light" aria-hidden="true" />
          Client context
        </h2>
        {onClose ? (
          <Button
            variant="ghost"
            className="px-2 py-2 xl:hidden"
            onClick={onClose}
            aria-label="Close context panel"
          >
            <PanelRightClose className="h-4 w-4" aria-hidden="true" />
          </Button>
        ) : null}
      </div>

      {suggestion && conversationId ? (
        <LinkSuggestion
          conversationId={conversationId}
          suggestion={suggestion}
          onResolved={onClientChange}
        />
      ) : null}

      {!client && !suggestion ? (
        <p className="px-4 pb-4 text-xs leading-relaxed text-slate">
          Nothing recorded yet. Describe the organization in the conversation and
          Compass fills this in. You can correct anything it gets wrong.
        </p>
      ) : null}

      {client ? (
        <div className="flex flex-col gap-4 overflow-y-auto px-4 pb-4">
          {FIELDS.map((field) => (
            <EditableField
              key={field.key}
              clientId={client.id}
              field={field.key}
              label={field.label}
              placeholder={field.placeholder}
              multiline={field.multiline}
              value={client[field.key] ?? ""}
              onSaved={onClientChange}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function EditableField({
  clientId,
  field,
  label,
  placeholder,
  multiline,
  value,
  onSaved,
}: {
  clientId: string;
  field: Field;
  label: string;
  placeholder: string;
  multiline?: boolean;
  value: string;
  onSaved: (client: ClientPanelRecord) => void;
}) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [pending, startTransition] = useTransition();

  // The displayed value is always the prop. An earlier version kept a local
  // copy and resynced it when the prop changed, which fought its own save: the
  // parent had not been told about the edit, so the unchanged prop looked like
  // an external change and reverted the field a moment after it saved.
  const commit = () => {
    setEditing(false);
    const next = draft.trim();
    if (next === value.trim()) return;

    startTransition(async () => {
      const formData = new FormData();
      formData.set("clientId", clientId);
      formData.set("field", field);
      formData.set("value", next);

      const result = await updateClientField(formData);
      if ("error" in result) {
        toast("error", result.error);
        setDraft(value);
        return;
      }
      // The saved record flows back up and returns as a new `value`, so there
      // is exactly one source of truth for what this field says.
      onSaved(result.client);
    });
  };

  const shared =
    "w-full rounded-md border border-border-strong bg-surface px-2 py-1.5 text-sm text-ink focus:border-brass focus:outline-none";

  return (
    <div>
      <label
        htmlFor={`client-${field}`}
        className="text-xs font-medium tracking-[0.06em] text-slate uppercase"
      >
        {label}
      </label>

      {editing ? (
        multiline ? (
          <textarea
            id={`client-${field}`}
            autoFocus
            rows={5}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            className={cn(shared, "mt-1 resize-none")}
          />
        ) : (
          <input
            id={`client-${field}`}
            autoFocus
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                setDraft(value);
                setEditing(false);
              }
            }}
            className={cn(shared, "mt-1")}
          />
        )
      ) : (
        <button
          type="button"
          onClick={() => {
            setDraft(value);
            setEditing(true);
          }}
          className={cn(
            "group mt-1 flex w-full items-start gap-1.5 rounded-md border border-transparent px-2 py-1.5 text-left text-sm transition-colors hover:border-border hover:bg-surface",
            pending && "opacity-60",
          )}
        >
          <span
            className={cn(
              "flex-1 leading-relaxed whitespace-pre-wrap",
              value ? "text-ink" : "text-slate-light italic",
            )}
          >
            {value || placeholder}
          </span>
          <Pencil
            className="mt-0.5 h-3 w-3 shrink-0 text-slate-light opacity-0 transition-opacity group-hover:opacity-100"
            aria-hidden="true"
          />
          <span className="sr-only">Edit {label}</span>
        </button>
      )}
    </div>
  );
}
