import { describe, expect, it, vi } from "vitest";

import { createOpenWeatherAdapter } from "./openweather";

const payload = {
  lat: 37.8651,
  lon: -119.5383,
  timezone: "America/Los_Angeles",
  timezone_offset: -25200,
  daily: [
    {
      dt: 1784386800,
      sunrise: 1784375400,
      sunset: 1784427300,
      temp: { min: 52, max: 82 },
      pop: 0.25,
      wind_speed: 12,
      weather: [{ main: "Clear", description: "clear sky" }],
    },
  ],
  alerts: [
    {
      sender_name: "National Weather Service",
      event: "Heat Advisory",
      start: 1784380000,
      end: 1784420000,
      description: "Official warning text",
      tags: ["Heat"],
    },
  ],
};

describe("OpenWeather TravelProviderAdapter", () => {
  it("normalizes date/location-bound forecast, alerts, timezone, and daylight", async () => {
    const fetcher = vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(new Response(JSON.stringify(payload), { status: 200 })),
      );
    const adapter = createOpenWeatherAdapter({
      apiKey: "test-key",
      fetcher,
      now: () => "2026-07-17T20:00:00.000Z",
    });
    const result = await adapter.getWeather({
      latitude: 37.8651,
      longitude: -119.5383,
      startDate: "2026-07-18",
      endDate: "2026-07-18",
      locale: "en-US",
    });
    expect(result.state).toBe("available");
    expect(result.evidence.map((item) => item.evidenceType)).toEqual([
      "weather_forecast",
      "severe_weather",
    ]);
    expect(result.evidence[0]).toMatchObject({
      normalizedValue: {
        data: {
          date: "2026-07-18",
          timezone: "America/Los_Angeles",
          low: 52,
          high: 82,
          precipitationProbability: 0.25,
          windSpeed: 12,
        },
      },
    });

    const daylight = await adapter.getDaylight({
      latitude: 37.8651,
      longitude: -119.5383,
      date: "2026-07-18",
      locale: "en-US",
    });
    expect(daylight.evidence.map((item) => item.evidenceType)).toEqual([
      "sunrise",
      "sunset",
    ]);
    expect(daylight.evidence[0].locationBinding?.timezone).toBe(
      "America/Los_Angeles",
    );
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("marks unsupported forecast dates and polar daylight as unavailable", async () => {
    const adapter = createOpenWeatherAdapter({
      apiKey: "test-key",
      fetcher: vi.fn().mockImplementation(() =>
        Promise.resolve(
          new Response(
            JSON.stringify({
              ...payload,
              daily: [
                {
                  ...payload.daily[0],
                  sunrise: undefined,
                  sunset: undefined,
                },
              ],
            }),
            { status: 200 },
          ),
        ),
      ),
    });
    const outside = await adapter.getWeather({
      latitude: 37,
      longitude: -119,
      startDate: "2026-08-10",
      endDate: "2026-08-10",
      locale: "en-US",
    });
    expect(outside.evidence[0]).toMatchObject({
      freshnessState: "unavailable",
      availabilityState: "unsupported",
      errorState: { code: "forecast_horizon_unsupported" },
    });

    const polar = await adapter.getDaylight({
      latitude: 89,
      longitude: 0,
      date: "2026-07-18",
      locale: "en-US",
    });
    expect(
      polar.evidence.every((item) => item.availabilityState === "unavailable"),
    ).toBe(true);
  });

  it("classifies a One Call entitlement failure without returning provider text", async () => {
    const result = await createOpenWeatherAdapter({
      apiKey: "test-key",
      fetcher: vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: "secret account detail" }), {
          status: 401,
        }),
      ),
    }).getWeather({
      latitude: 37,
      longitude: -119,
      startDate: "2026-07-18",
      endDate: "2026-07-18",
      locale: "en-US",
    });
    expect(result.evidence[0].errorState).toEqual({
      code: "invalid_key",
      retryable: false,
      httpStatus: 401,
    });
    expect(JSON.stringify(result)).not.toContain("secret account detail");
  });
});
