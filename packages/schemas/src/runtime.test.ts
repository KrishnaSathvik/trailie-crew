import { describe, expect, it } from "vitest";

import { trailieProgressStageSchema, trailieStreamEventSchema } from "./index";

describe("Phase 8B Trailie progress protocol", () => {
  it("accepts only approved operational progress stages", () => {
    expect(trailieProgressStageSchema.options).toEqual([
      "reading_conversation",
      "checking_trip",
      "looking_up_current_information",
      "preparing_answer",
      "understanding_trip",
      "checking_dates_preferences",
      "building_day_by_day_plan",
      "checking_timing_routes",
      "preparing_itinerary",
      "reviewing_requested_change",
      "checking_current_plan",
      "measuring_impact",
      "updating_affected_parts",
      "checking_proposed_changes",
      "preparing_crew_review",
      "finding_verified_locations",
      "checking_route_information",
      "preparing_map",
      "checking_reservation_requirements",
      "finding_official_booking_options",
      "preparing_provider_links",
      "taking_longer",
    ]);
  });

  it("streams a typed stage without accepting free-form internal copy", () => {
    expect(
      trailieStreamEventSchema.parse({
        type: "progress_state",
        stage: "checking_trip",
      }),
    ).toEqual({
      type: "progress_state",
      stage: "checking_trip",
    });
    expect(
      trailieStreamEventSchema.safeParse({
        type: "progress_state",
        stage: "using_gpt_5_6_sol",
        message: "Queue 7, 42% complete",
      }).success,
    ).toBe(false);
  });
});
