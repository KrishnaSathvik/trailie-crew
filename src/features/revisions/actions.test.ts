import { beforeEach, describe, expect, it, vi } from "vitest";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { schedulePlanChange, schedulePlanChangePublication } from "./scheduler";
import {
  confirmPlanChangeAction,
  createPlanChangeRequestAction,
  reviewPlanChangeAction,
} from "./actions";

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: vi.fn(),
}));
vi.mock("./scheduler", () => ({
  schedulePlanChange: vi.fn(),
  schedulePlanChangePublication: vi.fn(),
}));

const ids = {
  plan: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a1",
  participant: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2",
  request: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a3",
  candidate: "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a4",
};

describe("revision actions", () => {
  const rpc = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(createServerSupabaseClient).mockResolvedValue({
      auth: {
        getUser: vi
          .fn()
          .mockResolvedValue({ data: { user: { id: "user" } }, error: null }),
      },
      rpc,
    } as never);
  });

  it("creates only an explicit request and schedules its analysis", async () => {
    rpc.mockResolvedValue({
      data: {
        id: ids.request,
        roomId: ids.plan,
        status: "draft",
        basePlanVersion: 1,
        created: true,
      },
      error: null,
    });
    const result = await createPlanChangeRequestAction({
      baseTripPlanId: ids.plan,
      participantId: ids.participant,
      requestType: "move_item",
      targetItemId: "item:sunset",
      requestText: "Move this later",
    });
    expect(result.ok).toBe(true);
    expect(schedulePlanChange).toHaveBeenCalledWith(ids.request);
  });

  it("schedules generation only after the required analysis approvals complete", async () => {
    rpc.mockResolvedValue({
      data: { id: ids.request, status: "approved", complete: true },
      error: null,
    });
    await reviewPlanChangeAction({
      changeRequestId: ids.request,
      analysisVersion: 1,
      participantId: ids.participant,
      decision: "approved",
      note: null,
    });
    expect(schedulePlanChange).toHaveBeenCalledWith(ids.request);
  });

  it("schedules publication only after final confirmation completes", async () => {
    rpc.mockResolvedValue({
      data: {
        id: ids.request,
        status: "awaiting_confirmation",
        complete: true,
      },
      error: null,
    });
    await confirmPlanChangeAction({
      changeRequestId: ids.request,
      candidateTripPlanId: ids.candidate,
      participantId: ids.participant,
      decision: "confirmed",
      note: null,
    });
    expect(schedulePlanChangePublication).toHaveBeenCalledWith(ids.request);
  });
});
