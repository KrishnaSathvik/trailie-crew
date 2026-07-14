import "server-only";

import { createHash } from "node:crypto";

import type { PublicSharedItinerary } from "@trailie/schemas";
import { contentHash } from "@/features/sharing/content-hash";

const CRLF = "\r\n";

function escapeText(value: string) {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("\r\n", "\\n")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;");
}

function foldLine(line: string) {
  const folded: string[] = [];
  let current = "";
  let limit = 75;
  for (const character of line) {
    if (Buffer.byteLength(current + character, "utf8") > limit) {
      folded.push(current);
      current = ` ${character}`;
      limit = 75;
    } else {
      current += character;
    }
  }
  folded.push(current);
  return folded.join(CRLF);
}

function localDateTime(date: string, time: string) {
  return `${date.replaceAll("-", "")}T${time.replace(":", "")}00`;
}

function utcStamp(timestamp: string) {
  return new Date(timestamp)
    .toISOString()
    .replaceAll(/[-:]/g, "")
    .replace(/\.\d{3}Z$/, "Z");
}

function uid(version: number, date: string, key: string) {
  const digest = createHash("sha256")
    .update(`trailie-ics:v1:${version}:${date}:${key}`, "utf8")
    .digest("hex")
    .slice(0, 32);
  return `${digest}@v${version}.trailie.crew`;
}

export function generateIcs(itinerary: PublicSharedItinerary) {
  const events: string[][] = [];
  let omittedUntimed = 0;
  for (const day of itinerary.days) {
    for (const item of day.items) {
      if (!item.startTime || !item.endTime) {
        omittedUntimed += 1;
        continue;
      }
      const description = [
        item.description,
        `Reservation: ${item.reservationStatus.replaceAll("_", " ")}`,
        `Data status: ${item.dataStatus}`,
        itinerary.disclaimer,
      ]
        .filter(Boolean)
        .join("\n");
      events.push([
        "BEGIN:VEVENT",
        `UID:${uid(itinerary.version, day.date, item.key)}`,
        `DTSTAMP:${utcStamp(itinerary.publishedAt)}`,
        `DTSTART;TZID=${itinerary.timezone}:${localDateTime(day.date, item.startTime)}`,
        `DTEND;TZID=${itinerary.timezone}:${localDateTime(day.date, item.endTime)}`,
        `SUMMARY:${escapeText(item.title)}`,
        `DESCRIPTION:${escapeText(description)}`,
        ...(item.location
          ? [`LOCATION:${escapeText(item.location.name)}`]
          : []),
        "STATUS:CONFIRMED",
        "TRANSP:OPAQUE",
        "END:VEVENT",
      ]);
    }
  }
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `PRODID:-//Trailie Crew//Itinerary Version ${itinerary.version}//EN`,
    `X-WR-CALNAME:${escapeText(`${itinerary.title} · Version ${itinerary.version}`)}`,
    `X-WR-TIMEZONE:${itinerary.timezone}`,
    `X-TRAILIE-PLAN-VERSION:${itinerary.version}`,
    `X-TRAILIE-CONTENT-HASH:${contentHash("ics:v1", itinerary)}`,
    `X-TRAILIE-OMITTED-UNTIMED:${omittedUntimed}`,
    ...events.flat(),
    "END:VCALENDAR",
  ];
  return {
    content: `${lines.map(foldLine).join(CRLF)}${CRLF}`,
    eventCount: events.length,
    omittedUntimed,
    contentHash: contentHash("ics:v1", itinerary),
  };
}
