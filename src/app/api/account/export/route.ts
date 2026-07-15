import { NextResponse } from "next/server";
import { planVersionSummarySchema, tripPlanViewSchema } from "@trailie/schemas";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { projectPublicItinerary } from "@/features/sharing/public-projection";
import { createCorrelationId, logOperation } from "@/server/operations/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  const correlationId = createCorrelationId();
  const startedAt = Date.now();
  const client = await createServerSupabaseClient();
  const { data: authData, error: authError } = await client.auth.getUser();
  const user = authError ? null : authData.user;
  if (!user)
    return NextResponse.json(
      { error: "authentication_required" },
      { status: 401 },
    );

  const { data: memberships, error: membershipError } = await client
    .from("participants")
    .select("id,room_id,display_name,role,status,joined_at,last_seen_at")
    .eq("user_id", user.id);
  if (membershipError)
    return NextResponse.json({ error: "export_unavailable" }, { status: 503 });
  const roomIds = [
    ...new Set((memberships ?? []).map((membership) => membership.room_id)),
  ];
  const participantIds = (memberships ?? []).map((membership) => membership.id);
  const [
    rooms,
    messages,
    planningRequests,
    planningReviews,
    revisionRequests,
    revisionReviews,
  ] = await Promise.all([
    roomIds.length
      ? client
          .from("rooms")
          .select(
            "id,name,room_code,status,current_plan_version,created_at,updated_at",
          )
          .in("id", roomIds)
      : Promise.resolve({ data: [], error: null }),
    client
      .from("messages")
      .select(
        "id,room_id,message_type,body,reply_to_message_id,created_at,edited_at,deleted_at",
      )
      .eq("sender_user_id", user.id),
    client
      .from("planning_requests")
      .select(
        "id,room_id,status,approval_mode,current_summary_version,approved_summary_version,created_at,updated_at,approved_at,cancelled_at",
      )
      .eq("requested_by_user_id", user.id),
    client
      .from("planning_approvals")
      .select(
        "id,planning_request_id,summary_version,decision,note,created_at,updated_at",
      )
      .eq("user_id", user.id),
    client
      .from("plan_change_requests")
      .select(
        "id,room_id,base_plan_version,request_type,target_item_id,request_text,status,approval_mode,created_at,updated_at,approved_at,published_at,cancelled_at",
      )
      .eq("requested_by_user_id", user.id),
    participantIds.length
      ? client
          .from("plan_change_approvals")
          .select(
            "id,change_request_id,analysis_version,decision,note,created_at,updated_at",
          )
          .in("participant_id", participantIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (
    [
      rooms,
      messages,
      planningRequests,
      planningReviews,
      revisionRequests,
      revisionReviews,
    ].some((result) => result.error)
  )
    return NextResponse.json({ error: "export_unavailable" }, { status: 503 });

  const planVersions = [];
  for (const roomId of roomIds) {
    const listed = await client.rpc("list_plan_versions", {
      target_room_id: roomId,
    });
    const summaries = planVersionSummarySchema.array().safeParse(listed.data);
    if (listed.error || !summaries.success)
      return NextResponse.json(
        { error: "export_unavailable" },
        { status: 503 },
      );
    for (const summary of summaries.data) {
      const result = await client.rpc("get_trip_plan_version", {
        target_room_id: roomId,
        target_version: summary.version,
      });
      const plan = tripPlanViewSchema.safeParse(result.data);
      if (result.error || !plan.success)
        return NextResponse.json(
          { error: "export_unavailable" },
          { status: 503 },
        );
      planVersions.push(plan.data);
    }
  }

  const payload = {
    format: "trailie-personal-data",
    version: 1,
    exportedAt: new Date().toISOString(),
    subject: {
      userId: user.id,
      anonymous: user.is_anonymous === true,
      createdAt: user.created_at,
    },
    memberships: memberships ?? [],
    rooms: rooms.data ?? [],
    messages: messages.data ?? [],
    planningActions: {
      requests: planningRequests.data ?? [],
      reviews: planningReviews.data ?? [],
    },
    revisionActions: {
      requests: revisionRequests.data ?? [],
      reviews: revisionReviews.data ?? [],
    },
    accessiblePublishedPlanVersions: planVersions.flatMap((plan) => {
      if (!plan.itinerary || !plan.publishedAt) return [];
      try {
        return [
          {
            id: plan.id,
            roomId: plan.roomId,
            createdAt: plan.createdAt,
            updatedAt: plan.updatedAt,
            itinerary: projectPublicItinerary({
              itinerary: plan.itinerary,
              version: plan.version,
              publishedAt: plan.publishedAt,
              validationStatus: plan.validationStatus,
            }),
          },
        ];
      } catch {
        return [];
      }
    }),
  };
  logOperation("export.personal_completed", {
    correlationId,
    workflow: "personal_data_export",
    status: "ok",
    latencyMs: Date.now() - startedAt,
    counts: {
      memberships: payload.memberships.length,
      rooms: payload.rooms.length,
      messages: payload.messages.length,
      planVersions: payload.accessiblePublishedPlanVersions.length,
    },
  });
  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="trailie-personal-data-v1.json"`,
      "cache-control": "private, no-store",
    },
  });
}
