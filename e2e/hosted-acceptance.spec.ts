import { mkdir } from "node:fs/promises";

import { createClient } from "@supabase/supabase-js";
import {
  expect,
  test,
  type Browser,
  type BrowserContextOptions,
  type Page,
} from "@playwright/test";

const hosted = process.env.HOSTED_ACCEPTANCE === "1";
const baseUrl = process.env.HOSTED_BASE_URL;
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseSecret = process.env.SUPABASE_SECRET_KEY;

test.skip(!hosted, "Run only during controlled hosted acceptance.");

if (hosted && (!baseUrl || !bypassSecret || !supabaseUrl || !supabaseSecret))
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
    extractions: Array<{ status: string }>;
  };
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

test("controlled hosted Preview completes the Phase 5A product flow", async ({
  browser,
}) => {
  test.setTimeout(12 * 60_000);
  await mkdir("output/phase-5a/screenshots", { recursive: true });

  const timings: Record<string, number> = {};
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
  await host.getByLabel("Trip name").fill("Phase 5A Hosted Acceptance");
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
    await expect(
      host.getByRole("article", { name: "Message from Trailie" }),
    ).toHaveCount(1, { timeout: 90_000 });
    await expect(
      member.getByRole("article", { name: "Message from Trailie" }),
    ).toHaveCount(1, { timeout: 30_000 });
  });

  const memoryBefore = (await memory(roomId)).snapshot.memory_version;
  await timed(timings, "memory_preference_ms", async () => {
    await send(host, "I prefer hiking and need peanut-free meals.");
    await expect
      .poll(async () => (await memory(roomId)).snapshot.memory_version, {
        timeout: 90_000,
      })
      .toBeGreaterThan(memoryBefore);
  });
  const preferenceVersion = (await memory(roomId)).snapshot.memory_version;
  await timed(timings, "memory_correction_ms", async () => {
    await send(host, "Correction: I prefer kayaking instead of hiking.");
    await expect
      .poll(async () => (await memory(roomId)).snapshot.memory_version, {
        timeout: 90_000,
      })
      .toBeGreaterThan(preferenceVersion);
  });
  const correctedMemory = await memory(roomId);
  expect(
    correctedMemory.facts.some(
      (fact) =>
        fact.status === "superseded" &&
        fact.value.text?.toLowerCase().includes("hiking"),
    ),
  ).toBe(true);
  expect(
    correctedMemory.facts.some(
      (fact) =>
        fact.status === "active" &&
        fact.value.text?.toLowerCase().includes("kayak"),
    ),
  ).toBe(true);

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
    await expect(
      member.getByText("Published itinerary · Version 1"),
    ).toBeVisible({ timeout: 300_000 });
    await expect(
      member.getByText("Validated before publishing").first(),
    ).toBeVisible();
  });
  await expect(host.getByText("Published itinerary · Version 1")).toBeVisible({
    timeout: 30_000,
  });
  await member.screenshot({
    path: "output/phase-5a/screenshots/version-1.png",
    fullPage: true,
  });

  await member.getByRole("tab", { name: "Day-by-day" }).click();
  await member
    .getByRole("heading", { name: /kayaking-focused outing/i })
    .locator("xpath=ancestor::li")
    .getByRole("button", { name: "Change this" })
    .click();
  await member
    .getByLabel("Request details")
    .fill(
      "Shorten this activity by 30 minutes so it ends at noon, without changing another day.",
    );
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
    path: "output/phase-5a/screenshots/version-2.png",
    fullPage: true,
  });

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
    path: "output/phase-5a/screenshots/public-version-1.png",
    fullPage: true,
  });

  const calendar = await hostContext.request.get(
    `${baseUrl}/api/trips/${roomId}/plans/1/calendar`,
  );
  const ics = await calendar.text();
  expect(calendar.status()).toBe(200);
  expect(calendar.headers()["content-type"]).toContain("text/calendar");
  expect(ics).toContain("X-TRAILIE-PLAN-VERSION:1\r\n");
  expect(ics).not.toMatch(/Maya|Alex|approval|change request/i);

  const print = await hostContext.newPage();
  await print.goto(`${baseUrl}/trips/${roomId}/plans/1/print`);
  await expect(print.getByLabel("Pinned Version 1")).toBeVisible();
  await expect(
    print.getByText("No bookings were made by Trailie"),
  ).toBeVisible();
  await print.close();

  await host.getByRole("button", { name: "Revoke link" }).click();
  await expect(host.getByRole("status")).toContainText(
    "Public access is now off",
  );
  await visitor.goto(new URL(versionOnePath, baseUrl).href);
  await expect(
    visitor.getByRole("heading", { name: "Shared itinerary unavailable" }),
  ).toBeVisible();

  await host.getByRole("button", { name: "Back to current" }).click();
  await expect(host.getByText("Published itinerary · Version 2")).toBeVisible();
  await host.reload();
  await openPlan(host);
  await expect(host.getByText("Published itinerary · Version 2")).toBeVisible();

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
      status: "pass",
      totalDurationMs: Date.now() - startedAt,
      timings,
      memoryVersion: correctedMemory.snapshot.memory_version,
      browserProviderRequestCount: browserProviderRequests.length,
      consoleProblemCount: problems.length,
      currentPlanVersion: 2,
      historicalShareRevoked: true,
      screenshots: 3,
    })}`,
  );

  await Promise.all([
    hostContext.close(),
    memberContext.close(),
    publicContext.close(),
  ]);
});
