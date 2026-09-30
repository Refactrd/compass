"use client";

import { motion } from "motion/react";
import { ChevronRight, type LucideIcon } from "lucide-react";

export function ResultCard({
  icon: Icon,
  title,
  detail,
  onClick,
}: {
  icon: LucideIcon;
  title: string;
  detail: string;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3.5 text-left transition-colors hover:border-brass/40 hover:bg-brass-tint/40"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brass-tint text-brass-strong">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-ink">{title}</span>
        <span className="block text-xs text-slate">{detail}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-slate-light" aria-hidden="true" />
    </motion.button>
  );
}
