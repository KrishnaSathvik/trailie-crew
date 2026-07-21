import { describe, expect, it } from "vitest";

import { segmentMentions } from "./mentions";

const participants = [
  { id: "p1", displayName: "family trip" },
  { id: "p2", displayName: "Sam" },
  { id: "p3", displayName: "Sam Smith" },
];

describe("segmentMentions", () => {
  it("matches a display name containing spaces", () => {
    expect(segmentMentions("hi @family trip ok", participants, "p9")).toEqual([
      { kind: "text", text: "hi " },
      {
        kind: "person",
        text: "@family trip",
        participantId: "p1",
        isSelf: false,
      },
      { kind: "text", text: " ok" },
    ]);
  });

  it("prefers the longest matching name", () => {
    const [segment] = segmentMentions("@Sam Smith hi", participants, "p9");
    expect(segment).toMatchObject({ participantId: "p3", text: "@Sam Smith" });
  });

  it("matches case-insensitively and renders real capitalization", () => {
    const [segment] = segmentMentions("@FAMILY TRIP", participants, "p9");
    expect(segment).toMatchObject({ text: "@family trip" });
  });

  it("marks the current participant", () => {
    const [segment] = segmentMentions("@Sam hi", participants, "p2");
    expect(segment).toMatchObject({ isSelf: true });
  });

  it("ignores an @ inside a word", () => {
    expect(
      segmentMentions("mail me at sam@example.com", participants, "p9"),
    ).toEqual([{ kind: "text", text: "mail me at sam@example.com" }]);
  });

  it("requires a boundary after the name", () => {
    expect(segmentMentions("@family trips", participants, "p9")).toEqual([
      { kind: "text", text: "@family trips" },
    ]);
  });

  it("allows trailing punctuation", () => {
    const segments = segmentMentions("@Sam!", participants, "p9");
    expect(segments[0]).toMatchObject({ participantId: "p2" });
    expect(segments[1]).toEqual({ kind: "text", text: "!" });
  });

  it("recognizes Trailie with no participants", () => {
    expect(segmentMentions("@trailie plan it", [], "p9")).toEqual([
      { kind: "trailie", text: "@Trailie" },
      { kind: "text", text: " plan it" },
    ]);
  });

  it("leaves unknown names as text", () => {
    expect(segmentMentions("@nobody hi", participants, "p9")).toEqual([
      { kind: "text", text: "@nobody hi" },
    ]);
  });

  it("handles the same person mentioned twice", () => {
    const segments = segmentMentions("@Sam and @Sam", participants, "p9");
    expect(
      segments.filter((segment) => segment.kind === "person"),
    ).toHaveLength(2);
  });
});
