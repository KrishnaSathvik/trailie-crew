import { describe, expect, it } from "vitest";

import {
  legalUrls,
  productionApplicationUrl,
  trailieContactAddresses,
} from "./site-configuration";

describe("Production URL source of truth", () => {
  it("uses the final app origin and root-domain legal surfaces", () => {
    expect(productionApplicationUrl).toBe("https://app.trailiecrew.com");
    expect(legalUrls).toEqual({
      privacy: "https://trailiecrew.com/privacy",
      terms: "https://trailiecrew.com/terms",
      accuracy: "https://trailiecrew.com/accuracy",
      support: "https://trailiecrew.com/support",
    });
  });

  it("records the final role addresses without claiming delivery", () => {
    expect(trailieContactAddresses).toEqual({
      support: "support@trailiecrew.com",
      privacy: "privacy@trailiecrew.com",
      security: "security@trailiecrew.com",
    });
  });
});
