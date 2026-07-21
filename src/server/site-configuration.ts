export const productionApplicationUrl = "https://app.trailiecrew.com";
export const publicRootUrl = "https://trailiecrew.com";
export const previewApplicationUrl = "https://preview.trailiecrew.com";
export const applicationBaseUrl =
  process.env.NEXT_PUBLIC_APP_URL ?? productionApplicationUrl;

/**
 * In-app navigation stays on whichever host is serving the page. `legalUrls`
 * remains the absolute canonical form for metadata and outbound references.
 */
export const legalPaths = {
  privacy: "/privacy",
  terms: "/terms",
  accuracy: "/accuracy",
  support: "/support",
} as const;

export const legalUrls = {
  privacy: `${publicRootUrl}/privacy`,
  terms: `${publicRootUrl}/terms`,
  accuracy: `${publicRootUrl}/accuracy`,
  support: `${publicRootUrl}/support`,
} as const;

/**
 * Trailie Crew is the group-planning surface of the wider TrailVerse product,
 * so the ecosystem link is configuration rather than a hardcoded URL.
 */
export const trailverse = {
  name: "TrailVerse",
  tagline: "Your universe of national parks exploration.",
  url: "https://www.nationalparksexplorerusa.com",
} as const;

export const trailieContactAddresses = {
  support: "support@trailiecrew.com",
  privacy: "privacy@trailiecrew.com",
  security: "security@trailiecrew.com",
} as const;
