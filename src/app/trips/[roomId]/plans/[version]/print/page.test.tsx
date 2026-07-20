import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { authorizePlanExport } from "@/features/exports/authorization";
import { getPlanVersionAction } from "@/features/revisions/actions";
import { revisionItinerary } from "@/features/revisions/test-fixtures";
import PrintPage from "./page";

vi.mock("@/features/revisions/actions", () => ({
  getPlanVersionAction: vi.fn(),
}));
vi.mock("@/features/exports/authorization", () => ({
  authorizePlanExport: vi.fn(),
}));

const roomId = "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a1";

describe("authenticated print route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authorizePlanExport).mockResolvedValue("allowed");
  });

  it("prints the exact historical version through the public-safe projection", async () => {
    vi.mocked(getPlanVersionAction).mockResolvedValue({
      ok: true,
      data: {
        id: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
        roomId,
        planningRequestId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3",
        version: 1,
        status: "published",
        validationStatus: "pass",
        basisSummaryVersion: 1,
        itinerary: revisionItinerary(),
        validationSummary: null,
        progressEvents: [],
        createdAt: "2026-07-14T00:00:00.000Z",
        updatedAt: "2026-07-14T00:00:00.000Z",
        publishedAt: "2026-07-14T00:00:00.000Z",
        errorCode: null,
      },
    });
    render(
      await PrintPage({
        params: Promise.resolve({ roomId, version: "1" }),
      }),
    );
    expect(getPlanVersionAction).toHaveBeenCalledWith(roomId, 1);
    expect(authorizePlanExport).toHaveBeenCalledWith({
      roomId,
      version: 1,
      type: "print",
    });
    expect(screen.getByLabelText("Shared Plan Version 1")).toBeInTheDocument();
    expect(document.querySelector(".public-itinerary")).toHaveAttribute(
      "data-content-hash",
      expect.stringMatching(/^[0-9a-f]{64}$/),
    );
    expect(document.body.textContent).not.toMatch(/Maya|Chicago|vegetarian/i);
  });

  it("fails closed for a mutable latest alias or inaccessible version", async () => {
    render(
      await PrintPage({
        params: Promise.resolve({ roomId, version: "latest" }),
      }),
    );
    expect(getPlanVersionAction).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "Shared Plan unavailable" }),
    ).toBeInTheDocument();
  });
});
