import { expect, test, type Browser } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SECRET_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

async function createCrew(browser: Browser) {
  const hostContext = await browser.newContext({
    permissions: ["clipboard-read", "clipboard-write"],
  });
  const host = await hostContext.newPage();
  await host.goto("/trips/create");
  await host.getByLabel("Trip name").fill("Private Memory Demo");
  await host.getByLabel("Your display name").fill("Maya");
  await host.getByRole("button", { name: "Create Trip" }).click();
  await expect(host).toHaveURL(/\/trips\/[0-9a-f-]{36}$/);
  const roomUrl = host.url();
  const roomId = roomUrl.split("/").at(-1)!;
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
  return { hostContext, host, memberContext, member, roomId };
}

async function inspect(roomId: string) {
  const { data, error } = await admin.rpc("get_private_room_memory", {
    target_room_id: roomId,
  });
  expect(error).toBeNull();
  return data as {
    snapshot: {
      memory_version: number;
      participant_profiles: Record<
        string,
        {
          preferences: Array<{ value: { text: string } }>;
          constraints: unknown[];
        }
      >;
      confirmed_decisions: unknown[];
    };
    facts: Array<{
      id: string;
      fact_type: string;
      status: string;
      value: { text?: string };
      source_message_id: string;
    }>;
    extractions: Array<{
      messageId: string;
      status: string;
      errorCode: string | null;
    }>;
  };
}

async function send(page: import("@playwright/test").Page, text: string) {
  await page.getByLabel("Message your crew").fill(text);
  await page.getByLabel("Message your crew").press("Enter");
  await expect(
    page.getByLabel("Trip conversation").getByText(text, { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Sending…")).not.toBeVisible();
}

test("silent extraction builds private memory with corrections and conservative decisions", async ({
  browser,
}) => {
  const { hostContext, host, memberContext, member, roomId } =
    await createCrew(browser);
  const browserOpenAI: string[] = [];
  for (const page of [host, member])
    page.on("request", (request) => {
      if (request.url().includes("api.openai.com"))
        browserOpenAI.push(request.url());
    });

  await send(host, "lol");
  await expect
    .poll(async () => (await inspect(roomId)).extractions.at(-1)?.status)
    .toBe("skipped");
  expect((await inspect(roomId)).snapshot.memory_version).toBe(1);

  await send(host, "I prefer hiking and I cannot travel before Friday");
  await expect
    .poll(async () => (await inspect(roomId)).snapshot.memory_version)
    .toBe(2);
  let memory = await inspect(roomId);
  expect(memory.facts.filter((fact) => fact.status === "active")).toHaveLength(
    2,
  );
  await expect(
    host.getByRole("article", { name: "Message from Trailie" }),
  ).toHaveCount(0);
  await expect(
    member.getByText("I prefer hiking and I cannot travel before Friday", {
      exact: true,
    }),
  ).toBeVisible();

  await send(host, "Actually, I prefer kayaking");
  await expect
    .poll(async () => (await inspect(roomId)).snapshot.memory_version)
    .toBe(3);
  memory = await inspect(roomId);
  expect(
    memory.facts.find((fact) => fact.value.text === "hiking")?.status,
  ).toBe("superseded");
  expect(
    memory.facts.find((fact) => fact.value.text === "kayaking")?.status,
  ).toBe("active");

  await send(member, "Maybe Yosemite?");
  await expect
    .poll(async () => (await inspect(roomId)).snapshot.memory_version)
    .toBe(4);
  expect((await inspect(roomId)).snapshot.confirmed_decisions).toEqual([]);

  await send(host, "We all decided on Yosemite");
  await expect
    .poll(async () => (await inspect(roomId)).snapshot.memory_version)
    .toBe(5);
  memory = await inspect(roomId);
  expect(memory.snapshot.confirmed_decisions).toHaveLength(1);

  await send(host, "simulate extraction failure");
  await expect
    .poll(async () => (await inspect(roomId)).extractions.at(-1)?.status)
    .toBe("failed");
  memory = await inspect(roomId);
  expect(memory.snapshot.memory_version).toBe(5);

  expect(
    new Set(
      memory.facts.map((fact) => `${fact.source_message_id}:${fact.fact_type}`),
    ).size,
  ).toBe(memory.facts.length);
  expect((await inspect(roomId)).snapshot.memory_version).toBe(5);
  await host.reload();
  await expect(
    host.getByText("Actually, I prefer kayaking", { exact: true }),
  ).toBeVisible();
  await member.setViewportSize({ width: 390, height: 844 });
  expect(
    await member.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(browserOpenAI).toEqual([]);
  await Promise.all([hostContext.close(), memberContext.close()]);
});
