import { describe, expect, it } from "vitest";

import { classifyTrailieIntent, getTrailieIntentPolicy } from "./intent";

describe("Trailie intent contract", () => {
  it.each([
    ["Is Yellowstone good in October?", "direct_question"],
    ["Suggest some places for our trip", "destination_discovery"],
    ["Compare Yellowstone and Grand Teton", "destination_comparison"],
    ["What does everyone want?", "trip_context_question"],
    ["I prefer quiet hotels", "preference_capture"],
    ["Plan around my girlfriend's knee pain", "constraint_capture"],
    ["Are we ready to plan?", "planning_readiness"],
    ["Build our trip now", "create_itinerary"],
    ["What time does the hike start?", "itinerary_question"],
    ["Can you move the hike to Tuesday?", "itinerary_revision"],
    ["Where is the visitor center on the map?", "map_question"],
    ["How long is the drive from the hotel?", "route_question"],
    ["Where should we stay?", "lodging_recommendation"],
    ["Find hotels near the park", "lodging_search"],
    ["Which airport should we use?", "flight_guidance"],
    ["Compare driving and flying", "flight_guidance"],
    ["Find flights from Chicago", "flight_search"],
    ["Do we need a reservation?", "reservation_question"],
    ["Book this hotel", "booking_handoff"],
    ["What source confirms that closure?", "evidence_question"],
    ["What will the weather be like?", "weather_question"],
    ["Does this hike need a permit?", "permit_question"],
    ["Half of us want hiking and half want museums", "group_conflict"],
    ["Who still needs to approve?", "approval_question"],
    ["What changed from Version 1?", "version_question"],
    ["Send an email to the hotel", "unsupported_action"],
  ])("classifies %s as %s", (request, expected) => {
    expect(classifyTrailieIntent({ request })).toBe(expected);
  });

  it("routes booking execution to a handoff that cannot persist a booking", () => {
    expect(getTrailieIntentPolicy("booking_handoff")).toMatchObject({
      persistence: "none",
      approvalRequired: false,
      outputBlocks: ["booking_options", "warning"],
    });
  });

  it("gates itinerary creation behind understanding and approval", () => {
    expect(getTrailieIntentPolicy("create_itinerary")).toMatchObject({
      persistence: "none",
      approvalRequired: true,
      outputBlocks: ["understanding_summary", "approval_status"],
    });
  });

  it("requires material changes to enter the revision workflow", () => {
    expect(getTrailieIntentPolicy("itinerary_revision")).toMatchObject({
      persistence: "propose_revision",
      approvalRequired: true,
    });
  });

  it("requires fresh evidence for weather, permits, routes, and inventory", () => {
    for (const intent of [
      "weather_question",
      "permit_question",
      "route_question",
      "lodging_search",
      "flight_search",
    ] as const) {
      expect(getTrailieIntentPolicy(intent).externalEvidence).toBe("required");
    }
  });
});
