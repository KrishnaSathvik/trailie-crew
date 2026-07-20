import { describe, expect, it } from "vitest";
import { buildApprovedSearchUrl, validateBookingUrl } from "./contracts";

describe("booking handoff URL safety", () => {
  it("requires HTTPS and an allowlisted host", () => {
    expect(
      validateBookingUrl("http://recreation.gov/a", ["recreation.gov"]),
    ).toBeNull();
    expect(
      validateBookingUrl("https://evil.example/a", ["recreation.gov"]),
    ).toBeNull();
    expect(
      validateBookingUrl("https://www.recreation.gov/a", ["recreation.gov"]),
    ).not.toBeNull();
  });
  it("encodes only approved search parameters", () => {
    expect(
      buildApprovedSearchUrl(
        "https://hotels.example/search",
        { destination: "Zion & Bryce", checkin: "2026-08-01", travelers: 2 },
        ["hotels.example"],
      ),
    ).toBe(
      "https://hotels.example/search?destination=Zion+%26+Bryce&checkin=2026-08-01&travelers=2",
    );
    expect(
      buildApprovedSearchUrl(undefined, { destination: "Zion" }, [
        "hotels.example",
      ]),
    ).toBeNull();
  });
});
