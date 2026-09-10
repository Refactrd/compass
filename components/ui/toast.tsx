"use client";

import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { cn } from "@/lib/utils";

type Tone = "success" | "error" | "info";

type Toast = {
  id: string;
  tone: Tone;
  message: string;
};

/**
 * Transient notifications.
 *
 * Replaces the inline messages that used to sit under the form fields. Those
 * had two problems: they pushed the layout around, and they persisted after the
 * panel closed, so a stale success sat there while you filled in the next
 * upload.
 *
 * Errors are held four times longer than successes and are not auto-dismissed
 * while hovered, because an error is the one you actually need to read.
 */
const DURATIONS: Record<Tone, number> = {
  success: 5000,
  info: 6000,
  error: 20000,
};

const ToastContext = createContext<{
  toast: (tone: Tone, message: string) => void;
} | null>(null);

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return context.toast;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback((tone: Tone, message: string) => {
    const id = crypto.randomUUID();
    // Newest first, and capped: a burst of row actions should not paper over
    // the screen.
    setToasts((current) => [{ id, tone, message }, ...current].slice(0, 4));
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
      >
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const ICONS = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const [paused, setPaused] = useState(false);
  const Icon = ICONS[toast.tone];

  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(() => onDismiss(toast.id), DURATIONS[toast.tone]);
    return () => clearTimeout(timer);
  }, [toast.id, toast.tone, paused, onDismiss]);

  return (
    <div
      role={toast.tone === "error" ? "alert" : "status"}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className={cn(
        "toast-enter pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border p-3 shadow-raised",
        toast.tone === "error"
          ? "border-danger/30 bg-danger-tint"
          : "border-border bg-surface",
      )}
    >
      <Icon
        className={cn(
          "mt-0.5 h-4 w-4 shrink-0",
          toast.tone === "success" && "text-brass-strong",
          toast.tone === "error" && "text-danger",
          toast.tone === "info" && "text-slate",
        )}
        aria-hidden="true"
      />
      <p
        className={cn(
          "flex-1 text-sm leading-relaxed",
          toast.tone === "error" ? "text-danger" : "text-ink",
        )}
      >
        {toast.message}
      </p>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        aria-label="Dismiss"
        className="-m-1 rounded p-1 text-slate transition-colors hover:text-ink"
      >
        <X className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * Bridges a server action's returned state to a toast.
 *
 * useActionState hands back a fresh object on every submission, so keying the
 * effect on that reference fires once per result, including two identical
 * messages in a row.
 */
export function useActionToast(
  state: { error: string } | { ok: string } | { sent: true } | null,
  onSuccess?: () => void,
) {
  const toast = useToast();
  const onSuccessRef = useRef(onSuccess);

  useEffect(() => {
    onSuccessRef.current = onSuccess;
  });

  useEffect(() => {
    if (!state) return;
    if ("error" in state) {
      toast("error", state.error);
      return;
    }
    if ("ok" in state) {
      toast("success", state.ok);
      onSuccessRef.current?.();
    }
  }, [state, toast]);
}
