import { describe, expect, it } from "vitest";

import { trailverseGuideUrl } from "./trailverse-guide";

describe("trailverseGuideUrl", () => {
  it("maps an official NPS park page to its TrailVerse guide", () => {
    expect(trailverseGuideUrl("https://www.nps.gov/olym/index.htm")).toBe(
      "https://www.nationalparksexplorerusa.com/parks/olym",
    );
  });

  it("accepts the bare nps.gov host and uppercase codes", () => {
    expect(trailverseGuideUrl("https://nps.gov/YELL/planyourvisit.htm")).toBe(
      "https://www.nationalparksexplorerusa.com/parks/yell",
    );
  });

  it("ignores NPS pages that are not a guided park", () => {
    // Real fallback URL used by the NPS adapter — must not become /parks/subjects.
    expect(
      trailverseGuideUrl(
        "https://www.nps.gov/subjects/developer/api-documentation.htm",
      ),
    ).toBeNull();
  });

  it("ignores parks TrailVerse does not cover", () => {
    expect(trailverseGuideUrl("https://www.nps.gov/mlkm/index.htm")).toBeNull();
  });

  it("ignores non-NPS and insecure sources", () => {
    expect(trailverseGuideUrl("https://example.com/olym")).toBeNull();
    expect(trailverseGuideUrl("http://www.nps.gov/olym/")).toBeNull();
    expect(
      trailverseGuideUrl("https://evil-nps.gov.example.com/olym"),
    ).toBeNull();
  });

  it("handles missing and malformed input", () => {
    expect(trailverseGuideUrl(null)).toBeNull();
    expect(trailverseGuideUrl("not a url")).toBeNull();
    expect(trailverseGuideUrl("https://www.nps.gov/")).toBeNull();
  });
});
