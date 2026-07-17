import { mkdir } from "node:fs/promises";

import { createClient } from "@supabase/supabase-js";
import {
  expect,
  test,
  type Browser,
  type BrowserContextOptions,
  type APIRequestContext,
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
  throw new Error("hosted_acceptance_environment_incomplete");

const admin = hosted
  ? createClient(supabaseUrl!, supabaseSecret!, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;

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

function collectProblems(page: Page) {
  const problems: string[] = [];
  page.on("pageerror", (error) => problems.push(error.name));
  page.on("console", (message) => {
    if (message.type() === "error") problems.push("console_error");
  });
  return problems;
}

async function send(page: Page, text: string) {
  await page.getByLabel("Message your crew").fill(text);
  await page.getByLabel("Message your crew").press("Enter");
  await expect(
    page.getByLabel("Trip conversation").getByText(text, { exact: true }),
  ).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Sending…")).not.toBeVisible();
}

async function openPlan(page: Page) {
  await page.getByRole("button", { name: "Plan" }).first().click();
}

async function memory(roomId: string) {
  const { data, error } = await admin!.rpc("get_private_room_memory", {
    target_room_id: roomId,
  });
  expect(error).toBeNull();
  return data as {
    snapshot: { memory_version: number };
    facts: Array<{
      fact_type: string;
      status: string;
      value: { text?: string };
    }>;
    extractions: Array<{
      status: string;
      error_code?: string | null;
      attempt_count?: number;
    }>;
  } | null;
}

async function runBoundedRecovery(request: APIRequestContext) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await request.post(`${baseUrl}/api/internal/recovery`, {
      headers: {
        authorization: `Bearer ${recoverySecret}`,
        "x-vercel-protection-bypass": bypassSecret!,
        "x-vercel-set-bypass-cookie": "true",
      },
    });
    if (response.status() === 429 && attempt === 0) {
      await new Promise((resolve) => setTimeout(resolve, 11_000));
      continue;
    }
    expect(response.status()).toBe(200);
    const result = (await response.json()) as {
      status: string;
      counts: { remainingEligible: number };
    };
    expect(result.status).toBe("ok");
    return result.counts;
  }
  throw new Error("hosted_recovery_rate_limited");
}

async function recoverQueuedMemory(request: APIRequestContext) {
  await new Promise((resolve) => setTimeout(resolve, 65_000));
  return runBoundedRecovery(request);
}

async function timed<T>(
  timings: Record<string, number>,
  name: string,
  operation: () => Promise<T>,
) {
  const started = performance.now();
  const result = await operation();
  timings[name] = Math.round(performance.now() - started);
  return result;
}

test("controlled hosted Preview completes Phase 5D revision reacceptance", async ({
  browser,
}) => {
  test.setTimeout(22 * 60_000);
  await mkdir("output/phase-5d/screenshots", { recursive: true });

  const timings: Record<string, number> = {};
  const prerequisiteFailures: string[] = [];
  const startedAt = Date.now();
  const hostContext = await protectedContext(browser, {
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const memberContext = await protectedContext(browser);
  const host = await hostContext.newPage();
  const member = await memberContext.newPage();
  const problems = [...collectProblems(host), ...collectProblems(member)];
  const browserProviderRequests: string[] = [];
  for (const page of [host, member])
    page.on("request", (request) => {
      if (/api\.openai\.com|api\.mapbox\.com/.test(request.url()))
        browserProviderRequests.push(new URL(request.url()).hostname);
    });

  await host.goto(`${baseUrl}/trips/create`);
  await host.getByLabel("Trip name").fill("Phase 5D Hosted Acceptance");
  await host.getByLabel("Your display name").fill("Maya");
  await host.getByRole("button", { name: "Create Trip" }).click();
  await expect(host).toHaveURL(/\/trips\/[0-9a-f-]{36}$/);
  const roomUrl = host.url();
  const roomId = new URL(roomUrl).pathname.split("/").at(-1)!;
  const invitePath = await host
    .getByLabel("One-time invitation URL")
    .inputValue();

  await member.goto(new URL(invitePath, baseUrl).href);
  await member.getByLabel("Your display name").fill("Alex");
  await member.getByRole("button", { name: "Join Trip" }).click();
  await expect(member).toHaveURL(roomUrl);
  await host.reload();
  await expect(host.getByLabel("2 online")).toBeVisible({ timeout: 20_000 });
  await expect(member.getByLabel("2 online")).toBeVisible({ timeout: 20_000 });

  await member.getByLabel("Message your crew").fill("T");
  await expect(host.getByText("Alex is typing…")).toBeVisible();
  await member.getByLabel("Message your crew").fill("");
  await send(host, "Normal crew coordination stays in chat.");
  await expect(
    member.getByText("Normal crew coordination stays in chat.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    host.getByRole("article", { name: "Message from Trailie" }),
  ).toHaveCount(0);

  const hostMessage = member.getByRole("article", {
    name: "Message from Maya",
  });
  await hostMessage.getByRole("button", { name: "Reply" }).click();
  await send(member, "Copy that.");
  await hostMessage.getByLabel("Add reaction").click();
  await hostMessage
    .getByRole("button", { name: "React with Celebrate" })
    .click();
  await expect(
    host
      .getByRole("article", { name: "Message from Maya" })
      .getByRole("button", { name: /Celebrate: 1/ }),
  ).toBeVisible({ timeout: 15_000 });

  await timed(timings, "focused_answer_ms", async () => {
    await send(
      host,
      "@Trailie In one short paragraph, what should we verify before a Yosemite trip?",
    );
    await expect(host.getByText("Trailie is answering…")).toBeVisible();
    const focusedAnswer = host.getByRole("article", {
      name: "Message from Trailie",
    });
    for (let attempt = 0; attempt < 4; attempt += 1) {
      if ((await focusedAnswer.count()) > 0) break;
      await new Promise((resolve) => setTimeout(resolve, 30_000));
      await runBoundedRecovery(hostContext.request);
    }
    await expect(focusedAnswer).toHaveCount(1, { timeout: 30_000 });
    await expect(
      member.getByRole("article", { name: "Message from Trailie" }),
    ).toHaveCount(1, { timeout: 30_000 });
  });

  const memoryBefore = (await memory(roomId))?.snapshot.memory_version ?? 0;
  await timed(timings, "memory_preference_ms", async () => {
    await send(host, "I prefer hiking and need peanut-free meals.");
    await recoverQueuedMemory(hostContext.request);
  });
  const preferenceMemory = await memory(roomId);
  const preferenceVersion = preferenceMemory?.snapshot.memory_version ?? 0;
  if (preferenceVersion <= memoryBefore)
    prerequisiteFailures.push("memory_preference_not_applied");
  await timed(timings, "memory_correction_ms", async () => {
    await send(host, "Correction: I prefer kayaking instead of hiking.");
    await recoverQueuedMemory(hostContext.request);
  });
  let correctedMemory = await memory(roomId);
  const correctionApplied =
    correctedMemory !== null &&
    correctedMemory.snapshot.memory_version > preferenceVersion &&
    correctedMemory.facts.some(
      (fact) =>
        fact.status === "superseded" &&
        fact.value.text?.toLowerCase().includes("hiking"),
    ) &&
    correctedMemory.facts.some(
      (fact) =>
        fact.status === "active" &&
        fact.value.text?.toLowerCase().includes("kayak"),
    );
  if (!correctionApplied)
    prerequisiteFailures.push("memory_correction_not_applied");

  await send(
    host,
    "We all decided on Yosemite from August 10 through August 13, 2026. We arrive by 10 AM on August 10, depart after 4 PM on August 13, want a moderate budget, and must see Glacier Point sunset.",
  );
  await send(
    member,
    "I need accessible low-strain alternatives and peanut-free restaurant options.",
  );

  await timed(timings, "planning_summary_ms", async () => {
    await openPlan(host);
    await host.getByRole("button", { name: "Build Our Itinerary" }).click();
    await expect(
      host.getByRole("heading", { name: "Before I build the trip" }),
    ).toBeVisible({ timeout: 120_000 });
  });
  await openPlan(member);
  await expect(
    member.getByRole("heading", { name: "Before I build the trip" }),
  ).toBeVisible({ timeout: 30_000 });
  await host.getByRole("button", { name: "Approve summary" }).click();
  await member.getByRole("button", { name: "Approve summary" }).click();
  await expect(
    member.getByRole("button", { name: "Generate Itinerary" }),
  ).toBeVisible({ timeout: 30_000 });

  await timed(timings, "itinerary_generation_ms", async () => {
    await member.getByRole("button", { name: "Generate Itinerary" }).click();
    const published = member.getByText("Published itinerary · Version 1");
    const retry = member.getByRole("button", { name: "Retry itinerary" });
    for (let attempt = 0; attempt < 10; attempt += 1) {
      if (await published.isVisible().catch(() => false)) break;
      if (await retry.isVisible().catch(() => false)) {
        await retry.click();
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, 30_000));
      await runBoundedRecovery(hostContext.request);
    }
    await expect(published).toBeVisible({ timeout: 30_000 });
    await expect(
      member.getByText("Validated before publishing").first(),
    ).toBeVisible();
  });
  await expect(host.getByText("Published itinerary · Version 1")).toBeVisible({
    timeout: 30_000,
  });
  await member.screenshot({
    path: "output/phase-5d/screenshots/version-1.png",
    fullPage: true,
  });

  await member.getByRole("tab", { name: "Day-by-day" }).click();
  await member
    .getByRole("heading", { level: 3, name: /kayak/i })
    .first()
    .locator("xpath=ancestor::li")
    .getByRole("button", { name: "Change this" })
    .click();
  await member
    .getByLabel("Change type")
    .selectOption({ label: "Remove an item" });
  await member
    .getByLabel("Request details")
    .fill("Remove this proposed kayaking item without changing another day.");
  await timed(timings, "revision_analysis_ms", async () => {
    await member.getByRole("button", { name: "Submit change request" }).click();
    await expect(
      member.getByRole("button", { name: "Approve analysis" }),
    ).toBeVisible({ timeout: 120_000 });
  });
  await member.getByRole("button", { name: "Approve analysis" }).click();
  await expect(
    host.getByRole("button", { name: "Approve analysis" }),
  ).toBeVisible({ timeout: 30_000 });
  await timed(timings, "revision_candidate_ms", async () => {
    await host.getByRole("button", { name: "Approve analysis" }).click();
    await expect(
      member.getByRole("heading", { name: "Ready to publish Version 2" }),
    ).toBeVisible({ timeout: 300_000 });
  });
  await member.getByRole("button", { name: "Confirm Version 2" }).click();
  await expect(
    host.getByRole("heading", { name: "Ready to publish Version 2" }),
  ).toBeVisible({ timeout: 30_000 });
  await host.getByRole("button", { name: "Confirm Version 2" }).click();
  await expect(host.getByText("Published itinerary · Version 2")).toBeVisible({
    timeout: 60_000,
  });
  await host.screenshot({
    path: "output/phase-5d/screenshots/version-2.png",
    fullPage: true,
  });

  await host.getByRole("button", { name: "Version history" }).click();
  await host
    .getByRole("button", { name: "Compare to previous" })
    .first()
    .click();
  const approvedScopeDiff = host.locator(
    'section[aria-labelledby="candidate-diff"]',
  );
  await expect(approvedScopeDiff).toContainText(/removed/i);
  await expect(approvedScopeDiff.locator("li")).toHaveCount(1);
  await host.getByRole("button", { name: "Close" }).click();

  await host.getByRole("button", { name: "Version history" }).click();
  await host.getByRole("button", { name: "View version" }).last().click();
  await expect(host.getByText("Published itinerary · Version 1")).toBeVisible();
  await host.getByRole("button", { name: "Create share link" }).click();
  const versionOnePath = await host
    .getByLabel("New link · shown once")
    .inputValue();
  expect(versionOnePath).toMatch(/^\/share\/[A-Za-z0-9_-]{43}$/);

  const publicContext = await protectedContext(browser);
  const visitor = await publicContext.newPage();
  const publicResponse = await visitor.goto(
    new URL(versionOnePath, baseUrl).href,
  );
  await expect(visitor.getByLabel("Pinned Version 1")).toBeVisible();
  await expect(visitor.getByText("Version 2", { exact: true })).toHaveCount(0);
  await expect(visitor.getByText("Maya", { exact: true })).toHaveCount(0);
  await expect(visitor.getByText("Alex", { exact: true })).toHaveCount(0);
  expect(publicResponse?.headers()["cache-control"]).toMatch(
    /no-store|no-cache.*must-revalidate/,
  );
  expect(publicResponse?.headers()["x-robots-tag"]).toContain("noindex");
  await visitor.screenshot({
    path: "output/phase-5d/screenshots/public-version-1.png",
    fullPage: true,
  });
  await host.getByRole("button", { name: "Revoke link" }).click();
  await expect(host.getByRole("status")).toContainText(
    "Public access is now off",
  );
  await visitor.goto(new URL(versionOnePath, baseUrl).href);
  await expect(
    visitor.getByRole("heading", { name: "Shared itinerary unavailable" }),
  ).toBeVisible();
  await publicContext.close();

  await host.getByRole("button", { name: "Back to current" }).click();
  await host.reload();
  await openPlan(host);
  await expect(host.getByText("Published itinerary · Version 2")).toBeVisible();

  // Repeatability: reuse the validated Version 2 base and remove a different
  // timed food stop. This intentionally produces Version 3 rather
  // than repeating the expensive room/bootstrap path.
  await member.reload();
  await openPlan(member);
  await expect(
    member.getByText("Published itinerary · Version 2"),
  ).toBeVisible();
  await member.getByRole("tab", { name: "Day-by-day" }).click();
  await member.getByRole("button", { name: "Change this" }).nth(1).click();
  await member
    .getByLabel("Change type")
    .selectOption({ label: "Remove an item" });
  await member
    .getByLabel("Request details")
    .fill(
      "Remove this timed food stop and keep everything else unchanged except directly connected route cleanup.",
    );
  await timed(timings, "repeat_revision_analysis_ms", async () => {
    await member.getByRole("button", { name: "Submit change request" }).click();
    await expect(
      member.getByRole("button", { name: "Approve analysis" }),
    ).toBeVisible({ timeout: 120_000 });
  });
  await member.getByRole("button", { name: "Approve analysis" }).click();
  await expect(
    host.getByRole("button", { name: "Approve analysis" }),
  ).toBeVisible({ timeout: 30_000 });
  await timed(timings, "repeat_revision_candidate_ms", async () => {
    await host.getByRole("button", { name: "Approve analysis" }).click();
    await expect(
      member.getByRole("heading", { name: "Ready to publish Version 3" }),
    ).toBeVisible({ timeout: 300_000 });
  });
  await member.getByRole("button", { name: "Confirm Version 3" }).click();
  await expect(
    host.getByRole("heading", { name: "Ready to publish Version 3" }),
  ).toBeVisible({ timeout: 30_000 });
  await host.getByRole("button", { name: "Confirm Version 3" }).click();
  await expect(host.getByText("Published itinerary · Version 3")).toBeVisible({
    timeout: 60_000,
  });

  const recoveryCounts = await runBoundedRecovery(hostContext.request);
  expect(recoveryCounts.remainingEligible).toBe(0);
  correctedMemory = await memory(roomId);
  if (
    correctedMemory?.facts.some(
      (fact) =>
        fact.status === "superseded" &&
        fact.value.text?.toLowerCase().includes("hiking"),
    ) &&
    correctedMemory.facts.some(
      (fact) =>
        fact.status === "active" &&
        fact.value.text?.toLowerCase().includes("kayak"),
    )
  ) {
    prerequisiteFailures.splice(
      0,
      prerequisiteFailures.length,
      ...prerequisiteFailures.filter(
        (failure) => !failure.startsWith("memory_"),
      ),
    );
  }
  const recoveryBacklogs = await Promise.all([
    admin!.rpc("list_recoverable_plan_changes", { batch_size: 50 }),
    admin!.rpc("list_recoverable_plan_change_publications", { batch_size: 50 }),
    admin!.rpc("list_recoverable_ai_provider_attempts", { batch_size: 50 }),
  ]);
  for (const backlog of recoveryBacklogs) {
    expect(backlog.error).toBeNull();
    expect(backlog.data).toEqual([]);
  }

  await member.setViewportSize({ width: 390, height: 844 });
  expect(
    await member.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(browserProviderRequests).toEqual([]);
  expect(problems).toEqual([]);

  console.log(
    `HOSTED_ACCEPTANCE_RESULT ${JSON.stringify({
      status:
        prerequisiteFailures.length === 0
          ? "pass"
          : "revision_pass_full_regression_blocked",
      totalDurationMs: Date.now() - startedAt,
      timings,
      memoryVersion: correctedMemory?.snapshot.memory_version ?? null,
      memoryExtractions: correctedMemory?.extractions ?? [],
      prerequisiteFailures,
      browserProviderRequestCount: browserProviderRequests.length,
      consoleProblemCount: problems.length,
      currentPlanVersion: 3,
      revisionCases: [
        { requestType: "remove_item", publishedVersion: 2 },
        { requestType: "remove_food_stop", publishedVersion: 3 },
      ],
      recoveryBacklog: 0,
      historicalShareRegression: "passed_current_run",
      screenshots: 3,
    })}`,
  );

  await Promise.all([hostContext.close(), memberContext.close()]);
});
