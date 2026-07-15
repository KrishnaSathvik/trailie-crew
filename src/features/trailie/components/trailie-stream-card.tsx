import { Sparkles, X } from "lucide-react";

import {
  trailieErrorMessages,
  type TrailieErrorCode,
} from "@/features/trailie/errors/trailie-errors";

export function TrailieStreamCard({
  body,
  status,
  errorCode,
  retryable,
  onCancel,
  onRetry,
}: {
  body: string;
  status: "answering" | "failed";
  errorCode: TrailieErrorCode | null;
  retryable: boolean;
  onCancel: () => void;
  onRetry: () => void;
}) {
  return (
    <div
      className="border-border bg-subtle/50 mx-auto mb-5 w-[calc(100%-2rem)] max-w-3xl border-l-2 px-4 py-4"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-semibold">
          <Sparkles aria-hidden="true" className="mr-1.5 inline size-3.5" />
          Trailie
        </p>
        {status === "answering" ? (
          <button
            type="button"
            onClick={onCancel}
            aria-label="Stop Trailie"
            className="text-muted-foreground focus-visible:ring-ring rounded-sm focus-visible:ring-2 focus-visible:outline-none"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        ) : null}
      </div>
      {status === "answering" && !body ? (
        <p className="text-muted-foreground mt-2 text-sm">
          Trailie is answering…
        </p>
      ) : null}
      {body ? (
        <p className="mt-2 text-[0.9375rem] leading-6 break-words whitespace-pre-wrap">
          {body}
        </p>
      ) : null}
      {status === "failed" ? (
        <div className="mt-2 text-sm">
          <p role="alert">
            {trailieErrorMessages[errorCode ?? "invocation_failed"]}
          </p>
          {retryable ? (
            <button
              type="button"
              onClick={onRetry}
              className="focus-visible:ring-ring mt-2 text-xs font-semibold underline underline-offset-4 focus-visible:ring-2 focus-visible:outline-none"
            >
              Retry Trailie
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
