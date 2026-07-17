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

async function publishedCrew(browser: Browser) {
  const hostContext = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const host = await hostContext.newPage();
  await host.goto("/trips/create");
  await host.getByLabel("Trip name").fill("Immutable Revision Demo");
  await host.getByLabel("Your display name").fill("Maya");
  await host.getByRole("button", { name: "Create Trip" }).click();
  const roomUrl = host.url();
  const inviteUrl = await host
    .getByLabel("One-time invitation URL")
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
  await host.getByRole("button", { name: "Build Our Itinerary" }).click();
  await expect(
    host.getByRole("heading", { name: "Before I build the trip" }),
  ).toBeVisible({ timeout: 20_000 });
  await openPlan(member);
  await expect(
    member.getByRole("heading", { name: "Before I build the trip" }),
  ).toBeVisible({ timeout: 15_000 });
  await host.getByRole("button", { name: "Approve summary" }).click();
  await member.getByRole("button", { name: "Approve summary" }).click();
  await member.getByRole("button", { name: "Generate Itinerary" }).click();
  await expect(
    member.getByRole("heading", { name: "Yosemite crew escape" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    host.getByRole("heading", { name: "Yosemite crew escape" }),
  ).toBeVisible({ timeout: 15_000 });
  return { hostContext, host, memberContext, member, roomUrl };
}

test("two-person revision publishes Version 2 while Version 1 remains immutable", async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const { hostContext, host, memberContext, member, roomUrl } =
    await publishedCrew(browser);
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

  await member.getByRole("tab", { name: "Day-by-day" }).click();
  const sunset = member
    .getByRole("heading", { name: "Glacier Point sunset" })
    .locator("..");
  await sunset.getByRole("button", { name: "Change this" }).click();
  await expect(
    member.getByRole("heading", { name: "Request a Change" }),
  ).toBeVisible();
  if (process.env.TRAILIE_FAKE_REVISION_SCENARIO)
    await member
      .getByLabel("Change type")
      .selectOption({ label: "Replace an item" });
  await member
    .getByLabel("Request details")
    .fill("Move Glacier Point sunset later without changing another day");
  await member.getByRole("button", { name: "Submit change request" }).click();
  await expect(
    member.getByRole("heading", { name: "Move an itinerary item later" }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(
    member.getByText("Dependent route timing must be refreshed"),
  ).toBeVisible();
  await expect(
    host.getByRole("heading", { name: "Move an itinerary item later" }),
  ).toBeVisible({ timeout: 15_000 });

  await member.getByRole("button", { name: "Approve analysis" }).click();
  await expect(
    member.getByRole("dialog").getByText("Maya", { exact: true }).locator(".."),
  ).toContainText("pending");
  await host.getByRole("button", { name: "Approve analysis" }).click();
  if (process.env.TRAILIE_FAKE_REVISION_SCENARIO === "scope_drift_always") {
    await expect(
      member.getByText(
        "Trailie could not make this change without altering more of the trip than the crew approved. The current itinerary was not changed.",
      ),
    ).toBeVisible({ timeout: 30_000 });
    await expect(
      member.getByText("Published itinerary · Version 1"),
    ).toBeVisible();
    await expect(
      member.getByRole("heading", { name: "Ready to publish Version 2" }),
    ).toHaveCount(0);
    await Promise.all([hostContext.close(), memberContext.close()]);
    return;
  }
  await expect(
    member.getByRole("heading", { name: "Ready to publish Version 2" }),
  ).toBeVisible({ timeout: 30_000 });
  if (process.env.TRAILIE_FAKE_REVISION_SCENARIO === "scope_drift_once")
    await expect(
      member.getByText(
        "Trailie removed unrelated changes and kept the revision within the approved scope.",
      ),
    ).toBeVisible();
  await expect(
    member
      .getByText(
        process.env.TRAILIE_FAKE_REVISION_SCENARIO
          ? /replaced/i
          : /rescheduled/i,
      )
      .first(),
  ).toBeVisible();
  await expect(
    host.getByRole("heading", { name: "Ready to publish Version 2" }),
  ).toBeVisible({ timeout: 15_000 });

  await member.getByRole("button", { name: "Confirm Version 2" }).click();
  await expect(
    member.getByRole("dialog").getByText("Maya", { exact: true }).locator(".."),
  ).toContainText("pending");
  await host.getByRole("button", { name: "Confirm Version 2" }).click();
  await expect(host.getByText("Published itinerary · Version 2")).toBeVisible({
    timeout: 20_000,
  });
  await host.reload();
  await openPlan(host);
  await expect(host.getByText("Published itinerary · Version 2")).toBeVisible();

  await member.getByRole("button", { name: "Version history" }).click();
  await expect(
    member.getByRole("heading", { name: "Version history" }),
  ).toBeVisible();
  await expect(member.getByText("Version 1").first()).toBeVisible();
  await member.getByRole("button", { name: "View version" }).last().click();
  await expect(member.getByText("Historical · read only")).toBeVisible();
  await expect(
    member.getByText("Published itinerary · Version 1"),
  ).toBeVisible();
  await expect(
    member.getByRole("button", { name: "Request a Change" }),
  ).toHaveCount(0);
  await member.getByRole("button", { name: "Back to current" }).click();
  await member.getByRole("button", { name: "Version history" }).click();
  await member.getByRole("button", { name: "Compare to previous" }).click();
  await expect(
    member.getByRole("heading", { name: "Version 2 compared with Version 1" }),
  ).toBeVisible();

  await member.setViewportSize({ width: 390, height: 844 });
  expect(
    await member.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await member
    .getByRole("dialog")
    .getByRole("button", { name: "Close" })
    .click();
  const chatButton = member.getByRole("button", { name: "Chat" }).first();
  await chatButton.focus();
  await chatButton.press("Enter");
  await expect(member.getByLabel("Message your crew")).toBeEnabled();
  const outsiderContext = await browser.newContext();
  const outsider = await outsiderContext.newPage();
  await outsider.goto(roomUrl);
  await expect(
    outsider.getByRole("heading", { name: "Name the adventure." }),
  ).toBeVisible();
  await expect(
    outsider.getByRole("heading", { name: "Yosemite crew escape" }),
  ).toHaveCount(0);
  expect(providerRequests).toEqual([]);
  expect(browserProblems).toEqual([]);
  await Promise.all([
    outsiderContext.close(),
    hostContext.close(),
    memberContext.close(),
  ]);
});
