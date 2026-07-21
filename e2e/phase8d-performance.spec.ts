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
const recoverySecret = process.env.RECOVERY_SECRET;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecret = process.env.SUPABASE_SECRET_KEY;

test.skip(!hosted, "Run only during controlled hosted acceptance.");
if (
  hosted &&
  (!baseUrl ||
    !bypassSecret ||
    !recoverySecret ||
    !supabaseUrl ||
    !supabaseSecret)
)
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

async function recover(context: BrowserContext) {
  const response = await context.request.post(
    `${baseUrl}/api/internal/recovery`,
    {
      timeout: 120_000,
      headers: {
        authorization: `Bearer ${recoverySecret}`,
        "x-vercel-protection-bypass": bypassSecret!,
        "x-vercel-set-bypass-cookie": "true",
      },
    },
  );
  expect([200, 429]).toContain(response.status());
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
  const before = await memoryVersion(roomId);
  const input = `We chose Yosemite National Park for ${isoDate(0)} through ${isoDate(days - 1)}. There are two travelers. Keep a moderate budget, accessible alternatives, peanut-free meals, and one Glacier Point sunset.`;
  const sendInput = async (message: string) => {
    await page.getByLabel("Message your crew").fill(message);
    await page.getByLabel("Message your crew").press("Enter");
  };
  await sendInput(input);
  let advanced = await expect
    .poll(() => memoryVersion(roomId), { timeout: 15_000 })
    .toBeGreaterThan(before)
    .then(() => true)
    .catch(() => false);
  for (let attempt = 0; !advanced && attempt < 3; attempt += 1) {
    await recover(context);
    advanced = await expect
      .poll(() => memoryVersion(roomId), { timeout: 35_000 })
      .toBeGreaterThan(before)
      .then(() => true)
      .catch(() => false);
    if (!advanced && attempt < 2)
      await sendInput(`Confirmed for the trip brief: ${input}`);
  }
  expect(advanced).toBe(true);
  return { page, roomId };
}

async function prepareSummary(page: Page) {
  await page.getByRole("button", { name: "Plan" }).first().click();
  await page.getByRole("button", { name: "Prepare trip brief" }).click();
  const completed = page.getByRole("heading", {
    name: "Before I build the trip",
  });
  const failed = page.getByRole("heading", {
    name: "The summary could not be prepared.",
  });
  await expect(completed.or(failed)).toBeVisible({ timeout: 30_000 });
  expect(await completed.isVisible()).toBe(true);
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
