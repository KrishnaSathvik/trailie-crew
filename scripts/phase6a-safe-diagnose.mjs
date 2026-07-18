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
const roomResult = await admin
  .from("rooms")
  .select("id,current_plan_version")
  .eq("room_code", roomCode)
  .single();
if (roomResult.error) throw new Error("diagnostic_room_unavailable");
const plansResult = await admin
  .from("trip_plans")
  .select("id,version,status,validation_status,error_code,validation_summary")
  .eq("room_id", roomResult.data.id)
  .order("version");
if (plansResult.error) throw new Error("diagnostic_plans_unavailable");

const plans = [];
for (const plan of plansResult.data) {
  const context = await admin.rpc("get_itinerary_generation_context", {
    target_trip_plan_id: plan.id,
  });
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
    plans,
    travel: travel.data,
    validation: validation.data,
  })}\n`,
);
