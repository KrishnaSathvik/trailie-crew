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
const simpleRequestCount = Number(process.env.PHASE8C_SIMPLE_REQUESTS ?? 10);
const planningRequestCount = Number(process.env.PHASE8C_PLANNING_REQUESTS ?? 5);
const itineraryRequestCount = Number(
  process.env.PHASE8C_ITINERARY_REQUESTS ?? 3,
);

test.skip(!hosted, "Run only during controlled hosted acceptance.");
if (
  hosted &&
  (!baseUrl ||
    !bypassSecret ||
    !recoverySecret ||
    !supabaseUrl ||
    !supabaseSecret)
)
  throw new Error("phase8c_hosted_environment_incomplete");

const admin = hosted
  ? createClient(supabaseUrl!, supabaseSecret!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

type ChatTiming = {
  visibleStateMs: number;
  firstTokenMs: number;
  totalDurationMs: number;
};
type StructuredTiming = {
  visibleStateMs: number;
  previewMs: number | null;
  totalDurationMs: number;
  state: "completed" | "failed";
};

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

async function createFixtureTrip(context: BrowserContext, index: number) {
  const page = await context.newPage();
  await page.goto(`${baseUrl}/trips/create`);
  await page.getByLabel("Trip name").fill(`Phase 8C Yosemite ${index + 1}`);
  await page.getByLabel("Your display name").fill("Riley");
  await page.getByRole("button", { name: "Create Trip" }).click();
  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]{36}$/);
  const roomId = new URL(page.url()).pathname.split("/").at(-1)!;
  const before = await memoryVersion(roomId);
  const fixture =
    "We chose Yosemite National Park for August 10 through August 13, 2026. There are two travelers. Keep a moderate budget, accessible alternatives, peanut-free meals, and Glacier Point sunset.";
  await page.getByLabel("Message your crew").fill(fixture);
  await page.getByLabel("Message your crew").press("Enter");
  const advanced = await expect
    .poll(() => memoryVersion(roomId), { timeout: 15_000 })
    .toBeGreaterThan(before)
    .then(() => true)
    .catch(() => false);
  if (!advanced) {
    await recover(context);
    await expect
      .poll(() => memoryVersion(roomId), { timeout: 120_000 })
      .toBeGreaterThan(before);
  }
  return { page, roomId };
}

async function sendTrailie(page: Page, request: string): Promise<ChatTiming> {
  const conversation = page.getByLabel("Trip conversation");
  const messages = conversation.getByRole("article", {
    name: "Message from Trailie",
  });
  const countBefore = await messages.count();
  await page.getByLabel("Message your crew").fill(request);
  const startedAt = performance.now();
  await page.getByLabel("Message your crew").press("Enter");
  await expect(
    page.getByRole("status").filter({ hasText: "Trailie" }),
  ).toBeVisible({ timeout: 1_000 });
  const visibleStateMs = Math.round(performance.now() - startedAt);
  await expect(page.getByTestId("trailie-stream-output")).toBeVisible({
    timeout: 10_000,
  });
  const firstTokenMs = Math.round(performance.now() - startedAt);
  await expect(messages).toHaveCount(countBefore + 1, { timeout: 30_000 });
  return {
    visibleStateMs,
    firstTokenMs,
    totalDurationMs: Math.round(performance.now() - startedAt),
  };
}

async function prepareSummary(page: Page): Promise<StructuredTiming> {
  await page.getByRole("button", { name: "Plan" }).first().click();
  const startedAt = performance.now();
  await page.getByRole("button", { name: "Prepare trip brief" }).click();
  await expect(
    page.getByRole("heading", { name: "Trailie is checking the trip." }),
  ).toBeVisible({ timeout: 1_000 });
  const visibleStateMs = Math.round(performance.now() - startedAt);
  const completed = page.getByRole("heading", {
    name: "Before I build the trip",
  });
  const failed = page.getByRole("heading", {
    name: "The summary could not be prepared.",
  });
  await expect(completed.or(failed)).toBeVisible({ timeout: 30_000 });
  const state = (await completed.isVisible()) ? "completed" : "failed";
  return {
    visibleStateMs,
    previewMs: null,
    totalDurationMs: Math.round(performance.now() - startedAt),
    state,
  };
}

async function createItinerary(page: Page): Promise<StructuredTiming> {
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
    timeout: 80_000,
  });
  const previewMs = (await failed.isVisible())
    ? null
    : Math.round(performance.now() - startedAt);
  await expect(completed.or(failed)).toBeVisible({ timeout: 30_000 });
  return {
    visibleStateMs,
    previewMs,
    totalDurationMs: Math.round(performance.now() - startedAt),
    state: (await completed.isVisible()) ? "completed" : "failed",
  };
}

async function runtimeReport(roomId: string, startedAt: string) {
  const roomIdHash = createHash("sha256")
    .update("trailie-runtime-room-v1:")
    .update(roomId)
    .digest("hex");
  const { data, error } = await admin!.rpc("get_ai_runtime_benchmark_report", {
    target_room_id_hash: roomIdHash,
    window_started_at: startedAt,
  });
  expect(error).toBeNull();
  return data;
}

test("protected Phase 8C planning benchmark", async ({ browser }) => {
  test.setTimeout(15 * 60_000);
  const windowStartedAt = new Date().toISOString();
  const chat: ChatTiming[] = [];
  const planning: StructuredTiming[] = [];
  const itineraries: StructuredTiming[] = [];
  const roomIds: string[] = [];
  const browserErrors: string[] = [];

  for (let index = 0; index < planningRequestCount; index += 1) {
    const context = await protectedContext(browser);
    const { page, roomId } = await createFixtureTrip(context, index);
    roomIds.push(roomId);
    page.on("pageerror", (error) => browserErrors.push(error.name));
    if (index === 0 && simpleRequestCount > 0) {
      await page.getByRole("button", { name: "Chat" }).first().click();
      for (let request = 0; request < simpleRequestCount; request += 1)
        chat.push(
          await sendTrailie(
            page,
            `@Trailie Give one concise travel tip number ${request + 1}.`,
          ),
        );
    }
    const summary = await prepareSummary(page);
    planning.push(summary);
    expect(summary.state).toBe("completed");
    if (index < itineraryRequestCount)
      itineraries.push(await createItinerary(page));
    await context.close();
  }

  const reports = await Promise.all(
    roomIds.map((roomId) => runtimeReport(roomId, windowStartedAt)),
  );
  console.log(
    `PHASE8C_HOSTED_BENCHMARK ${JSON.stringify({
      chat,
      planning,
      itineraries,
      reports,
    })}`,
  );
  expect(chat).toHaveLength(simpleRequestCount);
  expect(planning).toHaveLength(planningRequestCount);
  expect(itineraries).toHaveLength(itineraryRequestCount);
  expect(itineraries.every((item) => item.state === "completed")).toBe(true);
  expect(browserErrors).toEqual([]);
});
