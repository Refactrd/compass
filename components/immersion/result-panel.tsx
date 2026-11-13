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
 * The tab bar reads as the story of the department, in order: where they
 * are, what we found, where they are going, what we recommend, the PDF.
 * Numbered so the sequence is obvious at a glance, with one animated
 * underline marking the active tab rather than a filled pill per tab.
 */

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
  title,
  subtitle,
}: {
  open: boolean;
  onClose: () => void;
  tabs: ResultPanelTab[];
  activeTabId: string;
  onTabChange: (id: string) => void;
  /** The department name, shown above the tabs. */
  title?: string;
  subtitle?: string;
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
              "w-full sm:w-[min(640px,92vw)]",
              // Full viewport width, over the sidebar too, not stopping at
              // its edge: a real dry run expected "expand" to mean "give me
              // the whole screen," and this is a fixed overlay (z-50)
              // regardless, so there is nothing structural stopping it.
              expanded && "sm:w-screen",
            )}
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
          >
            <div className="border-b border-border bg-surface">
              <div className="flex items-start gap-2 px-5 pt-4">
                <div className="min-w-0 flex-1">
                  {subtitle ? (
                    <p className="text-[11px] font-medium uppercase tracking-[0.12em] text-slate">
                      {subtitle}
                    </p>
                  ) : null}
                  {title ? (
                    <p className="truncate font-display text-lg font-semibold text-ink">{title}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setExpanded((current) => !current)}
                  aria-label={expanded ? "Shrink panel" : "Expand panel"}
                  className="hidden shrink-0 rounded-md p-2 text-slate transition-colors hover:bg-surface-sunken hover:text-ink sm:block"
                >
                  {expanded ? (
                    <Minimize2 className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <Maximize2 className="h-4 w-4" aria-hidden="true" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Close panel"
                  className="shrink-0 rounded-md p-2 text-slate transition-colors hover:bg-surface-sunken hover:text-ink"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <div
                role="tablist"
                aria-label="Department results"
                className="mt-2 flex gap-1 overflow-x-auto px-3 [scrollbar-width:none]"
              >
                {tabs.map((tab, index) => {
                  const active = tab.id === activeTabId;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      role="tab"
                      aria-selected={active}
                      onClick={() => onTabChange(tab.id)}
                      className={cn(
                        "relative flex shrink-0 items-center gap-2 rounded-t-md px-3 pb-3 pt-2 text-[13px] font-medium transition-colors",
                        active ? "text-ink" : "text-slate hover:text-ink",
                      )}
                    >
                      <span
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold tabular-nums transition-colors",
                          active ? "bg-ink text-white" : "bg-surface-sunken text-slate",
                        )}
                      >
                        {index + 1}
                      </span>
                      {tab.label}
                      {active ? (
                        <motion.span
                          layoutId="result-panel-tab-underline"
                          className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-brass"
                          transition={{ type: "spring", damping: 30, stiffness: 380 }}
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div role="tabpanel" className="flex-1 overflow-y-auto bg-[#fbfbfb]">
              {activeTab?.content}
            </div>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
