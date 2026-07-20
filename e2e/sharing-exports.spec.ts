import { execFileSync } from "node:child_process";

import { expect, test, type Browser, type Page } from "@playwright/test";

async function send(page: Page, text: string) {
  await page.getByLabel("Message your crew").fill(text);
  await page.getByLabel("Message your crew").press("Enter");
  await expect(
    page.getByLabel("Trip conversation").getByText(text, { exact: true }),
  ).toBeVisible();
}

async function openPlan(page: Page) {
  await page.getByRole("button", { name: "Plan" }).first().click();
}

async function createPublishedVersions(browser: Browser) {
  const hostContext = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const host = await hostContext.newPage();
  await host.goto("/trips/create");
  await host.getByLabel("Trip name").fill("Version-pinned sharing demo");
  await host.getByLabel("Your display name").fill("Maya");
  await host.getByRole("button", { name: "Create Trip" }).click();
  await expect(host).toHaveURL(/\/trips\/[0-9a-f-]{36}$/);
  const roomUrl = host.url();
  const roomId = new URL(roomUrl).pathname.match(/^\/trips\/([^/]+)/)?.[1];
  if (!roomId) throw new Error("room_id_missing_from_trip_url");
  const inviteUrl = await host
    .getByLabel("Private invitation link")
    .inputValue();

  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  await member.goto(inviteUrl);
  await member.getByLabel("Your display name").fill("Alex");
  await member.getByRole("button", { name: "Join Trip" }).click();
  await host.reload();
  await send(
    host,
    "We all decided on Yosemite and must see Glacier Point sunset",
  );
  await openPlan(host);
  await host.getByRole("button", { name: "Prepare trip brief" }).click();
  await expect(
    host.getByRole("heading", { name: "Before I build the trip" }),
  ).toBeVisible({ timeout: 20_000 });
  await openPlan(member);
  await expect(
    member.getByRole("heading", { name: "Before I build the trip" }),
  ).toBeVisible({ timeout: 15_000 });
  await host.getByRole("button", { name: "Approve trip brief" }).click();
  await member.getByRole("button", { name: "Approve trip brief" }).click();
  await member.getByRole("button", { name: "Create the Plan" }).click();
  await expect(
    member.getByRole("heading", { name: "Yosemite crew escape" }),
  ).toBeVisible({ timeout: 30_000 });

  await member.getByRole("tab", { name: "Day-by-day" }).click();
  await member
    .getByRole("heading", { name: "Glacier Point sunset" })
    .locator("..")
    .getByRole("button", { name: "Change this" })
    .click();
  await member
    .getByLabel("Request details")
    .fill("Move Glacier Point sunset later without changing another day");
  await member.getByRole("button", { name: "Check this change" }).click();
  await expect(
    member.getByRole("heading", { name: "Move an itinerary item later" }),
  ).toBeVisible({ timeout: 20_000 });
  await member.getByRole("button", { name: "Approve change" }).click();
  await expect(
    host.getByRole("heading", { name: "Move an itinerary item later" }),
  ).toBeVisible({ timeout: 15_000 });
  await host.getByRole("button", { name: "Approve change" }).click();
  await expect(
    member.getByRole("heading", { name: "Ready to publish Version 2" }),
  ).toBeVisible({ timeout: 30_000 });
  await member.getByRole("button", { name: "Publish Version 2" }).click();
  await expect(
    host.getByRole("heading", { name: "Ready to publish Version 2" }),
  ).toBeVisible({ timeout: 15_000 });
  await host.getByRole("button", { name: "Publish Version 2" }).click();
  await expect(host.getByText("Current plan · Version 2")).toBeVisible({
    timeout: 20_000,
  });
  return { hostContext, host, memberContext, member, roomId, roomUrl };
}

async function openHistoricalVersionOne(page: Page) {
  await page.getByRole("button", { name: "Version history" }).click();
  await page.getByRole("button", { name: "View Plan" }).last().click();
  await expect(page.getByText("Earlier version · Version 1")).toBeVisible();
}

test("a shared historical version stays pinned, exports safely, and revokes immediately", async ({
  browser,
}) => {
  test.setTimeout(150_000);
  const { hostContext, host, memberContext, member, roomId, roomUrl } =
    await createPublishedVersions(browser);
  const providerRequests: string[] = [];
  const browserProblems: string[] = [];
  for (const page of [host, member]) {
    page.on("request", (request) => {
      if (
        /api\.openai\.com|api\.mapbox\.com|maps\.googleapis\.com/.test(
          request.url(),
        )
      )
        providerRequests.push(request.url());
    });
    page.on("pageerror", (error) => browserProblems.push(error.message));
    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type()))
        browserProblems.push(message.text());
    });
  }

  await openHistoricalVersionOne(host);
  await host.getByRole("button", { name: "Create share link" }).click();
  const versionOneUrl = await host
    .getByLabel("New link · shown once")
    .inputValue();
  expect(versionOneUrl).toMatch(/^\/share\/[A-Za-z0-9_-]{43}$/);

  await openHistoricalVersionOne(member);
  await expect(member.getByText(/Active public link/)).toBeVisible();
  await expect(
    member.getByRole("button", { name: "Replace link" }),
  ).toHaveCount(0);
  await expect(member.getByRole("button", { name: "Revoke link" })).toHaveCount(
    0,
  );

  const publicContext = await browser.newContext();
  const visitor = await publicContext.newPage();
  const publicResponse = await visitor.goto(versionOneUrl);
  await expect(visitor.locator("#shared-title")).toHaveText(
    "Yosemite crew escape",
  );
  await expect(visitor.getByLabel("Shared Plan Version 1")).toBeVisible();
  await expect(
    visitor.getByRole("heading", { name: "Privacy-safe map" }),
  ).toBeVisible();
  await expect(visitor.getByText("Map preview")).toBeVisible();
  await expect(
    visitor.getByText(/Private locations are hidden/i),
  ).toBeVisible();
  await expect(visitor.getByText("Version 2", { exact: true })).toHaveCount(0);
  await expect(visitor.getByText("Maya", { exact: true })).toHaveCount(0);
  await expect(visitor.getByText("Alex", { exact: true })).toHaveCount(0);
  await expect(
    visitor.getByText(/approval|crew chat|change request/i),
  ).toHaveCount(0);
  await expect(visitor.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex.*nofollow.*noarchive/,
  );
  expect(publicResponse?.headers()["cache-control"]).toMatch(
    /no-store|no-cache.*must-revalidate/,
  );
  expect(publicResponse?.headers()["x-robots-tag"]).toContain("noindex");

  await visitor.setViewportSize({ width: 390, height: 844 });
  expect(
    await visitor.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  const calendar = await hostContext.request.get(
    `/api/trips/${roomId}/plans/1/calendar`,
  );
  const ics = await calendar.text();
  expect(calendar.status(), ics).toBe(200);
  expect(ics).toContain("BEGIN:VCALENDAR\r\n");
  expect(ics).toContain("X-TRAILIE-PLAN-VERSION:1\r\n");
  expect(ics).toContain("@v1.trailie.crew");
  expect(ics).not.toContain("@v2.trailie.crew");
  expect(ics).not.toMatch(/Maya|Alex|approval|change request/i);

  const print = await hostContext.newPage();
  await print.goto(`/trips/${roomId}/plans/1/print`);
  await expect(print.getByLabel("Shared Plan Version 1")).toBeVisible();
  await expect(
    print.getByText("No bookings were made by Trailie"),
  ).toBeVisible();
  await print.close();

  await host.getByRole("button", { name: "Back to current" }).click();
  await expect(host.getByText("Current plan · Version 2")).toBeVisible();
  await host.getByRole("button", { name: "Create share link" }).click();
  const oldVersionTwoUrl = await host
    .getByLabel("New link · shown once")
    .inputValue();
  await host.getByRole("button", { name: "Replace link" }).click();
  await expect(host.getByLabel("New link · shown once")).not.toHaveValue(
    oldVersionTwoUrl,
  );
  const newVersionTwoUrl = await host
    .getByLabel("New link · shown once")
    .inputValue();
  expect(newVersionTwoUrl).not.toBe(oldVersionTwoUrl);
  await visitor.goto(oldVersionTwoUrl);
  await expect(
    visitor.getByRole("heading", { name: "Shared Plan unavailable" }),
  ).toBeVisible();
  await visitor.goto(newVersionTwoUrl);
  await expect(visitor.getByLabel("Shared Plan Version 2")).toBeVisible();

  await openHistoricalVersionOne(host);
  await host.getByRole("button", { name: "Revoke link" }).click();
  await expect(host.getByRole("status")).toContainText(
    "Public access is now off",
  );
  await visitor.goto(versionOneUrl);
  await expect(
    visitor.getByRole("heading", { name: "Shared Plan unavailable" }),
  ).toBeVisible();

  await host
    .getByRole("combobox", { name: "Access", exact: true })
    .selectOption("expiring_link");
  const future = new Date(Date.now() + 60 * 60 * 1000);
  future.setSeconds(0, 0);
  await host.getByLabel("Expires").fill(future.toISOString().slice(0, 16));
  await host.getByRole("button", { name: "Create share link" }).click();
  const expiringUrl = await host
    .getByLabel("New link · shown once")
    .inputValue();
  await visitor.goto(expiringUrl);
  await expect(visitor.getByLabel("Shared Plan Version 1")).toBeVisible();
  const prefix = expiringUrl.split("/").at(-1)!.slice(0, 8);
  execFileSync(
    "psql",
    [
      "postgresql://postgres:postgres@127.0.0.1:55322/postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      `update public.plan_share_links set expires_at = now() - interval '1 second' where token_prefix = '${prefix}'`,
    ],
    { stdio: "pipe" },
  );
  await visitor.reload();
  await expect(
    visitor.getByRole("heading", { name: "Shared Plan unavailable" }),
  ).toBeVisible();

  const outsiderContext = await browser.newContext();
  const outsider = await outsiderContext.newPage();
  await outsider.goto(roomUrl);
  await expect(
    outsider.getByRole("heading", { name: "Trip unavailable" }),
  ).toBeVisible();
  await expect(
    outsider.getByRole("heading", { name: "Yosemite crew escape" }),
  ).toHaveCount(0);
  const outsiderCalendar = await outsiderContext.request.get(
    `/api/trips/${roomId}/plans/1/calendar`,
  );
  expect(outsiderCalendar.status()).not.toBe(200);
  expect(providerRequests).toEqual([]);
  expect(browserProblems).toEqual([]);

  await Promise.all([
    outsiderContext.close(),
    publicContext.close(),
    hostContext.close(),
    memberContext.close(),
  ]);
});
