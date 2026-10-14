"use client";

import { CheckCircle2, Download, RefreshCw } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  generateComprehensiveReport,
  type ReportActionState,
} from "@/app/(consultant)/engagements/actions";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useActionToast } from "@/components/ui/toast";

function GenerateSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      {pending ? "Generating (this can take a minute)" : "Generate Comprehensive Report"}
    </Button>
  );
}

/** Small icon-only redo trigger once a report already exists, same pattern
 * as RedoButton in department-workspace.tsx: a report that already exists
 * does not need a full-size "Generate" button sitting at equal visual
 * weight beside Download and Preview, which are what actually matter once
 * there is one to act on. */
function RegenerateButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label="Regenerate the Comprehensive Report"
      title="Regenerate the Comprehensive Report"
      className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-slate-light transition-colors hover:bg-surface-sunken hover:text-ink disabled:cursor-not-allowed"
    >
      {pending ? <Spinner className="h-3 w-3" /> : <RefreshCw className="h-3 w-3" aria-hidden="true" />}
    </button>
  );
}

export function ComprehensiveReportButton({
  engagementId,
  initialReportPath,
}: {
  engagementId: string;
  initialReportPath: string | null;
}) {
  const [state, formAction] = useActionState<ReportActionState, FormData>(
    generateComprehensiveReport,
    null,
  );
  useActionToast(state);

  const reportPath = state && "reportPath" in state ? state.reportPath : initialReportPath;
  const reportUrl = `/api/engagements/${engagementId}/report`;

  if (!reportPath) {
    return (
      <form action={formAction}>
        <input type="hidden" name="engagementId" value={engagementId} />
        <GenerateSubmit />
      </form>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <form action={formAction} className="flex items-center gap-1.5">
        <input type="hidden" name="engagementId" value={engagementId} />
        <CheckCircle2 className="h-3.5 w-3.5 text-brass-strong" aria-hidden="true" />
        <span className="text-xs text-slate">Report ready</span>
        <RegenerateButton />
      </form>
      <a
        href={reportUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="text-sm font-medium text-brass hover:underline"
      >
        Preview
      </a>
      <a
        href={reportUrl}
        download="comprehensive-report.pdf"
        className="flex items-center gap-1.5 text-sm font-medium text-slate hover:text-ink"
      >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        Download
      </a>
    </div>
  );
}
