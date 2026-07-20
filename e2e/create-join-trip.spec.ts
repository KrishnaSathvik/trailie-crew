import { expect, test, type Page } from "@playwright/test";

function collectConsoleProblems(page: Page) {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type()))
      problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));
  return problems;
}

test("two anonymous users create and join one RLS-protected Trip", async ({
  browser,
}) => {
  const hostContext = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const hostPage = await hostContext.newPage();
  const hostProblems = collectConsoleProblems(hostPage);

  await hostPage.goto("/trips/create");
  await hostPage.getByLabel("Trip name").fill("E2E Boundary Waters");
  await hostPage.getByLabel("Your display name").fill("Maya");
  await hostPage.getByLabel(/Expected crew size/).fill("4");
  await hostPage.getByRole("button", { name: "Create Trip" }).click();
  await expect(hostPage).toHaveURL(/\/trips\/[0-9a-f-]{36}$/);

  const roomUrl = hostPage.url();
  const invitePath = await hostPage
    .getByLabel("Private invitation link")
    .inputValue();
  expect(invitePath).toMatch(/^\/join\//);
  await hostPage.getByRole("button", { name: "Copy invitation link" }).click();
  await expect(hostPage.getByText("Invitation link copied.")).toBeVisible();

  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  const memberProblems = collectConsoleProblems(memberPage);
  await memberPage.goto(invitePath);
  await expect(memberPage.getByText("Ready to join")).toBeVisible();
  await expect(memberPage.locator("body")).not.toContainText(
    invitePath.slice("/join/".length),
  );

  await memberPage.getByLabel("Your display name").fill("maya");
  await memberPage.getByRole("button", { name: "Join Trip" }).click();
  await expect(
    memberPage
      .getByRole("alert")
      .filter({ hasText: "We could not join the Trip." }),
  ).toContainText("display name is already in use");

  await memberPage.getByLabel("Your display name").fill("Leo");
  await memberPage.getByRole("button", { name: "Join Trip" }).click();
  await expect(memberPage).toHaveURL(roomUrl);
  await expect(memberPage.getByText("Maya")).toBeVisible();
  await expect(memberPage.getByText("Leo (you)")).toBeVisible();
  await expect(memberPage.getByText("Invite your crew")).toHaveCount(0);

  await hostPage.reload();
  await expect(hostPage.getByText("Maya (you)")).toBeVisible();
  await expect(hostPage.getByText("Leo")).toBeVisible();
  await expect(hostPage.getByLabel("Private invitation link")).toHaveCount(0);

  const outsiderContext = await browser.newContext();
  const outsiderPage = await outsiderContext.newPage();
  const outsiderProblems = collectConsoleProblems(outsiderPage);
  await outsiderPage.goto(roomUrl);
  await expect(
    outsiderPage.getByRole("heading", { name: "Trip unavailable" }),
  ).toBeVisible();
  await expect(outsiderPage.locator("body")).not.toContainText(
    "E2E Boundary Waters",
  );

  expect([...hostProblems, ...memberProblems, ...outsiderProblems]).toEqual([]);
  await Promise.all([
    hostContext.close(),
    memberContext.close(),
    outsiderContext.close(),
  ]);
});

test("entry routes remain usable on mobile, by keyboard, and in both themes", async ({
  page,
}) => {
  const problems = collectConsoleProblems(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("link", { name: "Create a Trip" }).first(),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Join a Trip" }).first(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);

  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("link", { name: "Skip to main content" }),
  ).toBeFocused();
  await page.getByRole("button", { name: /Switch to dark theme/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  await page.getByRole("link", { name: "Create a Trip" }).first().click();
  await expect(
    page.getByRole("heading", { name: "Start with a trip name." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Switch to light theme" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Create Trip" }).click();
  await expect(page.getByText("Enter a Trip name.")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(problems).toEqual([]);
});
