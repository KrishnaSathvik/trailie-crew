import { expect, test, type Browser, type Page } from "@playwright/test";

async function createCrew(browser: Browser) {
  const hostContext = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const host = await hostContext.newPage();
  await host.goto("/trips/create");
  await host.getByLabel("Trip name").fill("Trailie AI Demo");
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
  await member.getByLabel("Your display name").fill("Leo");
  await member.getByRole("button", { name: "Join Trip" }).click();
  await expect(member).toHaveURL(roomUrl);
  await host.reload();
  return { hostContext, host, memberContext, member, roomUrl };
}

function collectProblems(page: Page) {
  const problems: string[] = [];
  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      problems.push(message.text());
    }
  });
  page.on("pageerror", (error) => problems.push(error.message));
  return problems;
}

test("Trailie stays silent, streams one focused answer, persists it, and handles replies and failure", async ({
  browser,
}) => {
  const { hostContext, host, memberContext, member, roomUrl } =
    await createCrew(browser);
  const hostProblems = collectProblems(host);
  const memberProblems = collectProblems(member);
  const browserOpenAIRequests: string[] = [];
  let firstInvocationPayload: Record<string, string> | null = null;
  for (const page of [host, member]) {
    page.on("request", (request) => {
      if (request.url().includes("api.openai.com")) {
        browserOpenAIRequests.push(request.url());
      }
      if (
        !firstInvocationPayload &&
        request.url().endsWith("/api/trailie/invoke")
      ) {
        firstInvocationPayload = request.postDataJSON() as Record<
          string,
          string
        >;
      }
    });
  }

  await host.getByLabel("Message your crew").fill("Normal crew conversation.");
  await host.getByLabel("Message your crew").press("Enter");
  await expect(
    member.getByText("Normal crew conversation.", { exact: true }),
  ).toBeVisible();
  await expect(
    host.getByRole("article", { name: "Message from Trailie" }),
  ).toHaveCount(0);

  await host
    .getByLabel("Message your crew")
    .fill("@Trailie help us compare driving and flying");
  await expect(
    host.getByText("Trailie will answer after this message is sent"),
  ).toBeVisible();
  await host.getByLabel("Message your crew").press("Enter");
  const trailieAnswer = host.getByRole("article", {
    name: "Message from Trailie",
  });
  await expect(
    host.getByText("Trailie is answering…").or(trailieAnswer),
  ).toBeVisible();
  await expect(trailieAnswer).toHaveCount(1, { timeout: 15_000 });
  await expect(
    member.getByRole("article", { name: "Message from Trailie" }),
  ).toHaveCount(1, { timeout: 15_000 });
  await expect(member.getByText(/Driving offers flexibility/)).toBeVisible();

  await host.reload();
  await expect(
    host.getByRole("article", { name: "Message from Trailie" }),
  ).toHaveCount(1);

  expect(firstInvocationPayload).not.toBeNull();
  const duplicateResponse = await hostContext.request.post(
    `${new URL(roomUrl).origin}/api/trailie/invoke`,
    { data: firstInvocationPayload },
  );
  const duplicate = {
    status: duplicateResponse.status(),
    body: await duplicateResponse.json(),
  };
  expect(duplicate).toEqual({
    status: 409,
    body: { code: "retry_not_allowed" },
  });
  await expect(
    host.getByRole("article", { name: "Message from Trailie" }),
  ).toHaveCount(1);

  await host
    .getByLabel("Message your crew")
    .fill("Hey Trailie, can you explain what to pack?");
  await host.getByLabel("Message your crew").press("Enter");
  await expect(
    host.getByRole("article", { name: "Message from Trailie" }),
  ).toHaveCount(2, { timeout: 15_000 });

  const trailie = host
    .getByRole("article", {
      name: "Message from Trailie",
    })
    .first();
  await trailie.getByRole("button", { name: "Reply" }).click();
  await host.getByLabel("Message your crew").fill("What about luggage?");
  await host.getByLabel("Message your crew").press("Enter");
  await expect(
    host.getByRole("article", { name: "Message from Trailie" }),
  ).toHaveCount(3, { timeout: 15_000 });

  await host.getByLabel("Message your crew").fill("`@Trailie do something`");
  await host.getByLabel("Message your crew").press("Enter");
  await expect(
    member.getByText("`@Trailie do something`", { exact: true }),
  ).toBeVisible();
  await expect(
    host.getByRole("article", { name: "Message from Trailie" }),
  ).toHaveCount(3);

  await host
    .getByLabel("Message your crew")
    .fill("```text\n@Trailie do something\n```");
  await host.getByRole("button", { name: "Send message" }).click();
  await expect(
    member.getByText("```text\n@Trailie do something\n```", { exact: true }),
  ).toBeVisible();
  await expect(
    host.getByRole("article", { name: "Message from Trailie" }),
  ).toHaveCount(3);

  await host
    .getByLabel("Message your crew")
    .fill("@Trailie simulate provider failure");
  await host.getByLabel("Message your crew").press("Enter");
  await expect(
    host.getByRole("article", { name: "Message from Trailie" }),
  ).toHaveCount(4, { timeout: 15_000 });
  await expect(
    host
      .getByRole("article", { name: "Message from Maya" })
      .filter({ hasText: "@Trailie simulate provider failure" }),
  ).toBeVisible();
  await expect(host.getByRole("button", { name: "Retry Trailie" })).toHaveCount(
    0,
  );

  await host
    .getByLabel("Message your crew")
    .fill("@Trailie simulate persistent provider failure");
  await host.getByLabel("Message your crew").press("Enter");
  await expect(
    host.getByText("Trailie could not answer right now. Try again."),
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    host.getByRole("article", { name: "Message from Trailie" }),
  ).toHaveCount(4);
  await expect(host.getByRole("button", { name: "Retry Trailie" })).toHaveCount(
    0,
  );
  await member.getByLabel("Message your crew").fill("Human chat still works");
  await member.getByLabel("Message your crew").press("Enter");
  await expect(
    host.getByText("Human chat still works", { exact: true }),
  ).toBeVisible();

  await member.setViewportSize({ width: 390, height: 844 });
  expect(
    await member.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await member.getByRole("button", { name: "Switch to dark theme" }).click();
  await expect(member.locator("html")).toHaveAttribute("data-theme", "dark");
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
  expect(browserOpenAIRequests).toEqual([]);
  expect([...hostProblems, ...memberProblems]).toEqual([]);

  await Promise.all([
    hostContext.close(),
    memberContext.close(),
    outsiderContext.close(),
  ]);
});
