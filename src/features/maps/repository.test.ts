import { describe, expect, it, vi } from "vitest";
import { revisionItinerary } from "@/features/revisions/test-fixtures";
import { loadMemberMapProjection, loadPublicMapProjection } from "./repository";

const source = {
  roomId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
  tripPlanId: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3",
  planVersion: 1,
  currentPlanVersion: 2,
  publishedAt: "2026-07-18T13:00:00.000Z",
  itinerary: revisionItinerary(),
  evidenceSnapshots: [],
  destinationResolution: null,
};

describe("map projection repository", () => {
  it("loads an exact member version through the narrow source RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: source, error: null });
    const projection = await loadMemberMapProjection(
      { rpc },
      {
        roomId: source.roomId,
        version: 1,
        generatedAt: "2026-07-18T14:00:00.000Z",
      },
    );
    expect(rpc).toHaveBeenCalledWith("get_plan_map_projection_source", {
      target_room_id: source.roomId,
      target_plan_version: 1,
    });
    expect(projection).toMatchObject({
      roomId: source.roomId,
      planVersionId: source.tripPlanId,
      planVersion: 1,
      evidenceState: "historical",
    });
  });

  it("rejects a mismatched member version", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { ...source, planVersion: 2 },
      error: null,
    });
    await expect(
      loadMemberMapProjection({ rpc }, { roomId: source.roomId, version: 1 }),
    ).rejects.toThrow("map_projection_version_mismatch");
  });

  it("returns only remapped public identifiers after share authorization", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: source, error: null });
    const projection = await loadPublicMapProjection("A".repeat(43), {
      client: { rpc },
      generatedAt: "2026-07-18T14:00:00.000Z",
    });
    expect(projection).toMatchObject({
      roomId: "public-share",
      planVersionId: "public-version-1",
      privacyMode: "public_share",
    });
    expect(JSON.stringify(projection)).not.toContain(source.roomId);
    expect(JSON.stringify(projection)).not.toContain(source.tripPlanId);
  });

  it("returns one generic null state for invalid or revoked shares", async () => {
    expect(
      await loadPublicMapProjection("invalid", {
        client: { rpc: vi.fn() },
      }),
    ).toBeNull();
    expect(
      await loadPublicMapProjection("A".repeat(43), {
        client: {
          rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
        },
      }),
    ).toBeNull();
  });
});
