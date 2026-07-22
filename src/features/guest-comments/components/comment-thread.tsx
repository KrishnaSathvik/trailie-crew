"use client";

import { useMemo, useState } from "react";

import {
  createGuestCommentAction,
  createMemberCommentAction,
  deleteGuestCommentAction,
  resolvePlanCommentAction,
  updateGuestCommentAction,
} from "../actions";
import type { GuestComment } from "../contracts";

type CommentMode = "guest_viewer" | "guest_commenter" | "member";

function CommentBody({ comment }: { comment: GuestComment }) {
  if (comment.deleted)
    return (
      <p className="text-muted-foreground mt-2 text-sm italic">
        Comment deleted.
      </p>
    );
  return (
    <p className="text-muted-foreground mt-2 text-sm leading-6 whitespace-pre-wrap">
      {comment.body}
    </p>
  );
}

export function CommentThread({
  mode,
  comments: initialComments,
  target,
  roomId,
  planVersion,
  participantId,
}: {
  mode: CommentMode;
  comments: GuestComment[];
  target: { label: string; dayKey: string | null; itemKey: string | null };
  roomId: string;
  planVersion: number;
  participantId?: string;
}) {
  const [localComments, setLocalComments] = useState<GuestComment[]>([]);
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBody, setEditBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const comments = useMemo(() => {
    const localById = new Map(
      localComments.map((comment) => [comment.id, comment]),
    );
    const merged = initialComments.map((comment) => {
      const local = localById.get(comment.id);
      if (!local) return comment;
      localById.delete(comment.id);
      return Date.parse(comment.updatedAt) > Date.parse(local.updatedAt)
        ? comment
        : local;
    });
    return [...merged, ...localById.values()];
  }, [initialComments, localComments]);

  function replace(updated: GuestComment) {
    setLocalComments((current) => [
      ...current.filter((comment) => comment.id !== updated.id),
      updated,
    ]);
  }

  async function add() {
    setBusy(true);
    setMessage(null);
    const input = {
      dayKey: target.dayKey,
      itemKey: target.itemKey,
      body,
    };
    const result =
      mode === "member" && participantId
        ? await createMemberCommentAction({
            ...input,
            roomId,
            planVersion,
            participantId,
          })
        : await createGuestCommentAction(input);
    if (result.ok) {
      replace(result.data);
      setBody("");
    } else {
      setMessage(
        result.error === "rate_limited"
          ? "Comments are arriving too quickly. Try again shortly."
          : "The comment could not be added.",
      );
    }
    setBusy(false);
  }

  async function save(commentId: string) {
    setBusy(true);
    const result = await updateGuestCommentAction({
      commentId,
      body: editBody,
    });
    if (result.ok) {
      replace(result.data);
      setEditingId(null);
      setEditBody("");
    } else setMessage("The comment could not be updated.");
    setBusy(false);
  }

  async function remove(commentId: string) {
    setBusy(true);
    const result = await deleteGuestCommentAction({ commentId });
    if (result.ok) replace(result.data);
    else setMessage("The comment could not be deleted.");
    setBusy(false);
  }

  async function resolve(commentId: string) {
    if (!participantId) return;
    setBusy(true);
    const result = await resolvePlanCommentAction({
      commentId,
      participantId,
    });
    if (result.ok) replace(result.data);
    else setMessage("The comment could not be resolved.");
    setBusy(false);
  }

  return (
    <section
      aria-label={`Comments on ${target.label}`}
      className="border-border mt-4 rounded-md border p-3"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-[0.625rem] font-semibold tracking-[0.12em] uppercase">
          Comments · Version {planVersion}
        </p>
        {mode === "guest_viewer" ? (
          <span className="text-muted-foreground text-xs">
            Viewer · read only
          </span>
        ) : null}
      </div>

      {comments.length ? (
        <ul className="mt-3 space-y-3">
          {comments.map((comment) => {
            const content = (
              <>
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold">
                    {comment.authorDisplayName}
                  </p>
                  <time className="text-muted-foreground font-mono text-[0.625rem]">
                    {new Date(comment.createdAt).toLocaleString()}
                  </time>
                </div>
                {editingId === comment.id ? (
                  <div className="mt-2">
                    <label className="sr-only" htmlFor={`edit-${comment.id}`}>
                      Edit comment
                    </label>
                    <textarea
                      id={`edit-${comment.id}`}
                      aria-label="Edit comment"
                      maxLength={2000}
                      value={editBody}
                      onChange={(event) => setEditBody(event.target.value)}
                      className="border-border min-h-20 w-full rounded-md border bg-transparent p-2 text-base"
                    />
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void save(comment.id)}
                      className="bg-foreground text-background mt-2 min-h-9 rounded-md px-3 text-xs font-semibold"
                    >
                      Save comment
                    </button>
                  </div>
                ) : (
                  <CommentBody comment={comment} />
                )}
                {!comment.deleted ? (
                  <div className="mt-2 flex flex-wrap gap-3">
                    {mode === "guest_commenter" && comment.isOwn ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(comment.id);
                            setEditBody(comment.body ?? "");
                          }}
                          className="min-h-8 text-xs font-semibold"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => void remove(comment.id)}
                          className="min-h-8 text-xs font-semibold"
                        >
                          Delete
                        </button>
                      </>
                    ) : null}
                    {mode === "member" && !comment.resolved ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void resolve(comment.id)}
                        className="min-h-8 text-xs font-semibold"
                      >
                        Resolve
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {comment.resolved ? (
                  <p className="mt-2 text-xs font-semibold">
                    Resolved by a crew member
                  </p>
                ) : null}
              </>
            );
            return (
              <li key={comment.id} className="bg-subtle rounded-md p-3">
                {comment.resolved ? (
                  <details>
                    <summary className="cursor-pointer text-xs font-semibold">
                      Resolved comment by {comment.authorDisplayName}
                    </summary>
                    <div className="mt-2">{content}</div>
                  </details>
                ) : (
                  content
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="text-muted-foreground mt-3 text-xs">
          No comments on this part of the plan.
        </p>
      )}

      {mode !== "guest_viewer" ? (
        <div className="mt-3">
          <label className="sr-only" htmlFor={`comment-${target.label}`}>
            Comment on {target.label}
          </label>
          <textarea
            id={`comment-${target.label}`}
            aria-label={`Comment on ${target.label}`}
            value={body}
            maxLength={2000}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Add a plain-text comment"
            className="border-border min-h-20 w-full rounded-md border bg-transparent p-2 text-base"
          />
          <button
            type="button"
            disabled={busy || !body.trim()}
            onClick={() => void add()}
            className="bg-foreground text-background mt-2 min-h-9 rounded-md px-3 text-xs font-semibold disabled:opacity-50"
          >
            Add comment
          </button>
        </div>
      ) : null}
      {message ? (
        <p role="status" className="mt-2 text-xs font-semibold">
          {message}
        </p>
      ) : null}
    </section>
  );
}
