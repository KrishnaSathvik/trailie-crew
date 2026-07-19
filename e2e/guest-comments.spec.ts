import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
} from "@playwright/test";

const hosted = process.env.HOSTED_ACCEPTANCE === "1";
const hostedBaseUrl = process.env.HOSTED_BASE_URL;
const bypassSecret = process.env.VERCEL_AUTOMATION_BYPASS_SECRET;

if (hosted && (!hostedBaseUrl || !bypassSecret))
  throw new Error("guest_hosted_acceptance_environment_incomplete");

function appUrl(path: string) {
  return hosted ? new URL(path, hostedBaseUrl).toString() : path;
}

async function scopedContext(
  browser: Browser,
  options: BrowserContextOptions = {},
): Promise<BrowserContext> {
  const context = await browser.newContext(options);
  if (hosted) {
    const response = await context.request.get(hostedBaseUrl!, {
      headers: {
        "x-vercel-protection-bypass": bypassSecret!,
        "x-vercel-set-bypass-cookie": "true",
      },
    });
    expect(response.status()).toBe(200);
  }
  return context;
}

async function send(page: Page, text: string) {
  await page.getByLabel("Message your crew").fill(text);
  await page.getByLabel("Message your crew").press("Enter");
  await expect(
    page.getByLabel("Trip conversation").getByText(text, { exact: true }),
  ).toBeVisible({ timeout: 15_000 });
}

async function openPlan(page: Page) {
  await page.getByRole("button", { name: "Plan" }).first().click();
}

async function createVersionOne(browser: Browser) {
  const hostContext = await scopedContext(browser, {
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const memberContext = await scopedContext(browser);
  const host = await hostContext.newPage();
  const member = await memberContext.newPage();

  await host.goto(appUrl("/trips/create"));
  await host.getByLabel("Trip name").fill("Versioned guest comments");
  await host.getByLabel("Your display name").fill("Maya");
  await host.getByRole("button", { name: "Create Trip" }).click();
  await expect(host).toHaveURL(/\/trips\/[0-9a-f-]{36}$/);
  const roomUrl = host.url();
  const inviteUrl = await host
    .getByLabel("One-time invitation URL")
    .inputValue();

  await member.goto(appUrl(inviteUrl));
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
  ).toBeVisible({ timeout: 30_000 });
  await openPlan(member);
  await expect(
    member.getByRole("heading", { name: "Before I build the trip" }),
  ).toBeVisible({ timeout: 20_000 });
  await host.getByRole("button", { name: "Approve summary" }).click();
  await member.getByRole("button", { name: "Approve summary" }).click();
  await member.getByRole("button", { name: "Generate Itinerary" }).click();
  await expect(host.getByText("Published itinerary · Version 1")).toBeVisible({
    timeout: 90_000,
  });

  return { hostContext, memberContext, host, member, roomUrl };
}

async function createGuestLink(
  host: Page,
  permission: "guest_viewer" | "guest_commenter",
) {
  await host.getByRole("button", { name: "Invite guest" }).click();
  await host.getByLabel("Guest permission").selectOption(permission);
  await host.getByRole("button", { name: "Create guest link" }).click();
  const link = await host
    .getByLabel("New guest link · shown once")
    .inputValue();
  expect(link).toMatch(/^\/guest\/[A-Za-z0-9_-]{43}$/);
  return link;
}

test("Viewer and Commenter stay pinned to one safe plan version and revoke immediately", async ({
  browser,
}) => {
  test.setTimeout(hosted ? 12 * 60_000 : 180_000);
  const { hostContext, memberContext, host, member, roomUrl } =
    await createVersionOne(browser);
  const viewerContext = await scopedContext(browser);
  const commenterContext = await scopedContext(browser);
  const viewer = await viewerContext.newPage();
  const commenter = await commenterContext.newPage();

  try {
    const viewerLink = await createGuestLink(host, "guest_viewer");
    await viewer.goto(appUrl(viewerLink));
    await expect(
      viewer.getByRole("heading", { name: "Join as a guest viewer" }),
    ).toBeVisible();
    await viewer.getByLabel("Guest display name").fill("Riley");
    await viewer.getByRole("button", { name: "Open Version 1" }).click();
    await expect(viewer).toHaveURL(/\/guest\/plan$/);
    await expect(viewer.getByLabel("Guest permission")).toContainText(
      "Viewer · read only",
    );
    await expect(viewer.getByLabel("Pinned Version 1")).toBeVisible();
    await expect(
      viewer.getByRole("button", { name: "Add comment" }),
    ).toHaveCount(0);
    expect(await viewer.evaluate(() => document.cookie)).not.toContain(
      "trailie_guest_session",
    );

    const commenterLink = await createGuestLink(host, "guest_commenter");
    const commenterPrefix = commenterLink.split("/").at(-1)!.slice(0, 8);
    await commenter.goto(appUrl(commenterLink));
    await expect(
      commenter.getByRole("heading", { name: "Join as a guest commenter" }),
    ).toBeVisible();
    await commenter.getByLabel("Guest display name").fill("Jordan");
    await commenter.getByRole("button", { name: "Open Version 1" }).click();
    await expect(commenter.getByLabel("Guest permission")).toContainText(
      "Commenter · comments enabled",
    );

    const guestItem = commenter
      .getByRole("heading", { name: "Glacier Point sunset" })
      .locator("..");
    const guestThread = guestItem.getByLabel(
      "Comments on Glacier Point sunset",
    );
    await guestThread
      .getByLabel("Comment on Glacier Point sunset")
      .fill("Could we meet 30 minutes earlier?");
    await guestThread.getByRole("button", { name: "Add comment" }).click();
    await expect(
      guestThread.getByText("Could we meet 30 minutes earlier?"),
    ).toBeVisible();
    await guestThread.getByRole("button", { name: "Edit" }).click();
    await guestThread
      .getByLabel("Edit comment")
      .fill("Please meet 20 minutes earlier.");
    await guestThread.getByRole("button", { name: "Save comment" }).click();
    await expect(
      guestThread.getByText("Please meet 20 minutes earlier."),
    ).toBeVisible();

    await host.getByRole("tab", { name: "Day-by-day" }).click();
    const hostItem = host
      .getByRole("heading", { name: "Glacier Point sunset" })
      .locator("..");
    const hostThread = hostItem.getByLabel("Comments on Glacier Point sunset");
    await expect(
      hostThread.getByText("Please meet 20 minutes earlier."),
    ).toBeVisible({ timeout: 15_000 });
    await hostThread.getByRole("button", { name: "Resolve" }).click();
    await expect(
      hostThread.getByText("Resolved comment by Jordan"),
    ).toBeVisible();

    await hostItem.getByRole("button", { name: "Change this" }).click();
    await host
      .getByLabel("Request details")
      .fill("Move Glacier Point sunset later without changing another day");
    await host.getByRole("button", { name: "Submit change request" }).click();
    await expect(
      host.getByRole("heading", { name: "Move an itinerary item later" }),
    ).toBeVisible({ timeout: 30_000 });
    await host.getByRole("button", { name: "Approve analysis" }).click();
    await expect(
      member.getByRole("heading", { name: "Move an itinerary item later" }),
    ).toBeVisible({ timeout: 20_000 });
    await member.getByRole("button", { name: "Approve analysis" }).click();
    await expect(
      host.getByRole("heading", { name: "Ready to publish Version 2" }),
    ).toBeVisible({ timeout: 90_000 });
    await host.getByRole("button", { name: "Confirm Version 2" }).click();
    await expect(
      member.getByRole("heading", { name: "Ready to publish Version 2" }),
    ).toBeVisible({ timeout: 20_000 });
    await member.getByRole("button", { name: "Confirm Version 2" }).click();
    await expect(host.getByText("Published itinerary · Version 2")).toBeVisible(
      { timeout: 30_000 },
    );

    await commenter.reload();
    await expect(commenter.getByLabel("Pinned Version 1")).toBeVisible();
    await expect(
      commenter.getByText("Resolved comment by Jordan"),
    ).toBeVisible();
    await expect(commenter.getByLabel("Pinned Version 2")).toHaveCount(0);
    await expect(
      commenter.getByText(/latitude|longitude|exact address/i),
    ).toHaveCount(0);
    await expect(
      commenter.getByText(/crew chat|participants|approval|revision/i),
    ).toHaveCount(0);

    await commenter.goto(roomUrl);
    await expect(
      commenter.getByRole("heading", { name: "Trip unavailable" }),
    ).toBeVisible();
    await commenter.goto(appUrl("/guest/plan"));

    await host.getByRole("button", { name: "Version history" }).click();
    await host.getByRole("button", { name: "View version" }).last().click();
    const commenterInvite = host
      .getByRole("listitem")
      .filter({ hasText: `Commenter · ${commenterPrefix}…` });
    await commenterInvite
      .getByRole("button", { name: "Revoke guest link" })
      .click();
    await expect(host.getByRole("status")).toContainText(
      "Guest access is now off",
    );
    await commenter.reload();
    await expect(
      commenter.getByRole("heading", { name: "Guest access unavailable" }),
    ).toBeVisible();
  } finally {
    await Promise.all([
      viewerContext.close(),
      commenterContext.close(),
      memberContext.close(),
      hostContext.close(),
    ]);
  }
});
