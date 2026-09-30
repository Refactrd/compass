"use client";

import { AnimatePresence, motion } from "motion/react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

export type ResultPanelTab = {
  id: string;
  label: string;
  content: React.ReactNode;
};

/**
 * The artifact-style side panel: results dock on the right instead of
 * stacking inline and pushing the page to an unscrollable height, the
 * problem a real day 12 dry run surfaced directly. Docked at a fixed width
 * by default, expandable to near-full width for a closer look, same shape
 * as Claude's own artifact panel.
 *
 * A slide-over, not a real split layout: it overlays rather than reflowing
 * the transcript form and buttons underneath. Simpler to get right, and the
 * transcript is never needed on screen at the same time as a result anyway,
 * a consultant reviewing a diagram isn't also mid-paste.
 */
export function ResultPanel({
  open,
  onClose,
  tabs,
  activeTabId,
  onTabChange,
}: {
  open: boolean;
  onClose: () => void;
  tabs: ResultPanelTab[];
  activeTabId: string;
  onTabChange: (id: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const activeTab = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];

  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-40 bg-ink/10 lg:hidden"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            key="panel"
            className={cn(
              "fixed inset-y-0 right-0 z-50 flex flex-col border-l border-border bg-surface shadow-raised",
              "w-full sm:w-[min(560px,90vw)]",
              expanded && "sm:w-[calc(100vw-280px)]",
            )}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
          >
            <div className="flex items-center gap-1 border-b border-border px-3 py-2.5">
              <div className="flex flex-1 items-center gap-1 overflow-x-auto">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => onTabChange(tab.id)}
                    className={cn(
                      "shrink-0 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                      tab.id === activeTabId
                        ? "bg-brass-tint text-brass-strong"
                        : "text-slate hover:bg-surface-sunken hover:text-ink",
                    )}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setExpanded((current) => !current)}
                aria-label={expanded ? "Shrink panel" : "Expand panel"}
                className="hidden shrink-0 rounded-md p-1.5 text-slate hover:bg-surface-sunken hover:text-ink sm:block"
              >
                {expanded ? (
                  <Minimize2 className="h-3.5 w-3.5" aria-hidden="true" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close panel"
                className="shrink-0 rounded-md p-1.5 text-slate hover:bg-surface-sunken hover:text-ink"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">{activeTab?.content}</div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
