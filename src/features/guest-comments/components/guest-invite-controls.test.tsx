import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createGuestInviteAction,
  listGuestInvitesAction,
  revokeGuestInviteAction,
  rotateGuestInviteAction,
} from "../actions";
import { GuestInviteControls } from "./guest-invite-controls";

vi.mock("../actions", () => ({
  createGuestInviteAction: vi.fn(),
  listGuestInvitesAction: vi.fn(),
  revokeGuestInviteAction: vi.fn(),
  rotateGuestInviteAction: vi.fn(),
}));

const ids = {
  room: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a1",
  plan: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
  participant: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3",
  invite: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a4",
};
const metadata = {
  id: ids.invite,
  planVersionId: ids.plan,
  planVersion: 1,
  role: "guest_commenter" as const,
  tokenPrefix: "abcdefgh",
  expiresAt: "2026-07-20T00:00:00.000Z",
  maxUses: 25,
  useCount: 1,
  createdAt: "2026-07-19T00:00:00.000Z",
};

describe("guest invite controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listGuestInvitesAction).mockResolvedValue({
      ok: true,
      data: [],
    });
  });

  it("shows the exact-version boundary to members but management only to the host", async () => {
    const { rerender } = render(
      <GuestInviteControls
        roomId={ids.room}
        planVersionId={ids.plan}
        planVersion={1}
        participantId={ids.participant}
        isHost
      />,
    );
    expect(
      await screen.findByText("Guest access · Version 1"),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Invite guest" })).toBeVisible();

    rerender(
      <GuestInviteControls
        roomId={ids.room}
        planVersionId={ids.plan}
        planVersion={1}
        participantId={ids.participant}
        isHost={false}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Invite guest" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("Only the host can create, rotate, or revoke links."),
    ).toBeVisible();
  });

  it("creates Viewer or Commenter links and reveals the raw URL once", async () => {
    vi.mocked(createGuestInviteAction).mockResolvedValue({
      ok: true,
      data: { ...metadata, guestUrl: `/guest/${"A".repeat(43)}` },
    });
    render(
      <GuestInviteControls
        roomId={ids.room}
        planVersionId={ids.plan}
        planVersion={1}
        participantId={ids.participant}
        isHost
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Invite guest" }),
    );
    fireEvent.change(screen.getByLabelText("Guest permission"), {
      target: { value: "guest_commenter" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create guest link" }));

    expect(
      await screen.findByDisplayValue(`/guest/${"A".repeat(43)}`),
    ).toBeVisible();
    expect(screen.getByText(/shown once/i)).toBeVisible();
    expect(createGuestInviteAction).toHaveBeenCalledWith(
      expect.objectContaining({
        planVersionId: ids.plan,
        participantId: ids.participant,
        role: "guest_commenter",
      }),
    );
  });

  it("lists active links and exposes atomic rotate and revoke actions", async () => {
    vi.mocked(listGuestInvitesAction).mockResolvedValue({
      ok: true,
      data: [metadata],
    });
    vi.mocked(rotateGuestInviteAction).mockResolvedValue({
      ok: true,
      data: {
        ...metadata,
        id: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a5",
        tokenPrefix: "rotated1",
        guestUrl: `/guest/${"B".repeat(43)}`,
      },
    });
    vi.mocked(revokeGuestInviteAction).mockResolvedValue({
      ok: true,
      data: {
        id: ids.invite,
        planVersionId: ids.plan,
        planVersion: 1,
        status: "revoked",
      },
    });
    render(
      <GuestInviteControls
        roomId={ids.room}
        planVersionId={ids.plan}
        planVersion={1}
        participantId={ids.participant}
        isHost
      />,
    );

    expect(await screen.findByText("Commenter")).toBeVisible();
    expect(screen.queryByText(/abcdefgh/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Replace guest link" }));
    expect(
      await screen.findByDisplayValue(`/guest/${"B".repeat(43)}`),
    ).toBeVisible();
    expect(rotateGuestInviteAction).toHaveBeenCalledWith({
      inviteId: ids.invite,
      participantId: ids.participant,
    });

    fireEvent.click(screen.getByRole("button", { name: "Revoke guest link" }));
    await waitFor(() =>
      expect(revokeGuestInviteAction).toHaveBeenCalledWith({
        inviteId: expect.any(String),
        participantId: ids.participant,
      }),
    );
  });
});
