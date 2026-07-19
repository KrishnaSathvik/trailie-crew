import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { cookies } from "next/headers";
import { revisionItinerary } from "@/features/revisions/test-fixtures";
import { projectPublicItinerary } from "@/features/sharing/public-projection";
import { loadGuestSessionContext } from "@/features/guest-comments/repository";
import GuestPlanPage from "./page";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("@/features/guest-comments/repository", () => ({
  loadGuestSessionContext: vi.fn(),
}));
vi.mock("@/features/maps/actions", () => ({
  getPlanMapProjectionAction: vi.fn(),
}));

const planId = "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a1";
const itinerary = projectPublicItinerary({
  itinerary: revisionItinerary(),
  version: 1,
  publishedAt: "2026-07-19T00:00:00.000Z",
  validationStatus: "pass",
});
const firstDay = itinerary.days[0];
const firstItem = firstDay.items[0];
const comment = {
  id: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
  planVersionId: planId,
  planVersion: 1,
  dayKey: firstDay.date,
  itemKey: firstItem.key,
  authorType: "guest" as const,
  authorDisplayName: "Jordan",
  body: "Could we start 30 minutes earlier?",
  resolved: false,
  deleted: false,
  createdAt: "2026-07-19T00:10:00.000Z",
  updatedAt: "2026-07-19T00:10:00.000Z",
  isOwn: true,
};

describe("scoped guest plan page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(cookies).mockResolvedValue({
      get: vi.fn().mockReturnValue({ value: "B".repeat(43) }),
    } as never);
  });

  it("renders a Viewer as exact-version read-only with item comments", async () => {
    vi.mocked(loadGuestSessionContext).mockResolvedValue({
      role: "guest_viewer",
      displayName: "Riley",
      planVersionId: planId,
      planVersion: 1,
      expiresAt: "2026-07-20T00:00:00.000Z",
      itinerary,
      comments: [{ ...comment, isOwn: false }],
    });

    render(await GuestPlanPage());
    expect(screen.getByLabelText("Guest permission")).toHaveTextContent(
      "Viewer · read only",
    );
    expect(screen.getByLabelText("Pinned Version 1")).toBeVisible();
    const itemContainer = screen
      .getByRole("heading", { name: firstItem.title })
      .closest("li");
    expect(itemContainer).toHaveTextContent(comment.body);
    expect(
      screen.queryByLabelText(`Comment on ${firstItem.title}`),
    ).not.toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(
      /participants|crew chat|approval|revision|exact private address/i,
    );
  });

  it("renders a Commenter composer beside the relevant item", async () => {
    vi.mocked(loadGuestSessionContext).mockResolvedValue({
      role: "guest_commenter",
      displayName: "Jordan",
      planVersionId: planId,
      planVersion: 1,
      expiresAt: "2026-07-20T00:00:00.000Z",
      itinerary,
      comments: [comment],
    });

    render(await GuestPlanPage());
    expect(screen.getByText("Commenter · comments enabled")).toBeVisible();
    expect(
      screen.getByLabelText(`Comment on ${firstItem.title}`),
    ).toBeVisible();
  });

  it("fails closed immediately when the session is expired or revoked", async () => {
    vi.mocked(loadGuestSessionContext).mockResolvedValue(null);
    render(await GuestPlanPage());
    expect(
      screen.getByRole("heading", { name: "Guest access unavailable" }),
    ).toBeVisible();
  });
});
