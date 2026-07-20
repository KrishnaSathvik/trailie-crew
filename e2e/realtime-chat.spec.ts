import { execFileSync } from "node:child_process";

import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

function collectConsoleProblems(page: Page) {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type()))
      problems.push(message.text());
  });
  page.on("pageerror", (error) => problems.push(error.message));
  return problems;
}

async function createJoinedTrip(browser: Browser, name: string) {
  const hostContext = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const hostPage = await hostContext.newPage();
  await hostPage.goto("/trips/create");
  await hostPage.getByLabel("Trip name").fill(name);
  await hostPage.getByLabel("Your display name").fill("Maya");
  await hostPage.getByRole("button", { name: "Create Trip" }).click();
  await expect(hostPage).toHaveURL(/\/trips\/[0-9a-f-]{36}$/);
  const roomUrl = hostPage.url();
  const invitePath = await hostPage
    .getByLabel("Private invitation link")
    .inputValue();

  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await memberPage.goto(invitePath);
  await memberPage.getByLabel("Your display name").fill("Leo");
  await memberPage.getByRole("button", { name: "Join Trip" }).click();
  await expect(memberPage).toHaveURL(roomUrl);
  await hostPage.reload();

  return { hostContext, hostPage, memberContext, memberPage, roomUrl };
}

async function closeContexts(...contexts: BrowserContext[]) {
  await Promise.all(contexts.map((context) => context.close()));
}

test("two crew members collaborate through real Realtime delivery", async ({
  browser,
}) => {
  const { hostContext, hostPage, memberContext, memberPage, roomUrl } =
    await createJoinedTrip(browser, "Realtime Boundary Waters");
  const hostProblems = collectConsoleProblems(hostPage);
  const memberProblems = collectConsoleProblems(memberPage);

  await expect(hostPage.getByLabel("2 online")).toBeVisible({
    timeout: 15_000,
  });
  await expect(memberPage.getByLabel("2 online")).toBeVisible({
    timeout: 15_000,
  });

  await memberPage.getByLabel("Message your crew").fill("T");
  await expect(hostPage.getByText("Leo is typing…")).toBeVisible();
  await expect(hostPage.getByText("Leo is typing…")).not.toBeVisible({
    timeout: 5_000,
  });
  await memberPage.getByLabel("Message your crew").fill("");

  await hostPage.getByLabel("Message your crew").fill("Rally at dawn.");
  await hostPage.getByLabel("Message your crew").press("Enter");
  await expect(
    memberPage.getByText("Rally at dawn.", { exact: true }),
  ).toBeVisible({
    timeout: 10_000,
  });

  const hostMessageOnMember = memberPage.getByRole("article", {
    name: "Message from Maya",
  });
  await hostMessageOnMember.getByRole("button", { name: "Reply" }).click();
  await memberPage.getByLabel("Message your crew").fill("Copy that.");
  await memberPage.getByLabel("Message your crew").press("Enter");
  await expect(hostPage.getByText("Copy that.", { exact: true })).toBeVisible({
    timeout: 10_000,
  });

  await hostMessageOnMember.getByLabel("Add reaction").click();
  await hostMessageOnMember
    .getByRole("button", { name: "React with Celebrate" })
    .click();
  await expect(
    hostPage
      .getByRole("article", { name: "Message from Maya" })
      .getByRole("button", { name: /Celebrate: 1/ }),
  ).toBeVisible({ timeout: 10_000 });

  await hostPage.reload();
  await expect(
    hostPage.getByRole("article", { name: "Message from Maya" }),
  ).toHaveCount(1);
  await expect(
    hostPage.getByRole("article", { name: "Message from Leo" }),
  ).toHaveCount(1);
  await expect(
    hostPage
      .getByRole("article", { name: "Message from Maya" })
      .getByText("Rally at dawn.", { exact: true }),
  ).toBeVisible();
  await expect(
    hostPage
      .getByRole("article", { name: "Message from Leo" })
      .getByText("Copy that.", { exact: true }),
  ).toBeVisible();

  await memberPage.setViewportSize({ width: 390, height: 844 });
  await memberPage.getByRole("button", { name: "People" }).click();
  await expect(
    memberPage.getByRole("dialog", { name: "Crew presence" }),
  ).toBeVisible();
  expect(
    await memberPage.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await memberPage.getByRole("button", { name: "Close crew" }).last().click();

  const outsiderContext = await browser.newContext();
  const outsiderPage = await outsiderContext.newPage();
  const outsiderProblems = collectConsoleProblems(outsiderPage);
  await outsiderPage.goto(roomUrl);
  await expect(
    outsiderPage.getByRole("heading", { name: "Trip unavailable" }),
  ).toBeVisible();
  await expect(outsiderPage.locator("body")).not.toContainText(
    "Rally at dawn.",
  );

  expect([...hostProblems, ...memberProblems, ...outsiderProblems]).toEqual([]);
  await closeContexts(hostContext, memberContext, outsiderContext);
});

test("message history loads older pages without replacing the newest page", async ({
  browser,
}) => {
  const { hostContext, hostPage, memberContext } = await createJoinedTrip(
    browser,
    "Paginated Chat",
  );
  const roomId = new URL(hostPage.url()).pathname.split("/").pop();
  if (!roomId || !/^[0-9a-f-]{36}$/.test(roomId))
    throw new Error("Missing room fixture id");

  const sql = `
    insert into public.messages (
      room_id, participant_id, sender_user_id, message_type, body, created_at
    )
    select
      '${roomId}'::uuid,
      participant.id,
      participant.user_id,
      'user',
      'Seeded history ' || series,
      now() - interval '2 hours' + series * interval '1 second'
    from public.participants as participant
    cross join generate_series(1, 35) as series
    where participant.room_id = '${roomId}'::uuid
      and participant.role = 'host';
  `;
  execFileSync(
    "psql",
    [
      "postgresql://postgres:postgres@127.0.0.1:55322/postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      sql,
    ],
    { stdio: "pipe" },
  );

  await hostPage.reload();
  await expect(
    hostPage.getByRole("button", { name: "Load earlier messages" }),
  ).toBeVisible();
  await expect(
    hostPage.getByText("Seeded history 35", { exact: true }),
  ).toBeVisible();
  await expect(
    hostPage.getByText("Seeded history 1", { exact: true }),
  ).toHaveCount(0);
  await hostPage.getByRole("button", { name: "Load earlier messages" }).click();
  await expect(
    hostPage.getByText("Seeded history 1", { exact: true }),
  ).toBeVisible();
  await expect(
    hostPage.getByText("Seeded history 35", { exact: true }),
  ).toHaveCount(1);
  await expect(
    hostPage.getByRole("button", { name: "Load earlier messages" }),
  ).toHaveCount(0);

  await closeContexts(hostContext, memberContext);
});
