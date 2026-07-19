import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { revisionItinerary } from "@/features/revisions/test-fixtures";
import { projectPublicItinerary } from "@/features/sharing/public-projection";
import { verifyGuestInvite } from "@/features/guest-comments/repository";
import GuestInvitePage from "./page";

vi.mock("@/features/guest-comments/repository", () => ({
  verifyGuestInvite: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn() }),
}));

const token = "A".repeat(43);

describe("guest invite entry page", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows role, exact version, expiration, and display-name entry without exposing the raw token", async () => {
    vi.mocked(verifyGuestInvite).mockResolvedValue({
      inviteId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a1",
      roomId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
      planVersionId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3",
      planVersion: 1,
      role: "guest_commenter",
      expiresAt: "2026-07-20T00:00:00.000Z",
      itinerary: projectPublicItinerary({
        itinerary: revisionItinerary(),
        version: 1,
        publishedAt: "2026-07-19T00:00:00.000Z",
        validationStatus: "pass",
      }),
    });

    render(await GuestInvitePage({ params: Promise.resolve({ token }) }));
    expect(
      screen.getByRole("heading", { name: "Join as a guest commenter" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Exact plan version")).toHaveTextContent(
      "Version 1",
    );
    expect(screen.getByLabelText("Guest display name")).toBeVisible();
    expect(document.body.textContent).not.toContain(token);
  });

  it("uses one clear unavailable state for expired, revoked, or unknown links", async () => {
    vi.mocked(verifyGuestInvite).mockResolvedValue(null);
    render(
      await GuestInvitePage({ params: Promise.resolve({ token: "bad" }) }),
    );
    expect(
      screen.getByRole("heading", { name: "Guest access unavailable" }),
    ).toBeVisible();
    expect(screen.getByText(/expired, revoked, or replaced/i)).toBeVisible();
  });
});
