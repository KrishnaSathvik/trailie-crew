import { createClient } from "@supabase/supabase-js";

const roomCode = process.argv[2];
if (
  !roomCode ||
  !process.env.NEXT_PUBLIC_SUPABASE_URL ||
  !process.env.SUPABASE_SECRET_KEY
)
  throw new Error("diagnostic_configuration_missing");

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function normalizeEntityName(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function providerPlaceQuery(destination) {
  const parkName = destination.match(/^(.+?)\s+national\s+parks?\b/iu)?.[1];
  return parkName?.trim() || destination;
}

async function safeProviderMatchProfile(destination) {
  if (!process.env.MAPBOX_ACCESS_TOKEN || !process.env.NPS_API_KEY) return null;
  try {
    const providerQuery = providerPlaceQuery(destination);
    const mapboxUrl = new URL(
      "https://api.mapbox.com/search/geocode/v6/forward",
    );
    mapboxUrl.searchParams.set("q", providerQuery);
    mapboxUrl.searchParams.set("limit", "10");
    mapboxUrl.searchParams.set("access_token", process.env.MAPBOX_ACCESS_TOKEN);
    const npsUrl = new URL("https://developer.nps.gov/api/v1/parks");
    npsUrl.searchParams.set("q", providerQuery);
    npsUrl.searchParams.set("limit", "10");
    npsUrl.searchParams.set("api_key", process.env.NPS_API_KEY);
    const [mapboxResponse, npsResponse] = await Promise.all([
      fetch(mapboxUrl, { signal: AbortSignal.timeout(10_000) }),
      fetch(npsUrl, { signal: AbortSignal.timeout(10_000) }),
    ]);
    if (!mapboxResponse.ok || !npsResponse.ok)
      return {
        status: "unavailable",
        mapboxStatus: mapboxResponse.status,
        npsStatus: npsResponse.status,
      };
    const [mapboxPayload, npsPayload] = await Promise.all([
      mapboxResponse.json(),
      npsResponse.json(),
    ]);
    const expected = normalizeEntityName(providerQuery);
    const mapboxNames = (mapboxPayload.features ?? [])
      .map((feature) =>
        normalizeEntityName(
          feature.properties?.name_preferred ?? feature.properties?.name,
        ),
      )
      .filter(Boolean);
    const npsNames = (npsPayload.data ?? [])
      .map((park) => normalizeEntityName(park.fullName))
      .filter(Boolean);
    const embedded = (name) =>
      name.split(/\s+/u).length >= 2 && ` ${expected} `.includes(` ${name} `);
    return {
      status: "available",
      queryCharacterCount: providerQuery.length,
      queryWordCount: providerQuery.split(/\s+/u).filter(Boolean).length,
      mapboxCandidateCount: mapboxNames.length,
      npsCandidateCount: npsNames.length,
      mapboxEmbeddedOfficialNameCount: mapboxNames.filter(embedded).length,
      npsEmbeddedOfficialNameCount: npsNames.filter(embedded).length,
      uniqueSharedOfficialNameCount: new Set(
        mapboxNames.filter((name) => npsNames.includes(name)),
      ).size,
    };
  } catch {
    return { status: "unavailable", errorClass: "safe_smoke_failed" };
  }
}

const roomResult = await admin
  .from("rooms")
  .select("id,current_plan_version")
  .eq("room_code", roomCode)
  .single();
if (roomResult.error) throw new Error("diagnostic_room_unavailable");
const planningResult = await admin
  .from("planning_requests")
  .select(
    "status,current_summary_version,generation_attempt_count,generation_error_code,updated_at",
  )
  .eq("room_id", roomResult.data.id)
  .order("created_at");
if (planningResult.error) throw new Error("diagnostic_planning_unavailable");
const plansResult = await admin
  .from("trip_plans")
  .select(
    "id,planning_summary_id,version,status,validation_status,error_code,validation_summary",
  )
  .eq("room_id", roomResult.data.id)
  .order("version");
if (plansResult.error) throw new Error("diagnostic_plans_unavailable");

const plans = [];
for (const plan of plansResult.data) {
  const context = await admin.rpc("get_itinerary_generation_context", {
    target_trip_plan_id: plan.id,
  });
  const planningSummary = await admin
    .from("planning_summaries")
    .select("summary_json")
    .eq("id", plan.planning_summary_id)
    .single();
  const destinations =
    planningSummary.data?.summary_json?.tripSnapshot?.destinations ?? [];
  const providerProfiles = await Promise.all(
    destinations.map((destination) => safeProviderMatchProfile(destination)),
  );
  plans.push({
    version: plan.version,
    status: plan.status,
    validationStatus: plan.validation_status,
    errorCode: plan.error_code,
    validationIssueCount: plan.validation_summary?.issueCount ?? null,
    validationWarningCount: plan.validation_summary?.warningCount ?? null,
    latestIssueCodes:
      context.data?.latestValidation?.issues?.map((issue) => issue.code) ?? [],
    latestWarningCodes:
      context.data?.latestValidation?.warnings?.map((issue) => issue.code) ??
      [],
    destinationProfiles: destinations.map((destination) => ({
      characterCount: destination.length,
      wordCount: destination.trim().split(/\s+/u).filter(Boolean).length,
      containsNationalPark: /\bnational\s+park\b/iu.test(destination),
      containsStateQualifier: /,\s*(?:california|ca)\b/iu.test(destination),
    })),
    providerProfiles,
  });
}
const travel = await admin.rpc("get_travel_provider_acceptance_report", {
  target_room_id: roomResult.data.id,
});
if (travel.error) throw new Error("diagnostic_travel_report_unavailable");
const validation = await admin.rpc(
  "get_itinerary_validation_acceptance_report",
  { target_room_id: roomResult.data.id },
);
if (validation.error)
  throw new Error("diagnostic_validation_report_unavailable");

process.stdout.write(
  `${JSON.stringify({
    roomCode,
    currentPlanVersion: roomResult.data.current_plan_version,
    planning: planningResult.data.map((request) => ({
      status: request.status,
      summaryVersion: request.current_summary_version,
      attemptCount: request.generation_attempt_count,
      errorCode: request.generation_error_code,
      updatedAt: request.updated_at,
    })),
    plans,
    travel: travel.data,
    validation: validation.data,
  })}\n`,
);
