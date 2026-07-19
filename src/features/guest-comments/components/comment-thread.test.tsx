import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createGuestCommentAction,
  deleteGuestCommentAction,
  resolvePlanCommentAction,
  updateGuestCommentAction,
} from "../actions";
import type { GuestComment } from "../contracts";
import { CommentThread } from "./comment-thread";

vi.mock("../actions", () => ({
  createGuestCommentAction: vi.fn(),
  updateGuestCommentAction: vi.fn(),
  deleteGuestCommentAction: vi.fn(),
  createMemberCommentAction: vi.fn(),
  resolvePlanCommentAction: vi.fn(),
}));

const ids = {
  room: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a1",
  participant: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
  plan: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3",
  own: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a4",
};
const ownComment: GuestComment = {
  id: ids.own,
  planVersionId: ids.plan,
  planVersion: 1,
  dayKey: "2026-09-12",
  itemKey: "item:one",
  authorType: "guest",
  authorDisplayName: "Jordan",
  body: "**Meet at 8**",
  resolved: false,
  deleted: false,
  createdAt: "2026-07-19T00:10:00.000Z",
  updatedAt: "2026-07-19T00:10:00.000Z",
  isOwn: true,
};

function renderThread(
  mode: "guest_viewer" | "guest_commenter" | "member",
  comments: GuestComment[] = [ownComment],
) {
  return render(
    <CommentThread
      mode={mode}
      comments={comments}
      target={{
        label: "Glacier Point sunset",
        dayKey: "2026-09-12",
        itemKey: "item:one",
      }}
      roomId={ids.room}
      planVersion={1}
      participantId={mode === "member" ? ids.participant : undefined}
    />,
  );
}

describe("version-pinned comment thread", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders comment bodies as literal plain text and keeps Viewer read-only", () => {
    renderThread("guest_viewer");
    expect(screen.getByText("**Meet at 8**")).toBeVisible();
    expect(document.querySelector("strong")).toBeNull();
    expect(screen.getByText("Viewer · read only")).toBeVisible();
    expect(
      screen.queryByLabelText("Comment on Glacier Point sunset"),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Resolve" })).toBeNull();
  });

  it("lets a Commenter add, edit, and delete only their own comment", async () => {
    const created = {
      ...ownComment,
      id: crypto.randomUUID(),
      body: "New note",
    };
    vi.mocked(createGuestCommentAction).mockResolvedValue({
      ok: true,
      data: created,
    });
    vi.mocked(updateGuestCommentAction).mockResolvedValue({
      ok: true,
      data: { ...ownComment, body: "Updated note" },
    });
    vi.mocked(deleteGuestCommentAction).mockResolvedValue({
      ok: true,
      data: { ...ownComment, body: null, deleted: true },
    });
    renderThread("guest_commenter");

    fireEvent.change(screen.getByLabelText("Comment on Glacier Point sunset"), {
      target: { value: "New note" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add comment" }));
    expect(await screen.findByText("New note")).toBeVisible();

    fireEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]);
    fireEvent.change(screen.getByLabelText("Edit comment"), {
      target: { value: "Updated note" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save comment" }));
    await waitFor(() =>
      expect(screen.queryByLabelText("Edit comment")).not.toBeInTheDocument(),
    );
    expect(screen.getByText("Updated note")).toBeVisible();

    fireEvent.click(screen.getAllByRole("button", { name: "Delete" })[0]);
    await waitFor(() =>
      expect(deleteGuestCommentAction).toHaveBeenCalledWith({
        commentId: ids.own,
      }),
    );
    expect(screen.queryByRole("button", { name: "Resolve" })).toBeNull();
  });

  it("does not show edit or delete for another guest's comment", () => {
    renderThread("guest_commenter", [{ ...ownComment, isOwn: false }]);
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("lets a member resolve while guests never receive that action", async () => {
    vi.mocked(resolvePlanCommentAction).mockResolvedValue({
      ok: true,
      data: {
        ...ownComment,
        resolved: true,
        resolvedAt: "2026-07-19T00:30:00.000Z",
      },
    });
    renderThread("member");
    fireEvent.click(screen.getByRole("button", { name: "Resolve" }));
    const summary = await screen.findByText("Resolved comment by Jordan");
    expect(summary).toBeVisible();
    expect(summary.closest("details")).not.toHaveAttribute("open");
    expect(resolvePlanCommentAction).toHaveBeenCalledWith({
      commentId: ids.own,
      participantId: ids.participant,
    });
  });

  it("keeps resolved comments visible but collapsed", () => {
    renderThread("guest_viewer", [
      {
        ...ownComment,
        resolved: true,
        resolvedAt: "2026-07-19T00:30:00.000Z",
      },
    ]);
    const details = screen
      .getByText("Resolved comment by Jordan")
      .closest("details");
    expect(details).not.toHaveAttribute("open");
    expect(screen.getByText("**Meet at 8**")).toBeInTheDocument();
  });
});
