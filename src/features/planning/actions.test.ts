import { beforeEach, describe, expect, it, vi } from "vitest";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { schedulePlanningSummary } from "./scheduler";
import {
  cancelPlanningSummaryAction,
  createPlanningRequestAction,
  reviewPlanningSummaryAction,
} from "./actions";

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));
vi.mock("./scheduler", () => ({ schedulePlanningSummary: vi.fn() }));
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
describe("planning actions", () => {
  beforeEach(() => vi.clearAllMocks());
  it("creates idempotently and schedules only a newly created request", async () => {
    const rpc = client({
      id,
      status: "draft",
      currentSummaryVersion: 0,
      created: true,
    });
    await expect(
      createPlanningRequestAction({ roomId: id, participantId: id }),
    ).resolves.toMatchObject({ ok: true });
    expect(rpc).toHaveBeenCalledWith("create_planning_request", {
      target_room_id: id,
      participant_id: id,
    });
    expect(schedulePlanningSummary).toHaveBeenCalledWith(id);
  });
  it("requires a change note before opening the database", async () => {
    await expect(
      reviewPlanningSummaryAction({
        planningRequestId: id,
        summaryVersion: 1,
        participantId: id,
        decision: "changes_requested",
        note: "",
      }),
    ).resolves.toEqual({ ok: false, error: "changes_note_required" });
    expect(createServerSupabaseClient).not.toHaveBeenCalled();
  });
  it("stops active summary generation without scheduling another worker", async () => {
    const rpc = client({ id, status: "cancelled" });
    await expect(
      cancelPlanningSummaryAction({
        planningRequestId: id,
        participantId: id,
      }),
    ).resolves.toEqual({ ok: true, data: { id, status: "cancelled" } });
    expect(rpc).toHaveBeenCalledWith("cancel_planning_generation", {
      target_request_id: id,
      target_participant_id: id,
    });
    expect(schedulePlanningSummary).not.toHaveBeenCalled();
  });
});
