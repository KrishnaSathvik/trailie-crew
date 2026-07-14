import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { revisionItinerary } from "@/features/revisions/test-fixtures";
import { projectPublicItinerary } from "@/features/sharing/public-projection";
import { verifyPlanShareToken } from "@/features/sharing/repository";
import SharePage from "./page";
import { metadata } from "./layout";

vi.mock("@/features/sharing/repository", () => ({
  verifyPlanShareToken: vi.fn(),
}));

describe("public share page", () => {
  beforeEach(() => vi.clearAllMocks());

  it("verifies the opaque token server-side and renders only the projection", async () => {
    vi.mocked(verifyPlanShareToken).mockResolvedValue({
      itinerary: projectPublicItinerary({
        itinerary: revisionItinerary(),
        version: 1,
        publishedAt: "2026-07-14T00:00:00.000Z",
        validationStatus: "pass",
      }),
      snapshotHash: "a".repeat(64),
      mode: "public_link",
      expiresAt: null,
    });
    const token = "A".repeat(43);
    render(await SharePage({ params: Promise.resolve({ token }) }));
    expect(verifyPlanShareToken).toHaveBeenCalledWith(token);
    expect(screen.getByLabelText("Pinned Version 1")).toBeInTheDocument();
    expect(document.body.textContent).not.toContain(token);
  });

  it("renders the same generic state for invalid, revoked, expired, or unknown tokens", async () => {
    vi.mocked(verifyPlanShareToken).mockResolvedValue(null);
    render(
      await SharePage({ params: Promise.resolve({ token: "bad-token" }) }),
    );
    expect(
      screen.getByRole("heading", { name: "Shared itinerary unavailable" }),
    ).toBeInTheDocument();
  });

  it("sets strict robots and referrer metadata", () => {
    expect(metadata.robots).toMatchObject({
      index: false,
      follow: false,
      nocache: true,
    });
    expect(metadata.referrer).toBe("no-referrer");
  });
});
