import { createHash } from "node:crypto";

import { createClient } from "@supabase/supabase-js";
import {
  expect,
  test,
  type APIRequestContext,
  type Browser,
  type BrowserContextOptions,
  type Page,
} from "@playwright/test";

const hosted = process.env.HOSTED_ACCEPTANCE === "1";
const baseUrl = process.env.HOSTED_BASE_URL;
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const recoverySecret = process.env.RECOVERY_SECRET;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecret = process.env.SUPABASE_SECRET_KEY;
const simpleSmokeOnly = process.env.PHASE8B_SIMPLE_SMOKE_ONLY === "1";

test.skip(!hosted, "Run only during controlled hosted acceptance.");

if (
  hosted &&
  (!baseUrl ||
    !bypassSecret ||
    !recoverySecret ||
    !supabaseUrl ||
    !supabaseSecret)
)
  throw new Error("phase8b_hosted_environment_incomplete");

const admin = hosted
  ? createClient(supabaseUrl!, supabaseSecret!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

type BrowserTiming = {
  request: string;
  visibleStateMs: number;
  completionMs: number;
};

async function protectedContext(
  browser: Browser,
  options: BrowserContextOptions = {},
) {
  const context = await browser.newContext(options);
  const response = await context.request.get(baseUrl!, {
    headers: {
      "x-vercel-protection-bypass": bypassSecret!,
      "x-vercel-set-bypass-cookie": "true",
    },
  });
  expect(response.status()).toBe(200);
  return context;
}

async function send(page: Page, text: string) {
  await page.getByLabel("Message your crew").fill(text);
  await page.getByLabel("Message your crew").press("Enter");
  await expect(
    page.getByLabel("Trip conversation").getByText(text, { exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Sending…")).not.toBeVisible();
}

async function sendTrailie(page: Page, text: string): Promise<BrowserTiming> {
  const conversation = page.getByLabel("Trip conversation");
  const trailieMessages = conversation.getByRole("article", {
    name: "Message from Trailie",
  });
  const countBefore = await trailieMessages.count();
  await page.getByLabel("Message your crew").fill(text);
  const startedAt = performance.now();
  await page.getByLabel("Message your crew").press("Enter");
  const activity = page.getByRole("status").filter({ hasText: "Trailie" });
  await expect(activity).toBeVisible({ timeout: 2_000 });
  const visibleStateMs = Math.round(performance.now() - startedAt);
  const retry = conversation.getByRole("button", { name: "Try again" });
  const failure = conversation.getByRole("alert");
  await expect(
    trailieMessages.nth(countBefore).or(retry).or(failure),
  ).toBeVisible({ timeout: 90_000 });
  if (await retry.isVisible().catch(() => false)) await retry.click();
  else if (await failure.isVisible().catch(() => false))
    throw new Error("trailie_hosted_answer_failed");
  await expect(trailieMessages).toHaveCount(countBefore + 1, {
    timeout: 120_000,
  });
  return {
    request: text,
    visibleStateMs,
    completionMs: Math.round(performance.now() - startedAt),
  };
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

async function runRecovery(request: APIRequestContext) {
  const response = await request.post(`${baseUrl}/api/internal/recovery`, {
    timeout: 120_000,
    headers: {
      authorization: `Bearer ${recoverySecret}`,
      "x-vercel-protection-bypass": bypassSecret!,
      "x-vercel-set-bypass-cookie": "true",
    },
  });
  expect([200, 429]).toContain(response.status());
}

async function waitForVisibleWithRecovery(
  locator: ReturnType<Page["getByText"]>,
  request: APIRequestContext,
  timeoutMs: number,
) {
  const initial = await locator
    .waitFor({ state: "visible", timeout: Math.min(timeoutMs, 90_000) })
    .then(() => true)
    .catch(() => false);
  if (initial) return;
  await runRecovery(request);
  await expect(locator).toBeVisible({
    timeout: Math.max(timeoutMs - 90_000, 30_000),
  });
}

async function runtimeReport(roomId: string, windowStartedAt: string) {
  const roomHash = createHash("sha256")
    .update("trailie-runtime-room-v1:")
    .update(roomId)
    .digest("hex");
  const { data, error } = await admin!.rpc("get_ai_runtime_benchmark_report", {
    target_room_id_hash: roomHash,
    window_started_at: windowStartedAt,
  });
  expect(error).toBeNull();
  return data;
}

test("protected hosted Phase 8B runtime benchmark and acceptance", async ({
  browser,
}) => {
  test.setTimeout(25 * 60_000);
  const windowStartedAt = new Date().toISOString();
  const browserTimings: BrowserTiming[] = [];
  const browserProblems: string[] = [];
  const browserProviderRequests: string[] = [];
  const context = await protectedContext(browser, {
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => browserProblems.push(error.name));
  page.on("console", (message) => {
    if (message.type() === "error") browserProblems.push("console_error");
  });
  page.on("request", (request) => {
    if (
      /api\.openai\.com|api\.mapbox\.com|maps\.googleapis\.com/.test(
        request.url(),
      )
    )
      browserProviderRequests.push(new URL(request.url()).hostname);
  });

  await page.goto(`${baseUrl}/trips/create`);
  await page.getByLabel("Trip name").fill("Phase 8B Yosemite Benchmark");
  await page.getByLabel("Your display name").fill("Riley");
  await page.getByRole("button", { name: "Create Trip" }).click();
  await expect(page).toHaveURL(/\/trips\/[0-9a-f-]{36}$/);
  const roomUrl = page.url();
  const roomId = new URL(roomUrl).pathname.split("/").at(-1)!;
  const invitePath = await page
    .getByLabel("Private invitation link")
    .inputValue();

  const simpleRequests = simpleSmokeOnly
    ? ["@Trailie Say hello in one short sentence."]
    : [
        "@Trailie Say hello in one short sentence.",
        "@Trailie Give me one concise packing reminder.",
        "@Trailie Name one good question for a travel crew.",
      ];
  for (const request of simpleRequests)
    browserTimings.push(await sendTrailie(page, request));

  if (simpleSmokeOnly) {
    await expect
      .poll(
        async () =>
          (
            (await runtimeReport(roomId, windowStartedAt)) as {
              requestCount?: number;
            }
          ).requestCount ?? 0,
        { timeout: 15_000 },
      )
      .toBe(1);
    const report = await runtimeReport(roomId, windowStartedAt);
    expect(report).toMatchObject({
      requestCount: 1,
      categories: { normal_chat: expect.any(Object) },
      failures: 0,
    });
    expect(browserProviderRequests).toEqual([]);
    expect(browserProblems).toEqual([]);
    console.log(
      `PHASE8B_HOSTED_SIMPLE_SMOKE ${JSON.stringify({
        status: "pass",
        browserTimings,
        report,
      })}`,
    );
    await context.close();
    return;
  }

  const beforeContext = await memoryVersion(roomId);
  await send(
    page,
    "We chose Yosemite National Park for August 10 through August 13, 2026. We want a moderate budget, accessible alternatives, peanut-free meals, and Glacier Point sunset.",
  );
  await expect
    .poll(() => memoryVersion(roomId), { timeout: 120_000 })
    .toBeGreaterThan(beforeContext);

  for (const request of [
    "@Trailie What did everyone decide?",
    "@Trailie What does the crew prefer?",
  ])
    browserTimings.push(await sendTrailie(page, request));

  await page.getByRole("button", { name: "Plan" }).first().click();
  const planningStartedAt = performance.now();
  await page.getByRole("button", { name: "Prepare trip brief" }).click();
  await expect(
    page.getByRole("heading", { name: "Trailie is checking the trip." }),
  ).toBeVisible({ timeout: 2_000 });
  await waitForVisibleWithRecovery(
    page.getByRole("heading", { name: "Before I build the trip" }),
    context.request,
    180_000,
  );
  const planningSummaryMs = Math.round(performance.now() - planningStartedAt);
  await page.getByRole("button", { name: "Approve trip brief" }).click();
  await expect(
    page.getByRole("button", { name: "Create the Plan" }),
  ).toBeVisible({ timeout: 30_000 });

  const itineraryStartedAt = performance.now();
  await page.getByRole("button", { name: "Create the Plan" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Trailie is checking the Plan before you see it.",
    }),
  ).toBeVisible({ timeout: 2_000 });
  const publishedPlan = page.getByText("Current plan · Version 1");
  const terminalPlanFailure = page
    .getByRole("heading", { name: "This Plan cannot be published yet." })
    .or(page.getByRole("heading", { name: "The Plan could not be created." }));
  await waitForVisibleWithRecovery(
    publishedPlan.or(terminalPlanFailure),
    context.request,
    300_000,
  );
  await expect(publishedPlan).toBeVisible();
  const fullItineraryMs = Math.round(performance.now() - itineraryStartedAt);

  await page.getByRole("button", { name: "Chat" }).first().click();
  browserTimings.push(
    await sendTrailie(
      page,
      "@Trailie What weather should we expect during the saved dates?",
    ),
  );

  await page.getByRole("button", { name: "Plan" }).first().click();
  await page.getByRole("tab", { name: "Day-by-day" }).click();
  await page.getByRole("button", { name: "Change this" }).first().click();
  await page
    .getByLabel("Change type")
    .selectOption({ label: "Remove an item" });
  await page
    .getByLabel("Request details")
    .fill("Remove only this activity and preserve every other day.");
  const smallRevisionStartedAt = performance.now();
  await page.getByRole("button", { name: "Check this change" }).click();
  await waitForVisibleWithRecovery(
    page.getByRole("button", { name: "Approve change" }),
    context.request,
    180_000,
  );
  await page.getByRole("button", { name: "Approve change" }).click();
  await waitForVisibleWithRecovery(
    page.getByRole("heading", { name: "Ready to publish Version 2" }),
    context.request,
    240_000,
  );
  await page.getByRole("button", { name: "Publish Version 2" }).click();
  await waitForVisibleWithRecovery(
    page.getByText("Current plan · Version 2"),
    context.request,
    120_000,
  );
  const smallRevisionMs = Math.round(
    performance.now() - smallRevisionStartedAt,
  );

  await page.getByRole("button", { name: "Request a change" }).click();
  await page.getByLabel("Change type").selectOption({ label: "Other change" });
  await page
    .getByLabel("Request details")
    .fill(
      "Change the destination from Yosemite to Yellowstone and update every affected day, route, lodging area, and date-specific reservation requirement.",
    );
  const largeRevisionStartedAt = performance.now();
  await page.getByRole("button", { name: "Check this change" }).click();
  await waitForVisibleWithRecovery(
    page.getByRole("button", { name: "Approve change" }),
    context.request,
    180_000,
  );
  await page.getByRole("button", { name: "Approve change" }).click();
  await waitForVisibleWithRecovery(
    page.getByRole("heading", { name: "Ready to publish Version 3" }),
    context.request,
    300_000,
  );
  await page.getByRole("button", { name: "Publish Version 3" }).click();
  await waitForVisibleWithRecovery(
    page.getByText("Current plan · Version 3"),
    context.request,
    120_000,
  );
  const largeRevisionMs = Math.round(
    performance.now() - largeRevisionStartedAt,
  );

  await page.getByRole("button", { name: "Chat" }).first().click();
  const invocationRequest = page.waitForRequest((request) =>
    request.url().includes("/api/trailie/invoke"),
  );
  await page
    .getByLabel("Message your crew")
    .fill("@Trailie Give me a detailed Yosemite packing checklist.");
  await page.getByLabel("Message your crew").press("Enter");
  await expect(page.getByText("Reading the conversation")).toBeVisible({
    timeout: 2_000,
  });
  await invocationRequest;
  await page.getByRole("button", { name: "Stop Trailie" }).click();
  await expect(page.getByText("Stopped")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page
      .getByLabel("Trip conversation")
      .getByRole("article", { name: "Message from Trailie" }),
  ).toHaveCount(7, { timeout: 120_000 });

  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.route("**/api/trailie/invoke", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 800));
    await route.continue();
  });
  await page
    .getByLabel("Message your crew")
    .fill("@Trailie Give one short mobile travel tip.");
  const mobileStartedAt = performance.now();
  await page.getByLabel("Message your crew").press("Enter");
  await expect(page.getByText("Reading the conversation")).toBeVisible({
    timeout: 2_000,
  });
  const mobileVisibleStateMs = Math.round(performance.now() - mobileStartedAt);
  await page.getByRole("button", { name: "Stop Trailie" }).click();
  await expect(page.getByText("Stopped")).toBeVisible({ timeout: 10_000 });
  await page.unroute("**/api/trailie/invoke");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  const memberContext = await protectedContext(browser);
  const member = await memberContext.newPage();
  await member.goto(new URL(invitePath, baseUrl).href);
  await member.getByLabel("Your display name").fill("Alex");
  await member.getByRole("button", { name: "Join Trip" }).click();
  await expect(member).toHaveURL(roomUrl);
  await page.reload();
  const hostBefore = await page
    .getByLabel("Trip conversation")
    .getByRole("article", { name: "Message from Trailie" })
    .count();
  const memberBefore = await member
    .getByLabel("Trip conversation")
    .getByRole("article", { name: "Message from Trailie" })
    .count();
  await Promise.all([
    send(page, "@Trailie Give the crew one concise route-check reminder."),
    send(member, "@Trailie Give the crew one concise weather-check reminder."),
  ]);
  await expect(
    page
      .getByLabel("Trip conversation")
      .getByRole("article", { name: "Message from Trailie" }),
  ).toHaveCount(hostBefore + 2, { timeout: 150_000 });
  await expect(
    member
      .getByLabel("Trip conversation")
      .getByRole("article", { name: "Message from Trailie" }),
  ).toHaveCount(memberBefore + 2, { timeout: 150_000 });

  const report = await expect
    .poll(() => runtimeReport(roomId, windowStartedAt), {
      timeout: 30_000,
    })
    .toMatchObject({ requestCount: expect.any(Number) })
    .then(() => runtimeReport(roomId, windowStartedAt));
  const reportValue = report as {
    requestCount?: number;
    categories?: Record<string, unknown>;
    cancellations?: number;
  };
  expect(reportValue.requestCount).toBeGreaterThanOrEqual(12);
  expect(reportValue.categories).toEqual(
    expect.objectContaining({
      normal_chat: expect.any(Object),
      context_backed: expect.any(Object),
      tool_backed: expect.any(Object),
      planning_summary: expect.any(Object),
      full_itinerary: expect.any(Object),
      small_revision: expect.any(Object),
      large_revision: expect.any(Object),
    }),
  );
  expect(reportValue.cancellations).toBeGreaterThanOrEqual(1);

  const pageText = `${await page.locator("body").innerText()}\n${await member
    .locator("body")
    .innerText()}`;
  expect(pageText).not.toMatch(
    /\b(?:gpt-|openai|anthropic|stack trace|token limit|queue internals)\b/i,
  );
  expect(browserProviderRequests).toEqual([]);
  expect(browserProblems).toEqual([]);

  console.log(
    `PHASE8B_HOSTED_BENCHMARK ${JSON.stringify({
      status: "pass",
      browserTimings,
      planningSummaryMs,
      fullItineraryMs,
      smallRevisionMs,
      largeRevisionMs,
      mobileVisibleStateMs,
      report,
    })}`,
  );
  await Promise.all([context.close(), memberContext.close()]);
});
