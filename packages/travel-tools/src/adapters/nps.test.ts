import { describe, expect, it, vi } from "vitest";

import { createNpsAdapter } from "./nps";

describe("NPS TravelProviderAdapter", () => {
  it("normalizes official park identity, hours, fees, accessibility, and URLs", async () => {
    const fetcher = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [
            {
              id: "nps-yose",
              parkCode: "yose",
              fullName: "Yosemite National Park",
              description: "Official park summary",
              url: "https://www.nps.gov/yose/index.htm",
              latitude: "37.8651",
              longitude: "-119.5383",
              states: "CA",
              contacts: { phoneNumbers: [], emailAddresses: [] },
              operatingHours: [
                {
                  name: "Yosemite National Park",
                  description: "Open year-round",
                  standardHours: { monday: "All Day" },
                  exceptions: [],
                },
              ],
              entranceFees: [
                {
                  title: "Private Vehicle",
                  cost: "35.00",
                  description: "Seven day entrance",
                },
              ],
              accessibility: {
                wheelchairAccess: "Contact the park for current details.",
              },
              directionsInfo: "Use official directions.",
              weatherInfo: "Mountain weather changes quickly.",
            },
          ],
        }),
        { status: 200 },
      ),
    );
    const result = await createNpsAdapter({
      apiKey: "test-key",
      fetcher,
      now: () => "2026-07-17T20:00:00.000Z",
    }).getPark({ parkCode: "yose", locale: "en-US" });
    expect(result.evidence.map((item) => item.evidenceType)).toEqual([
      "park",
      "operating_hours",
      "fee",
      "accessibility",
    ]);
    expect(result.evidence[0]).toMatchObject({
      provider: "nps",
      sourceEntityId: "yose",
      verificationState: "verified",
      normalizedValue: {
        data: {
          parkCode: "yose",
          officialName: "Yosemite National Park",
          officialUrl: "https://www.nps.gov/yose/index.htm",
        },
      },
    });
  });

  it("normalizes closure severity and active status from the current official alert feed", async () => {
    const result = await createNpsAdapter({
      apiKey: "test-key",
      fetcher: vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            data: [
              {
                id: "alert-1",
                parkCode: "yose",
                title: "Road closed",
                description: "Official closure detail",
                category: "Park Closure",
                url: "https://www.nps.gov/yose/planyourvisit/conditions.htm",
                lastIndexedDate: "2026-07-17 12:00:00.0",
              },
            ],
          }),
          { status: 200 },
        ),
      ),
      now: () => "2026-07-17T20:00:00.000Z",
    }).getParkAlerts({ parkCode: "yose", locale: "en-US" });
    expect(result.evidence[0]).toMatchObject({
      evidenceType: "park_closure",
      normalizedValue: {
        data: {
          alertId: "alert-1",
          severity: "closure",
          activeStatus: "active",
        },
      },
    });
  });
});
