import { createClient } from "@supabase/supabase-js";
import { expect, test, type Browser } from "@playwright/test";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false } },
);

async function createCrew(browser: Browser, name: string) {
  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  await host.goto("/trips/create");
  await expect(
    host.getByRole("status").filter({ hasText: "Anti-bot check completed" }),
  ).toBeVisible();
  await host.getByLabel("Trip name").fill(name);
  await host.getByLabel("Your display name").fill("Maya");
  await host.getByRole("button", { name: "Create Trip" }).click();
  await expect(host).toHaveURL(/\/trips\/[0-9a-f-]{36}$/);
  const roomUrl = host.url();
  const roomId = new URL(roomUrl).pathname.split("/").at(-1)!;
  const invite = await host.getByLabel("One-time invitation URL").inputValue();
  const memberContext = await browser.newContext();
  const member = await memberContext.newPage();
  await member.goto(invite);
  await expect(
    member.getByRole("status").filter({ hasText: "Anti-bot check completed" }),
  ).toBeVisible();
  await member.getByLabel("Your display name").fill("Leo");
  await member.getByRole("button", { name: "Join Trip" }).click();
  await expect(member).toHaveURL(roomUrl);
  await host.reload();
  return { hostContext, host, memberContext, member, roomUrl, roomId };
}

test("member is denied and host can explicitly delete a disposable room", async ({
  browser,
}) => {
  const crew = await createCrew(browser, "Disposable lifecycle E2E");
  await crew.member.getByRole("button", { name: "Settings" }).first().click();
  await expect(crew.member.getByText(/Only the current host/)).toBeVisible();
  await expect(
    crew.member.getByRole("button", { name: "Delete trip permanently" }),
  ).toHaveCount(0);

  await crew.host.getByRole("button", { name: "Settings" }).first().click();
  await crew.host.getByLabel("Trip name").fill("Disposable lifecycle E2E");
  await crew.host
    .getByRole("button", { name: "Delete trip permanently" })
    .click();
  await expect(crew.host).toHaveURL("/");
  await crew.member.reload();
  await expect(
    crew.member.getByRole("heading", { name: "Trip unavailable" }),
  ).toBeVisible();
  await Promise.all([crew.hostContext.close(), crew.memberContext.close()]);
});

test("sole host account deletion is blocked, then host transfer permits deletion", async ({
  browser,
}) => {
  const crew = await createCrew(browser, "Disposable transfer E2E");
  const personalExport = await crew.host.request.get("/api/account/export");
  expect(personalExport.status()).toBe(200);
  expect(personalExport.headers()["content-disposition"]).toContain(
    "trailie-personal-data-v1.json",
  );
  const exportedText = await personalExport.text();
  expect(exportedText).toContain("Maya");
  expect(exportedText).not.toContain("Leo");
  await crew.host.goto("/settings");
  await expect(crew.host.getByText("Disposable transfer E2E")).toBeVisible();
  await crew.host
    .getByLabel("Type DELETE MY ACCOUNT")
    .fill("DELETE MY ACCOUNT");
  await expect(
    crew.host.getByRole("button", { name: "Delete my account" }),
  ).toBeDisabled();

  await crew.host.goto(crew.roomUrl);
  await crew.host.getByRole("button", { name: "Settings" }).first().click();
  await crew.host.getByLabel("New host").selectOption({ label: "Leo" });
  await crew.host.getByRole("button", { name: "Transfer host role" }).click();
  await expect(crew.host.getByText(/Host role transferred/)).toBeVisible();
  await crew.host.goto("/settings");
  await crew.host
    .getByLabel("Type DELETE MY ACCOUNT")
    .fill("DELETE MY ACCOUNT");
  await expect(
    crew.host.getByRole("button", { name: "Delete my account" }),
  ).toBeEnabled();
  await crew.host.getByRole("button", { name: "Delete my account" }).click();
  await expect(crew.host).toHaveURL("/");
  await crew.host.goto(crew.roomUrl);
  await expect(
    crew.host.getByRole("heading", { name: "Trip unavailable" }),
  ).toBeVisible();
  await crew.member.reload();
  await expect(crew.member.getByText("Maya")).toHaveCount(0);
  await Promise.all([crew.hostContext.close(), crew.memberContext.close()]);
});

test("database emergency switch blocks generation while human chat remains functional", async ({
  browser,
}) => {
  const crew = await createCrew(browser, "Disposable AI switch E2E");
  const { error: disableError } = await admin.rpc("set_ai_generation_enabled", {
    enabled: false,
  });
  expect(disableError).toBeNull();
  try {
    await crew.host
      .getByLabel("Message your crew")
      .fill("Human chat still works.");
    await crew.host.getByLabel("Message your crew").press("Enter");
    await expect(
      crew.member.getByText("Human chat still works.", { exact: true }),
    ).toBeVisible();
    await crew.host
      .getByLabel("Message your crew")
      .fill("@Trailie compare two safe options");
    await crew.host.getByLabel("Message your crew").press("Enter");
    await expect(
      crew.host.getByText(/ai_disabled|temporarily paused/i),
    ).toBeVisible();
    const { count } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("room_id", crew.roomId)
      .eq("message_type", "trailie");
    expect(count).toBe(0);
  } finally {
    await admin.rpc("set_ai_generation_enabled", { enabled: true });
    await Promise.all([crew.hostContext.close(), crew.memberContext.close()]);
  }
});

test("protected recovery and cleanup dry-run expose safe counts only", async ({
  request,
}) => {
  const recoverySecret =
    process.env.RECOVERY_SECRET ??
    "local-recovery-secret-must-be-at-least-32-characters";
  const cleanupSecret =
    process.env.CLEANUP_SECRET ??
    "local-cleanup-secret-must-be-at-least-32-characters";
  const recovery = await request.post("/api/internal/recovery", {
    headers: { authorization: `Bearer ${recoverySecret}` },
  });
  expect([200, 429]).toContain(recovery.status());
  const cleanup = await request.post(
    "/api/internal/anonymous-cleanup?dryRun=true",
    { headers: { authorization: `Bearer ${cleanupSecret}` } },
  );
  expect([200, 429]).toContain(cleanup.status());
  const body = await cleanup.json();
  if (cleanup.status() === 200)
    expect(body).toMatchObject({
      status: "ok",
      dryRun: true,
      counts: { selected: expect.any(Number), deleted: 0, failed: 0 },
    });
  else
    expect(body).toMatchObject({
      status: "error",
      code: "cleanup_already_running",
    });
  expect(JSON.stringify(body)).not.toMatch(
    /userId|email|message|prompt|token/i,
  );
});
