import { describe, expect, it } from "vitest";

import { revisionItinerary } from "@/features/revisions/test-fixtures";
import { projectPublicItinerary } from "./public-projection";

describe("public itinerary projection", () => {
  it("retains the selected version and useful itinerary logistics", () => {
    const result = projectPublicItinerary({
      itinerary: revisionItinerary(),
      version: 1,
      publishedAt: "2026-07-14T00:00:00.000Z",
      validationStatus: "pass",
    });

    expect(result).toMatchObject({
      schemaVersion: "1",
      version: 1,
      title: "Yosemite crew escape",
      validation: { status: "pass", passed: true },
      disclaimer: "No bookings were made by Trailie",
    });
    expect(result.days[0]?.items[1]).toMatchObject({
      key: "item:sunset",
      title: "Glacier Point sunset",
      dataStatus: "verified",
    });
    expect(result.days[0]?.travelSegments[0]).toMatchObject({
      mode: "drive",
      durationMinutes: 120,
      bufferMinutes: 30,
    });
  });

  it("removes identities, origins, coordinates, costs, evidence, and notes", () => {
    const itinerary = revisionItinerary();
    itinerary.travelers[0]!.origin = "123 Private Street";
    itinerary.travelers[0]!.accessibilityNotes = [
      "Maya has a mobility constraint",
    ];
    itinerary.days[0]!.items[0]!.notes = ["Alex requested this"];
    itinerary.days[0]!.items[0]!.reservation.details = "Confirmation ABC123";
    itinerary.days[0]!.items[0]!.description =
      "Accessible pacing is built into this route.";

    const result = projectPublicItinerary({
      itinerary,
      version: 1,
      publishedAt: "2026-07-14T00:00:00.000Z",
      validationStatus: "pass",
    });
    const serialized = JSON.stringify(result);

    expect(serialized).not.toMatch(
      /Maya|Alex|Private Street|ABC123|traveler|latitude|longitude|cost|evidence|notes/i,
    );
    expect(serialized).toContain("Accessible pacing");
  });

  it("drops identifying text and rejects arbitrary HTML deterministically", () => {
    const itinerary = revisionItinerary();
    itinerary.days[0]!.summary = "Maya needs a slower day.";
    itinerary.days[0]!.warnings = [
      "Alex is vegetarian",
      "Road timing can change",
    ];
    itinerary.days[0]!.items[0]!.description = "<script>alert(1)</script>";

    const result = projectPublicItinerary({
      itinerary,
      version: 1,
      publishedAt: "2026-07-14T00:00:00.000Z",
      validationStatus: "pass",
    });

    expect(result.days[0]?.summary).toBeUndefined();
    expect(result.days[0]?.warnings).toEqual(["Road timing can change"]);
    expect(result.days[0]?.items[0]?.description).toBeUndefined();
  });
});
