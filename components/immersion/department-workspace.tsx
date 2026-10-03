"use client";

import {
  ArrowRightLeft,
  CheckCircle2,
  ChevronDown,
  Download,
  FileText,
  RefreshCw,
  Sparkles,
  Workflow,
} from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  completeDepartmentAndContinue,
  extractDepartmentWorkflow,
  finishEngagement,
  generateDepartmentOpportunities,
  generateDepartmentPdf,
  reviseDepartmentWorkflow,
  saveTranscriptDraft,
  type DepartmentActionState,
  type DraftActionState,
  type NavActionState,
  type OpportunityActionState,
  type PdfActionState,
} from "@/app/(consultant)/engagements/actions";
import { OpportunityMappingView } from "@/components/immersion/opportunity-mapping-view";
import { ResultCard } from "@/components/immersion/result-card";
import { ResultPanel, type ResultPanelTab } from "@/components/immersion/result-panel";
import { WorkflowDiagramView } from "@/components/immersion/workflow-diagram";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { useActionToast } from "@/components/ui/toast";
import type { Bottleneck } from "@/lib/immersion/bottleneck-extraction";
import type { WorkflowDiagram } from "@/lib/immersion/diagram-schema";
import type { OpportunityMapping } from "@/lib/immersion/opportunity-mapping";
import { computeWorkflowScore } from "@/lib/immersion/workflow-score";

function ExtractSubmit({ hasResultAlready }: { hasResultAlready: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      {pending
        ? "Reading the transcript"
        : hasResultAlready
          ? "Re-extract workflow"
          : "Extract workflow"}
    </Button>
  );
}

function ReviseSubmit({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" loading={pending} disabled={disabled}>
      {pending ? "Applying correction" : "Regenerate workflow"}
    </Button>
  );
}

function AnalyzeSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      {pending ? "Analyzing" : "Find bottlenecks & opportunities"}
    </Button>
  );
}

/** Rendered only while its form is pending, useFormStatus only works inside
 * the form it belongs to. The analysis step is the slow one (three
 * sequential model calls), worth a specific line rather than a bare spinner. */
function AnalyzePendingNote() {
  const { pending } = useFormStatus();
  if (!pending) return null;
  return (
    <p className="text-xs text-slate">
      This usually takes a minute or two: finding bottlenecks, grounding
      solutions against what Refactrd actually has, then mapping the
      transformed workflow.
    </p>
  );
}

/** A small icon-only redo trigger for a stage that already has a result,
 * used instead of leaving the full-size original button in place once its
 * job is done: a real dry run found that reads as visual clutter, two
 * equally-weighted actions competing for attention when only one of them
 * (the next stage) is actually live. */
function RedoButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-label={label}
      title={label}
      className="flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-slate-light transition-colors hover:bg-surface-sunken hover:text-ink disabled:cursor-not-allowed"
    >
      {pending ? <Spinner className="h-3 w-3" /> : <RefreshCw className="h-3 w-3" aria-hidden="true" />}
    </button>
  );
}

function PdfSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" loading={pending}>
      {pending ? "Generating PDF" : "Generate PDF"}
    </Button>
  );
}

function ContinueSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" loading={pending}>
      {pending ? "Saving" : "Continue to another department"}
    </Button>
  );
}

function FinishSubmit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="secondary" loading={pending}>
      {pending ? "Finishing" : "Finish this engagement"}
    </Button>
  );
}

/**
 * The department workspace: paste-in transcript, bottlenecks and Opportunity
 * Mapping, the continue-or-finish decision. Results dock in a side panel
 * (components/immersion/result-panel.tsx) rather than stacking inline, and
 * each stage collapses once it has a result rather than leaving its input
 * and its trigger button sitting there at full size, both fixes from a real
 * day 12 dry run.
 */
export function DepartmentWorkspace({
  engagementId,
  departmentId,
  departmentName,
  initialTranscript,
  initialDiagram,
  initialBottlenecks,
  initialOpportunityMapping,
  initialAfterDiagram,
  initialPdfPath,
}: {
  engagementId: string;
  departmentId: string;
  departmentName: string;
  initialTranscript: string;
  initialDiagram: WorkflowDiagram | null;
  initialBottlenecks: Bottleneck[] | null;
  initialOpportunityMapping: OpportunityMapping | null;
  initialAfterDiagram: WorkflowDiagram | null;
  initialPdfPath: string | null;
}) {
  const [transcriptOpen, setTranscriptOpen] = useState(!initialDiagram);
  const [diagram, setDiagram] = useState(initialDiagram);

  const [extractState, extractAction] = useActionState<DepartmentActionState, FormData>(
    extractDepartmentWorkflow,
    null,
  );
  // Collapses the transcript back down the moment extraction succeeds,
  // rather than leaving a full textarea and an "Extract" button sitting
  // above a result that already answers the question they were for.
  useActionToast(extractState, () => {
    setTranscriptOpen(false);
    if (extractState && "diagram" in extractState) setDiagram(extractState.diagram);
  });

  const [correction, setCorrection] = useState("");
  const [reviseState, reviseAction] = useActionState<DepartmentActionState, FormData>(
    reviseDepartmentWorkflow,
    null,
  );
  useActionToast(reviseState, () => {
    if (reviseState && "diagram" in reviseState) setDiagram(reviseState.diagram);
    setCorrection("");
  });

  const [opportunityState, opportunityAction] = useActionState<
    OpportunityActionState,
    FormData
  >(generateDepartmentOpportunities, null);
  useActionToast(opportunityState);

  const [pdfState, pdfAction] = useActionState<PdfActionState, FormData>(
    generateDepartmentPdf,
    null,
  );
  useActionToast(pdfState);

  const [continueState, continueAction] = useActionState<NavActionState, FormData>(
    completeDepartmentAndContinue,
    null,
  );
  useActionToast(continueState);

  const [finishState, finishAction] = useActionState<NavActionState, FormData>(
    finishEngagement,
    null,
  );
  useActionToast(finishState);

  const [transcript, setTranscript] = useState(initialTranscript);

  const [, draftAction, isDraftSaving] = useActionState<DraftActionState, FormData>(
    saveTranscriptDraft,
    null,
  );
  const [savedTranscript, setSavedTranscript] = useState(initialTranscript);

  // Debounced autosave of the raw transcript, independent of "Extract
  // workflow": the one genuinely irreplaceable input in this pipeline, so a
  // refresh mid-paste (a real risk across a full onsite working day) must not
  // lose it, per the autosave-per-department non-negotiable. Only runs while
  // the transcript is open for editing, and skips entirely once the current
  // value matches what was last saved, so it does not fire on mount or after
  // its own save resolves. setSavedTranscript happens inside the (deferred)
  // timeout callback, not synchronously in the effect body, so this isn't
  // the sync-derived-state pattern react-hooks/set-state-in-effect flags.
  useEffect(() => {
    if (!transcriptOpen) return;
    if (transcript === savedTranscript) return;
    const timer = setTimeout(() => {
      const formData = new FormData();
      formData.set("departmentId", departmentId);
      formData.set("transcript", transcript);
      draftAction(formData);
      setSavedTranscript(transcript);
    }, 1500);
    return () => clearTimeout(timer);
  }, [transcript, transcriptOpen, savedTranscript, departmentId, draftAction]);

  const draftStatus = isDraftSaving
    ? "Saving…"
    : transcript === savedTranscript && transcript !== initialTranscript
      ? "Saved"
      : null;

  const bottlenecks =
    opportunityState && "bottlenecks" in opportunityState
      ? opportunityState.bottlenecks
      : initialBottlenecks;
  const opportunityMapping =
    opportunityState && "opportunityMapping" in opportunityState
      ? opportunityState.opportunityMapping
      : initialOpportunityMapping;
  const afterDiagram =
    opportunityState && "afterDiagram" in opportunityState
      ? opportunityState.afterDiagram
      : initialAfterDiagram;

  const pdfPath = pdfState && "pdfPath" in pdfState ? pdfState.pdfPath : initialPdfPath;

  const [panelOpen, setPanelOpen] = useState(false);
  const [activeTabId, setActiveTabId] = useState<string>("before");

  const openPanel = (tabId: string) => {
    setActiveTabId(tabId);
    setPanelOpen(true);
  };

  const tabs: ResultPanelTab[] = [];
  if (diagram) {
    tabs.push({
      id: "before",
      label: "Current workflow",
      content: <WorkflowDiagramView diagram={diagram} title={`${departmentName}, today`} />,
    });
  }
  if (bottlenecks && opportunityMapping && diagram) {
    tabs.push({
      id: "opportunities",
      label: "Bottlenecks & solutions",
      content: (
        <OpportunityMappingView
          bottlenecks={bottlenecks}
          opportunityMapping={opportunityMapping}
          diagram={diagram}
        />
      ),
    });
  }
  if (afterDiagram && afterDiagram.steps.length > 0) {
    tabs.push({
      id: "after",
      label: "Transformed workflow",
      content: (
        <WorkflowDiagramView diagram={afterDiagram} title={`${departmentName}, transformed`} />
      ),
    });
  }
  if (pdfPath) {
    tabs.push({
      id: "pdf",
      label: "PDF",
      content: (
        <iframe
          src={`/api/engagements/departments/${departmentId}/pdf`}
          title={`${departmentName} Opportunity Mapping PDF`}
          className="h-full min-h-[70vh] w-full"
        />
      ),
    });
  }

  // No effect needed to keep activeTabId valid: tabs are only ever additive
  // as the pipeline progresses (before -> opportunities -> after -> pdf),
  // never removed, and openPanel() always sets an id from the current tab
  // set, so a stale id here cannot actually happen.

  const wordCount = transcript.trim() ? transcript.trim().split(/\s+/).length : 0;
  const hasAnalysis = Boolean(bottlenecks && opportunityMapping && afterDiagram);

  return (
    <div className="flex flex-col gap-6">
      {/* Interview transcript — collapses to a single row once extracted, an
          artifact-style summary rather than a permanently open text block. */}
      {!transcriptOpen ? (
        <button
          type="button"
          onClick={() => setTranscriptOpen(true)}
          className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 text-left transition-colors hover:border-border-strong"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brass-tint text-brass-strong">
            <FileText className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-ink">Interview transcript</span>
            <span className="block text-xs text-slate">
              {wordCount.toLocaleString()} word{wordCount === 1 ? "" : "s"} &middot; click to view or edit
            </span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-slate-light" aria-hidden="true" />
        </button>
      ) : (
        <form action={extractAction} className="flex flex-col gap-3">
          <input type="hidden" name="departmentId" value={departmentId} />

          <div className="flex items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brass-tint text-brass-strong">
                <FileText className="h-4 w-4" aria-hidden="true" />
              </span>
              <div>
                <p className="text-sm font-medium text-ink">Interview transcript</p>
                <p className="text-xs text-slate">
                  Paste it as it was captured, formatting and all. Nothing needs cleaning up first.
                </p>
              </div>
            </div>
            {diagram ? (
              <button
                type="button"
                onClick={() => setTranscriptOpen(false)}
                aria-label="Collapse transcript"
                className="flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs text-slate hover:bg-surface-sunken hover:text-ink"
              >
                Collapse
                <ChevronDown className="h-3.5 w-3.5 rotate-180" aria-hidden="true" />
              </button>
            ) : null}
          </div>

          <div className="group rounded-xl border-2 border-dashed border-border-strong bg-surface-sunken/40 p-1 transition-colors focus-within:border-brass focus-within:border-solid">
            <textarea
              id="transcript"
              name="transcript"
              value={transcript}
              onChange={(event) => setTranscript(event.target.value)}
              rows={14}
              placeholder="Interviewer: Walk me through what happens when..."
              className="w-full resize-y rounded-lg bg-transparent px-3 py-2.5 text-sm text-ink placeholder:text-slate-light focus:outline-none"
            />
          </div>

          <div className="flex items-center justify-between">
            <ExtractSubmit hasResultAlready={Boolean(diagram)} />
            <div className="flex items-center gap-2.5 text-xs text-slate-light">
              {draftStatus ? (
                <span className="flex items-center gap-1">
                  {draftStatus === "Saving…" ? <Spinner className="h-3 w-3" /> : null}
                  {draftStatus}
                </span>
              ) : null}
              {wordCount > 0 ? (
                <span>
                  {wordCount.toLocaleString()} word{wordCount === 1 ? "" : "s"}
                </span>
              ) : null}
            </div>
          </div>
        </form>
      )}

      {diagram ? (
        <ResultCard
          icon={Workflow}
          title="Current workflow extracted"
          detail={`${diagram.steps.length} step${diagram.steps.length === 1 ? "" : "s"}${
            diagram.branches.length > 0 ? `, ${diagram.branches.length} decision point${diagram.branches.length === 1 ? "" : "s"}` : ""
          }`}
          onClick={() => openPanel("before")}
        />
      ) : null}

      {diagram && diagram.steps.length > 0 ? (
        <form action={reviseAction} className="flex flex-col gap-2 rounded-xl border border-dashed border-border-strong bg-surface-sunken/40 p-3">
          <input type="hidden" name="departmentId" value={departmentId} />
          <label htmlFor="correction" className="text-xs font-medium text-ink">
            Something in the extracted workflow wrong?
          </label>
          <textarea
            id="correction"
            name="correction"
            value={correction}
            onChange={(event) => setCorrection(event.target.value)}
            rows={2}
            placeholder={'"No, this is how it is done..." or "No, this step also exists..."'}
            className="w-full resize-y rounded-lg border border-border bg-surface px-2.5 py-2 text-sm text-ink placeholder:text-slate-light focus:border-brass focus:outline-none"
          />
          <div className="flex items-center justify-between">
            <ReviseSubmit disabled={!correction.trim()} />
            {hasAnalysis ? (
              <p className="text-xs text-slate-light">
                Bottlenecks already found for this department will not
                regenerate. Rerun analysis below if this correction changes
                them.
              </p>
            ) : null}
          </div>
        </form>
      ) : null}

      {diagram && diagram.steps.length > 0 ? (
        hasAnalysis ? (
          <form action={opportunityAction} className="flex items-center gap-1.5">
            <input type="hidden" name="departmentId" value={departmentId} />
            <CheckCircle2 className="h-3.5 w-3.5 text-brass-strong" aria-hidden="true" />
            <span className="text-xs text-slate">Analysis complete</span>
            <RedoButton label="Redo the analysis" />
          </form>
        ) : (
          <form action={opportunityAction} className="flex flex-col gap-2">
            <input type="hidden" name="departmentId" value={departmentId} />
            <div>
              <AnalyzeSubmit />
            </div>
            <AnalyzePendingNote />
          </form>
        )
      ) : null}

      {bottlenecks && opportunityMapping && diagram ? (
        <ResultCard
          icon={Sparkles}
          title="Bottlenecks & opportunities found"
          detail={`${bottlenecks.length} bottleneck${bottlenecks.length === 1 ? "" : "s"}, ${opportunityMapping.solutions.length} grounded solution${opportunityMapping.solutions.length === 1 ? "" : "s"} · Workflow health ${computeWorkflowScore(bottlenecks.length).score}/100`}
          onClick={() => openPanel("opportunities")}
        />
      ) : null}

      {afterDiagram && afterDiagram.steps.length > 0 ? (
        <ResultCard
          icon={ArrowRightLeft}
          title="Transformed workflow ready"
          detail={`${afterDiagram.steps.length} step${afterDiagram.steps.length === 1 ? "" : "s"} once the solutions are applied`}
          onClick={() => openPanel("after")}
        />
      ) : null}

      {bottlenecks && opportunityMapping && afterDiagram ? (
        <div className="flex items-center gap-3">
          {pdfPath ? (
            <>
              <form action={pdfAction} className="flex items-center gap-1.5">
                <input type="hidden" name="departmentId" value={departmentId} />
                <CheckCircle2 className="h-3.5 w-3.5 text-brass-strong" aria-hidden="true" />
                <span className="text-xs text-slate">PDF ready</span>
                <RedoButton label="Regenerate the PDF" />
              </form>
              <button
                type="button"
                onClick={() => openPanel("pdf")}
                className="text-sm font-medium text-brass hover:underline"
              >
                Preview
              </button>
              <a
                href={`/api/engagements/departments/${departmentId}/pdf`}
                download={`${departmentName}-opportunity-mapping.pdf`}
                className="flex items-center gap-1.5 text-sm font-medium text-slate hover:text-ink"
              >
                <Download className="h-3.5 w-3.5" aria-hidden="true" />
                Download
              </a>
            </>
          ) : (
            <form action={pdfAction}>
              <input type="hidden" name="departmentId" value={departmentId} />
              <PdfSubmit />
            </form>
          )}
        </div>
      ) : null}

      {pdfPath ? (
        <div className="flex items-center gap-3 border-t border-border pt-6">
          <form action={continueAction}>
            <input type="hidden" name="engagementId" value={engagementId} />
            <input type="hidden" name="departmentId" value={departmentId} />
            <ContinueSubmit />
          </form>
          <form action={finishAction}>
            <input type="hidden" name="engagementId" value={engagementId} />
            <input type="hidden" name="departmentId" value={departmentId} />
            <FinishSubmit />
          </form>
        </div>
      ) : null}

      <ResultPanel
        open={panelOpen && tabs.length > 0}
        onClose={() => setPanelOpen(false)}
        tabs={tabs}
        activeTabId={activeTabId}
        onTabChange={setActiveTabId}
      />
    </div>
  );
}
