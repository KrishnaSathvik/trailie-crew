import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { TripPlanView } from "@trailie/schemas";
import type { GuestComment } from "@/features/guest-comments/contracts";
import { createFakeItineraryProvider } from "../provider";
import { ItineraryExperience } from "./itinerary-experience";

vi.mock("@/features/maps/actions", () => ({
  getPlanMapProjectionAction: vi.fn().mockResolvedValue({
    ok: false,
    error: "projection_unavailable",
  }),
}));

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
      travelEvidence: [
        {
          evidenceId: "evidence:nps:park_closure:official-1",
          evidenceType: "park_closure",
          provider: "nps",
          sourceName: "National Park Service",
          sourceUrl: "https://www.nps.gov/yose/planyourvisit/conditions.htm",
          retrievedAt: "2026-07-13T18:00:00.000Z",
          validUntil: "2026-07-13T18:10:00.000Z",
          freshnessState: "fresh",
          verificationState: "verified",
          availabilityState: "available",
          confidence: "high",
          targetItemId: "item:sunset",
          headline: "Glacier Point Road closure",
        },
        {
          evidenceId: "evidence:openweather:weather_forecast:unavailable-1",
          evidenceType: "weather_forecast",
          provider: "openweather",
          sourceName: "OpenWeather One Call 3.0",
          sourceUrl: "https://openweathermap.org/api/one-call-3",
          retrievedAt: "2026-07-13T18:00:00.000Z",
          validUntil: null,
          freshnessState: "unavailable",
          verificationState: "failed",
          availabilityState: "unavailable",
          confidence: "low",
          targetItemId: null,
          headline: null,
        },
      ],
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
    fireEvent.click(screen.getByRole("tab", { name: "Evidence" }));
    expect(screen.getByText("Glacier Point Road closure")).toBeVisible();
    expect(screen.getByText("Verified")).toBeVisible();
    expect(
      screen.getByText(
        "Weather information is unavailable for this published version.",
      ),
    ).toBeVisible();
    expect(
      screen.getAllByRole("link", { name: "Open official source" })[0],
    ).toHaveAttribute("rel", "noreferrer noopener");
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

  it("keeps the published itinerary usable when its map projection is unavailable", async () => {
    const generated = await createFakeItineraryProvider().generate({
      operationKey: "map-test",
      model: "gpt-5.6-sol",
      safetyIdentifier: "safe",
      context: "fixture",
      signal: AbortSignal.timeout(1000),
    });
    const plan = {
      id,
      roomId: id,
      planningRequestId: id,
      version: 1,
      status: "published",
      validationStatus: "pass",
      basisSummaryVersion: 1,
      itinerary: generated.itinerary,
      validationSummary: null,
      progressEvents: [],
      createdAt: "2026-07-13T18:00:00.000Z",
      updatedAt: "2026-07-13T18:01:00.000Z",
      publishedAt: "2026-07-13T18:01:00.000Z",
      errorCode: null,
    } satisfies TripPlanView;
    render(<ItineraryExperience plan={plan} initialView="Map" />);
    expect(
      await screen.findByText(
        "Map view is unavailable. Your itinerary remains fully usable.",
      ),
    ).toBeVisible();
    fireEvent.click(screen.getByRole("tab", { name: "Day-by-day" }));
    expect(screen.getByText("Glacier Point sunset")).toBeVisible();
  });

  it("places exact-version comments beside their itinerary item", async () => {
    const generated = await createFakeItineraryProvider().generate({
      operationKey: "comments-test",
      model: "gpt-5.6-sol",
      safetyIdentifier: "safe",
      context: "fixture",
      signal: AbortSignal.timeout(1000),
    });
    const plan = {
      id,
      roomId: id,
      planningRequestId: id,
      version: 1,
      status: "published",
      validationStatus: "pass",
      basisSummaryVersion: 1,
      itinerary: generated.itinerary,
      validationSummary: null,
      progressEvents: [],
      createdAt: "2026-07-13T18:00:00.000Z",
      updatedAt: "2026-07-13T18:01:00.000Z",
      publishedAt: "2026-07-13T18:01:00.000Z",
      errorCode: null,
    } satisfies TripPlanView;
    const item = plan.itinerary.days[0].items[0];
    const comment = {
      id: id.replace(/2$/, "8"),
      planVersionId: id,
      planVersion: 1,
      dayKey: plan.itinerary.days[0].date,
      itemKey: item.id,
      authorType: "guest",
      authorDisplayName: "Jordan",
      body: "Could we start 30 minutes earlier?",
      resolved: false,
      deleted: false,
      createdAt: "2026-07-19T00:10:00.000Z",
      updatedAt: "2026-07-19T00:10:00.000Z",
    } satisfies GuestComment;

    render(
      <ItineraryExperience
        plan={plan}
        commenting={{
          mode: "member",
          comments: [comment],
          roomId: id,
          participantId: id,
        }}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Day-by-day" }));
    const itemHeading = screen.getByRole("heading", { name: item.title });
    const itemContainer = itemHeading.closest("li");
    expect(itemContainer).toHaveTextContent(
      "Could we start 30 minutes earlier?",
    );
    expect(
      itemContainer?.querySelector(`[aria-label="Comments on ${item.title}"]`),
    ).not.toBeNull();
  });

  it("offers an explicit retry for a transient failed generation", () => {
    const onRetry = vi.fn();
    const plan = {
      id,
      roomId: id,
      planningRequestId: id,
      version: 1,
      status: "failed",
      validationStatus: "pending",
      basisSummaryVersion: 1,
      itinerary: null,
      validationSummary: null,
      progressEvents: [],
      createdAt: "2026-07-13T18:00:00.000Z",
      updatedAt: "2026-07-13T18:00:00.000Z",
      publishedAt: null,
      errorCode: "model_timeout",
    } satisfies TripPlanView;
    render(<ItineraryExperience plan={plan} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole("button", { name: "Retry itinerary" }));
    expect(onRetry).toHaveBeenCalledOnce();
  });
});
