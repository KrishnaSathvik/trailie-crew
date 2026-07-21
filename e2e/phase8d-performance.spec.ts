import { createHash } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

const hosted = process.env.HOSTED_ACCEPTANCE === "1";
const baseUrl = process.env.HOSTED_BASE_URL;
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecret = process.env.SUPABASE_SECRET_KEY;

test.skip(!hosted, "Run only during controlled hosted acceptance.");
if (hosted && (!baseUrl || !bypassSecret || !supabaseUrl || !supabaseSecret))
  throw new Error("phase8d_hosted_environment_incomplete");

const admin = hosted
  ? createClient(supabaseUrl!, supabaseSecret!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

type Timing = {
  days: number;
  visibleStateMs: number;
  previewReadyMs: number | null;
  totalDurationMs: number;
  state: "completed" | "failed";
  failureReason: string | null;
};

const cases = [3, 3, 3, 5, 5, 5, 7, 7, 10];

async function protectedContext(browser: Browser) {
  const context = await browser.newContext();
  const response = await context.request.get(baseUrl!, {
    headers: {
      "x-vercel-protection-bypass": bypassSecret!,
      "x-vercel-set-bypass-cookie": "true",
    },
  });
  expect(response.status()).toBe(200);
  return context;
}

async function memoryVersion(roomId: string) {
  const { data, error } = await admin!.rpc("get_private_room_memory", {
    target_room_id: roomId,
  });
  expect(error).toBeNull();
  if (!data || typeof data !== "object" || Array.isArray(data)) return 0;
  const snapshot = (data as { snapshot?: { memory_version?: unknown } })
    .snapshot;
  return typeof snapshot?.memory_version === "number"
    ? snapshot.memory_version
    : 0;
}

async function seedPlanningSummary(roomId: string, days: number) {
  const { data: room, error: roomError } = await admin!
    .from("rooms")
    .select("approval_mode")
    .eq("id", roomId)
    .single();
  expect(roomError).toBeNull();
  const { data: participant, error: participantError } = await admin!
    .from("participants")
    .select("id,user_id")
    .eq("room_id", roomId)
    .eq("status", "active")
    .single();
  expect(participantError).toBeNull();
  const { data: templateRooms, error: templateRoomsError } = await admin!
    .from("rooms")
    .select("id")
    .like("name", `Phase 8D Yosemite ${days} day%`)
    .neq("id", roomId)
    .order("created_at", { ascending: false })
    .limit(30);
  expect(templateRoomsError).toBeNull();
  const { data: template, error: templateError } = await admin!
    .from("planning_summaries")
    .select("summary_json,schema_version,prompt_version,model")
    .in(
      "room_id",
      (templateRooms ?? []).map((entry) => entry.id),
    )
    .eq("readiness_status", "ready_for_review")
    .order("created_at", { ascending: false })
    .limit(1)
    .single();
  expect(templateError).toBeNull();
  const summary = structuredClone(template!.summary_json) as Record<
    string,
    unknown
  > & {
    tripSnapshot: Record<string, unknown>;
    evidence: Record<string, unknown>;
  };
  const memory = await memoryVersion(roomId);
  summary.tripSnapshot = {
    ...summary.tripSnapshot,
    destinations: ["Yosemite National Park"],
    dateWindows: [`${isoDate(0)} to ${isoDate(days - 1)}`],
    travelerCount: 1,
  };
  summary.evidence = {
    memoryVersion: memory,
    latestMessageId: null,
    sourceMessageIds: [],
  };
  const participantIds = [participant!.id].sort();
  const membershipFingerprint = createHash("sha256")
    .update(participantIds.join(","))
    .digest("hex");
  const requestId = crypto.randomUUID();
  const { error: requestError } = await admin!
    .from("planning_requests")
    .insert({
      id: requestId,
      room_id: roomId,
      requested_by_participant_id: participant!.id,
      requested_by_user_id: participant!.user_id,
      status: "awaiting_review",
      approval_mode: room!.approval_mode,
      current_summary_version: 1,
      approved_summary_version: null,
      basis_memory_version: memory,
      basis_latest_message_id: null,
      basis_latest_message_created_at: null,
      basis_participant_ids: participantIds,
      basis_membership_fingerprint: membershipFingerprint,
      idempotency_key: createHash("sha256")
        .update(`phase8d:${roomId}`)
        .digest("hex"),
      generation_attempt_count: 0,
      generation_error_code: null,
      approved_at: null,
      cancelled_at: null,
    });
  expect(requestError).toBeNull();
  const { error: summaryError } = await admin!
    .from("planning_summaries")
    .insert({
      id: crypto.randomUUID(),
      planning_request_id: requestId,
      room_id: roomId,
      version: 1,
      schema_version: template!.schema_version,
      prompt_version: template!.prompt_version,
      model: template!.model,
      summary_json: summary,
      readiness_status: "ready_for_review",
      summary_hash: createHash("sha256")
        .update(JSON.stringify(summary))
        .digest("hex"),
      basis_memory_version: memory,
      basis_latest_message_id: null,
      basis_latest_message_created_at: null,
      basis_participant_ids: participantIds,
      basis_membership_fingerprint: membershipFingerprint,
    });
  expect(summaryError).toBeNull();
}

function isoDate(dayOffset: number) {
  return new Date(Date.UTC(2026, 7, 10 + dayOffset)).toISOString().slice(0, 10);
}

async function createFixtureTrip(
  context: BrowserContext,
  index: number,
  days: number,
) {
  const page = await context.newPage();
  await page.goto(`${baseUrl}/trips/create`);
  await page
    .getByLabel("Trip name")
    .fill(`Phase 8D Yosemite ${days} day ${index + 1}`);
  await page.getByLabel("Your display name").fill("Riley");
  await page.getByRole("button", { name: "Create Trip" }).click();
  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]{36}$/);
  const roomId = new URL(page.url()).pathname.split("/").at(-1)!;
  await seedPlanningSummary(roomId, days);
  await page.reload();
  return { page, roomId };
}

async function prepareSummary(page: Page) {
  await page.getByRole("button", { name: "Plan" }).first().click();
  const completed = page.getByRole("heading", {
    name: "Before I build the trip",
  });
  await expect(completed).toBeVisible({ timeout: 15_000 });
}

async function planFailure(roomId: string) {
  const { data, error } = await admin!
    .from("trip_plans")
    .select("status,error_code")
    .eq("room_id", roomId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  expect(error).toBeNull();
  return data?.error_code ?? null;
}

async function createItinerary(page: Page, roomId: string, days: number) {
  await page.getByRole("button", { name: "Approve trip brief" }).click();
  await expect(
    page.getByRole("button", { name: "Create the Plan" }),
  ).toBeVisible({ timeout: 10_000 });
  const startedAt = performance.now();
  await page.getByRole("button", { name: "Create the Plan" }).click();
  await expect(page.getByRole("button", { name: "Starting…" })).toBeVisible({
    timeout: 1_000,
  });
  const visibleStateMs = Math.round(performance.now() - startedAt);
  const preview = page.getByText(/Plan preview · Version 1/);
  const completed = page.getByText(/Current plan · Version 1/);
  const failed = page
    .getByRole("heading", { name: "This Plan cannot be published yet." })
    .or(page.getByRole("heading", { name: "The Plan could not be created." }));
  await expect(preview.or(completed).or(failed)).toBeVisible({
    timeout: 120_000,
  });
  const previewReadyMs = (await failed.isVisible())
    ? null
    : Math.round(performance.now() - startedAt);
  await expect(completed.or(failed)).toBeVisible({ timeout: 60_000 });
  const state = (await completed.isVisible()) ? "completed" : "failed";
  return {
    days,
    visibleStateMs,
    previewReadyMs,
    totalDurationMs: Math.round(performance.now() - startedAt),
    state,
    failureReason: state === "failed" ? await planFailure(roomId) : null,
  } satisfies Timing;
}

async function runtimeSamples(roomId: string, startedAt: string) {
  const roomIdHash = createHash("sha256")
    .update("trailie-runtime-room-v1:")
    .update(roomId)
    .digest("hex");
  const { data, error } = await admin!.rpc(
    "get_phase8d_itinerary_runtime_samples",
    {
      target_room_id_hash: roomIdHash,
      window_started_at: startedAt,
    },
  );
  expect(error).toBeNull();
  return data;
}

test("protected Phase 8D compact itinerary benchmark", async ({ browser }) => {
  test.setTimeout(25 * 60_000);
  const windowStartedAt = new Date().toISOString();
  const timings: Timing[] = [];
  const roomIds: string[] = [];
  const browserErrors: string[] = [];

  for (const [index, days] of cases.entries()) {
    const context = await protectedContext(browser);
    const { page, roomId } = await createFixtureTrip(context, index, days);
    roomIds.push(roomId);
    page.on("pageerror", (error) => browserErrors.push(error.name));
    await prepareSummary(page);
    const timing = await createItinerary(page, roomId, days);
    timings.push(timing);
    console.log(`PHASE8D_CASE ${JSON.stringify(timing)}`);
    await context.close();
  }

  const samples = await Promise.all(
    roomIds.map((roomId) => runtimeSamples(roomId, windowStartedAt)),
  );
  console.log(
    `PHASE8D_HOSTED_BENCHMARK ${JSON.stringify({ timings, samples })}`,
  );
  expect(timings).toHaveLength(9);
  expect(timings.filter((item) => item.days === 3)).toHaveLength(3);
  expect(timings.filter((item) => item.days === 5)).toHaveLength(3);
  expect(timings.filter((item) => item.days === 7)).toHaveLength(2);
  expect(timings.filter((item) => item.days === 10)).toHaveLength(1);
  expect(timings.every((item) => item.state === "completed")).toBe(true);
  expect(browserErrors).toEqual([]);
});
