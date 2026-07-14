import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TripPlanView } from "@trailie/schemas";
import { createFakeItineraryProvider } from "../provider";
import { ItineraryExperience } from "./itinerary-experience";

const id = "0198a0b2-07f0-7c80-9d5f-7f9cf7a950a2";

describe("ItineraryExperience", () => {
  it("shows persisted semantic progress without model reasoning", () => {
    const plan: TripPlanView = {
      id,
      roomId: id,
      planningRequestId: id,
      version: 1,
      status: "validating",
      validationStatus: "needs_revision",
      basisSummaryVersion: 1,
      itinerary: null,
      validationSummary: null,
      progressEvents: [
        {
          id,
          tripPlanId: id,
          type: "generation_started",
          createdAt: "2026-07-13T18:00:00.000Z",
        },
        {
          id: id.replace(/2$/, "3"),
          tripPlanId: id,
          type: "route_validation_started",
          createdAt: "2026-07-13T18:00:01.000Z",
        },
        {
          id: id.replace(/2$/, "4"),
          tripPlanId: id,
          type: "repair_started",
          createdAt: "2026-07-13T18:00:02.000Z",
        },
      ],
      createdAt: "2026-07-13T18:00:00.000Z",
      updatedAt: "2026-07-13T18:00:02.000Z",
      publishedAt: null,
      errorCode: null,
    };
    render(<ItineraryExperience plan={plan} />);
    expect(screen.getByText("Checking routes and timing")).toBeVisible();
    expect(screen.getByText("Adjusting a scheduling conflict")).toBeVisible();
    expect(screen.queryByText(/reasoning/i)).not.toBeInTheDocument();
  });

  it("renders published overview, day, travel, stay, food, and validation views", async () => {
    const generated = await createFakeItineraryProvider().generate({
      operationKey: "test",
      model: "gpt-5.6-sol",
      safetyIdentifier: "safe",
      context: "fixture",
      signal: AbortSignal.timeout(1000),
    });
    const plan: TripPlanView = {
      id,
      roomId: id,
      planningRequestId: id,
      version: 1,
      status: "published",
      validationStatus: "pass",
      basisSummaryVersion: 1,
      itinerary: generated.itinerary,
      validationSummary: {
        validatorVersion: "trailie-itinerary-validator-v1",
        status: "pass",
        issues: [],
        warnings: [],
        passedChecks: ["route_duration", "confirmed_decisions"],
        repairedIssues: ["route_timing_impossible"],
        evidenceLastCheckedAt: "2026-07-13T18:00:00.000Z",
      },
      progressEvents: [],
      createdAt: "2026-07-13T18:00:00.000Z",
      updatedAt: "2026-07-13T18:01:00.000Z",
      publishedAt: "2026-07-13T18:01:00.000Z",
      errorCode: null,
    };
    render(<ItineraryExperience plan={plan} />);
    expect(
      screen.getByRole("heading", { name: "Yosemite crew escape" }),
    ).toBeVisible();
    expect(screen.getAllByText("Validated before publishing")[0]).toBeVisible();
    expect(
      screen.getByText(
        "Trailie adjusted the schedule after checking travel time.",
      ),
    ).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "Day-by-day" }));
    expect(screen.getByText("Glacier Point sunset")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Travel" }));
    expect(screen.getByText(/Unverified route|2 hr/)).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Stay" }));
    expect(screen.getByText("No reservation has been made")).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Food" }));
    expect(
      screen.getByText("No verified restaurant details yet"),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Validation" }));
    expect(screen.getByText("2 checks passed")).toBeVisible();
  });

  it("renders safe blocked and failed terminal states", () => {
    const plan = {
      id,
      roomId: id,
      planningRequestId: id,
      version: 1,
      status: "blocked",
      validationStatus: "blocked",
      basisSummaryVersion: 1,
      itinerary: null,
      validationSummary: null,
      progressEvents: [],
      createdAt: "2026-07-13T18:00:00.000Z",
      updatedAt: "2026-07-13T18:00:00.000Z",
      publishedAt: null,
      errorCode: "validation_blocked",
    } satisfies TripPlanView;
    render(<ItineraryExperience plan={plan} />);
    expect(
      screen.getByRole("heading", {
        name: "This itinerary cannot be published yet.",
      }),
    ).toBeVisible();
    expect(screen.queryByText(/sql|stack|provider/i)).not.toBeInTheDocument();
  });
});
