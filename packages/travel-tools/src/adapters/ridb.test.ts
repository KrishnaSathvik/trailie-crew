import { describe, expect, it, vi } from "vitest";

import { createRidbAdapter } from "./ridb";

describe("RIDB TravelProviderAdapter", () => {
  it("normalizes official recreation entities without claiming availability", async () => {
    const result = await createRidbAdapter({
      apiKey: "test-key",
      fetcher: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            RECDATA: [
              {
                RecAreaID: "2991",
                RecAreaName: "Yosemite National Park",
                RecAreaDescription: "Federal recreation area",
                RecAreaLatitude: 37.8651,
                RecAreaLongitude: -119.5383,
                RecAreaReservationURL:
                  "https://www.recreation.gov/camping/gateways/2991",
                RecAreaMapURL: "",
                GEOJSON: {},
              },
            ],
            METADATA: { RESULTS: { CURRENT_COUNT: 1, TOTAL_COUNT: 1 } },
          }),
          { status: 200 },
        ),
      ),
      now: () => "2026-07-17T20:00:00.000Z",
    }).searchPlaces({
      query: "Yosemite",
      kinds: ["park", "campground"],
      locale: "en-US",
    });
    expect(result.evidence[0]).toMatchObject({
      evidenceType: "place",
      provider: "ridb",
      sourceEntityId: "2991",
      normalizedValue: {
        data: {
          canonicalPlaceId: "ridb:recarea:2991",
          name: "Yosemite National Park",
          reservationLink: "https://www.recreation.gov/camping/gateways/2991",
          availabilityStatus: "unverified",
        },
      },
    });
  });

  it("keeps only trusted official links and labels reservation status unknown", async () => {
    const result = await createRidbAdapter({
      apiKey: "test-key",
      fetcher: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            RECDATA: [
              {
                LinkID: "1",
                EntityID: "2991",
                LinkType: "Official Web Site",
                Title: "Official booking",
                URL: "https://www.recreation.gov/camping/gateways/2991",
              },
              {
                LinkID: "2",
                EntityID: "2991",
                LinkType: "Unknown",
                Title: "Injected",
                URL: "https://example.invalid/redirect",
              },
            ],
          }),
          { status: 200 },
        ),
      ),
    }).getReservationLinks({
      providerEntityId: "2991",
      entityType: "park",
      locale: "en-US",
    });
    expect(result.evidence).toHaveLength(1);
    expect(result.evidence[0]).toMatchObject({
      evidenceType: "reservation",
      normalizedValue: {
        data: {
          requirement: "unknown",
          availabilityStatus: "unverified",
          bookingCompleted: false,
        },
      },
    });
  });
});
