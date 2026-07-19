export type MapUnavailableReason =
  "maps_disabled" | "browser_token_missing" | "server_token_reused";

export type MapConfiguration = Readonly<{
  enabled: boolean;
  browserToken: string | null;
  styleUrl: string;
  unavailableReason: MapUnavailableReason | null;
  adapter: "mapbox" | "deterministic";
}>;

const defaultStyleUrl = "mapbox://styles/mapbox/standard";

function parseEnabled(value: string | undefined) {
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  throw new Error("MAPBOX_MAPS_ENABLED must be true or false.");
}

function parseStyleUrl(value: string | undefined) {
  const styleUrl = value?.trim() || defaultStyleUrl;
  if (/^mapbox:\/\/styles\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+$/u.test(styleUrl))
    return styleUrl;
  try {
    const parsed = new URL(styleUrl);
    if (
      parsed.protocol === "https:" &&
      parsed.hostname === "api.mapbox.com" &&
      parsed.pathname.startsWith("/styles/v1/")
    )
      return styleUrl;
  } catch {
    // The shared error below intentionally excludes the rejected URL.
  }
  throw new Error("Map style URL is not allowlisted.");
}

export function parseMapConfiguration(
  environment: Readonly<Record<string, string | undefined>>,
): MapConfiguration {
  const enabled = parseEnabled(environment.MAPBOX_MAPS_ENABLED);
  const styleUrl = parseStyleUrl(environment.MAPBOX_STYLE_URL);
  const adapterValue = environment.MAPBOX_MAP_ADAPTER ?? "mapbox";
  if (adapterValue !== "mapbox" && adapterValue !== "deterministic")
    throw new Error("Unknown map adapter.");
  const adapter = adapterValue;
  if (adapter === "deterministic" && environment.VERCEL_ENV === "production")
    throw new Error(
      "The deterministic map adapter is prohibited in production.",
    );
  if (!enabled)
    return {
      enabled: false,
      browserToken: null,
      styleUrl,
      unavailableReason: "maps_disabled",
      adapter,
    };
  if (adapter === "deterministic")
    return {
      enabled: true,
      browserToken: null,
      styleUrl,
      unavailableReason: null,
      adapter,
    };

  const browserToken = environment.NEXT_PUBLIC_MAPBOX_MAP_TOKEN?.trim() || null;
  if (browserToken === null)
    return {
      enabled: false,
      browserToken: null,
      styleUrl,
      unavailableReason: "browser_token_missing",
      adapter,
    };
  if (!browserToken.startsWith("pk."))
    throw new Error("A public Mapbox token is required for browser maps.");
  if (
    environment.MAPBOX_ACCESS_TOKEN?.trim() &&
    browserToken === environment.MAPBOX_ACCESS_TOKEN.trim()
  )
    return {
      enabled: false,
      browserToken: null,
      styleUrl,
      unavailableReason: "server_token_reused",
      adapter,
    };
  return {
    enabled: true,
    browserToken,
    styleUrl,
    unavailableReason: null,
    adapter,
  };
}
