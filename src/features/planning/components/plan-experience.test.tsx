import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createPlanningRequestAction,
  getPlanningRequestAction,
  reviewPlanningSummaryAction,
} from "../actions";
import { PlanExperience } from "./plan-experience";
import type { PlanningSummary } from "@trailie/schemas";
import {
  generateItineraryAction,
  getTripPlanAction,
} from "@/features/itinerary/actions";

vi.mock("../actions", () => ({
  createPlanningRequestAction: vi.fn(),
  getPlanningRequestAction: vi.fn(),
  reviewPlanningSummaryAction: vi.fn(),
  regeneratePlanningSummaryAction: vi.fn(),
}));
vi.mock("@/features/itinerary/actions", () => ({
  generateItineraryAction: vi.fn(),
  getTripPlanAction: vi.fn(),
  retryItineraryAction: vi.fn(),
}));
const id = "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2";
const summary: PlanningSummary = {
  schemaVersion: "1",
  title: "Before I build the trip",
  tripSnapshot: {
    destinations: ["Yosemite"],
    dateWindows: ["Sep 12–16"],
    travelerCount: 2,
    origins: [],
    budget: [],
    approvalMode: "all_active",
  },
  confirmedDecisions: [
    {
      id: "confirmed:0",
      label: "Destination",
      detail: "Yosemite",
      sourceMessageIds: [id],
    },
  ],
  travelerPreferences: [],
  constraints: [],
  proposals: [],
  rejectedOptions: [],
  conflicts: [],
  openQuestions: [],
  missingCriticalInformation: [],
  nonAssumptions: [],
  readiness: { status: "ready_for_review", blockers: [], warnings: [] },
  evidence: { memoryVersion: 1, latestMessageId: null, sourceMessageIds: [id] },
};
describe("PlanExperience", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getTripPlanAction).mockResolvedValue({ ok: true, data: null });
  });
  it("shows the empty action and starts semantic generation", async () => {
    vi.mocked(getPlanningRequestAction).mockResolvedValue({
      ok: true,
      data: null,
    });
    vi.mocked(createPlanningRequestAction).mockResolvedValue({
      ok: true,
      data: { id, status: "draft" },
    });
    render(<PlanExperience roomId={id} participantId={id} />);
    expect(
      await screen.findByRole("button", { name: "Build Our Itinerary" }),
    ).toBeEnabled();
    fireEvent.click(
      screen.getByRole("button", { name: "Build Our Itinerary" }),
    );
    expect(
      await screen.findByText(
        "Trailie is organizing what the crew has decided.",
      ),
    ).toBeVisible();
  });
  it("renders review sections and requires a note for changes", async () => {
    vi.mocked(getPlanningRequestAction).mockResolvedValue({
      ok: true,
      data: {
        id,
        roomId: id,
        status: "awaiting_review",
        approvalMode: "all_active",
        currentSummaryVersion: 1,
        approvedSummaryVersion: null,
        readinessStatus: "ready_for_review",
        summary,
        approvalState: {
          approvalMode: "all_active",
          summaryVersion: 1,
          requiredParticipants: [{ id, displayName: "Maya", role: "host" }],
          approvedParticipants: [],
          changeRequestedParticipants: [],
          pendingParticipants: [{ id, displayName: "Maya", role: "host" }],
          isComplete: false,
          isStale: false,
          blockers: [],
        },
        generationErrorCode: null,
        isStale: false,
        createdAt: "2026-07-13T00:00:00Z",
        updatedAt: "2026-07-13T00:00:00Z",
      },
    });
    render(<PlanExperience roomId={id} participantId={id} />);
    expect(
      await screen.findByRole("heading", { name: "Before I build the trip" }),
    ).toBeVisible();
    expect(screen.getByText("Confirmed decisions")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Request changes" }));
    expect(
      screen.getByText("Add a note before requesting changes."),
    ).toBeVisible();
    expect(reviewPlanningSummaryAction).not.toHaveBeenCalled();
  });
  it("starts one server-authorized itinerary from an approved summary", async () => {
    vi.mocked(getPlanningRequestAction).mockResolvedValue({
      ok: true,
      data: {
        id,
        roomId: id,
        status: "approved_for_generation",
        approvalMode: "all_active",
        currentSummaryVersion: 1,
        approvedSummaryVersion: 1,
        readinessStatus: "ready_for_review",
        summary,
        approvalState: null,
        generationErrorCode: null,
        isStale: false,
        createdAt: "2026-07-13T00:00:00Z",
        updatedAt: "2026-07-13T00:00:00Z",
      },
    });
    vi.mocked(generateItineraryAction).mockResolvedValue({
      ok: true,
      data: { id, status: "generating", version: 1, reused: false },
    });
    render(<PlanExperience roomId={id} participantId={id} />);
    const button = await screen.findByRole("button", {
      name: "Generate Itinerary",
    });
    fireEvent.click(button);
    expect(generateItineraryAction).toHaveBeenCalledWith({
      planningRequestId: id,
      participantId: id,
    });
  });
});
