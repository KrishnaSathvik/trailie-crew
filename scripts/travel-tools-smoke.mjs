if (!process.env.MAPBOX_ACCESS_TOKEN) {
  console.log(
    "Travel-tools smoke test: skipped (MAPBOX_ACCESS_TOKEN is not set).",
  );
  process.exit(0);
}

const url = new URL("https://api.mapbox.com/search/geocode/v6/forward");
url.searchParams.set("q", "Yosemite Valley");
url.searchParams.set("limit", "1");
url.searchParams.set("access_token", process.env.MAPBOX_ACCESS_TOKEN);
const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
if (!response.ok)
  throw new Error(`Travel-tools smoke failed with HTTP ${response.status}.`);
const payload = await response.json();
if (!payload.features?.[0]?.geometry?.coordinates)
  throw new Error("Travel-tools smoke returned no normalized coordinates.");
console.log("Travel-tools smoke test: passed using Mapbox geocoding.");
