import { beforeEach, describe, expect, it, vi } from "vitest";

import { authorizePlanExport } from "@/features/exports/authorization";
import { revisionItinerary } from "@/features/revisions/test-fixtures";
import { getPlanVersionAction } from "@/features/revisions/actions";
import { GET } from "./route";

vi.mock("@/features/revisions/actions", () => ({
  getPlanVersionAction: vi.fn(),
}));
vi.mock("@/features/exports/authorization", () => ({
  authorizePlanExport: vi.fn(),
}));

const roomId = "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a1";

describe("authenticated calendar route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authorizePlanExport).mockResolvedValue("allowed");
  });

  it("downloads the selected published version with private no-store headers", async () => {
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
    const response = await GET(new Request("http://localhost/calendar"), {
      params: Promise.resolve({ roomId, version: "1" }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/calendar; charset=utf-8",
    );
    expect(response.headers.get("content-disposition")).toContain(
      'filename="trailie-itinerary-v1.ics"',
    );
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(response.headers.get("x-trailie-plan-version")).toBe("1");
    expect(await response.text()).toContain("Itinerary Version 1");
    expect(getPlanVersionAction).toHaveBeenCalledWith(roomId, 1);
    expect(authorizePlanExport).toHaveBeenCalledWith({
      roomId,
      version: 1,
      type: "calendar",
    });
  });

  it("fails safely for malformed or inaccessible versions", async () => {
    const malformed = await GET(new Request("http://localhost/calendar"), {
      params: Promise.resolve({ roomId: "bad", version: "latest" }),
    });
    expect(malformed.status).toBe(404);
    expect(getPlanVersionAction).not.toHaveBeenCalled();

    vi.mocked(getPlanVersionAction).mockResolvedValue({
      ok: false,
      error: "membership_required",
    });
    const unavailable = await GET(new Request("http://localhost/calendar"), {
      params: Promise.resolve({ roomId, version: "1" }),
    });
    expect(unavailable.status).toBe(404);
    expect(await unavailable.json()).toEqual({ code: "export_not_allowed" });

    vi.mocked(authorizePlanExport).mockResolvedValue("rate_limited");
    const limited = await GET(new Request("http://localhost/calendar"), {
      params: Promise.resolve({ roomId, version: "1" }),
    });
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ code: "rate_limited" });
  });
});
