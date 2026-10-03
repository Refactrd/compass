"use client";

import { useActionState, useState } from "react";

import {
  addDepartment,
  type NavActionState,
} from "@/app/(consultant)/engagements/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/field";
import { useActionToast } from "@/components/ui/toast";

const DEPARTMENT_SUGGESTIONS = [
  "Sales",
  "Marketing",
  "Customer Support",
  "Operations",
  "Finance",
  "HR",
  "IT & Engineering",
  "Product",
  "Logistics & Fulfillment",
  "Procurement",
];

/** Same clickable-suggestion pattern as the new-engagement flow's department
 * question, for the same reason: naming a department is almost always
 * picking from a short common list, not composing free text. */
export function AddDepartmentForm({ engagementId }: { engagementId: string }) {
  const [state, formAction, isPending] = useActionState<NavActionState, FormData>(
    addDepartment,
    null,
  );
  useActionToast(state);

  const [name, setName] = useState("");

  const submit = (departmentName: string) => {
    if (!departmentName.trim()) return;
    const formData = new FormData();
    formData.set("engagementId", engagementId);
    formData.set("name", departmentName.trim());
    formAction(formData);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Click selects, it does not submit, same fix and same reasoning as
          new-engagement-form.tsx's department question: a single click
          immediately creating the department left no room to change your
          mind before it was already in the engagement. */}
      <div className="flex flex-wrap gap-2">
        {DEPARTMENT_SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            disabled={isPending}
            onClick={() => setName(suggestion)}
            aria-pressed={name === suggestion}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
              name === suggestion
                ? "border-brass bg-brass-tint text-brass-strong"
                : "border-border-strong bg-surface text-ink hover:border-brass hover:bg-brass-tint"
            }`}
          >
            {suggestion}
          </button>
        ))}
      </div>

      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                submit(name);
              }
            }}
            placeholder="Or name it yourself"
            aria-label="Department name"
          />
        </div>
        <Button
          type="button"
          loading={isPending}
          disabled={!name.trim()}
          onClick={() => submit(name)}
        >
          {isPending ? "Adding" : "Add department"}
        </Button>
      </div>
    </div>
  );
}
