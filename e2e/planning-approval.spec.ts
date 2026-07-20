import { expect, test, type Browser, type Page } from "@playwright/test";

async function createCrew(browser: Browser) {
  const hostContext = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const host = await hostContext.newPage();
  await host.goto("/trips/create");
  await host.getByLabel("Trip name").fill("Planning Approval Demo");
  await host.getByLabel("Your display name").fill("Maya");
  await host.getByRole("button", { name: "Create Trip" }).click();
  await expect(host).toHaveURL(/\/trips\/[0-9a-f-]{36}$/);
  const roomUrl = host.url();
  const inviteUrl = await host
    .getByLabel("Private invitation link")
    .inputValue();
  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  await member.goto(inviteUrl);
  await member.getByLabel("Your display name").fill("Alex");
  await member.getByRole("button", { name: "Join Trip" }).click();
  await expect(member).toHaveURL(roomUrl);
  await host.reload();
  return { hostContext, host, memberContext, member };
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

test("crew reviews, approves, stales, and regenerates an immutable planning summary", async ({
  browser,
}) => {
  const { hostContext, host, memberContext, member } =
    await createCrew(browser);
  const browserOpenAI: string[] = [];
  const browserProblems: string[] = [];
  for (const page of [host, member])
    page.on("request", (request) => {
      if (request.url().includes("api.openai.com"))
        browserOpenAI.push(request.url());
    });
  for (const page of [host, member]) {
    page.on("pageerror", (error) => browserProblems.push(error.message));
    page.on("console", (message) => {
      if (["error", "warning"].includes(message.type()))
        browserProblems.push(message.text());
    });
  }
  await send(host, "I prefer hiking and I cannot travel before Friday");
  await send(host, "We all decided on Yosemite");
  await send(member, "Where should we stay? This is an open question");
  await openPlan(host);
  await host.getByRole("button", { name: "Prepare trip brief" }).click();
  await expect(host.getByText("Trailie is checking the trip.")).toBeVisible();
  await expect(
    host.getByRole("heading", { name: "Before I build the trip" }),
  ).toBeVisible({ timeout: 20_000 });
  await openPlan(member);
  await expect(
    member.getByRole("heading", { name: "Before I build the trip" }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(member.getByText("Confirmed decisions")).toBeVisible();
  await expect(member.getByText("Crew preferences")).toBeVisible();
  await expect(member.getByText("Open questions")).toBeVisible();
  await expect(
    member.getByText(/itinerary generation is the next step/i),
  ).toHaveCount(0);
  await member.getByRole("button", { name: "Request changes" }).click();
  await expect(
    member.getByText("Add a note before requesting changes."),
  ).toBeVisible();
  await member
    .getByLabel("What should change?")
    .fill("Please preserve the open lodging question.");
  await member.getByRole("button", { name: "Request changes" }).click();
  await expect(member.getByText("The crew requested changes")).toBeVisible();
  await member.getByRole("button", { name: "Regenerate summary" }).click();
  await expect(member.getByText("Version 2", { exact: false })).toBeVisible({
    timeout: 20_000,
  });
  await expect(host.getByText("Version 2", { exact: false })).toBeVisible({
    timeout: 10_000,
  });
  await host.getByRole("button", { name: "Approve trip brief" }).click();
  await expect(host.getByText("Summary approved")).toHaveCount(0);
  await member.getByRole("button", { name: "Approve trip brief" }).click();
  await expect(member.getByText("Summary approved")).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    member.getByRole("button", { name: "Create the Plan" }),
  ).toBeVisible();
  await member.getByRole("button", { name: "Chat" }).first().click();
  await send(member, "Actually, I prefer kayaking");
  await member.getByRole("button", { name: "Plan" }).first().click();
  await expect(
    member.getByText("Trip details changed after this summary was created"),
  ).toBeVisible({ timeout: 15_000 });
  await member.getByRole("button", { name: "Regenerate summary" }).click();
  await expect(member.getByText("Trailie is checking the trip.")).toBeVisible();
  await expect(member.getByText("Version 3", { exact: false })).toBeVisible({
    timeout: 20_000,
  });
  await expect(member.getByText("Pending").first()).toBeVisible();
  await member.setViewportSize({ width: 390, height: 844 });
  expect(
    await member.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await member.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(
    member.getByRole("button", { name: "Switch to light theme" }),
  ).toBeVisible();
  expect(
    await member.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(browserOpenAI).toEqual([]);
  expect(browserProblems).toEqual([]);
  await Promise.all([hostContext.close(), memberContext.close()]);
});

test("summary generation failure stops safely at the retry cap without affecting chat", async ({
  browser,
}) => {
  const { hostContext, host, memberContext } = await createCrew(browser);
  await send(host, "simulate planning failure while keeping Yosemite in chat");
  await openPlan(host);
  await host.getByRole("button", { name: "Prepare trip brief" }).click();
  await expect(
    host.getByRole("heading", { name: "The summary could not be prepared." }),
  ).toBeVisible({ timeout: 20_000 });
  await host.getByRole("button", { name: "Chat" }).first().click();
  await expect(
    host.getByText("simulate planning failure while keeping Yosemite in chat", {
      exact: true,
    }),
  ).toBeVisible();
  await openPlan(host);
  await expect(
    host.getByText(
      "Trailie could not finish after several tries. Chat and earlier Plans remain available.",
    ),
  ).toBeVisible();
  await expect(host.getByRole("button", { name: "Retry summary" })).toHaveCount(
    0,
  );
  await Promise.all([hostContext.close(), memberContext.close()]);
});
