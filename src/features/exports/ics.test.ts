import { describe, expect, it } from "vitest";

import { revisionItinerary } from "@/features/revisions/test-fixtures";
import { projectPublicItinerary } from "@/features/sharing/public-projection";
import { generateIcs } from "./ics";

function projection(version = 1) {
  return projectPublicItinerary({
    itinerary: revisionItinerary(),
    version,
    publishedAt: "2026-07-14T00:00:00.000Z",
    validationStatus: "pass",
  });
}

describe("version-specific ICS export", () => {
  it("builds one deterministic RFC 5545 calendar with stable version UIDs", () => {
    const first = generateIcs(projection(1));
    const repeated = generateIcs(projection(1));
    expect(first.content).toBe(repeated.content);
    expect(first.content).toMatch(/^BEGIN:VCALENDAR\r\nVERSION:2.0\r\n/);
    expect(first.content).toContain(
      "PRODID:-//Trailie Crew//Itinerary Version 1//EN\r\n",
    );
    expect(first.content.match(/BEGIN:VEVENT/g)).toHaveLength(3);
    expect(first.content).toContain(
      "DTSTART;TZID=America/Los_Angeles:20260912T110000\r\n",
    );
    expect(first.content).toContain(
      "DTEND;TZID=America/Los_Angeles:20260912T150000\r\n",
    );
    expect(first.content).toContain("DTSTAMP:20260714T000000Z\r\n");
    expect(first.content).toMatch(/UID:[a-f0-9]{32}@v1\.trailie\.crew\r\n/);
    expect(first.content.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(first.content.replaceAll("\r\n", "")).not.toContain("\n");
  });

  it("escapes text, folds every content line to 75 UTF-8 octets, and omits URLs", () => {
    const value = projection(1);
    value.days[0]!.items[0]!.title = "Café, ridge; path \\ " + "é".repeat(60);
    value.days[0]!.items[0]!.description = "First line\nSecond line";
    const result = generateIcs(value);
    expect(result.content).toContain("Café\\, ridge\\; path \\\\ ");
    expect(result.content).toContain("First line\\nSecond line");
    expect(result.content).not.toMatch(/^URL:/m);
    for (const line of result.content.split("\r\n")) {
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
    }
  });

  it("omits untimed items without inventing dates and reports the count", () => {
    const value = projection(1);
    value.days[0]!.items[0]!.startTime = null;
    value.days[0]!.items[0]!.endTime = null;
    const result = generateIcs(value);
    expect(result.omittedUntimed).toBe(1);
    expect(result.eventCount).toBe(2);
    expect(result.content).toContain("X-TRAILIE-OMITTED-UNTIMED:1\r\n");
    expect(result.content).not.toContain("SUMMARY:Valley walk");
  });

  it("distinguishes Version 1 and Version 2 and includes no private data", () => {
    const first = generateIcs(projection(1)).content;
    const second = generateIcs(projection(2)).content;
    expect(first).not.toBe(second);
    expect(first).toContain("@v1.trailie.crew");
    expect(second).toContain("@v2.trailie.crew");
    expect(first).not.toMatch(
      /Maya|Chicago|vegetarian|evidence:route|latitude/i,
    );
  });
});
