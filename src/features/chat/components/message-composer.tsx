"use client";

import { SendHorizontal } from "lucide-react";
import { useState } from "react";

import { detectTrailieInvocation } from "@/features/trailie/invocation/detect-invocation";

export function MessageComposer({
  onSend,
  onDraftActivity,
  disabled = false,
}: {
  onSend: (body: string) => Promise<boolean> | boolean;
  onDraftActivity?: (body: string) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const remaining = 4000 - draft.length;
  const invokesTrailie = detectTrailieInvocation({ body: draft }).invoked;

  async function submit() {
    const body = draft.trim();
    if (!body || sending || disabled) return;
    setSending(true);
    try {
      const accepted = await onSend(body);
      if (accepted) {
        setDraft("");
        onDraftActivity?.("");
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-border bg-background border-t px-4 py-3 sm:px-6">
      <div className="border-border focus-within:ring-ring flex items-end gap-2 rounded-lg border p-2 focus-within:ring-2">
        <label htmlFor="crew-message" className="sr-only">
          Message your crew
        </label>
        <textarea
          id="crew-message"
          value={draft}
          maxLength={4000}
          rows={1}
          disabled={disabled}
          placeholder="Message your crew"
          onChange={(event) => {
            const value = event.target.value.slice(0, 4000);
            setDraft(value);
            onDraftActivity?.(value);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void submit();
            }
          }}
          className="text-foreground placeholder:text-muted-foreground max-h-40 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-2 py-2 text-sm leading-5 outline-none disabled:opacity-50"
        />
        <button
          type="button"
          aria-label="Send message"
          disabled={!draft.trim() || sending || disabled}
          onClick={() => void submit()}
          className="bg-foreground text-background focus-visible:ring-ring inline-flex size-10 shrink-0 items-center justify-center rounded-md focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-30"
        >
          <SendHorizontal aria-hidden="true" className="size-4" />
        </button>
      </div>
      <div className="mt-1.5 flex min-h-4 justify-between gap-4 px-1 text-[0.6875rem]">
        <p className="text-muted-foreground">
          {invokesTrailie
            ? "Trailie will answer after this message is sent"
            : "Enter to send · Shift+Enter for a new line"}
        </p>
        {remaining <= 200 ? (
          <p className="text-muted-foreground tabular-nums" aria-live="polite">
            {remaining} characters remaining
          </p>
        ) : null}
      </div>
    </div>
  );
}
