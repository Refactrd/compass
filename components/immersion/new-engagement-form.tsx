"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { useActionState, useState } from "react";

import {
  createEngagement,
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

type Step = "client" | "department";

/**
 * A Typeform-style two-question flow rather than one plain form: one big
 * question at a time, animated between them, with suggestion chips a
 * consultant can just click rather than typing on both questions most of
 * the time. Redesigned after a real day 12 dry run found the original
 * two-field form "just there," and asked for department names to be
 * pickable rather than freehand every time.
 *
 * No hidden inputs mirroring state into a native form submission: the chip
 * click and the "submit" are the same click, and a controlled input's DOM
 * value is not guaranteed to reflect a same-tick setState before a native
 * submit fires. formAction (useActionState's dispatcher) is called directly
 * with a manually built FormData instead, which is exactly what React does
 * internally for a real <form action> and sidesteps the timing entirely.
 */
export function NewEngagementForm({
  clients,
}: {
  clients: { id: string; name: string }[];
}) {
  const [state, formAction, isPending] = useActionState<NavActionState, FormData>(
    createEngagement,
    null,
  );
  useActionToast(state);

  const [step, setStep] = useState<Step>("client");
  const [clientQuery, setClientQuery] = useState("");
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [departmentQuery, setDepartmentQuery] = useState("");

  const matchingClients = clients.filter((client) =>
    client.name.toLowerCase().includes(clientQuery.trim().toLowerCase()),
  );

  const chooseExistingClient = (client: { id: string; name: string }) => {
    setSelectedClientId(client.id);
    setClientQuery(client.name);
    setStep("department");
  };

  const confirmNewClient = () => {
    if (!clientQuery.trim()) return;
    setSelectedClientId(null);
    setStep("department");
  };

  const submit = (departmentName: string) => {
    if (!departmentName.trim()) return;
    const formData = new FormData();
    if (selectedClientId) {
      formData.set("clientId", selectedClientId);
    } else {
      formData.set("newClientName", clientQuery.trim());
    }
    formData.set("departmentName", departmentName.trim());
    formAction(formData);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-1.5">
        {(["client", "department"] as Step[]).map((s) => (
          <span
            key={s}
            className={`h-1.5 w-8 rounded-full transition-colors ${
              step === s ? "bg-brass" : "bg-border"
            }`}
          />
        ))}
      </div>

      <AnimatePresence mode="wait">
        {step === "client" ? (
          <motion.div
            key="client"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-4"
          >
            <h2 className="font-display text-xl font-bold text-ink">Who&apos;s the client?</h2>

            <Input
              autoFocus
              value={clientQuery}
              onChange={(event) => {
                setClientQuery(event.target.value);
                setSelectedClientId(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  const exact = clients.find(
                    (c) => c.name.toLowerCase() === clientQuery.trim().toLowerCase(),
                  );
                  if (exact) chooseExistingClient(exact);
                  else confirmNewClient();
                }
              }}
              placeholder="Type a client name..."
              className="text-base"
            />

            {clientQuery.trim() && matchingClients.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs text-slate">Or pick one you&apos;ve worked with:</p>
                <div className="flex flex-wrap gap-2">
                  {matchingClients.slice(0, 8).map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      onClick={() => chooseExistingClient(client)}
                      className="rounded-full border border-border-strong bg-surface px-3 py-1.5 text-sm text-ink transition-colors hover:border-brass hover:bg-brass-tint"
                    >
                      {client.name}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div>
              <Button
                type="button"
                onClick={confirmNewClient}
                disabled={!clientQuery.trim()}
              >
                Continue
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="department"
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -24 }}
            transition={{ duration: 0.2 }}
            className="flex flex-col gap-4"
          >
            <div>
              <button
                type="button"
                onClick={() => setStep("client")}
                className="mb-2 flex items-center gap-1 text-xs text-slate hover:text-ink"
              >
                <ArrowLeft className="h-3 w-3" aria-hidden="true" />
                {clientQuery}
              </button>
              <h2 className="font-display text-xl font-bold text-ink">
                Which department are you starting with?
              </h2>
            </div>

            {/* Click selects, it does not submit: a real dry run expected a
                separate confirm step ("why can't I select it and click
                proceed") rather than a single click immediately creating the
                department. The Start button below is now the one place that
                actually submits, for a chip or for freehand text alike. */}
            <div className="flex flex-wrap gap-2">
              {DEPARTMENT_SUGGESTIONS.map((name) => (
                <button
                  key={name}
                  type="button"
                  disabled={isPending}
                  onClick={() => setDepartmentQuery(name)}
                  aria-pressed={departmentQuery === name}
                  className={`rounded-full border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${
                    departmentQuery === name
                      ? "border-brass bg-brass-tint text-brass-strong"
                      : "border-border-strong bg-surface text-ink hover:border-brass hover:bg-brass-tint"
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>

            <p className="text-xs text-slate">Or name it yourself:</p>
            <div className="flex items-center gap-2">
              <Input
                value={departmentQuery}
                onChange={(event) => setDepartmentQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    submit(departmentQuery);
                  }
                }}
                placeholder="e.g. Warehouse Receiving"
                className="text-base"
              />
              <Button
                type="button"
                loading={isPending}
                disabled={!departmentQuery.trim()}
                onClick={() => submit(departmentQuery)}
              >
                {isPending ? "Starting" : "Start"}
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
