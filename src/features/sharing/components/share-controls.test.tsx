import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createPlanShareLinkAction,
  getPlanShareStatusAction,
  revokePlanShareLinkAction,
} from "../actions";
import { ShareControls } from "./share-controls";

vi.mock("../actions", () => ({
  createPlanShareLinkAction: vi.fn(),
  getPlanShareStatusAction: vi.fn(),
  revokePlanShareLinkAction: vi.fn(),
}));

const ids = {
  room: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a1",
  plan: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
  participant: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3",
  link: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a4",
};

describe("version-specific share controls", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getPlanShareStatusAction).mockResolvedValue({
      ok: true,
      data: {
        tripPlanId: ids.plan,
        planVersion: 1,
        mode: "private",
        status: "revoked",
      },
    });
  });

  it("shows management only to the host and exports to every active member", async () => {
    const { rerender } = render(
      <ShareControls
        roomId={ids.room}
        participantId={ids.participant}
        tripPlanId={ids.plan}
        version={1}
        isHost
      />,
    );
    expect(await screen.findByText("Share Version 1")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Create share link" }),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Download Calendar" }),
    ).toHaveAttribute("href", `/api/trips/${ids.room}/plans/1/calendar`);
    expect(
      screen.getByRole("link", { name: "Print or Save PDF" }),
    ).toHaveAttribute("href", `/trips/${ids.room}/plans/1/print`);

    rerender(
      <ShareControls
        roomId={ids.room}
        participantId={ids.participant}
        tripPlanId={ids.plan}
        version={1}
        isHost={false}
      />,
    );
    await waitFor(() =>
      expect(
        screen.queryByRole("button", { name: "Create share link" }),
      ).not.toBeInTheDocument(),
    );
    expect(
      screen.getByText(/Only the active host can manage links/i),
    ).toBeVisible();
    expect(
      screen.getByRole("link", { name: "Download Calendar" }),
    ).toBeVisible();
  });

  it("reveals a new raw link once and requires rotation when it is lost", async () => {
    const shareUrl = `/share/${"A".repeat(43)}`;
    vi.mocked(createPlanShareLinkAction).mockResolvedValue({
      ok: true,
      data: {
        id: ids.link,
        tripPlanId: ids.plan,
        planVersion: 1,
        mode: "public_link",
        status: "active",
        tokenPrefix: "AAAAAAAA",
        snapshotHash: "a".repeat(64),
        expiresAt: null,
        createdAt: "2026-07-14T00:00:00.000Z",
        shareUrl,
      },
    });
    render(
      <ShareControls
        roomId={ids.room}
        participantId={ids.participant}
        tripPlanId={ids.plan}
        version={1}
        isHost
      />,
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Create share link" }),
    );
    expect(await screen.findByDisplayValue(shareUrl)).toBeVisible();
    expect(screen.getByText(/shown once/i)).toBeVisible();
    expect(screen.getByText(/You can replace it at any time/i)).toBeVisible();
    expect(createPlanShareLinkAction).toHaveBeenCalledWith({
      tripPlanId: ids.plan,
      participantId: ids.participant,
      mode: "public_link",
      expiresAt: null,
    });
  });

  it("shows active status with rotate and revoke actions but never recovers its URL", async () => {
    vi.mocked(getPlanShareStatusAction).mockResolvedValue({
      ok: true,
      data: {
        id: ids.link,
        tripPlanId: ids.plan,
        planVersion: 2,
        mode: "expiring_link",
        status: "active",
        tokenPrefix: "abcdefgh",
        snapshotHash: "a".repeat(64),
        expiresAt: "2026-07-15T00:00:00.000Z",
        createdAt: "2026-07-14T00:00:00.000Z",
        revokedAt: null,
      },
    });
    vi.mocked(revokePlanShareLinkAction).mockResolvedValue({
      ok: true,
      data: {
        id: ids.link,
        tripPlanId: ids.plan,
        planVersion: 2,
        status: "revoked",
      },
    });
    render(
      <ShareControls
        roomId={ids.room}
        participantId={ids.participant}
        tripPlanId={ids.plan}
        version={2}
        isHost
      />,
    );
    expect(await screen.findByText("Active expiring link")).toBeVisible();
    expect(screen.queryByText(/abcdefgh/)).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue(/\/share\//)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Replace link" })).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Revoke link" }));
    await waitFor(() =>
      expect(revokePlanShareLinkAction).toHaveBeenCalledWith({
        shareLinkId: ids.link,
        participantId: ids.participant,
      }),
    );
  });
});
