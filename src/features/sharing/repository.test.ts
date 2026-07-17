import { beforeEach, describe, expect, it, vi } from "vitest";

import { createAdminSupabaseClient } from "@/server/supabase/admin";
import { verifyPlanShareToken } from "./repository";

vi.mock("@/server/supabase/admin", () => ({
  createAdminSupabaseClient: vi.fn(),
}));

const itinerary = {
  schemaVersion: "1",
  title: "Yosemite",
  destinationSummary: "Yosemite Valley",
  timezone: "America/Los_Angeles",
  startDate: "2026-09-12",
  endDate: "2026-09-13",
  version: 1,
  publishedAt: "2026-07-14T00:00:00.000Z",
  validation: { status: "pass", passed: true },
  days: [
    {
      date: "2026-09-12",
      title: "Arrival",
      items: [],
      travelSegments: [],
      warnings: [],
    },
  ],
  lodging: [],
  food: [],
  disclaimer: "No bookings were made by Trailie",
};

describe("public share repository", () => {
  const rpc = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createAdminSupabaseClient).mockReturnValue({ rpc } as never);
  });

  it("returns only a validated public projection", async () => {
    rpc.mockResolvedValue({
      data: {
        itinerary,
        snapshotHash: "a".repeat(64),
        mode: "public_link",
        expiresAt: null,
      },
      error: null,
    });
    await expect(verifyPlanShareToken("A".repeat(43))).resolves.toMatchObject({
      itinerary: { version: 1 },
      snapshotHash: "a".repeat(64),
    });
    expect(rpc.mock.calls[0]?.[1]).toEqual({
      target_token_hash: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it("uses privacy-safe labels when redaction removes required headings", async () => {
    const redacted = { ...itinerary } as Partial<typeof itinerary>;
    delete redacted.title;
    delete redacted.destinationSummary;
    rpc.mockResolvedValue({
      data: {
        itinerary: redacted,
        snapshotHash: "b".repeat(64),
        mode: "public_link",
        expiresAt: null,
      },
      error: null,
    });

    await expect(verifyPlanShareToken("B".repeat(43))).resolves.toMatchObject({
      itinerary: {
        title: "Shared trip itinerary",
        destinationSummary: "Trip details shared by the host.",
      },
    });
  });

  it("uses a privacy-safe label when redaction removes an item title", async () => {
    const redacted = {
      ...itinerary,
      days: [
        {
          ...itinerary.days[0]!,
          items: [
            {
              key: "item:kayak",
              type: "activity",
              startTime: "09:30",
              endTime: "12:00",
              description: "A provisional water activity.",
              reservationStatus: "unknown",
              dataStatus: "unknown",
            },
          ],
        },
      ],
    };
    rpc.mockResolvedValue({
      data: {
        itinerary: redacted,
        snapshotHash: "c".repeat(64),
        mode: "public_link",
        expiresAt: null,
      },
      error: null,
    });

    await expect(verifyPlanShareToken("C".repeat(43))).resolves.toMatchObject({
      itinerary: {
        days: [
          {
            items: [
              {
                title: "Itinerary item",
                description: "A provisional water activity.",
              },
            ],
          },
        ],
      },
    });
  });

  it.each(["short", "+".repeat(43)])(
    "collapses malformed token %s to unavailable without a query",
    async (token) => {
      await expect(verifyPlanShareToken(token)).resolves.toBeNull();
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it("collapses missing, revoked, expired, mismatched, and invalid snapshots", async () => {
    rpc.mockResolvedValue({ data: null, error: null });
    await expect(verifyPlanShareToken("A".repeat(43))).resolves.toBeNull();
    rpc.mockResolvedValue({
      data: { itinerary: { private: true } },
      error: null,
    });
    await expect(verifyPlanShareToken("B".repeat(43))).resolves.toBeNull();
    rpc.mockResolvedValue({ data: null, error: { message: "internal" } });
    await expect(verifyPlanShareToken("C".repeat(43))).resolves.toBeNull();
  });
});
