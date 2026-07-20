import { expect, test, type Browser, type Page } from "@playwright/test";

async function createApprovedCrew(browser: Browser) {
  const hostContext = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const host = await hostContext.newPage();
  await host.goto("/trips/create");
  await host.getByLabel("Trip name").fill("Validated Itinerary Demo");
  await host.getByLabel("Your display name").fill("Maya");
  await host.getByRole("button", { name: "Create Trip" }).click();
  await expect(host).toHaveURL(/\/trips\/[0-9a-f-]{36}$/);
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
  await expect(
    member.getByRole("button", { name: "Generate Itinerary" }),
  ).toBeVisible({ timeout: 15_000 });
  return { hostContext, host, memberContext, member, roomUrl };
}

async function send(page: Page, text: string) {
  await page.getByLabel("Message your crew").fill(text);
  await page.getByLabel("Message your crew").press("Enter");
  await expect(
    page.getByLabel("Trip conversation").getByText(text, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Sending…")).not.toBeVisible();
}

async function openPlan(page: Page) {
  await page.getByRole("button", { name: "Plan" }).first().click();
}

test("approved crew receives one repaired, validated, immutable itinerary", async ({
  browser,
}) => {
  const { hostContext, host, memberContext, member, roomUrl } =
    await createApprovedCrew(browser);
  const browserProviderRequests: string[] = [];
  const browserProblems: string[] = [];
  for (const page of [host, member]) {
    page.on("request", (request) => {
      if (
        /api\.openai\.com|api\.mapbox\.com|maps\.googleapis\.com/.test(
          request.url(),
        )
      )
        browserProviderRequests.push(request.url());
    });
    page.on("pageerror", (error) => browserProblems.push(error.message));
    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type()))
        browserProblems.push(message.text());
    });
  }

  const generate = member.getByRole("button", { name: "Generate Itinerary" });
  await generate.dblclick();
  await member.getByRole("button", { name: "Chat" }).first().click();
  await expect(member.getByLabel("Message your crew")).toBeEnabled();
  await openPlan(member);
  await expect(
    member.getByRole("heading", { name: "Yosemite crew escape" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    member.getByText(
      "Trailie adjusted the schedule after checking travel time.",
    ),
  ).toBeVisible();
  await expect(
    member.getByText("Validated before publishing").first(),
  ).toBeVisible();

  await expect(
    host.getByRole("heading", { name: "Yosemite crew escape" }),
  ).toBeVisible({ timeout: 15_000 });
  await member.getByRole("tab", { name: "Validation" }).click();
  await expect(member.getByText(/checks passed/)).toBeVisible();
  await member.reload();
  await openPlan(member);
  await expect(
    member.getByText("Published itinerary · Version 1"),
  ).toBeVisible();
  await member.getByRole("button", { name: "Chat" }).first().click();
  await send(member, "@Trailie What time does the hike start?");
  await expect(
    member.getByText("I couldn’t verify that detail from the current plan."),
  ).toBeVisible({ timeout: 20_000 });
  await send(member, "@Trailie What changed from Version 1?");
  await expect(
    member
      .getByLabel("Trip conversation")
      .getByRole("article", { name: "Message from Trailie" })
      .filter({
        hasText:
          "I couldn’t verify the exact changes from the available plan details.",
      }),
  ).toBeVisible({ timeout: 20_000 });

  await member.setViewportSize({ width: 390, height: 844 });
  expect(
    await member.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  const outsiderContext = await browser.newContext();
  const outsider = await outsiderContext.newPage();
  await outsider.goto(roomUrl);
  await expect(
    outsider.getByRole("heading", { name: "Trip unavailable" }),
  ).toBeVisible();
  await expect(
    outsider.getByRole("heading", { name: "Yosemite crew escape" }),
  ).toHaveCount(0);
  expect(browserProviderRequests).toEqual([]);
  expect(browserProblems).toEqual([]);
  await Promise.all([
    outsiderContext.close(),
    hostContext.close(),
    memberContext.close(),
  ]);
});
