import { trailverse } from "@/server/site-configuration";

/**
 * Parks TrailVerse publishes a guide for, keyed by NPS park code.
 *
 * This is an allowlist rather than a rule so a cross-link can never 404 into
 * our own brand: NPS covers hundreds of units, TrailVerse covers these.
 */
const guidedParkCodes: ReadonlySet<string> = new Set([
  "acad",
  "arch",
  "badl",
  "bibe",
  "bisc",
  "blca",
  "brca",
  "cany",
  "care",
  "cave",
  "chis",
  "cong",
  "crla",
  "cuva",
  "deva",
  "drto",
  "ever",
  "gaar",
  "glac",
  "glba",
  "grba",
  "grca",
  "grsa",
  "grsm",
  "grte",
  "gumo",
  "hale",
  "havo",
  "hosp",
  "indu",
  "isro",
  "jotr",
  "katm",
  "kefj",
  "kica",
  "kova",
  "lacl",
  "lavo",
  "maca",
  "meve",
  "mora",
  "neri",
  "noca",
  "npsa",
  "olym",
  "pefo",
  "pinn",
  "redw",
  "romo",
  "sagu",
  "sequ",
  "shen",
  "thro",
  "viis",
  "voya",
  "whsa",
  "wica",
  "wrst",
  "yell",
  "yose",
  "zion",
]);

/**
 * Derives the TrailVerse guide for an already-verified official NPS source.
 *
 * Deliberately a rule over data Trailie has already cited, not something the
 * model can choose: NPS park pages live at `nps.gov/{parkCode}`, and TrailVerse
 * guides at `/parks/{parkCode}`. Trailie never authors these links, so it
 * cannot invent a park or a destination that does not exist.
 *
 * Returns null for anything that is not a guided park page.
 */
export function trailverseGuideUrl(sourceUrl: string | null): string | null {
  if (!sourceUrl) return null;

  let parsed: URL;
  try {
    parsed = new URL(sourceUrl);
  } catch {
    return null;
  }

  if (parsed.protocol !== "https:") return null;
  if (parsed.hostname !== "nps.gov" && !parsed.hostname.endsWith(".nps.gov"))
    return null;

  const [first] = parsed.pathname.split("/").filter(Boolean);
  if (!first) return null;

  const parkCode = first.toLowerCase();
  if (!guidedParkCodes.has(parkCode)) return null;

  return `${trailverse.url}/parks/${parkCode}`;
}
