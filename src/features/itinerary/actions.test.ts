import { beforeEach, describe, expect, it, vi } from "vitest";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { scheduleItineraryGeneration } from "./scheduler";
import { generateItineraryAction, getTripPlanAction } from "./actions";

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));
vi.mock("./scheduler", () => ({ scheduleItineraryGeneration: vi.fn() }));
const id = "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2";

function client(data: unknown, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  vi.mocked(createServerSupabaseClient).mockResolvedValue({
    auth: {
      getUser: vi
        .fn()
        .mockResolvedValue({ data: { user: { id } }, error: null }),
    },
    rpc,
  } as never);
  return rpc;
}

describe("itinerary actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("starts only a newly created server-authorized generation", async () => {
    const rpc = client({ id, status: "generating", version: 1, created: true });
    await expect(
      generateItineraryAction({ planningRequestId: id, participantId: id }),
    ).resolves.toMatchObject({ ok: true, data: { id, reused: false } });
    expect(rpc).toHaveBeenCalledWith("create_itinerary_generation", {
      target_planning_request_id: id,
      participant_id: id,
    });
    expect(scheduleItineraryGeneration).toHaveBeenCalledWith(id);
  });

  it("reuses and safely resumes duplicate generation clicks", async () => {
    client({ id, status: "validating", version: 1, created: false });
    await expect(
      generateItineraryAction({ planningRequestId: id, participantId: id }),
    ).resolves.toMatchObject({ ok: true, data: { reused: true } });
    expect(scheduleItineraryGeneration).toHaveBeenCalledWith(id);
  });

  it("maps stale approval and membership errors without raw SQL", async () => {
    client(null, { message: "Approved summary is stale. internal detail" });
    await expect(
      generateItineraryAction({ planningRequestId: id, participantId: id }),
    ).resolves.toEqual({ ok: false, error: "approved_summary_stale" });
  });

  it("rejects malformed plan reads before opening the database", async () => {
    await expect(getTripPlanAction("not-a-room")).resolves.toEqual({
      ok: false,
      error: "unknown_error",
    });
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });
});
