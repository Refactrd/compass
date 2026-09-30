"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  generateComprehensiveReport,
  type ReportActionState,
} from "@/app/(consultant)/engagements/actions";
import { Button } from "@/components/ui/button";
import { useActionToast } from "@/components/ui/toast";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      {pending ? "Generating (this can take a minute)" : "Generate Comprehensive Report"}
    </Button>
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

  return (
    <div className="flex items-center gap-3">
      <form action={formAction}>
        <input type="hidden" name="engagementId" value={engagementId} />
        <Submit />
      </form>
      {reportPath ? (
        <a
          href={`/api/engagements/${engagementId}/report`}
          download="comprehensive-report.pdf"
          className="text-sm font-medium text-brass hover:underline"
        >
          Download report
        </a>
      ) : null}
    </div>
  );
}
